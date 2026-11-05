import { defineConfig } from 'vitest/config';

// Property tests. Generation properties call a live LLM and skip without OPENROUTER_API_KEY.
export default defineConfig({
  test: {
    include: ['tests/**/*.property.test.ts'],
    testTimeout: 5 * 60_000,
  },
});
