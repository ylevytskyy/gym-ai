/**
 * Loads JSON files that live in the monorepo root (catalog/, schemas/).
 *
 * A fixed relative import breaks once tsc emits to dist/ (different depth and
 * rootDir), so walk up from this module until the file is found.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadRepoJson<T = unknown>(relativePath: string): T {
  const here = fileURLToPath(import.meta.url);
  let dir = dirname(here);
  for (;;) {
    const candidate = join(dir, relativePath);
    if (existsSync(candidate)) {
      return JSON.parse(readFileSync(candidate, 'utf8')) as T;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Cannot locate ${relativePath} above ${here}`);
    }
    dir = parent;
  }
}
