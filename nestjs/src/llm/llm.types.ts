export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmChatRequest {
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmChatResponse {
  provider: string;
  model: string;
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  rawResponse?: unknown;
}

export interface WorkoutPlanGenerationResponse {
  provider: string;
  model: string;
  plan: Record<string, unknown>;
  usage?: LlmChatResponse['usage'];
}

export interface LlmClient {
  chat(request: LlmChatRequest): Promise<LlmChatResponse>;
}
