/**
 * Unit Tests for src/services/refundHandler.ts
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

const mockQuery = jest.fn();
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: jest.fn().mockReturnValue({
      query: mockQuery,
    }),
  },
}));

import { RefundHandler } from '../../../src/services/refundHandler';

describe('services/refundHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateRefund()', () => {
    it('updates order status to REFUND_INITIATED', async () => {
      mockQuery
        .mockResolvedValueOnce({}) // UPDATE orders
        .mockResolvedValueOnce({ rows: [{ payment_intent_id: 'pi_123', total_cents: 5000 }] }) // SELECT
        .mockResolvedValueOnce({}); // INSERT outbox

      await RefundHandler.initiateRefund('order-123', 'Customer requested');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'REFUND_INITIATED'"),
        ['order-123']
      );
    });

    it('throws if order not found', async () => {
      mockQuery
        .mockResolvedValueOnce({}) // UPDATE orders
        .mockResolvedValueOnce({ rows: [] }); // SELECT returns empty

      await expect(
        RefundHandler.initiateRefund('nonexistent', 'reason')
      ).rejects.toThrow('Order nonexistent not found');
    });

    it('queues refund request to outbox', async () => {
      mockQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ payment_intent_id: 'pi_123', total_cents: 5000 }] })
        .mockResolvedValueOnce({});

      await RefundHandler.initiateRefund('order-123', 'Customer requested');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbox'),
        expect.arrayContaining([
          'order-123',
          'order',
          'refund.requested',
          expect.stringContaining('pi_123'),
        ])
      );
    });

    it('includes amount in cents in outbox payload', async () => {
      mockQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ payment_intent_id: 'pi_123', total_cents: 7500 }] })
        .mockResolvedValueOnce({});

      await RefundHandler.initiateRefund('order-123', 'reason');

      const outboxCall = mockQuery.mock.calls[2];
      const payload = JSON.parse(outboxCall[1][3]);
      expect(payload.amountCents).toBe(7500);
    });

    it('returns success response', async () => {
      mockQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ payment_intent_id: 'pi_123', total_cents: 5000 }] })
        .mockResolvedValueOnce({});

      const result = await RefundHandler.initiateRefund('order-123', 'reason');

      expect(result).toEqual({
        success: true,
        orderId: 'order-123',
        status: 'REFUND_INITIATED',
      });
    });
  });
});
