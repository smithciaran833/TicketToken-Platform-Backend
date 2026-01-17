/**
 * Realtime Model Unit Tests
 */

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisExpire = jest.fn();
const mockRedisIncrby = jest.fn();

const mockRedisClient = {
  get: mockRedisGet,
  set: mockRedisSet,
  expire: mockRedisExpire,
  incrby: mockRedisIncrby,
};

const mockPubSubPublish = jest.fn();
const mockPubSubSubscribe = jest.fn();
const mockPubSubUnsubscribe = jest.fn();

const mockPubSubManager = {
  publish: mockPubSubPublish,
  subscribe: mockPubSubSubscribe,
  unsubscribe: mockPubSubUnsubscribe,
};

jest.mock('@tickettoken/shared', () => ({
  getRedisClient: () => Promise.resolve(mockRedisClient),
  getPubSubManager: () => mockPubSubManager,
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { RealtimeModel } from '../../../../src/models/redis/realtime.model';

describe('RealtimeModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisSet.mockResolvedValue('OK');
    mockRedisExpire.mockResolvedValue(1);
  });

  describe('updateRealTimeMetric', () => {
    it('should update metric and publish change', async () => {
      mockRedisGet.mockResolvedValueOnce('100'); // Previous value

      await RealtimeModel.updateRealTimeMetric('venue-1', 'active_users', 150);

      expect(mockRedisGet).toHaveBeenCalledWith('realtime:venue-1:active_users');
      expect(mockRedisSet).toHaveBeenCalledWith('realtime:venue-1:active_users', '150');
      expect(mockRedisExpire).toHaveBeenCalledWith('realtime:venue-1:active_users', 300);
      expect(mockPubSubPublish).toHaveBeenCalledWith(
        'metrics:venue-1:active_users',
        expect.objectContaining({
          currentValue: 150,
          previousValue: 100,
          change: 50,
          trend: 'up',
        })
      );
    });

    it('should handle no previous value', async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      await RealtimeModel.updateRealTimeMetric('venue-1', 'new_metric', 50);

      expect(mockPubSubPublish).toHaveBeenCalledWith(
        'metrics:venue-1:new_metric',
        expect.objectContaining({
          currentValue: 50,
          previousValue: 0,
          change: 50,
        })
      );
    });

    it('should calculate downward trend', async () => {
      mockRedisGet.mockResolvedValueOnce('200');

      await RealtimeModel.updateRealTimeMetric('venue-1', 'visitors', 150);

      expect(mockPubSubPublish).toHaveBeenCalledWith(
        'metrics:venue-1:visitors',
        expect.objectContaining({
          change: -50,
          trend: 'down',
        })
      );
    });

    it('should calculate stable trend', async () => {
      mockRedisGet.mockResolvedValueOnce('100');

      await RealtimeModel.updateRealTimeMetric('venue-1', 'metric', 100);

      expect(mockPubSubPublish).toHaveBeenCalledWith(
        'metrics:venue-1:metric',
        expect.objectContaining({
          change: 0,
          trend: 'stable',
        })
      );
    });
  });

  describe('getRealTimeMetric', () => {
    it('should return metric data', async () => {
      const metricData = { currentValue: 100, trend: 'up' };
      mockRedisGet
        .mockResolvedValueOnce('100') // value
        .mockResolvedValueOnce(JSON.stringify(metricData)); // data

      const result = await RealtimeModel.getRealTimeMetric('venue-1', 'sales');

      expect(result).toEqual(metricData);
      expect(mockRedisGet).toHaveBeenCalledWith('realtime:venue-1:sales');
      expect(mockRedisGet).toHaveBeenCalledWith('realtime:data:venue-1:sales');
    });

    it('should return null if no value', async () => {
      mockRedisGet.mockResolvedValue(null);

      const result = await RealtimeModel.getRealTimeMetric('venue-1', 'unknown');

      expect(result).toBeNull();
    });

    it('should return null if no data', async () => {
      mockRedisGet
        .mockResolvedValueOnce('100')
        .mockResolvedValueOnce(null);

      const result = await RealtimeModel.getRealTimeMetric('venue-1', 'partial');

      expect(result).toBeNull();
    });
  });

  describe('incrementCounter', () => {
    it('should increment counter and update realtime metric', async () => {
      mockRedisIncrby.mockResolvedValue(10);
      mockRedisGet.mockResolvedValue('9'); // Previous for updateRealTimeMetric

      const result = await RealtimeModel.incrementCounter('venue-1', 'page_views');

      expect(result).toBe(10);
      expect(mockRedisIncrby).toHaveBeenCalledWith('counter:venue-1:page_views', 1);
    });

    it('should increment by specified amount', async () => {
      mockRedisIncrby.mockResolvedValue(25);
      mockRedisGet.mockResolvedValue('20');

      const result = await RealtimeModel.incrementCounter('venue-1', 'clicks', 5);

      expect(result).toBe(25);
      expect(mockRedisIncrby).toHaveBeenCalledWith('counter:venue-1:clicks', 5);
    });
  });

  describe('getCounter', () => {
    it('should return counter value', async () => {
      mockRedisGet.mockResolvedValue('42');

      const result = await RealtimeModel.getCounter('venue-1', 'visits');

      expect(result).toBe(42);
      expect(mockRedisGet).toHaveBeenCalledWith('counter:venue-1:visits');
    });

    it('should return 0 if counter does not exist', async () => {
      mockRedisGet.mockResolvedValue(null);

      const result = await RealtimeModel.getCounter('venue-1', 'new_counter');

      expect(result).toBe(0);
    });
  });

  describe('resetCounter', () => {
    it('should reset counter to 0', async () => {
      await RealtimeModel.resetCounter('venue-1', 'daily_visits');

      expect(mockRedisSet).toHaveBeenCalledWith('counter:venue-1:daily_visits', '0');
    });
  });

  describe('publishMetricUpdate', () => {
    it('should store data and publish to channel', async () => {
      const data = { value: 100, timestamp: new Date() };

      await RealtimeModel.publishMetricUpdate('venue-1', 'sales', data);

      expect(mockRedisSet).toHaveBeenCalledWith(
        'realtime:data:venue-1:sales',
        JSON.stringify(data)
      );
      expect(mockRedisExpire).toHaveBeenCalledWith('realtime:data:venue-1:sales', 300);
      expect(mockPubSubPublish).toHaveBeenCalledWith('metrics:venue-1:sales', data);
    });
  });

  describe('subscribeToMetric', () => {
    it('should subscribe to metric channel', async () => {
      const callback = jest.fn();

      await RealtimeModel.subscribeToMetric('venue-1', 'revenue', callback);

      expect(mockPubSubSubscribe).toHaveBeenCalledWith(
        'metrics:venue-1:revenue',
        expect.any(Function)
      );
    });

    it('should call callback with message data', async () => {
      const callback = jest.fn();
      let subscribedCallback: (message: any) => void;

      mockPubSubSubscribe.mockImplementation((channel, cb) => {
        subscribedCallback = cb;
        return Promise.resolve();
      });

      await RealtimeModel.subscribeToMetric('venue-1', 'test', callback);

      // Simulate message
      subscribedCallback!({ value: 123 });

      expect(callback).toHaveBeenCalledWith({ value: 123 });
    });
  });

  describe('unsubscribeFromMetric', () => {
    it('should unsubscribe from metric channel', async () => {
      await RealtimeModel.unsubscribeFromMetric('venue-1', 'revenue');

      expect(mockPubSubUnsubscribe).toHaveBeenCalledWith('metrics:venue-1:revenue');
    });
  });

  describe('setGauge', () => {
    it('should set gauge value and publish update', async () => {
      await RealtimeModel.setGauge('venue-1', 'capacity', 75, 100);

      expect(mockRedisSet).toHaveBeenCalledWith(
        'gauge:venue-1:capacity',
        expect.stringContaining('"current":75')
      );
      expect(mockRedisExpire).toHaveBeenCalledWith('gauge:venue-1:capacity', 300);
      expect(mockPubSubPublish).toHaveBeenCalledWith(
        'metrics:venue-1:gauge:capacity',
        expect.objectContaining({
          current: 75,
          max: 100,
          percentage: 75,
        })
      );
    });
  });

  describe('getGauge', () => {
    it('should return gauge data', async () => {
      const gaugeData = { current: 50, max: 100, percentage: 50 };
      mockRedisGet.mockResolvedValue(JSON.stringify(gaugeData));

      const result = await RealtimeModel.getGauge('venue-1', 'capacity');

      expect(result).toEqual(gaugeData);
      expect(mockRedisGet).toHaveBeenCalledWith('gauge:venue-1:capacity');
    });

    it('should return null if gauge not found', async () => {
      mockRedisGet.mockResolvedValue(null);

      const result = await RealtimeModel.getGauge('venue-1', 'unknown');

      expect(result).toBeNull();
    });
  });
});
