const fs = require('node:fs');
const path = require('node:path');

const HEALTH_CORE_SRC = path.resolve(__dirname, '../../packages/health-core/src');

/**
 * Tests read packages/health-core from source, so they never pass against a stale build.
 * Its files import each other as './x.js' (required by Node ESM); map those to the .ts file.
 */
module.exports = (request, options) => {
  if (request === '@aura-fit/health-core') {
    return path.join(HEALTH_CORE_SRC, 'index.ts');
  }
  if (options.basedir.startsWith(HEALTH_CORE_SRC)) {
    if (request.startsWith('.') && request.endsWith('.js')) {
      const candidate = path.resolve(options.basedir, request.replace(/\.js$/, '.ts'));
      if (fs.existsSync(candidate)) return candidate;
    }
    // Helpers Babel adds to the transformed source live in this app's node_modules.
    if (!request.startsWith('.')) return options.defaultResolver(request, { ...options, basedir: __dirname });
  }
  return options.defaultResolver(request, options);
};
