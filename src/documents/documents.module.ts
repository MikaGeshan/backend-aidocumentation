import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { GoogleDriveService } from '../drive/drive.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { LlmService } from '../llm/llm.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, GoogleDriveService, QdrantService, LlmService],
})
export class DocumentsModule {}
