// Test setup and global mocks

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
process.env.STRIPE_API_VERSION = '2023-10-16';
process.env.SOLANA_PRIVATE_KEY = 'mock_private_key_base58';
process.env.SOLANA_NETWORK = 'devnet';
process.env.EMAIL_USER = 'test@example.com';
process.env.EMAIL_PASSWORD = 'test_password';

// Mock logger to avoid console spam in tests
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Global test utilities
global.beforeEach(() => {
  jest.clearAllMocks();
});
