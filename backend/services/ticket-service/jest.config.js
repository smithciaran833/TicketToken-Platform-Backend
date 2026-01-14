/**
 * Jest Configuration
 *
 * Fixes Batch 14 audit finding: Coverage thresholds 80%
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // TypeScript support
  preset: 'ts-jest',

  // Root directory
  rootDir: '.',

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.spec.ts',
  ],

  // Files to ignore
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
  ],

  // Module path aliases (match tsconfig.json paths)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@schemas/(.*)$': '<rootDir>/src/schemas/$1',
  },

  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts',
  ],

  // ==========================================================================
  // TYPESCRIPT TRANSFORM
  // ==========================================================================

  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      isolatedModules: true,
    }],
  },

  // ==========================================================================
  // COVERAGE CONFIGURATION (Batch 14 Fix #1: 80% thresholds)
  // ==========================================================================

  collectCoverage: true,

  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/index.ts',        // Entry point
    '!src/types/**/*',      // Type definitions
    '!src/migrations/**/*', // Database migrations
  ],

  coverageDirectory: 'coverage',

  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'json',
  ],

  // SECURITY: 80% coverage thresholds as per audit requirements
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    // Critical paths require higher coverage
    './src/services/ticketService.ts': {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85,
    },
    './src/services/security.service.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/middleware/auth.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },

  // ==========================================================================
  // PERFORMANCE
  // ==========================================================================

  // Maximum number of workers
  maxWorkers: '50%',

  // Test timeout (30 seconds for integration tests)
  testTimeout: 30000,

  // Cache directory
  cacheDirectory: '<rootDir>/.jest-cache',

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Error on deprecated APIs
  errorOnDeprecated: true,

  // ==========================================================================
  // MODULE FILE EXTENSIONS
  // ==========================================================================

  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'node',
  ],

  // ==========================================================================
  // REPORTERS
  // ==========================================================================

  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'coverage',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true,
      },
    ],
  ],

  // ==========================================================================
  // SNAPSHOTS
  // ==========================================================================

  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true,
  },
};
