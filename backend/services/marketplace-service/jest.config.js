/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/tests/unit/**/*.test.ts',
    '**/tests/integration/**/*.test.ts',
    '**/tests/security/**/*.test.ts',
    '!**/tests/load/**'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node',
        skipLibCheck: true,
        baseUrl: '.',
        paths: {
          '@tickettoken/shared/*': ['../../shared/dist/src/*'],
          '@tickettoken/shared': ['../../shared/dist/src/index.js']
        }
      },
      isolatedModules: true
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@faker-js)/)'
  ],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tickettoken/shared/(.*)$': '/home/kevin/Desktop/TicketToken-Platform/backend/shared/dist/src/$1',
    '^@tickettoken/shared$': '/home/kevin/Desktop/TicketToken-Platform/backend/shared/dist/src/index.js'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/migrations/**',
    '!src/seeds/**',
    '!src/tests/**'
  ]
};
