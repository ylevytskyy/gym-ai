/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  resolver: '<rootDir>/jest.resolver.js',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  // Day boundaries are local time; pin the zone so tests mean the same thing on every machine.
  globalSetup: '<rootDir>/jest.global-setup.js',
};
