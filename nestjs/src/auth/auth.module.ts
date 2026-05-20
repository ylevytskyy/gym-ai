import { Module } from '@nestjs/common';

import { SupabaseModule } from '../supabase/supabase.module';
import { AuthController } from './auth.controller';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

@Module({
  imports: [SupabaseModule],
  controllers: [AuthController],
  providers: [SupabaseAuthGuard],
  exports: [SupabaseAuthGuard, SupabaseModule],
})
export class AuthModule {}
