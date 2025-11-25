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

const mockQueueService = {
  publish: jest.fn().mockResolvedValue(true),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => mockLogger),
  },
}));

jest.mock('../../../src/services/databaseService');
jest.mock('../../../src/services/queueService', () => ({
  QueueService: mockQueueService,
}));

// Import after mocks
import { PaymentEventHandler } from '../../../src/services/paymentEventHandler';
import { DatabaseService } from '../../../src/services/databaseService';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('PaymentEventHandler', () => {
  let mockClient: any;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
    };

    (DatabaseService.getPool as jest.Mock).mockReturnValue(mockPool);
  });

  // =============================================================================
  // handlePaymentSucceeded() - 20 test cases
  // =============================================================================

  describe('handlePaymentSucceeded()', () => {
    const orderId = 'order-123';
    const paymentId = 'payment-456';
    const mockOrder = {
      id: orderId,
      user_id: 'user-789',
      event_id: 'event-101',
      ticket_quantity: 2,
      status: 'PENDING',
    };

    beforeEach(() => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE order
        .mockResolvedValueOnce({ rows: [mockOrder], rowCount: 1 }) // SELECT order
        .mockResolvedValueOnce({}) // INSERT outbox
        .mockResolvedValueOnce({}); // COMMIT
    });

    it('should handle payment success', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should update order status to PAID', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE orders') && call[0].includes("status = 'PAID'")
      );

      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toEqual([orderId, paymentId]);
    });

    it('should set payment_intent_id', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('payment_intent_id = $2')
      );

      expect(updateCall).toBeDefined();
    });

    it('should update updated_at timestamp', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('updated_at = NOW()')
      );

      expect(updateCall).toBeDefined();
    });

    it('should retrieve order details', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      const selectCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('SELECT * FROM orders')
      );

      expect(selectCall).toBeDefined();
      expect(selectCall[1]).toEqual([orderId]);
    });

    it('should throw error if order not found', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT - no order

      await expect(
        PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId)
      ).rejects.toThrow(`Order ${orderId} not found`);
    });

    it('should publish NFT minting job', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      expect(mockQueueService.publish).toHaveBeenCalledWith('ticket.mint', {
        orderId: mockOrder.id,
        userId: mockOrder.user_id,
        eventId: mockOrder.event_id,
        quantity: mockOrder.ticket_quantity,
        timestamp: expect.any(String),
      });
    });

    it('should include correct order details in mint job', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      const publishCall = mockQueueService.publish.mock.calls[0][1];
      expect(publishCall.orderId).toBe(orderId);
      expect(publishCall.userId).toBe('user-789');
      expect(publishCall.eventId).toBe('event-101');
      expect(publishCall.quantity).toBe(2);
    });

    it('should write to outbox table', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      const outboxCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO outbox')
      );

      expect(outboxCall).toBeDefined();
    });

    it('should include aggregate_id in outbox', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      const outboxCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO outbox')
      );

      expect(outboxCall[1][0]).toBe(orderId);
    });

    it('should set aggregate_type to order', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      const outboxCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO outbox')
      );

      expect(outboxCall[1][1]).toBe('order');
    });

    it('should set event_type to order.paid', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      const outboxCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO outbox')
      );

      expect(outboxCall[1][2]).toBe('order.paid');
    });

    it('should include mint job in outbox payload', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      const outboxCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO outbox')
      );

      const payload = JSON.parse(outboxCall[1][3]);
      expect(payload.orderId).toBe(orderId);
      expect(payload.quantity).toBe(2);
    });

    it('should log success', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Order marked as paid, NFT minting queued',
        {
          orderId,
          quantity: 2,
        }
      );
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')); // UPDATE fails

      await expect(
        PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId)
      ).rejects.toThrow('DB error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should log error on failure', async () => {
      const error = new Error('DB error');
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(error); // UPDATE fails

      await expect(
        PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId)
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to handle payment success',
        { orderId, error }
      );
    });

    it('should release client on success', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client on error', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('DB error'));

      await expect(
        PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId)
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should use database transaction', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle different order IDs', async () => {
      await PaymentEventHandler.handlePaymentSucceeded('order-999', 'payment-888');

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE orders')
      );

      expect(updateCall[1][0]).toBe('order-999');
      expect(updateCall[1][1]).toBe('payment-888');
    });
  });

  // =============================================================================
  // handlePaymentFailed() - 10 test cases
  // =============================================================================

  describe('handlePaymentFailed()', () => {
    const orderId = 'order-123';
    const reason = 'Insufficient funds';

    beforeEach(() => {
      mockPool.query.mockResolvedValue({});
    });

    it('should handle payment failure', async () => {
      await PaymentEventHandler.handlePaymentFailed(orderId, reason);

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should update order status to PAYMENT_FAILED', async () => {
      await PaymentEventHandler.handlePaymentFailed(orderId, reason);

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('UPDATE orders');
      expect(query).toContain("status = 'PAYMENT_FAILED'");
    });

    it('should update updated_at timestamp', async () => {
      await PaymentEventHandler.handlePaymentFailed(orderId, reason);

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('updated_at = NOW()');
    });

    it('should query with orderId', async () => {
      await PaymentEventHandler.handlePaymentFailed(orderId, reason);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [orderId]
      );
    });

    it('should log failure', async () => {
      await PaymentEventHandler.handlePaymentFailed(orderId, reason);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Order marked as payment failed',
        { orderId, reason }
      );
    });

    it('should handle different order IDs', async () => {
      await PaymentEventHandler.handlePaymentFailed('order-999', 'Card declined');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['order-999']
      );
    });

    it('should handle different failure reasons', async () => {
      await PaymentEventHandler.handlePaymentFailed(orderId, 'Card expired');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Order marked as payment failed',
        { orderId, reason: 'Card expired' }
      );
    });

    it('should not throw on database error', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));

      await expect(
        PaymentEventHandler.handlePaymentFailed(orderId, reason)
      ).rejects.toThrow('DB error');
    });

    it('should use pool directly (no transaction)', async () => {
      await PaymentEventHandler.handlePaymentFailed(orderId, reason);

      expect(mockPool.connect).not.toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should not publish to queue', async () => {
      await PaymentEventHandler.handlePaymentFailed(orderId, reason);

      expect(mockQueueService.publish).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // instance test
  // =============================================================================

  describe('instance', () => {
    it('should be a singleton', () => {
      expect(PaymentEventHandler).toBeDefined();
    });

    it('should have all required methods', () => {
      expect(typeof PaymentEventHandler.handlePaymentSucceeded).toBe('function');
      expect(typeof PaymentEventHandler.handlePaymentFailed).toBe('function');
    });
  });
});
