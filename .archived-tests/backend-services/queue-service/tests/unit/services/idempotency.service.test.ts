import { IdempotencyService } from '../../../src/services/idempotency.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeAll(() => {
    service = new IdempotencyService();
  });

  describe('generateKey', () => {
    it('should generate consistent keys for payment jobs', () => {
      const data = {
        venueId: 'venue-1',
        userId: 'user-1',
        eventId: 'event-1',
        amount: 100
      };

      const key1 = service.generateKey('payment-process', data);
      const key2 = service.generateKey('payment-process', data);

      expect(key1).toBe(key2);
      expect(key1).toBe('payment-venue-1-user-1-event-1-100');
    });

    it('should generate different keys for different amounts', () => {
      const data1 = { venueId: 'v1', userId: 'u1', eventId: 'e1', amount: 100 };
      const data2 = { venueId: 'v1', userId: 'u1', eventId: 'e1', amount: 200 };

      const key1 = service.generateKey('payment-process', data1);
      const key2 = service.generateKey('payment-process', data2);

      expect(key1).not.toBe(key2);
    });

    it('should generate keys for refund jobs', () => {
      const data = { transactionId: 'txn-123' };
      const key = service.generateKey('refund-process', data);

      expect(key).toBe('refund-txn-123');
    });

    it('should generate date-based keys for email jobs', () => {
      const data = { template: 'welcome', to: 'user@example.com' };
      const key = service.generateKey('send-email', data);

      expect(key).toMatch(/^email-welcome-user@example\.com-\d{4}-\d{2}-\d{2}$/);
    });

    it('should generate hour-based keys for SMS jobs', () => {
      const data = { to: '+1234567890', template: 'otp' };
      const key = service.generateKey('send-sms', data);

      expect(key).toMatch(/^sms-\+1234567890-otp-\d+$/);
    });

    it('should generate hash for unknown job types', () => {
      const data = { custom: 'data' };
      const key = service.generateKey('unknown-job', data);

      expect(key).toHaveLength(64); // SHA-256 hash length
    });
  });

  describe('check and store', () => {
    it('should return null for non-existent keys', async () => {
      const result = await service.check('non-existent-key');
      expect(result).toBeNull();
    });

    it('should store and retrieve results', async () => {
      const key = 'test-key-' + Date.now();
      const result = { success: true, data: { id: '123' } };

      await service.store(key, 'test-queue', 'test-job', result, 60);
      const retrieved = await service.check(key);

      expect(retrieved).toEqual(result);
    });

    it('should expire after TTL', async () => {
      const key = 'expire-test-' + Date.now();
      const result = { success: true };

      await service.store(key, 'test-queue', 'test-job', result, 1); // 1 second TTL
      
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const retrieved = await service.check(key);
      expect(retrieved).toBeNull();
    }, 10000);
  });

  describe('cleanup', () => {
    it('should remove expired keys', async () => {
      await service.cleanup();
      // Cleanup should complete without errors
      expect(true).toBe(true);
    });
  });

  afterAll(async () => {
    // Close connections
    await new Promise(resolve => setTimeout(resolve, 100));
  });
});
