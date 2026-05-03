import { BadGatewayException } from '@nestjs/common';

import { LlmService } from './llm.service';
import { LlmChatRequest, LlmChatResponse, LlmClient } from './llm.types';

describe('LlmService', () => {
  it('generates and parses a workout plan JSON object', async () => {
    const chat: jest.MockedFunction<LlmClient['chat']> = jest
      .fn<Promise<LlmChatResponse>, [LlmChatRequest]>()
      .mockResolvedValue({
        provider: 'openrouter',
        model: 'test-model',
        content: '```json\n{"plan":{"days":[]},"version":"test"}\n```',
      });
    const client: LlmClient = { chat };
    const service = new LlmService(client);

    const result = await service.generateWorkoutPlan({ prompt: 'make a plan' });

    expect(chat).toHaveBeenCalledTimes(1);
    const callArg = chat.mock.calls[0][0];
    expect(callArg.messages).toHaveLength(2);
    expect(callArg.messages[0].role).toBe('system');
    expect(callArg.messages[0].content).toContain('JSON');
    expect(callArg.messages[1]).toEqual({
      role: 'user',
      content: 'make a plan',
    });
    expect(callArg.model).toBeUndefined();
    expect(callArg.temperature).toBe(0.2);
    expect(callArg.maxTokens).toBe(200_000);
    expect(result).toMatchObject({
      provider: 'openrouter',
      model: 'test-model',
      plan: { plan: { days: [] }, version: 'test' },
    });
  });

  it('rejects invalid LLM JSON', async () => {
    const chat: jest.MockedFunction<LlmClient['chat']> = jest
      .fn<Promise<LlmChatResponse>, [LlmChatRequest]>()
      .mockResolvedValue({
        provider: 'openrouter',
        model: 'test-model',
        content: 'not json',
      });
    const service = new LlmService({ chat });

    await expect(
      service.generateWorkoutPlan({ prompt: 'make a plan' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
