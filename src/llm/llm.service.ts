import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class LlmService {
  private readonly apiKey = process.env.GEMINI_API_KEY;
  private readonly chatModel = process.env.GEMINI_CHAT_MODEL || 'gemini-1.5-flash';
  private readonly embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const res = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/openai/embeddings',
      {
        model: this.embeddingModel,
        input: texts,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );

    return res.data.data.map((item: { embedding: number[] }) => item.embedding);
  }

  async chat(input: { system: string; user: string }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const res = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        model: this.chatModel,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );

    return res.data.choices[0].message.content;
  }
}

