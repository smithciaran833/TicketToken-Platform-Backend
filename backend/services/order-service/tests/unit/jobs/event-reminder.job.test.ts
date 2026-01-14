import { EventReminderJob } from '../../../src/jobs/event-reminder.job';
import * as database from '../../../src/config/database';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/config/database');
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

describe('EventReminderJob', () => {
  let job: EventReminderJob;
  let mockDb: any;

  const mockGetDatabase = jest.mocked(database.getDatabase);
  const mockLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database
    mockDb = {
      query: jest.fn(),
    };
    mockGetDatabase.mockReturnValue(mockDb);

    job = new EventReminderJob();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      const status = job.getStatus();

      expect(status.name).toBe('event-reminder');
      expect(status.enabled).toBe(true);
    });
  });

  describe('executeCore', () => {
    it('should process event reminders successfully', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          tenant_id: 'tenant-1',
          user_id: 'user-1',
          event_id: 'event-1',
          event_date: new Date('2024-12-25T10:00:00Z'),
          event_name: 'Concert',
          status: 'CONFIRMED',
        },
        {
          id: 'order-2',
          tenant_id: 'tenant-1',
          user_id: 'user-2',
          event_id: 'event-2',
          event_date: new Date('2024-12-25T14:00:00Z'),
          event_name: 'Sports Game',
          status: 'CONFIRMED',
        },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockOrders })
        .mockResolvedValue({ rows: [] });

      await (job as any).executeCore();

      expect(mockLogger.info).toHaveBeenCalledWith('Processing event reminders', {
        count: 2,
      });
      expect(mockDb.query).toHaveBeenCalledTimes(3); // 1 select + 2 inserts
      expect(mockLogger.info).toHaveBeenCalledWith('Event reminder scheduled', {
        orderId: 'order-1',
        eventDate: mockOrders[0].event_date,
      });
    });

    it('should handle no upcoming events', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).executeCore();

      expect(mockLogger.info).toHaveBeenCalledWith('Processing event reminders', { count: 0 });
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('should query for events happening in next 24 hours', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).executeCore();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("BETWEEN NOW() AND NOW() + INTERVAL '24 hours'"),
        ['EVENT_REMINDER']
      );
    });

    it('should exclude orders with recent reminders', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).executeCore();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("nl.created_at > NOW() - INTERVAL '48 hours'"),
        ['EVENT_REMINDER']
      );
    });

    it('should limit results to 100', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).executeCore();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 100'),
        ['EVENT_REMINDER']
      );
    });

    it('should continue processing other reminders if one fails', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          tenant_id: 'tenant-1',
          user_id: 'user-1',
          event_date: new Date(),
          event_name: 'Event 1',
        },
        {
          id: 'order-2',
          tenant_id: 'tenant-1',
          user_id: 'user-2',
          event_date: new Date(),
          event_name: 'Event 2',
        },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockOrders })
        .mockRejectedValueOnce(new Error('Insert failed'))
        .mockResolvedValueOnce({ rows: [] });

      await (job as any).executeCore();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error sending event reminder',
        expect.objectContaining({
          orderId: 'order-1',
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Event reminder scheduled',
        expect.objectContaining({ orderId: 'order-2' })
      );
    });

    it('should throw error if query fails', async () => {
      mockDb.query.mockRejectedValue(new Error('Database connection failed'));

      await expect((job as any).executeCore()).rejects.toThrow('Database connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Error in event reminder job', {
        error: expect.any(Error),
      });
    });
  });

  describe('sendEventReminder', () => {
    it('should insert scheduled notification correctly', async () => {
      const mockOrder = {
        id: 'order-1',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        event_date: new Date('2024-12-25T10:00:00Z'),
        event_name: 'Concert',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({ rows: [] });

      await (job as any).executeCore();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scheduled_notifications'),
        [
          'tenant-1',
          'order-1',
          'user-1',
          'EVENT_REMINDER',
          'EMAIL',
          expect.stringContaining('eventDate'),
        ]
      );
    });

    it('should include event metadata in notification', async () => {
      const mockOrder = {
        id: 'order-1',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        event_date: new Date('2024-12-25T10:00:00Z'),
        event_name: 'Concert Hall',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({ rows: [] });

      await (job as any).executeCore();

      const insertCall = mockDb.query.mock.calls.find((call: any) =>
        call[0].includes('INSERT INTO scheduled_notifications')
      );

      const metadata = JSON.parse(insertCall[1][5]);
      expect(metadata.eventDate).toBeDefined();
      expect(metadata.eventName).toBe('Concert Hall');
    });

    it('should log successful reminder scheduling', async () => {
      const mockOrder = {
        id: 'order-1',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        event_date: new Date('2024-12-25T10:00:00Z'),
        event_name: 'Concert',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({ rows: [] });

      await (job as any).executeCore();

      expect(mockLogger.info).toHaveBeenCalledWith('Event reminder scheduled', {
        orderId: 'order-1',
        eventDate: mockOrder.event_date,
      });
    });

    it('should log error if scheduling fails', async () => {
      const mockOrder = {
        id: 'order-1',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        event_date: new Date(),
        event_name: 'Concert',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockRejectedValueOnce(new Error('Insert failed'));

      await (job as any).executeCore();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error sending event reminder',
        expect.objectContaining({
          orderId: 'order-1',
          error: expect.any(Error),
        })
      );
    });
  });

  describe('database integration', () => {
    it('should use database instance correctly', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).executeCore();

      expect(mockGetDatabase).toHaveBeenCalled();
    });

    it('should reuse database instance', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).executeCore();
      await (job as any).executeCore();

      // Database getter should be called each time but use same instance
      expect(mockGetDatabase).toHaveBeenCalled();
    });
  });
});
