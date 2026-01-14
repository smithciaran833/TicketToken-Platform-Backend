/**
 * Unit Tests for src/models/Transfer.ts
 */

import { TransferModel, ITransfer } from '../../../src/models/Transfer';

describe('models/Transfer', () => {
  let mockPool: any;
  let transferModel: TransferModel;

  const mockTransferRow = {
    id: 'transfer-123',
    tenant_id: 'tenant-456',
    ticket_id: 'ticket-789',
    from_user_id: 'user-abc',
    to_user_id: null,
    to_email: 'recipient@example.com',
    transfer_code: 'TRF-ABC123',
    transfer_method: 'email',
    status: 'pending',
    acceptance_code: 'ACCEPT123',
    is_gift: true,
    price_cents: 0,
    currency: 'USD',
    expires_at: new Date(Date.now() + 86400000),
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
    transferModel = new TransferModel(mockPool);
  });

  describe('create()', () => {
    it('inserts transfer and returns result', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTransferRow] });

      const input: ITransfer = {
        tenant_id: 'tenant-456',
        ticket_id: 'ticket-789',
        to_email: 'recipient@example.com',
        transfer_method: 'email',
        status: 'pending',
        is_gift: true,
        expires_at: new Date(Date.now() + 86400000),
      };

      const result = await transferModel.create(input);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ticket_transfers'),
        expect.any(Array)
      );
      expect(result.id).toBe('transfer-123');
    });

    it('generates acceptance_code and transfer_code', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTransferRow] });

      const input: ITransfer = {
        tenant_id: 'tenant-456',
        ticket_id: 'ticket-789',
        to_email: 'recipient@example.com',
        transfer_method: 'email',
        status: 'pending',
        is_gift: true,
        expires_at: new Date(),
      };

      await transferModel.create(input);

      const values = mockPool.query.mock.calls[0][1];
      expect(values[5]).toMatch(/^TRF-/); // transfer_code
      expect(values[9]).toBeTruthy(); // acceptance_code
    });
  });

  describe('findById()', () => {
    it('returns transfer when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTransferRow] });

      const result = await transferModel.findById('transfer-123');

      expect(result?.id).toBe('transfer-123');
    });

    it('returns null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await transferModel.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByTicketId()', () => {
    it('returns array of transfers', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTransferRow] });

      const result = await transferModel.findByTicketId('ticket-789');

      expect(result).toHaveLength(1);
    });
  });

  describe('findByTransferCode()', () => {
    it('returns null for empty code', async () => {
      const result = await transferModel.findByTransferCode('');

      expect(result).toBeNull();
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('returns transfer when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTransferRow] });

      const result = await transferModel.findByTransferCode('TRF-ABC123');

      expect(result?.transfer_code).toBe('TRF-ABC123');
    });
  });

  describe('findByAcceptanceCode()', () => {
    it('returns null for empty code', async () => {
      const result = await transferModel.findByAcceptanceCode('');

      expect(result).toBeNull();
    });

    it('returns transfer when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTransferRow] });

      const result = await transferModel.findByAcceptanceCode('ACCEPT123');

      expect(result?.acceptance_code).toBe('ACCEPT123');
    });
  });

  describe('findByFromUserId()', () => {
    it('returns outgoing transfers', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTransferRow] });

      const result = await transferModel.findByFromUserId('user-abc');

      expect(result).toHaveLength(1);
    });
  });

  describe('findByToUserId()', () => {
    it('returns incoming transfers', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTransferRow] });

      const result = await transferModel.findByToUserId('user-def');

      expect(result).toHaveLength(1);
    });
  });

  describe('findByToEmail()', () => {
    it('returns transfers by email', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTransferRow] });

      const result = await transferModel.findByToEmail('recipient@example.com');

      expect(result).toHaveLength(1);
    });
  });

  describe('findPendingByTicketId()', () => {
    it('returns pending non-expired transfers', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTransferRow] });

      const result = await transferModel.findPendingByTicketId('ticket-789');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'pending'"),
        ['ticket-789']
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('accept()', () => {
    it('updates status to accepted', async () => {
      const acceptedRow = { ...mockTransferRow, status: 'accepted', to_user_id: 'user-def' };
      mockPool.query.mockResolvedValueOnce({ rows: [acceptedRow] });

      const result = await transferModel.accept('transfer-123', 'user-def');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'accepted'"),
        ['transfer-123', 'user-def']
      );
      expect(result?.status).toBe('accepted');
    });
  });

  describe('complete()', () => {
    it('updates status to completed', async () => {
      const completedRow = { ...mockTransferRow, status: 'completed' };
      mockPool.query.mockResolvedValueOnce({ rows: [completedRow] });

      const result = await transferModel.complete('transfer-123');

      expect(result?.status).toBe('completed');
    });
  });

  describe('cancel()', () => {
    it('updates status to cancelled with reason', async () => {
      const cancelledRow = { ...mockTransferRow, status: 'cancelled' };
      mockPool.query.mockResolvedValueOnce({ rows: [cancelledRow] });

      const result = await transferModel.cancel('transfer-123', 'User requested');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'cancelled'"),
        ['transfer-123', 'User requested']
      );
      expect(result?.status).toBe('cancelled');
    });
  });

  describe('reject()', () => {
    it('updates status to rejected', async () => {
      const rejectedRow = { ...mockTransferRow, status: 'rejected' };
      mockPool.query.mockResolvedValueOnce({ rows: [rejectedRow] });

      const result = await transferModel.reject('transfer-123');

      expect(result?.status).toBe('rejected');
    });
  });

  describe('expire()', () => {
    it('updates status to expired', async () => {
      const expiredRow = { ...mockTransferRow, status: 'expired' };
      mockPool.query.mockResolvedValueOnce({ rows: [expiredRow] });

      const result = await transferModel.expire('transfer-123');

      expect(result?.status).toBe('expired');
    });
  });

  describe('expireOldPending()', () => {
    it('expires all old pending transfers', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 5 });

      const result = await transferModel.expireOldPending();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'pending' AND expires_at < NOW()")
      );
      expect(result).toBe(5);
    });
  });

  describe('delete()', () => {
    it('deletes transfer', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await transferModel.delete('transfer-123');

      expect(result).toBe(true);
    });
  });
});
