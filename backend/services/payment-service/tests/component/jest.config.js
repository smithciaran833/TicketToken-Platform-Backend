/** @type {import('jest').Config} */
module.exports = {
  displayName: 'component',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['./jest.setup.ts'],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  testTimeout: 30000, // 30s for container startup
  maxWorkers: 1, // Run sequentially to avoid container conflicts
  verbose: true,
  collectCoverageFrom: [
    '../../src/**/*.ts',
    '!../../src/**/*.d.ts',
    '!../../src/**/index.ts',
  ],
};
