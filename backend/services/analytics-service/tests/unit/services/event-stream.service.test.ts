/**
 * Event Stream Service Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockHincrby = jest.fn().mockResolvedValue(1);
const mockHincrbyfloat = jest.fn().mockResolvedValue(1);
const mockExpire = jest.fn().mockResolvedValue(1);
const mockPfadd = jest.fn().mockResolvedValue(1);
const mockDuplicate = jest.fn().mockReturnValue({
  subscribe: jest.fn(),
  on: jest.fn(),
});

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(() => ({
    hincrby: mockHincrby,
    hincrbyfloat: mockHincrbyfloat,
    expire: mockExpire,
    pfadd: mockPfadd,
    duplicate: mockDuplicate,
  })),
}));

const mockDbInsert = jest.fn().mockReturnThis();
const mockOnConflict = jest.fn().mockReturnThis();
const mockMerge = jest.fn().mockResolvedValue(1);

const mockDb = jest.fn(() => ({
  insert: mockDbInsert,
  onConflict: mockOnConflict,
  merge: mockMerge,
}));
mockDb.raw = jest.fn((sql, bindings) => ({ sql, bindings }));

jest.mock('../../../src/config/database', () => ({
  getAnalyticsDb: jest.fn(() => mockDb),
}));

jest.mock('../../../src/config/websocket', () => ({
  emitMetricUpdate: jest.fn(),
}));

const mockQueueProcess = jest.fn();
const mockQueueAdd = jest.fn().mockResolvedValue({ id: 'job-1' });

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    process: mockQueueProcess,
    add: mockQueueAdd,
  }));
});

import { EventStreamService, StreamEvent } from '../../../src/services/event-stream.service';
import { logger } from '../../../src/utils/logger';
import { emitMetricUpdate } from '../../../src/config/websocket';

describe('EventStreamService', () => {
  let service: EventStreamService;

  const mockEvent: StreamEvent = {
    type: 'ticket-purchase',
    venueId: 'venue-123',
    data: { amount: 100, ticketId: 'ticket-1' },
    timestamp: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventStreamService();
  });

  describe('constructor', () => {
    it('should create instance as EventEmitter', () => {
      expect(service).toBeInstanceOf(EventStreamService);
      expect(typeof service.on).toBe('function');
      expect(typeof service.emit).toBe('function');
    });

    it('should start uninitialized', () => {
      expect((service as any).initialized).toBe(false);
    });
  });

  describe('processEvent', () => {
    it('should emit event type', async () => {
      const emitSpy = jest.spyOn(service, 'emit');

      await service.processEvent('ticket-purchase', mockEvent);

      expect(emitSpy).toHaveBeenCalledWith('ticket-purchase', mockEvent);
    });

    it('should log debug message', async () => {
      await service.processEvent('ticket-purchase', mockEvent);

      expect(logger.debug).toHaveBeenCalledWith('Processing event', {
        type: 'ticket-purchase',
        venueId: 'venue-123',
      });
    });

    it('should attempt to emit WebSocket update', async () => {
      await service.processEvent('ticket-purchase', mockEvent);

      expect(emitMetricUpdate).toHaveBeenCalledWith(
        'venue-123',
        'ticket-purchase',
        mockEvent
      );
    });

    it('should store raw event', async () => {
      await service.processEvent('page-view', mockEvent);

      expect(logger.debug).toHaveBeenCalledWith('Storing raw event', {
        type: 'page-view',
        venueId: 'venue-123',
      });
    });

    it('should handle errors gracefully', async () => {
      (emitMetricUpdate as jest.Mock).mockImplementationOnce(() => {
        throw new Error('WebSocket error');
      });

      await expect(service.processEvent('ticket-purchase', mockEvent)).resolves.not.toThrow();
    });

    it('should log error on failure', async () => {
      const error = new Error('Processing failed');
      jest.spyOn(service, 'emit').mockImplementationOnce(() => {
        throw error;
      });

      await service.processEvent('ticket-purchase', mockEvent);

      expect(logger.error).toHaveBeenCalledWith('Failed to process event', {
        type: 'ticket-purchase',
        error,
      });
    });
  });

  describe('updateRealTimeMetrics', () => {
    it('should call updatePurchaseMetrics for ticket-purchase', async () => {
      const spy = jest.spyOn(service as any, 'updatePurchaseMetrics').mockResolvedValue(undefined);

      await (service as any).updateRealTimeMetrics('ticket-purchase', mockEvent);

      expect(spy).toHaveBeenCalledWith('venue-123', mockEvent.data);
    });

    it('should call updateScanMetrics for ticket-scan', async () => {
      const spy = jest.spyOn(service as any, 'updateScanMetrics').mockResolvedValue(undefined);
      const scanEvent = { ...mockEvent, type: 'ticket-scan', data: { eventId: 'event-1' } };

      await (service as any).updateRealTimeMetrics('ticket-scan', scanEvent);

      expect(spy).toHaveBeenCalledWith('venue-123', scanEvent.data);
    });

    it('should call updateTrafficMetrics for page-view', async () => {
      const spy = jest.spyOn(service as any, 'updateTrafficMetrics').mockResolvedValue(undefined);
      const viewEvent = { ...mockEvent, type: 'page-view', data: { sessionId: 'sess-1' } };

      await (service as any).updateRealTimeMetrics('page-view', viewEvent);

      expect(spy).toHaveBeenCalledWith('venue-123', viewEvent.data);
    });
  });

  describe('updatePurchaseMetrics', () => {
    beforeEach(async () => {
      // Initialize service to set up redis
      await (service as any).initialize();
    });

    it('should increment total sales in Redis', async () => {
      await (service as any).updatePurchaseMetrics('venue-123', { amount: 100 });

      expect(mockHincrby).toHaveBeenCalledWith(
        expect.stringContaining('metrics:purchase:venue-123'),
        'total_sales',
        1
      );
    });

    it('should increment revenue in Redis', async () => {
      await (service as any).updatePurchaseMetrics('venue-123', { amount: 150.50 });

      expect(mockHincrbyfloat).toHaveBeenCalledWith(
        expect.stringContaining('metrics:purchase:venue-123'),
        'revenue',
        150.50
      );
    });

    it('should set TTL on Redis key', async () => {
      await (service as any).updatePurchaseMetrics('venue-123', { amount: 100 });

      expect(mockExpire).toHaveBeenCalledWith(
        expect.stringContaining('metrics:purchase:venue-123'),
        86400
      );
    });

    it('should upsert to database', async () => {
      await (service as any).updatePurchaseMetrics('venue-123', { amount: 100 });

      expect(mockDb).toHaveBeenCalledWith('venue_analytics');
      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: 'venue-123',
          tickets_sold: 1,
          revenue: 100,
        })
      );
      expect(mockOnConflict).toHaveBeenCalledWith(['venue_id', 'date', 'hour']);
      expect(mockMerge).toHaveBeenCalled();
    });
  });

  describe('updateScanMetrics', () => {
    beforeEach(async () => {
      await (service as any).initialize();
    });

    it('should increment scanned count in Redis', async () => {
      await (service as any).updateScanMetrics('venue-123', { eventId: 'event-456' });

      expect(mockHincrby).toHaveBeenCalledWith(
        'metrics:scan:venue-123:event-456',
        'scanned',
        1
      );
    });

    it('should set TTL on scan key', async () => {
      await (service as any).updateScanMetrics('venue-123', { eventId: 'event-456' });

      expect(mockExpire).toHaveBeenCalledWith('metrics:scan:venue-123:event-456', 86400);
    });
  });

  describe('updateTrafficMetrics', () => {
    beforeEach(async () => {
      await (service as any).initialize();
    });

    it('should increment page views in Redis', async () => {
      await (service as any).updateTrafficMetrics('venue-123', { sessionId: 'sess-1' });

      expect(mockHincrby).toHaveBeenCalledWith(
        expect.stringContaining('metrics:traffic:venue-123'),
        'page_views',
        1
      );
    });

    it('should add to HyperLogLog for unique visitors', async () => {
      await (service as any).updateTrafficMetrics('venue-123', { sessionId: 'sess-abc' });

      expect(mockPfadd).toHaveBeenCalledWith(
        'unique_visitors:venue-123',
        'sess-abc'
      );
    });

    it('should set TTL on traffic key', async () => {
      await (service as any).updateTrafficMetrics('venue-123', { sessionId: 'sess-1' });

      expect(mockExpire).toHaveBeenCalledWith(
        expect.stringContaining('metrics:traffic:venue-123'),
        86400
      );
    });
  });

  describe('pushEvent', () => {
    it('should add event to queue', async () => {
      await service.pushEvent('ticket-purchase', mockEvent);

      expect(mockQueueAdd).toHaveBeenCalledWith(mockEvent, {
        removeOnComplete: true,
        removeOnFail: false,
      });
    });

    it('should initialize before pushing', async () => {
      const initSpy = jest.spyOn(service as any, 'initialize');

      await service.pushEvent('ticket-purchase', mockEvent);

      expect(initSpy).toHaveBeenCalled();
    });
  });

  describe('subscribeToExternalEvents', () => {
    it('should initialize service', async () => {
      const initSpy = jest.spyOn(service as any, 'initialize');

      await service.subscribeToExternalEvents();

      expect(initSpy).toHaveBeenCalled();
    });

    it('should subscribe to analytics:events channel', async () => {
      await service.subscribeToExternalEvents();

      const subscriber = mockDuplicate();
      expect(subscriber.subscribe).toHaveBeenCalledWith('analytics:events');
    });
  });

  describe('initializeQueues', () => {
    it('should create queues for all event types', async () => {
      await (service as any).initialize();

      const queues = (service as any).queues;
      expect(queues.has('ticket-purchase')).toBe(true);
      expect(queues.has('ticket-scan')).toBe(true);
      expect(queues.has('page-view')).toBe(true);
      expect(queues.has('cart-update')).toBe(true);
      expect(queues.has('venue-update')).toBe(true);
    });
  });
});
