const path = require('path');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: path.resolve(__dirname, '../../'),
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
  testTimeout: 120000,
  maxWorkers: 1,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  // Disable coverage for integration tests (separate from unit test coverage)
  collectCoverage: false,
  // Update ts-jest config format
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },
};
