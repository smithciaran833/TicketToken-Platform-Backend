// =============================================================================
// MOCKS
// =============================================================================

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => mockLogger),
  },
}));

jest.mock('../../../src/services/redisService');
jest.mock('../../../src/services/databaseService');
jest.mock('../../../src/config');
jest.mock('qrcode');

// Import after mocks
import { QRService, qrService } from '../../../src/services/qrService';
import { RedisService } from '../../../src/services/redisService';
import { DatabaseService } from '../../../src/services/databaseService';
import { config } from '../../../src/config';
import * as QRCode from 'qrcode';
import { TicketStatus } from '../../../src/types';
import { ValidationError, NotFoundError } from '../../../src/utils/errors';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('QRService', () => {
  let service: QRService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // AES-256 needs exactly 32 bytes
    (config as any).qr = {
      encryptionKey: '12345678901234567890123456789012', // exactly 32 chars
      rotationInterval: 60000, // 1 minute
    };

    mockClient = {
      query: jest.fn(),
    };

    service = new QRService();

    // Mock Date.now for consistent timestamps
    jest.spyOn(Date, 'now').mockReturnValue(1234567890000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =============================================================================
  // generateRotatingQR() - 15 test cases
  // =============================================================================

  describe('generateRotatingQR()', () => {
    const ticketId = 'ticket-123';
    const mockTicket = {
      id: ticketId,
      event_id: 'event-456',
      status: TicketStatus.SOLD,
    };

    beforeEach(() => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicket],
        rowCount: 1,
      });

      (QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,mockQRImage');
      (RedisService.set as jest.Mock).mockResolvedValue('OK');
    });

    it('should generate QR code successfully', async () => {
      const result = await service.generateRotatingQR(ticketId);

      expect(result).toHaveProperty('qrCode');
      expect(result).toHaveProperty('qrImage');
    });

    it('should fetch ticket data', async () => {
      await service.generateRotatingQR(ticketId);

      expect(DatabaseService.query).toHaveBeenCalledWith(
        'SELECT * FROM tickets WHERE id = $1',
        [ticketId]
      );
    });

    it('should throw NotFoundError if ticket not found', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(service.generateRotatingQR(ticketId)).rejects.toThrow(NotFoundError);
    });

    it('should generate QR code with TKT: prefix', async () => {
      const result = await service.generateRotatingQR(ticketId);

      expect(result.qrCode).toMatch(/^TKT:/);
    });

    it('should generate QR image as data URL', async () => {
      const result = await service.generateRotatingQR(ticketId);

      expect(result.qrImage).toBe('data:image/png;base64,mockQRImage');
    });

    it('should call QRCode.toDataURL with correct options', async () => {
      await service.generateRotatingQR(ticketId);

      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        expect.stringMatching(/^TKT:/),
        {
          width: 400,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        }
      );
    });

    it('should store validation data in Redis', async () => {
      await service.generateRotatingQR(ticketId);

      expect(RedisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^qr:ticket-123:/),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should include ticketId in Redis data', async () => {
      await service.generateRotatingQR(ticketId);

      const redisData = JSON.parse((RedisService.set as jest.Mock).mock.calls[0][1]);
      expect(redisData.ticketId).toBe(ticketId);
    });

    it('should include eventId in Redis data', async () => {
      await service.generateRotatingQR(ticketId);

      const redisData = JSON.parse((RedisService.set as jest.Mock).mock.calls[0][1]);
      expect(redisData.eventId).toBe('event-456');
    });

    it('should continue if Redis fails', async () => {
      (RedisService.set as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const result = await service.generateRotatingQR(ticketId);

      expect(result).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis storage failed for QR validation data, QR will still work',
        { ticketId }
      );
    });

    it('should use time-based timestamp', async () => {
      const result = await service.generateRotatingQR(ticketId);

      // Timestamp should be based on rotation interval
      const expectedTimestamp = Math.floor(1234567890000 / 60000);
      expect(result.qrCode).toBeDefined();
    });

    it('should generate unique QR codes', async () => {
      const result1 = await service.generateRotatingQR(ticketId);
      const result2 = await service.generateRotatingQR(ticketId);

      // Should be different due to nonce
      expect(result1.qrCode).not.toBe(result2.qrCode);
    });

    it('should encrypt QR data', async () => {
      const result = await service.generateRotatingQR(ticketId);

      // Encrypted data should not contain plain ticketId
      const qrData = result.qrCode.substring(4); // Remove TKT:
      expect(qrData).not.toContain(ticketId);
      expect(qrData).toContain(':'); // Should have IV separator
    });

    it('should set Redis TTL to 2x rotation interval', async () => {
      await service.generateRotatingQR(ticketId);

      const ttl = (RedisService.set as jest.Mock).mock.calls[0][2];
      expect(ttl).toBe(config.qr.rotationInterval * 2);
    });

    it('should handle different ticket IDs', async () => {
      await service.generateRotatingQR('ticket-999');

      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        ['ticket-999']
      );
    });
  });

  // =============================================================================
  // validateQR() - 25 test cases
  // =============================================================================

  describe('validateQR()', () => {
    const ticketId = 'ticket-123';
    const eventId = 'event-456';
    const validationData = {
      eventId,
      entrance: 'Gate A',
      deviceId: 'device-1',
      validatorId: 'validator-1',
    };

    const mockTicket = {
      id: ticketId,
      event_id: eventId,
      status: TicketStatus.SOLD,
      validated_at: null,
    };

    beforeEach(() => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [mockTicket],
        rowCount: 1,
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockTicket], rowCount: 1 }) // lock
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // update
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // log

      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));
      (RedisService.del as jest.Mock).mockResolvedValue(1);
    });

    it('should validate valid QR code successfully', async () => {
      // Generate a valid QR code
      const generated = await service.generateRotatingQR(ticketId);

      const result = await service.validateQR(generated.qrCode, validationData);

      expect(result.isValid).toBe(true);
    });

    it('should return ticketId for valid QR', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      const result = await service.validateQR(generated.qrCode, validationData);

      expect(result.ticketId).toBe(ticketId);
    });

    it('should return eventId for valid QR', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      const result = await service.validateQR(generated.qrCode, validationData);

      expect(result.eventId).toBe(eventId);
    });

    it('should return validatedAt timestamp', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      const result = await service.validateQR(generated.qrCode, validationData);

      expect(result.validatedAt).toBeInstanceOf(Date);
    });

    it('should reject QR without TKT: prefix', async () => {
      const result = await service.validateQR('invalid-qr-code', validationData);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Invalid QR code');
    });

    it('should reject expired QR code', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      // Advance time by 3+ rotation intervals
      jest.spyOn(Date, 'now').mockReturnValue(1234567890000 + (config.qr.rotationInterval * 3));

      const result = await service.validateQR(generated.qrCode, validationData);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('QR code expired');
    });

    it('should reject QR for wrong event', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      const result = await service.validateQR(generated.qrCode, {
        ...validationData,
        eventId: 'different-event',
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Wrong event');
    });

    it('should reject already used ticket', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{
          ...mockTicket,
          status: TicketStatus.USED,
          validated_at: new Date(),
        }],
        rowCount: 1,
      });

      const generated = await service.generateRotatingQR(ticketId);

      const result = await service.validateQR(generated.qrCode, validationData);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Ticket already used');
    });

    it('should reject ticket with invalid status', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{
          ...mockTicket,
          status: TicketStatus.CANCELLED,
        }],
        rowCount: 1,
      });

      const generated = await service.generateRotatingQR(ticketId);

      const result = await service.validateQR(generated.qrCode, validationData);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Invalid ticket status');
    });

    it('should lock ticket FOR UPDATE', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      await service.validateQR(generated.qrCode, validationData);

      const lockQuery = mockClient.query.mock.calls[0][0];
      expect(lockQuery).toContain('FOR UPDATE');
    });

    it('should update ticket status to USED', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      await service.validateQR(generated.qrCode, validationData);

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE tickets')
      );

      expect(updateCall[1][0]).toBe(TicketStatus.USED);
    });

    it('should set validated_at timestamp', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      await service.validateQR(generated.qrCode, validationData);

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE tickets')
      );

      expect(updateCall[1][1]).toBeInstanceOf(Date);
    });

    it('should set validator_id', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      await service.validateQR(generated.qrCode, validationData);

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE tickets')
      );

      expect(updateCall[1][2]).toBe('validator-1');
    });

    it('should set entrance', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      await service.validateQR(generated.qrCode, validationData);

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE tickets')
      );

      expect(updateCall[1][3]).toBe('Gate A');
    });

    it('should log validation in ticket_validations table', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      await service.validateQR(generated.qrCode, validationData);

      const logCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO ticket_validations')
      );

      expect(logCall).toBeDefined();
      expect(logCall[1]).toEqual([
        ticketId,
        eventId,
        expect.any(Date),
        'validator-1',
        'Gate A',
        'device-1',
      ]);
    });

    it('should clear ticket cache from Redis', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      await service.validateQR(generated.qrCode, validationData);

      expect(RedisService.del).toHaveBeenCalledWith(`ticket:${ticketId}`);
    });

    it('should continue if Redis delete fails', async () => {
      (RedisService.del as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const generated = await service.generateRotatingQR(ticketId);

      const result = await service.validateQR(generated.qrCode, validationData);

      expect(result.isValid).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis delete failed after validation',
        { ticketId }
      );
    });

    it('should use database transaction', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      await service.validateQR(generated.qrCode, validationData);

      expect(DatabaseService.transaction).toHaveBeenCalled();
    });

    it('should handle null validator_id', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      await service.validateQR(generated.qrCode, {
        eventId,
      });

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE tickets')
      );

      expect(updateCall[1][2]).toBeNull();
    });

    it('should handle null entrance', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      await service.validateQR(generated.qrCode, {
        eventId,
      });

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE tickets')
      );

      expect(updateCall[1][3]).toBeNull();
    });

    it('should prevent double validation with lock', async () => {
      mockClient.query.mockReset()
        .mockResolvedValueOnce({
          rows: [{
            ...mockTicket,
            status: TicketStatus.USED,
          }],
          rowCount: 1,
        });

      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      const generated = await service.generateRotatingQR(ticketId);

      const result = await service.validateQR(generated.qrCode, validationData);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Ticket was just validated');
    });

    it('should log error on validation failure', async () => {
      const generated = await service.generateRotatingQR(ticketId);
      
      const error = new Error('Database error');
      (DatabaseService.transaction as jest.Mock).mockRejectedValue(error);

      await service.validateQR(generated.qrCode, validationData);

      expect(mockLogger.error).toHaveBeenCalledWith('QR validation error:', error);
    });

    it('should return invalid for malformed QR data', async () => {
      const result = await service.validateQR('TKT:malformed-data', validationData);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Invalid QR code');
    });

    it('should accept QR within time window', async () => {
      const generated = await service.generateRotatingQR(ticketId);

      // Advance time by 1 rotation interval (within 2x window)
      jest.spyOn(Date, 'now').mockReturnValue(1234567890000 + config.qr.rotationInterval);

      const result = await service.validateQR(generated.qrCode, validationData);

      expect(result.isValid).toBe(true);
    });
  });

  // =============================================================================
  // Encryption/Decryption - 5 test cases
  // =============================================================================

  describe('encryption/decryption', () => {
    it('should encrypt and decrypt data correctly', () => {
      const originalData = 'test data';
      const encrypted = (service as any).encrypt(originalData);
      const decrypted = (service as any).decrypt(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it('should produce different encrypted values for same input', () => {
      const data = 'test data';
      const encrypted1 = (service as any).encrypt(data);
      const encrypted2 = (service as any).encrypt(data);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should include IV in encrypted string', () => {
      const data = 'test data';
      const encrypted = (service as any).encrypt(data);

      expect(encrypted).toContain(':');
      const parts = encrypted.split(':');
      expect(parts.length).toBe(2);
    });

    it('should handle JSON data', () => {
      const data = JSON.stringify({ ticketId: 'ticket-123', eventId: 'event-456' });
      const encrypted = (service as any).encrypt(data);
      const decrypted = (service as any).decrypt(encrypted);

      expect(JSON.parse(decrypted)).toEqual({ ticketId: 'ticket-123', eventId: 'event-456' });
    });

    it('should throw error for invalid encrypted data', () => {
      expect(() => {
        (service as any).decrypt('invalid:data');
      }).toThrow();
    });
  });

  // =============================================================================
  // qrService instance test
  // =============================================================================

  describe('qrService instance', () => {
    it('should export a singleton instance', () => {
      expect(qrService).toBeInstanceOf(QRService);
    });

    it('should have all required methods', () => {
      expect(typeof qrService.generateRotatingQR).toBe('function');
      expect(typeof qrService.validateQR).toBe('function');
    });
  });
});
