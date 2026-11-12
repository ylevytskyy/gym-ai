import { defineConfig } from 'vitest/config';
import { sharedAlias } from './vitest.shared';

export default defineConfig({
  resolve: { alias: sharedAlias },
});
