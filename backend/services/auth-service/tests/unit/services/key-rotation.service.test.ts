const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockAuditService = {
  log: jest.fn(),
};

jest.mock('../../../src/config/redis', () => ({ getRedis: () => mockRedis }));
jest.mock('../../../src/utils/logger', () => ({ logger: mockLogger }));
jest.mock('../../../src/config/database', () => ({ pool: {} }));
jest.mock('../../../src/services/audit.service', () => ({ auditService: mockAuditService }));

import { KeyRotationService } from '../../../src/services/key-rotation.service';

describe('KeyRotationService', () => {
  let service: KeyRotationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KeyRotationService();
  });

  describe('initialize', () => {
    it('loads config from Redis if exists', async () => {
      const storedConfig = { gracePeriodHours: 48, maxKeyAgeDays: 60 };
      mockRedis.get.mockResolvedValue(JSON.stringify(storedConfig));

      await service.initialize();

      expect(mockRedis.get).toHaveBeenCalledWith('key-rotation:config');
    });

    it('uses defaults if no stored config', async () => {
      mockRedis.get.mockResolvedValue(null);

      await service.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Key rotation service initialized',
        expect.objectContaining({ gracePeriodHours: 24 })
      );
    });
  });

  describe('checkRotationNeeded', () => {
    it('returns needed=false when no previous rotation', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.checkRotationNeeded('jwt');

      expect(result.needed).toBe(false);
      expect(result.reason).toContain('No previous rotation');
    });

    it('returns needed=true when key age exceeds max', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days ago
      mockRedis.get.mockResolvedValue(oldDate.toISOString());

      const result = await service.checkRotationNeeded('jwt');

      expect(result.needed).toBe(true);
      expect(result.reason).toContain('exceeds maximum');
    });

    it('returns currentKeyAge in days', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30); // 30 days ago
      mockRedis.get.mockResolvedValue(recentDate.toISOString());

      const result = await service.checkRotationNeeded('jwt');

      expect(result.currentKeyAge).toBeGreaterThanOrEqual(29);
      expect(result.currentKeyAge).toBeLessThanOrEqual(31);
    });

    it('warns when approaching rotation', async () => {
      const approachingDate = new Date();
      approachingDate.setDate(approachingDate.getDate() - 85); // 85 days, within 7-day warning
      mockRedis.get.mockResolvedValue(approachingDate.toISOString());

      const result = await service.checkRotationNeeded('jwt');

      expect(result.needed).toBe(false);
      expect(result.reason).toContain('recommended');
    });
  });

  describe('recordRotation', () => {
    it('stores timestamp in Redis', async () => {
      await service.recordRotation('jwt', 'key-123', 'scheduled', 'admin-user');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'key-rotation:jwt:last-rotation',
        expect.any(String)
      );
    });

    it('creates audit log', async () => {
      await service.recordRotation('jwt', 'key-123', 'scheduled', 'admin-user');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-user',
          action: 'key.rotated',
          actionType: 'security',
          resourceId: 'key-123',
        })
      );
    });
  });

  describe('generateKeyPair', () => {
    it('generates RSA 4096 key pair', () => {
      const result = service.generateKeyPair();

      expect(result.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
      expect(result.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
    });

    it('generates unique keyId', () => {
      const result1 = service.generateKeyPair();
      const result2 = service.generateKeyPair();

      expect(result1.keyId).not.toBe(result2.keyId);
      expect(result1.keyId).toMatch(/^key-\d+-[a-f0-9]+$/);
    });

    it('generates fingerprint from public key', () => {
      const result = service.generateKeyPair();

      expect(result.fingerprint).toHaveLength(16);
      expect(result.fingerprint).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('getRotationStatus', () => {
    it('returns status for both JWT and S2S', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getRotationStatus();

      expect(result).toHaveProperty('jwt');
      expect(result).toHaveProperty('s2s');
      expect(result).toHaveProperty('config');
    });
  });

  describe('updateConfig', () => {
    it('stores updated config in Redis', async () => {
      await service.updateConfig({ maxKeyAgeDays: 60 }, 'admin-user');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'key-rotation:config',
        expect.stringContaining('60')
      );
    });

    it('creates audit log', async () => {
      await service.updateConfig({ gracePeriodHours: 48 }, 'admin-user');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'key-rotation.config.updated',
        })
      );
    });
  });

  describe('acquireRotationLock', () => {
    it('returns true when lock acquired', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.acquireRotationLock('jwt');

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'key-rotation:lock:jwt',
        expect.any(String),
        'EX',
        300,
        'NX'
      );
    });

    it('returns false when lock not acquired', async () => {
      mockRedis.set.mockResolvedValue(null);

      const result = await service.acquireRotationLock('jwt');

      expect(result).toBe(false);
    });
  });

  describe('releaseRotationLock', () => {
    it('deletes lock key', async () => {
      await service.releaseRotationLock('jwt');

      expect(mockRedis.del).toHaveBeenCalledWith('key-rotation:lock:jwt');
    });
  });
});
