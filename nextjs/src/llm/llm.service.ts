import { Inject, Injectable } from '@nestjs/common';

import { LLM_CLIENT } from './llm.constants';
import { LlmChatRequest, LlmChatResponse, LlmClient } from './llm.types';

@Injectable()
export class LlmService {
  constructor(@Inject(LLM_CLIENT) private readonly client: LlmClient) {}

  chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    return this.client.chat(request);
  }
}
