import { getPool } from '../../src/config/database';
import { getRedis } from '../../src/config/redis';
import crypto from 'crypto';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/config/redis');
jest.mock('../../src/utils/logger');

describe('Scan Flow Integration Tests', () => {
  let mockPool: any;
  let mockRedis: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
      end: jest.fn()
    };

    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      quit: jest.fn()
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);
    (getRedis as jest.Mock).mockReturnValue(mockRedis);

    process.env.HMAC_SECRET = 'test-secret-key-32-characters-long-minimum';
    process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long-min';

    mockClient.query.mockImplementation((query: string) => {
      if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
        return Promise.resolve({});
      }
      return Promise.resolve({ rows: [] });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Successful Scan Flow', () => {
    it('should complete full scan with valid ticket', async () => {
      const authenticatedUser = {
        userId: 'staff-123',
        tenantId: 'tenant-456',
        venueId: 'venue-789',
        role: 'VENUE_STAFF'
      };

      const mockDevice = {
        id: 'device-db-id',
        device_id: 'device-123',
        zone: 'GA',
        is_active: true,
        tenant_id: 'tenant-456',
        venue_id: 'venue-789'
      };

      const mockTicket = {
        id: 'ticket-123',
        ticket_number: 'TKT-001',
        event_id: 'event-456',
        status: 'SOLD',
        access_level: 'GA',
        tenant_id: 'tenant-456',
        venue_id: 'venue-789',
        scan_count: 0,
        last_scanned_at: null,
        event_name: 'Test Event'
      };

      const mockPolicy = { config: { window_minutes: 10 } };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockDevice] })
        .mockResolvedValueOnce({ rows: [mockTicket] })
        .mockResolvedValueOnce({ rows: [mockPolicy] })
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // LOG
        .mockResolvedValueOnce({}); // COMMIT

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);
      mockPool.query.mockResolvedValue({ rows: [] });

      const QRValidator = require('../../src/services/QRValidator').default;
      const validator = new QRValidator();

      const ticketId = 'ticket-123';
      const timestamp = String(Date.now());
      const nonce = crypto.randomBytes(8).toString('hex');
      const data = `${ticketId}:${timestamp}:${nonce}`;
      const hmac = crypto
        .createHmac('sha256', process.env.HMAC_SECRET!)
        .update(data)
        .digest('hex');
      const qrData = `${ticketId}:${timestamp}:${nonce}:${hmac}`;

      const result = await validator.validateScan(qrData, 'device-123', null, null, authenticatedUser);

      expect(result.valid).toBe(true);
      expect(result.result).toBe('ALLOW');
      expect(result.ticket?.id).toBe('ticket-123');
    });
  });

  describe('Security Validations', () => {
    it('should deny venue mismatch', async () => {
      const authenticatedUser = {
        userId: 'staff-123',
        tenantId: 'tenant-456',
        venueId: 'venue-789',
        role: 'VENUE_STAFF'
      };

      const mockDevice = {
        id: 'device-db-id',
        device_id: 'device-123',
        zone: 'GA',
        is_active: true,
        tenant_id: 'tenant-456',
        venue_id: 'different-venue' // MISMATCH
      };

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [mockDevice] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const QRValidator = require('../../src/services/QRValidator').default;
      const validator = new QRValidator();

      const ticketId = 'ticket-123';
      const timestamp = String(Date.now());
      const nonce = crypto.randomBytes(8).toString('hex');
      const data = `${ticketId}:${timestamp}:${nonce}`;
      const hmac = crypto.createHmac('sha256', process.env.HMAC_SECRET!).update(data).digest('hex');
      const qrData = `${ticketId}:${timestamp}:${nonce}:${hmac}`;

      const result = await validator.validateScan(qrData, 'device-123', null, null, authenticatedUser);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('VENUE_MISMATCH');
    });

    it('should deny tenant mismatch', async () => {
      const authenticatedUser = {
        userId: 'staff-123',
        tenantId: 'tenant-456',
        venueId: 'venue-789',
        role: 'VENUE_STAFF'
      };

      const mockDevice = {
        id: 'device-db-id',
        device_id: 'device-123',
        zone: 'GA',
        is_active: true,
        tenant_id: 'different-tenant', // MISMATCH
        venue_id: 'venue-789'
      };

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [mockDevice] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const QRValidator = require('../../src/services/QRValidator').default;
      const validator = new QRValidator();

      const ticketId = 'ticket-123';
      const timestamp = String(Date.now());
      const nonce = crypto.randomBytes(8).toString('hex');
      const data = `${ticketId}:${timestamp}:${nonce}`;
      const hmac = crypto.createHmac('sha256', process.env.HMAC_SECRET!).update(data).digest('hex');
      const qrData = `${ticketId}:${timestamp}:${nonce}:${hmac}`;

      const result = await validator.validateScan(qrData, 'device-123', null, null, authenticatedUser);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('UNAUTHORIZED');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockClient.query.mockRejectedValue(new Error('Database error'));

      const QRValidator = require('../../src/services/QRValidator').default;
      const validator = new QRValidator();

      const ticketId = 'ticket-123';
      const timestamp = String(Date.now());
      const nonce = crypto.randomBytes(8).toString('hex');
      const data = `${ticketId}:${timestamp}:${nonce}`;
      const hmac = crypto.createHmac('sha256', process.env.HMAC_SECRET!).update(data).digest('hex');
      const qrData = `${ticketId}:${timestamp}:${nonce}:${hmac}`;

      const result = await validator.validateScan(qrData, 'device-123');

      expect(result.valid).toBe(false);
      expect(result.result).toBe('ERROR');
      expect(result.reason).toBe('SYSTEM_ERROR');
    });
  });
});
