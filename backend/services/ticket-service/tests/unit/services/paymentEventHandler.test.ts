/**
 * Unit Tests for src/services/paymentEventHandler.ts
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

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockClientRelease,
});

jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: jest.fn().mockReturnValue({
      connect: mockConnect,
      query: jest.fn(),
    }),
  },
}));

const mockPublish = jest.fn();
jest.mock('../../../src/services/queueService', () => ({
  QueueService: {
    publish: mockPublish,
  },
}));

import { PaymentEventHandler } from '../../../src/services/paymentEventHandler';

describe('services/paymentEventHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientQuery.mockReset();
  });

  describe('handlePaymentSucceeded()', () => {
    const mockOrder = {
      id: 'order-123',
      user_id: 'user-456',
      event_id: 'event-789',
      venue_id: 'venue-abc',
      ticket_quantity: 2,
    };

    it('updates order status to PAID', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE orders
        .mockResolvedValueOnce({ rows: [mockOrder] }) // SELECT order
        .mockResolvedValueOnce({}) // INSERT outbox
        .mockResolvedValueOnce({}); // COMMIT

      await PaymentEventHandler.handlePaymentSucceeded('order-123', 'pi_payment123');

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'PAID'"),
        ['order-123', 'pi_payment123']
      );
    });

    it('queues NFT minting job', async () => {
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await PaymentEventHandler.handlePaymentSucceeded('order-123', 'pi_payment123');

      expect(mockPublish).toHaveBeenCalledWith(
        'ticket.mint',
        expect.objectContaining({
          orderId: 'order-123',
          userId: 'user-456',
          eventId: 'event-789',
          venueId: 'venue-abc',
          quantity: 2,
        })
      );
    });

    it('writes to outbox', async () => {
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await PaymentEventHandler.handlePaymentSucceeded('order-123', 'pi_payment123');

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbox'),
        expect.arrayContaining(['order-123', 'order', 'order.paid'])
      );
    });

    it('rolls back on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // SELECT returns empty

      await expect(
        PaymentEventHandler.handlePaymentSucceeded('order-123', 'pi_123')
      ).rejects.toThrow('Order order-123 not found');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('releases client on success', async () => {
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await PaymentEventHandler.handlePaymentSucceeded('order-123', 'pi_123');

      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('releases client on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('DB error'));

      await expect(
        PaymentEventHandler.handlePaymentSucceeded('order-123', 'pi_123')
      ).rejects.toThrow();

      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  describe('handlePaymentFailed()', () => {
    it('updates order status to PAYMENT_FAILED', async () => {
      const { DatabaseService } = require('../../../src/services/databaseService');
      const mockPoolQuery = jest.fn().mockResolvedValueOnce({});
      DatabaseService.getPool.mockReturnValue({ query: mockPoolQuery, connect: mockConnect });

      await PaymentEventHandler.handlePaymentFailed('order-123', 'Card declined');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'PAYMENT_FAILED'"),
        ['order-123']
      );
    });
  });
});
