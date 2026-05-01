import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

import { AuthService } from './auth.service';
import { ExternalIdentity, JwtUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { AuthTokenDto } from './dto/auth-token.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

type RequestWithIdentity = FastifyRequest & {
  user: ExternalIdentity;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  startGoogleAuth(): void {
    return;
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async finishGoogleAuth(
    @Req() request: RequestWithIdentity,
  ): Promise<AuthTokenDto> {
    return this.auth.authenticateExternalIdentity(request.user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: JwtUser): JwtUser {
    return user;
  }
}
