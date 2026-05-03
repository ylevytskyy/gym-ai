import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { AppConfig } from '../common/config/app.config';

export interface SupabaseUserClaims {
  userId: string;
  email?: string;
  role: string;
  sessionId?: string;
}

@Injectable()
export class SupabaseAuthVerifier implements OnModuleDestroy {
  private readonly logger = new Logger(SupabaseAuthVerifier.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const url = config.get('supabase.url', { infer: true });
    this.issuer = `${url}/auth/v1`;
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
    );
  }

  async verify(accessToken: string): Promise<SupabaseUserClaims> {
    const { payload } = await jwtVerify(accessToken, this.jwks, {
      issuer: this.issuer,
    });

    return claimsFromPayload(payload);
  }

  onModuleDestroy(): void {
    this.logger.debug('SupabaseAuthVerifier destroyed');
  }
}

function claimsFromPayload(payload: JWTPayload): SupabaseUserClaims {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Supabase JWT is missing the `sub` claim.');
  }

  const role =
    typeof payload.role === 'string' ? payload.role : 'authenticated';
  const email = typeof payload.email === 'string' ? payload.email : undefined;
  const sessionId =
    typeof payload.session_id === 'string' ? payload.session_id : undefined;

  return {
    userId: payload.sub,
    email,
    role,
    sessionId,
  };
}
