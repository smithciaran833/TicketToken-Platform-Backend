/**
 * Anonymization Service Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    privacy: {
      customerHashSalt: 'test-salt-for-unit-tests',
    },
  },
}));

import { AnonymizationService } from '../../../src/services/anonymization.service';

describe('AnonymizationService', () => {
  let service: AnonymizationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnonymizationService();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = AnonymizationService.getInstance();
      const instance2 = AnonymizationService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('hashCustomerId', () => {
    it('should return consistent hash for same input', async () => {
      const hash1 = await service.hashCustomerId('customer-123');
      const hash2 = await service.hashCustomerId('customer-123');

      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different inputs', async () => {
      const hash1 = await service.hashCustomerId('customer-123');
      const hash2 = await service.hashCustomerId('customer-456');

      expect(hash1).not.toBe(hash2);
    });

    it('should return 16 character hash', async () => {
      const hash = await service.hashCustomerId('customer-123');

      expect(hash).toHaveLength(16);
    });

    it('should return hex string', async () => {
      const hash = await service.hashCustomerId('customer-123');

      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('hashEmail', () => {
    it('should return consistent hash for same email', async () => {
      const hash1 = await service.hashEmail('test@example.com');
      const hash2 = await service.hashEmail('test@example.com');

      expect(hash1).toBe(hash2);
    });

    it('should normalize email before hashing', async () => {
      const hash1 = await service.hashEmail('Test@Example.COM');
      const hash2 = await service.hashEmail('test@example.com');

      expect(hash1).toBe(hash2);
    });

    it('should trim whitespace', async () => {
      const hash1 = await service.hashEmail('  test@example.com  ');
      const hash2 = await service.hashEmail('test@example.com');

      expect(hash1).toBe(hash2);
    });

    it('should return full sha256 hash', async () => {
      const hash = await service.hashEmail('test@example.com');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('anonymizeLocation', () => {
    it('should return null for null input', () => {
      const result = service.anonymizeLocation(null);

      expect(result).toBeNull();
    });

    it('should keep country', () => {
      const result = service.anonymizeLocation({ country: 'US' });

      expect(result.country).toBe('US');
    });

    it('should keep region/state', () => {
      const result = service.anonymizeLocation({ country: 'US', region: 'California' });

      expect(result.region).toBe('California');
    });

    it('should use state as region if region not present', () => {
      const result = service.anonymizeLocation({ country: 'US', state: 'Texas' });

      expect(result.region).toBe('Texas');
    });

    it('should truncate postal code to 3 characters', () => {
      const result = service.anonymizeLocation({ country: 'US', postalCode: '90210' });

      expect(result.postalCode).toBe('902');
    });

    it('should handle missing postal code', () => {
      const result = service.anonymizeLocation({ country: 'US' });

      expect(result.postalCode).toBeUndefined();
    });
  });

  describe('anonymizeDeviceInfo', () => {
    it('should return null for null input', () => {
      const result = service.anonymizeDeviceInfo(null);

      expect(result).toBeNull();
    });

    it('should keep device type', () => {
      const result = service.anonymizeDeviceInfo({ type: 'mobile' });

      expect(result.type).toBe('mobile');
    });

    it('should default to unknown type', () => {
      const result = service.anonymizeDeviceInfo({});

      expect(result.type).toBe('unknown');
    });
  });

  describe('generalizeOS', () => {
    it('should identify Windows', () => {
      expect((service as any).generalizeOS('Windows 10')).toBe('Windows');
      expect((service as any).generalizeOS('windows 11')).toBe('Windows');
    });

    it('should identify macOS', () => {
      expect((service as any).generalizeOS('macOS 14')).toBe('macOS');
      expect((service as any).generalizeOS('Mac OS X')).toBe('macOS');
      expect((service as any).generalizeOS('Darwin')).toBe('macOS');
    });

    it('should identify Linux', () => {
      expect((service as any).generalizeOS('Ubuntu Linux')).toBe('Linux');
      expect((service as any).generalizeOS('linux')).toBe('Linux');
    });

    it('should identify Android', () => {
      expect((service as any).generalizeOS('Android 13')).toBe('Android');
    });

    it('should identify iOS', () => {
      expect((service as any).generalizeOS('iOS 17')).toBe('iOS');
      expect((service as any).generalizeOS('iPhone OS')).toBe('iOS');
    });

    it('should return Other for unknown OS', () => {
      expect((service as any).generalizeOS('ChromeOS')).toBe('Other');
    });

    it('should return unknown for undefined', () => {
      expect((service as any).generalizeOS(undefined)).toBe('unknown');
    });
  });

  describe('generalizeBrowser', () => {
    it('should identify Chrome', () => {
      expect((service as any).generalizeBrowser('Chrome 120')).toBe('Chrome');
    });

    it('should identify Firefox', () => {
      expect((service as any).generalizeBrowser('Firefox 121')).toBe('Firefox');
    });

    it('should identify Safari', () => {
      expect((service as any).generalizeBrowser('Safari 17')).toBe('Safari');
    });

    it('should identify Edge', () => {
      expect((service as any).generalizeBrowser('Microsoft Edge')).toBe('Edge');
    });

    it('should identify Opera', () => {
      expect((service as any).generalizeBrowser('Opera GX')).toBe('Opera');
    });

    it('should return Other for unknown browser', () => {
      expect((service as any).generalizeBrowser('Brave')).toBe('Other');
    });

    it('should return unknown for undefined', () => {
      expect((service as any).generalizeBrowser(undefined)).toBe('unknown');
    });
  });

  describe('aggregateAgeGroup', () => {
    it('should return undefined for undefined age', () => {
      expect(service.aggregateAgeGroup(undefined)).toBeUndefined();
    });

    it('should categorize under 18', () => {
      expect(service.aggregateAgeGroup(17)).toBe('under-18');
      expect(service.aggregateAgeGroup(10)).toBe('under-18');
    });

    it('should categorize 18-24', () => {
      expect(service.aggregateAgeGroup(18)).toBe('18-24');
      expect(service.aggregateAgeGroup(24)).toBe('18-24');
    });

    it('should categorize 25-34', () => {
      expect(service.aggregateAgeGroup(25)).toBe('25-34');
      expect(service.aggregateAgeGroup(34)).toBe('25-34');
    });

    it('should categorize 35-44', () => {
      expect(service.aggregateAgeGroup(35)).toBe('35-44');
      expect(service.aggregateAgeGroup(44)).toBe('35-44');
    });

    it('should categorize 45-54', () => {
      expect(service.aggregateAgeGroup(45)).toBe('45-54');
      expect(service.aggregateAgeGroup(54)).toBe('45-54');
    });

    it('should categorize 55-64', () => {
      expect(service.aggregateAgeGroup(55)).toBe('55-64');
      expect(service.aggregateAgeGroup(64)).toBe('55-64');
    });

    it('should categorize 65+', () => {
      expect(service.aggregateAgeGroup(65)).toBe('65+');
      expect(service.aggregateAgeGroup(90)).toBe('65+');
    });
  });

  describe('anonymizeCustomerData', () => {
    it('should remove PII fields', () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        address: '123 Main St',
        dateOfBirth: '1990-01-15',
        socialSecurityNumber: '123-45-6789',
        creditCard: '4111111111111111',
        purchaseHistory: ['item1', 'item2'],
      };

      const result = service.anonymizeCustomerData(data);

      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
      expect(result.email).toBeUndefined();
      expect(result.phone).toBeUndefined();
      expect(result.address).toBeUndefined();
      expect(result.dateOfBirth).toBeUndefined();
      expect(result.socialSecurityNumber).toBeUndefined();
      expect(result.creditCard).toBeUndefined();
      expect(result.purchaseHistory).toEqual(['item1', 'item2']);
    });

    it('should anonymize location', () => {
      const data = {
        location: { country: 'US', state: 'CA', postalCode: '90210' },
      };

      const result = service.anonymizeCustomerData(data);

      expect(result.location.postalCode).toBe('902');
    });

    it('should anonymize device info', () => {
      const data = {
        deviceInfo: { type: 'mobile', os: 'iOS 17', browser: 'Safari' },
      };

      const result = service.anonymizeCustomerData(data);

      expect(result.deviceInfo.os).toBe('iOS');
      expect(result.deviceInfo.browser).toBe('Safari');
    });

    it('should convert age to age group', () => {
      const data = { age: 28 };

      const result = service.anonymizeCustomerData(data);

      expect(result.age).toBeUndefined();
      expect(result.ageGroup).toBe('25-34');
    });

    it('should preserve non-PII fields', () => {
      const data = {
        customerId: 'cust-123',
        preferences: { newsletter: true },
        firstName: 'John',
      };

      const result = service.anonymizeCustomerData(data);

      expect(result.customerId).toBe('cust-123');
      expect(result.preferences).toEqual({ newsletter: true });
    });
  });

  describe('generateAnonymousId', () => {
    it('should generate 32 character hex string', () => {
      const id = service.generateAnonymousId();

      expect(id).toHaveLength(32);
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = service.generateAnonymousId();
      const id2 = service.generateAnonymousId();

      expect(id1).not.toBe(id2);
    });
  });

  describe('daily salt rotation', () => {
    it('should update salt on new day', () => {
      const originalSalt = (service as any).dailySalt;

      // Simulate day change
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      (service as any).saltGeneratedAt = yesterday;

      // Trigger salt check
      (service as any).checkAndUpdateSalt();

      const newSalt = (service as any).dailySalt;

      // Salt should have been regenerated
      expect((service as any).saltGeneratedAt.getDate()).toBe(new Date().getDate());
    });
  });
});
