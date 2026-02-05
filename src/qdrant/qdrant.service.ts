import { Injectable } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

interface SearchResult {
  payload: {
    text: string;
    fileName: string;
    chunkIndex: number;
    fileId: string;
  };
  score: number;
}

@Injectable()
export class QdrantService {
  private readonly client: QdrantClient;
  private readonly COLLECTION = 'DOCUMENTS';

  constructor() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
    });
  }

  async upsertChunks(
    points: {
      id: string;
      vector: number[];
      payload: Record<string, unknown>;
    }[],
  ): Promise<void> {
    await this.client.upsert(this.COLLECTION, {
      wait: true,
      points,
    });
  }

  async search(
    vector: number[],
    options?: { limit?: number },
  ): Promise<SearchResult[]> {
    const res = await this.client.search(this.COLLECTION, {
      vector,
      limit: options?.limit ?? 5,
    });

    return res as SearchResult[];
  }
}
