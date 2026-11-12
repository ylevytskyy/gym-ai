// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // e2e/*.js run inside Maestro's own JavaScript engine, not in the app.
    ignores: ['dist/*', 'ios/*', 'android/*', 'e2e/*'],
  },
  {
    // Node-side tooling files, not app code.
    files: ['jest.*.js', 'metro.config.js'],
    languageOptions: { globals: { __dirname: 'readonly', module: 'writable', require: 'readonly', process: 'readonly' } },
  },
]);
