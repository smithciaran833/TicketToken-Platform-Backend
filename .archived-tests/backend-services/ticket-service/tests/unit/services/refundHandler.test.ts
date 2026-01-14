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

jest.mock('../../../src/services/databaseService');

// Import after mocks
import { RefundHandler } from '../../../src/services/refundHandler';
import { DatabaseService } from '../../../src/services/databaseService';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('RefundHandler', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPool = {
      query: jest.fn(),
    };

    (DatabaseService.getPool as jest.Mock).mockReturnValue(mockPool);
  });

  // =============================================================================
  // initiateRefund() - 20+ test cases
  // =============================================================================

  describe('initiateRefund()', () => {
    const orderId = 'order-123';
    const reason = 'Customer requested refund';

    beforeEach(() => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // update order
        .mockResolvedValueOnce({
          rows: [{
            payment_intent_id: 'pi_123',
            total_cents: 10000,
          }],
          rowCount: 1,
        }) // get payment details
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // insert into outbox
    });

    it('should initiate refund successfully', async () => {
      const result = await RefundHandler.initiateRefund(orderId, reason);

      expect(result).toEqual({
        success: true,
        orderId: 'order-123',
        status: 'REFUND_INITIATED',
      });
    });

    it('should update order status to REFUND_INITIATED', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders'),
        [orderId]
      );

      const updateCall = mockPool.query.mock.calls[0];
      expect(updateCall[0]).toContain("status = 'REFUND_INITIATED'");
    });

    it('should set updated_at to NOW()', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      const updateCall = mockPool.query.mock.calls[0];
      expect(updateCall[0]).toContain('updated_at = NOW()');
    });

    it('should get payment details from order', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT payment_intent_id, total_cents FROM orders'),
        [orderId]
      );
    });

    it('should throw error if order not found', async () => {
      mockPool.query
        .mockReset()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        RefundHandler.initiateRefund(orderId, reason)
      ).rejects.toThrow(`Order ${orderId} not found`);
    });

    it('should insert refund request into outbox', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbox'),
        expect.any(Array)
      );
    });

    it('should set aggregate_id to orderId in outbox', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      expect(outboxCall[1][0]).toBe(orderId);
    });

    it('should set aggregate_type to order in outbox', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      expect(outboxCall[1][1]).toBe('order');
    });

    it('should set event_type to refund.requested in outbox', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      expect(outboxCall[1][2]).toBe('refund.requested');
    });

    it('should include orderId in outbox payload', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      const payload = JSON.parse(outboxCall[1][3]);
      expect(payload.orderId).toBe(orderId);
    });

    it('should include paymentIntentId in outbox payload', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      const payload = JSON.parse(outboxCall[1][3]);
      expect(payload.paymentIntentId).toBe('pi_123');
    });

    it('should include amountCents in outbox payload', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      const payload = JSON.parse(outboxCall[1][3]);
      expect(payload.amountCents).toBe(10000);
    });

    it('should include reason in outbox payload', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      const payload = JSON.parse(outboxCall[1][3]);
      expect(payload.reason).toBe(reason);
    });

    it('should log refund initiation', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      expect(mockLogger.info).toHaveBeenCalledWith('Refund initiated', {
        orderId,
        reason,
      });
    });

    it('should return success true', async () => {
      const result = await RefundHandler.initiateRefund(orderId, reason);

      expect(result.success).toBe(true);
    });

    it('should return orderId in response', async () => {
      const result = await RefundHandler.initiateRefund(orderId, reason);

      expect(result.orderId).toBe(orderId);
    });

    it('should return status REFUND_INITIATED', async () => {
      const result = await RefundHandler.initiateRefund(orderId, reason);

      expect(result.status).toBe('REFUND_INITIATED');
    });

    it('should handle different order IDs', async () => {
      await RefundHandler.initiateRefund('order-999', reason);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['order-999']
      );
    });

    it('should handle different reasons', async () => {
      const customReason = 'Event cancelled';
      await RefundHandler.initiateRefund(orderId, customReason);

      const outboxCall = mockPool.query.mock.calls[2];
      const payload = JSON.parse(outboxCall[1][3]);
      expect(payload.reason).toBe(customReason);
    });

    it('should handle different payment amounts', async () => {
      mockPool.query
        .mockReset()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            payment_intent_id: 'pi_456',
            total_cents: 50000,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      const payload = JSON.parse(outboxCall[1][3]);
      expect(payload.amountCents).toBe(50000);
    });

    it('should handle different payment intent IDs', async () => {
      mockPool.query
        .mockReset()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            payment_intent_id: 'pi_custom_789',
            total_cents: 10000,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      const payload = JSON.parse(outboxCall[1][3]);
      expect(payload.paymentIntentId).toBe('pi_custom_789');
    });

    it('should log error on failure', async () => {
      const error = new Error('Database error');
      mockPool.query.mockReset().mockRejectedValue(error);

      try {
        await RefundHandler.initiateRefund(orderId, reason);
      } catch (e) {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initiate refund', {
        orderId,
        error,
      });
    });

    it('should throw error on failure', async () => {
      const error = new Error('Database error');
      mockPool.query.mockReset().mockRejectedValue(error);

      await expect(
        RefundHandler.initiateRefund(orderId, reason)
      ).rejects.toThrow('Database error');
    });

    it('should execute queries in correct order', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      expect(mockPool.query).toHaveBeenCalledTimes(3);
      
      // First call: update order
      expect(mockPool.query.mock.calls[0][0]).toContain('UPDATE orders');
      
      // Second call: get payment details
      expect(mockPool.query.mock.calls[1][0]).toContain('SELECT payment_intent_id');
      
      // Third call: insert into outbox
      expect(mockPool.query.mock.calls[2][0]).toContain('INSERT INTO outbox');
    });

    it('should use DatabaseService.getPool()', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      expect(DatabaseService.getPool).toHaveBeenCalled();
    });

    it('should handle zero amount refunds', async () => {
      mockPool.query
        .mockReset()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            payment_intent_id: 'pi_123',
            total_cents: 0,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      const payload = JSON.parse(outboxCall[1][3]);
      expect(payload.amountCents).toBe(0);
    });

    it('should handle large amount refunds', async () => {
      mockPool.query
        .mockReset()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            payment_intent_id: 'pi_123',
            total_cents: 999999999,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      const payload = JSON.parse(outboxCall[1][3]);
      expect(payload.amountCents).toBe(999999999);
    });

    it('should use correct WHERE clause for order update', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      const updateCall = mockPool.query.mock.calls[0];
      expect(updateCall[0]).toContain('WHERE id = $1');
      expect(updateCall[1]).toEqual([orderId]);
    });

    it('should use correct WHERE clause for getting payment details', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      const selectCall = mockPool.query.mock.calls[1];
      expect(selectCall[0]).toContain('WHERE id = $1');
      expect(selectCall[1]).toEqual([orderId]);
    });

    it('should create valid JSON payload for outbox', async () => {
      await RefundHandler.initiateRefund(orderId, reason);

      const outboxCall = mockPool.query.mock.calls[2];
      const payloadString = outboxCall[1][3];
      
      // Should be valid JSON
      expect(() => JSON.parse(payloadString)).not.toThrow();
      
      // Should have all required fields
      const payload = JSON.parse(payloadString);
      expect(payload).toHaveProperty('orderId');
      expect(payload).toHaveProperty('paymentIntentId');
      expect(payload).toHaveProperty('amountCents');
      expect(payload).toHaveProperty('reason');
    });
  });

  // =============================================================================
  // RefundHandler instance test
  // =============================================================================

  describe('RefundHandler instance', () => {
    it('should export a singleton instance', () => {
      expect(RefundHandler).toBeDefined();
    });

    it('should have initiateRefund method', () => {
      expect(typeof RefundHandler.initiateRefund).toBe('function');
    });
  });
});
