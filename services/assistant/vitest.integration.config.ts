import { defineConfig } from 'vitest/config';

// Integration tests need a Supabase-compatible instance; they skip themselves when
// SUPABASE_TEST_URL and SUPABASE_TEST_SECRET are not set.
export default defineConfig({
  test: {
    include: ['tests/**/*.integration.test.ts'],
    testTimeout: 30_000,
  },
});
