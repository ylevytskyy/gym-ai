import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppConfig } from '../../common/config/app.config';
import { LlmChatRequest, LlmChatResponse, LlmClient } from '../llm.types';

interface OpenRouterChatResponse {
  model?: string;
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    code?: number;
    metadata?: unknown;
  };
}

@Injectable()
export class OpenRouterClient implements LlmClient {
  private readonly logger = new Logger(OpenRouterClient.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly siteUrl?: string;
  private readonly appName?: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const openRouter = config.get('llm.openRouter', { infer: true });

    this.apiKey = openRouter.apiKey;
    this.baseUrl = openRouter.baseUrl.replace(/\/$/, '');
    this.defaultModel = openRouter.model;
    this.siteUrl = openRouter.siteUrl;
    this.appName = openRouter.appName;
  }

  async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'OpenRouter API key is not configured.',
      );
    }

    const model = request.model ?? this.defaultModel;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      this.logger.error(`OpenRouter request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('OpenRouter request failed.');
    }

    let payload: OpenRouterChatResponse;
    try {
      payload = (await response.json()) as OpenRouterChatResponse;
    } catch (err) {
      this.logger.error(
        `Failed to parse OpenRouter response: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'OpenRouter returned an invalid response.',
      );
    }

    if (!response.ok) {
      this.logger.error(
        `Request failed (${response.status}): ${JSON.stringify(payload)}`,
      );
      throw new ServiceUnavailableException(
        payload.error?.message ??
          `OpenRouter request failed with ${response.status}.`,
      );
    }

    const content = payload.choices?.[0]?.message?.content;
    const finishReason = payload.choices?.[0]?.finish_reason;

    if (finishReason && finishReason !== 'stop') {
      this.logger.warn(`Response finished with reason: ${finishReason}`);
    }

    if (!content) {
      throw new ServiceUnavailableException(
        'OpenRouter returned an empty response.',
      );
    }

    return {
      provider: 'openrouter',
      model: payload.model ?? model,
      content,
      usage: {
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
        totalTokens: payload.usage?.total_tokens,
      },
      rawResponse: payload,
    };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (this.siteUrl) {
      headers['HTTP-Referer'] = this.siteUrl;
    }

    if (this.appName) {
      headers['X-Title'] = this.appName;
    }

    return headers;
  }
}
