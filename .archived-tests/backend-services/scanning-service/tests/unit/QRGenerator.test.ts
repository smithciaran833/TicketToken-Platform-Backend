import QRGenerator from '../../src/services/QRGenerator';
import { getPool } from '../../src/config/database';
import crypto from 'crypto';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/utils/logger');
jest.mock('qrcode');

// Import QRCode after mocking
import QRCode from 'qrcode';

describe('QRGenerator', () => {
  let generator: QRGenerator;
  let mockPool: any;

  beforeEach(() => {
    // Setup pool mock
    mockPool = {
      query: jest.fn()
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);

    // Set required environment variables
    process.env.HMAC_SECRET = 'test-secret-key-32-characters-long';
    process.env.QR_ROTATION_SECONDS = '30';

    generator = new QRGenerator();

    // Mock QRCode.toDataURL
    (QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,mockImageData');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateRotatingQR', () => {
    const mockTicket = {
      id: 'ticket-123',
      ticket_number: 'TKT-001',
      event_id: 'event-456',
      status: 'SOLD',
      access_level: 'VIP',
      event_name: 'Test Concert',
      event_date: new Date('2025-12-31')
    };

    it('should generate QR code with nonce for valid ticket', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // Count query
        .mockResolvedValueOnce({ rows: [mockTicket] }) // Exists check
        .mockResolvedValueOnce({ rows: [mockTicket] }); // Main query

      const result = await generator.generateRotatingQR('ticket-123');

      expect(result.success).toBe(true);
      expect(result.qr_data).toBeDefined();
      expect(result.qr_image).toBe('data:image/png;base64,mockImageData');
      expect(result.ticket.id).toBe('ticket-123');
      expect(result.ticket.event_name).toBe('Test Concert');
      
      // Verify QR data format: ticketId:timestamp:nonce:hmac
      const parts = result.qr_data.split(':');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('ticket-123');
      expect(parts[2]).toHaveLength(16); // Nonce should be 16 chars
    });

    it('should throw error if ticket not found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] }) // Exists check returns empty
        .mockResolvedValueOnce({ rows: [] }); // Main query returns empty

      await expect(generator.generateRotatingQR('nonexistent-ticket'))
        .rejects.toThrow('Ticket not found');
    });

    it('should include expiration time 30 seconds in future', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [mockTicket] })
        .mockResolvedValueOnce({ rows: [mockTicket] });

      const beforeTime = Date.now();
      const result = await generator.generateRotatingQR('ticket-123');
      const afterTime = Date.now();

      const expiresAt = new Date(result.expires_at).getTime();
      
      // Expiration should be ~30 seconds in future
      expect(expiresAt).toBeGreaterThanOrEqual(beforeTime + 29000);
      expect(expiresAt).toBeLessThanOrEqual(afterTime + 31000);
    });

    it('should generate valid HMAC signature', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [mockTicket] })
        .mockResolvedValueOnce({ rows: [mockTicket] });

      const result = await generator.generateRotatingQR('ticket-123');
      
      const [ticketId, timestamp, nonce, providedHmac] = result.qr_data.split(':');
      
      // Verify HMAC can be reconstructed
      const data = `${ticketId}:${timestamp}:${nonce}`;
      const expectedHmac = crypto
        .createHmac('sha256', process.env.HMAC_SECRET!)
        .update(data)
        .digest('hex');

      expect(providedHmac).toBe(expectedHmac);
    });

    it('should generate unique nonces for multiple calls', async () => {
      mockPool.query.mockResolvedValue({ rows: [mockTicket] });

      const result1 = await generator.generateRotatingQR('ticket-123');
      const result2 = await generator.generateRotatingQR('ticket-123');

      const nonce1 = result1.qr_data.split(':')[2];
      const nonce2 = result2.qr_data.split(':')[2];

      expect(nonce1).not.toBe(nonce2);
    });

    it('should call QRCode.toDataURL with correct options', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [mockTicket] })
        .mockResolvedValueOnce({ rows: [mockTicket] });

      await generator.generateRotatingQR('ticket-123');

      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          errorCorrectionLevel: 'M',
          type: 'image/png',
          quality: 0.92,
          margin: 1,
          width: 300
        })
      );
    });
  });

  describe('generateOfflineManifest', () => {
    const mockTickets = [
      {
        id: 'ticket-1',
        ticket_number: 'TKT-001',
        status: 'SOLD',
        access_level: 'VIP',
        scan_count: 0,
        last_scanned_at: null
      },
      {
        id: 'ticket-2',
        ticket_number: 'TKT-002',
        status: 'MINTED',
        access_level: 'GA',
        scan_count: 1,
        last_scanned_at: new Date()
      }
    ];

    it('should generate offline manifest for event', async () => {
      mockPool.query.mockResolvedValue({ rows: mockTickets });

      const result = await generator.generateOfflineManifest('event-123', 'device-456');

      expect(result.event_id).toBe('event-123');
      expect(result.device_id).toBe('device-456');
      expect(result.generated_at).toBeInstanceOf(Date);
      expect(result.expires_at).toBeInstanceOf(Date);
      expect(Object.keys(result.tickets)).toHaveLength(2);
    });

    it('should include offline tokens for each ticket', async () => {
      mockPool.query.mockResolvedValue({ rows: mockTickets });

      const result = await generator.generateOfflineManifest('event-123', 'device-456');

      const ticket1 = result.tickets['ticket-1'];
      expect(ticket1.offline_token).toBeDefined();
      expect(ticket1.offline_token).toHaveLength(64); // SHA256 hex = 64 chars
      expect(ticket1.ticket_number).toBe('TKT-001');
      expect(ticket1.access_level).toBe('VIP');
    });

    it('should set expiration 4 hours in future', async () => {
      mockPool.query.mockResolvedValue({ rows: mockTickets });

      const beforeTime = Date.now();
      const result = await generator.generateOfflineManifest('event-123', 'device-456');
      const afterTime = Date.now();

      const expiresAt = result.expires_at.getTime();
      const fourHours = 4 * 60 * 60 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(beforeTime + fourHours - 1000);
      expect(expiresAt).toBeLessThanOrEqual(afterTime + fourHours + 1000);
    });

    it('should only include SOLD and MINTED tickets', async () => {
      mockPool.query.mockResolvedValue({ rows: mockTickets });

      await generator.generateOfflineManifest('event-123', 'device-456');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("t.status IN ('SOLD', 'MINTED')"),
        ['event-123']
      );
    });

    it('should include scan history in manifest', async () => {
      mockPool.query.mockResolvedValue({ rows: mockTickets });

      const result = await generator.generateOfflineManifest('event-123', 'device-456');

      const ticket1 = result.tickets['ticket-1'];
      const ticket2 = result.tickets['ticket-2'];

      expect(ticket1.scan_count).toBe(0);
      expect(ticket1.last_scanned_at).toBeNull();
      expect(ticket2.scan_count).toBe(1);
      expect(ticket2.last_scanned_at).toBeInstanceOf(Date);
    });

    it('should handle empty ticket list', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await generator.generateOfflineManifest('event-123', 'device-456');

      expect(result.tickets).toEqual({});
    });
  });

  describe('validateOfflineScan', () => {
    it('should validate correct offline token', () => {
      const ticketId = 'ticket-123';
      const eventId = 'event-456';
      
      // Generate expected token
      const expectedToken = crypto
        .createHmac('sha256', process.env.HMAC_SECRET!)
        .update(`${ticketId}:${eventId}:offline`)
        .digest('hex');

      const result = generator.validateOfflineScan(ticketId, expectedToken, eventId);

      expect(result).toBe(true);
    });

    it('should reject incorrect offline token', () => {
      const ticketId = 'ticket-123';
      const eventId = 'event-456';
      const wrongToken = 'wrong-token-value';

      const result = generator.validateOfflineScan(ticketId, wrongToken, eventId);

      expect(result).toBe(false);
    });

    it('should reject token for different ticket', () => {
      const ticketId = 'ticket-123';
      const eventId = 'event-456';
      
      // Generate token for different ticket
      const tokenForDifferentTicket = crypto
        .createHmac('sha256', process.env.HMAC_SECRET!)
        .update(`different-ticket:${eventId}:offline`)
        .digest('hex');

      const result = generator.validateOfflineScan(ticketId, tokenForDifferentTicket, eventId);

      expect(result).toBe(false);
    });

    it('should reject token for different event', () => {
      const ticketId = 'ticket-123';
      const eventId = 'event-456';
      
      // Generate token for different event
      const tokenForDifferentEvent = crypto
        .createHmac('sha256', process.env.HMAC_SECRET!)
        .update(`${ticketId}:different-event:offline`)
        .digest('hex');

      const result = generator.validateOfflineScan(ticketId, tokenForDifferentEvent, eventId);

      expect(result).toBe(false);
    });
  });

  describe('environment configuration', () => {
    it('should use default QR rotation seconds if not set', () => {
      delete process.env.QR_ROTATION_SECONDS;
      const gen = new QRGenerator();
      expect(gen).toBeDefined();
    });

    it('should respect custom QR rotation seconds', () => {
      process.env.QR_ROTATION_SECONDS = '60';
      const gen = new QRGenerator();
      expect(gen).toBeDefined();
    });
  });
});
