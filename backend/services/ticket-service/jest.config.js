module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test files
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/*.test.ts',
    '**/*.spec.ts'
  ],

  // Module resolution
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@tickettoken/shared/utils/(.*)$': '<rootDir>/../../shared/dist/src/utils/$1',
    '^@tickettoken/shared/(.*)$': '<rootDir>/../../shared/dist/src/$1',
    '^@tickettoken/shared$': '<rootDir>/../../shared/dist/src/index.js',
  },

  // Transform
  transformIgnorePatterns: [
    'node_modules/(?!@tickettoken)',
  ],

  // Coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/server.ts',
    '!src/migrations/**',
    '!src/types/**',
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 65,
      functions: 70,
      lines: 70,
    },
  },

  // Performance
  maxWorkers: 4,
  testTimeout: 30000,  // 30 seconds per test

  // Reporting
  verbose: true,

  // Error handling
  bail: false,
  errorOnDeprecated: true,
};
