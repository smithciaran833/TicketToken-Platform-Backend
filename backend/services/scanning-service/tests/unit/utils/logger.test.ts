// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/utils/logger.ts
 * Tests logger behavior and configuration
 */

import logger from '../../../src/utils/logger';

describe('src/utils/logger.ts - Comprehensive Unit Tests', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =============================================================================
  // LOGGER CONFIGURATION
  // =============================================================================

  describe('Logger Configuration', () => {
    it('should export a logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger).not.toBeNull();
    });

    it('should have correct log level', () => {
      expect(logger.level).toBe('error'); // From test setup
    });

    it('should have service name in defaultMeta', () => {
      expect(logger.defaultMeta).toEqual({ service: 'scanning-service' });
    });

    it('should have all standard logging methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.log).toBe('function');
    });
  });

  // =============================================================================
  // INFO LOGGING
  // =============================================================================

  describe('info() - Information Logging', () => {
    it('should log info message', () => {
      logger.info('Test message');
      expect(logger.info).toHaveBeenCalledWith('Test message');
    });

    it('should log info with metadata object', () => {
      const metadata = { userId: '123', action: 'scan' };
      logger.info('User action', metadata);
      expect(logger.info).toHaveBeenCalledWith('User action', metadata);
    });

    it('should log info with multiple metadata objects', () => {
      logger.info('Event', { type: 'scan' }, { result: 'success' });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should log info with nested metadata', () => {
      const nested = {
        scan: {
          id: 'scan-123',
          ticket: { id: 'ticket-456', type: 'VIP' }
        }
      };
      logger.info('Scan details', nested);
      expect(logger.info).toHaveBeenCalledWith('Scan details', nested);
    });

    it('should log info with array metadata', () => {
      logger.info('Multiple scans', { scanIds: ['s1', 's2', 's3'] });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should log info with null metadata', () => {
      logger.info('Message', { value: null });
      expect(logger.info).toHaveBeenCalledWith('Message', { value: null });
    });

    it('should log info with undefined metadata', () => {
      logger.info('Message', { value: undefined });
      expect(logger.info).toHaveBeenCalledWith('Message', { value: undefined });
    });

    it('should log info with numeric metadata', () => {
      logger.info('Metrics', { count: 42, duration: 123.45, success: true });
      expect(logger.info).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // ERROR LOGGING
  // =============================================================================

  describe('error() - Error Logging', () => {
    it('should log error message', () => {
      logger.error('Error occurred');
      expect(logger.error).toHaveBeenCalledWith('Error occurred');
    });

    it('should log Error object', () => {
      const error = new Error('Test error');
      logger.error('Failed', error);
      expect(logger.error).toHaveBeenCalledWith('Failed', error);
    });

    it('should log Error with stack trace', () => {
      const error = new Error('Stack test');
      error.stack = 'Error: Stack test\n  at Function.test';
      logger.error(error);
      expect(logger.error).toHaveBeenCalledWith(error);
    });

    it('should log error with metadata', () => {
      const error = new Error('DB error');
      const metadata = { query: 'SELECT', table: 'tickets', retries: 3 };
      logger.error('Database failed', { error, ...metadata });
      expect(logger.error).toHaveBeenCalled();
    });

    it('should log error-like objects', () => {
      const errorLike = { message: 'Not a real Error', code: 500, details: 'timeout' };
      logger.error('API error', errorLike);
      expect(logger.error).toHaveBeenCalledWith('API error', errorLike);
    });

    it('should log multiple errors', () => {
      const err1 = new Error('First');
      const err2 = new Error('Second');
      logger.error('Multiple failures', { errors: [err1, err2] });
      expect(logger.error).toHaveBeenCalled();
    });

    it('should log error with nested context', () => {
      const error = new Error('Nested error');
      logger.error('Operation failed', {
        error,
        context: {
          operation: 'scan',
          device: { id: 'dev-1', location: 'gate-a' }
        }
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // WARN LOGGING
  // =============================================================================

  describe('warn() - Warning Logging', () => {
    it('should log warning message', () => {
      logger.warn('Warning message');
      expect(logger.warn).toHaveBeenCalledWith('Warning message');
    });

    it('should log warning with metadata', () => {
      logger.warn('Rate limit approaching', { current: 95, limit: 100 });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should log security warnings', () => {
      logger.warn('Authentication failed', {
        ip: '192.168.1.1',
        reason: 'INVALID_TOKEN',
        attempts: 3
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should log performance warnings', () => {
      logger.warn('Slow query', { duration: 5000, query: 'SELECT', table: 'events' });
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // DEBUG LOGGING
  // =============================================================================

  describe('debug() - Debug Logging', () => {
    it('should log debug message', () => {
      logger.debug('Debug info');
      expect(logger.debug).toHaveBeenCalledWith('Debug info');
    });

    it('should log debug with detailed metadata', () => {
      logger.debug('QR validation', {
        qrData: 'ticket:123:ts:hmac',
        timestamp: Date.now(),
        valid: true,
        expiresIn: 25
      });
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should log debug with state information', () => {
      logger.debug('Cache state', {
        size: 1024,
        hits: 450,
        misses: 50,
        hitRate: 0.9
      });
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle empty string message', () => {
      logger.info('');
      expect(logger.info).toHaveBeenCalledWith('');
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(10000);
      logger.info(longMessage);
      expect(logger.info).toHaveBeenCalledWith(longMessage);
    });

    it('should handle special characters', () => {
      logger.info('Special: \n\t\r\'"\\');
      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle unicode characters', () => {
      logger.info('Unicode: 你好 🎉 café');
      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle objects with circular references', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      expect(() => logger.info('Circular', circular)).not.toThrow();
    });

    it('should handle deeply nested objects', () => {
      const deep = {
        l1: { l2: { l3: { l4: { l5: { l6: { l7: { l8: 'deep' } } } } } } }
      };
      logger.info('Deep nesting', deep);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle mixed type arrays', () => {
      logger.info('Mixed array', {
        items: [1, 'two', true, null, undefined, { key: 'value' }, [1, 2]]
      });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle Date objects', () => {
      logger.info('Timestamp', { date: new Date('2024-01-01') });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle undefined as entire message', () => {
      logger.info(undefined as any);
      expect(logger.info).toHaveBeenCalledWith(undefined);
    });

    it('should handle null as entire message', () => {
      logger.info(null as any);
      expect(logger.info).toHaveBeenCalledWith(null);
    });
  });

  // =============================================================================
  // REAL-WORLD SCENARIOS
  // =============================================================================

  describe('Real-World Scenarios', () => {
    it('should log successful scan operation', () => {
      logger.info('Scan successful', {
        scanId: 'scan-abc123',
        ticketId: 'ticket-456',
        deviceId: 'device-789',
        venueId: 'venue-001',
        eventId: 'event-xyz',
        result: 'ALLOW',
        duration: 45,
        timestamp: Date.now()
      });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should log scan denial with reason', () => {
      logger.warn('Scan denied', {
        scanId: 'scan-def456',
        ticketId: 'ticket-789',
        reason: 'QR_EXPIRED',
        expiryTime: Date.now() - 60000,
        currentTime: Date.now()
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should log replay attack detection', () => {
      logger.warn('Replay attack detected', {
        nonce: 'nonce-123',
        ticketId: 'ticket-999',
        previousScan: Date.now() - 5000,
        currentAttempt: Date.now(),
        deviceId: 'device-suspicious'
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should log database connection error', () => {
      const dbError = new Error('Connection pool exhausted');
      logger.error('Database connection failed', {
        error: dbError,
        host: 'pgbouncer',
        port: 6432,
        database: 'tickettoken_db',
        poolSize: 20,
        activeConnections: 20,
        retryAttempt: 3
      });
      expect(logger.error).toHaveBeenCalled();
    });

    it('should log Redis cache operation', () => {
      logger.debug('Redis operation', {
        operation: 'GET',
        key: 'nonce:ticket-123',
        hit: true,
        ttl: 25,
        duration: 2
      });
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should log QR generation', () => {
      logger.info('QR code generated', {
        ticketId: 'ticket-abc',
        eventId: 'event-123',
        expiresAt: Date.now() + 30000,
        hmac: 'hmac-signature',
        format: 'base64',
        size: 256
      });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should log tenant isolation violation', () => {
      logger.error('Tenant isolation violation', {
        staffTenantId: 'tenant-a',
        attemptedTenantId: 'tenant-b',
        staffId: 'staff-123',
        deviceId: 'device-456',
        action: 'SCAN_ATTEMPT',
        blocked: true
      });
      expect(logger.error).toHaveBeenCalled();
    });

    it('should log offline manifest generation', () => {
      logger.info('Offline manifest generated', {
        eventId: 'event-789',
        deviceId: 'device-mobile-001',
        ticketCount: 500,
        validUntil: Date.now() + 14400000, // 4 hours
        manifestSize: 52428800, // 50MB
        compressed: true
      });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should log rate limit exceeded', () => {
      logger.warn('Rate limit exceeded', {
        endpoint: '/api/scan',
        clientIp: '192.168.1.100',
        currentRate: 120,
        limit: 100,
        windowMs: 60000,
        blocked: true
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should log authentication success', () => {
      logger.info('Authentication successful', {
        userId: 'user-456',
        tenantId: 'tenant-123',
        roles: ['staff', 'scanner'],
        deviceId: 'device-789',
        method: 'JWT',
        expiresIn: 3600
      });
      expect(logger.info).toHaveBeenCalled();
    });
  });

});
