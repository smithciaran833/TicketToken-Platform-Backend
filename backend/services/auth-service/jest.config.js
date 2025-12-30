module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/migrations/**',
    '!src/types/**',
  ],
  
  // Coverage thresholds - fail if below these percentages
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
    // Stricter thresholds for critical files
    './src/services/auth.service.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/services/jwt.service.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  
  // Coverage reporters for CI integration
  coverageReporters: [
    'text',           // Console output
    'text-summary',   // Summary in console
    'lcov',           // For codecov/coveralls
    'json-summary',   // For badges/CI parsing
    'html',           // Local HTML report
  ],
  
  coverageDirectory: '<rootDir>/coverage',
  
  // CI-optimized worker configuration
  maxWorkers: process.env.CI ? 2 : '50%',
  
  // Fail fast in CI
  bail: process.env.CI ? 1 : 0,
  
  // Verbose output in CI
  verbose: !!process.env.CI,
  
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Detect open handles (useful for debugging async issues)
  detectOpenHandles: true,
  
  // Force exit after tests complete
  forceExit: true,
};
