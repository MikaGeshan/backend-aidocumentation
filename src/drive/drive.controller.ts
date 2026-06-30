import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { GoogleDriveService } from './drive.service';
import { Type } from 'class-transformer';

@Controller('drive')
export class GoogleDriveController {
  constructor(private readonly driveService: GoogleDriveService) {}
  @Get('health')
  health() {
    return { status: 'Verifikasi Berhasil ygy' };
  }

  @Get('folders')
  async getFolders(@Query('folderId') folderId: string): Promise<any> {
    if (!folderId || folderId === 'undefined') {
      return [];
    }
    return this.driveService.folderList(folderId);
  }

  @Get('files')
  async getFiles(@Query('subFolderId') subFolderId: string): Promise<any> {
    if (!subFolderId || subFolderId === 'undefined') {
      return [];
    }
    return this.driveService.fileList(subFolderId);
  }

  @Get('all-files/:folderId')
  async getAllFiles(@Param('folderId') folderId: string): Promise<any> {
    if (!folderId || folderId === 'undefined') {
      return [];
    }
    return await this.driveService.getAllFilesRecursively(folderId);
  }

  @Get('download/:fileId')
  async download(@Param('fileId') fileId: string, @Res() res: Response) {
    const { buffer, name, mimeType } =
      await this.driveService.downloadFile(fileId);

    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Type', mimeType);

    return res.send(buffer);
  }

  @Post('create-folder')
  async createFolder(
    @Body('name') name: string,
    @Body('parentFolderId') parentFolderId: string,
  ): Promise<any> {
    return this.driveService.createFolder(name, parentFolderId);
  }

  @Post('file')
  async uploadFile(
    @Body('name') name: string,
    @Body('parentFolderId') parentFolderId: string,
    @Body('filePath') filePath: string,
  ): Promise<any> {
    return this.driveService.uploadFile(name, parentFolderId, filePath);
  }

  @Post('sync-codebase')
  async syncCodebase(
    @Body('repoUrl') repoUrl: string,
    @Body('branch') branch: string,
    @Body('token') token: string,
    @Body('folderId') folderId: string,
  ): Promise<any> {
    if (!repoUrl) throw new BadRequestException('Missing repoUrl');
    const actualToken = token || process.env.CODEBASE_ACCESS_TOKEN;
    if (!actualToken) throw new BadRequestException('Missing access token');
    const rootFolderId = folderId || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '1bkp3mxSo_3BHMkY91Nqi0ZfSw8XqMhp_';
    return this.driveService.syncCodebase(repoUrl, branch || 'main', actualToken, rootFolderId);
  }

  @Delete()
  async delete(@Query('fileId') fileId: string): Promise<any> {
    return this.driveService.deleteFileOrFolder(fileId);
  }
}
