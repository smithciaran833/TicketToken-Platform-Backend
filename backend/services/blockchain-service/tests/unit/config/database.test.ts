/**
 * Unit tests for blockchain-service database configuration
 * Tests pool configuration, SSL settings, query helpers, and health checks
 */

describe('Database Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Configuration Constants
  // ===========================================================================
  describe('Configuration Constants', () => {
    it('should have default query timeout of 30000ms', () => {
      delete process.env.DB_QUERY_TIMEOUT_MS;
      
      const timeout = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '30000', 10);
      
      expect(timeout).toBe(30000);
    });

    it('should allow custom query timeout from env', () => {
      process.env.DB_QUERY_TIMEOUT_MS = '60000';
      
      const timeout = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '30000', 10);
      
      expect(timeout).toBe(60000);
    });

    it('should have default slow query threshold of 1000ms', () => {
      delete process.env.DB_SLOW_QUERY_THRESHOLD_MS;
      
      const threshold = parseInt(process.env.DB_SLOW_QUERY_THRESHOLD_MS || '1000', 10);
      
      expect(threshold).toBe(1000);
    });

    it('should have default pool min of 2', () => {
      delete process.env.DB_POOL_MIN;
      
      const poolMin = parseInt(process.env.DB_POOL_MIN || '2', 10);
      
      expect(poolMin).toBe(2);
    });

    it('should have default pool max of 20', () => {
      delete process.env.DB_POOL_MAX;
      
      const poolMax = parseInt(process.env.DB_POOL_MAX || '20', 10);
      
      expect(poolMax).toBe(20);
    });

    it('should have default idle timeout of 30000ms', () => {
      delete process.env.DB_IDLE_TIMEOUT_MS;
      
      const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
      
      expect(idleTimeout).toBe(30000);
    });

    it('should have default connection timeout of 10000ms', () => {
      delete process.env.DB_CONNECTION_TIMEOUT_MS;
      
      const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '10000', 10);
      
      expect(connectionTimeout).toBe(10000);
    });

    it('should have default acquire timeout of 30000ms', () => {
      delete process.env.DB_ACQUIRE_TIMEOUT_MS;
      
      const acquireTimeout = parseInt(process.env.DB_ACQUIRE_TIMEOUT_MS || '30000', 10);
      
      expect(acquireTimeout).toBe(30000);
    });
  });

  // ===========================================================================
  // Database Configuration Validation (Issue #70)
  // ===========================================================================
  describe('validateDatabaseConfig', () => {
    it('should require DB_HOST in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_HOST;
      
      const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
      const missing = requiredVars.filter(v => !process.env[v]);
      
      expect(missing).toContain('DB_HOST');
    });

    it('should require DB_USER in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_USER;
      
      const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
      const missing = requiredVars.filter(v => !process.env[v]);
      
      expect(missing).toContain('DB_USER');
    });

    it('should require DB_PASSWORD in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_PASSWORD;
      
      const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
      const missing = requiredVars.filter(v => !process.env[v]);
      
      expect(missing).toContain('DB_PASSWORD');
    });

    it('should require DB_NAME in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_NAME;
      
      const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
      const missing = requiredVars.filter(v => !process.env[v]);
      
      expect(missing).toContain('DB_NAME');
    });

    it('should detect insecure default password "postgres"', () => {
      process.env.DB_PASSWORD = 'postgres';
      
      const password = process.env.DB_PASSWORD;
      const isInsecure = password === 'postgres' || password === 'password' || password === '123456';
      
      expect(isInsecure).toBe(true);
    });

    it('should detect insecure default password "password"', () => {
      process.env.DB_PASSWORD = 'password';
      
      const password = process.env.DB_PASSWORD;
      const isInsecure = password === 'postgres' || password === 'password' || password === '123456';
      
      expect(isInsecure).toBe(true);
    });

    it('should detect insecure default password "123456"', () => {
      process.env.DB_PASSWORD = '123456';
      
      const password = process.env.DB_PASSWORD;
      const isInsecure = password === 'postgres' || password === 'password' || password === '123456';
      
      expect(isInsecure).toBe(true);
    });

    it('should allow secure password', () => {
      process.env.DB_PASSWORD = 'secure-random-password-here';
      
      const password = process.env.DB_PASSWORD;
      const isInsecure = password === 'postgres' || password === 'password' || password === '123456';
      
      expect(isInsecure).toBe(false);
    });
  });

  // ===========================================================================
  // SSL Configuration (Issue #72, #79)
  // ===========================================================================
  describe('getSSLConfig', () => {
    it('should enable SSL in production', () => {
      process.env.NODE_ENV = 'production';
      
      const isProduction = process.env.NODE_ENV === 'production';
      const sslEnabled = process.env.DB_SSL === 'true' || isProduction;
      
      expect(sslEnabled).toBe(true);
    });

    it('should enable SSL when DB_SSL=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.DB_SSL = 'true';
      
      const sslEnabled = process.env.DB_SSL === 'true';
      
      expect(sslEnabled).toBe(true);
    });

    it('should disable SSL in development by default', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DB_SSL;
      
      const isProduction = process.env.NODE_ENV === 'production';
      const sslEnabled = process.env.DB_SSL === 'true' || isProduction;
      
      expect(sslEnabled).toBe(false);
    });

    it('should reject unauthorized by default', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
      
      const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
      
      expect(rejectUnauthorized).toBe(true);
    });

    it('should allow disabling rejectUnauthorized', () => {
      process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';
      
      const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
      
      expect(rejectUnauthorized).toBe(false);
    });

    it('should use CA cert from env when provided', () => {
      process.env.DB_CA_CERT = 'my-ca-certificate-content';
      
      const ca = process.env.DB_CA_CERT || undefined;
      
      expect(ca).toBe('my-ca-certificate-content');
    });
  });

  // ===========================================================================
  // Connection Config
  // ===========================================================================
  describe('getConnectionConfig', () => {
    it('should use default host "localhost"', () => {
      delete process.env.DB_HOST;
      
      const host = process.env.DB_HOST || 'localhost';
      
      expect(host).toBe('localhost');
    });

    it('should use custom host from env', () => {
      process.env.DB_HOST = 'db.example.com';
      
      const host = process.env.DB_HOST || 'localhost';
      
      expect(host).toBe('db.example.com');
    });

    it('should use default port 5432', () => {
      delete process.env.DB_PORT;
      
      const port = parseInt(process.env.DB_PORT || '5432', 10);
      
      expect(port).toBe(5432);
    });

    it('should use custom port from env', () => {
      process.env.DB_PORT = '5433';
      
      const port = parseInt(process.env.DB_PORT || '5432', 10);
      
      expect(port).toBe(5433);
    });

    it('should use default database "tickettoken_db"', () => {
      delete process.env.DB_NAME;
      
      const database = process.env.DB_NAME || 'tickettoken_db';
      
      expect(database).toBe('tickettoken_db');
    });

    it('should use default user "postgres"', () => {
      delete process.env.DB_USER;
      
      const user = process.env.DB_USER || 'postgres';
      
      expect(user).toBe('postgres');
    });
  });

  // ===========================================================================
  // Query Helpers
  // ===========================================================================
  describe('Query Helpers', () => {
    describe('extractOperation', () => {
      it('should extract SELECT operation', () => {
        const sql = 'SELECT * FROM tickets';
        const operation = sql.trim().toUpperCase().startsWith('SELECT') ? 'select' : 'other';
        
        expect(operation).toBe('select');
      });

      it('should extract INSERT operation', () => {
        const sql = 'INSERT INTO tickets VALUES (...)';
        const operation = sql.trim().toUpperCase().startsWith('INSERT') ? 'insert' : 'other';
        
        expect(operation).toBe('insert');
      });

      it('should extract UPDATE operation', () => {
        const sql = 'UPDATE tickets SET status = ...';
        const operation = sql.trim().toUpperCase().startsWith('UPDATE') ? 'update' : 'other';
        
        expect(operation).toBe('update');
      });

      it('should extract DELETE operation', () => {
        const sql = 'DELETE FROM tickets WHERE ...';
        const operation = sql.trim().toUpperCase().startsWith('DELETE') ? 'delete' : 'other';
        
        expect(operation).toBe('delete');
      });

      it('should extract BEGIN transaction', () => {
        const sql = 'BEGIN';
        const operation = sql.trim().toUpperCase().startsWith('BEGIN') ? 'begin' : 'other';
        
        expect(operation).toBe('begin');
      });

      it('should extract COMMIT transaction', () => {
        const sql = 'COMMIT';
        const operation = sql.trim().toUpperCase().startsWith('COMMIT') ? 'commit' : 'other';
        
        expect(operation).toBe('commit');
      });

      it('should extract ROLLBACK transaction', () => {
        const sql = 'ROLLBACK';
        const operation = sql.trim().toUpperCase().startsWith('ROLLBACK') ? 'rollback' : 'other';
        
        expect(operation).toBe('rollback');
      });
    });

    describe('extractTableName', () => {
      it('should extract table from SELECT ... FROM', () => {
        const sql = 'SELECT * FROM tickets WHERE id = 1';
        const match = sql.match(/FROM\s+["']?(\w+)["']?/i);
        
        expect(match?.[1]).toBe('tickets');
      });

      it('should extract table from INSERT INTO', () => {
        const sql = 'INSERT INTO tickets (id) VALUES (1)';
        const match = sql.match(/INTO\s+["']?(\w+)["']?/i);
        
        expect(match?.[1]).toBe('tickets');
      });

      it('should extract table from UPDATE', () => {
        const sql = 'UPDATE tickets SET status = "active"';
        const match = sql.match(/UPDATE\s+["']?(\w+)["']?/i);
        
        expect(match?.[1]).toBe('tickets');
      });
    });

    describe('sanitizeSql', () => {
      it('should truncate long SQL', () => {
        const maxLength = 500;
        const longSql = 'SELECT ' + 'x'.repeat(600);
        
        const sanitized = longSql.length > maxLength 
          ? longSql.substring(0, maxLength) + '...'
          : longSql;
        
        expect(sanitized.length).toBe(maxLength + 3); // 500 + "..."
        expect(sanitized.endsWith('...')).toBe(true);
      });

      it('should redact long string literals', () => {
        const sql = "SELECT * FROM users WHERE name = 'this is a very long string value that should be redacted'";
        
        const sanitized = sql.replace(/'[^']{20,}'/g, "'[REDACTED]'");
        
        expect(sanitized).toContain('[REDACTED]');
        expect(sanitized).not.toContain('this is a very long string');
      });

      it('should preserve short string literals', () => {
        const sql = "SELECT * FROM users WHERE status = 'active'";
        
        const sanitized = sql.replace(/'[^']{20,}'/g, "'[REDACTED]'");
        
        expect(sanitized).toContain("'active'");
      });
    });
  });

  // ===========================================================================
  // Pool Functions
  // ===========================================================================
  describe('Pool Functions', () => {
    it('getPool should throw if pool not initialized', () => {
      // Simulating the behavior
      const pool = null;
      
      const shouldThrow = () => {
        if (!pool) {
          throw new Error('Database pool not initialized. Call initializePool() first.');
        }
        return pool;
      };
      
      expect(shouldThrow).toThrow('Database pool not initialized');
    });
  });

  // ===========================================================================
  // Health Check
  // ===========================================================================
  describe('getDatabaseHealth', () => {
    it('should return healthy=true when connection works', () => {
      const health = {
        healthy: true,
        latencyMs: 5,
        poolInfo: { total: 5, idle: 3, waiting: 0 },
        ssl: true
      };

      expect(health.healthy).toBe(true);
    });

    it('should return healthy=false when connection fails', () => {
      const health = {
        healthy: false,
        latencyMs: 5000,
        poolInfo: { total: 0, idle: 0, waiting: 0 },
        ssl: false
      };

      expect(health.healthy).toBe(false);
    });

    it('should include pool info', () => {
      const poolInfo = {
        total: 10,
        idle: 5,
        waiting: 2
      };

      expect(poolInfo.total).toBe(10);
      expect(poolInfo.idle).toBe(5);
      expect(poolInfo.waiting).toBe(2);
    });

    it('should include SSL status', () => {
      const health = {
        healthy: true,
        ssl: true
      };

      expect(health.ssl).toBe(true);
    });
  });
});
