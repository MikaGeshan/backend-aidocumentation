import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { GoogleDriveService } from 'src/drive/drive.service';
import { QdrantService } from 'src/qdrant/qdrant.service';
import { LlmService } from 'src/llm/llm.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, GoogleDriveService, QdrantService, LlmService],
})
export class DocumentsModule {}
