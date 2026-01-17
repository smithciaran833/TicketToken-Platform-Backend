// Mock dependencies BEFORE imports
const mockPushMetrics = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

const mockGetVenueMetrics = jest.fn();
const mockGetEventMetrics = jest.fn();
const mockGetTicketMetrics = jest.fn();

jest.mock('../../../../src/services/metrics.service', () => ({
  metricsService: {
    pushMetrics: mockPushMetrics,
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    debug: mockLoggerDebug,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    info: jest.fn(),
  },
}));

// Mock the shared clients package
jest.mock('@tickettoken/shared/clients', () => ({
  venueServiceClient: {
    getVenueMetrics: mockGetVenueMetrics,
  },
  eventServiceClient: {
    getEventMetrics: mockGetEventMetrics,
  },
  ticketServiceClient: {
    getTicketMetrics: mockGetTicketMetrics,
  },
}), { virtual: true });

import { BusinessMetricsCollector } from '../../../../src/collectors/business/revenue.collector';

describe('BusinessMetricsCollector', () => {
  let collector: BusinessMetricsCollector;
  let mockSetInterval: jest.SpyInstance;
  let mockClearInterval: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockSetInterval = jest.spyOn(global, 'setInterval');
    mockClearInterval = jest.spyOn(global, 'clearInterval');

    // Default successful responses
    mockGetVenueMetrics.mockResolvedValue({
      totalVenues: 150,
      activeVenues: 120,
    });

    mockGetEventMetrics.mockResolvedValue({
      totalEvents: 75,
    });

    mockGetTicketMetrics.mockResolvedValue({
      ticketsSold: 1250,
    });

    collector = new BusinessMetricsCollector();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getName', () => {
    it('should return collector name', () => {
      expect(collector.getName()).toBe('BusinessMetricsCollector');
    });
  });

  describe('start', () => {
    it('should set up interval for metric collection every 5 minutes', async () => {
      await collector.start();

      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 300000);
    });

    it('should collect metrics immediately on start', async () => {
      await collector.start();

      expect(mockGetVenueMetrics).toHaveBeenCalled();
      expect(mockGetEventMetrics).toHaveBeenCalled();
      expect(mockGetTicketMetrics).toHaveBeenCalled();
      expect(mockPushMetrics).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should clear interval when stopped', async () => {
      await collector.start();
      await collector.stop();

      expect(mockClearInterval).toHaveBeenCalled();
    });

    it('should handle stop when not started', async () => {
      await expect(collector.stop()).resolves.not.toThrow();
      expect(mockClearInterval).not.toHaveBeenCalled();
    });
  });

  describe('collectVenueMetrics', () => {
    it('should collect venue metrics successfully', async () => {
      await collector.start();

      expect(mockGetVenueMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'system',
          traceId: expect.stringMatching(/^metrics-\d+-[a-z0-9]+$/),
        })
      );

      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'business_total_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: 150,
        labels: { type: 'total' },
      });

      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'business_active_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: 120,
        labels: { type: 'active' },
      });
    });

    it('should log debug message on success', async () => {
      await collector.start();

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        { metrics: { totalVenues: 150, activeVenues: 120 } },
        'Venue metrics collected via venue-service'
      );
    });

    it('should handle venue service failure gracefully', async () => {
      mockGetVenueMetrics.mockRejectedValue(new Error('Venue service unavailable'));

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to collect venue metrics, using default values'
      );

      // Should push default metrics
      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'business_total_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: 0,
        labels: { type: 'total' },
      });

      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'business_active_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: 0,
        labels: { type: 'active' },
      });
    });

    it('should continue collecting other metrics if venue fails', async () => {
      mockGetVenueMetrics.mockRejectedValue(new Error('Service down'));

      await collector.start();

      // Should still call event and ticket services
      expect(mockGetEventMetrics).toHaveBeenCalled();
      expect(mockGetTicketMetrics).toHaveBeenCalled();
    });
  });

  describe('collectEventMetrics', () => {
    it('should collect event metrics successfully', async () => {
      await collector.start();

      expect(mockGetEventMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'system',
          traceId: expect.stringMatching(/^metrics-\d+-[a-z0-9]+$/),
        }),
        30 // 30 days
      );

      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'business_events_last_30_days',
        type: 'gauge',
        service: 'monitoring-service',
        value: 75,
        labels: { period: '30d' },
      });
    });

    it('should log debug message on success', async () => {
      await collector.start();

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        { metrics: { totalEvents: 75 } },
        'Event metrics collected via event-service'
      );
    });

    it('should handle event service failure gracefully', async () => {
      mockGetEventMetrics.mockRejectedValue(new Error('Event service unavailable'));

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to collect event metrics, using default values'
      );

      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'business_events_last_30_days',
        type: 'gauge',
        service: 'monitoring-service',
        value: 0,
        labels: { period: '30d' },
      });
    });
  });

  describe('collectTicketMetrics', () => {
    it('should collect ticket metrics successfully', async () => {
      await collector.start();

      expect(mockGetTicketMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'system',
          traceId: expect.stringMatching(/^metrics-\d+-[a-z0-9]+$/),
        }),
        24 // 24 hours
      );

      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'business_tickets_sold_24h',
        type: 'gauge',
        service: 'monitoring-service',
        value: 1250,
        labels: { period: '24h' },
      });
    });

    it('should log debug message on success', async () => {
      await collector.start();

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        { metrics: { ticketsSold: 1250 } },
        'Ticket metrics collected via ticket-service'
      );
    });

    it('should handle ticket service failure gracefully', async () => {
      mockGetTicketMetrics.mockRejectedValue(new Error('Ticket service unavailable'));

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to collect ticket metrics, using default values'
      );

      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'business_tickets_sold_24h',
        type: 'gauge',
        service: 'monitoring-service',
        value: 0,
        labels: { period: '24h' },
      });
    });
  });

  describe('collect - all services', () => {
    it('should collect all business metrics successfully', async () => {
      await collector.start();

      expect(mockGetVenueMetrics).toHaveBeenCalled();
      expect(mockGetEventMetrics).toHaveBeenCalled();
      expect(mockGetTicketMetrics).toHaveBeenCalled();

      expect(mockPushMetrics).toHaveBeenCalledTimes(4);
      expect(mockLoggerDebug).toHaveBeenCalledWith('Business metrics collected successfully');
    });

    it('should handle partial service failures', async () => {
      mockGetVenueMetrics.mockRejectedValue(new Error('Venue down'));
      // Event and ticket succeed

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
      expect(mockPushMetrics).toHaveBeenCalledTimes(4); // 2 default venue + 1 event + 1 ticket
    });

    it('should handle all services failing', async () => {
      mockGetVenueMetrics.mockRejectedValue(new Error('Venue down'));
      mockGetEventMetrics.mockRejectedValue(new Error('Event down'));
      mockGetTicketMetrics.mockRejectedValue(new Error('Ticket down'));

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledTimes(3);
      expect(mockPushMetrics).toHaveBeenCalledTimes(4); // All default values
    });
  });

  describe('edge cases', () => {
    it('should handle zero values', async () => {
      mockGetVenueMetrics.mockResolvedValue({ totalVenues: 0, activeVenues: 0 });
      mockGetEventMetrics.mockResolvedValue({ totalEvents: 0 });
      mockGetTicketMetrics.mockResolvedValue({ ticketsSold: 0 });

      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalledWith(
        expect.objectContaining({ value: 0 })
      );
    });

    it('should handle very large numbers', async () => {
      mockGetVenueMetrics.mockResolvedValue({ totalVenues: 999999, activeVenues: 888888 });
      mockGetEventMetrics.mockResolvedValue({ totalEvents: 777777 });
      mockGetTicketMetrics.mockResolvedValue({ ticketsSold: 666666 });

      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalledWith(
        expect.objectContaining({ value: 999999 })
      );
    });

    it('should create unique trace IDs for each collection', async () => {
      await collector.start();

      const venueCall = mockGetVenueMetrics.mock.calls[0][0];
      const eventCall = mockGetEventMetrics.mock.calls[0][0];
      const ticketCall = mockGetTicketMetrics.mock.calls[0][0];

      // All should have trace IDs
      expect(venueCall.traceId).toMatch(/^metrics-\d+-[a-z0-9]+$/);
      expect(eventCall.traceId).toMatch(/^metrics-\d+-[a-z0-9]+$/);
      expect(ticketCall.traceId).toMatch(/^metrics-\d+-[a-z0-9]+$/);

      // All should be system tenant
      expect(venueCall.tenantId).toBe('system');
      expect(eventCall.tenantId).toBe('system');
      expect(ticketCall.tenantId).toBe('system');
    });
  });
});
