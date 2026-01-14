import { Pool } from 'pg';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('pg', () => {
  const mockQuery = jest.fn().mockResolvedValue({ rows: [{ now: new Date() }] });
  const mockPool = jest.fn().mockImplementation(() => ({
    query: mockQuery,
    end: jest.fn(),
  }));
  
  return {
    Pool: mockPool,
  };
});

// =============================================================================
// TEST SUITE
// =============================================================================

describe('DatabaseService', () => {
  let DatabaseService: any;
  let mockPoolInstance: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    originalEnv = { ...process.env };
    
    // Get fresh mock instance
    const { Pool: MockPool } = require('pg');
    mockPoolInstance = {
      query: jest.fn().mockResolvedValue({ rows: [{ now: new Date() }] }),
      end: jest.fn(),
    };
    (MockPool as jest.Mock).mockReturnValue(mockPoolInstance);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // initialize() - 8 test cases
  // ===========================================================================

  describe('initialize()', () => {
    it('should create Pool with default configuration', async () => {
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_NAME;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      
      const { Pool: MockPool } = require('pg');
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(MockPool).toHaveBeenCalledWith({
        host: 'postgres',
        port: 5432,
        database: 'tickettoken_db',
        user: 'postgres',
        password: 'TicketToken2024Secure!',
      });
    });

    it('should use environment variables when provided', async () => {
      process.env.DB_HOST = 'custom-host';
      process.env.DB_PORT = '5433';
      process.env.DB_NAME = 'custom-db';
      process.env.DB_USER = 'custom-user';
      process.env.DB_PASSWORD = 'custom-pass';
      
      const { Pool: MockPool } = require('pg');
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(MockPool).toHaveBeenCalledWith({
        host: 'custom-host',
        port: 5433,
        database: 'custom-db',
        user: 'custom-user',
        password: 'custom-pass',
      });
    });

    it('should execute SELECT NOW() query', async () => {
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(mockPoolInstance.query).toHaveBeenCalledWith('SELECT NOW()');
    });

    it('should log success message', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('Database connected');
      
      consoleSpy.mockRestore();
    });

    it('should parse DB_PORT as integer', async () => {
      process.env.DB_PORT = '9999';
      
      const { Pool: MockPool } = require('pg');
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 9999,
        })
      );
    });

    it('should handle connection errors', async () => {
      mockPoolInstance.query.mockRejectedValue(new Error('Connection failed'));
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await expect(DatabaseService.initialize()).rejects.toThrow('Connection failed');
    });

    it('should create pool instance', async () => {
      const { Pool: MockPool } = require('pg');
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(MockPool).toHaveBeenCalled();
    });

    it('should store pool instance internally', async () => {
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(() => DatabaseService.getPool()).not.toThrow();
    });
  });

  // ===========================================================================
  // getPool() - 4 test cases
  // ===========================================================================

  describe('getPool()', () => {
    it('should throw error if not initialized', () => {
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      expect(() => DatabaseService.getPool()).toThrow('Database not initialized');
    });

    it('should return pool after initialization', async () => {
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();
      const pool = DatabaseService.getPool();

      expect(pool).toBeDefined();
      expect(pool).toBe(mockPoolInstance);
    });

    it('should return same pool instance on multiple calls', async () => {
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();
      const pool1 = DatabaseService.getPool();
      const pool2 = DatabaseService.getPool();

      expect(pool1).toBe(pool2);
    });

    it('should return Pool with query method', async () => {
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();
      const pool = DatabaseService.getPool();

      expect(pool).toHaveProperty('query');
      expect(typeof pool.query).toBe('function');
    });
  });

  // ===========================================================================
  // Default Values - 5 test cases
  // ===========================================================================

  describe('Default Values', () => {
    it('should use default host', async () => {
      delete process.env.DB_HOST;
      
      const { Pool: MockPool } = require('pg');
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'postgres',
        })
      );
    });

    it('should use default port', async () => {
      delete process.env.DB_PORT;
      
      const { Pool: MockPool } = require('pg');
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 5432,
        })
      );
    });

    it('should use default database name', async () => {
      delete process.env.DB_NAME;
      
      const { Pool: MockPool } = require('pg');
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          database: 'tickettoken_db',
        })
      );
    });

    it('should use default user', async () => {
      delete process.env.DB_USER;
      
      const { Pool: MockPool } = require('pg');
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'postgres',
        })
      );
    });

    it('should use default password', async () => {
      delete process.env.DB_PASSWORD;
      
      const { Pool: MockPool } = require('pg');
      DatabaseService = require('../../../src/services/databaseService').DatabaseService;
      
      await DatabaseService.initialize();

      expect(MockPool).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'TicketToken2024Secure!',
        })
      );
    });
  });
});
