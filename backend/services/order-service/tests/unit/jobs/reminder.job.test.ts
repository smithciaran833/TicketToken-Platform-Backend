import { ReminderJob } from '../../../src/jobs/reminder.job';
import { OrderService } from '../../../src/services/order.service';
import { OrderModel } from '../../../src/models/order.model';
import * as database from '../../../src/config/database';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/services/order.service');
jest.mock('../../../src/models/order.model');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('ReminderJob', () => {
  let job: ReminderJob;
  let mockOrderService: jest.Mocked<OrderService>;
  let mockOrderModel: jest.Mocked<OrderModel>;
  let mockDb: any;

  const mockGetDatabase = jest.mocked(database.getDatabase);
  const mockLogger = logger as jest.Mocked<typeof logger>;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock environment
    process.env.NOTIFICATION_SERVICE_URL = 'http://notification-service';
    process.env.INTERNAL_SERVICE_SECRET = 'test-secret';

    // Mock database
    mockDb = {
      query: jest.fn(),
    };
    mockGetDatabase.mockReturnValue(mockDb);

    // Mock OrderService
    mockOrderService = {
      getExpiringReservations: jest.fn(),
    } as any;
    (OrderService as jest.MockedClass<typeof OrderService>).mockImplementation(
      () => mockOrderService
    );

    // Mock OrderModel
    mockOrderModel = {
      getTenantsWithReservedOrders: jest.fn(),
    } as any;
    (OrderModel as jest.MockedClass<typeof OrderModel>).mockImplementation(
      () => mockOrderModel
    );

    // Mock fetch response
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    job = new ReminderJob();
  });

  afterEach(() => {
    job.stop(); // Clean up any running intervals
    delete process.env.NOTIFICATION_SERVICE_URL;
    delete process.env.INTERNAL_SERVICE_SECRET;
  });

  describe('start and stop', () => {
    it('should start the reminder job', () => {
      job.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting reminder job');
    });

    it('should not start if already running', () => {
      job.start();
      job.start();

      expect(mockLogger.warn).toHaveBeenCalledWith('Reminder job already running');
    });

    it('should stop the reminder job', () => {
      job.start();
      job.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Reminder job stopped');
    });

    it('should do nothing if stop called when not running', () => {
      job.stop();
      expect(mockLogger.info).not.toHaveBeenCalledWith('Reminder job stopped');
    });
  });

  describe('sendExpirationReminders', () => {
    it('should process reminders for all tenants', async () => {
      const tenants = ['tenant-1', 'tenant-2'];
      const orders = [
        {
          id: 'order-1',
          userId: 'user-1',
          orderNumber: 'ORD-001',
          expiresAt: new Date(Date.now() + 300000),
          totalCents: 10000,
          currency: 'USD',
        },
      ];

      mockOrderModel.getTenantsWithReservedOrders.mockResolvedValue(tenants);
      mockOrderService.getExpiringReservations.mockResolvedValue(orders as any);

      await (job as any).sendExpirationReminders();

      expect(mockOrderModel.getTenantsWithReservedOrders).toHaveBeenCalled();
      expect(mockOrderService.getExpiringReservations).toHaveBeenCalledTimes(2);
      expect(mockLogger.debug).toHaveBeenCalledWith('Processing reminders for 2 tenants');
    });

    it('should handle no tenants', async () => {
      mockOrderModel.getTenantsWithReservedOrders.mockResolvedValue([]);

      await (job as any).sendExpirationReminders();

      expect(mockOrderService.getExpiringReservations).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockOrderModel.getTenantsWithReservedOrders.mockRejectedValue(
        new Error('Database error')
      );

      await (job as any).sendExpirationReminders();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Reminder job failed',
        expect.objectContaining({
          error: 'Database error',
        })
      );
    });

    it('should clear sentReminders when it exceeds 10000', async () => {
      mockOrderModel.getTenantsWithReservedOrders.mockResolvedValue([]);

      // Simulate large set
      for (let i = 0; i < 10001; i++) {
        (job as any).sentReminders.add(`order-${i}`);
      }

      await (job as any).sendExpirationReminders();

      expect((job as any).sentReminders.size).toBe(0);
    });
  });

  describe('processRemindersForTenant', () => {
    it('should process expiring orders for a tenant', async () => {
      const orders = [
        {
          id: 'order-1',
          userId: 'user-1',
          orderNumber: 'ORD-001',
          expiresAt: new Date(Date.now() + 300000),
          totalCents: 10000,
          currency: 'USD',
        },
      ];

      mockOrderService.getExpiringReservations.mockResolvedValue(orders as any);

      await (job as any).processRemindersForTenant('tenant-1', 15);

      expect(mockOrderService.getExpiringReservations).toHaveBeenCalledWith(
        'tenant-1',
        15,
        100
      );
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should skip orders that already have reminders sent', async () => {
      const orders = [
        {
          id: 'order-1',
          userId: 'user-1',
          orderNumber: 'ORD-001',
          expiresAt: new Date(Date.now() + 300000),
          totalCents: 10000,
          currency: 'USD',
        },
      ];

      mockOrderService.getExpiringReservations.mockResolvedValue(orders as any);
      (job as any).sentReminders.add('order-1');

      await (job as any).processRemindersForTenant('tenant-1', 15);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should continue processing other orders if one fails', async () => {
      const orders = [
        {
          id: 'order-1',
          userId: 'user-1',
          orderNumber: 'ORD-001',
          expiresAt: new Date(Date.now() + 300000),
          totalCents: 10000,
          currency: 'USD',
        },
        {
          id: 'order-2',
          userId: 'user-2',
          orderNumber: 'ORD-002',
          expiresAt: new Date(Date.now() + 300000),
          totalCents: 20000,
          currency: 'USD',
        },
      ];

      mockOrderService.getExpiringReservations.mockResolvedValue(orders as any);
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      await (job as any).processRemindersForTenant('tenant-1', 15);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send expiration reminder',
        expect.objectContaining({
          orderId: 'order-1',
        })
      );
    });

    it('should handle tenant processing errors', async () => {
      mockOrderService.getExpiringReservations.mockRejectedValue(
        new Error('Service error')
      );

      await (job as any).processRemindersForTenant('tenant-1', 15);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process reminders for tenant',
        expect.objectContaining({
          tenantId: 'tenant-1',
        })
      );
    });
  });

  describe('publishReminderEvent', () => {
    const reminderData = {
      tenantId: 'tenant-1',
      orderId: 'order-1',
      userId: 'user-1',
      orderNumber: 'ORD-001',
      expiresAt: new Date('2024-12-25T10:00:00Z'),
      totalCents: 10000,
      currency: 'USD',
      minutesRemaining: 5,
    };

    it('should publish reminder event to notification service', async () => {
      await (job as any).publishReminderEvent(reminderData);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://notification-service/api/v1/notifications',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Internal-Secret': 'test-secret',
            'X-Tenant-ID': 'tenant-1',
          }),
          body: expect.stringContaining('order.expiring_soon'),
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Reminder notification sent successfully',
        expect.objectContaining({
          orderId: 'order-1',
          tenantId: 'tenant-1',
        })
      );
    });

    it('should skip if notification service URL not configured', async () => {
      delete process.env.NOTIFICATION_SERVICE_URL;

      await (job as any).publishReminderEvent(reminderData);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'NOTIFICATION_SERVICE_URL not configured, skipping reminder'
      );
    });

    it('should throw error if notification service returns error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect((job as any).publishReminderEvent(reminderData)).rejects.toThrow(
        'Notification service responded with status 500'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to publish reminder event',
        expect.objectContaining({
          orderId: 'order-1',
        })
      );
    });

    it('should include correct payload structure', async () => {
      await (job as any).publishReminderEvent(reminderData);

      const callArgs = mockFetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1]?.body as string);

      expect(payload).toEqual({
        type: 'order.expiring_soon',
        tenantId: 'tenant-1',
        userId: 'user-1',
        data: {
          orderId: 'order-1',
          orderNumber: 'ORD-001',
          expiresAt: '2024-12-25T10:00:00.000Z',
          totalCents: 10000,
          currency: 'USD',
          minutesRemaining: 5,
        },
        channels: ['email', 'push'],
        priority: 'high',
        metadata: {
          source: 'order-service',
          timestamp: expect.any(String),
        },
      });
    });

    it('should calculate minutes remaining correctly', async () => {
      const now = Date.now();
      const expiresAt = new Date(now + 10 * 60 * 1000); // 10 minutes from now

      const data = {
        ...reminderData,
        expiresAt,
        minutesRemaining: Math.round((expiresAt.getTime() - now) / 60000),
      };

      await (job as any).publishReminderEvent(data);

      const callArgs = mockFetch.mock.calls[0];
      const payload = JSON.parse(callArgs[1]?.body as string);

      expect(payload.data.minutesRemaining).toBeCloseTo(10, 0);
    });
  });

  describe('database and service integration', () => {
    it('should create services when needed', async () => {
      const tenants = ['tenant-1'];
      const orders = [{
        id: 'order-1',
        userId: 'user-1',
        orderNumber: 'ORD-001',
        expiresAt: new Date(Date.now() + 300000),
        totalCents: 10000,
        currency: 'USD',
      }];

      mockOrderModel.getTenantsWithReservedOrders.mockResolvedValue(tenants);
      mockOrderService.getExpiringReservations.mockResolvedValue(orders as any);

      await (job as any).sendExpirationReminders();

      expect(OrderModel).toHaveBeenCalled();
      expect(OrderService).toHaveBeenCalled();
    });
  });
});
