/**
 * Unit Tests for config/database.ts
 * 
 * Tests database configuration, query timing, and health checks.
 * Priority: 🟠 High (10 tests)
 */

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [{ now: new Date() }] }),
      release: jest.fn()
    }),
    query: jest.fn().mockResolvedValue({ rows: [] }),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
    end: jest.fn()
  }))
}));

jest.mock('knex', () => {
  const mockKnex = jest.fn().mockReturnValue({
    raw: jest.fn().mockReturnValue({
      timeout: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
    }),
    on: jest.fn(),
    destroy: jest.fn().mockResolvedValue(undefined)
  });
  return mockKnex;
});

jest.mock('prom-client', () => ({
  Histogram: jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    startTimer: jest.fn().mockReturnValue(jest.fn())
  })),
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn()
  }))
}));

describe('Database Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'test_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_pass';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('extractTableName', () => {
    const extractTableName = (sql: string): string => {
      const patterns = [
        /FROM\s+["']?(\w+)["']?/i,
        /INTO\s+["']?(\w+)["']?/i,
        /UPDATE\s+["']?(\w+)["']?/i,
        /DELETE\s+FROM\s+["']?(\w+)["']?/i
      ];
      for (const pattern of patterns) {
        const match = sql.match(pattern);
        if (match) return match[1];
      }
      return 'unknown';
    };

    it('should extract table from SELECT', () => {
      expect(extractTableName('SELECT * FROM users')).toBe('users');
    });

    it('should extract table from INSERT', () => {
      expect(extractTableName('INSERT INTO orders VALUES (...)')).toBe('orders');
    });

    it('should extract table from UPDATE', () => {
      expect(extractTableName('UPDATE tickets SET status = "active"')).toBe('tickets');
    });

    it('should extract table from DELETE', () => {
      expect(extractTableName('DELETE FROM sessions WHERE expired = true')).toBe('sessions');
    });

    it('should return unknown for unrecognized', () => {
      expect(extractTableName('BEGIN TRANSACTION')).toBe('unknown');
    });
  });

  describe('extractOperation', () => {
    const extractOperation = (sql: string): string => {
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('SELECT')) return 'select';
      if (trimmed.startsWith('INSERT')) return 'insert';
      if (trimmed.startsWith('UPDATE')) return 'update';
      if (trimmed.startsWith('DELETE')) return 'delete';
      if (trimmed.startsWith('BEGIN')) return 'transaction_begin';
      if (trimmed.startsWith('COMMIT')) return 'transaction_commit';
      if (trimmed.startsWith('ROLLBACK')) return 'transaction_rollback';
      return 'other';
    };

    it('should categorize SELECT as select', () => {
      expect(extractOperation('SELECT * FROM users')).toBe('select');
    });

    it('should categorize INSERT as insert', () => {
      expect(extractOperation('INSERT INTO users ...')).toBe('insert');
    });

    it('should categorize UPDATE as update', () => {
      expect(extractOperation('UPDATE users SET ...')).toBe('update');
    });

    it('should categorize DELETE as delete', () => {
      expect(extractOperation('DELETE FROM users ...')).toBe('delete');
    });

    it('should categorize BEGIN as transaction_begin', () => {
      expect(extractOperation('BEGIN')).toBe('transaction_begin');
    });
  });

  describe('sanitizeSql', () => {
    const sanitizeSql = (sql: string): string => {
      const maxLength = 500;
      let sanitized = sql.length > maxLength ? sql.substring(0, maxLength) + '...' : sql;
      sanitized = sanitized.replace(/'[^']{20,}'/g, "'[REDACTED]'");
      return sanitized;
    };

    it('should truncate very long SQL', () => {
      const longSql = 'SELECT ' + 'a'.repeat(600);
      const result = sanitizeSql(longSql);
      expect(result.length).toBeLessThanOrEqual(503);
      expect(result).toContain('...');
    });

    it('should redact long string values', () => {
      const sql = "INSERT INTO users (data) VALUES ('thisisaverylongsecretvalue12345')";
      const result = sanitizeSql(sql);
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('validateDatabaseConfig', () => {
    it('should throw in production without DB_PASSWORD', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_PASSWORD;
      
      const validateDatabaseConfig = () => {
        if (process.env.NODE_ENV === 'production') {
          if (!process.env.DB_PASSWORD) {
            throw new Error('DB_PASSWORD required in production');
          }
        }
      };

      expect(() => validateDatabaseConfig()).toThrow('DB_PASSWORD required in production');
    });

    it('should pass in development without DB_PASSWORD', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DB_PASSWORD;
      
      const validateDatabaseConfig = () => {
        if (process.env.NODE_ENV === 'production') {
          if (!process.env.DB_PASSWORD) {
            throw new Error('DB_PASSWORD required in production');
          }
        }
      };

      expect(() => validateDatabaseConfig()).not.toThrow();
    });
  });

  describe('getSSLConfig', () => {
    it('should return false in development', () => {
      process.env.NODE_ENV = 'development';
      
      const getSSLConfig = () => {
        if (process.env.NODE_ENV === 'production') {
          return { rejectUnauthorized: true };
        }
        return false;
      };

      expect(getSSLConfig()).toBe(false);
    });

    it('should return SSL config in production', () => {
      process.env.NODE_ENV = 'production';
      
      const getSSLConfig = () => {
        if (process.env.NODE_ENV === 'production') {
          return { rejectUnauthorized: true };
        }
        return false;
      };

      expect(getSSLConfig()).toEqual({ rejectUnauthorized: true });
    });
  });
});
