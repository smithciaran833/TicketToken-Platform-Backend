/**
 * Jest Configuration for Transfer Service
 *
 * AUDIT FIXES:
 * - TST-H1: No jest.config.js → Created configuration
 * - TST-H2: No coverage thresholds → Added coverage requirements
 *
 * Features:
 * - TypeScript support with ts-jest
 * - Coverage thresholds for CI/CD
 * - Module path aliases
 * - Test environment configuration
 */
/** @type {import('jest').Config} */
module.exports = {
  // Use ts-jest for TypeScript
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Root directory
  rootDir: '.',
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.spec.ts'
  ],
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Module name mapper for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@errors/(.*)$': '<rootDir>/src/errors/$1'
  },
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts'
  ],
  // Global setup/teardown
  globalSetup: '<rootDir>/tests/global-setup.ts',
  globalTeardown: '<rootDir>/tests/global-teardown.ts',
  // Coverage configuration
  collectCoverage: false, // Enable via --coverage flag
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/index.ts',
    '!src/types/**/*'
  ],
  // Coverage directory
  coverageDirectory: '<rootDir>/coverage',
  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'json-summary'
  ],
  // AUDIT FIX TST-H2: Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70
    },
    // Higher thresholds for critical paths
    './src/services/transfer.service.ts': {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/services/blockchain-transfer.service.ts': {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/middleware/auth.middleware.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  // Verbose output
  verbose: true,
  // Fail on console errors
  errorOnDeprecated: true,
  // Clear mocks between tests
  clearMocks: true,
  // Restore mocks automatically
  restoreMocks: true,
  // Test timeout (30 seconds for integration tests)
  testTimeout: 30000,
  // Force exit after tests complete
  forceExit: true,
  // Detect open handles
  detectOpenHandles: true,
  // Max workers
  maxWorkers: '50%',
  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      isolatedModules: true
    }]
  },
  // Test result processors
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './coverage',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true
    }]
  ],
  // Test sequencer for better parallelization
  // testSequencer: require.resolve('jest-test-sequencer-parallel'),
  // Globals
  globals: {
    'ts-jest': {
      diagnostics: {
        warnOnly: true
      }
    }
  }
};
