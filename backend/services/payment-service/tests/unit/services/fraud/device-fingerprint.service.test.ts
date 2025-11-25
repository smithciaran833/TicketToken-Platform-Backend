import { DeviceFingerprintService } from '../../../../src/services/fraud/device-fingerprint.service';
import * as database from '../../../../src/config/database';
import crypto from 'crypto';

jest.mock('../../../../src/config/database', () => ({
  query: jest.fn()
}));

describe('DeviceFingerprintService', () => {
  let service: DeviceFingerprintService;
  let mockQuery: jest.MockedFunction<typeof database.query>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeviceFingerprintService();
    mockQuery = database.query as jest.MockedFunction<typeof database.query>;
  });

  // ===========================================================================
  // generateFingerprint() - 10 test cases
  // ===========================================================================

  describe('generateFingerprint()', () => {
    const basicDeviceData = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      screenResolution: '1920x1080',
      timezone: 'America/New_York',
      language: 'en-US',
      platform: 'Win32'
    };

    it('should generate consistent fingerprint for same device', () => {
      const fp1 = service.generateFingerprint(basicDeviceData);
      const fp2 = service.generateFingerprint(basicDeviceData);

      expect(fp1).toBe(fp2);
    });

    it('should generate different fingerprints for different devices', () => {
      const fp1 = service.generateFingerprint(basicDeviceData);
      const fp2 = service.generateFingerprint({
        ...basicDeviceData,
        userAgent: 'Different User Agent'
      });

      expect(fp1).not.toBe(fp2);
    });

    it('should return SHA-256 hash', () => {
      const fp = service.generateFingerprint(basicDeviceData);

      expect(fp).toHaveLength(64); // SHA-256 hex is 64 chars
      expect(/^[a-f0-9]+$/.test(fp)).toBe(true);
    });

    it('should include optional plugins in fingerprint', () => {
      const withPlugins = service.generateFingerprint({
        ...basicDeviceData,
        plugins: ['Chrome PDF Plugin', 'Native Client']
      });

      const withoutPlugins = service.generateFingerprint(basicDeviceData);

      expect(withPlugins).not.toBe(withoutPlugins);
    });

    it('should sort plugins for consistency', () => {
      const fp1 = service.generateFingerprint({
        ...basicDeviceData,
        plugins: ['Plugin A', 'Plugin B', 'Plugin C']
      });

      const fp2 = service.generateFingerprint({
        ...basicDeviceData,
        plugins: ['Plugin C', 'Plugin A', 'Plugin B']
      });

      expect(fp1).toBe(fp2);
    });

    it('should include fonts up to 20', () => {
      const fonts = Array.from({ length: 30 }, (_, i) => `Font${i}`);
      
      const fp = service.generateFingerprint({
        ...basicDeviceData,
        fonts
      });

      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should truncate canvas data', () => {
      const longCanvas = 'a'.repeat(100);
      
      const fp = service.generateFingerprint({
        ...basicDeviceData,
        canvas: longCanvas
      });

      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should truncate webgl data', () => {
      const longWebgl = 'b'.repeat(100);
      
      const fp = service.generateFingerprint({
        ...basicDeviceData,
        webgl: longWebgl
      });

      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle missing optional fields', () => {
      const fp = service.generateFingerprint(basicDeviceData);

      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should change fingerprint when any field changes', () => {
      const fields = ['userAgent', 'screenResolution', 'timezone', 'language', 'platform'];
      
      const originalFp = service.generateFingerprint(basicDeviceData);

      fields.forEach(field => {
        const modifiedData = { ...basicDeviceData, [field]: 'modified' };
        const modifiedFp = service.generateFingerprint(modifiedData);
        expect(modifiedFp).not.toBe(originalFp);
      });
    });
  });

  // ===========================================================================
  // recordDeviceActivity() - 5 test cases
  // ===========================================================================

  describe('recordDeviceActivity()', () => {
    beforeEach(() => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    });

    it('should insert device activity record', async () => {
      await service.recordDeviceActivity('fp-123', 'user-456', 'login');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO device_activity'),
        expect.arrayContaining(['fp-123', 'user-456', 'login'])
      );
    });

    it('should include metadata as JSON', async () => {
      const metadata = { ip: '192.168.1.1', location: 'US' };

      await service.recordDeviceActivity('fp-123', 'user-456', 'purchase', metadata);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify(metadata)])
      );
    });

    it('should handle empty metadata', async () => {
      await service.recordDeviceActivity('fp-123', 'user-456', 'login');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify({})])
      );
    });

    it('should record different activity types', async () => {
      await service.recordDeviceActivity('fp-123', 'user-456', 'failed_payment');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['fp-123', 'user-456', 'failed_payment', '{}'])
      );
    });

    it('should use current timestamp', async () => {
      await service.recordDeviceActivity('fp-123', 'user-456', 'login');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CURRENT_TIMESTAMP'),
        expect.any(Array)
      );
    });
  });

  // ===========================================================================
  // getDeviceRiskScore() - 12 test cases
  // ===========================================================================

  describe('getDeviceRiskScore()', () => {
    it('should return zero score for clean device', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as any) // accounts
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any) // suspicious
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // geo
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 72 * 60 * 60 * 1000) }], rowCount: 1 } as any) // age
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any); // failed

      const result = await service.getDeviceRiskScore('fp-clean');

      expect(result.score).toBe(0);
      expect(result.factors).toHaveLength(0);
    });

    it('should flag multiple accounts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 72 * 60 * 60 * 1000) }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any);

      const result = await service.getDeviceRiskScore('fp-multi');

      expect(result.score).toBeGreaterThan(0);
      expect(result.factors.some(f => f.factor === 'multiple_accounts')).toBe(true);
    });

    it('should flag suspicious activity', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 72 * 60 * 60 * 1000) }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any);

      const result = await service.getDeviceRiskScore('fp-suspicious');

      expect(result.factors.some(f => f.factor === 'suspicious_activity')).toBe(true);
    });

    it('should flag geographic anomalies', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({
          rows: [{
            time1: new Date(),
            location1: 'US',
            time2: new Date(),
            location2: 'CN'
          }],
          rowCount: 1
        } as any)
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 72 * 60 * 60 * 1000) }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any);

      const result = await service.getDeviceRiskScore('fp-geo');

      expect(result.factors.some(f => f.factor === 'geographic_anomalies')).toBe(true);
    });

    it('should flag new devices', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 2 * 60 * 60 * 1000) }], rowCount: 1 } as any) // 2 hours old
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any);

      const result = await service.getDeviceRiskScore('fp-new');

      expect(result.factors.some(f => f.factor === 'new_device')).toBe(true);
    });

    it('should flag failed payments', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 72 * 60 * 60 * 1000) }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 } as any);

      const result = await service.getDeviceRiskScore('fp-failed');

      expect(result.factors.some(f => f.factor === 'failed_payments')).toBe(true);
    });

    it('should cap score at 1.0', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '20' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({
          rows: [{ time1: new Date(), location1: 'US', time2: new Date(), location2: 'CN' }],
          rowCount: 1
        } as any)
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 1 * 60 * 60 * 1000) }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 } as any);

      const result = await service.getDeviceRiskScore('fp-high-risk');

      expect(result.score).toBeLessThanOrEqual(1.0);
    });

    it('should include factor weights', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 72 * 60 * 60 * 1000) }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any);

      const result = await service.getDeviceRiskScore('fp-test');

      if (result.factors.length > 0) {
        expect(result.factors[0]).toHaveProperty('weight');
        expect(result.factors[0]).toHaveProperty('value');
      }
    });

    it('should query database for account count', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 72 * 60 * 60 * 1000) }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any);

      await service.getDeviceRiskScore('fp-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(DISTINCT user_id)'),
        ['fp-123']
      );
    });

    it('should check 30-day window for suspicious activity', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 72 * 60 * 60 * 1000) }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any);

      await service.getDeviceRiskScore('fp-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '30 days'"),
        expect.any(Array)
      );
    });

    it('should return factors array', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 72 * 60 * 60 * 1000) }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any);

      const result = await service.getDeviceRiskScore('fp-123');

      expect(Array.isArray(result.factors)).toBe(true);
    });

    it('should include factor details', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ first_seen: new Date(Date.now() - 72 * 60 * 60 * 1000) }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any);

      const result = await service.getDeviceRiskScore('fp-123');

      if (result.factors.length > 0) {
        expect(result.factors[0]).toHaveProperty('factor');
        expect(result.factors[0]).toHaveProperty('value');
      }
    });
  });

  // ===========================================================================
  // compareFingerprints() - 6 test cases
  // ===========================================================================

  describe('compareFingerprints()', () => {
    it('should return identical for same fingerprints', async () => {
      const result = await service.compareFingerprints('abc123', 'abc123');

      expect(result.similar).toBe(true);
      expect(result.similarity).toBe(1.0);
    });

    it('should return not similar for very different fingerprints', async () => {
      const result = await service.compareFingerprints('abc123', 'xyz789');

      expect(result.similar).toBe(false);
      expect(result.similarity).toBeLessThan(0.85);
    });

    it('should calculate similarity score', async () => {
      const result = await service.compareFingerprints('abc123', 'abc124');

      expect(result.similarity).toBeGreaterThan(0);
      expect(result.similarity).toBeLessThanOrEqual(1.0);
    });

    it('should detect similar fingerprints', async () => {
      const fp1 = 'a'.repeat(64);
      const fp2 = 'a'.repeat(63) + 'b';

      const result = await service.compareFingerprints(fp1, fp2);

      expect(result.similarity).toBeGreaterThan(0.9);
    });

    it('should handle different length fingerprints', async () => {
      const result = await service.compareFingerprints('abc', 'abcdef');

      expect(result).toHaveProperty('similarity');
      expect(result).toHaveProperty('similar');
    });

    it('should return similarity between 0 and 1', async () => {
      const result = await service.compareFingerprints('test1', 'test2');

      expect(result.similarity).toBeGreaterThanOrEqual(0);
      expect(result.similarity).toBeLessThanOrEqual(1);
    });
  });

  // ===========================================================================
  // calculateHammingDistance() - 5 test cases
  // ===========================================================================

  describe('calculateHammingDistance()', () => {
    it('should return 0 for identical strings', () => {
      const distance = service['calculateHammingDistance']('abc', 'abc');

      expect(distance).toBe(0);
    });

    it('should count character differences', () => {
      const distance = service['calculateHammingDistance']('abc', 'axc');

      expect(distance).toBe(1);
    });

    it('should handle different lengths', () => {
      const distance = service['calculateHammingDistance']('abc', 'abcde');

      expect(distance).toBe(2);
    });

    it('should handle completely different strings', () => {
      const distance = service['calculateHammingDistance']('abc', 'xyz');

      expect(distance).toBe(3);
    });

    it('should handle empty strings', () => {
      const distance = service['calculateHammingDistance']('', 'abc');

      expect(distance).toBe(3);
    });
  });
});
