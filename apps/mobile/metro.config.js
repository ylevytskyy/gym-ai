const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// packages/health-core is linked into node_modules from outside this folder; Metro has to be
// told to watch it. The app loads its built dist/, so run `npm run build` there after a change.
// The exercise catalog is bundled straight from the repo's contracts.
config.watchFolders = [path.resolve(__dirname, '../../packages/health-core'), path.resolve(__dirname, '../../catalog')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
