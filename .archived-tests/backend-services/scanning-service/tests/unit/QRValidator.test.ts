import QRValidator from '../../src/services/QRValidator';
import { getPool } from '../../src/config/database';
import { getRedis } from '../../src/config/redis';
import crypto from 'crypto';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/config/redis');
jest.mock('../../src/utils/logger');

describe('QRValidator', () => {
  let validator: QRValidator;
  let mockPool: any;
  let mockRedis: any;
  let mockClient: any;

  beforeEach(() => {
    // Setup mocks
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn()
    };

    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn()
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);
    (getRedis as jest.Mock).mockReturnValue(mockRedis);

    // Set required environment variable
    process.env.HMAC_SECRET = 'test-secret-key-32-characters-long';
    
    validator = new QRValidator();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw error if HMAC_SECRET not set', () => {
      delete process.env.HMAC_SECRET;
      expect(() => new QRValidator()).toThrow('HMAC_SECRET environment variable is required');
    });

    it('should initialize with HMAC_SECRET from environment', () => {
      process.env.HMAC_SECRET = 'test-secret';
      const val = new QRValidator();
      expect(val).toBeDefined();
    });
  });

  describe('validateQRToken', () => {
    it('should reject expired QR code', async () => {
      const ticketId = 'test-ticket-123';
      const oldTimestamp = String(Date.now() - 60000); // 60 seconds ago
      const nonce = 'test-nonce';
      const hmac = 'test-hmac';

      const result = await validator.validateQRToken(ticketId, oldTimestamp, nonce, hmac);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('QR_EXPIRED');
    });

    it('should reject QR with already-used nonce', async () => {
      const ticketId = 'test-ticket-123';
      const timestamp = String(Date.now());
      const nonce = 'used-nonce';
      const hmac = 'test-hmac';

      mockRedis.get.mockResolvedValue('1'); // Nonce already used

      const result = await validator.validateQRToken(ticketId, timestamp, nonce, hmac);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('QR_ALREADY_USED');
      expect(mockRedis.get).toHaveBeenCalledWith(`qr-nonce:${nonce}`);
    });

    it('should reject QR with invalid HMAC', async () => {
      const ticketId = 'test-ticket-123';
      const timestamp = String(Date.now());
      const nonce = 'new-nonce';
      const invalidHmac = 'invalid-hmac-signature';

      mockRedis.get.mockResolvedValue(null); // Nonce not used

      const result = await validator.validateQRToken(ticketId, timestamp, nonce, invalidHmac);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_QR');
    });

    it('should accept valid QR code and mark nonce as used', async () => {
      const ticketId = 'test-ticket-123';
      const timestamp = String(Date.now());
      const nonce = 'new-nonce';
      
      // Generate valid HMAC
      const data = `${ticketId}:${timestamp}:${nonce}`;
      const validHmac = crypto
        .createHmac('sha256', process.env.HMAC_SECRET!)
        .update(data)
        .digest('hex');

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const result = await validator.validateQRToken(ticketId, timestamp, nonce, validHmac);

      expect(result.valid).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith(`qr-nonce:${nonce}`, 60, '1');
    });
  });

  describe('checkDuplicate', () => {
    it('should return duplicate if found in Redis cache', async () => {
      const ticketId = 'test-ticket-123';
      const windowMinutes = 10;
      const cachedTime = new Date().toISOString();

      mockRedis.get.mockResolvedValue(cachedTime);

      const result = await validator.checkDuplicate(ticketId, windowMinutes);

      expect(result.isDuplicate).toBe(true);
      expect(result.lastScan).toBe(cachedTime);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should check database if not in cache', async () => {
      const ticketId = 'test-ticket-123';
      const windowMinutes = 10;
      const scannedAt = new Date();

      mockRedis.get.mockResolvedValue(null);
      mockPool.query.mockResolvedValue({
        rows: [{ scanned_at: scannedAt }]
      });

      const result = await validator.checkDuplicate(ticketId, windowMinutes);

      expect(result.isDuplicate).toBe(true);
      expect(result.lastScan).toBe(scannedAt);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should return not duplicate if no recent scans', async () => {
      const ticketId = 'test-ticket-123';
      const windowMinutes = 10;

      mockRedis.get.mockResolvedValue(null);
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await validator.checkDuplicate(ticketId, windowMinutes);

      expect(result.isDuplicate).toBe(false);
    });

    it('should throw error for invalid window minutes', async () => {
      const ticketId = 'test-ticket-123';
      const invalidWindow = -5;

      await expect(validator.checkDuplicate(ticketId, invalidWindow))
        .rejects.toThrow('Invalid window: must be 0-1440 minutes');
    });

    it('should throw error for window exceeding max', async () => {
      const ticketId = 'test-ticket-123';
      const tooLargeWindow = 2000;

      await expect(validator.checkDuplicate(ticketId, tooLargeWindow))
        .rejects.toThrow('Invalid window: must be 0-1440 minutes');
    });
  });

  describe('checkReentryPolicy', () => {
    it('should deny reentry if no policy exists', async () => {
      const ticketId = 'test-ticket-123';
      const eventId = 'test-event-456';
      
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await validator.checkReentryPolicy(ticketId, eventId, 1, null);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('NO_REENTRY');
    });

    it('should deny if reentry disabled in policy', async () => {
      const ticketId = 'test-ticket-123';
      const eventId = 'test-event-456';
      
      mockPool.query.mockResolvedValue({
        rows: [{ config: { enabled: false } }]
      });

      const result = await validator.checkReentryPolicy(ticketId, eventId, 1, null);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('REENTRY_DISABLED');
    });

    it('should deny if max reentries reached', async () => {
      const ticketId = 'test-ticket-123';
      const eventId = 'test-event-456';
      const scanCount = 5;
      
      mockPool.query.mockResolvedValue({
        rows: [{ config: { enabled: true, max_reentries: 5 } }]
      });

      const result = await validator.checkReentryPolicy(ticketId, eventId, scanCount, null);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('MAX_REENTRIES_REACHED');
    });

    it('should deny if within cooldown period', async () => {
      const ticketId = 'test-ticket-123';
      const eventId = 'test-event-456';
      const lastScannedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      
      mockPool.query.mockResolvedValue({
        rows: [{
          config: {
            enabled: true,
            max_reentries: 10,
            cooldown_minutes: 10
          }
        }]
      });

      const result = await validator.checkReentryPolicy(ticketId, eventId, 1, lastScannedAt);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('COOLDOWN_ACTIVE');
      expect(result.minutesRemaining).toBeGreaterThan(0);
    });

    it('should allow reentry if conditions met', async () => {
      const ticketId = 'test-ticket-123';
      const eventId = 'test-event-456';
      const lastScannedAt = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      
      mockPool.query.mockResolvedValue({
        rows: [{
          config: {
            enabled: true,
            max_reentries: 10,
            cooldown_minutes: 10
          }
        }]
      });

      const result = await validator.checkReentryPolicy(ticketId, eventId, 2, lastScannedAt);

      expect(result.allowed).toBe(true);
    });
  });

  describe('checkAccessZone', () => {
    it('should allow GA ticket in GA zone', async () => {
      const result = await validator.checkAccessZone('GA', 'GA');
      expect(result.allowed).toBe(true);
    });

    it('should deny GA ticket in VIP zone', async () => {
      const result = await validator.checkAccessZone('GA', 'VIP');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('WRONG_ZONE');
    });

    it('should allow VIP ticket in GA zone', async () => {
      const result = await validator.checkAccessZone('VIP', 'GA');
      expect(result.allowed).toBe(true);
    });

    it('should allow VIP ticket in VIP zone', async () => {
      const result = await validator.checkAccessZone('VIP', 'VIP');
      expect(result.allowed).toBe(true);
    });

    it('should deny VIP ticket in BACKSTAGE zone', async () => {
      const result = await validator.checkAccessZone('VIP', 'BACKSTAGE');
      expect(result.allowed).toBe(false);
    });

    it('should allow BACKSTAGE ticket only in BACKSTAGE', async () => {
      const result = await validator.checkAccessZone('BACKSTAGE', 'BACKSTAGE');
      expect(result.allowed).toBe(true);

      const gaResult = await validator.checkAccessZone('BACKSTAGE', 'GA');
      expect(gaResult.allowed).toBe(false);
    });

    it('should allow ALL access to any zone', async () => {
      const zones = ['GA', 'VIP', 'BACKSTAGE'];
      
      for (const zone of zones) {
        const result = await validator.checkAccessZone('ALL', zone);
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('getScanStats', () => {
    it('should return scan statistics for valid time range', async () => {
      const eventId = 'test-event-123';
      const stats = {
        allowed: 100,
        denied: 10,
        duplicates: 5,
        wrong_zone: 3,
        reentry_denied: 2,
        total: 110
      };

      mockPool.query.mockResolvedValue({ rows: [stats] });

      const result = await validator.getScanStats(eventId, '1 hour');

      expect(result).toEqual(stats);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('make_interval(hours =>'),
        [eventId, 1]
      );
    });

    it('should throw error for invalid time range', async () => {
      const eventId = 'test-event-123';

      await expect(validator.getScanStats(eventId, 'invalid-range'))
        .rejects.toThrow('Invalid time range');
    });

    it('should support various time ranges', async () => {
      const eventId = 'test-event-123';
      const validRanges = ['1 hour', '6 hours', '24 hours', '7 days', '30 days'];

      mockPool.query.mockResolvedValue({ rows: [{}] });

      for (const range of validRanges) {
        await validator.getScanStats(eventId, range);
        expect(mockPool.query).toHaveBeenCalled();
      }
    });
  });

  describe('logScan', () => {
    it('should log scan attempt to database', async () => {
      const ticketId = 'test-ticket-123';
      const deviceId = 'test-device-456';
      const result = 'ALLOW';
      const reason = 'VALID_ENTRY';

      mockClient.query.mockResolvedValue({});

      await validator.logScan(mockClient, ticketId, deviceId, result, reason);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scans'),
        [ticketId, deviceId, result, reason]
      );
    });
  });
});
