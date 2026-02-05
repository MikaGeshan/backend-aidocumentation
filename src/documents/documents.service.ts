import { Injectable, Logger } from '@nestjs/common';
import { GoogleDriveService } from '../drive/drive.service';
import { LlmService } from '../llm/llm.service';
import { QdrantService } from '../qdrant/qdrant.service';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { v4 as uuid } from 'uuid';

interface GoogleDriveFile {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly CHUNK_SIZE = 1000;

  constructor(
    private readonly googleDriveService: GoogleDriveService,
    private readonly qdrantService: QdrantService,
    private readonly llmService: LlmService,
  ) {}

  /**
   * Index all files in a Google Drive folder
   */
  async indexFolder(folderId: string): Promise<void> {
    this.logger.log(`Indexing folder: ${folderId}`);

    await this.qdrantService.ensureCollection();

    const files = await this.googleDriveService.fileList(folderId);

    for (const file of files) {
      await this.indexSingleFile(file, folderId);
    }

    this.logger.log(`Indexing completed for folder: ${folderId}`);
  }

  /**
   * Index a single file
   */
  private async indexSingleFile(
    file: GoogleDriveFile,
    subfolderId: string,
  ): Promise<void> {
    if (!file.id || !file.name || !file.mimeType) return;

    this.logger.log(`Indexing file: ${file.name}`);

    const buffer = await this.googleDriveService.downloadFile(
      file.id,
      file.name,
    );

    const text = await this.parseFile(buffer, file.mimeType);
    if (!text.trim()) return;

    const chunks = this.chunkText(text);
    if (!chunks.length) return;

    const embeddings = await this.llmService.embedTexts(chunks);

    await this.qdrantService.upsertChunks(
      chunks.map((chunk, i) => ({
        id: uuid(),
        vector: embeddings[i],
        payload: {
          subfolderId,
          fileId: file.id,
          fileName: file.name,
          chunkIndex: i,
          text: chunk,
        },
      })),
    );
  }

  /**
   * Parse PDF / DOCX
   */
  private async parseFile(buffer: Buffer, mimeType: string): Promise<string> {
    switch (mimeType) {
      case 'application/pdf': {
        const data = await pdfParse(buffer);
        return data.text;
      }

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      }

      default:
        throw new Error(`Unsupported file type: ${mimeType}`);
    }
  }

  /**
   * Split text into chunks
   */
  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      chunks.push(text.slice(start, start + this.CHUNK_SIZE));
      start += this.CHUNK_SIZE;
    }

    return chunks;
  }
}
