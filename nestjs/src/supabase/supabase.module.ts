import { Module } from '@nestjs/common';

import { SupabaseAuthVerifier } from './supabase-auth.verifier';

@Module({
  providers: [SupabaseAuthVerifier],
  exports: [SupabaseAuthVerifier],
})
export class SupabaseModule {}
