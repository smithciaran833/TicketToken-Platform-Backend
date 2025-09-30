module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  moduleNameMapper: {
    '^@tickettoken/shared/utils/(.*)$': '<rootDir>/../../shared/dist/utils/$1',
    '^@tickettoken/shared/(.*)$': '<rootDir>/../../shared/dist/$1',
    '^@tickettoken/shared$': '<rootDir>/../../shared/dist/index.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!@tickettoken)',
  ],
  displayName: 'ticket-service',
};
