import 'dotenv/config';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3008';

// Mock external services
jest.mock('ioredis', () => {
  const Redis = jest.fn().mockImplementation(() => ({
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK')
  }));
  return Redis;
});

// Global test timeout
jest.setTimeout(10000);
