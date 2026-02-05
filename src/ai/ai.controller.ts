import { AiService } from './ai.service';
import { Body, Controller, Post } from '@nestjs/common';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(
    @Body('question') question: string,
  ): Promise<{ answer: string; sources: unkown[] }> {
    return this.aiService.chat(question);
  }
}
