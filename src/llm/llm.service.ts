import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class LlmService {
  private readonly apiKey = process.env.DEEPSEEK_API_KEY;
  private readonly baseUrl = process.env.DEEPSEEK_EMBEDDING_URL;
  private readonly model = process.env.DEEPSEEK_EMBEDDING_MODEL;

  async embedTexts(texts: string[]): Promise<number[][]> {
    const res = await axios.post(
      `${this.baseUrl}`,
      {
        model: this.model,
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
    const res = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
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
