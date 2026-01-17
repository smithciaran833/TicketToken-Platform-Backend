import { EventEmitter } from 'events';

// Mock TensorFlow - inline to avoid hoisting issues
jest.mock('@tensorflow/tfjs-node', () => {
  const mockModel = {
    compile: jest.fn(),
    predict: jest.fn(),
    fit: jest.fn().mockResolvedValue({}),
  };

  return {
    sequential: jest.fn().mockReturnValue(mockModel),
    layers: {
      dense: jest.fn().mockReturnValue({}),
      dropout: jest.fn().mockReturnValue({}),
      lstm: jest.fn().mockReturnValue({}),
    },
    train: {
      adam: jest.fn().mockReturnValue({}),
    },
    tensor3d: jest.fn().mockReturnValue({
      dispose: jest.fn(),
    }),
    tensor1d: jest.fn().mockReturnValue({
      dispose: jest.fn(),
    }),
    __mockModel: mockModel,
  };
});

// Mock InfluxDB
const mockWritePoint = jest.fn();
jest.mock('@influxdata/influxdb-client', () => ({
  InfluxDB: jest.fn().mockImplementation(() => ({
    getWriteApi: jest.fn().mockReturnValue({
      writePoint: mockWritePoint,
    }),
  })),
  Point: jest.fn().mockImplementation(() => ({
    tag: jest.fn().mockReturnThis(),
    floatField: jest.fn().mockReturnThis(),
    intField: jest.fn().mockReturnThis(),
    timestamp: jest.fn().mockReturnThis(),
  })),
}));

// Mock Kafka producer
jest.mock('../../../src/streaming/kafka-producer', () => ({
  kafkaProducer: {
    sendMetric: jest.fn().mockResolvedValue(undefined),
    sendAlert: jest.fn().mockResolvedValue(undefined),
    sendFraudEvent: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock database
const mockQuery = jest.fn();
jest.mock('../../../src/utils/database', () => ({
  pgPool: {
    query: mockQuery,
  },
}));

// Mock event service client - use relative path that may not exist
jest.mock('@tickettoken/shared/clients', () => ({
  eventServiceClient: {
    getActiveEvents: jest.fn().mockResolvedValue({
      events: [
        { id: 'event-1', name: 'Concert A' },
        { id: 'event-2', name: 'Concert B' },
      ],
    }),
  },
}), { virtual: true });

// Mock shared http client
jest.mock('@tickettoken/shared/http-client/base-service-client', () => ({
  RequestContext: {},
}), { virtual: true });

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { EventSalesTracker } from '../../../src/analytics/sales-tracker';
import { kafkaProducer } from '../../../src/streaming/kafka-producer';
import { logger } from '../../../src/utils/logger';
import { Point } from '@influxdata/influxdb-client';
import * as tf from '@tensorflow/tfjs-node';

describe('EventSalesTracker', () => {
  let salesTracker: EventSalesTracker;
  let mockModel: any;

  const mockVelocityQueryResult = {
    rows: [{
      total_sold: 500,
      last_minute: 5,
      last_5_minutes: 20,
      last_10_minutes: 35,
      first_sale: new Date('2024-01-15T10:00:00Z'),
      last_sale: new Date('2024-01-15T11:00:00Z'),
      total_tickets: 1000,
      remaining_tickets: 500,
    }],
  };

  const mockRecentSalesResult = {
    rows: [
      { minute: new Date('2024-01-15T10:55:00Z'), tickets_sold: 5, avg_price: 50 },
      { minute: new Date('2024-01-15T10:56:00Z'), tickets_sold: 6, avg_price: 50 },
      { minute: new Date('2024-01-15T10:57:00Z'), tickets_sold: 4, avg_price: 50 },
      { minute: new Date('2024-01-15T10:58:00Z'), tickets_sold: 7, avg_price: 50 },
      { minute: new Date('2024-01-15T10:59:00Z'), tickets_sold: 5, avg_price: 50 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Get the mock model
    mockModel = (tf as any).__mockModel;

    // Default mock for training - not enough data
    mockQuery.mockResolvedValue({ rows: [] });

    // Setup prediction mock
    mockModel.predict.mockReturnValue({
      data: jest.fn().mockResolvedValue([30]), // 30 minutes to sellout
      dispose: jest.fn(),
    });

    salesTracker = new EventSalesTracker();
  });

  afterEach(() => {
    jest.useRealTimers();
    salesTracker.removeAllListeners();
  });

  describe('constructor', () => {
    it('should extend EventEmitter', () => {
      expect(salesTracker).toBeInstanceOf(EventEmitter);
    });

    it('should initialize InfluxDB client', () => {
      const { InfluxDB } = require('@influxdata/influxdb-client');
      expect(InfluxDB).toHaveBeenCalledWith({
        url: expect.any(String),
        token: expect.any(String),
      });
    });

    it('should handle initialization failure gracefully', async () => {
      jest.clearAllMocks();
      mockQuery.mockRejectedValueOnce(new Error('DB not ready'));

      const tracker = new EventSalesTracker();

      // Wait for the async initialization to complete/fail
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Sales tracker initialization deferred'),
        expect.any(String)
      );
    });
  });

  describe('trackSale', () => {
    beforeEach(async () => {
      // Simulate successful initialization
      (salesTracker as any).isInitialized = true;
    });

    it('should return null when not initialized', async () => {
      (salesTracker as any).isInitialized = false;

      const result = await salesTracker.trackSale('event-123', {});

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Sales tracker not initialized - skipping tracking'
      );
    });

    it('should calculate velocity and return result', async () => {
      mockQuery
        .mockResolvedValueOnce(mockVelocityQueryResult)
        .mockResolvedValueOnce(mockRecentSalesResult);

      const result = await salesTracker.trackSale('event-123', { quantity: 2 });

      expect(result).toMatchObject({
        velocity: expect.objectContaining({
          eventId: 'event-123',
          ticketsSold: 500,
          velocity: 5,
          remainingTickets: 500,
        }),
      });
    });

    it('should send metric to Kafka', async () => {
      mockQuery
        .mockResolvedValueOnce(mockVelocityQueryResult)
        .mockResolvedValueOnce(mockRecentSalesResult);

      await salesTracker.trackSale('event-123', {});

      expect(kafkaProducer.sendMetric).toHaveBeenCalledWith({
        metric_name: 'event.sales.velocity',
        value: 5,
        tags: expect.objectContaining({
          event_id: 'event-123',
        }),
      });
    });

    it('should write to InfluxDB', async () => {
      mockQuery
        .mockResolvedValueOnce(mockVelocityQueryResult)
        .mockResolvedValueOnce(mockRecentSalesResult);

      await salesTracker.trackSale('event-123', {});

      expect(Point).toHaveBeenCalledWith('event_sales');
      expect(mockWritePoint).toHaveBeenCalled();
    });

    it('should emit high-velocity event when velocity > 10', async () => {
      const highVelocityResult = {
        rows: [{
          ...mockVelocityQueryResult.rows[0],
          last_minute: 15, // High velocity
        }],
      };

      mockQuery
        .mockResolvedValueOnce(highVelocityResult)
        .mockResolvedValueOnce(mockRecentSalesResult);

      const highVelocityHandler = jest.fn();
      salesTracker.on('high-velocity', highVelocityHandler);

      await salesTracker.trackSale('event-123', {});

      expect(highVelocityHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'event-123',
          velocity: 15,
        })
      );
    });

    it('should send alert for high velocity', async () => {
      const highVelocityResult = {
        rows: [{
          ...mockVelocityQueryResult.rows[0],
          last_minute: 15,
        }],
      };

      mockQuery
        .mockResolvedValueOnce(highVelocityResult)
        .mockResolvedValueOnce(mockRecentSalesResult);

      await salesTracker.trackSale('event-123', {});

      expect(kafkaProducer.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('High Sales Velocity'),
          severity: 'warning',
        })
      );
    });

    it('should emit sellout-imminent when < 1 hour to sellout', async () => {
      // Mock prediction to return 30 minutes
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([30]),
        dispose: jest.fn(),
      });

      mockQuery
        .mockResolvedValueOnce(mockVelocityQueryResult)
        .mockResolvedValueOnce(mockRecentSalesResult);

      const selloutHandler = jest.fn();
      salesTracker.on('sellout-imminent', selloutHandler);

      await salesTracker.trackSale('event-123', {});

      expect(selloutHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'event-123',
          remainingTickets: 500,
        })
      );
    });

    it('should send critical alert for imminent sellout', async () => {
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([30]),
        dispose: jest.fn(),
      });

      mockQuery
        .mockResolvedValueOnce(mockVelocityQueryResult)
        .mockResolvedValueOnce(mockRecentSalesResult);

      await salesTracker.trackSale('event-123', {});

      expect(kafkaProducer.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Sellout Imminent'),
          severity: 'critical',
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await salesTracker.trackSale('event-123', {});

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error tracking sale:', expect.any(Error));
    });
  });

  describe('calculateVelocity', () => {
    beforeEach(() => {
      (salesTracker as any).isInitialized = true;
    });

    it('should calculate velocity correctly', async () => {
      mockQuery.mockResolvedValueOnce(mockVelocityQueryResult);

      const velocity = await (salesTracker as any).calculateVelocity('event-123');

      expect(velocity).toMatchObject({
        eventId: 'event-123',
        ticketsSold: 500,
        velocity: 5, // last_minute
        accelerationRate: expect.any(Number),
        currentCapacity: 1000,
        remainingTickets: 500,
      });
    });

    it('should calculate acceleration rate', async () => {
      mockQuery.mockResolvedValueOnce(mockVelocityQueryResult);

      const velocity = await (salesTracker as any).calculateVelocity('event-123');

      // acceleration = velocity - velocity10Min
      // velocity = 5, velocity10Min = 35/10 = 3.5
      // acceleration = 5 - 3.5 = 1.5
      expect(velocity.accelerationRate).toBeCloseTo(1.5, 1);
    });

    it('should handle zero values', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_sold: 0,
          last_minute: 0,
          last_5_minutes: 0,
          last_10_minutes: 0,
          total_tickets: 1000,
          remaining_tickets: 1000,
        }],
      });

      const velocity = await (salesTracker as any).calculateVelocity('event-123');

      expect(velocity.velocity).toBe(0);
      expect(velocity.ticketsSold).toBe(0);
      expect(velocity.accelerationRate).toBe(0);
    });
  });

  describe('predictSellout', () => {
    beforeEach(() => {
      (salesTracker as any).isInitialized = true;
      (salesTracker as any).salesModel = mockModel;
    });

    it('should return null when no remaining tickets', async () => {
      const velocity = {
        eventId: 'event-123',
        remainingTickets: 0,
        velocity: 5,
        ticketsSold: 1000,
        currentCapacity: 1000,
      };

      const prediction = await (salesTracker as any).predictSellout('event-123', velocity);

      expect(prediction).toBeNull();
    });

    it('should use linear prediction with insufficient data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ minute: new Date(), tickets_sold: 5 }] });

      const velocity = {
        eventId: 'event-123',
        remainingTickets: 100,
        velocity: 10,
        ticketsSold: 900,
        currentCapacity: 1000,
      };

      const prediction = await (salesTracker as any).predictSellout('event-123', velocity);

      // 100 remaining / 10 per minute = 10 minutes
      expect(prediction).toBeInstanceOf(Date);
      expect(prediction.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return null when velocity is zero', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const velocity = {
        eventId: 'event-123',
        remainingTickets: 100,
        velocity: 0,
        ticketsSold: 900,
        currentCapacity: 1000,
      };

      const prediction = await (salesTracker as any).predictSellout('event-123', velocity);

      expect(prediction).toBeNull();
    });

    it('should use ML model with sufficient data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { minute: new Date(), tickets_sold: 5, avg_price: 50 },
          { minute: new Date(), tickets_sold: 6, avg_price: 50 },
          { minute: new Date(), tickets_sold: 4, avg_price: 50 },
          { minute: new Date(), tickets_sold: 7, avg_price: 50 },
          { minute: new Date(), tickets_sold: 5, avg_price: 50 },
        ],
      });

      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([60]),
        dispose: jest.fn(),
      });

      const velocity = {
        eventId: 'event-123',
        remainingTickets: 100,
        velocity: 5,
        ticketsSold: 900,
        currentCapacity: 1000,
      };

      const prediction = await (salesTracker as any).predictSellout('event-123', velocity);

      expect(prediction).toBeInstanceOf(Date);
    });

    it('should handle prediction errors', async () => {
      mockQuery.mockResolvedValueOnce(mockRecentSalesResult);
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockRejectedValue(new Error('Model error')),
        dispose: jest.fn(),
      });

      const velocity = {
        eventId: 'event-123',
        remainingTickets: 100,
        velocity: 5,
        ticketsSold: 900,
        currentCapacity: 1000,
      };

      const prediction = await (salesTracker as any).predictSellout('event-123', velocity);

      expect(prediction).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error predicting sellout:', expect.any(Error));
    });
  });

  describe('getEventMetrics', () => {
    it('should return error when not initialized', async () => {
      (salesTracker as any).isInitialized = false;

      const metrics = await salesTracker.getEventMetrics('event-123');

      expect(metrics).toEqual({ error: 'Sales tracker not initialized' });
    });

    it('should return complete metrics when initialized', async () => {
      (salesTracker as any).isInitialized = true;

      mockQuery
        .mockResolvedValueOnce(mockVelocityQueryResult)
        .mockResolvedValueOnce(mockRecentSalesResult);

      const metrics = await salesTracker.getEventMetrics('event-123');

      expect(metrics).toMatchObject({
        current: expect.objectContaining({
          eventId: 'event-123',
        }),
        history: expect.any(Array),
        trend: expect.any(String),
      });
    });
  });

  describe('calculateTrend', () => {
    it('should return unknown for insufficient data', () => {
      const trend = (salesTracker as any).calculateTrend([]);
      expect(trend).toBe('unknown');

      const trend2 = (salesTracker as any).calculateTrend([{ accelerationRate: 1 }]);
      expect(trend2).toBe('unknown');
    });

    it('should return accelerating for positive acceleration', () => {
      const history = [
        { accelerationRate: 1 },
        { accelerationRate: 1.5 },
        { accelerationRate: 2 },
      ];

      const trend = (salesTracker as any).calculateTrend(history);

      expect(trend).toBe('accelerating');
    });

    it('should return decelerating for negative acceleration', () => {
      const history = [
        { accelerationRate: -1 },
        { accelerationRate: -1.5 },
        { accelerationRate: -2 },
      ];

      const trend = (salesTracker as any).calculateTrend(history);

      expect(trend).toBe('decelerating');
    });

    it('should return steady for near-zero acceleration', () => {
      const history = [
        { accelerationRate: 0.1 },
        { accelerationRate: -0.1 },
        { accelerationRate: 0.2 },
      ];

      const trend = (salesTracker as any).calculateTrend(history);

      expect(trend).toBe('steady');
    });
  });

  describe('groupByEvent', () => {
    it('should group rows by event_id', () => {
      const rows = [
        { event_id: 'e1', value: 1 },
        { event_id: 'e1', value: 2 },
        { event_id: 'e2', value: 3 },
      ];

      const grouped = (salesTracker as any).groupByEvent(rows);

      expect(grouped).toEqual({
        e1: [{ event_id: 'e1', value: 1 }, { event_id: 'e1', value: 2 }],
        e2: [{ event_id: 'e2', value: 3 }],
      });
    });
  });

  describe('createSequences', () => {
    it('should create sequences for LSTM training', () => {
      const sales = Array.from({ length: 15 }, (_, i) => ({
        tickets_sold: i + 1,
        avg_price: 50,
        minute: new Date(`2024-01-15T10:${i.toString().padStart(2, '0')}:00Z`),
      }));

      const { features, labels } = (salesTracker as any).createSequences(sales);

      expect(features.length).toBe(5); // 15 - 10 = 5 sequences
      expect(features[0].length).toBe(10); // Sequence length
      expect(features[0][0].length).toBe(5); // 5 features
      expect(labels.length).toBe(5);
    });

    it('should return empty arrays for insufficient data', () => {
      const sales = [{ tickets_sold: 1, avg_price: 50, minute: new Date() }];

      const { features, labels } = (salesTracker as any).createSequences(sales);

      expect(features).toEqual([]);
      expect(labels).toEqual([]);
    });
  });
});
