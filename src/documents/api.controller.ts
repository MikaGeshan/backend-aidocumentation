import {
  Controller,
  Post,
  Delete,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GoogleDriveService } from '../drive/drive.service';
import { DocumentsService } from './documents.service';
import { LlmService } from '../llm/llm.service';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Data Transfer Objects (DTOs) for ValidationPipe compatibility
export class ListReposDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsOptional()
  host?: string;
}

export class AutoSyncDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  projectContext: string;

  @IsString()
  @IsOptional()
  host?: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsString()
  @IsOptional()
  folderId?: string;
}

export class GitTreeDto {
  @IsString()
  @IsOptional()
  repoUrl?: string;

  @IsString()
  @IsOptional()
  token?: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsString()
  @IsOptional()
  host?: string;
}

export class GitFileContentDto {
  @IsString()
  @IsOptional()
  repoUrl?: string;

  @IsString()
  @IsNotEmpty()
  filePath: string;

  @IsString()
  @IsOptional()
  token?: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsString()
  @IsOptional()
  host?: string;
}

// Data Transfer Objects (DTOs) for ValidationPipe compatibility
export class ConvertDocsDto {
  @IsString()
  @IsNotEmpty()
  file_id: string;

  @IsString()
  @IsOptional()
  email?: string;
}

export class CreateFolderDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  email?: string;
}

export class UploadDocsDto {
  @IsString()
  @IsOptional()
  folder_id?: string;

  @IsString()
  @IsOptional()
  email?: string;
}

export class DeleteDocsDto {
  @IsString()
  @IsNotEmpty()
  file_id: string;

  @IsString()
  @IsOptional()
  email?: string;
}

@Controller('api')
export class ApiController {
  constructor(
    private readonly driveService: GoogleDriveService,
    private readonly documentsService: DocumentsService,
    private readonly llmService: LlmService,
  ) {}

  @Post('convert-docs')
  async convertDocs(@Body() dto: ConvertDocsDto) {
    try {
      const { buffer, name, mimeType } = await this.driveService.downloadFile(dto.file_id);
      const text = await this.documentsService.parseFile(buffer, mimeType);
      return {
        fileId: dto.file_id,
        name,
        text,
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  @Post('create-folder')
  async createFolder(@Body() dto: CreateFolderDto) {
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '1bkp3mxSo_3BHMkY91Nqi0ZfSw8XqMhp_';
    const folder = await this.driveService.createFolder(dto.name, rootFolderId);
    return {
      message: 'Folder Created.',
      folder,
    };
  }

  @Post('upload-docs')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocs(
    @UploadedFile() file: any,
    @Body() dto: UploadDocsDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const rootFolderId = dto.folder_id || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '1bkp3mxSo_3BHMkY91Nqi0ZfSw8XqMhp_';
    
    // Write temporary file
    const tempFileName = `temp-${randomUUID()}-${file.originalname}`;
    const tempFilePath = join(__dirname, tempFileName);
    writeFileSync(tempFilePath, file.buffer);

    try {
      const result = await this.driveService.uploadFile(
        file.originalname,
        rootFolderId,
        tempFilePath,
      );
      return {
        message: 'Document Uploaded.',
        result,
      };
    } finally {
      try {
        unlinkSync(tempFilePath);
      } catch (err) {
        // ignore error during cleanup
      }
    }
  }

  @Delete('delete-docs')
  async deleteDocs(@Body() dto: DeleteDocsDto) {
    await this.driveService.deleteFileOrFolder(dto.file_id);
    return {
      message: 'Document Deleted.',
    };
  }

  @Post('list-repos')
  async listRepos(@Body() dto: ListReposDto) {
    const repos = await this.driveService.listRepos(dto.token, dto.host);
    return repos;
  }

  @Post('auto-sync')
  async autoSync(@Body() dto: AutoSyncDto) {
    const repos = await this.driveService.listRepos(dto.token, dto.host);
    if (!repos.length) {
      return { success: false, message: 'No repositories found for this token.' };
    }

    const system = `You are a Repository Selector assistant.
Analyze the user's request and the list of available repositories.
Select the single repository URL that best matches the user's intent.
If no repository matches, output "NONE".
Output ONLY the matched repository URL, or "NONE" if there is no match. Do not write any other explanation or text.`;

    const userPrompt = `User request: "${dto.projectContext}"

Available Repositories:
${repos.map((r, i) => `${i + 1}. Name: ${r.name}, URL: ${r.url}, Description: ${r.description}`).join('\n')}`;

    const llmResponse = await this.llmService.chat({
      system,
      user: userPrompt,
    });

    const matchedUrl = llmResponse.trim();
    if (!matchedUrl || matchedUrl === 'NONE' || !matchedUrl.startsWith('http')) {
      return {
        success: false,
        message: `Could not match a repository automatically. (LLM returned: ${matchedUrl})`,
        availableRepos: repos.map(r => r.name),
      };
    }

    // Find the repo details to get the name
    const chosenRepo = repos.find(r => r.url === matchedUrl);
    const chosenName = chosenRepo ? chosenRepo.name : 'Matched Repository';

    const rootFolderId = dto.folderId || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '1bkp3mxSo_3BHMkY91Nqi0ZfSw8XqMhp_';
    
    // Trigger sync
    const syncResult = await this.driveService.syncCodebase(
      matchedUrl,
      dto.branch || 'main',
      dto.token,
      rootFolderId,
    );

    return {
      success: true,
      chosenRepo: chosenName,
      chosenUrl: matchedUrl,
      syncResult,
    };
  }

  @Post('git-tree')
  async getGitTree(@Body() dto: GitTreeDto) {
    const repoUrl = dto.repoUrl || process.env.GITLAB_REPO;
    const token = dto.token || process.env.GITLAB_TOKEN;
    const branch = dto.branch || process.env.GITLAB_BRANCH || 'main';
    const host = dto.host || (dto.repoUrl ? dto.host : process.env.GITLAB_HOST);

    if (!repoUrl || !token) {
      return { success: false, message: 'Git repository is not configured.' };
    }

    const files = await this.driveService.getGitTree(repoUrl, branch, token, host);
    return { success: true, files, repoUrl };
  }

  @Post('git-file')
  async getGitFileContent(@Body() dto: GitFileContentDto) {
    const repoUrl = dto.repoUrl || process.env.GITLAB_REPO;
    const token = dto.token || process.env.GITLAB_TOKEN;
    const branch = dto.branch || process.env.GITLAB_BRANCH || 'main';
    const host = dto.host || (dto.repoUrl ? dto.host : process.env.GITLAB_HOST);

    if (!repoUrl || !token) {
      throw new BadRequestException('Git repository is not configured.');
    }

    const content = await this.driveService.getGitFileContent(
      repoUrl,
      dto.filePath,
      branch,
      token,
      host,
    );
    return { success: true, content };
  }
}
