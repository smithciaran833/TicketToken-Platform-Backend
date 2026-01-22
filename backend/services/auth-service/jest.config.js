module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/integration/archived/'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Use SWC instead of ts-jest - way faster, less memory
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', {
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        target: 'es2022',
      },
    }],
  },
  // Map source imports to compiled dist
  moduleNameMapper: {
    '^@tickettoken/shared$': '<rootDir>/../../shared/dist/src/index',
    '^@tickettoken/shared/(.*)$': '<rootDir>/../../shared/dist/src/$1',
  },
  // Coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/migrations/**',
    '!src/types/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  // Performance
  maxWorkers: 2,
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,
  detectOpenHandles: true,
  forceExit: true,
};
