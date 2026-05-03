import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

import { AppConfig } from '../common/config/app.config';

@Injectable()
export class SupabaseClientFactory {
  private readonly url: string;
  private readonly publishableKey: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.url = config.get('supabase.url', { infer: true });
    this.publishableKey = config.get('supabase.publishableKey', {
      infer: true,
    });
  }

  forUser(accessToken: string) {
    return createClient(this.url, this.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }
}
