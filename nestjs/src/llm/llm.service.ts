import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

import { LLM_CLIENT } from './llm.constants';
import {
  LlmChatRequest,
  LlmChatResponse,
  LlmClient,
  WorkoutPlanGenerationResponse,
} from './llm.types';

interface ProviderRawResponse {
  choices?: Array<{ finish_reason?: string }>;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(@Inject(LLM_CLIENT) private readonly client: LlmClient) {}

  chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    return this.client.chat(request);
  }

  async generateWorkoutPlan(
    request: Omit<LlmChatRequest, 'messages'> & { prompt: string },
  ): Promise<WorkoutPlanGenerationResponse> {
    const response = await this.client.chat({
      messages: [{ role: 'user', content: request.prompt }],
      model: request.model,
      temperature: request.temperature ?? 0.2,
      maxTokens: request.maxTokens ?? 200_000,
    });

    this.logger.log(
      `Generated plan via ${response.provider} (${response.model}); content length: ${response.content.length}`,
    );

    return {
      provider: response.provider,
      model: response.model,
      plan: this.parsePlan(response.content, response.rawResponse),
      usage: response.usage,
    };
  }

  private parsePlan(
    content: string,
    rawResponse?: unknown,
  ): Record<string, unknown> {
    let json = '';
    try {
      json = this.extractJsonObject(content);
      const parsed: unknown = JSON.parse(json);
      if (!this.isRecord(parsed)) {
        throw new Error('Top-level response is not a JSON object.');
      }

      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finishReason = (rawResponse as ProviderRawResponse | undefined)
        ?.choices?.[0]?.finish_reason;

      this.logger.error(
        `Workout-plan JSON parse failed: ${message} | finish_reason=${finishReason ?? 'n/a'} | length=${content.length} | tail="${json.slice(-100)}"`,
      );
      this.logger.debug(`Full LLM content:\n${content}`);

      throw new BadGatewayException(
        `LLM returned invalid workout-plan JSON: ${message}.`,
      );
    }
  }

  private extractJsonObject(content: string): string {
    const trimmed = content.trim();
    const withoutFence = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const firstBrace = withoutFence.indexOf('{');
    const lastBrace = withoutFence.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      throw new BadGatewayException('LLM response did not contain JSON.');
    }

    return withoutFence.slice(firstBrace, lastBrace + 1);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
