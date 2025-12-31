/**
 * Jest setup file for venue-service tests
 * AUDIT FIX (TQ6): Test determinism improvements
 * AUDIT FIX (KT5): Transaction isolation support
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// AUDIT FIX (TQ6): Fixed seed for deterministic test runs
process.env.TEST_SEED = process.env.TEST_SEED || '12345';

// Mock console methods to reduce test output noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set longer timeout for integration tests
jest.setTimeout(30000);

// AUDIT FIX (TQ6): Mock Date.now for deterministic timestamps
const FIXED_DATE = new Date('2024-01-15T12:00:00.000Z');
const originalDate = global.Date;

// Helper to enable/disable fixed date
(global as any).enableFixedDate = () => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_DATE);
};

(global as any).disableFixedDate = () => {
  jest.useRealTimers();
};

// AUDIT FIX (KT5): Transaction wrapper for test isolation
/**
 * Wrap database operations in a transaction that will be rolled back
 * Usage: 
 *   const trx = await (global as any).createTestTransaction(db);
 *   try { ... test code ... } finally { await trx.rollback(); }
 */
(global as any).createTestTransaction = async (db: any) => {
  const trx = await db.transaction();
  return trx;
};

// AUDIT FIX (TQ6): UUID generator with deterministic mode for tests
let uuidCounter = 0;
(global as any).resetUuidCounter = () => { uuidCounter = 0; };
(global as any).generateTestUuid = () => {
  uuidCounter++;
  const padded = uuidCounter.toString().padStart(12, '0');
  return `00000000-0000-0000-0000-${padded}`;
};

// Clean up after all tests
afterAll(async () => {
  // Restore real timers if fake timers were used
  jest.useRealTimers();
});

// Reset state before each test
beforeEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
});

// Log test failures with more context in CI
if (process.env.CI) {
  afterEach(function() {
    const testState = (expect as any).getState();
    if (testState?.currentTestName && !testState?.isNot) {
      // Test completed - could log additional context here
    }
  });
}
