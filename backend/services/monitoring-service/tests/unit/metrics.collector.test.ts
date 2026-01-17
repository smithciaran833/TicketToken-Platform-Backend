// Mock prom-client before import
const mockInc = jest.fn();
const mockObserve = jest.fn();
const mockSet = jest.fn();
const mockGet = jest.fn();

const createMockMetric = () => ({
  inc: mockInc,
  observe: mockObserve,
  set: mockSet,
  get: mockGet,
});

jest.mock('prom-client', () => ({
  register: {
    registerMetric: jest.fn(),
    metrics: jest.fn().mockResolvedValue('# HELP test metric\ntest_metric 1'),
  },
  Counter: jest.fn().mockImplementation(() => createMockMetric()),
  Histogram: jest.fn().mockImplementation(() => createMockMetric()),
  Gauge: jest.fn().mockImplementation(() => createMockMetric()),
  Summary: jest.fn().mockImplementation(() => createMockMetric()),
}));

import { Counter, Histogram, Gauge, Summary, register } from 'prom-client';

describe('MetricsCollector', () => {
  let MetricsCollector: any;
  let metricsCollector: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ values: [{ value: 100 }] });

    jest.isolateModules(() => {
      const module = require('../../src/metrics.collector');
      MetricsCollector = module.MetricsCollector;
      metricsCollector = module.metricsCollector;
    });
  });

  describe('constructor', () => {
    it('should be an EventEmitter', () => {
      expect(metricsCollector.on).toBeDefined();
      expect(metricsCollector.emit).toBeDefined();
    });

    it('should create business metrics', () => {
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tickets_sold_total' })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tickets_listed_total' })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'revenue_total_cents' })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'refunds_processed_total' })
      );
    });

    it('should create performance metrics', () => {
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'http_request_duration_ms' })
      );
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'db_query_duration_ms' })
      );
      expect(Summary).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'api_response_time_ms' })
      );
    });

    it('should create system metrics', () => {
      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'active_users' })
      );
      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'queue_size' })
      );
      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'cache_hit_rate' })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'errors_total' })
      );
    });

    it('should create payment metrics', () => {
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'payment_success_total' })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'payment_failure_total' })
      );
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'payment_processing_duration_ms' })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'stripe_webhooks_total' })
      );
    });

    it('should create blockchain metrics', () => {
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'nft_minted_total' })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'nft_transferred_total' })
      );
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'solana_transaction_time_ms' })
      );
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'solana_errors_total' })
      );
    });

    it('should register all metrics', () => {
      // 19 metrics total should be registered
      expect(register.registerMetric).toHaveBeenCalledTimes(19);
    });
  });

  describe('metric configurations', () => {
    it('should configure http_request_duration with correct buckets', () => {
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'http_request_duration_ms',
          buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
        })
      );
    });

    it('should configure db_query_duration with correct buckets', () => {
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'db_query_duration_ms',
          buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
        })
      );
    });

    it('should configure api_response_time with correct percentiles', () => {
      expect(Summary).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'api_response_time_ms',
          percentiles: [0.5, 0.9, 0.95, 0.99],
        })
      );
    });

    it('should configure payment_duration with correct buckets', () => {
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'payment_processing_duration_ms',
          buckets: [100, 500, 1000, 2000, 5000, 10000],
        })
      );
    });

    it('should configure solana_transaction_time with correct buckets', () => {
      expect(Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'solana_transaction_time_ms',
          buckets: [1000, 2000, 5000, 10000, 20000, 30000],
        })
      );
    });
  });

  describe('recordTicketSale', () => {
    it('should increment tickets sold counter', () => {
      metricsCollector.recordTicketSale('venue-1', 'event-1', 'vip', 5000);

      expect(mockInc).toHaveBeenCalledWith({
        venue_id: 'venue-1',
        event_id: 'event-1',
        ticket_type: 'vip',
      });
    });

    it('should increment revenue counter with price', () => {
      metricsCollector.recordTicketSale('venue-1', 'event-1', 'general', 2500);

      expect(mockInc).toHaveBeenCalledWith(
        { venue_id: 'venue-1', type: 'primary_sale' },
        2500
      );
    });
  });

  describe('recordPayment', () => {
    it('should increment success counter for successful payments', () => {
      metricsCollector.recordPayment('stripe', true, 500);

      expect(mockInc).toHaveBeenCalledWith({
        provider: 'stripe',
        currency: 'USD',
      });
    });

    it('should increment failure counter for failed payments', () => {
      metricsCollector.recordPayment('stripe', false, 500, 'card_declined');

      expect(mockInc).toHaveBeenCalledWith({
        provider: 'stripe',
        error_code: 'card_declined',
      });
    });

    it('should use unknown error code if not provided', () => {
      metricsCollector.recordPayment('stripe', false, 500);

      expect(mockInc).toHaveBeenCalledWith({
        provider: 'stripe',
        error_code: 'unknown',
      });
    });

    it('should observe payment duration', () => {
      metricsCollector.recordPayment('stripe', true, 750);

      expect(mockObserve).toHaveBeenCalledWith(
        { provider: 'stripe', type: 'charge' },
        750
      );
    });
  });

  describe('recordApiCall', () => {
    it('should observe http request duration', () => {
      metricsCollector.recordApiCall('GET', '/api/tickets', 200, 150);

      expect(mockObserve).toHaveBeenCalledWith(
        { method: 'GET', route: '/api/tickets', status_code: '200' },
        150
      );
    });

    it('should convert status code to string', () => {
      metricsCollector.recordApiCall('POST', '/api/orders', 201, 300);

      expect(mockObserve).toHaveBeenCalledWith(
        expect.objectContaining({ status_code: '201' }),
        300
      );
    });
  });

  describe('recordError', () => {
    it('should increment error counter', () => {
      metricsCollector.recordError('payment-service', 'timeout', 'medium');

      expect(mockInc).toHaveBeenCalledWith({
        service: 'payment-service',
        error_type: 'timeout',
        severity: 'medium',
      });
    });

    it('should emit critical_error event for critical severity', () => {
      const handler = jest.fn();
      metricsCollector.on('critical_error', handler);

      metricsCollector.recordError('database', 'connection_lost', 'critical');

      expect(handler).toHaveBeenCalledWith({
        service: 'database',
        errorType: 'connection_lost',
        timestamp: expect.any(Date),
      });
    });

    it('should not emit critical_error for non-critical severity', () => {
      const handler = jest.fn();
      metricsCollector.on('critical_error', handler);

      metricsCollector.recordError('api', 'validation', 'low');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('should return prometheus formatted metrics', async () => {
      const metrics = await metricsCollector.getMetrics();

      expect(metrics).toContain('# HELP');
      expect(register.metrics).toHaveBeenCalled();
    });
  });

  describe('getBusinessMetrics', () => {
    it('should return aggregated business metrics', async () => {
      mockGet.mockResolvedValue({ values: [{ value: 50 }, { value: 50 }] });

      const metrics = await metricsCollector.getBusinessMetrics();

      expect(metrics).toHaveProperty('totalTicketsSold');
      expect(metrics).toHaveProperty('totalRevenue');
      expect(metrics).toHaveProperty('totalRefunds');
      expect(metrics).toHaveProperty('activeListings');
    });

    it('should sum values from all labels', async () => {
      mockGet.mockResolvedValue({
        values: [
          { value: 100 },
          { value: 200 },
          { value: 50 },
        ],
      });

      const metrics = await metricsCollector.getBusinessMetrics();

      expect(metrics.totalTicketsSold).toBe(350);
    });

    it('should handle empty values', async () => {
      mockGet.mockResolvedValue({ values: [] });

      const metrics = await metricsCollector.getBusinessMetrics();

      expect(metrics.totalTicketsSold).toBe(0);
    });

    it('should handle missing value property', async () => {
      mockGet.mockResolvedValue({
        values: [{ labels: {} }, { value: 100 }],
      });

      const metrics = await metricsCollector.getBusinessMetrics();

      expect(metrics.totalTicketsSold).toBe(100);
    });
  });

  describe('metric labels', () => {
    it('should have correct labels for ticketsSold', () => {
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tickets_sold_total',
          labelNames: ['venue_id', 'event_id', 'ticket_type'],
        })
      );
    });

    it('should have correct labels for errorRate', () => {
      expect(Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'errors_total',
          labelNames: ['service', 'error_type', 'severity'],
        })
      );
    });

    it('should have correct labels for activeUsers', () => {
      expect(Gauge).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'active_users',
          labelNames: ['type'],
        })
      );
    });
  });

  describe('exported instance', () => {
    it('should export metricsCollector singleton', () => {
      expect(metricsCollector).toBeDefined();
      expect(metricsCollector.ticketsSold).toBeDefined();
      expect(metricsCollector.recordTicketSale).toBeDefined();
    });
  });
});
