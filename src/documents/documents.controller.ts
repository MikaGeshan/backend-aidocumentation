import { Body, Controller, Post } from '@nestjs/common';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}
  @Post('index')
  async index(@Body() body: { folderId: string }) {
    await this.documentsService.indexFolder(body.folderId);
    return { status: 'indexed' };
  }
}
