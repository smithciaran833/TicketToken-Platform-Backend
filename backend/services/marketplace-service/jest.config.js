/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node',
        baseUrl: '.',
        paths: {
          '@tickettoken/shared/*': ['../../shared/dist/*'],
          '@tickettoken/shared': ['../../shared/dist/index.js']
        }
      }
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@faker-js)/)'
  ],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tickettoken/shared/(.*)$': '<rootDir>/../../shared/dist/$1',
    '^@tickettoken/shared$': '<rootDir>/../../shared/dist/index.js'
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/migrations/**',
    '!src/seeds/**',
    '!src/tests/**'
  ]
};
