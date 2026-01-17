// Mock logger before imports
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

// Create mock pool instance at module level
const mockPoolInstance = {
  on: jest.fn(),
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
};

// Mock pg module with proper constructor
const mockPoolConstructor = jest.fn(() => mockPoolInstance);

jest.mock('pg', () => ({
  Pool: mockPoolConstructor,
}));

describe('Config - Database Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Reset specific mocks (not logger for some tests)
    mockPoolConstructor.mockClear();
    mockPoolInstance.on.mockClear();

    // Clear the module cache to reset singleton
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  // Helper to get fresh module
  const getModule = () => {
    return require('../../../src/config/database.config');
  };

  describe('connectDatabase', () => {
    it('should be defined', () => {
      const { connectDatabase } = getModule();
      expect(connectDatabase).toBeDefined();
      expect(typeof connectDatabase).toBe('function');
    });

    it('should create a new Pool with DATABASE_URL from environment', async () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolConstructor).toHaveBeenCalledWith({
        connectionString: 'postgresql://user:pass@localhost:5432/testdb',
        max: 10,
        idleTimeoutMillis: 30000,
      });
    });

    it('should create Pool with correct max connections value', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 10,
        })
      );
    });

    it('should create Pool with correct idleTimeoutMillis value', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          idleTimeoutMillis: 30000,
        })
      );
    });

    it('should validate max connections is a positive number', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      const callArgs = mockPoolConstructor.mock.calls[0][0];
      expect(callArgs.max).toBeGreaterThan(0);
      expect(typeof callArgs.max).toBe('number');
      expect(Number.isInteger(callArgs.max)).toBe(true);
    });

    it('should validate idleTimeoutMillis is a positive number', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      const callArgs = mockPoolConstructor.mock.calls[0][0];
      expect(callArgs.idleTimeoutMillis).toBeGreaterThan(0);
      expect(typeof callArgs.idleTimeoutMillis).toBe('number');
      expect(Number.isInteger(callArgs.idleTimeoutMillis)).toBe(true);
    });

    it('should register connect event listener', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should register error event listener', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should register exactly 2 event listeners (connect and error)', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolInstance.on).toHaveBeenCalledTimes(2);
    });

    it('should log info message on connect event', async () => {
      mockLogger.info.mockClear(); // Clear before this test
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      // Get the connect handler and call it
      const connectHandler = mockPoolInstance.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];
      connectHandler();

      expect(mockLogger.info).toHaveBeenCalledWith('PostgreSQL connected');
    });

    it('should log error message on error event', async () => {
      mockLogger.error.mockClear(); // Clear before this test
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      // Get the error handler and call it
      const errorHandler = mockPoolInstance.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )[1];
      const testError = new Error('Connection failed');
      errorHandler(testError);

      expect(mockLogger.error).toHaveBeenCalledWith('PostgreSQL error:', testError);
    });

    it('should return the same Pool instance on subsequent calls (singleton pattern)', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      const pool1 = await connectDatabase();
      const pool2 = await connectDatabase();
      const pool3 = await connectDatabase();

      expect(pool1).toBe(pool2);
      expect(pool2).toBe(pool3);
      expect(mockPoolConstructor).toHaveBeenCalledTimes(1);
    });

    it('should return a Pool instance', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      const pool = await connectDatabase();

      expect(pool).toBeDefined();
      expect(pool).toBe(mockPoolInstance);
    });

    it('should handle DATABASE_URL with credentials', async () => {
      process.env.DATABASE_URL = 'postgresql://admin:secret123@db.example.com:5432/proddb';
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: 'postgresql://admin:secret123@db.example.com:5432/proddb',
        })
      );
    });

    it('should handle DATABASE_URL with query parameters', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db?ssl=true&sslmode=require';
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: 'postgresql://localhost:5432/db?ssl=true&sslmode=require',
        })
      );
    });

    it('should handle DATABASE_URL with non-standard port', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:15432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: 'postgresql://localhost:15432/db',
        })
      );
    });

    it('should handle undefined DATABASE_URL', async () => {
      delete process.env.DATABASE_URL;
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: undefined,
        })
      );
    });

    it('should handle empty DATABASE_URL', async () => {
      process.env.DATABASE_URL = '';
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: '',
        })
      );
    });

    it('should handle DATABASE_URL with special characters in password', async () => {
      process.env.DATABASE_URL = 'postgresql://user:p@ss%20word!@localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      expect(mockPoolConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: 'postgresql://user:p@ss%20word!@localhost:5432/db',
        })
      );
    });
  });

  describe('getPool', () => {
    it('should be defined', () => {
      const { getPool } = getModule();
      expect(getPool).toBeDefined();
      expect(typeof getPool).toBe('function');
    });

    it('should throw error when pool is not initialized', () => {
      const { getPool } = getModule();
      expect(() => getPool()).toThrow('Database not initialized');
    });

    it('should throw Error type', () => {
      const { getPool } = getModule();
      expect(() => getPool()).toThrow(Error);
    });

    it('should have descriptive error message', () => {
      const { getPool } = getModule();
      try {
        getPool();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Database not initialized');
      }
    });

    it('should return pool after connectDatabase has been called', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase, getPool } = getModule();

      await connectDatabase();
      const pool = getPool();

      expect(pool).toBeDefined();
      expect(pool).toBe(mockPoolInstance);
    });

    it('should return the same pool instance on multiple calls', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase, getPool } = getModule();

      await connectDatabase();
      const pool1 = getPool();
      const pool2 = getPool();
      const pool3 = getPool();

      expect(pool1).toBe(pool2);
      expect(pool2).toBe(pool3);
    });

    it('should not create a new pool when called', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase, getPool } = getModule();

      await connectDatabase();
      mockPoolConstructor.mockClear(); // Clear the Pool constructor call from connectDatabase

      getPool();
      getPool();

      expect(mockPoolConstructor).not.toHaveBeenCalled();
    });
  });

  describe('Configuration values validation', () => {
    it('should have max connections within reasonable bounds', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      const callArgs = mockPoolConstructor.mock.calls[0][0];
      expect(callArgs.max).toBeGreaterThanOrEqual(1);
      expect(callArgs.max).toBeLessThanOrEqual(100); // Reasonable upper limit
    });

    it('should have idle timeout in milliseconds (not seconds)', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      const callArgs = mockPoolConstructor.mock.calls[0][0];
      // 30000ms = 30 seconds, which is reasonable
      expect(callArgs.idleTimeoutMillis).toBeGreaterThanOrEqual(1000); // At least 1 second
    });

    it('should configure max connections to 10', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      const callArgs = mockPoolConstructor.mock.calls[0][0];
      expect(callArgs.max).toBe(10);
    });

    it('should configure idle timeout to 30 seconds', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      const callArgs = mockPoolConstructor.mock.calls[0][0];
      expect(callArgs.idleTimeoutMillis).toBe(30000);
    });

    it('should only configure required Pool options', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      const callArgs = mockPoolConstructor.mock.calls[0][0];
      const configKeys = Object.keys(callArgs);
      
      expect(configKeys).toContain('connectionString');
      expect(configKeys).toContain('max');
      expect(configKeys).toContain('idleTimeoutMillis');
      expect(configKeys).toHaveLength(3);
    });
  });

  describe('Event handler validation', () => {
    it('should register connect handler that accepts no parameters', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      const connectHandler = mockPoolInstance.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];

      expect(() => connectHandler()).not.toThrow();
    });

    it('should register error handler that accepts an error parameter', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      const errorHandler = mockPoolInstance.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )[1];

      expect(() => errorHandler(new Error('test'))).not.toThrow();
    });

    it('should handle error events with Error objects', async () => {
      mockLogger.error.mockClear(); // Clear before this test
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      const errorHandler = mockPoolInstance.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )[1];

      const testError = new Error('Database connection lost');
      errorHandler(testError);

      expect(mockLogger.error).toHaveBeenCalledWith('PostgreSQL error:', testError);
    });

    it('should log connect event only once per connection', async () => {
      mockLogger.info.mockClear(); // Clear before this test
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase } = getModule();

      await connectDatabase();

      const connectHandler = mockPoolInstance.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )[1];

      connectHandler();
      connectHandler();

      expect(mockLogger.info).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith('PostgreSQL connected');
    });
  });

  describe('Integration validation', () => {
    it('should allow calling connectDatabase then getPool', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase, getPool } = getModule();

      const connectedPool = await connectDatabase();
      const retrievedPool = getPool();

      expect(connectedPool).toBe(retrievedPool);
    });

    it('should maintain pool state across multiple operations', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
      const { connectDatabase, getPool } = getModule();

      const pool1 = await connectDatabase();
      const pool2 = getPool();
      const pool3 = await connectDatabase();
      const pool4 = getPool();

      expect(pool1).toBe(pool2);
      expect(pool2).toBe(pool3);
      expect(pool3).toBe(pool4);
    });
  });
});
