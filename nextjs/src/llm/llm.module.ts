import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppConfig } from '../common/config/app.config';
import { LLM_CLIENT } from './llm.constants';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { OpenRouterClient } from './providers/openrouter.client';

@Module({
  controllers: [LlmController],
  providers: [
    LlmService,
    OpenRouterClient,
    {
      provide: LLM_CLIENT,
      inject: [ConfigService, OpenRouterClient],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        openRouter: OpenRouterClient,
      ) => {
        const provider = config.get('llm.provider', { infer: true });
        const clients = {
          openrouter: openRouter,
        } satisfies Record<typeof provider, OpenRouterClient>;

        return clients[provider];
      },
    },
  ],
  exports: [LlmService, LLM_CLIENT],
})
export class LlmModule {}
