/**
 * Jest Setup File for Blockchain Service Tests
 *
 * This file runs before all tests and sets up the testing environment.
 */

// =============================================================================
// MOCK LOGGER BEFORE ANY IMPORTS
// =============================================================================
jest.mock('../src/utils/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    logger: mockLogger,
    createChildLogger: jest.fn().mockReturnValue(mockLogger),
    sanitize: jest.fn((obj) => obj),
    wouldRedact: jest.fn(() => false),
    addSensitiveField: jest.fn(),
  };
});

// =============================================================================
// MOCK SOLANA WEB3.JS
// =============================================================================
jest.mock('@solana/web3.js', () => {
  const mockPublicKey = jest.fn().mockImplementation((key: string) => ({
    toBase58: () => key,
    toString: () => key,
    toBuffer: () => Buffer.from(key),
    equals: (other: any) => key === other?.toString(),
  }));
  
  return {
    Connection: jest.fn().mockImplementation(() => ({
      getBalance: jest.fn().mockResolvedValue(1000000000), // 1 SOL in lamports
      getLatestBlockhash: jest.fn().mockResolvedValue({
        blockhash: 'mock-blockhash-123',
        lastValidBlockHeight: 100000,
      }),
      getSignatureStatus: jest.fn().mockResolvedValue({
        value: { confirmationStatus: 'finalized' },
      }),
      getTransaction: jest.fn().mockResolvedValue(null),
      getAccountInfo: jest.fn().mockResolvedValue(null),
      getTokenAccountsByOwner: jest.fn().mockResolvedValue({ value: [] }),
      getSlot: jest.fn().mockResolvedValue(100000),
      sendRawTransaction: jest.fn().mockResolvedValue('mock-signature'),
      confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } }),
    })),
    PublicKey: mockPublicKey,
    Keypair: {
      generate: jest.fn().mockReturnValue({
        publicKey: { toBase58: () => 'mock-public-key' },
        secretKey: new Uint8Array(64),
      }),
      fromSecretKey: jest.fn().mockReturnValue({
        publicKey: { toBase58: () => 'mock-public-key' },
        secretKey: new Uint8Array(64),
      }),
    },
    Transaction: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockReturnThis(),
      sign: jest.fn(),
      serialize: jest.fn().mockReturnValue(Buffer.from('mock-tx')),
    })),
    LAMPORTS_PER_SOL: 1000000000,
    clusterApiUrl: jest.fn().mockReturnValue('https://api.devnet.solana.com'),
    SystemProgram: {
      programId: { toBase58: () => '11111111111111111111111111111111' },
      transfer: jest.fn(),
    },
  };
});

// =============================================================================
// MOCK PG (PostgreSQL)
// =============================================================================
jest.mock('pg', () => {
  const mockClient = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  };
  
  return {
    Pool: jest.fn().mockImplementation(() => ({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    })),
    Client: jest.fn().mockImplementation(() => mockClient),
  };
});

// =============================================================================
// MOCK IOREDIS
// =============================================================================
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    eval: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    on: jest.fn(),
    status: 'ready',
  }));
});

// =============================================================================
// MOCK BULLMQ
// =============================================================================
jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      close: jest.fn().mockResolvedValue(undefined),
      getJobs: jest.fn().mockResolvedValue([]),
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0 }),
      obliterate: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    })),
    Worker: jest.fn().mockImplementation(() => ({
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    })),
    Job: jest.fn(),
  };
});

// =============================================================================
// SET TEST ENVIRONMENT VARIABLES
// =============================================================================
process.env.NODE_ENV = 'test';
process.env.SERVICE_NAME = 'blockchain-service';
process.env.PORT = '3011';
process.env.HOST = '0.0.0.0';
process.env.JWT_SECRET = 'test-secret-minimum-32-characters-long';
process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-32-chars-min';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/blockchain_test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.SOLANA_NETWORK = 'devnet';
process.env.TREASURY_PRIVATE_KEY = JSON.stringify(Array(64).fill(0));

// Increase timeout for async tests
jest.setTimeout(30000);

// =============================================================================
// GLOBAL TEST HOOKS
// =============================================================================

// Global beforeAll - runs once before all tests
beforeAll(async () => {
  // Silence console during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  }
});

// Global afterAll - runs once after all tests
afterAll(async () => {
  // Restore console
  jest.restoreAllMocks();
});

// Global beforeEach - runs before each test
beforeEach(() => {
  // Clear all mocks between tests
  jest.clearAllMocks();
});

// Export empty object for TypeScript
export {};
