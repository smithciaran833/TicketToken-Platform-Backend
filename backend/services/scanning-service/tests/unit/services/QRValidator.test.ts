// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/services/QRValidator.ts
 */

jest.mock('../../../src/config/database');
jest.mock('../../../src/config/redis');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/QRGenerator');
jest.mock('crypto');

describe('src/services/QRValidator.ts - Comprehensive Unit Tests', () => {
  let QRValidator: any;
  let getPool: any;
  let getRedis: any;
  let logger: any;
  let crypto: any;
  let mockPool: any;
  let mockClient: any;
  let mockRedis: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.HMAC_SECRET = 'test-hmac-secret';

    // Mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    // Mock pool
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
    };

    // Mock Redis
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
    };

    // Import mocked modules
    ({ getPool } = require('../../../src/config/database'));
    ({ getRedis } = require('../../../src/config/redis'));
    logger = require('../../../src/utils/logger').default;
    crypto = require('crypto');

    getPool.mockReturnValue(mockPool);
    getRedis.mockReturnValue(mockRedis);

    // Mock crypto
    const mockHmac = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('expected-hmac'),
    };
    crypto.createHmac = jest.fn().mockReturnValue(mockHmac);
    crypto.timingSafeEqual = jest.fn().mockReturnValue(true);

    // Import class under test
    QRValidator = require('../../../src/services/QRValidator').default;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // Constructor
  // =============================================================================

  describe('constructor()', () => {
    it('should throw error if HMAC_SECRET not set', () => {
      delete process.env.HMAC_SECRET;

      expect(() => new QRValidator()).toThrow('FATAL: HMAC_SECRET environment variable is required');
    });

    it('should set HMAC secret from environment', () => {
      process.env.HMAC_SECRET = 'my-secret-key';

      const validator = new QRValidator();

      expect(validator.hmacSecret).toBe('my-secret-key');
    });

    it('should set time window to 30 seconds', () => {
      const validator = new QRValidator();

      expect(validator.timeWindowSeconds).toBe(30);
    });
  });

  // =============================================================================
  // validateQRToken()
  // =============================================================================

  describe('validateQRToken()', () => {
    it('should validate valid QR token', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null); // Nonce not used

      const validator = new QRValidator();
      const result = await validator.validateQRToken('ticket-123', String(now), 'nonce-abc', 'expected-hmac');

      expect(result.valid).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith('qr-nonce:nonce-abc');
      expect(mockRedis.setex).toHaveBeenCalledWith('qr-nonce:nonce-abc', 60, '1');
    });

    it('should reject expired QR token', async () => {
      const oldTimestamp = Date.now() - 35000; // 35 seconds ago

      const validator = new QRValidator();
      const result = await validator.validateQRToken('ticket-123', String(oldTimestamp), 'nonce', 'hmac');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('QR_EXPIRED');
    });

    it('should detect replay attack with used nonce', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue('1'); // Nonce already used

      const validator = new QRValidator();
      const result = await validator.validateQRToken('ticket-123', String(now), 'used-nonce', 'hmac');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('QR_ALREADY_USED');
      expect(logger.warn).toHaveBeenCalledWith(
        'Replay attack detected - nonce already used',
        expect.objectContaining({ nonce: 'used-nonce', ticketId: 'ticket-123' })
      );
    });

    it('should reject invalid HMAC', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null);
      crypto.timingSafeEqual.mockReturnValue(false); // HMAC mismatch

      const validator = new QRValidator();
      const result = await validator.validateQRToken('ticket-123', String(now), 'nonce', 'wrong-hmac');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_QR');
    });

    it('should use timing-safe comparison for HMAC', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null);

      const validator = new QRValidator();
      await validator.validateQRToken('ticket-123', String(now), 'nonce', 'hmac');

      expect(crypto.timingSafeEqual).toHaveBeenCalled();
    });

    it('should create HMAC with correct data format', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null);

      const validator = new QRValidator();
      await validator.validateQRToken('ticket-123', String(now), 'nonce-xyz', 'hmac');

      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', 'test-hmac-secret');
      expect(crypto.createHmac().update).toHaveBeenCalledWith(`ticket-123:${now}:nonce-xyz`);
    });
  });

  // =============================================================================
  // checkDuplicate()
  // =============================================================================

  describe('checkDuplicate()', () => {
    it('should return duplicate from Redis cache', async () => {
      mockRedis.get.mockResolvedValue('2024-01-01T12:00:00Z');

      const validator = new QRValidator();
      const result = await validator.checkDuplicate('ticket-123', 10);

      expect(result.isDuplicate).toBe(true);
      expect(result.lastScan).toBe('2024-01-01T12:00:00Z');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should check database when cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPool.query.mockResolvedValue({
        rows: [{ scanned_at: '2024-01-01T12:00:00Z' }],
      });

      const validator = new QRValidator();
      const result = await validator.checkDuplicate('ticket-123', 10);

      expect(result.isDuplicate).toBe(true);
      expect(result.lastScan).toBe('2024-01-01T12:00:00Z');
      expect(mockRedis.setex).toHaveBeenCalledWith('scan:duplicate:ticket-123', 600, '2024-01-01T12:00:00Z');
    });

    it('should return no duplicate when not found', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPool.query.mockResolvedValue({ rows: [] });

      const validator = new QRValidator();
      const result = await validator.checkDuplicate('ticket-123', 10);

      expect(result.isDuplicate).toBe(false);
      expect(result.lastScan).toBeUndefined();
    });

    it('should throw error for invalid window minutes', async () => {
      const validator = new QRValidator();

      await expect(validator.checkDuplicate('ticket-123', -5)).rejects.toThrow('Invalid window');
      await expect(validator.checkDuplicate('ticket-123', 2000)).rejects.toThrow('Invalid window');
      await expect(validator.checkDuplicate('ticket-123', NaN)).rejects.toThrow('Invalid window');
    });

    it('should use parameterized query to prevent SQL injection', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPool.query.mockResolvedValue({ rows: [] });

      const validator = new QRValidator();
      await validator.checkDuplicate('ticket-123', 15);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('make_interval(mins => $2)'),
        ['ticket-123', 15]
      );
    });
  });

  // =============================================================================
  // checkReentryPolicy()
  // =============================================================================

  describe('checkReentryPolicy()', () => {
    it('should deny re-entry when no policy exists', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const validator = new QRValidator();
      const result = await validator.checkReentryPolicy('ticket-123', 'event-456', 1, null);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('NO_REENTRY');
    });

    it('should deny re-entry when policy disabled', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ config: { enabled: false } }],
      });

      const validator = new QRValidator();
      const result = await validator.checkReentryPolicy('ticket-123', 'event-456', 1, null);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('REENTRY_DISABLED');
    });

    it('should deny when max re-entries reached', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ config: { enabled: true, max_reentries: 3, cooldown_minutes: 10 } }],
      });

      const validator = new QRValidator();
      const result = await validator.checkReentryPolicy('ticket-123', 'event-456', 3, null);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('MAX_REENTRIES_REACHED');
    });

    it('should deny when cooldown active', async () => {
      const recentScan = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      mockPool.query.mockResolvedValue({
        rows: [{ config: { enabled: true, max_reentries: 5, cooldown_minutes: 10 } }],
      });

      const validator = new QRValidator();
      const result = await validator.checkReentryPolicy('ticket-123', 'event-456', 1, recentScan);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('COOLDOWN_ACTIVE');
      expect(result.minutesRemaining).toBeGreaterThan(0);
    });

    it('should allow re-entry when policy satisfied', async () => {
      const oldScan = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      mockPool.query.mockResolvedValue({
        rows: [{ config: { enabled: true, max_reentries: 5, cooldown_minutes: 10 } }],
      });

      const validator = new QRValidator();
      const result = await validator.checkReentryPolicy('ticket-123', 'event-456', 1, oldScan);

      expect(result.allowed).toBe(true);
    });
  });

  // =============================================================================
  // checkAccessZone()
  // =============================================================================

  describe('checkAccessZone()', () => {
    it('should allow BACKSTAGE ticket in BACKSTAGE zone', async () => {
      const validator = new QRValidator();
      const result = await validator.checkAccessZone('BACKSTAGE', 'BACKSTAGE');

      expect(result.allowed).toBe(true);
    });

    it('should deny BACKSTAGE ticket in VIP zone', async () => {
      const validator = new QRValidator();
      const result = await validator.checkAccessZone('BACKSTAGE', 'VIP');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('WRONG_ZONE');
    });

    it('should allow VIP ticket in VIP and GA zones', async () => {
      const validator = new QRValidator();
      
      const vipResult = await validator.checkAccessZone('VIP', 'VIP');
      expect(vipResult.allowed).toBe(true);

      const gaResult = await validator.checkAccessZone('VIP', 'GA');
      expect(gaResult.allowed).toBe(true);
    });

    it('should allow GA ticket only in GA zone', async () => {
      const validator = new QRValidator();
      
      const gaResult = await validator.checkAccessZone('GA', 'GA');
      expect(gaResult.allowed).toBe(true);

      const vipResult = await validator.checkAccessZone('GA', 'VIP');
      expect(vipResult.allowed).toBe(false);
    });

    it('should allow ALL access level in any zone', async () => {
      const validator = new QRValidator();
      
      const backstage = await validator.checkAccessZone('ALL', 'BACKSTAGE');
      const vip = await validator.checkAccessZone('ALL', 'VIP');
      const ga = await validator.checkAccessZone('ALL', 'GA');

      expect(backstage.allowed).toBe(true);
      expect(vip.allowed).toBe(true);
      expect(ga.allowed).toBe(true);
    });

    it('should default to GA for unknown access levels', async () => {
      const validator = new QRValidator();
      
      const result = await validator.checkAccessZone('UNKNOWN', 'GA');
      expect(result.allowed).toBe(true);

      const wrongZone = await validator.checkAccessZone('UNKNOWN', 'VIP');
      expect(wrongZone.allowed).toBe(false);
    });
  });

  // =============================================================================
  // validateScan() - SUCCESS PATH
  // =============================================================================

  describe('validateScan() - Success Path', () => {
    const setupSuccessfulScan = () => {
      const now = Date.now();
      
      mockRedis.get.mockResolvedValue(null); // No nonce reuse
      mockRedis.del.mockResolvedValue(1);
      mockRedis.setex.mockResolvedValue('OK');

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ device_id: 'device-123', venue_id: 'venue-1', tenant_id: 'tenant-1', is_active: true, zone: 'GA', id: 'dev-id-1' }] }) // Device query
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123', 
          ticket_number: 'TKT-001',
          status: 'SOLD',
          access_level: 'GA',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
          event_name: 'Test Event',
          scan_count: 0,
          last_scanned_at: null,
        }] }) // Ticket query
        .mockResolvedValueOnce({ rows: [{ config: { window_minutes: 10 } }] }) // Duplicate policy
        .mockResolvedValueOnce(undefined) // UPDATE tickets
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      return now;
    };

    it('should allow valid scan with all checks passing', async () => {
      const now = setupSuccessfulScan();
      
      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce-abc:expected-hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(true);
      expect(result.result).toBe('ALLOW');
      expect(result.message).toBe('Entry allowed');
      expect(result.ticket).toMatchObject({
        id: 'ticket-123',
        ticket_number: 'TKT-001',
        event_name: 'Test Event',
      });
      expect(result.scan_count).toBe(1);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should parse QR data from string format', async () => {
      const now = setupSuccessfulScan();
      
      const validator = new QRValidator();
      await validator.validateScan(`ticket-123:${now}:nonce:hmac`, 'device-123');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM tickets'),
        ['ticket-123']
      );
    });

    it('should parse QR data from object format', async () => {
      const now = setupSuccessfulScan();
      
      const validator = new QRValidator();
      await validator.validateScan({
        ticketId: 'ticket-123',
        timestamp: String(now),
        nonce: 'nonce',
        hmac: 'expected-hmac',
      }, 'device-123');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM tickets'),
        ['ticket-123']
      );
    });

    it('should update ticket scan counts', async () => {
      setupSuccessfulScan();
      
      const validator = new QRValidator();
      await validator.validateScan('ticket-123:123456789:nonce:hmac', 'device-123');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tickets'),
        ['ticket-123']
      );
    });

    it('should clear and set Redis cache', async () => {
      setupSuccessfulScan();
      
      const validator = new QRValidator();
      await validator.validateScan('ticket-123:123456789:nonce:hmac', 'device-123');

      expect(mockRedis.del).toHaveBeenCalledWith('scan:duplicate:ticket-123');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'scan:duplicate:ticket-123',
        600,
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // validateScan() - QR TOKEN FAILURES
  // =============================================================================

  describe('validateScan() - QR Token Failures', () => {
    it('should deny expired QR code', async () => {
      const oldTimestamp = Date.now() - 35000;
      mockClient.query.mockResolvedValueOnce(undefined); // BEGIN
      mockClient.query.mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(`ticket-123:${oldTimestamp}:nonce:hmac`, 'device-123');

      expect(result.valid).toBe(false);
      expect(result.result).toBe('DENY');
      expect(result.reason).toBe('QR_EXPIRED');
      expect(result.message).toBe('QR code expired. Please refresh.');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should deny invalid QR format', async () => {
      mockClient.query.mockResolvedValueOnce(undefined); // BEGIN

      const validator = new QRValidator();
      const result = await validator.validateScan('invalid:format', 'device-123');

      expect(result.valid).toBe(false);
      expect(result.result).toBe('ERROR');
      expect(result.reason).toBe('SYSTEM_ERROR');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should deny replayed QR (nonce reuse)', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue('1'); // Nonce already used
      mockClient.query.mockResolvedValueOnce(undefined); // BEGIN
      mockClient.query.mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(`ticket-123:${now}:used-nonce:hmac`, 'device-123');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('QR_ALREADY_USED');
    });
  });

  // =============================================================================
  // validateScan() - DEVICE FAILURES
  // =============================================================================

  describe('validateScan() - Device Failures', () => {
    it('should deny inactive device', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null);
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Device not found
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(`ticket-123:${now}:nonce:hmac`, 'device-999');

      expect(result.valid).toBe(false);
      expect(result.result).toBe('DENY');
      expect(result.reason).toBe('UNAUTHORIZED_DEVICE');
      expect(result.message).toBe('Device not authorized');
    });

    it('should deny venue mismatch for staff', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null);
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ device_id: 'device-123', venue_id: 'venue-2', tenant_id: 'tenant-1', is_active: true, id: 'dev-1' }] }) // Wrong venue
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('VENUE_MISMATCH');
      expect(result.message).toBe('You can only scan tickets at your assigned venue');
      expect(logger.warn).toHaveBeenCalledWith(
        'Venue isolation violation - staff attempted to use device from different venue',
        expect.any(Object)
      );
    });

    it('should deny tenant mismatch for device', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null);
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ device_id: 'device-123', venue_id: 'venue-1', tenant_id: 'tenant-2', is_active: true, id: 'dev-1' }] }) // Wrong tenant
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('UNAUTHORIZED');
      expect(logger.error).toHaveBeenCalledWith(
        'CRITICAL: Tenant isolation violation detected',
        expect.any(Object)
      );
    });
  });

  // =============================================================================
  // validateScan() - TICKET FAILURES
  // =============================================================================

  describe('validateScan() - Ticket Failures', () => {
    const setupDeviceAndFailTicket = () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null);
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ device_id: 'device-123', venue_id: 'venue-1', tenant_id: 'tenant-1', is_active: true, zone: 'GA', id: 'dev-1' }] }); // Device query
      
      return now;
    };

    it('should deny ticket not found', async () => {
      const now = setupDeviceAndFailTicket();
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Ticket not found
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-999:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TICKET_NOT_FOUND');
    });

    it('should deny cross-tenant ticket access', async () => {
      const now = setupDeviceAndFailTicket();
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'ticket-123', tenant_id: 'tenant-2', venue_id: 'venue-1', event_id: 'event-1' }] }) // Wrong tenant
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TICKET_NOT_FOUND'); // Masked for security
      expect(logger.error).toHaveBeenCalledWith(
        'CRITICAL: Cross-tenant ticket scan attempt',
        expect.any(Object)
      );
    });

    it('should deny wrong venue ticket', async () => {
      const now = setupDeviceAndFailTicket();
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123', 
          tenant_id: 'tenant-1', 
          venue_id: 'venue-2',
          event_id: 'event-1',
        }] })
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('WRONG_VENUE');
      expect(result.message).toBe('This ticket is for a different venue');
    });

    it('should deny refunded ticket', async () => {
      const now = setupDeviceAndFailTicket();
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123',
          status: 'REFUNDED',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
        }] })
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TICKET_REFUNDED');
      expect(result.message).toBe('This ticket has been refunded and is no longer valid');
    });

    it('should deny cancelled ticket', async () => {
      const now = setupDeviceAndFailTicket();
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123',
          status: 'CANCELLED',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
        }] })
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TICKET_CANCELLED');
    });

    it('should deny transferred ticket', async () => {
      const now = setupDeviceAndFailTicket();
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123',
          status: 'TRANSFERRED',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
        }] })
        .mockResolvedValueOnce({ rows: [{ new_ticket_id: 'ticket-456' }] }) // Transfer record
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TICKET_TRANSFERRED');
      expect(result.message).toContain('ticket-456');
    });

    it('should deny invalid ticket status', async () => {
      const now = setupDeviceAndFailTicket();
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123',
          status: 'RESERVED',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
        }] })
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_STATUS');
    });
  });

  // =============================================================================
  // validateScan() - TIME-BASED FAILURES
  // =============================================================================

  describe('validateScan() - Time-Based Failures', () => {
    const setupDeviceAndTicket = () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null);
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ device_id: 'device-123', venue_id: 'venue-1', tenant_id: 'tenant-1', is_active: true, zone: 'GA', id: 'dev-1' }] }); // Device
      
      return now;
    };

    it('should deny ticket before event starts', async () => {
      const now = setupDeviceAndTicket();
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123',
          status: 'SOLD',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
          event_start_time: futureDate,
        }] })
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('EVENT_NOT_STARTED');
    });

    it('should deny ticket after event ends', async () => {
      const now = setupDeviceAndTicket();
      const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123',
          status: 'SOLD',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
          event_end_time: pastDate,
        }] })
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('EVENT_ENDED');
    });

    it('should deny ticket before valid_from date', async () => {
      const now = setupDeviceAndTicket();
      const futureDate = new Date(Date.now() + 3600000);
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123',
          status: 'SOLD',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
          valid_from: futureDate,
        }] })
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TICKET_NOT_YET_VALID');
    });

    it('should deny ticket after valid_until date', async () => {
      const now = setupDeviceAndTicket();
      const pastDate = new Date(Date.now() - 3600000);
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123',
          status: 'SOLD',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
          valid_until: pastDate,
        }] })
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TICKET_EXPIRED');
    });
  });

  // =============================================================================
  // validateScan() - ZONE AND DUPLICATE FAILURES
  // =============================================================================

  describe('validateScan() - Zone and Duplicate Failures', () => {
    it('should deny wrong access zone', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null);
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ device_id: 'device-123', venue_id: 'venue-1', tenant_id: 'tenant-1', is_active: true, zone: 'VIP', id: 'dev-1' }] }) // VIP zone
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123',
          status: 'SOLD',
          access_level: 'GA',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
          scan_count: 0,
        }] }) // GA ticket
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('WRONG_ZONE');
    });

    it('should deny duplicate scan without re-entry', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue('2024-01-01T12:00:00Z'); // Duplicate detected
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ device_id: 'device-123', venue_id: 'venue-1', tenant_id: 'tenant-1', is_active: true, zone: 'GA', id: 'dev-1' }] })
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123',
          status: 'SOLD',
          access_level: 'GA',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
          scan_count: 1,
          last_scanned_at: new Date(),
        }] })
        .mockResolvedValueOnce({ rows: [{ config: { window_minutes: 10 } }] }) // Duplicate policy
        .mockResolvedValueOnce({ rows: [] }) // No re-entry policy
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('DUPLICATE');
    });

    it('should deny duplicate with cooldown active', async () => {
      const now = Date.now();
      const recentScan = new Date(Date.now() - 5 * 60 * 1000);
      mockRedis.get.mockResolvedValue('2024-01-01T12:00:00Z');
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ device_id: 'device-123', venue_id: 'venue-1', tenant_id: 'tenant-1', is_active: true, zone: 'GA', id: 'dev-1' }] })
        .mockResolvedValueOnce({ rows: [{ 
          id: 'ticket-123',
          status: 'SOLD',
          access_level: 'GA',
          tenant_id: 'tenant-1',
          venue_id: 'venue-1',
          event_id: 'event-1',
          scan_count: 1,
          last_scanned_at: recentScan,
        }] })
        .mockResolvedValueOnce({ rows: [{ config: { window_minutes: 10 } }] })
        .mockResolvedValueOnce({ rows: [{ config: { enabled: true, max_reentries: 5, cooldown_minutes: 10 } }] }) // Re-entry policy
        .mockResolvedValueOnce(undefined) // INSERT scan log
        .mockResolvedValueOnce(undefined); // COMMIT

      const validator = new QRValidator();
      const result = await validator.validateScan(
        `ticket-123:${now}:nonce:hmac`,
        'device-123',
        null,
        null,
        { userId: 'user-1', tenantId: 'tenant-1', venueId: 'venue-1', role: 'staff' }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('COOLDOWN_ACTIVE');
      expect(result.message).toContain('Please wait');
    });
  });

  // =============================================================================
  // validateScan() - ERROR HANDLING
  // =============================================================================

  describe('validateScan() - Error Handling', () => {
    it('should rollback on database error', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null);
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // Device query fails

      const validator = new QRValidator();
      const result = await validator.validateScan(`ticket-123:${now}:nonce:hmac`, 'device-123');

      expect(result.valid).toBe(false);
      expect(result.result).toBe('ERROR');
      expect(result.reason).toBe('SYSTEM_ERROR');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Scan validation error:', expect.any(Error));
    });

    it('should release client in finally block', async () => {
      const now = Date.now();
      mockRedis.get.mockResolvedValue(null);
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Error'));

      const validator = new QRValidator();
      await validator.validateScan(`ticket-123:${now}:nonce:hmac`, 'device-123');

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // getScanStats()
  // =============================================================================

  describe('getScanStats()', () => {
    it('should return scan statistics', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          allowed: '100',
          denied: '20',
          duplicates: '10',
          wrong_zone: '5',
          reentry_denied: '3',
          total: '120',
        }],
      });

      const validator = new QRValidator();
      const result = await validator.getScanStats('event-123', '1 hour');

      expect(result).toMatchObject({
        allowed: '100',
        denied: '20',
        total: '120',
      });
    });

    it('should validate and whitelist time range', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });

      const validator = new QRValidator();

      await expect(validator.getScanStats('event-123', 'invalid range')).rejects.toThrow('Invalid time range');
    });

    it('should use parameterized query with hours', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });

      const validator = new QRValidator();
      await validator.getScanStats('event-123', '24 hours');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('make_interval(hours => $2)'),
        ['event-123', 24]
      );
    });
  });

  // =============================================================================
  // logScan()
  // =============================================================================

  describe('logScan()', () => {
    it('should log scan to database', async () => {
      mockClient.query.mockResolvedValue({});

      const validator = new QRValidator();
      await validator.logScan(mockClient, 'ticket-123', 'device-456', 'ALLOW', 'VALID_ENTRY');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scans'),
        ['ticket-123', 'device-456', 'ALLOW', 'VALID_ENTRY']
      );
    });
  });

  // =============================================================================
  // emitScanEvent()
  // =============================================================================

  describe('emitScanEvent()', () => {
    it('should log scan event', async () => {
      const ticket = { id: 'ticket-123' };
      const device = { id: 'device-456' };

      const validator = new QRValidator();
      await validator.emitScanEvent(ticket, device, 'ALLOW');

      expect(logger.info).toHaveBeenCalledWith('Scan event:', expect.objectContaining({
        ticketId: 'ticket-123',
        deviceId: 'device-456',
        result: 'ALLOW',
      }));
    });
  });
});
