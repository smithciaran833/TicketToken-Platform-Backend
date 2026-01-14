module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/types/**',
    '!src/migrations/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 10000,
  verbose: true,
  // Use test-specific tsconfig
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
    },
  },
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80,
    },
    './src/services/order.service.ts': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/services/payment.client.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/services/ticket.client.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/middleware/internal-auth.middleware.ts': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/plugins/jwt-auth.plugin.ts': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  clearMocks: true,
  errorOnDeprecated: true,
  detectOpenHandles: true,
  forceExit: true,
  maxWorkers: '50%',
  globalTeardown: '<rootDir>/tests/teardown.ts',
};
