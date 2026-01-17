// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database.config', () => ({
  getPool: jest.fn(),
}));

import { IdempotencyService } from '../../../src/services/idempotency.service';
import { getPool } from '../../../src/config/database.config';
import { logger } from '../../../src/utils/logger';
import crypto from 'crypto';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockPool: {
    query: jest.Mock;
  };

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
    (getPool as jest.Mock).mockReturnValue(mockPool);
    service = new IdempotencyService();
  });

  describe('constructor', () => {
    it('should initialize with database pool', () => {
      expect(getPool).toHaveBeenCalled();
    });
  });

  describe('generateKey', () => {
    describe('payment-process', () => {
      it('should generate key with venueId, userId, eventId, and amount', () => {
        const data = {
          venueId: 'venue-123',
          userId: 'user-456',
          eventId: 'event-789',
          amount: 9999,
        };

        const key = service.generateKey('payment-process', data);

        expect(key).toBe('payment-venue-123-user-456-event-789-9999');
      });

      it('should generate different keys for different amounts', () => {
        const baseData = {
          venueId: 'venue-123',
          userId: 'user-456',
          eventId: 'event-789',
        };

        const key1 = service.generateKey('payment-process', { ...baseData, amount: 100 });
        const key2 = service.generateKey('payment-process', { ...baseData, amount: 200 });

        expect(key1).not.toBe(key2);
      });

      it('should generate consistent keys for same input', () => {
        const data = {
          venueId: 'venue-123',
          userId: 'user-456',
          eventId: 'event-789',
          amount: 5000,
        };

        const key1 = service.generateKey('payment-process', data);
        const key2 = service.generateKey('payment-process', data);

        expect(key1).toBe(key2);
      });

      it('should handle undefined fields gracefully', () => {
        const data = {
          venueId: undefined,
          userId: 'user-456',
          eventId: 'event-789',
          amount: 100,
        };

        const key = service.generateKey('payment-process', data);

        expect(key).toBe('payment-undefined-user-456-event-789-100');
      });
    });

    describe('refund-process', () => {
      it('should generate key with transactionId', () => {
        const data = { transactionId: 'txn-abc-123' };

        const key = service.generateKey('refund-process', data);

        expect(key).toBe('refund-txn-abc-123');
      });

      it('should generate unique keys for different transactions', () => {
        const key1 = service.generateKey('refund-process', { transactionId: 'txn-1' });
        const key2 = service.generateKey('refund-process', { transactionId: 'txn-2' });

        expect(key1).not.toBe(key2);
      });
    });

    describe('nft-mint', () => {
      it('should generate key with eventId and seatId when provided', () => {
        const data = {
          eventId: 'event-123',
          seatId: 'seat-A1',
        };

        const key = service.generateKey('nft-mint', data);

        expect(key).toBe('nft-event-123-seat-A1');
      });

      it('should generate key with eventId and ticketId when seatId is not provided', () => {
        const data = {
          eventId: 'event-123',
          ticketId: 'ticket-456',
        };

        const key = service.generateKey('nft-mint', data);

        expect(key).toBe('nft-event-123-ticket-456');
      });

      it('should prefer seatId over ticketId when both are provided', () => {
        const data = {
          eventId: 'event-123',
          seatId: 'seat-A1',
          ticketId: 'ticket-456',
        };

        const key = service.generateKey('nft-mint', data);

        expect(key).toBe('nft-event-123-seat-A1');
      });

      it('should handle missing both seatId and ticketId', () => {
        const data = { eventId: 'event-123' };

        const key = service.generateKey('nft-mint', data);

        expect(key).toBe('nft-event-123-undefined');
      });
    });

    describe('payout-process', () => {
      it('should generate key with venueId and period when provided', () => {
        const data = {
          venueId: 'venue-123',
          period: '2024-01',
        };

        const key = service.generateKey('payout-process', data);

        expect(key).toBe('payout-venue-123-2024-01');
      });

      it('should generate key with venueId and payoutId when period is not provided', () => {
        const data = {
          venueId: 'venue-123',
          payoutId: 'payout-456',
        };

        const key = service.generateKey('payout-process', data);

        expect(key).toBe('payout-venue-123-payout-456');
      });

      it('should prefer period over payoutId when both are provided', () => {
        const data = {
          venueId: 'venue-123',
          period: '2024-01',
          payoutId: 'payout-456',
        };

        const key = service.generateKey('payout-process', data);

        expect(key).toBe('payout-venue-123-2024-01');
      });
    });

    describe('send-email', () => {
      let originalDate: DateConstructor;

      beforeEach(() => {
        originalDate = global.Date;
      });

      afterEach(() => {
        global.Date = originalDate;
        jest.restoreAllMocks();
      });

      it('should generate key with template, recipient, and date', () => {
        const mockDate = new originalDate('2024-06-15T10:30:00.000Z');
        global.Date = jest.fn(() => mockDate) as any;
        global.Date.now = originalDate.now;

        const data = {
          template: 'welcome',
          to: 'user@example.com',
        };

        const key = service.generateKey('send-email', data);

        expect(key).toBe('email-welcome-user@example.com-2024-06-15');
      });

      it('should allow same email to be sent on different days', () => {
        const data = {
          template: 'newsletter',
          to: 'user@example.com',
        };

        // First day
        const mockDate1 = new originalDate('2024-06-15T10:30:00.000Z');
        global.Date = jest.fn(() => mockDate1) as any;
        global.Date.now = originalDate.now;
        const key1 = service.generateKey('send-email', data);

        // Second day
        const mockDate2 = new originalDate('2024-06-16T10:30:00.000Z');
        global.Date = jest.fn(() => mockDate2) as any;
        global.Date.now = originalDate.now;
        const key2 = service.generateKey('send-email', data);

        expect(key1).toBe('email-newsletter-user@example.com-2024-06-15');
        expect(key2).toBe('email-newsletter-user@example.com-2024-06-16');
        expect(key1).not.toBe(key2);
      });

      it('should generate same key for same email on same day', () => {
        const mockDate = new originalDate('2024-06-15T10:30:00.000Z');
        global.Date = jest.fn(() => mockDate) as any;
        global.Date.now = originalDate.now;

        const data = {
          template: 'reminder',
          to: 'user@example.com',
        };

        const key1 = service.generateKey('send-email', data);
        const key2 = service.generateKey('send-email', data);

        expect(key1).toBe(key2);
      });

      it('should differentiate by template', () => {
        const mockDate = new originalDate('2024-06-15T10:30:00.000Z');
        global.Date = jest.fn(() => mockDate) as any;
        global.Date.now = originalDate.now;

        const key1 = service.generateKey('send-email', { template: 'welcome', to: 'user@example.com' });
        const key2 = service.generateKey('send-email', { template: 'reminder', to: 'user@example.com' });

        expect(key1).not.toBe(key2);
      });

      it('should differentiate by recipient', () => {
        const mockDate = new originalDate('2024-06-15T10:30:00.000Z');
        global.Date = jest.fn(() => mockDate) as any;
        global.Date.now = originalDate.now;

        const key1 = service.generateKey('send-email', { template: 'welcome', to: 'user1@example.com' });
        const key2 = service.generateKey('send-email', { template: 'welcome', to: 'user2@example.com' });

        expect(key1).not.toBe(key2);
      });
    });

    describe('send-sms', () => {
      let originalDate: DateConstructor;

      beforeEach(() => {
        originalDate = global.Date;
        // Mock Date to return hour 14
        const mockDate = {
          getHours: jest.fn().mockReturnValue(14),
          toISOString: jest.fn().mockReturnValue('2024-06-15T14:30:00.000Z'),
        };
        global.Date = jest.fn(() => mockDate) as any;
        global.Date.now = originalDate.now;
      });

      afterEach(() => {
        global.Date = originalDate;
      });

      it('should generate key with recipient, template, and hour', () => {
        const data = {
          to: '+1234567890',
          template: 'verification',
        };

        const key = service.generateKey('send-sms', data);

        expect(key).toBe('sms-+1234567890-verification-14');
      });

      it('should allow same SMS to different hours', () => {
        const data = {
          to: '+1234567890',
          template: 'alert',
        };

        // Hour 14
        const mockDate14 = { getHours: jest.fn().mockReturnValue(14) };
        global.Date = jest.fn(() => mockDate14) as any;
        const key1 = service.generateKey('send-sms', data);

        // Hour 15
        const mockDate15 = { getHours: jest.fn().mockReturnValue(15) };
        global.Date = jest.fn(() => mockDate15) as any;
        const key2 = service.generateKey('send-sms', data);

        expect(key1).not.toBe(key2);
      });

      it('should block duplicate SMS within same hour', () => {
        const data = {
          to: '+1234567890',
          template: 'alert',
        };

        const key1 = service.generateKey('send-sms', data);
        const key2 = service.generateKey('send-sms', data);

        expect(key1).toBe(key2);
      });
    });

    describe('analytics-event', () => {
      it('should generate key with eventType, venueId, userId, and timestamp', () => {
        const data = {
          eventType: 'page_view',
          venueId: 'venue-123',
          userId: 'user-456',
          timestamp: 1718450000000,
        };

        const key = service.generateKey('analytics-event', data);

        expect(key).toBe('analytics-page_view-venue-123-user-456-1718450000000');
      });

      it('should use "global" when venueId is not provided', () => {
        const data = {
          eventType: 'system_event',
          userId: 'user-456',
          timestamp: 1718450000000,
        };

        const key = service.generateKey('analytics-event', data);

        expect(key).toBe('analytics-system_event-global-user-456-1718450000000');
      });

      it('should use "anonymous" when userId is not provided', () => {
        const data = {
          eventType: 'page_view',
          venueId: 'venue-123',
          timestamp: 1718450000000,
        };

        const key = service.generateKey('analytics-event', data);

        expect(key).toBe('analytics-page_view-venue-123-anonymous-1718450000000');
      });

      it('should use both defaults when neither venueId nor userId provided', () => {
        const data = {
          eventType: 'app_start',
          timestamp: 1718450000000,
        };

        const key = service.generateKey('analytics-event', data);

        expect(key).toBe('analytics-app_start-global-anonymous-1718450000000');
      });

      it('should differentiate by timestamp', () => {
        const baseData = {
          eventType: 'click',
          venueId: 'venue-123',
          userId: 'user-456',
        };

        const key1 = service.generateKey('analytics-event', { ...baseData, timestamp: 1000 });
        const key2 = service.generateKey('analytics-event', { ...baseData, timestamp: 2000 });

        expect(key1).not.toBe(key2);
      });
    });

    describe('unknown job types (default case)', () => {
      it('should generate SHA256 hash for unknown job types', () => {
        const data = { foo: 'bar', baz: 123 };

        const key = service.generateKey('unknown-job-type', data);

        // Verify it's a valid hex string (SHA256 produces 64 hex chars)
        expect(key).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should generate consistent hash for same input', () => {
        const data = { foo: 'bar' };

        const key1 = service.generateKey('custom-job', data);
        const key2 = service.generateKey('custom-job', data);

        expect(key1).toBe(key2);
      });

      it('should generate different hashes for different job types', () => {
        const data = { foo: 'bar' };

        const key1 = service.generateKey('custom-job-a', data);
        const key2 = service.generateKey('custom-job-b', data);

        expect(key1).not.toBe(key2);
      });

      it('should generate different hashes for different data', () => {
        const key1 = service.generateKey('custom-job', { value: 1 });
        const key2 = service.generateKey('custom-job', { value: 2 });

        expect(key1).not.toBe(key2);
      });

      it('should handle empty data object', () => {
        const key = service.generateKey('custom-job', {});

        expect(key).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should handle complex nested data', () => {
        const data = {
          level1: {
            level2: {
              level3: 'deep',
            },
          },
          array: [1, 2, 3],
        };

        const key = service.generateKey('complex-job', data);

        expect(key).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should produce correct hash value', () => {
        const jobType = 'test-job';
        const data = { test: 'data' };

        // Manually compute expected hash
        const hash = crypto.createHash('sha256');
        hash.update(jobType);
        hash.update(JSON.stringify(data));
        const expectedKey = hash.digest('hex');

        const key = service.generateKey(jobType, data);

        expect(key).toBe(expectedKey);
      });
    });
  });

  describe('check', () => {
    it('should return cached result when key exists and not expired', async () => {
      const cachedResult = { success: true, transactionId: 'txn-123' };
      mockPool.query.mockResolvedValue({
        rows: [{ result: cachedResult }],
      });

      const result = await service.check('payment-venue-123-user-456-event-789-100');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT result FROM queue_idempotency_keys WHERE key = $1 AND expires_at > NOW()',
        ['payment-venue-123-user-456-event-789-100']
      );
      expect(result).toEqual(cachedResult);
    });

    it('should log idempotency hit when key found', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ result: { success: true } }],
      });

      await service.check('test-key');

      expect(logger.info).toHaveBeenCalledWith('Idempotency hit (PostgreSQL): test-key');
    });

    it('should return null when key does not exist', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.check('nonexistent-key');

      expect(result).toBeNull();
    });

    it('should not log when key not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.check('nonexistent-key');

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should return null for expired keys (handled by query)', async () => {
      // The SQL query includes expires_at > NOW(), so expired keys won't be returned
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.check('expired-key');

      expect(result).toBeNull();
    });

    it('should handle complex result objects', async () => {
      const complexResult = {
        success: true,
        data: {
          transactionId: 'txn-123',
          amount: 9999,
          metadata: {
            source: 'api',
            version: '2.0',
          },
        },
        timestamps: {
          created: '2024-06-15T10:00:00Z',
          processed: '2024-06-15T10:00:01Z',
        },
      };
      mockPool.query.mockResolvedValue({
        rows: [{ result: complexResult }],
      });

      const result = await service.check('complex-key');

      expect(result).toEqual(complexResult);
    });

    it('should propagate database errors', async () => {
      const dbError = new Error('Connection refused');
      mockPool.query.mockRejectedValue(dbError);

      await expect(service.check('any-key')).rejects.toThrow('Connection refused');
    });

    it('should handle null result stored in database', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ result: null }],
      });

      const result = await service.check('null-result-key');

      expect(result).toBeNull();
      expect(logger.info).toHaveBeenCalledWith('Idempotency hit (PostgreSQL): null-result-key');
    });
  });

  describe('store', () => {
    let originalDateNow: () => number;
    const fixedNow = 1718450000000; // Fixed timestamp for testing

    beforeEach(() => {
      originalDateNow = Date.now;
      Date.now = jest.fn(() => fixedNow);
      mockPool.query.mockResolvedValue({ rows: [] });
    });

    afterEach(() => {
      Date.now = originalDateNow;
    });

    it('should store idempotency key with default TTL', async () => {
      const result = { success: true, transactionId: 'txn-123' };

      await service.store('test-key', 'money', 'payment-process', result);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO queue_idempotency_keys'),
        [
          'test-key',
          'money',
          'payment-process',
          result,
          new Date(fixedNow + 86400 * 1000), // Default TTL is 24 hours
        ]
      );
    });

    it('should store idempotency key with custom TTL', async () => {
      const result = { success: true };
      const customTTL = 3600; // 1 hour

      await service.store('test-key', 'communication', 'send-email', result, customTTL);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [
          'test-key',
          'communication',
          'send-email',
          result,
          new Date(fixedNow + customTTL * 1000),
        ]
      );
    });

    it('should use upsert to handle duplicate keys', async () => {
      await service.store('key', 'queue', 'type', { data: 'test' });

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('ON CONFLICT (key) DO UPDATE');
      expect(query).toContain('SET result = $4, processed_at = NOW()');
    });

    it('should log storage confirmation', async () => {
      await service.store('my-key', 'money', 'payment', { success: true }, 7200);

      expect(logger.info).toHaveBeenCalledWith('Idempotency stored: my-key for 7200s');
    });

    it('should log with default TTL in message', async () => {
      await service.store('my-key', 'money', 'payment', { success: true });

      expect(logger.info).toHaveBeenCalledWith('Idempotency stored: my-key for 86400s');
    });

    it('should handle null result', async () => {
      await service.store('null-key', 'background', 'analytics', null);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['null-key', 'background', 'analytics', null, expect.any(Date)])
      );
    });

    it('should handle complex result objects', async () => {
      const complexResult = {
        success: true,
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
      };

      await service.store('complex-key', 'money', 'payment', complexResult);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([complexResult])
      );
    });

    it('should propagate database errors', async () => {
      const dbError = new Error('Unique constraint violation');
      mockPool.query.mockRejectedValue(dbError);

      await expect(
        service.store('error-key', 'money', 'payment', { success: true })
      ).rejects.toThrow('Unique constraint violation');
    });

    it('should calculate correct expiration time', async () => {
      const ttl = 1800; // 30 minutes

      await service.store('expiry-key', 'queue', 'type', {}, ttl);

      const expectedExpiry = new Date(fixedNow + ttl * 1000);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expectedExpiry])
      );
    });

    it('should include all required fields in insert', async () => {
      await service.store('full-key', 'money', 'refund-process', { refunded: true });

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('key');
      expect(query).toContain('queue_name');
      expect(query).toContain('job_type');
      expect(query).toContain('result');
      expect(query).toContain('processed_at');
      expect(query).toContain('expires_at');
    });
  });

  describe('cleanup', () => {
    it('should delete expired keys', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 5 });

      await service.cleanup();

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM queue_idempotency_keys WHERE expires_at < NOW()'
      );
    });

    it('should log number of deleted keys', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 42 });

      await service.cleanup();

      expect(logger.info).toHaveBeenCalledWith('Cleaned up 42 expired idempotency keys');
    });

    it('should log zero when no keys deleted', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });

      await service.cleanup();

      expect(logger.info).toHaveBeenCalledWith('Cleaned up 0 expired idempotency keys');
    });

    it('should handle null rowCount gracefully', async () => {
      mockPool.query.mockResolvedValue({ rowCount: null });

      await service.cleanup();

      expect(logger.info).toHaveBeenCalledWith('Cleaned up null expired idempotency keys');
    });

    it('should propagate database errors', async () => {
      const dbError = new Error('Database timeout');
      mockPool.query.mockRejectedValue(dbError);

      await expect(service.cleanup()).rejects.toThrow('Database timeout');
    });
  });

  describe('integration scenarios', () => {
    it('should prevent duplicate payment processing', async () => {
      const paymentData = {
        venueId: 'venue-123',
        userId: 'user-456',
        eventId: 'event-789',
        amount: 5000,
      };

      // Generate key for the payment
      const key = service.generateKey('payment-process', paymentData);
      expect(key).toBe('payment-venue-123-user-456-event-789-5000');

      // First check - no existing record
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const firstCheck = await service.check(key);
      expect(firstCheck).toBeNull();

      // Store the result after processing
      const result = { success: true, transactionId: 'txn-abc' };
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await service.store(key, 'money', 'payment-process', result);

      // Second check - should find existing record
      mockPool.query.mockResolvedValueOnce({ rows: [{ result }] });
      const secondCheck = await service.check(key);
      expect(secondCheck).toEqual(result);
    });

    it('should allow retries with different amounts', async () => {
      const baseData = {
        venueId: 'venue-123',
        userId: 'user-456',
        eventId: 'event-789',
      };

      const key1 = service.generateKey('payment-process', { ...baseData, amount: 100 });
      const key2 = service.generateKey('payment-process', { ...baseData, amount: 150 });

      expect(key1).not.toBe(key2);
    });

    it('should handle NFT minting idempotency correctly', async () => {
      const mintData = {
        eventId: 'concert-2024',
        seatId: 'A-15',
      };

      const key = service.generateKey('nft-mint', mintData);
      expect(key).toBe('nft-concert-2024-A-15');

      // Attempting to mint same seat should use same key
      const sameKey = service.generateKey('nft-mint', mintData);
      expect(sameKey).toBe(key);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string values in data', () => {
      const data = {
        venueId: '',
        userId: '',
        eventId: '',
        amount: 0,
      };

      const key = service.generateKey('payment-process', data);

      // Format: payment-{venueId}-{userId}-{eventId}-{amount}
      // With empty strings: payment----0
      expect(key).toBe('payment----0');
    });

    it('should handle special characters in data', () => {
      const data = {
        transactionId: 'txn-with-special-chars-!@#$%',
      };

      const key = service.generateKey('refund-process', data);

      expect(key).toBe('refund-txn-with-special-chars-!@#$%');
    });

    it('should handle very long data values', () => {
      const longString = 'a'.repeat(1000);
      const data = { transactionId: longString };

      const key = service.generateKey('refund-process', data);

      expect(key).toBe(`refund-${longString}`);
    });

    it('should handle numeric zero values', () => {
      const data = {
        venueId: 'venue-0',
        userId: 'user-0',
        eventId: 'event-0',
        amount: 0,
      };

      const key = service.generateKey('payment-process', data);

      expect(key).toBe('payment-venue-0-user-0-event-0-0');
    });

    it('should handle boolean values in unknown job types', () => {
      const data = { enabled: true, disabled: false };

      const key = service.generateKey('custom-job', data);

      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle array data in unknown job types', () => {
      const data = { items: [1, 2, 3], tags: ['a', 'b'] };

      const key = service.generateKey('batch-job', data);

      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
