const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// packages/health-core is linked into node_modules from outside this folder; Metro has to be
// told to watch it. The app loads its built dist/, so run `npm run build` there after a change.
config.watchFolders = [path.resolve(__dirname, '../../packages/health-core')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
