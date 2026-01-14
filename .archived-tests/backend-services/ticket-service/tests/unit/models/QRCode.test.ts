// =============================================================================
// TEST SUITE - QRCode Model
// =============================================================================

import { Pool, QueryResult } from 'pg';
import { QRCodeModel, IQRCode } from '../../../src/models/QRCode';

describe('QRCodeModel', () => {
  let model: QRCodeModel;
  let mockPool: jest.Mocked<Partial<Pool>>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };

    model = new QRCodeModel(mockPool as Pool);
  });

  describe('create()', () => {
    it('should create a QR code', async () => {
      const qrData: IQRCode = {
        ticket_id: 'ticket-123',
        code: 'QR123456',
        expires_at: new Date('2024-12-31'),
      };

      const mockResult = {
        rows: [{ id: 'qr-1', ...qrData, scanned: false, created_at: new Date() }],
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await model.create(qrData);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO qr_codes'),
        ['ticket-123', 'QR123456', qrData.expires_at]
      );
      expect(result.id).toBe('qr-1');
    });

    it('should return created QR code with all fields', async () => {
      const qrData: IQRCode = {
        ticket_id: 'ticket-123',
        code: 'QR123456',
        expires_at: new Date('2024-12-31'),
      };

      const mockQRCode = {
        id: 'qr-1',
        ticket_id: 'ticket-123',
        code: 'QR123456',
        scanned: false,
        created_at: new Date(),
        expires_at: new Date('2024-12-31'),
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockQRCode] });

      const result = await model.create(qrData);

      expect(result).toEqual(mockQRCode);
    });

    it('should insert with correct field order', async () => {
      const qrData: IQRCode = {
        ticket_id: 'ticket-123',
        code: 'QR123456',
        expires_at: new Date('2024-12-31'),
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.create(qrData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1]).toEqual([
        qrData.ticket_id,
        qrData.code,
        qrData.expires_at,
      ]);
    });
  });

  describe('findByCode()', () => {
    it('should find QR code by code', async () => {
      const mockQRCode = {
        id: 'qr-1',
        ticket_id: 'ticket-123',
        code: 'QR123456',
        scanned: false,
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockQRCode] });

      const result = await model.findByCode('QR123456');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM qr_codes WHERE code = $1',
        ['QR123456']
      );
      expect(result).toEqual(mockQRCode);
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.findByCode('NOTFOUND');

      expect(result).toBeNull();
    });

    it('should handle different codes', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ code: 'QR999' }] });

      await model.findByCode('QR999');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['QR999']
      );
    });
  });

  describe('markAsScanned()', () => {
    it('should mark QR code as scanned', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      const result = await model.markAsScanned('qr-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE qr_codes'),
        ['qr-1']
      );
      expect(result).toBe(true);
    });

    it('should only mark unscanned codes', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      await model.markAsScanned('qr-1');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('scanned = false');
    });

    it('should set scanned_at timestamp', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      await model.markAsScanned('qr-1');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('scanned_at = NOW()');
    });

    it('should return false if no rows updated', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 0 });

      const result = await model.markAsScanned('qr-1');

      expect(result).toBe(false);
    });

    it('should handle null rowCount', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: null });

      const result = await model.markAsScanned('qr-1');

      expect(result).toBe(false);
    });
  });

  describe('isValid()', () => {
    it('should return true for valid QR code', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ code: 'QR123' }] });

      const result = await model.isValid('QR123');

      expect(result).toBe(true);
    });

    it('should return false for invalid QR code', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.isValid('INVALID');

      expect(result).toBe(false);
    });

    it('should check code is not scanned', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await model.isValid('QR123');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('scanned = false');
    });

    it('should check expiry', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await model.isValid('QR123');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('expires_at IS NULL OR expires_at > NOW()');
    });

    it('should pass code as parameter', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await model.isValid('QR123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['QR123']
      );
    });

    it('should return true if code found and valid', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      const result = await model.isValid('QR123');

      expect(result).toBe(true);
    });

    it('should return false for expired code', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.isValid('EXPIRED');

      expect(result).toBe(false);
    });

    it('should return false for scanned code', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.isValid('SCANNED');

      expect(result).toBe(false);
    });
  });
});
