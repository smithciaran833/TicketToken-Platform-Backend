// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/services/OfflineCache.ts
 */

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');
jest.mock('crypto');

describe('src/services/OfflineCache.ts - Comprehensive Unit Tests', () => {
  let OfflineCache: any;
  let getPool: any;
  let logger: any;
  let crypto: any;
  let mockPool: any;
  let mockClient: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };

    // Setup mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    // Setup mock pool
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
    };

    // Import mocked modules
    ({ getPool } = require('../../../src/config/database'));
    logger = require('../../../src/utils/logger').default;
    crypto = require('crypto');

    getPool.mockReturnValue(mockPool);

    // Mock crypto
    crypto.randomBytes = jest.fn().mockReturnValue({
      toString: jest.fn().mockReturnValue('mock-hmac-secret-hex'),
    });

    const mockHmac = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mock-validation-hash'),
    };
    crypto.createHmac = jest.fn().mockReturnValue(mockHmac);

    // Import class under test
    OfflineCache = require('../../../src/services/OfflineCache').default;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Helper to create fresh ticket data (prevent mutation issues)
  const createMockTickets = () => [
    {
      id: 'ticket-1',
      ticket_number: 'TKT-001',
      status: 'SOLD',
      qr_hmac_secret: 'existing-secret-1',
      section: 'A',
      row_number: '10',
      seat_number: '5',
      event_name: 'Test Event',
      event_date: new Date(),
    },
    {
      id: 'ticket-2',
      ticket_number: 'TKT-002',
      status: 'TRANSFERRED',
      qr_hmac_secret: null,
      section: 'B',
      row_number: '12',
      seat_number: '8',
      event_name: 'Test Event',
      event_date: new Date(),
    },
  ];

  // =============================================================================
  // Constructor
  // =============================================================================

  describe('constructor()', () => {
    it('should use default cache window of 30 minutes', () => {
      delete process.env.OFFLINE_CACHE_DURATION_MINUTES;

      const offlineCache = new OfflineCache();

      expect(offlineCache.cacheWindowMinutes).toBe(30);
    });

    it('should use cache window from environment variable', () => {
      process.env.OFFLINE_CACHE_DURATION_MINUTES = '60';

      const offlineCache = new OfflineCache();

      expect(offlineCache.cacheWindowMinutes).toBe(60);
    });

    it('should parse cache window as integer', () => {
      process.env.OFFLINE_CACHE_DURATION_MINUTES = '45';

      const offlineCache = new OfflineCache();

      expect(offlineCache.cacheWindowMinutes).toBe(45);
    });
  });

  // =============================================================================
  // generateEventCache()
  // =============================================================================

  describe('generateEventCache()', () => {
    it('should successfully generate cache for event with tickets', async () => {
      const mockTickets = createMockTickets();
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: mockTickets }) // SELECT tickets
        .mockResolvedValueOnce(undefined) // UPDATE ticket HMAC
        .mockResolvedValueOnce(undefined) // DELETE old cache
        .mockResolvedValueOnce(undefined) // INSERT cache entry 1
        .mockResolvedValueOnce(undefined) // INSERT cache entry 2
        .mockResolvedValueOnce(undefined); // COMMIT

      const offlineCache = new OfflineCache();
      const result = await offlineCache.generateEventCache('event-123');

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('event-123');
      expect(result.ticketCount).toBe(2);
      expect(result.validFrom).toBeInstanceOf(Date);
      expect(result.validUntil).toBeInstanceOf(Date);
      expect(result.cacheSize).toBeGreaterThan(0);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Generated offline cache'));
    });

    it('should generate HMAC secret for tickets without one', async () => {
      const mockTickets = createMockTickets();
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTickets[1]] }) // SELECT (ticket without secret)
        .mockResolvedValueOnce(undefined) // UPDATE with new HMAC
        .mockResolvedValueOnce(undefined) // DELETE old cache
        .mockResolvedValueOnce(undefined) // INSERT cache entry
        .mockResolvedValueOnce(undefined); // COMMIT

      const offlineCache = new OfflineCache();
      await offlineCache.generateEventCache('event-123');

      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE tickets SET qr_hmac_secret = $1 WHERE id = $2',
        ['mock-hmac-secret-hex', 'ticket-2']
      );
    });

    it('should not generate HMAC secret for tickets that already have one', async () => {
      const mockTickets = createMockTickets();
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTickets[0]] }) // SELECT (ticket with secret)
        .mockResolvedValueOnce(undefined) // DELETE old cache
        .mockResolvedValueOnce(undefined) // INSERT cache entry
        .mockResolvedValueOnce(undefined); // COMMIT

      const offlineCache = new OfflineCache();
      await offlineCache.generateEventCache('event-123');

      expect(crypto.randomBytes).not.toHaveBeenCalled();
    });

    it('should create validation hashes using HMAC', async () => {
      const mockTickets = createMockTickets();
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTickets[0]] })
        .mockResolvedValueOnce(undefined) // DELETE
        .mockResolvedValueOnce(undefined) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const offlineCache = new OfflineCache();
      await offlineCache.generateEventCache('event-123');

      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', 'existing-secret-1');
      expect(crypto.createHmac().update).toHaveBeenCalled();
      expect(crypto.createHmac().digest).toHaveBeenCalledWith('hex');
    });

    it('should delete old cache entries before inserting new ones', async () => {
      const mockTickets = createMockTickets();
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTickets[0]] })
        .mockResolvedValueOnce(undefined) // DELETE
        .mockResolvedValueOnce(undefined) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const offlineCache = new OfflineCache();
      await offlineCache.generateEventCache('event-123');

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM offline_validation_cache WHERE event_id = $1 AND valid_until < NOW()',
        ['event-123']
      );
    });

    it('should use ON CONFLICT for upsert behavior', async () => {
      const mockTickets = createMockTickets();
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTickets[0]] })
        .mockResolvedValueOnce(undefined) // DELETE
        .mockResolvedValueOnce(undefined) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const offlineCache = new OfflineCache();
      await offlineCache.generateEventCache('event-123');

      const insertCall = mockClient.query.mock.calls.find(call =>
        call[0]?.includes('INSERT INTO offline_validation_cache')
      );
      expect(insertCall[0]).toContain('ON CONFLICT');
      expect(insertCall[0]).toContain('DO UPDATE');
    });

    it('should calculate validUntil based on cache window', async () => {
      process.env.OFFLINE_CACHE_DURATION_MINUTES = '60';
      const mockTickets = createMockTickets();
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTickets[0]] })
        .mockResolvedValueOnce(undefined) // DELETE
        .mockResolvedValueOnce(undefined) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const offlineCache = new OfflineCache();
      const result = await offlineCache.generateEventCache('event-123');

      const expectedDuration = 60 * 60 * 1000; // 60 minutes in ms
      const actualDuration = result.validUntil.getTime() - result.validFrom.getTime();
      expect(actualDuration).toBe(expectedDuration);
    });

    it('should handle event with no tickets', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT (no tickets)
        .mockResolvedValueOnce(undefined) // DELETE
        .mockResolvedValueOnce(undefined); // COMMIT

      const offlineCache = new OfflineCache();
      const result = await offlineCache.generateEventCache('event-123');

      expect(result.success).toBe(true);
      expect(result.ticketCount).toBe(0);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback transaction on error', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // SELECT fails

      const offlineCache = new OfflineCache();

      await expect(offlineCache.generateEventCache('event-123')).rejects.toThrow('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(logger.error).toHaveBeenCalledWith('Error generating offline cache:', expect.any(Error));
    });

    it('should release client in finally block even on error', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      const offlineCache = new OfflineCache();

      await expect(offlineCache.generateEventCache('event-123')).rejects.toThrow();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should include ticket data in cache entries', async () => {
      const mockTickets = createMockTickets();
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTickets[0]] })
        .mockResolvedValueOnce(undefined) // DELETE
        .mockResolvedValueOnce(undefined) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const offlineCache = new OfflineCache();
      await offlineCache.generateEventCache('event-123');

      const insertCall = mockClient.query.mock.calls.find(call =>
        call[0]?.includes('INSERT INTO offline_validation_cache')
      );
      const ticketData = JSON.parse(insertCall[1][5]);
      expect(ticketData).toMatchObject({
        ticketNumber: 'TKT-001',
        status: 'SOLD',
        section: 'A',
        row: '10',
        seat: '5',
        eventName: 'Test Event',
      });
    });
  });

  // =============================================================================
  // getDeviceCache()
  // =============================================================================

  describe('getDeviceCache()', () => {
    const mockDevice = {
      device_id: 'device-123',
      is_active: true,
      can_scan_offline: true,
    };

    const mockCacheEntries = [
      {
        ticket_id: 'ticket-1',
        validation_hash: 'hash-1',
        ticket_data: { ticketNumber: 'TKT-001' },
        valid_until: new Date(),
      },
      {
        ticket_id: 'ticket-2',
        validation_hash: 'hash-2',
        ticket_data: { ticketNumber: 'TKT-002' },
        valid_until: new Date(),
      },
    ];

    it('should successfully get cache for authorized device', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDevice] }) // SELECT device
        .mockResolvedValueOnce({ rows: mockCacheEntries }) // SELECT cache
        .mockResolvedValueOnce(undefined); // UPDATE last_sync_at

      const offlineCache = new OfflineCache();
      const result = await offlineCache.getDeviceCache('device-123', 'event-123');

      expect(result.success).toBe(true);
      expect(result.deviceId).toBe('device-123');
      expect(result.eventId).toBe('event-123');
      expect(result.entries).toEqual(mockCacheEntries);
      expect(result.syncedAt).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Retrieved offline cache'));
    });

    it('should update device last_sync_at timestamp', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDevice] })
        .mockResolvedValueOnce({ rows: mockCacheEntries })
        .mockResolvedValueOnce(undefined);

      const offlineCache = new OfflineCache();
      await offlineCache.getDeviceCache('device-123', 'event-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',
        ['device-123']
      );
    });

    it('should throw error when device not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No device found

      const offlineCache = new OfflineCache();

      await expect(offlineCache.getDeviceCache('device-999', 'event-123')).rejects.toThrow(
        'Device not authorized for offline scanning'
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should throw error when device is not active', async () => {
      // SQL WHERE clause filters out inactive devices, so query returns empty rows
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const offlineCache = new OfflineCache();

      await expect(offlineCache.getDeviceCache('device-123', 'event-123')).rejects.toThrow(
        'Device not authorized for offline scanning'
      );
    });

    it('should throw error when device cannot scan offline', async () => {
      // SQL WHERE clause filters out devices without offline capability, returns empty rows
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const offlineCache = new OfflineCache();

      await expect(offlineCache.getDeviceCache('device-123', 'event-123')).rejects.toThrow(
        'Device not authorized for offline scanning'
      );
    });

    it('should return empty entries when no cache found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDevice] })
        .mockResolvedValueOnce({ rows: [] }) // No cache entries
        .mockResolvedValueOnce(undefined);

      const offlineCache = new OfflineCache();
      const result = await offlineCache.getDeviceCache('device-123', 'event-123');

      expect(result.success).toBe(true);
      expect(result.entries).toEqual([]);
    });

    it('should query cache with time validity checks', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDevice] })
        .mockResolvedValueOnce({ rows: mockCacheEntries })
        .mockResolvedValueOnce(undefined);

      const offlineCache = new OfflineCache();
      await offlineCache.getDeviceCache('device-123', 'event-123');

      const cacheQuery = mockPool.query.mock.calls[1][0];
      expect(cacheQuery).toContain('valid_from <= NOW()');
      expect(cacheQuery).toContain('valid_until > NOW()');
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const offlineCache = new OfflineCache();

      await expect(offlineCache.getDeviceCache('device-123', 'event-123')).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Error getting device cache:', expect.any(Error));
    });
  });

  // =============================================================================
  // validateOfflineScan()
  // =============================================================================

  describe('validateOfflineScan()', () => {
    const mockCacheEntry = {
      ticket_id: 'ticket-123',
      event_id: 'event-123',
      validation_hash: 'valid-hash',
      ticket_data: { ticketNumber: 'TKT-001', status: 'SOLD' },
      valid_until: new Date(Date.now() + 3600000), // 1 hour in future
    };

    it('should return valid result when scan is valid', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockCacheEntry] });

      const offlineCache = new OfflineCache();
      const result = await offlineCache.validateOfflineScan('ticket-123', 'valid-hash', 'event-123');

      expect(result.valid).toBe(true);
      expect(result.ticketData).toEqual(mockCacheEntry.ticket_data);
      expect(result.validUntil).toEqual(mockCacheEntry.valid_until);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid result when hash does not match', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No matching entry

      const offlineCache = new OfflineCache();
      const result = await offlineCache.validateOfflineScan('ticket-123', 'invalid-hash', 'event-123');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_OFFLINE_HASH');
      expect(result.message).toBe('Offline validation failed');
    });

    it('should query with all required parameters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockCacheEntry] });

      const offlineCache = new OfflineCache();
      await offlineCache.validateOfflineScan('ticket-123', 'valid-hash', 'event-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ticket_id = $1'),
        ['ticket-123', 'event-123', 'valid-hash']
      );
    });

    it('should check time validity in query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockCacheEntry] });

      const offlineCache = new OfflineCache();
      await offlineCache.validateOfflineScan('ticket-123', 'valid-hash', 'event-123');

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('valid_from <= NOW()');
      expect(query).toContain('valid_until > NOW()');
    });

    it('should return error result on database error without throwing', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const offlineCache = new OfflineCache();
      const result = await offlineCache.validateOfflineScan('ticket-123', 'valid-hash', 'event-123');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('VALIDATION_ERROR');
      expect(result.message).toBe('Failed to validate offline scan');
      expect(logger.error).toHaveBeenCalledWith('Error validating offline scan:', expect.any(Error));
    });

    it('should return invalid when ticket not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const offlineCache = new OfflineCache();
      const result = await offlineCache.validateOfflineScan('nonexistent-ticket', 'hash', 'event-123');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_OFFLINE_HASH');
    });

    it('should return invalid when event does not match', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // Wrong event_id in query

      const offlineCache = new OfflineCache();
      const result = await offlineCache.validateOfflineScan('ticket-123', 'valid-hash', 'wrong-event');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_OFFLINE_HASH');
    });
  });
});
