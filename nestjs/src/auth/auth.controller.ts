import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

interface AuthenticatedUserResponse {
  userId: string;
  email?: string;
  role: string;
}

@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser): AuthenticatedUserResponse {
    return {
      userId: user.userId,
      email: user.email,
      role: user.role,
    };
  }
}
