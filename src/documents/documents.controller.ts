import { Controller, Param, Post } from '@nestjs/common';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('index/:folderId')
  async index(@Param('folderId') folderId: string) {
    await this.documentsService.indexFolder(folderId);
    return { status: 'Indexing started' };
  }
}
