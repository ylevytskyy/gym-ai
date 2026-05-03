import { BadGatewayException } from '@nestjs/common';

import { LlmService } from './llm.service';
import { LlmClient } from './llm.types';

describe('LlmService', () => {
  it('generates and parses a workout plan JSON object', async () => {
    const chat = jest.fn().mockResolvedValue({
      provider: 'openrouter',
      model: 'test-model',
      content: '```json\n{"plan":{"days":[]},"version":"test"}\n```',
    });
    const client: LlmClient = {
      chat,
    };
    const service = new LlmService(client);

    const result = await service.generateWorkoutPlan({ prompt: 'make a plan' });

    expect(chat).toHaveBeenCalledWith({
      messages: [
        { role: 'system', content: expect.stringContaining('strict JSON') },
        { role: 'user', content: 'make a plan' },
      ],
      model: undefined,
      temperature: 0.2,
      maxTokens: 200_000,
    });
    expect(result).toMatchObject({
      provider: 'openrouter',
      model: 'test-model',
      plan: { plan: { days: [] }, version: 'test' },
    });
  });

  it('rejects invalid LLM JSON', async () => {
    const client: LlmClient = {
      chat: jest.fn().mockResolvedValue({
        provider: 'openrouter',
        model: 'test-model',
        content: 'not json',
      }),
    };
    const service = new LlmService(client);

    await expect(
      service.generateWorkoutPlan({ prompt: 'make a plan' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
