import { ExpirationJob } from '../../../src/jobs/expiration.job';
import { OrderService } from '../../../src/services/order.service';
import * as database from '../../../src/config/database';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/services/order.service');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createContextLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));
jest.mock('../../../src/utils/retry', () => ({
  retry: jest.fn(async (fn) => await fn()),
}));
jest.mock('../../../src/utils/circuit-breaker');
jest.mock('../../../src/utils/distributed-lock', () => ({
  withLock: jest.fn(async (key, fn) => await fn()),
  extendLock: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    setex: jest.fn().mockResolvedValue('OK'),
  })),
}));

describe('ExpirationJob', () => {
  let job: ExpirationJob;
  let mockOrderService: jest.Mocked<OrderService>;
  let mockDb: any;

  const mockGetDatabase = jest.mocked(database.getDatabase);

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database
    mockDb = {
      query: jest.fn(),
    };
    mockGetDatabase.mockReturnValue(mockDb);

    // Mock OrderService
    mockOrderService = {
      getTenantsWithReservedOrders: jest.fn(),
      getExpiredReservations: jest.fn(),
      expireReservation: jest.fn(),
    } as any;

    (OrderService as jest.MockedClass<typeof OrderService>).mockImplementation(
      () => mockOrderService
    );

    job = new ExpirationJob();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      const status = job.getStatus();

      expect(status.name).toBe('order-expiration');
      expect(status.enabled).toBe(true);
    });
  });

  describe('executeCore', () => {
    it('should process expired reservations successfully', async () => {
      const tenantIds = ['tenant-1', 'tenant-2'];
      const expiredOrders1 = [
        { id: 'order-1' } as any,
        { id: 'order-2' } as any,
      ];
      const expiredOrders2 = [
        { id: 'order-3' } as any,
        { id: 'order-4' } as any,
      ];

      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue(tenantIds);
      mockOrderService.getExpiredReservations
        .mockResolvedValueOnce(expiredOrders1)
        .mockResolvedValueOnce(expiredOrders2);
      mockOrderService.expireReservation.mockResolvedValue(undefined);

      await (job as any).executeCore();

      expect(mockOrderService.getTenantsWithReservedOrders).toHaveBeenCalledWith(1000);
      expect(mockOrderService.getExpiredReservations).toHaveBeenCalledWith('tenant-1', 100);
      expect(mockOrderService.getExpiredReservations).toHaveBeenCalledWith('tenant-2', 100);
      expect(mockOrderService.expireReservation).toHaveBeenCalledTimes(4);
      expect(mockOrderService.expireReservation).toHaveBeenCalledWith(
        'order-1',
        'tenant-1',
        'Reservation timeout'
      );
    });

    it('should handle no expired orders', async () => {
      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue(['tenant-1']);
      mockOrderService.getExpiredReservations.mockResolvedValue([]);

      await (job as any).executeCore();

      expect(mockOrderService.expireReservation).not.toHaveBeenCalled();
    });

    it('should handle no tenants with reserved orders', async () => {
      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue([]);

      await (job as any).executeCore();

      expect(mockOrderService.getExpiredReservations).not.toHaveBeenCalled();
      expect(mockOrderService.expireReservation).not.toHaveBeenCalled();
    });

    it('should continue processing other orders if one fails', async () => {
      const expiredOrders = [
        { id: 'order-1' } as any,
        { id: 'order-2' } as any,
        { id: 'order-3' } as any,
      ];

      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue(['tenant-1']);
      mockOrderService.getExpiredReservations.mockResolvedValue(expiredOrders);
      mockOrderService.expireReservation
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Expiration failed'))
        .mockResolvedValueOnce(undefined);

      await (job as any).executeCore();

      expect(mockOrderService.expireReservation).toHaveBeenCalledTimes(3);
    });

    it('should continue processing other tenants if one fails', async () => {
      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue(['tenant-1', 'tenant-2']);
      mockOrderService.getExpiredReservations
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce([{ id: 'order-1' } as any]);
      mockOrderService.expireReservation.mockResolvedValue(undefined);

      await (job as any).executeCore();

      expect(mockOrderService.getExpiredReservations).toHaveBeenCalledTimes(2);
      expect(mockOrderService.expireReservation).toHaveBeenCalledWith(
        'order-1',
        'tenant-2',
        'Reservation timeout'
      );
    });

    it('should throw error if all operations fail', async () => {
      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue(['tenant-1']);
      mockOrderService.getExpiredReservations.mockResolvedValue([{ id: 'order-1' } as any]);
      mockOrderService.expireReservation.mockRejectedValue(new Error('All failed'));

      await expect((job as any).executeCore()).rejects.toThrow(
        'Failed to expire any orders (1 errors)'
      );
    });

    it('should not throw error if some operations succeed', async () => {
      const expiredOrders = [
        { id: 'order-1' } as any,
        { id: 'order-2' } as any,
      ];

      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue(['tenant-1']);
      mockOrderService.getExpiredReservations.mockResolvedValue(expiredOrders);
      mockOrderService.expireReservation
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('One failed'));

      await expect((job as any).executeCore()).resolves.not.toThrow();
    });

    it('should process multiple tenants with different numbers of expired orders', async () => {
      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue([
        'tenant-1',
        'tenant-2',
        'tenant-3',
      ]);
      mockOrderService.getExpiredReservations
        .mockResolvedValueOnce([
          { id: 'order-1' } as any,
          { id: 'order-2' } as any,
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'order-3' } as any]);
      mockOrderService.expireReservation.mockResolvedValue(undefined);

      await (job as any).executeCore();

      expect(mockOrderService.expireReservation).toHaveBeenCalledTimes(3);
    });

    it('should handle Error objects correctly', async () => {
      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue(['tenant-1']);
      mockOrderService.getExpiredReservations.mockResolvedValue([{ id: 'order-1' } as any]);
      mockOrderService.expireReservation.mockRejectedValue(new Error('Specific error message'));

      await expect((job as any).executeCore()).rejects.toThrow();
    });

    it('should handle tenant query errors gracefully', async () => {
      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue(['tenant-1', 'tenant-2']);
      mockOrderService.getExpiredReservations
        .mockRejectedValueOnce('String error') // Non-Error thrown for tenant-1
        .mockResolvedValueOnce([{ id: 'order-1' } as any]); // tenant-2 succeeds
      mockOrderService.expireReservation.mockResolvedValue(undefined);

      // Should not throw since tenant-2 succeeded
      await expect((job as any).executeCore()).resolves.not.toThrow();

      expect(mockOrderService.expireReservation).toHaveBeenCalledTimes(1);
    });
  });

  describe('database and service integration', () => {
    it('should use database instance correctly', async () => {
      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue([]);

      await (job as any).executeCore();

      expect(mockGetDatabase).toHaveBeenCalled();
    });

    it('should create OrderService with database instance', async () => {
      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue([]);

      await (job as any).executeCore();

      expect(OrderService).toHaveBeenCalledWith(mockDb);
    });

    it('should reuse OrderService instance', async () => {
      mockOrderService.getTenantsWithReservedOrders.mockResolvedValue([]);

      await (job as any).executeCore();
      await (job as any).executeCore();

      expect(OrderService).toHaveBeenCalledTimes(1);
    });
  });
});
