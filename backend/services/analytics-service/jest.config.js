const baseConfig = require('../../shared/jest.config.base2.js');

module.exports = {
  ...baseConfig,
  displayName: 'analytics-service',
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/migrations/**',
    '!src/scripts/**',
    '!src/index.ts',
    '!src/server.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};
