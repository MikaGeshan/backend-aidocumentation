import { Injectable } from '@nestjs/common';
import { LlmService } from 'src/llm/llm.service';
import { QdrantService } from 'src/qdrant/qdrant.service';

@Injectable()
export class AiService {
  constructor(
    private readonly qdrantService: QdrantService,
    private readonly llmService: LlmService,
  ) {}

  async chat(question: string) {
    const [queryEmbedding] = await this.llmService.embedTexts([question]);

    const results = await this.qdrantService.search(queryEmbedding, {
      limit: 5,
    });

    if (!results.length) {
      return {
        answer: 'I could not find relevant information',
        sources: [],
      };
    }

    const context = results.map((r) => r.payload.text).join('\n\n');

    const answer = await this.llmService.chat({
      system: 'You are a helpful assistant. Answer using the context.',
      user: `
      Context:
      ${context}
      Question:
      ${question}
      `,
    });

    return {
      answer,
      sources: results.map,((r)=>({
        fileName: r.payload.fileName,
        chunkIndex: r.payload.chunkIndex,
      }))
    };
  }
}
