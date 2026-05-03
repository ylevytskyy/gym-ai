import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';

import { SupabaseAuthVerifier } from '../../supabase/supabase-auth.verifier';
import { AuthenticatedUser } from '../auth.types';

type RequestWithAuthenticatedUser = FastifyRequest & {
  user?: AuthenticatedUser;
};

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(private readonly verifier: SupabaseAuthVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithAuthenticatedUser>();

    const accessToken = bearerTokenFromRequest(request);
    if (!accessToken) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    try {
      const claims = await this.verifier.verify(accessToken);
      request.user = { ...claims, accessToken };
      return true;
    } catch (error) {
      this.logger.debug(
        `Supabase JWT verification failed: ${(error as Error).message}`,
      );
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }
}

function bearerTokenFromRequest(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token.trim() || null;
}
