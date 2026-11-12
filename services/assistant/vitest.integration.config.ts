import { defineConfig } from 'vitest/config';
import { sharedAlias } from './vitest.shared';

// Integration tests need a Supabase-compatible instance; they skip themselves when
// SUPABASE_TEST_URL and SUPABASE_TEST_SECRET are not set.
export default defineConfig({
  resolve: { alias: sharedAlias },
  test: {
    include: ['tests/**/*.integration.test.ts'],
    testTimeout: 30_000,
  },
});
