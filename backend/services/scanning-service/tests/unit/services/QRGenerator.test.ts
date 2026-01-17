// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/services/QRGenerator.ts
 */

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');
jest.mock('crypto');
jest.mock('qrcode');

describe('src/services/QRGenerator.ts - Comprehensive Unit Tests', () => {
  let QRGenerator: any;
  let getPool: any;
  let logger: any;
  let crypto: any;
  let QRCode: any;
  let mockPool: any;
  const originalEnv = process.env;
  const mockNow = 1640000000000; // Fixed timestamp for testing

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };

    // Mock Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(mockNow);

    // Setup mock pool
    mockPool = {
      query: jest.fn(),
    };

    // Import mocked modules
    ({ getPool } = require('../../../src/config/database'));
    logger = require('../../../src/utils/logger').default;
    crypto = require('crypto');
    QRCode = require('qrcode');

    getPool.mockReturnValue(mockPool);

    // Mock crypto.randomBytes
    crypto.randomBytes = jest.fn().mockReturnValue({
      toString: jest.fn().mockReturnValue('abc123def456'),
    });

    // Mock crypto.createHmac
    const mockHmac = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mock-hmac-hash'),
    };
    crypto.createHmac = jest.fn().mockReturnValue(mockHmac);

    // Mock QRCode.toDataURL
    QRCode.toDataURL = jest.fn().mockResolvedValue('data:image/png;base64,mockQRImage');

    // Import class under test
    QRGenerator = require('../../../src/services/QRGenerator').default;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  // Helper to setup standard successful ticket query
  const setupSuccessfulTicketQuery = (ticket) => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // COUNT query
      .mockResolvedValueOnce({ rows: [{ id: ticket.id, status: ticket.status, event_id: ticket.event_id }] }) // EXISTS check
      .mockResolvedValueOnce({ rows: [ticket] }); // Actual query
  };

  // =============================================================================
  // Constructor
  // =============================================================================

  describe('constructor()', () => {
    it('should use default HMAC secret', () => {
      delete process.env.HMAC_SECRET;

      const qrGenerator = new QRGenerator();

      expect(qrGenerator.hmacSecret).toBe('default-secret-change-in-production');
    });

    it('should use HMAC secret from environment', () => {
      process.env.HMAC_SECRET = 'custom-hmac-secret';

      const qrGenerator = new QRGenerator();

      expect(qrGenerator.hmacSecret).toBe('custom-hmac-secret');
    });

    it('should use default rotation seconds of 30', () => {
      delete process.env.QR_ROTATION_SECONDS;

      const qrGenerator = new QRGenerator();

      expect(qrGenerator.rotationSeconds).toBe(30);
    });

    it('should use rotation seconds from environment', () => {
      process.env.QR_ROTATION_SECONDS = '60';

      const qrGenerator = new QRGenerator();

      expect(qrGenerator.rotationSeconds).toBe(60);
    });

    it('should parse rotation seconds as integer', () => {
      process.env.QR_ROTATION_SECONDS = '45';

      const qrGenerator = new QRGenerator();

      expect(qrGenerator.rotationSeconds).toBe(45);
    });
  });

  // =============================================================================
  // generateRotatingQR()
  // =============================================================================

  describe('generateRotatingQR()', () => {
    const mockTicket = {
      id: 'ticket-123',
      ticket_number: 'TKT-001',
      event_id: 'event-456',
      status: 'SOLD',
      access_level: 'VIP',
      event_name: 'Test Event',
      event_date: new Date('2024-12-31'),
    };

    it('should successfully generate rotating QR code', async () => {
      setupSuccessfulTicketQuery(mockTicket);

      const qrGenerator = new QRGenerator();
      const result = await qrGenerator.generateRotatingQR('ticket-123');

      expect(result.success).toBe(true);
      expect(result.qr_data).toBeDefined();
      expect(result.qr_image).toBe('data:image/png;base64,mockQRImage');
      expect(result.expires_at).toBeInstanceOf(Date);
      expect(result.ticket).toMatchObject({
        id: 'ticket-123',
        ticket_number: 'TKT-001',
        event_name: 'Test Event',
        access_level: 'VIP',
      });
    });

    it('should generate QR data in correct format', async () => {
      setupSuccessfulTicketQuery(mockTicket);

      const qrGenerator = new QRGenerator();
      const result = await qrGenerator.generateRotatingQR('ticket-123');

      // Format: ticketId:timestamp:nonce:hmac
      expect(result.qr_data).toBe('ticket-123:1640000000000:abc123def456:mock-hmac-hash');
    });

    it('should generate 16-character nonce from 8 bytes', async () => {
      setupSuccessfulTicketQuery(mockTicket);

      const qrGenerator = new QRGenerator();
      await qrGenerator.generateRotatingQR('ticket-123');

      expect(crypto.randomBytes).toHaveBeenCalledWith(8);
      expect(crypto.randomBytes().toString).toHaveBeenCalledWith('hex');
    });

    it('should create HMAC with correct data', async () => {
      setupSuccessfulTicketQuery(mockTicket);
      process.env.HMAC_SECRET = 'test-secret';
      const qrGenerator = new QRGenerator();
      await qrGenerator.generateRotatingQR('ticket-123');

      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', 'test-secret');
      expect(crypto.createHmac().update).toHaveBeenCalledWith('ticket-123:1640000000000:abc123def456');
      expect(crypto.createHmac().digest).toHaveBeenCalledWith('hex');
    });

    it('should calculate expiration based on rotation seconds', async () => {
      setupSuccessfulTicketQuery(mockTicket);
      process.env.QR_ROTATION_SECONDS = '60';
      const qrGenerator = new QRGenerator();
      const result = await qrGenerator.generateRotatingQR('ticket-123');

      const expectedExpiry = new Date(mockNow + (60 * 1000));
      expect(result.expires_at.getTime()).toBe(expectedExpiry.getTime());
    });

    it('should generate QR image with correct options', async () => {
      setupSuccessfulTicketQuery(mockTicket);

      const qrGenerator = new QRGenerator();
      await qrGenerator.generateRotatingQR('ticket-123');

      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        'ticket-123:1640000000000:abc123def456:mock-hmac-hash',
        {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          quality: 0.92,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
          width: 300,
        }
      );
    });

    it('should use GA as default access level if not provided', async () => {
      const ticketWithoutAccessLevel = { ...mockTicket, access_level: null };
      setupSuccessfulTicketQuery(ticketWithoutAccessLevel);

      const qrGenerator = new QRGenerator();
      const result = await qrGenerator.generateRotatingQR('ticket-123');

      expect(result.ticket.access_level).toBe('GA');
    });

    it('should throw error when ticket not found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // COUNT query
        .mockResolvedValueOnce({ rows: [] }) // EXISTS check returns empty
        .mockResolvedValueOnce({ rows: [] }); // Actual query returns empty

      const qrGenerator = new QRGenerator();

      await expect(qrGenerator.generateRotatingQR('nonexistent')).rejects.toThrow('Ticket not found');
      expect(logger.error).toHaveBeenCalledWith('QR generation error:', expect.any(Error));
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const qrGenerator = new QRGenerator();

      await expect(qrGenerator.generateRotatingQR('ticket-123')).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('QR generation error:', expect.any(Error));
    });

    it('should handle QR image generation errors', async () => {
      setupSuccessfulTicketQuery(mockTicket);
      QRCode.toDataURL.mockRejectedValueOnce(new Error('QR generation failed'));

      const qrGenerator = new QRGenerator();

      await expect(qrGenerator.generateRotatingQR('ticket-123')).rejects.toThrow('QR generation failed');
      expect(logger.error).toHaveBeenCalledWith('QR generation error:', expect.any(Error));
    });

    it('should log debug information during query', async () => {
      setupSuccessfulTicketQuery(mockTicket);

      const qrGenerator = new QRGenerator();
      await qrGenerator.generateRotatingQR('ticket-123');

      expect(logger.info).toHaveBeenCalledWith('Looking for ticket: ticket-123');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Total tickets in database:'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Ticket exists check:'));
    });
  });

  // =============================================================================
  // generateOfflineManifest()
  // =============================================================================

  describe('generateOfflineManifest()', () => {
    const mockTickets = [
      {
        id: 'ticket-1',
        ticket_number: 'TKT-001',
        status: 'SOLD',
        access_level: 'VIP',
        scan_count: 0,
        last_scanned_at: null,
      },
      {
        id: 'ticket-2',
        ticket_number: 'TKT-002',
        status: 'MINTED',
        access_level: 'GA',
        scan_count: 1,
        last_scanned_at: new Date('2024-01-01'),
      },
    ];

    it('should successfully generate offline manifest', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: mockTickets });

      const qrGenerator = new QRGenerator();
      const result = await qrGenerator.generateOfflineManifest('event-123', 'device-456');

      expect(result.event_id).toBe('event-123');
      expect(result.device_id).toBe('device-456');
      expect(result.generated_at).toBeInstanceOf(Date);
      expect(result.expires_at).toBeInstanceOf(Date);
      expect(Object.keys(result.tickets)).toHaveLength(2);
    });

    it('should set expiration to 4 hours from now', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: mockTickets });

      const qrGenerator = new QRGenerator();
      const result = await qrGenerator.generateOfflineManifest('event-123', 'device-456');

      const expectedExpiry = new Date(mockNow + (4 * 60 * 60 * 1000));
      expect(result.expires_at.getTime()).toBe(expectedExpiry.getTime());
    });

    it('should generate offline tokens for each ticket', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: mockTickets });

      const qrGenerator = new QRGenerator();
      const result = await qrGenerator.generateOfflineManifest('event-123', 'device-456');

      expect(result.tickets['ticket-1']).toMatchObject({
        ticket_number: 'TKT-001',
        access_level: 'VIP',
        scan_count: 0,
        last_scanned_at: null,
        offline_token: 'mock-hmac-hash',
      });

      expect(result.tickets['ticket-2']).toMatchObject({
        ticket_number: 'TKT-002',
        access_level: 'GA',
        scan_count: 1,
        offline_token: 'mock-hmac-hash',
      });
    });

    it('should create offline tokens with correct HMAC data', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTickets[0]] });
      process.env.HMAC_SECRET = 'test-secret';

      const qrGenerator = new QRGenerator();
      await qrGenerator.generateOfflineManifest('event-123', 'device-456');

      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', 'test-secret');
      expect(crypto.createHmac().update).toHaveBeenCalledWith('ticket-1:event-123:offline');
      expect(crypto.createHmac().digest).toHaveBeenCalledWith('hex');
    });

    it('should query only SOLD and MINTED tickets', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: mockTickets });

      const qrGenerator = new QRGenerator();
      await qrGenerator.generateOfflineManifest('event-123', 'device-456');

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain("status IN ('SOLD', 'MINTED')");
      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['event-123']);
    });

    it('should handle event with no tickets', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const qrGenerator = new QRGenerator();
      const result = await qrGenerator.generateOfflineManifest('event-123', 'device-456');

      expect(result.event_id).toBe('event-123');
      expect(result.tickets).toEqual({});
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const qrGenerator = new QRGenerator();

      await expect(qrGenerator.generateOfflineManifest('event-123', 'device-456')).rejects.toThrow(
        'Database error'
      );
      expect(logger.error).toHaveBeenCalledWith('Offline manifest generation error:', expect.any(Error));
    });
  });

  // =============================================================================
  // validateOfflineScan()
  // =============================================================================

  describe('validateOfflineScan()', () => {
    it('should return true for valid offline token', () => {
      process.env.HMAC_SECRET = 'test-secret';
      const qrGenerator = new QRGenerator();

      const result = qrGenerator.validateOfflineScan('ticket-123', 'mock-hmac-hash', 'event-456');

      expect(result).toBe(true);
      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', 'test-secret');
      expect(crypto.createHmac().update).toHaveBeenCalledWith('ticket-123:event-456:offline');
      expect(crypto.createHmac().digest).toHaveBeenCalledWith('hex');
    });

    it('should return false for invalid offline token', () => {
      crypto.createHmac = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('different-hash'),
      });

      const qrGenerator = new QRGenerator();

      const result = qrGenerator.validateOfflineScan('ticket-123', 'wrong-hash', 'event-456');

      expect(result).toBe(false);
    });

    it('should validate with correct ticket, event, and offline suffix', () => {
      const qrGenerator = new QRGenerator();

      qrGenerator.validateOfflineScan('ticket-abc', 'token', 'event-xyz');

      expect(crypto.createHmac().update).toHaveBeenCalledWith('ticket-abc:event-xyz:offline');
    });

    it('should use HMAC secret from constructor', () => {
      process.env.HMAC_SECRET = 'custom-secret-123';
      const qrGenerator = new QRGenerator();

      qrGenerator.validateOfflineScan('ticket-123', 'token', 'event-456');

      expect(crypto.createHmac).toHaveBeenCalledWith('sha256', 'custom-secret-123');
    });

    it('should perform exact string comparison', () => {
      // First call returns 'exact-match'
      crypto.createHmac = jest.fn().mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('exact-match'),
      });

      const qrGenerator = new QRGenerator();

      const validResult = qrGenerator.validateOfflineScan('ticket-123', 'exact-match', 'event-456');
      expect(validResult).toBe(true);

      // Second call returns 'exact-match' but we provide 'Exact-Match' (different case)
      crypto.createHmac = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('exact-match'),
      });

      const invalidResult = qrGenerator.validateOfflineScan('ticket-123', 'Exact-Match', 'event-456');
      expect(invalidResult).toBe(false);
    });
  });
});
