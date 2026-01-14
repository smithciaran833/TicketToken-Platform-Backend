import OfflineCache from '../../src/services/OfflineCache';
import { getPool } from '../../src/config/database';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/utils/logger');

describe('OfflineCache', () => {
  let offlineCache: OfflineCache;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn()
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);

    // Mock transactions
    mockClient.query.mockImplementation((query: string) => {
      if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
        return Promise.resolve({});
      }
      return Promise.resolve({ rows: [] });
    });

    process.env.OFFLINE_CACHE_DURATION_MINUTES = '30';
    offlineCache = new OfflineCache();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.OFFLINE_CACHE_DURATION_MINUTES;
  });

  describe('constructor', () => {
    it('should use default cache duration if not set', () => {
      delete process.env.OFFLINE_CACHE_DURATION_MINUTES;
      const cache = new OfflineCache();
      expect(cache).toBeDefined();
    });

    it('should use custom cache duration from env', () => {
      process.env.OFFLINE_CACHE_DURATION_MINUTES = '60';
      const cache = new OfflineCache();
      expect(cache).toBeDefined();
    });
  });

  describe('generateEventCache', () => {
    it('should generate cache for event successfully', async () => {
      const eventId = 'event-123';
      const mockTickets = [
        {
          id: 'ticket-1',
          ticket_number: 'TKT-001',
          status: 'SOLD',
          qr_hmac_secret: 'secret1',
          section: 'A',
          row_number: '1',
          seat_number: '5',
          event_name: 'Test Event',
          starts_at: new Date('2025-12-31')
        },
        {
          id: 'ticket-2',
          ticket_number: 'TKT-002',
          status: 'TRANSFERRED',
          qr_hmac_secret: 'secret2',
          section: 'B',
          row_number: '2',
          seat_number: '10',
          event_name: 'Test Event',
          starts_at: new Date('2025-12-31')
        }
      ];

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: mockTickets }) // SELECT tickets
        .mockResolvedValueOnce({}) // DELETE old cache
        .mockResolvedValueOnce({}) // INSERT cache 1
        .mockResolvedValueOnce({}) // INSERT cache 2
        .mockResolvedValueOnce({}); // COMMIT

      const result = await offlineCache.generateEventCache(eventId);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe(eventId);
      expect(result.ticketCount).toBe(2);
      expect(result.validFrom).toBeInstanceOf(Date);
      expect(result.validUntil).toBeInstanceOf(Date);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should generate HMAC secret for tickets without one', async () => {
      const eventId = 'event-123';
      const mockTickets = [
        {
          id: 'ticket-1',
          ticket_number: 'TKT-001',
          status: 'SOLD',
          qr_hmac_secret: null, // Missing secret
          section: 'A',
          row_number: '1',
          seat_number: '5',
          event_name: 'Test Event',
          starts_at: new Date('2025-12-31')
        }
      ];

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: mockTickets }) // SELECT tickets
        .mockResolvedValueOnce({}) // UPDATE with new secret
        .mockResolvedValueOnce({}) // DELETE old cache
        .mockResolvedValueOnce({}) // INSERT cache
        .mockResolvedValueOnce({}); // COMMIT

      await offlineCache.generateEventCache(eventId);

      // Verify UPDATE was called to set HMAC secret
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE tickets SET qr_hmac_secret = $1 WHERE id = $2',
        [expect.any(String), 'ticket-1']
      );
    });

    it('should only cache SOLD and TRANSFERRED tickets', async () => {
      const eventId = 'event-123';

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // SELECT with status filter

      await offlineCache.generateEventCache(eventId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE t.event_id = $1 AND t.status IN ('SOLD', 'TRANSFERRED')"),
        [eventId]
      );
    });

    it('should delete old cache entries before inserting new ones', async () => {
      const eventId = 'event-123';
      const mockTickets = [{
        id: 'ticket-1',
        ticket_number: 'TKT-001',
        status: 'SOLD',
        qr_hmac_secret: 'secret1',
        section: 'A',
        row_number: '1',
        seat_number: '5',
        event_name: 'Test Event',
        starts_at: new Date('2025-12-31')
      }];

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: mockTickets }) // SELECT
        .mockResolvedValueOnce({}) // DELETE
        .mockResolvedValueOnce({}) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      await offlineCache.generateEventCache(eventId);

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM offline_validation_cache WHERE event_id = $1 AND valid_until < NOW()',
        [eventId]
      );
    });

    it('should rollback on error', async () => {
      const eventId = 'event-123';
      const error = new Error('Database error');

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(error); // SELECT fails

      await expect(offlineCache.generateEventCache(eventId))
        .rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle empty ticket list', async () => {
      const eventId = 'event-123';

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT returns empty
        .mockResolvedValueOnce({}) // DELETE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await offlineCache.generateEventCache(eventId);

      expect(result.success).toBe(true);
      expect(result.ticketCount).toBe(0);
    });
  });

  describe('getDeviceCache', () => {
    it('should return cache for authorized device', async () => {
      const deviceId = 'SCANNER-123';
      const eventId = 'event-456';

      const mockDevice = {
        device_id: deviceId,
        is_active: true,
        can_scan_offline: true
      };

      const mockCacheEntries = [
        {
          ticket_id: 'ticket-1',
          validation_hash: 'hash1',
          ticket_data: { ticketNumber: 'TKT-001' },
          valid_until: new Date()
        },
        {
          ticket_id: 'ticket-2',
          validation_hash: 'hash2',
          ticket_data: { ticketNumber: 'TKT-002' },
          valid_until: new Date()
        }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDevice] }) // Check device
        .mockResolvedValueOnce({ rows: mockCacheEntries }) // Get cache
        .mockResolvedValueOnce({}); // Update sync

      const result = await offlineCache.getDeviceCache(deviceId, eventId);

      expect(result.success).toBe(true);
      expect(result.deviceId).toBe(deviceId);
      expect(result.eventId).toBe(eventId);
      expect(result.entries).toEqual(mockCacheEntries);
      expect(result.syncedAt).toBeDefined();
    });

    it('should throw error for unauthorized device', async () => {
      const deviceId = 'SCANNER-123';
      const eventId = 'event-456';

      mockPool.query.mockResolvedValue({ rows: [] }); // Device not found

      await expect(offlineCache.getDeviceCache(deviceId, eventId))
        .rejects.toThrow('Device not authorized for offline scanning');
    });

    it('should throw error for inactive device', async () => {
      const deviceId = 'SCANNER-123';
      const eventId = 'event-456';

      const mockDevice = {
        device_id: deviceId,
        is_active: false, // Inactive
        can_scan_offline: true
      };

      mockPool.query.mockResolvedValue({ rows: [mockDevice] });

      await expect(offlineCache.getDeviceCache(deviceId, eventId))
        .rejects.toThrow('Device not authorized for offline scanning');
    });

    it('should throw error for device without offline capability', async () => {
      const deviceId = 'SCANNER-123';
      const eventId = 'event-456';

      const mockDevice = {
        device_id: deviceId,
        is_active: true,
        can_scan_offline: false // No offline capability
      };

      mockPool.query.mockResolvedValue({ rows: [mockDevice] });

      await expect(offlineCache.getDeviceCache(deviceId, eventId))
        .rejects.toThrow('Device not authorized for offline scanning');
    });

    it('should update device sync timestamp', async () => {
      const deviceId = 'SCANNER-123';
      const eventId = 'event-456';

      const mockDevice = {
        device_id: deviceId,
        is_active: true,
        can_scan_offline: true
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDevice] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      await offlineCache.getDeviceCache(deviceId, eventId);

      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',
        [deviceId]
      );
    });

    it('should only return valid cache entries', async () => {
      const deviceId = 'SCANNER-123';
      const eventId = 'event-456';

      const mockDevice = {
        device_id: deviceId,
        is_active: true,
        can_scan_offline: true
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDevice] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      await offlineCache.getDeviceCache(deviceId, eventId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('valid_from <= NOW() AND valid_until > NOW()'),
        [eventId]
      );
    });
  });

  describe('validateOfflineScan', () => {
    it('should validate correct offline scan', async () => {
      const ticketId = 'ticket-123';
      const validationHash = 'valid-hash';
      const eventId = 'event-456';

      const mockCache = {
        ticket_id: ticketId,
        event_id: eventId,
        validation_hash: validationHash,
        ticket_data: { ticketNumber: 'TKT-001', status: 'SOLD' },
        valid_until: new Date(Date.now() + 3600000)
      };

      mockPool.query.mockResolvedValue({ rows: [mockCache] });

      const result = await offlineCache.validateOfflineScan(ticketId, validationHash, eventId);

      expect(result.valid).toBe(true);
      expect(result.ticketData).toEqual(mockCache.ticket_data);
      expect(result.validUntil).toEqual(mockCache.valid_until);
    });

    it('should reject invalid validation hash', async () => {
      const ticketId = 'ticket-123';
      const validationHash = 'invalid-hash';
      const eventId = 'event-456';

      mockPool.query.mockResolvedValue({ rows: [] }); // No match

      const result = await offlineCache.validateOfflineScan(ticketId, validationHash, eventId);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_OFFLINE_HASH');
      expect(result.message).toBe('Offline validation failed');
    });

    it('should check all validation criteria', async () => {
      const ticketId = 'ticket-123';
      const validationHash = 'hash';
      const eventId = 'event-456';

      mockPool.query.mockResolvedValue({ rows: [] });

      await offlineCache.validateOfflineScan(ticketId, validationHash, eventId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ticket_id = $1 AND event_id = $2 AND validation_hash = $3'),
        [ticketId, eventId, validationHash]
      );
    });

    it('should handle database errors gracefully', async () => {
      const ticketId = 'ticket-123';
      const validationHash = 'hash';
      const eventId = 'event-456';

      mockPool.query.mockRejectedValue(new Error('Database error'));

      const result = await offlineCache.validateOfflineScan(ticketId, validationHash, eventId);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('VALIDATION_ERROR');
      expect(result.message).toBe('Failed to validate offline scan');
    });

    it('should only match currently valid entries', async () => {
      const ticketId = 'ticket-123';
      const validationHash = 'hash';
      const eventId = 'event-456';

      mockPool.query.mockResolvedValue({ rows: [] });

      await offlineCache.validateOfflineScan(ticketId, validationHash, eventId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('valid_from <= NOW() AND valid_until > NOW()'),
        expect.any(Array)
      );
    });
  });
});
