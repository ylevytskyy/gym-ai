import { Module } from '@nestjs/common';

import { SupabaseAuthVerifier } from './supabase-auth.verifier';
import { SupabaseClientFactory } from './supabase-client.factory';

@Module({
  providers: [SupabaseAuthVerifier, SupabaseClientFactory],
  exports: [SupabaseAuthVerifier, SupabaseClientFactory],
})
export class SupabaseModule {}
