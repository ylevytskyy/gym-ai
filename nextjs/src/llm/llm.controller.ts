import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatRequestDto } from './dto/chat-request.dto';
import { LlmService } from './llm.service';
import { LlmChatResponse } from './llm.types';

@Controller('llm')
@UseGuards(JwtAuthGuard)
export class LlmController {
  constructor(private readonly llm: LlmService) {}

  @Post('chat')
  chat(@Body() body: ChatRequestDto): Promise<LlmChatResponse> {
    return this.llm.chat(body);
  }
}
