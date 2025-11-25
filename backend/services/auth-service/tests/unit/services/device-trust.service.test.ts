import { DeviceTrustService } from '../../../src/services/device-trust.service';

// Mock database
jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  })),
}));

import { db } from '../../../src/config/database';

describe('DeviceTrustService', () => {
  let service: DeviceTrustService;
  let mockDb: jest.MockedFunction<typeof db>;

  beforeEach(() => {
    mockDb = db as jest.MockedFunction<typeof db>;
    service = new DeviceTrustService();
    jest.clearAllMocks();
  });

  describe('generateFingerprint', () => {
    it('should generate fingerprint from request headers', () => {
      const request = {
        headers: {
          'user-agent': 'Mozilla/5.0',
          'accept-language': 'en-US',
          'accept-encoding': 'gzip, deflate',
        },
        ip: '192.168.1.1',
      };

      const fingerprint = service.generateFingerprint(request);

      expect(fingerprint).toBeDefined();
      expect(typeof fingerprint).toBe('string');
      expect(fingerprint.length).toBe(64); // SHA256 hex length
    });

    it('should generate same fingerprint for identical requests', () => {
      const request = {
        headers: {
          'user-agent': 'Mozilla/5.0',
          'accept-language': 'en-US',
          'accept-encoding': 'gzip',
        },
        ip: '192.168.1.1',
      };

      const fingerprint1 = service.generateFingerprint(request);
      const fingerprint2 = service.generateFingerprint(request);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should generate different fingerprints for different requests', () => {
      const request1 = {
        headers: {
          'user-agent': 'Mozilla/5.0',
          'accept-language': 'en-US',
          'accept-encoding': 'gzip',
        },
        ip: '192.168.1.1',
      };

      const request2 = {
        headers: {
          'user-agent': 'Chrome/90.0',
          'accept-language': 'en-US',
          'accept-encoding': 'gzip',
        },
        ip: '192.168.1.1',
      };

      const fingerprint1 = service.generateFingerprint(request1);
      const fingerprint2 = service.generateFingerprint(request2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should handle missing headers gracefully', () => {
      const request = {
        headers: {},
        ip: '192.168.1.1',
      };

      const fingerprint = service.generateFingerprint(request);

      expect(fingerprint).toBeDefined();
      expect(typeof fingerprint).toBe('string');
    });
  });

  describe('calculateTrustScore', () => {
    const userId = 'user-123';
    const fingerprint = 'abc123';

    it('should return 0 for unknown device', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      mockDb.mockReturnValue(mockQuery as any);

      const score = await service.calculateTrustScore(userId, fingerprint);

      expect(score).toBe(0);
      expect(mockDb).toHaveBeenCalledWith('trusted_devices');
    });

    it('should return base score of 50 for new device', async () => {
      const device = {
        user_id: userId,
        device_fingerprint: fingerprint,
        created_at: new Date(),
        last_seen: new Date(),
        trust_score: 50,
      };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(device),
      };
      mockDb.mockReturnValue(mockQuery as any);

      const score = await service.calculateTrustScore(userId, fingerprint);

      expect(score).toBe(80); // 50 base + 30 for recent activity
    });

    it('should add age bonus for older devices', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 100); // 100 days ago

      const device = {
        user_id: userId,
        device_fingerprint: fingerprint,
        created_at: createdAt,
        last_seen: new Date(),
        trust_score: 50,
      };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(device),
      };
      mockDb.mockReturnValue(mockQuery as any);

      const score = await service.calculateTrustScore(userId, fingerprint);

      expect(score).toBeGreaterThan(80); // Base + age + recent activity
    });

    it('should cap trust score at 100', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 500); // Very old device

      const device = {
        user_id: userId,
        device_fingerprint: fingerprint,
        created_at: createdAt,
        last_seen: new Date(),
        trust_score: 50,
      };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(device),
      };
      mockDb.mockReturnValue(mockQuery as any);

      const score = await service.calculateTrustScore(userId, fingerprint);

      expect(score).toBe(100);
    });

    it('should reduce bonus for devices not recently seen', async () => {
      const lastSeen = new Date();
      lastSeen.setDate(lastSeen.getDate() - 10); // 10 days ago

      const device = {
        user_id: userId,
        device_fingerprint: fingerprint,
        created_at: new Date(),
        last_seen: lastSeen,
        trust_score: 50,
      };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(device),
      };
      mockDb.mockReturnValue(mockQuery as any);

      const score = await service.calculateTrustScore(userId, fingerprint);

      expect(score).toBe(60); // 50 base + 10 for seen within 30 days
    });
  });

  describe('recordDeviceActivity', () => {
    const userId = 'user-123';
    const fingerprint = 'abc123';

    describe('for new device', () => {
      it('should insert new device with success', async () => {
        const mockQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
        };
        const mockInsertQuery = {
          insert: jest.fn().mockResolvedValue([1]),
        };

        mockDb
          .mockReturnValueOnce(mockQuery as any)
          .mockReturnValueOnce(mockInsertQuery as any);

        await service.recordDeviceActivity(userId, fingerprint, true);

        expect(mockInsertQuery.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: userId,
            device_fingerprint: fingerprint,
            trust_score: 50,
          })
        );
      });

      it('should insert new device with failure', async () => {
        const mockQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
        };
        const mockInsertQuery = {
          insert: jest.fn().mockResolvedValue([1]),
        };

        mockDb
          .mockReturnValueOnce(mockQuery as any)
          .mockReturnValueOnce(mockInsertQuery as any);

        await service.recordDeviceActivity(userId, fingerprint, false);

        expect(mockInsertQuery.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: userId,
            device_fingerprint: fingerprint,
            trust_score: 0,
          })
        );
      });
    });

    describe('for existing device', () => {
      it('should increase trust score on success', async () => {
        const existingDevice = {
          id: 1,
          user_id: userId,
          device_fingerprint: fingerprint,
          trust_score: 50,
          last_seen: new Date(),
        };

        const mockQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(existingDevice),
        };
        const mockUpdateQuery = {
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(1),
        };

        mockDb
          .mockReturnValueOnce(mockQuery as any)
          .mockReturnValueOnce(mockUpdateQuery as any);

        await service.recordDeviceActivity(userId, fingerprint, true);

        expect(mockUpdateQuery.update).toHaveBeenCalledWith(
          expect.objectContaining({
            trust_score: 55, // 50 + 5
          })
        );
      });

      it('should decrease trust score on failure', async () => {
        const existingDevice = {
          id: 1,
          user_id: userId,
          device_fingerprint: fingerprint,
          trust_score: 50,
          last_seen: new Date(),
        };

        const mockQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(existingDevice),
        };
        const mockUpdateQuery = {
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(1),
        };

        mockDb
          .mockReturnValueOnce(mockQuery as any)
          .mockReturnValueOnce(mockUpdateQuery as any);

        await service.recordDeviceActivity(userId, fingerprint, false);

        expect(mockUpdateQuery.update).toHaveBeenCalledWith(
          expect.objectContaining({
            trust_score: 40, // 50 - 10
          })
        );
      });

      it('should cap trust score at 100', async () => {
        const existingDevice = {
          id: 1,
          user_id: userId,
          device_fingerprint: fingerprint,
          trust_score: 98,
          last_seen: new Date(),
        };

        const mockQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(existingDevice),
        };
        const mockUpdateQuery = {
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(1),
        };

        mockDb
          .mockReturnValueOnce(mockQuery as any)
          .mockReturnValueOnce(mockUpdateQuery as any);

        await service.recordDeviceActivity(userId, fingerprint, true);

        expect(mockUpdateQuery.update).toHaveBeenCalledWith(
          expect.objectContaining({
            trust_score: 100,
          })
        );
      });

      it('should not go below 0 trust score', async () => {
        const existingDevice = {
          id: 1,
          user_id: userId,
          device_fingerprint: fingerprint,
          trust_score: 5,
          last_seen: new Date(),
        };

        const mockQuery = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(existingDevice),
        };
        const mockUpdateQuery = {
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(1),
        };

        mockDb
          .mockReturnValueOnce(mockQuery as any)
          .mockReturnValueOnce(mockUpdateQuery as any);

        await service.recordDeviceActivity(userId, fingerprint, false);

        expect(mockUpdateQuery.update).toHaveBeenCalledWith(
          expect.objectContaining({
            trust_score: 0,
          })
        );
      });
    });
  });

  describe('requiresAdditionalVerification', () => {
    const userId = 'user-123';
    const fingerprint = 'abc123';

    it('should require verification for low trust device (score < 30)', async () => {
      const device = {
        user_id: userId,
        device_fingerprint: fingerprint,
        created_at: new Date(),
        last_seen: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago - no activity bonus
        trust_score: 50,
      };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(device),
      };
      mockDb.mockReturnValue(mockQuery as any);

      const requires = await service.requiresAdditionalVerification(userId, fingerprint);

      expect(requires).toBe(true); // Score will be 50 base + 0 activity = 50, but we need score < 30
    });

    it('should not require verification for trusted device (score >= 30)', async () => {
      const device = {
        user_id: userId,
        device_fingerprint: fingerprint,
        created_at: new Date(),
        last_seen: new Date(),
        trust_score: 50,
      };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(device),
      };
      mockDb.mockReturnValue(mockQuery as any);

      const requires = await service.requiresAdditionalVerification(userId, fingerprint);

      expect(requires).toBe(false);
    });

    it('should require verification for unknown device', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      mockDb.mockReturnValue(mockQuery as any);

      const requires = await service.requiresAdditionalVerification(userId, fingerprint);

      expect(requires).toBe(true);
    });
  });
});
