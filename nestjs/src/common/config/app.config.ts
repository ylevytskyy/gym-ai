export type LlmProviderName = 'openrouter';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  jwt: {
    secret: string;
    expiresIn: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
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
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  },
  google: {
    clientId: stringFromEnv('GOOGLE_CLIENT_ID', 'development-google-client-id'),
    clientSecret: stringFromEnv(
      'GOOGLE_CLIENT_SECRET',
      'development-google-client-secret',
    ),
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ??
      'http://localhost:3000/api/auth/google/callback',
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
  const required = ['JWT_SECRET'];

  if (isProduction) {
    required.push(
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'OPENROUTER_API_KEY',
    );
  }

  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  if (
    (config.JWT_SECRET as string | undefined)?.length &&
    String(config.JWT_SECRET).length < 32
  ) {
    throw new Error('JWT_SECRET must be at least 32 characters long.');
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

function stringFromEnv(name: string, developmentFallback: string): string {
  const value = process.env[name];
  if (value) {
    return value;
  }

  return process.env.NODE_ENV === 'production' ? '' : developmentFallback;
}
