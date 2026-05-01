import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AppConfig } from '../common/config/app.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { USER_REPOSITORY } from './auth.constants';
import { InMemoryUserRepository } from './providers/in-memory-user.repository';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt.secret', { infer: true }),
        signOptions: {
          expiresIn: config.get('jwt.expiresIn', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    {
      provide: USER_REPOSITORY,
      useClass: InMemoryUserRepository,
    },
  ],
  exports: [AuthService, USER_REPOSITORY],
})
export class AuthModule {}
