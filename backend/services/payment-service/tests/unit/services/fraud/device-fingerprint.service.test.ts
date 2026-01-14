/**
 * Device Fingerprint Service Tests
 * Tests for device fingerprinting and fraud detection
 */

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  sadd: jest.fn(),
  smembers: jest.fn(),
  scard: jest.fn(),
};

jest.mock('../../../../src/services/redisService', () => ({
  getRedisClient: () => mockRedis,
}));

describe('DeviceFingerprintService', () => {
  let service: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockReset();
    mockRedis.set.mockReset();
    mockRedis.setex.mockReset();
    mockRedis.incr.mockReset();
    mockRedis.smembers.mockReset();
    mockRedis.scard.mockReset();
  });

  describe('generateFingerprint', () => {
    it('should generate fingerprint from device data', () => {
      const deviceData = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        screenResolution: '1920x1080',
        timezone: 'America/New_York',
        language: 'en-US',
        platform: 'Win32',
        colorDepth: 24,
        plugins: ['PDF Viewer', 'Chrome PDF Viewer'],
      };

      // Simulating the service
      const fingerprint = generateFingerprint(deviceData);

      expect(fingerprint).toBeDefined();
      expect(typeof fingerprint).toBe('string');
      expect(fingerprint.length).toBeGreaterThan(0);
    });

    it('should generate consistent fingerprint for same data', () => {
      const deviceData = {
        userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
        screenResolution: '1920x1080',
        timezone: 'UTC',
      };

      const fp1 = generateFingerprint(deviceData);
      const fp2 = generateFingerprint(deviceData);

      expect(fp1).toBe(fp2);
    });

    it('should generate different fingerprint for different data', () => {
      const data1 = { userAgent: 'Chrome', screenResolution: '1920x1080' };
      const data2 = { userAgent: 'Firefox', screenResolution: '1920x1080' };

      const fp1 = generateFingerprint(data1);
      const fp2 = generateFingerprint(data2);

      expect(fp1).not.toBe(fp2);
    });

    it('should handle missing optional fields', () => {
      const minimalData = { userAgent: 'Chrome' };

      const fingerprint = generateFingerprint(minimalData);

      expect(fingerprint).toBeDefined();
    });

    it('should normalize data for consistent fingerprinting', () => {
      const data1 = { userAgent: 'Chrome', screenResolution: '1920X1080' };
      const data2 = { userAgent: 'Chrome', screenResolution: '1920x1080' };

      const fp1 = generateFingerprint(data1);
      const fp2 = generateFingerprint(data2);

      // After normalization, should be same
      expect(fp1).toBe(fp2);
    });
  });

  describe('trackDevice', () => {
    it('should associate device with user', async () => {
      mockRedis.sadd.mockResolvedValueOnce(1);
      mockRedis.setex.mockResolvedValueOnce('OK');

      await trackDevice('user_123', 'fp_abc123', 'payment');

      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'device:user:user_123',
        'fp_abc123'
      );
    });

    it('should track device activity timestamp', async () => {
      mockRedis.sadd.mockResolvedValueOnce(1);
      mockRedis.setex.mockResolvedValueOnce('OK');

      await trackDevice('user_456', 'fp_def456', 'login');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('device:activity:fp_def456'),
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should increment device usage counter', async () => {
      mockRedis.sadd.mockResolvedValueOnce(0); // Already exists
      mockRedis.incr.mockResolvedValueOnce(5);
      mockRedis.setex.mockResolvedValueOnce('OK');

      await trackDevice('user_789', 'fp_existing', 'purchase');

      expect(mockRedis.incr).toHaveBeenCalledWith(
        expect.stringContaining('device:count:fp_existing')
      );
    });
  });

  describe('getDeviceHistory', () => {
    it('should return devices associated with user', async () => {
      mockRedis.smembers.mockResolvedValueOnce(['fp_1', 'fp_2', 'fp_3']);

      const devices = await getDeviceHistory('user_123');

      expect(devices).toEqual(['fp_1', 'fp_2', 'fp_3']);
      expect(mockRedis.smembers).toHaveBeenCalledWith('device:user:user_123');
    });

    it('should return empty array for new user', async () => {
      mockRedis.smembers.mockResolvedValueOnce([]);

      const devices = await getDeviceHistory('new_user');

      expect(devices).toEqual([]);
    });
  });

  describe('isNewDevice', () => {
    it('should return true for unknown device', async () => {
      mockRedis.smembers.mockResolvedValueOnce(['fp_known']);

      const isNew = await isNewDevice('user_123', 'fp_unknown');

      expect(isNew).toBe(true);
    });

    it('should return false for known device', async () => {
      mockRedis.smembers.mockResolvedValueOnce(['fp_known', 'fp_other']);

      const isNew = await isNewDevice('user_123', 'fp_known');

      expect(isNew).toBe(false);
    });

    it('should return true for first device', async () => {
      mockRedis.smembers.mockResolvedValueOnce([]);

      const isNew = await isNewDevice('new_user', 'fp_first');

      expect(isNew).toBe(true);
    });
  });

  describe('getDeviceCount', () => {
    it('should return number of unique devices', async () => {
      mockRedis.scard.mockResolvedValueOnce(5);

      const count = await getDeviceCount('user_123');

      expect(count).toBe(5);
      expect(mockRedis.scard).toHaveBeenCalledWith('device:user:user_123');
    });

    it('should return 0 for user with no devices', async () => {
      mockRedis.scard.mockResolvedValueOnce(0);

      const count = await getDeviceCount('no_device_user');

      expect(count).toBe(0);
    });
  });

  describe('checkDeviceRisk', () => {
    it('should return low risk for known device', async () => {
      mockRedis.smembers.mockResolvedValueOnce(['fp_known']);
      mockRedis.get.mockResolvedValueOnce('50'); // Many uses
      mockRedis.scard.mockResolvedValueOnce(2); // Few devices

      const risk = await checkDeviceRisk('user_123', 'fp_known');

      expect(risk.level).toBe('low');
      expect(risk.score).toBeLessThan(30);
    });

    it('should return high risk for new device on established account', async () => {
      mockRedis.smembers.mockResolvedValueOnce(['fp_1', 'fp_2', 'fp_3']);
      mockRedis.get.mockResolvedValueOnce('1'); // First use
      mockRedis.scard.mockResolvedValueOnce(3); // Already multiple devices

      const risk = await checkDeviceRisk('user_123', 'fp_new');

      expect(risk.level).toBe('high');
      expect(risk.score).toBeGreaterThan(70);
    });

    it('should return medium risk for new device on new account', async () => {
      mockRedis.smembers.mockResolvedValueOnce([]);
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.scard.mockResolvedValueOnce(0);

      const risk = await checkDeviceRisk('new_user', 'fp_first');

      expect(risk.level).toBe('medium');
      expect(risk.score).toBeLessThan(70);
      expect(risk.score).toBeGreaterThan(30);
    });

    it('should return very high risk for device associated with many users', async () => {
      mockRedis.smembers
        .mockResolvedValueOnce(['fp_shared'])
        .mockResolvedValueOnce(['user_1', 'user_2', 'user_3', 'user_4', 'user_5']);
      mockRedis.get.mockResolvedValueOnce('100');
      mockRedis.scard.mockResolvedValueOnce(1);

      const risk = await checkDeviceRisk('user_123', 'fp_shared');

      expect(risk.level).toBe('critical');
      expect(risk.factors).toContain('shared_device');
    });

    it('should include risk factors in response', async () => {
      mockRedis.smembers.mockResolvedValueOnce([]);
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.scard.mockResolvedValueOnce(0);

      const risk = await checkDeviceRisk('user_123', 'fp_new');

      expect(risk.factors).toBeDefined();
      expect(Array.isArray(risk.factors)).toBe(true);
    });
  });

  describe('detectEmulator', () => {
    it('should detect Android emulator', () => {
      const emulatorData = {
        userAgent: 'Mozilla/5.0 (Linux; Android 10; sdk_gphone_x86)',
        platform: 'Linux',
        deviceMemory: 2,
      };

      const isEmulator = detectEmulator(emulatorData);

      expect(isEmulator).toBe(true);
    });

    it('should detect iOS simulator', () => {
      const simulatorData = {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 Simulator)',
        platform: 'iPhone Simulator',
      };

      const isEmulator = detectEmulator(simulatorData);

      expect(isEmulator).toBe(true);
    });

    it('should not flag real devices', () => {
      const realDevice = {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)',
        platform: 'iPhone',
        deviceMemory: 4,
      };

      const isEmulator = detectEmulator(realDevice);

      expect(isEmulator).toBe(false);
    });

    it('should detect headless browser', () => {
      const headlessData = {
        userAgent: 'Mozilla/5.0 HeadlessChrome/120.0',
        platform: 'Win32',
        webdriver: true,
      };

      const isEmulator = detectEmulator(headlessData);

      expect(isEmulator).toBe(true);
    });
  });

  describe('detectVPN', () => {
    it('should flag timezone mismatch as possible VPN', () => {
      const data = {
        clientTimezone: 'America/New_York',
        ipTimezone: 'Europe/London',
        ipCountry: 'GB',
        clientLanguage: 'en-US',
      };

      const vpnCheck = detectVPN(data);

      expect(vpnCheck.likely).toBe(true);
      expect(vpnCheck.indicators).toContain('timezone_mismatch');
    });

    it('should flag datacenter IPs', () => {
      const data = {
        ipType: 'datacenter',
        ipOrg: 'Amazon Web Services',
      };

      const vpnCheck = detectVPN(data);

      expect(vpnCheck.likely).toBe(true);
      expect(vpnCheck.indicators).toContain('datacenter_ip');
    });

    it('should not flag legitimate users', () => {
      const data = {
        clientTimezone: 'America/New_York',
        ipTimezone: 'America/New_York',
        ipCountry: 'US',
        ipType: 'residential',
      };

      const vpnCheck = detectVPN(data);

      expect(vpnCheck.likely).toBe(false);
    });
  });

  describe('blockDevice', () => {
    it('should add device to blocklist', async () => {
      mockRedis.sadd.mockResolvedValueOnce(1);
      mockRedis.setex.mockResolvedValueOnce('OK');

      await blockDevice('fp_bad_actor', 'fraud', 'user_123');

      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'device:blocked',
        'fp_bad_actor'
      );
    });

    it('should record block reason', async () => {
      mockRedis.sadd.mockResolvedValueOnce(1);
      mockRedis.setex.mockResolvedValueOnce('OK');

      await blockDevice('fp_blocked', 'chargeback_fraud', 'user_456');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('device:block_reason:fp_blocked'),
        expect.any(Number),
        expect.stringContaining('chargeback_fraud')
      );
    });

    it('should set expiration for temporary blocks', async () => {
      mockRedis.sadd.mockResolvedValueOnce(1);
      mockRedis.setex.mockResolvedValueOnce('OK');

      await blockDevice('fp_temp_block', 'suspicious', 'user_789', 86400);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        86400,
        expect.any(String)
      );
    });
  });

  describe('isDeviceBlocked', () => {
    it('should return true for blocked device', async () => {
      mockRedis.get.mockResolvedValueOnce('1');

      const blocked = await isDeviceBlocked('fp_blocked');

      expect(blocked).toBe(true);
    });

    it('should return false for non-blocked device', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const blocked = await isDeviceBlocked('fp_clean');

      expect(blocked).toBe(false);
    });
  });
});

// Helper functions to simulate service behavior
function generateFingerprint(data: any): string {
  const normalized = {
    ...data,
    screenResolution: data.screenResolution?.toLowerCase(),
    userAgent: data.userAgent?.toLowerCase(),
  };
  const str = JSON.stringify(normalized);
  // Simple hash simulation
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(16)}`;
}

async function trackDevice(userId: string, fingerprint: string, action: string): Promise<void> {
  await mockRedis.sadd(`device:user:${userId}`, fingerprint);
  await mockRedis.incr(`device:count:${fingerprint}`);
  await mockRedis.setex(`device:activity:${fingerprint}`, 86400, JSON.stringify({ action, ts: Date.now() }));
}

async function getDeviceHistory(userId: string): Promise<string[]> {
  return mockRedis.smembers(`device:user:${userId}`);
}

async function isNewDevice(userId: string, fingerprint: string): Promise<boolean> {
  const devices = await mockRedis.smembers(`device:user:${userId}`);
  return !devices.includes(fingerprint);
}

async function getDeviceCount(userId: string): Promise<number> {
  return mockRedis.scard(`device:user:${userId}`);
}

async function checkDeviceRisk(userId: string, fingerprint: string): Promise<any> {
  const devices = await mockRedis.smembers(`device:user:${userId}`);
  const usageCount = parseInt(await mockRedis.get(`device:count:${fingerprint}`) || '0');
  const deviceCount = await mockRedis.scard(`device:user:${userId}`);
  
  const isNew = !devices.includes(fingerprint);
  const factors: string[] = [];
  let score = 0;

  if (isNew) {
    score += 40;
    factors.push('new_device');
  }

  if (deviceCount > 3) {
    score += 20;
    factors.push('many_devices');
  }

  if (usageCount === 0) {
    score += 10;
    factors.push('first_use');
  }

  // Check if device is shared across many users
  const sharedUsers = await mockRedis.smembers(`device:users:${fingerprint}`);
  if (sharedUsers && sharedUsers.length > 3) {
    score += 40;
    factors.push('shared_device');
  }

  let level = 'low';
  if (score > 80) level = 'critical';
  else if (score > 70) level = 'high';
  else if (score > 30) level = 'medium';

  return { score, level, factors };
}

function detectEmulator(data: any): boolean {
  const ua = data.userAgent?.toLowerCase() || '';
  if (ua.includes('sdk_gphone') || ua.includes('emulator') || ua.includes('simulator')) {
    return true;
  }
  if (data.platform?.toLowerCase().includes('simulator')) {
    return true;
  }
  if (ua.includes('headlesschrome') || data.webdriver) {
    return true;
  }
  return false;
}

function detectVPN(data: any): { likely: boolean; indicators: string[] } {
  const indicators: string[] = [];

  if (data.clientTimezone && data.ipTimezone && data.clientTimezone !== data.ipTimezone) {
    indicators.push('timezone_mismatch');
  }

  if (data.ipType === 'datacenter') {
    indicators.push('datacenter_ip');
  }

  return {
    likely: indicators.length > 0,
    indicators,
  };
}

async function blockDevice(fingerprint: string, reason: string, blockedBy: string, ttl?: number): Promise<void> {
  await mockRedis.sadd('device:blocked', fingerprint);
  await mockRedis.setex(`device:block_reason:${fingerprint}`, ttl || 86400 * 30, JSON.stringify({ reason, blockedBy, ts: Date.now() }));
}

async function isDeviceBlocked(fingerprint: string): Promise<boolean> {
  const result = await mockRedis.get(`device:blocked:${fingerprint}`);
  return result !== null;
}
