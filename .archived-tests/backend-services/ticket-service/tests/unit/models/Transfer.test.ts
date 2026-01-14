// =============================================================================
// TEST SUITE - Transfer Model
// =============================================================================

import { Pool } from 'pg';
import { TransferModel, ITransfer } from '../../../src/models/Transfer';

describe('TransferModel', () => {
  let model: TransferModel;
  let mockPool: jest.Mocked<Partial<Pool>>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };

    model = new TransferModel(mockPool as Pool);
  });

  describe('create()', () => {
    it('should create a transfer', async () => {
      const transferData: ITransfer = {
        ticket_id: 'ticket-123',
        from_user_id: 'user-1',
        to_user_id: 'user-2',
        status: 'pending',
        transfer_code: 'TRANSFER123',
        expires_at: new Date('2024-12-31'),
      };

      const mockResult = {
        rows: [{ id: 'transfer-1', ...transferData, created_at: new Date() }],
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await model.create(transferData);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transfers'),
        [
          'ticket-123',
          'user-1',
          'user-2',
          'pending',
          'TRANSFER123',
          transferData.expires_at,
        ]
      );
      expect(result.id).toBe('transfer-1');
    });

    it('should default status to pending', async () => {
      const transferData: ITransfer = {
        ticket_id: 'ticket-123',
        from_user_id: 'user-1',
        to_user_id: 'user-2',
        status: 'pending',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.create(transferData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][3]).toBe('pending');
    });

    it('should handle optional transfer_code', async () => {
      const transferData: ITransfer = {
        ticket_id: 'ticket-123',
        from_user_id: 'user-1',
        to_user_id: 'user-2',
        status: 'pending',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [transferData] });

      await model.create(transferData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][4]).toBeUndefined();
    });

    it('should return created transfer', async () => {
      const mockTransfer: ITransfer = {
        id: 'transfer-1',
        ticket_id: 'ticket-123',
        from_user_id: 'user-1',
        to_user_id: 'user-2',
        status: 'pending',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockTransfer] });

      const result = await model.create(mockTransfer);

      expect(result).toEqual(mockTransfer);
    });
  });

  describe('findById()', () => {
    it('should find transfer by id', async () => {
      const mockTransfer = {
        id: 'transfer-1',
        ticket_id: 'ticket-123',
        status: 'pending',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockTransfer] });

      const result = await model.findById('transfer-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM transfers WHERE id = $1',
        ['transfer-1']
      );
      expect(result).toEqual(mockTransfer);
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.findById('notfound');

      expect(result).toBeNull();
    });
  });

  describe('findByTransferCode()', () => {
    it('should find transfer by code', async () => {
      const mockTransfer = {
        id: 'transfer-1',
        transfer_code: 'TRANSFER123',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockTransfer] });

      const result = await model.findByTransferCode('TRANSFER123');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM transfers WHERE transfer_code = $1',
        ['TRANSFER123']
      );
      expect(result).toEqual(mockTransfer);
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.findByTransferCode('NOTFOUND');

      expect(result).toBeNull();
    });
  });

  describe('complete()', () => {
    it('should complete a transfer', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      const result = await model.complete('transfer-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE transfers'),
        ['transfer-1']
      );
      expect(result).toBe(true);
    });

    it('should set status to completed', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      await model.complete('transfer-1');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain("status = 'completed'");
    });

    it('should set completed_at timestamp', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      await model.complete('transfer-1');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('completed_at = NOW()');
    });

    it('should update updated_at timestamp', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      await model.complete('transfer-1');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('updated_at = NOW()');
    });

    it('should return false if no rows updated', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 0 });

      const result = await model.complete('transfer-1');

      expect(result).toBe(false);
    });

    it('should handle null rowCount', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: null });

      const result = await model.complete('transfer-1');

      expect(result).toBe(false);
    });
  });
});
