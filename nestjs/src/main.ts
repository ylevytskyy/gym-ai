import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';

import { AppModule } from './app.module';
import { AppConfig } from './common/config/app.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env.NODE_ENV !== 'test',
      bodyLimit: 10 * 1024 * 1024,
    }),
  );

  const config = app.get(ConfigService<AppConfig, true>);

  await app.register(helmet);
  await app.register(compress, { global: true });

  app.setGlobalPrefix(config.get('apiPrefix', { infer: true }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigins = config.get('corsOrigins', { infer: true });
  app.enableCors({
    origin: corsOrigins.length === 0 ? false : corsOrigins,
    credentials: true,
  });

  await app.listen({
    port: config.get('port', { infer: true }),
    host: '0.0.0.0',
  });
}

void bootstrap();
