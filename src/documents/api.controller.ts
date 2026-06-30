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
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
