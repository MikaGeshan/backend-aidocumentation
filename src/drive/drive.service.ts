import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join, extname } from 'path';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import axios from 'axios';
import * as https from 'https';
import type { drive_v3 } from 'googleapis';
import type { Response } from 'express';

const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
});

@Injectable()
export class GoogleDriveService {
  private drive: drive_v3.Drive;

  constructor() {
    let credentials: any;
    const filePath = join(process.cwd(), 'GOOGLE_SERVICE_ACCOUNT.json');

    if (existsSync(filePath)) {
      try {
        const fileContent = readFileSync(filePath, 'utf8');
        credentials = JSON.parse(fileContent);
      } catch (err) {
        console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT.json file:', err.message);
      }
    }

    if (!credentials) {
      const envCreds = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      if (!envCreds) {
        throw new Error(
          'Neither GOOGLE_SERVICE_ACCOUNT.json file nor GOOGLE_SERVICE_ACCOUNT_JSON env variable is configured',
        );
      }
      try {
        credentials = JSON.parse(envCreds);
      } catch (err) {
        throw new Error(
          `Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON environment variable: ${err.message}`,
        );
      }
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    this.drive = google.drive({ version: 'v3', auth });
  }

  // List Folders
  async folderList(folderId: string) {
    const res = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, modifiedTime)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return res.data.files ?? [];
  }

  // List all files
  async getAllFilesRecursively(folderId: string): Promise<any[]> {
    const isRoot = folderId === 'root';

    const res = await this.drive.files.list({
      q: isRoot
        ? 'trashed = false'
        : `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const items = res.data.files ?? [];
    const allFiles: any[] = [];

    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder' && item.id) {
        const files = await this.getAllFilesRecursively(item.id);
        allFiles.push(...files);
      } else {
        allFiles.push(item);
      }
    }

    return allFiles;
  }

  // List files in a folder
  async fileList(subFolderId: string) {
    const res = await this.drive.files.list({
      q: `'${subFolderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return res.data.files ?? [];
  }

  // Download file
  async downloadFile(fileId: string): Promise<{
    buffer: Buffer;
    name: string;
    mimeType: string;
  }> {
    const meta = await this.drive.files.get({
      fileId,
      fields: 'name, mimeType',
    });

    const { name, mimeType } = meta.data;

    if (mimeType === 'application/vnd.google-apps.document') {
      const response = await this.drive.files.export(
        {
          fileId,
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        { responseType: 'arraybuffer' },
      );

      return {
        buffer: Buffer.from(response.data as ArrayBuffer),
        name: `${name}.docx`,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }

    const response = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' },
    );

    return {
      buffer: Buffer.from(response.data as ArrayBuffer),
      name: name ?? 'file',
      mimeType: mimeType ?? 'application/octet-stream',
    };
  }

  // Create a folder
  async createFolder(name: string, parentFolderId: string) {
    const res = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id, name',
    });
    return res.data;
  }

  // Upload a file
  async uploadFile(name: string, parentFolderId: string, filePath: string) {
    const res = await this.drive.files.create({
      requestBody: {
        name,
        parents: [parentFolderId],
      },
      media: {
        body: readFileSync(filePath),
      },
      fields: 'id, name',
    });
    return res.data;
  }

  // Delete a file or folder
  async deleteFileOrFolder(fileId: string) {
    await this.drive.files.delete({ fileId });
    return { success: true };
  }

  // Sync GitLab/GitHub codebase to Google Drive
  async syncCodebase(
    repoUrl: string,
    branch: string = 'main',
    token: string,
    parentFolderId: string,
  ): Promise<any> {
    const isGitLab = token.startsWith('glpat-') || repoUrl.includes('gitlab');
    
    // Parse URL to get host and project path
    const parsedUrl = new URL(repoUrl);
    const host = parsedUrl.host;
    const pathClean = parsedUrl.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/, '');
    
    let downloadUrl = '';
    const headers: Record<string, string> = {
      'User-Agent': 'NestJS-Backend',
    };

    if (isGitLab) {
      const projectEncoded = encodeURIComponent(pathClean);
      downloadUrl = `https://${host}/api/v4/projects/${projectEncoded}/repository/archive.zip?sha=${branch}`;
      headers['PRIVATE-TOKEN'] = token;
    } else {
      downloadUrl = `https://api.github.com/repos/${pathClean}/zipball/${branch}`;
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Create temp files/folders
    const tempDir = join(process.cwd(), `temp-sync-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
    const zipPath = join(tempDir, 'archive.zip');
    const extractDir = join(tempDir, 'extracted');
    mkdirSync(extractDir, { recursive: true });

    try {
      // 1. Download zipball
      const response = await axios.get(downloadUrl, {
        headers,
        responseType: 'arraybuffer',
        httpsAgent: downloadUrl.includes('oktapod.quadrant-si.id') ? insecureAgent : undefined,
      });
      writeFileSync(zipPath, response.data);

      // 2. Extract using system unzip command
      execSync(`unzip -q "${zipPath}" -d "${extractDir}"`);

      // 3. Find codebase folder name
      const repoName = pathClean.split('/').pop() || 'codebase';
      const driveFolder = await this.createFolder(`Codebase - ${repoName}`, parentFolderId);
      if (!driveFolder.id) throw new Error('Failed to create folder in Google Drive');

      // 4. Recursively scan and upload files
      let filesCount = 0;
      const allowedExtensions = new Set([
        '.md', '.txt', '.json', '.ts', '.tsx', '.js', '.jsx', '.html', '.css',
        '.py', '.go', '.java', '.cs', '.cpp', '.h', '.rb', '.php', '.rs', '.swift',
        '.yml', '.yaml', '.xml'
      ]);

      const scanAndUpload = async (dir: string, parentDriveId: string) => {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          
          // Ignore heavy or build/git folders
          if (
            entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === 'coverage'
          ) {
            continue;
          }

          if (entry.isDirectory()) {
            const newDriveFolder = await this.createFolder(entry.name, parentDriveId);
            if (newDriveFolder.id) {
              await scanAndUpload(fullPath, newDriveFolder.id);
            }
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (allowedExtensions.has(ext)) {
              await this.uploadFile(entry.name, parentDriveId, fullPath);
              filesCount++;
            }
          }
        }
      };

      await scanAndUpload(extractDir, driveFolder.id);

      return {
        success: true,
        message: `Synced ${filesCount} codebase files successfully.`,
        folderId: driveFolder.id,
      };
    } finally {
      // Clean up temp directory recursively
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        // ignore error
      }
    }
  }

  // List repositories for GitHub/GitLab
  async listRepos(token: string, host?: string): Promise<any[]> {
    const isGitLab = token.startsWith('glpat-');
    
    const headers: Record<string, string> = {
      'User-Agent': 'NestJS-Backend',
    };

    let url = '';
    if (isGitLab) {
      const actualHost = host || 'gitlab.com';
      url = `https://${actualHost}/api/v4/projects?membership=true&simple=true&per_page=100&order_by=last_activity_at`;
      headers['PRIVATE-TOKEN'] = token;
    } else {
      const actualHost = host || 'api.github.com';
      url = actualHost.includes('github.com')
        ? 'https://api.github.com/user/repos?per_page=100&sort=updated'
        : `https://${actualHost}/api/v3/user/repos?per_page=100&sort=updated`;
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await axios.get(url, {
        headers,
        httpsAgent: url.includes('oktapod.quadrant-si.id') ? insecureAgent : undefined,
      });
      const items = response.data ?? [];
      
      return items.map((item: any) => {
        if (isGitLab) {
          return {
            name: item.name_with_namespace || item.name,
            description: item.description || '',
            url: item.web_url || item.http_url_to_repo,
            isPrivate: item.visibility === 'private',
            provider: 'gitlab',
          };
        } else {
          return {
            name: item.full_name || item.name,
            description: item.description || '',
            url: item.html_url,
            isPrivate: item.private,
            provider: 'github',
          };
        }
      });
    } catch (err) {
      throw new Error(`Failed to list repositories: ${err.response?.data?.message || err.message}`);
    }
  }

  // Get repository file tree on-the-fly
  async getGitTree(repoUrl: string, branch: string = 'main', token: string, host?: string): Promise<any[]> {
    const isGitLab = token.startsWith('glpat-') || repoUrl.includes('gitlab');
    const parsedUrl = new URL(repoUrl);
    const actualHost = host || parsedUrl.host;
    const pathClean = parsedUrl.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/, '');

    const headers: Record<string, string> = {
      'User-Agent': 'NestJS-Backend',
    };

    let url = '';

    if (isGitLab) {
      const projectEncoded = encodeURIComponent(pathClean);
      headers['PRIVATE-TOKEN'] = token;

      // 1. Sens codebase layout (look for "src" or "app" folder in root)
      let hasSrc = false;
      let hasApp = false;
      try {
        const rootUrl = `https://${actualHost}/api/v4/projects/${projectEncoded}/repository/tree?ref=${branch}`;
        const rootResponse = await axios.get(rootUrl, {
          headers,
          httpsAgent: actualHost.includes('oktapod.quadrant-si.id') ? insecureAgent : undefined,
        });
        const rootItems = rootResponse.data ?? [];
        hasSrc = rootItems.some((item: any) => item.name === 'src' && item.type === 'tree');
        hasApp = rootItems.some((item: any) => item.name === 'app' && item.type === 'tree');
      } catch (err) {
        // ignore and fallback to root recursive
      }

      const pathParam = hasSrc ? '&path=src' : (hasApp ? '&path=app' : '');
      url = `https://${actualHost}/api/v4/projects/${projectEncoded}/repository/tree?recursive=true&per_page=100&ref=${branch}${pathParam}`;
    } else {
      url = `https://api.github.com/repos/${pathClean}/git/trees/${branch}?recursive=1`;
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      let files: any[] = [];

      if (isGitLab) {
        // 2. Fetch pages to handle pagination
        let page = 1;
        const maxPages = 5; // Fetch up to 500 files
        while (page <= maxPages) {
          const pageUrl = `${url}&page=${page}`;
          const response = await axios.get(pageUrl, {
            headers,
            httpsAgent: url.includes('oktapod.quadrant-si.id') ? insecureAgent : undefined,
          });
          const pageFiles = response.data ?? [];
          if (pageFiles.length === 0) break;
          files = [...files, ...pageFiles];
          if (pageFiles.length < 100) break;
          page++;
        }
      } else {
        const response = await axios.get(url, { headers });
        files = response.data?.tree ?? [];
      }

      // Filter for files and allowed extensions
      const allowedExtensions = new Set([
        '.md', '.txt', '.json', '.ts', '.tsx', '.js', '.jsx', '.html', '.css',
        '.py', '.go', '.java', '.cs', '.cpp', '.h', '.rb', '.php', '.rs', '.swift',
        '.yml', '.yaml', '.xml'
      ]);

      return files
        .filter((f: any) => {
          const type = isGitLab ? f.type : f.type;
          const path = isGitLab ? f.path : f.path;
          if (isGitLab && type !== 'blob') return false;
          if (!isGitLab && type !== 'blob') return false;
          
          const name = path.split('/').pop() || '';
          // Ignore heavy, build or dot folders
          if (
            path.startsWith('.') ||
            path.includes('/.') ||
            path.includes('node_modules/') ||
            path.includes('dist/') ||
            path.includes('build/') ||
            path.includes('coverage/')
          ) {
            return false;
          }

          const ext = extname(name).toLowerCase();
          return allowedExtensions.has(ext);
        })
        .map((f: any) => ({
          path: f.path,
          name: f.path.split('/').pop() || f.path,
        }));
    } catch (err) {
      throw new Error(`Failed to fetch git tree: ${err.response?.data?.message || err.message}`);
    }
  }

  // Get raw file content from GitLab/GitHub
  async getGitFileContent(repoUrl: string, filePath: string, branch: string = 'main', token: string, host?: string): Promise<string> {
    const isGitLab = token.startsWith('glpat-') || repoUrl.includes('gitlab');
    const parsedUrl = new URL(repoUrl);
    const actualHost = host || parsedUrl.host;
    const pathClean = parsedUrl.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/, '');

    const headers: Record<string, string> = {
      'User-Agent': 'NestJS-Backend',
    };

    let url = '';
    if (isGitLab) {
      const projectEncoded = encodeURIComponent(pathClean);
      const fileEncoded = encodeURIComponent(filePath);
      url = `https://${actualHost}/api/v4/projects/${projectEncoded}/repository/files/${fileEncoded}/raw?ref=${branch}`;
      headers['PRIVATE-TOKEN'] = token;
    } else {
      url = `https://raw.githubusercontent.com/${pathClean}/${branch}/${filePath}`;
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await axios.get(url, {
        headers,
        responseType: 'text',
        httpsAgent: url.includes('oktapod.quadrant-si.id') ? insecureAgent : undefined,
      });
      return response.data;
    } catch (err) {
      throw new Error(`Failed to fetch raw git file: ${err.response?.data?.message || err.message}`);
    }
  }
}
