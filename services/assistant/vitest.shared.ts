import { fileURLToPath } from 'node:url';

/**
 * Tests read packages/health-core from source. The installed package points at its built
 * dist/, which goes stale when the source changes without a rebuild; a stale build would let
 * a broken rule pass here.
 */
export const sharedAlias = {
  '@aura-fit/health-core': fileURLToPath(new URL('../../packages/health-core/src/index.ts', import.meta.url)),
};
