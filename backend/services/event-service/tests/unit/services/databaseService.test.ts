jest.mock('pg', () => ({
  Pool: jest.fn(),
}));

import { DatabaseService } from '../../../src/services/databaseService';
import { Pool } from 'pg';

describe('DatabaseService', () => {
  let mockPool: any;
  let mockQuery: jest.Mock;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();

    // Save original env
    originalEnv = { ...process.env };

    mockQuery = jest.fn().mockResolvedValue({ rows: [{ now: new Date() }] });

    mockPool = {
      query: mockQuery,
      connect: jest.fn(),
      end: jest.fn(),
    };

    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockPool);

    // Reset the singleton instance
    (DatabaseService as any).pool = null;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('initialize', () => {
    it('should initialize with DATABASE_URL', async () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';

      await DatabaseService.initialize();

      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://user:pass@localhost:5432/testdb',
      });
      expect(mockQuery).toHaveBeenCalledWith('SELECT NOW()');
    });

    it('should initialize with individual env vars', async () => {
      delete process.env.DATABASE_URL;
      process.env.DB_HOST = 'test-host';
      process.env.DB_PORT = '5433';
      process.env.DB_NAME = 'test-db';
      process.env.DB_USER = 'test-user';
      process.env.DB_PASSWORD = 'test-pass';

      await DatabaseService.initialize();

      expect(Pool).toHaveBeenCalledWith({
        host: 'test-host',
        port: 5433,
        database: 'test-db',
        user: 'test-user',
        password: 'test-pass',
      });
      expect(mockQuery).toHaveBeenCalledWith('SELECT NOW()');
    });

    it('should use default values when env vars not set', async () => {
      delete process.env.DATABASE_URL;
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;

      await DatabaseService.initialize();

      expect(Pool).toHaveBeenCalledWith({
        host: 'tickettoken-postgres',
        port: 5432,
        database: 'tickettoken_db',
        user: 'postgres',
        password: 'localdev123',
      });
    });

    it('should test connection with SELECT NOW()', async () => {
      await DatabaseService.initialize();

      expect(mockQuery).toHaveBeenCalledWith('SELECT NOW()');
    });

    it('should handle connection errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(DatabaseService.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('getPool', () => {
    it('should return pool after initialization', async () => {
      await DatabaseService.initialize();

      const pool = DatabaseService.getPool();

      expect(pool).toBe(mockPool);
    });

    it('should throw error if not initialized', () => {
      (DatabaseService as any).pool = null;

      expect(() => DatabaseService.getPool()).toThrow('Database not initialized');
    });
  });
});
