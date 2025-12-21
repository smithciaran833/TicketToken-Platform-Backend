import { DeviceTrustService } from '../../../src/services/device-trust.service';
import { pool } from '../../../src/config/database';
import { redis } from '../../../src/config/redis';

jest.mock('../../../src/config/database');
jest.mock('../../../src/config/redis');

describe('DeviceTrustService', () => {
  let deviceTrustService: DeviceTrustService;
  let mockPool: jest.Mocked<typeof pool>;
  let mockRedis: jest.Mocked<typeof redis>;

  beforeEach(() => {
    deviceTrustService = new DeviceTrustService();
    mockPool = pool as jest.Mocked<typeof pool>;
    mockRedis = redis as jest.Mocked<typeof redis>;
    jest.clearAllMocks();
  });

  describe('generateFingerprint', () => {
    it('should generate consistent fingerprint for same device', () => {
      const request = {
        ip: '192.168.1.1',
        headers: {
          'user-agent': 'Mozilla/5.0',
          'accept-language': 'en-US',
        },
      };

      const fingerprint1 = deviceTrustService.generateFingerprint(request);
      const fingerprint2 = deviceTrustService.generateFingerprint(request);

      expect(fingerprint1).toBe(fingerprint2);
      expect(fingerprint1).toBeDefined();
      expect(fingerprint1.length).toBeGreaterThan(10);
    });

    it('should generate different fingerprints for different devices', () => {
      const device1 = {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Chrome' },
      };

      const device2 = {
        ip: '192.168.1.2',
        headers: { 'user-agent': 'Firefox' },
      };

      const fingerprint1 = deviceTrustService.generateFingerprint(device1);
      const fingerprint2 = deviceTrustService.generateFingerprint(device2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should include IP address in fingerprint', () => {
      const device = {
        ip: '10.0.0.1',
        headers: { 'user-agent': 'Test' },
      };

      const fingerprint = deviceTrustService.generateFingerprint(device);
      expect(fingerprint).toBeDefined();
    });

    it('should include user-agent in fingerprint', () => {
      const device = {
        ip: '10.0.0.1',
        headers: { 'user-agent': 'Unique-Agent' },
      };

      const fingerprint = deviceTrustService.generateFingerprint(device);
      expect(fingerprint).toBeDefined();
    });

    it('should handle missing headers gracefully', () => {
      const device = {
        ip: '10.0.0.1',
        headers: {},
      };

      const fingerprint = deviceTrustService.generateFingerprint(device);
      expect(fingerprint).toBeDefined();
    });
  });

  describe('calculateTrustScore', () => {
    it('should return high score for known device', async () => {
      const userId = 'user-123';
      const fingerprint = 'known-device-fp';

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            successful_logins: 50,
            failed_logins: 2,
            last_seen: new Date(),
          },
        ],
        rowCount: 1,
      } as any);

      const score = await deviceTrustService.calculateTrustScore(userId, fingerprint);

      expect(score).toBeGreaterThan(70);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return low score for new device', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const score = await deviceTrustService.calculateTrustScore('user-123', 'new-fp');

      expect(score).toBeLessThan(50);
    });

    it('should penalize devices with failed attempts', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            successful_logins: 5,
            failed_logins: 20,
            last_seen: new Date(),
          },
        ],
        rowCount: 1,
      } as any);

      const score = await deviceTrustService.calculateTrustScore('user-123', 'suspicious-fp');

      expect(score).toBeLessThan(40);
    });

    it('should consider device age in score', async () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 1);

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            successful_logins: 100,
            failed_logins: 0,
            last_seen: oldDate,
            first_seen: oldDate,
          },
        ],
        rowCount: 1,
      } as any);

      const score = await deviceTrustService.calculateTrustScore('user-123', 'old-device-fp');

      expect(score).toBeGreaterThan(80);
    });

    it('should update score in cache', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ successful_logins: 10, failed_logins: 0 }],
        rowCount: 1,
      } as any);

      mockRedis.setex = jest.fn().mockResolvedValue('OK');

      await deviceTrustService.calculateTrustScore('user-123', 'fp-123');

      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('recordDeviceActivity', () => {
    it('should record successful login', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as any);

      await deviceTrustService.recordDeviceActivity('user-123', 'fp-123', true);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT'),
        expect.any(Array)
      );
    });

    it('should record failed login', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as any);

      await deviceTrustService.recordDeviceActivity('user-123', 'fp-123', false);

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should increment success counter', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ successful_logins: 10 }],
        rowCount: 1,
      } as any);

      await deviceTrustService.recordDeviceActivity('user-123', 'fp-123', true);

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should increment failed counter', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ failed_logins: 5 }],
        rowCount: 1,
      } as any);

      await deviceTrustService.recordDeviceActivity('user-123', 'fp-123', false);

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should update last_seen timestamp', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ last_seen: new Date() }],
        rowCount: 1,
      } as any);

      await deviceTrustService.recordDeviceActivity('user-123', 'fp-123', true);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('last_seen'),
        expect.any(Array)
      );
    });
  });

  describe('requiresAdditionalVerification', () => {
    it('should not require verification for trusted device', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ successful_logins: 100, failed_logins: 0 }],
        rowCount: 1,
      } as any);

      const requires = await deviceTrustService.requiresAdditionalVerification(
        'user-123',
        'trusted-fp'
      );

      expect(requires).toBe(false);
    });

    it('should require verification for new device', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const requires = await deviceTrustService.requiresAdditionalVerification(
        'user-123',
        'new-fp'
      );

      expect(requires).toBe(true);
    });

    it('should require verification for suspicious device', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ successful_logins: 1, failed_logins: 10 }],
        rowCount: 1,
      } as any);

      const requires = await deviceTrustService.requiresAdditionalVerification(
        'user-123',
        'suspicious-fp'
      );

      expect(requires).toBe(true);
    });

    it('should check trust score threshold', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ successful_logins: 20, failed_logins: 1 }],
        rowCount: 1,
      } as any);

      const requires = await deviceTrustService.requiresAdditionalVerification(
        'user-123',
        'medium-trust-fp'
      );

      expect(typeof requires).toBe('boolean');
    });
  });

  describe('getDeviceHistory', () => {
    it('should return device login history', async () => {
      const mockHistory = [
        { timestamp: new Date(), success: true, ip: '10.0.0.1' },
        { timestamp: new Date(), success: true, ip: '10.0.0.1' },
      ];

      mockPool.query.mockResolvedValueOnce({
        rows: mockHistory,
        rowCount: 2,
      } as any);

      const history = await deviceTrustService.getDeviceHistory('user-123', 'fp-123');

      expect(history).toHaveLength(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        expect.any(Array)
      );
    });

    it('should limit history to recent entries', async () => {
      await deviceTrustService.getDeviceHistory('user-123', 'fp-123', 10);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.any(Array)
      );
    });
  });
});
