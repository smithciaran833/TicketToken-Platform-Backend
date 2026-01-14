/**
 * Jest configuration for event-service
 * SECURITY FIX (JC3): Added coverage thresholds with 80% minimums
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // AUDIT FIX (TEST-SETUP): Run setup file before each test suite
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // AUDIT FIX (TEST-WORKERS): Limit workers for CI stability
  // Use 50% of available CPUs to prevent CI resource exhaustion
  ...(process.env.CI ? { maxWorkers: '50%' } : {}),
  
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/migrations/**',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
  ],
  // CRITICAL FIX: Coverage thresholds for audit compliance
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill)/)',
  ],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
      isolatedModules: true,
    },
  },
  
  // Module name mapping for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^pino$': '<rootDir>/tests/__mocks__/pino.js',
  },

  // Coverage ignore patterns
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '/__mocks__/',
  ],

  // Clear mocks between tests
  clearMocks: true,
  verbose: true,

  // Force exit after tests complete (handle async cleanup)
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true,
};
