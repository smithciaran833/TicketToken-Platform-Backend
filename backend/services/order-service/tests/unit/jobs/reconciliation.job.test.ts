import { ReconciliationJob } from '../../../src/jobs/reconciliation.job';
import { OrderService } from '../../../src/services/order.service';
import * as database from '../../../src/config/database';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/services/order.service');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ReconciliationJob', () => {
  let job: ReconciliationJob;
  let mockOrderService: jest.Mocked<OrderService>;
  let mockDb: any;

  const mockGetDatabase = jest.mocked(database.getDatabase);
  const mockLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    mockGetDatabase.mockReturnValue(mockDb);

    // Mock OrderService
    mockOrderService = {} as any;
    (OrderService as jest.MockedClass<typeof OrderService>).mockImplementation(
      () => mockOrderService
    );

    job = new ReconciliationJob();
  });

  afterEach(() => {
    job.stop(); // Clean up any running intervals
  });

  describe('start and stop', () => {
    it('should start the reconciliation job', () => {
      job.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting reconciliation job');
    });

    it('should not start if already running', () => {
      job.start();
      job.start();

      expect(mockLogger.warn).toHaveBeenCalledWith('Reconciliation job already running');
    });

    it('should stop the reconciliation job', () => {
      job.start();
      job.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Reconciliation job stopped');
    });

    it('should do nothing if stop called when not running', () => {
      job.stop();
      expect(mockLogger.info).not.toHaveBeenCalledWith('Reconciliation job stopped');
    });
  });

  describe('reconcileOrderState', () => {
    it('should reconcile stale reserved orders', async () => {
      const reservedOrders = [
        { id: 'order-1', order_number: 'ORD-001', status: 'RESERVED' },
        { id: 'order-2', order_number: 'ORD-002', status: 'RESERVED' },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: reservedOrders }) // findStaleReservedOrders
        .mockResolvedValueOnce({ rows: [] }) // reconcileOrder insert
        .mockResolvedValueOnce({ rows: [] }) // reconcileOrder insert
        .mockResolvedValueOnce({ rows: [] }); // findUnconfirmedPaymentOrders

      await (job as any).reconcileOrderState();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting order reconciliation');
      expect(mockLogger.info).toHaveBeenCalledWith('Found 2 reserved orders to check');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Order reconciliation completed',
        expect.objectContaining({
          reconciledCount: 2,
          errorCount: 0,
        })
      );
    });

    it('should verify unconfirmed payment orders', async () => {
      const unconfirmedOrders = [
        {
          id: 'order-1',
          order_number: 'ORD-001',
          status: 'CONFIRMED',
          payment_intent_id: 'pi_123',
        },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findStaleReservedOrders
        .mockResolvedValueOnce({ rows: unconfirmedOrders }) // findUnconfirmedPaymentOrders
        .mockResolvedValueOnce({ rows: [] }); // verifyPaymentStatus insert

      await (job as any).reconcileOrderState();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Found 1 orders with unconfirmed payments'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Order reconciliation completed',
        expect.objectContaining({
          reconciledCount: 1,
        })
      );
    });

    it('should continue processing if one order fails', async () => {
      const reservedOrders = [
        { id: 'order-1', order_number: 'ORD-001' },
        { id: 'order-2', order_number: 'ORD-002' },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: reservedOrders })
        .mockRejectedValueOnce(new Error('Insert failed'))
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await (job as any).reconcileOrderState();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Order reconciliation completed',
        expect.objectContaining({
          reconciledCount: 1,
          errorCount: 1,
        })
      );
    });

    it('should handle reconciliation errors gracefully', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));

      await (job as any).reconcileOrderState();

      expect(mockLogger.error).toHaveBeenCalledWith('Reconciliation job failed', {
        error: expect.any(Error),
      });
    });
  });

  describe('findStaleReservedOrders', () => {
    it('should query for stale reserved orders', async () => {
      const orders = [{ id: 'order-1', status: 'RESERVED' }];
      mockDb.query.mockResolvedValue({ rows: orders });

      const result = await (job as any).findStaleReservedOrders();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'RESERVED'")
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 hour'")
      );
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 100'));
      expect(result).toEqual(orders);
    });
  });

  describe('findUnconfirmedPaymentOrders', () => {
    it('should query for unconfirmed payment orders', async () => {
      const orders = [{ id: 'order-1', status: 'CONFIRMED', payment_intent_id: 'pi_123' }];
      mockDb.query.mockResolvedValue({ rows: orders });

      const result = await (job as any).findUnconfirmedPaymentOrders();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'CONFIRMED'")
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '24 hours'")
      );
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 50'));
      expect(result).toEqual(orders);
    });
  });

  describe('reconcileOrder', () => {
    it('should log reconciliation warning', async () => {
      const order = {
        id: 'order-1',
        order_number: 'ORD-001',
        status: 'RESERVED',
        created_at: new Date(),
        expires_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).reconcileOrder(order);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Reconciling order',
        expect.objectContaining({
          orderId: 'order-1',
          orderNumber: 'ORD-001',
        })
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Order may need manual review',
        expect.objectContaining({
          orderId: 'order-1',
        })
      );
    });

    it('should insert reconciliation event', async () => {
      const order = {
        id: 'order-1',
        order_number: 'ORD-001',
        status: 'RESERVED',
        created_at: new Date(),
        expires_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).reconcileOrder(order);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO order_events'),
        [
          'order-1',
          'RECONCILIATION_CHECK',
          expect.stringContaining('stale_reservation'),
        ]
      );
    });
  });

  describe('verifyPaymentStatus', () => {
    it('should log payment verification', async () => {
      const order = {
        id: 'order-1',
        order_number: 'ORD-001',
        payment_intent_id: 'pi_123',
      };

      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).verifyPaymentStatus(order);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Verifying payment status',
        expect.objectContaining({
          orderId: 'order-1',
          paymentIntentId: 'pi_123',
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Payment verification logged',
        expect.objectContaining({
          orderId: 'order-1',
        })
      );
    });

    it('should insert payment verification event', async () => {
      const order = {
        id: 'order-1',
        order_number: 'ORD-001',
        payment_intent_id: 'pi_123',
      };

      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).verifyPaymentStatus(order);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO order_events'),
        [
          'order-1',
          'RECONCILIATION_CHECK',
          expect.stringContaining('payment_verification'),
        ]
      );
    });
  });

  describe('database integration', () => {
    it('should use database correctly', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).reconcileOrderState();

      expect(mockGetDatabase).toHaveBeenCalled();
    });
  });
});
