import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { GoogleDriveService } from './drive.service';

@Controller('drive')
export class GoogleDriveController {
  constructor(private readonly driveService: GoogleDriveService) {}
  @Get('health')
  health() {
    return { status: 'Verifikasi Berhasil ygy' };
  }

  @Get('folders')
  async getFolders(@Query('folderId') folderId: string): Promise<any> {
    return this.driveService.folderList(folderId);
  }

  @Get('files')
  async getFiles(@Query('subFolderId') subFolderId: string): Promise<any> {
    return this.driveService.fileList(subFolderId);
  }

  @Get('all-files/:folderId')
  async getAllFiles(@Param('folderId') folderId: string): Promise<any> {
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

  @Delete()
  async delete(@Query('fileId') fileId: string): Promise<any> {
    return this.driveService.deleteFileOrFolder(fileId);
  }
}
