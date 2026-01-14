/**
 * Unit Tests for src/models/QRCode.ts
 */

import { QRCodeModel, IQRCodeResult } from '../../../src/models/QRCode';

describe('models/QRCode', () => {
  let mockPool: any;
  let qrCodeModel: QRCodeModel;

  const mockQRCodeRow = {
    id: 'ticket-123',
    ticket_id: 'ticket-123',
    qr_code: 'QR-ABC123',
    ticket_number: 'TKT-XYZ',
    status: 'active',
    is_validated: false,
    validated_at: null,
    validated_by: null,
    event_id: 'event-456',
    user_id: 'user-789',
  };

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
    qrCodeModel = new QRCodeModel(mockPool);
  });

  describe('findByCode()', () => {
    it('returns null for empty code', async () => {
      const result = await qrCodeModel.findByCode('');

      expect(result).toBeNull();
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('returns QR code result when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockQRCodeRow] });

      const result = await qrCodeModel.findByCode('QR-ABC123');

      expect(result?.qr_code).toBe('QR-ABC123');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE qr_code = $1'),
        ['QR-ABC123']
      );
    });

    it('returns null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await qrCodeModel.findByCode('INVALID');

      expect(result).toBeNull();
    });
  });

  describe('findByTicketId()', () => {
    it('returns QR code result when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockQRCodeRow] });

      const result = await qrCodeModel.findByTicketId('ticket-123');

      expect(result?.ticket_id).toBe('ticket-123');
    });

    it('returns null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await qrCodeModel.findByTicketId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('regenerate()', () => {
    it('generates new QR code for ticket', async () => {
      const regeneratedRow = { ...mockQRCodeRow, qr_code: 'QR-NEWCODE' };
      mockPool.query.mockResolvedValueOnce({ rows: [regeneratedRow] });

      const result = await qrCodeModel.regenerate('ticket-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tickets'),
        ['ticket-123', expect.stringMatching(/^QR-/)]
      );
      expect(result?.qr_code).toBe('QR-NEWCODE');
    });

    it('returns null when ticket not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await qrCodeModel.regenerate('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('markAsScanned()', () => {
    it('marks QR code as scanned', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await qrCodeModel.markAsScanned('QR-ABC123', 'staff-001');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('is_validated = true'),
        ['QR-ABC123', 'staff-001']
      );
      expect(result).toBe(true);
    });

    it('returns false when already scanned', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await qrCodeModel.markAsScanned('QR-ABC123');

      expect(result).toBe(false);
    });

    it('handles null validatedBy', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await qrCodeModel.markAsScanned('QR-ABC123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['QR-ABC123', null]
      );
    });
  });

  describe('isValid()', () => {
    it('returns false for empty code', async () => {
      const result = await qrCodeModel.isValid('');

      expect(result).toBe(false);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('returns true for valid unscanned ticket', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'ticket-123' }] });

      const result = await qrCodeModel.isValid('QR-ABC123');

      expect(result).toBe(true);
    });

    it('returns false for invalid/scanned ticket', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await qrCodeModel.isValid('QR-INVALID');

      expect(result).toBe(false);
    });
  });

  describe('getValidationStatus()', () => {
    it('returns not found for empty code', async () => {
      const result = await qrCodeModel.getValidationStatus('');

      expect(result).toEqual({
        exists: false,
        isValid: false,
        reason: 'No QR code provided',
      });
    });

    it('returns not found when ticket missing', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await qrCodeModel.getValidationStatus('QR-UNKNOWN');

      expect(result).toEqual({
        exists: false,
        isValid: false,
        reason: 'QR code not found',
      });
    });

    it('returns deleted reason', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ status: 'active', is_validated: false, deleted_at: new Date() }],
      });

      const result = await qrCodeModel.getValidationStatus('QR-ABC123');

      expect(result).toEqual({
        exists: true,
        isValid: false,
        reason: 'Ticket has been deleted',
      });
    });

    it('returns already scanned reason', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ status: 'active', is_validated: true, deleted_at: null }],
      });

      const result = await qrCodeModel.getValidationStatus('QR-ABC123');

      expect(result).toEqual({
        exists: true,
        isValid: false,
        reason: 'Ticket already scanned',
      });
    });

    it('returns status reason for non-active', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ status: 'cancelled', is_validated: false, deleted_at: null }],
      });

      const result = await qrCodeModel.getValidationStatus('QR-ABC123');

      expect(result).toEqual({
        exists: true,
        isValid: false,
        reason: 'Ticket status is cancelled',
      });
    });

    it('returns valid for active unscanned ticket', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ status: 'active', is_validated: false, deleted_at: null }],
      });

      const result = await qrCodeModel.getValidationStatus('QR-ABC123');

      expect(result).toEqual({
        exists: true,
        isValid: true,
      });
    });
  });
});
