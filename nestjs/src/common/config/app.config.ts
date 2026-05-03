export type LlmProviderName = 'openrouter';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  supabase: {
    url: string;
    publishableKey: string;
  };
  llm: {
    provider: LlmProviderName;
    openRouter: {
      apiKey: string;
      baseUrl: string;
      model: string;
      siteUrl?: string;
      appName?: string;
    };
  };
}

export const appConfig = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: numberFromEnv('PORT', 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigins: csvFromEnv('CORS_ORIGINS'),
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
  },
  llm: {
    provider: (process.env.LLM_PROVIDER ?? 'openrouter') as LlmProviderName,
    openRouter: {
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      baseUrl:
        process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
      model:
        process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat-v3-0324:free',
      siteUrl: process.env.OPENROUTER_SITE_URL,
      appName: process.env.OPENROUTER_APP_NAME,
    },
  },
});

export function validateConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv =
    typeof config.NODE_ENV === 'string' ? config.NODE_ENV : 'development';
  const isProduction = nodeEnv === 'production';
  const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];

  if (isProduction) {
    required.push('OPENROUTER_API_KEY');
  }

  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const supabaseUrl = config.SUPABASE_URL;
  if (typeof supabaseUrl === 'string' && supabaseUrl.length > 0) {
    try {
      const parsed = new URL(supabaseUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('SUPABASE_URL must be an http(s) URL.');
      }
    } catch {
      throw new Error('SUPABASE_URL must be a valid URL.');
    }
  }

  return config;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function csvFromEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}
