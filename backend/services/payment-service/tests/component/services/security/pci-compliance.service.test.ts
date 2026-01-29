/**
 * COMPONENT TEST: PCIComplianceService
 *
 * Tests PCI compliance validation with REAL Redis.
 */

import Redis from 'ioredis';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { PCIComplianceService } from '../../../../src/services/security/pci-compliance.service';

describe('PCIComplianceService Component Tests', () => {
  let redis: Redis;
  let service: PCIComplianceService;

  beforeAll(async () => {
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      password: 'redis_dev_pass_123',
      maxRetriesPerRequest: 3,
    });
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.del('security:incidents');
    service = new PCIComplianceService(redis);
  });

  // ===========================================================================
  // VALIDATE NO CARD STORAGE
  // ===========================================================================
  describe('validateNoCardStorage()', () => {
    it('should return true for data without patterns matching card info', async () => {
      const safeData = {
        orderId: 'order-abc-xyz',
        description: 'Test payment',
        paymentMethodId: 'pm_stripe_token_abc',
      };

      const result = await service.validateNoCardStorage(safeData);

      expect(result).toBe(true);
    });

    it('should detect credit card numbers (16 digits)', async () => {
      const unsafeData = {
        orderId: 'order-abc',
        cardNumber: '4111111111111111',
      };

      const result = await service.validateNoCardStorage(unsafeData);

      expect(result).toBe(false);
    });

    it('should detect credit card numbers (15 digits - Amex)', async () => {
      const unsafeData = {
        data: '378282246310005',
      };

      const result = await service.validateNoCardStorage(unsafeData);

      expect(result).toBe(false);
    });

    it('should detect credit card numbers (13 digits)', async () => {
      const unsafeData = {
        nested: {
          value: '4222222222222',
        },
      };

      const result = await service.validateNoCardStorage(unsafeData);

      expect(result).toBe(false);
    });

    it('should detect 3 digit numbers as potential CVV', async () => {
      const unsafeData = {
        cvv: '123',
      };

      const result = await service.validateNoCardStorage(unsafeData);

      expect(result).toBe(false);
    });

    it('should detect 4 digit numbers as potential CVV', async () => {
      const unsafeData = {
        securityCode: '1234',
      };

      const result = await service.validateNoCardStorage(unsafeData);

      expect(result).toBe(false);
    });

    it('should detect expiry dates (MM/YYYY format)', async () => {
      const unsafeData = {
        expirationDate: '01/2026',
      };

      const result = await service.validateNoCardStorage(unsafeData);

      expect(result).toBe(false);
    });

    it('should handle nested objects with card numbers', async () => {
      const unsafeData = {
        payment: {
          details: {
            card: {
              number: '5555555555554444',
            },
          },
        },
      };

      const result = await service.validateNoCardStorage(unsafeData);

      expect(result).toBe(false);
    });

    it('should handle arrays with card numbers', async () => {
      const unsafeData = {
        cards: ['4111111111111111', '5555555555554444'],
      };

      const result = await service.validateNoCardStorage(unsafeData);

      expect(result).toBe(false);
    });

    it('should log security incident when card data detected', async () => {
      const unsafeData = {
        cardNumber: '4111111111111111',
      };

      await service.validateNoCardStorage(unsafeData);

      // Small delay for Redis write
      await new Promise(resolve => setTimeout(resolve, 50));

      const incidents = await redis.lrange('security:incidents', 0, -1);
      expect(incidents.length).toBeGreaterThanOrEqual(1);
      
      const incident = JSON.parse(incidents[0]);
      expect(incident.type).toBe('CARD_DATA_STORAGE_ATTEMPT');
    });
  });

  // ===========================================================================
  // LOG SECURITY INCIDENT
  // ===========================================================================
  describe('logSecurityIncident()', () => {
    it('should log incident to Redis list', async () => {
      await service.logSecurityIncident('TEST_INCIDENT', { userId: 'user-abc' });

      const incidents = await redis.lrange('security:incidents', 0, -1);
      expect(incidents.length).toBeGreaterThanOrEqual(1);

      const incident = JSON.parse(incidents[0]);
      expect(incident.type).toBe('TEST_INCIDENT');
      expect(incident.timestamp).toBeDefined();
    });

    it('should sanitize cardNumber from metadata', async () => {
      await service.logSecurityIncident('TEST_INCIDENT', {
        userId: 'user-abc',
        cardNumber: '4111111111111111',
      });

      const incidents = await redis.lrange('security:incidents', 0, -1);
      expect(incidents.length).toBeGreaterThanOrEqual(1);
      
      const incident = JSON.parse(incidents[0]);
      expect(incident.metadata.userId).toBe('user-abc');
      expect(incident.metadata.cardNumber).toBeUndefined();
    });

    it('should sanitize cvv from metadata', async () => {
      await service.logSecurityIncident('TEST_INCIDENT', {
        userId: 'user-abc',
        cvv: '999',
      });

      const incidents = await redis.lrange('security:incidents', 0, -1);
      expect(incidents.length).toBeGreaterThanOrEqual(1);
      
      const incident = JSON.parse(incidents[0]);
      expect(incident.metadata.cvv).toBeUndefined();
    });

    it('should sanitize pin from metadata', async () => {
      await service.logSecurityIncident('TEST_INCIDENT', {
        userId: 'user-abc',
        pin: '9999',
      });

      const incidents = await redis.lrange('security:incidents', 0, -1);
      expect(incidents.length).toBeGreaterThanOrEqual(1);
      
      const incident = JSON.parse(incidents[0]);
      expect(incident.metadata.pin).toBeUndefined();
    });

    it('should sanitize password from metadata', async () => {
      await service.logSecurityIncident('TEST_INCIDENT', {
        userId: 'user-abc',
        password: 'secret',
      });

      const incidents = await redis.lrange('security:incidents', 0, -1);
      expect(incidents.length).toBeGreaterThanOrEqual(1);
      
      const incident = JSON.parse(incidents[0]);
      expect(incident.metadata.password).toBeUndefined();
    });
  });
});
