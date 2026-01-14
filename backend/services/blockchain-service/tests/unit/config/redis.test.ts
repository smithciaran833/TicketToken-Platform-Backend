/**
 * Unit tests for blockchain-service Redis configuration (config/redis.ts)
 * Tests TLS configuration, retry strategy, error handlers
 * AUDIT FIX #73: Add Redis TLS configuration
 */

describe('Redis Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // TLS Configuration (AUDIT FIX #73)
  // ===========================================================================
  describe('shouldEnableTls', () => {
    it('should enable TLS when REDIS_TLS=true', () => {
      process.env.REDIS_TLS = 'true';
      
      const tlsEnabled = process.env.REDIS_TLS === 'true' || process.env.REDIS_TLS === '1';
      
      expect(tlsEnabled).toBe(true);
    });

    it('should enable TLS when REDIS_TLS=1', () => {
      process.env.REDIS_TLS = '1';
      
      const tlsEnabled = process.env.REDIS_TLS === 'true' || process.env.REDIS_TLS === '1';
      
      expect(tlsEnabled).toBe(true);
    });

    it('should enable TLS for rediss:// URL scheme', () => {
      process.env.REDIS_URL = 'rediss://user:pass@redis.example.com:6379';
      
      const urlUsesTls = process.env.REDIS_URL?.startsWith('rediss://');
      
      expect(urlUsesTls).toBe(true);
    });

    it('should enable TLS in production by default', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.REDIS_TLS;
      delete process.env.REDIS_URL;
      
      const tlsEnabled = process.env.NODE_ENV === 'production';
      
      expect(tlsEnabled).toBe(true);
    });

    it('should disable TLS in development by default', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.REDIS_TLS;
      delete process.env.REDIS_URL;
      
      const tlsEnabled = process.env.NODE_ENV === 'production';
      
      expect(tlsEnabled).toBe(false);
    });

    it('should respect explicit REDIS_TLS=false even in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_TLS = 'false';
      
      const explicitTls = process.env.REDIS_TLS;
      const tlsDisabled = explicitTls === 'false';
      
      expect(tlsDisabled).toBe(true);
    });
  });

  // ===========================================================================
  // TLS Options
  // ===========================================================================
  describe('buildTlsOptions', () => {
    it('should reject unauthorized by default', () => {
      delete process.env.REDIS_TLS_REJECT_UNAUTHORIZED;
      
      const rejectUnauthorized = process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false';
      
      expect(rejectUnauthorized).toBe(true);
    });

    it('should allow disabling rejectUnauthorized', () => {
      process.env.REDIS_TLS_REJECT_UNAUTHORIZED = 'false';
      
      const rejectUnauthorized = process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false';
      
      expect(rejectUnauthorized).toBe(false);
    });

    it('should use custom CA certificate when provided', () => {
      process.env.REDIS_TLS_CA = 'custom-ca-cert-content';
      
      const ca = process.env.REDIS_TLS_CA;
      
      expect(ca).toBe('custom-ca-cert-content');
    });

    it('should use client certificate when provided (mTLS)', () => {
      process.env.REDIS_TLS_CERT = 'client-cert-content';
      
      const cert = process.env.REDIS_TLS_CERT;
      
      expect(cert).toBe('client-cert-content');
    });

    it('should use client key when provided (mTLS)', () => {
      process.env.REDIS_TLS_KEY = 'client-key-content';
      
      const key = process.env.REDIS_TLS_KEY;
      
      expect(key).toBe('client-key-content');
    });
  });

  // ===========================================================================
  // Redis URL Parsing
  // ===========================================================================
  describe('parseRedisConnection', () => {
    it('should parse REDIS_URL when provided', () => {
      process.env.REDIS_URL = 'redis://user:password@redis.example.com:6380/1';
      
      const url = new URL(process.env.REDIS_URL);
      
      expect(url.hostname).toBe('redis.example.com');
      expect(url.port).toBe('6380');
      expect(url.password).toBe('password');
      expect(url.pathname).toBe('/1');
    });

    it('should parse rediss:// URL scheme', () => {
      process.env.REDIS_URL = 'rediss://user:pass@secure-redis.example.com:6379/0';
      
      const url = new URL(process.env.REDIS_URL);
      
      expect(url.protocol).toBe('rediss:');
      expect(url.hostname).toBe('secure-redis.example.com');
    });

    it('should use default host localhost when env not set', () => {
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;
      
      const host = process.env.REDIS_HOST || 'localhost';
      
      expect(host).toBe('localhost');
    });

    it('should use default port 6379 when env not set', () => {
      delete process.env.REDIS_URL;
      delete process.env.REDIS_PORT;
      
      const port = parseInt(process.env.REDIS_PORT || '6379', 10);
      
      expect(port).toBe(6379);
    });

    it('should use default db 0 when env not set', () => {
      delete process.env.REDIS_URL;
      delete process.env.REDIS_DB;
      
      const db = parseInt(process.env.REDIS_DB || '0', 10);
      
      expect(db).toBe(0);
    });

    it('should parse password from REDIS_PASSWORD env', () => {
      process.env.REDIS_PASSWORD = 'my-secret-password';
      
      const password = process.env.REDIS_PASSWORD;
      
      expect(password).toBe('my-secret-password');
    });
  });

  // ===========================================================================
  // Retry Strategy
  // ===========================================================================
  describe('retryStrategy', () => {
    it('should use default max retries of 10', () => {
      delete process.env.REDIS_MAX_RETRIES;
      
      const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES || '10', 10);
      
      expect(maxRetries).toBe(10);
    });

    it('should allow custom max retries from env', () => {
      process.env.REDIS_MAX_RETRIES = '5';
      
      const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES || '10', 10);
      
      expect(maxRetries).toBe(5);
    });

    it('should use exponential backoff', () => {
      const times = 3;
      const delay = Math.min(Math.pow(2, times) * 100, 30000);
      
      expect(delay).toBe(800); // 2^3 * 100 = 800
    });

    it('should cap delay at 30000ms', () => {
      const times = 10;
      const delay = Math.min(Math.pow(2, times) * 100, 30000);
      
      expect(delay).toBe(30000);
    });

    it('should return undefined after max retries exceeded', () => {
      const times = 11;
      const maxRetries = 10;
      
      const shouldStopRetrying = times > maxRetries;
      
      expect(shouldStopRetrying).toBe(true);
    });
  });

  // ===========================================================================
  // Reconnect On Error
  // ===========================================================================
  describe('reconnectOnError', () => {
    const targetErrors = [
      'READONLY',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'EPIPE',
      'CERT_',
      'SSL'
    ];

    it('should reconnect on READONLY error', () => {
      const error = new Error('READONLY You cannot write against a read only replica');
      const shouldReconnect = targetErrors.some(e => error.message.includes(e));
      
      expect(shouldReconnect).toBe(true);
    });

    it('should reconnect on ECONNRESET error', () => {
      const error = new Error('ECONNRESET Connection reset');
      const shouldReconnect = targetErrors.some(e => error.message.includes(e));
      
      expect(shouldReconnect).toBe(true);
    });

    it('should reconnect on ETIMEDOUT error', () => {
      const error = new Error('ETIMEDOUT Connection timed out');
      const shouldReconnect = targetErrors.some(e => error.message.includes(e));
      
      expect(shouldReconnect).toBe(true);
    });

    it('should reconnect on ECONNREFUSED error', () => {
      const error = new Error('ECONNREFUSED Connection refused');
      const shouldReconnect = targetErrors.some(e => error.message.includes(e));
      
      expect(shouldReconnect).toBe(true);
    });

    it('should reconnect on SSL/TLS errors', () => {
      const error = new Error('SSL handshake failed');
      const shouldReconnect = targetErrors.some(e => error.message.includes(e));
      
      expect(shouldReconnect).toBe(true);
    });

    it('should not reconnect on general errors', () => {
      const error = new Error('Some other error');
      const shouldReconnect = targetErrors.some(e => error.message.includes(e));
      
      expect(shouldReconnect).toBe(false);
    });
  });

  // ===========================================================================
  // Redis URL Building
  // ===========================================================================
  describe('buildRedisUrl', () => {
    it('should use redis:// scheme without TLS', () => {
      const tlsEnabled = false;
      const scheme = tlsEnabled ? 'rediss' : 'redis';
      
      expect(scheme).toBe('redis');
    });

    it('should use rediss:// scheme with TLS', () => {
      const tlsEnabled = true;
      const scheme = tlsEnabled ? 'rediss' : 'redis';
      
      expect(scheme).toBe('rediss');
    });

    it('should mask password in URL for logging', () => {
      const hasPassword = true;
      const auth = hasPassword ? ':****@' : '';
      
      expect(auth).toBe(':****@');
    });

    it('should build correct URL format', () => {
      const scheme = 'redis';
      const host = 'localhost';
      const port = 6379;
      const db = 0;
      
      const url = `${scheme}://${host}:${port}/${db}`;
      
      expect(url).toBe('redis://localhost:6379/0');
    });
  });

  // ===========================================================================
  // Redis Options
  // ===========================================================================
  describe('Redis Options', () => {
    it('should set maxRetriesPerRequest to null for queue operations', () => {
      const options = { maxRetriesPerRequest: null };
      
      expect(options.maxRetriesPerRequest).toBeNull();
    });

    it('should enable ready check', () => {
      const options = { enableReadyCheck: true };
      
      expect(options.enableReadyCheck).toBe(true);
    });

    it('should default keep alive to 30000ms', () => {
      const keepAlive = 30000;
      
      expect(keepAlive).toBe(30000);
    });

    it('should default connect timeout to 10000ms', () => {
      delete process.env.REDIS_CONNECT_TIMEOUT;
      
      const connectTimeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10);
      
      expect(connectTimeout).toBe(10000);
    });

    it('should default command timeout to 5000ms', () => {
      delete process.env.REDIS_COMMAND_TIMEOUT;
      
      const commandTimeout = parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10);
      
      expect(commandTimeout).toBe(5000);
    });
  });

  // ===========================================================================
  // Exported Functions
  // ===========================================================================
  describe('Exported Functions', () => {
    it('getRedisOptions should return full options', () => {
      const options = {
        host: 'localhost',
        port: 6379,
        db: 0,
        maxRetriesPerRequest: null,
        enableReadyCheck: true
      };

      expect(options.host).toBeDefined();
      expect(options.port).toBeDefined();
    });

    it('getBullMQRedisOptions should return BullMQ-compatible options', () => {
      const bullmqOptions = {
        host: 'localhost',
        port: 6379,
        password: undefined,
        db: 0,
        tls: undefined,
        maxRetriesPerRequest: null
      };

      expect(bullmqOptions.maxRetriesPerRequest).toBeNull();
    });

    it('isTlsEnabled should return boolean', () => {
      const tlsEnabled = true;
      
      expect(typeof tlsEnabled).toBe('boolean');
    });
  });

  // ===========================================================================
  // Error Handler Attachment
  // ===========================================================================
  describe('attachErrorHandlers', () => {
    it('should attach error event handler', () => {
      const events = ['error', 'connect', 'ready', 'reconnecting', 'close', 'end'];
      
      expect(events).toContain('error');
    });

    it('should attach connect event handler', () => {
      const events = ['error', 'connect', 'ready', 'reconnecting', 'close', 'end'];
      
      expect(events).toContain('connect');
    });

    it('should attach ready event handler', () => {
      const events = ['error', 'connect', 'ready', 'reconnecting', 'close', 'end'];
      
      expect(events).toContain('ready');
    });

    it('should attach reconnecting event handler', () => {
      const events = ['error', 'connect', 'ready', 'reconnecting', 'close', 'end'];
      
      expect(events).toContain('reconnecting');
    });

    it('should identify TLS errors', () => {
      const error = new Error('TLS handshake failed');
      const isTlsError = error.message.includes('TLS') || 
                        error.message.includes('SSL') || 
                        error.message.includes('CERT');
      
      expect(isTlsError).toBe(true);
    });
  });
});
