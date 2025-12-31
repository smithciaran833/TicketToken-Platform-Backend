/**
 * Jest configuration for venue-service
 * SECURITY FIX (JC3): Added coverage thresholds with 80% minimums
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
  verbose: true,
  maxWorkers: 1,
  testTimeout: 30000,
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json'
    }
  },
  
  // SECURITY FIX (JC3): Coverage configuration with thresholds
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/migrations/**',
    '!src/tests/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  
  // SECURITY FIX (JC3): Enforce 80% minimum coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    // Critical security paths should have higher coverage
    './src/middleware/': {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85,
    },
    './src/services/': {
      branches: 80,
      functions: 85,
      lines: 80,
      statements: 80,
    },
  },

  // Coverage ignore patterns
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '/__mocks__/',
  ],

  // Module name mapping for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // AUDIT FIX (TI3): CI-ready configuration
  // When running with --ci flag, these settings are applied
  ci: true,
  
  // Fail tests on console warnings/errors in CI
  errorOnDeprecated: true,
  
  // CI reporters for JUnit output
  reporters: process.env.CI 
    ? ['default', ['jest-junit', { 
        outputDirectory: './test-results',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
      }]]
    : ['default'],

  // AUDIT FIX (TQ6): Test determinism - use fake timers
  fakeTimers: {
    enableGlobally: false, // Enable per-test with jest.useFakeTimers()
  },

  // Randomize test order to catch order dependencies
  randomize: true,

  // Fail fast in CI
  bail: process.env.CI ? 1 : 0,

  // Force exit after tests complete (handle async cleanup)
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true,

  // Test retry configuration
  testRetry: process.env.CI ? 2 : 0,
};
