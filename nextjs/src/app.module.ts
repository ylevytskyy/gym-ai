import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { appConfig, validateConfig } from './common/config/app.config';
import { HealthModule } from './health/health.module';
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateConfig,
    }),
    HealthModule,
    AuthModule,
    LlmModule,
  ],
})
export class AppModule {}
