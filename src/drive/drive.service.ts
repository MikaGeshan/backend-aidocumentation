import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import type { drive_v3 } from 'googleapis';
import type { Response } from 'express';

@Injectable()
export class GoogleDriveService {
  private drive: drive_v3.Drive;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
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
  async downloadFile(fileId: string, res: Response) {
    const meta = await this.drive.files.get({
      fileId,
      fields: 'name, mimeType',
    });

    const { name, mimeType } = meta.data;

    if (mimeType === 'application/vnd.google-apps.document') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${name}.docx"`,
      );

      const stream = await this.drive.files.export(
        {
          fileId,
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        { responseType: 'stream' },
      );

      return stream.data.pipe(res);
    }

    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);

    const stream = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' },
    );

    return stream.data.pipe(res);
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
}
