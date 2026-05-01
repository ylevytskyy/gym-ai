import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AppConfig } from '../common/config/app.config';
import { USER_REPOSITORY } from './auth.constants';
import {
  AuthenticatedUser,
  ExternalIdentity,
  UserRepository,
} from './auth.types';
import { AuthTokenDto } from './dto/auth-token.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async authenticateExternalIdentity(
    identity: ExternalIdentity,
  ): Promise<AuthTokenDto> {
    const user = await this.users.upsertExternalIdentity(identity);
    return this.issueToken(user);
  }

  async findUser(userId: string): Promise<AuthenticatedUser | null> {
    return this.users.findById(userId);
  }

  private issueToken(user: AuthenticatedUser): AuthTokenDto {
    const expiresIn = this.config.get('jwt.expiresIn', { infer: true });

    return {
      accessToken: this.jwt.sign({
        sub: user.id,
        email: user.email,
      }),
      tokenType: 'Bearer',
      expiresIn,
    };
  }
}
