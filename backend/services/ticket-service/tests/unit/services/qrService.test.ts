/**
 * Unit Tests for src/services/qrService.ts
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    qr: {
      encryptionKey: '12345678901234567890123456789012',
      rotationInterval: 30000,
    },
  },
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockQRImage'),
}));

const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    set: mockRedisSet,
    del: mockRedisDel,
  },
}));

const mockDbQuery = jest.fn();
const mockDbTransaction = jest.fn();
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: mockDbQuery,
    transaction: mockDbTransaction,
  },
}));

import { QRService, qrService } from '../../../src/services/qrService';
import { TicketStatus } from '../../../src/types';

describe('services/qrService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateRotatingQR()', () => {
    const mockTicket = {
      id: 'ticket-123',
      event_id: 'event-456',
      status: 'active',
    };

    it('generates QR code for valid ticket', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [mockTicket] });

      const result = await qrService.generateRotatingQR('ticket-123');

      expect(result.qrCode).toMatch(/^TKT:/);
      expect(result.qrImage).toContain('data:image/png;base64');
    });

    it('stores validation data in Redis', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [mockTicket] });

      await qrService.generateRotatingQR('ticket-123');

      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringMatching(/^qr:ticket-123:/),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('continues if Redis storage fails', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [mockTicket] });
      mockRedisSet.mockRejectedValueOnce(new Error('Redis down'));

      const result = await qrService.generateRotatingQR('ticket-123');

      expect(result.qrCode).toBeDefined();
    });

    it('throws NotFoundError for non-existent ticket', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      await expect(qrService.generateRotatingQR('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('validateQR()', () => {
    const validationData = {
      eventId: 'event-456',
      entrance: 'Main',
      deviceId: 'device-1',
      validatorId: 'staff-1',
    };

    it('returns invalid for wrong QR format', async () => {
      const result = await qrService.validateQR('INVALID:data', validationData);

      expect(result.isValid).toBe(false);
      // The actual implementation returns different messages based on error type
      expect(result.reason).toBeDefined();
    });

    it('returns invalid for wrong event', async () => {
      // Generate a QR for one event
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'ticket-123', event_id: 'different-event', status: 'active' }],
      });

      const { qrCode } = await qrService.generateRotatingQR('ticket-123');

      // Validate against different event
      const result = await qrService.validateQR(qrCode, { eventId: 'event-456' });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Wrong event');
    });

    it('returns invalid for already used ticket', async () => {
      // First call for generate
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'ticket-123', event_id: 'event-456', status: 'active' }],
      });

      const { qrCode } = await qrService.generateRotatingQR('ticket-123');

      // Second call for validation - ticket is used
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'ticket-123', event_id: 'event-456', status: TicketStatus.USED, validated_at: new Date() }],
      });

      const result = await qrService.validateQR(qrCode, validationData);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Ticket already used');
    });

    it('returns invalid for non-SOLD ticket status', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'ticket-123', event_id: 'event-456', status: 'active' }],
      });

      const { qrCode } = await qrService.generateRotatingQR('ticket-123');

      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'ticket-123', event_id: 'event-456', status: 'cancelled' }],
      });

      const result = await qrService.validateQR(qrCode, validationData);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Invalid ticket status');
    });

    it('marks ticket as used on successful validation', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'ticket-123', event_id: 'event-456', status: 'active' }],
      });

      const { qrCode } = await qrService.generateRotatingQR('ticket-123');

      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'ticket-123', event_id: 'event-456', status: TicketStatus.SOLD }],
      });

      mockDbTransaction.mockImplementationOnce(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ status: TicketStatus.SOLD }] }) // Lock
            .mockResolvedValueOnce({}) // Update
            .mockResolvedValueOnce({}), // Insert log
        };
        await callback(mockClient);
      });

      const result = await qrService.validateQR(qrCode, validationData);

      expect(result.isValid).toBe(true);
      expect(result.validatedAt).toBeDefined();
    });

    it('clears ticket cache after validation', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'ticket-123', event_id: 'event-456', status: 'active' }],
      });

      const { qrCode } = await qrService.generateRotatingQR('ticket-123');

      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'ticket-123', event_id: 'event-456', status: TicketStatus.SOLD }],
      });

      mockDbTransaction.mockImplementationOnce(async (callback) => {
        const mockClient = {
          query: jest.fn().mockResolvedValue({ rows: [{ status: TicketStatus.SOLD }] }),
        };
        await callback(mockClient);
      });

      await qrService.validateQR(qrCode, validationData);

      expect(mockRedisDel).toHaveBeenCalledWith('ticket:ticket-123');
    });
  });
});
