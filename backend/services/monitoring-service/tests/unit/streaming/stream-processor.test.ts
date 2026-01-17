// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockSendAlert = jest.fn();

jest.mock('../../../src/streaming/kafka-producer', () => ({
  kafkaProducer: {
    sendAlert: mockSendAlert,
  },
}));

import { StreamProcessor } from '../../../src/streaming/stream-processor';
import { logger } from '../../../src/utils/logger';

describe('StreamProcessor', () => {
  let processor: StreamProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: false });
    mockSendAlert.mockResolvedValue(undefined);
    processor = new StreamProcessor();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with empty windows map', () => {
      expect((processor as any).windows.size).toBe(0);
    });

    it('should set window size to 60 seconds', () => {
      expect((processor as any).windowSizeMs).toBe(60000);
    });
  });

  describe('processEventStream', () => {
    it('should create a new window if none exists', async () => {
      await processor.processEventStream([{ metric_name: 'test', value: 1 }]);

      expect((processor as any).windows.size).toBe(1);
    });

    it('should add events to the current window', async () => {
      const events = [
        { metric_name: 'cpu', value: 80 },
        { metric_name: 'memory', value: 70 },
      ];

      await processor.processEventStream(events);

      const window = (processor as any).windows.values().next().value;
      expect(window.events.length).toBe(2);
    });

    it('should update aggregates for each event', async () => {
      const events = [
        { metric_name: 'requests', value: 10 },
        { metric_name: 'requests', value: 20 },
        { metric_name: 'errors', value: 5 },
      ];

      await processor.processEventStream(events);

      const window = (processor as any).windows.values().next().value;
      expect(window.aggregates.get('requests')).toBe(30);
      expect(window.aggregates.get('errors')).toBe(5);
    });

    it('should default value to 1 if not provided', async () => {
      await processor.processEventStream([{ type: 'click' }]);

      const window = (processor as any).windows.values().next().value;
      expect(window.aggregates.get('click')).toBe(1);
    });

    it('should use type as key if metric_name not provided', async () => {
      await processor.processEventStream([{ type: 'page_view', value: 5 }]);

      const window = (processor as any).windows.values().next().value;
      expect(window.aggregates.get('page_view')).toBe(5);
    });

    it('should add events to existing window within same minute', async () => {
      await processor.processEventStream([{ metric_name: 'test1', value: 1 }]);
      await processor.processEventStream([{ metric_name: 'test2', value: 2 }]);

      const window = (processor as any).windows.values().next().value;
      expect(window.events.length).toBe(2);
    });

    it('should create new window when minute changes', async () => {
      await processor.processEventStream([{ metric_name: 'test1', value: 1 }]);

      // Advance time by more than 1 minute
      jest.advanceTimersByTime(61000);

      await processor.processEventStream([{ metric_name: 'test2', value: 2 }]);

      expect((processor as any).windows.size).toBe(2);
    });
  });

  describe('pattern detection', () => {
    it('should warn on high frequency patterns (>100 events)', async () => {
      const events = Array(101).fill({ metric_name: 'high_freq', value: 1 });

      await processor.processEventStream(events);

      expect(logger.warn).toHaveBeenCalledWith(
        'High frequency pattern detected: high_freq = 101 events/min'
      );
    });

    it('should send alert for high frequency patterns', async () => {
      const events = Array(150).fill({ metric_name: 'requests', value: 1 });

      await processor.processEventStream(events);

      expect(mockSendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'High Frequency Pattern: requests',
          severity: 'warning',
          pattern: 'requests',
          count: 150,
        })
      );
    });

    it('should not alert for normal frequency patterns', async () => {
      const events = Array(50).fill({ metric_name: 'normal', value: 1 });

      await processor.processEventStream(events);

      expect(logger.warn).not.toHaveBeenCalled();
      expect(mockSendAlert).not.toHaveBeenCalled();
    });

    it('should detect fraud spike (>5 fraud events)', async () => {
      const events = Array(6).fill({ type: 'fraud', value: 1 });

      await processor.processEventStream(events);

      expect(logger.error).toHaveBeenCalledWith(
        '🚨 FRAUD SPIKE: 6 fraud events in 1 minute!'
      );
    });

    it('should send critical alert for fraud spike', async () => {
      const events = Array(10).fill({ type: 'fraud', value: 1 });

      await processor.processEventStream(events);

      expect(mockSendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Fraud Spike Detected',
          severity: 'critical',
          count: 10,
        })
      );
    });

    it('should not alert for 5 or fewer fraud events', async () => {
      const events = Array(5).fill({ type: 'fraud', value: 1 });

      await processor.processEventStream(events);

      expect(logger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('FRAUD SPIKE')
      );
    });
  });

  describe('window cleanup', () => {
    it('should remove windows older than 5 minutes', async () => {
      // Create a window
      await processor.processEventStream([{ metric_name: 'old', value: 1 }]);

      expect((processor as any).windows.size).toBe(1);

      // Advance time by 6 minutes
      jest.advanceTimersByTime(6 * 60 * 1000);

      // Process new event to trigger cleanup
      await processor.processEventStream([{ metric_name: 'new', value: 1 }]);

      // Old window should be cleaned up
      expect((processor as any).windows.size).toBe(1);
    });

    it('should keep windows within 5 minute threshold', async () => {
      // Create windows at different times
      await processor.processEventStream([{ metric_name: 'w1', value: 1 }]);

      jest.advanceTimersByTime(60000); // 1 minute
      await processor.processEventStream([{ metric_name: 'w2', value: 1 }]);

      jest.advanceTimersByTime(60000); // 2 minutes
      await processor.processEventStream([{ metric_name: 'w3', value: 1 }]);

      // All windows should still exist (within 5 min)
      expect((processor as any).windows.size).toBe(3);
    });
  });

  describe('getWindowStats', () => {
    it('should return stats with zero values when no windows', () => {
      const stats = processor.getWindowStats();

      expect(stats).toEqual({
        activeWindows: 0,
        totalEvents: 0,
        topPatterns: [],
      });
    });

    it('should return correct active window count', async () => {
      await processor.processEventStream([{ metric_name: 'test', value: 1 }]);

      const stats = processor.getWindowStats();

      expect(stats.activeWindows).toBe(1);
    });

    it('should return correct total event count', async () => {
      await processor.processEventStream([
        { metric_name: 'a', value: 1 },
        { metric_name: 'b', value: 1 },
        { metric_name: 'c', value: 1 },
      ]);

      const stats = processor.getWindowStats();

      expect(stats.totalEvents).toBe(3);
    });

    it('should aggregate events across multiple windows', async () => {
      await processor.processEventStream([{ metric_name: 'test', value: 1 }]);

      jest.advanceTimersByTime(61000);
      await processor.processEventStream([
        { metric_name: 'test', value: 1 },
        { metric_name: 'test', value: 1 },
      ]);

      const stats = processor.getWindowStats();

      expect(stats.totalEvents).toBe(3);
      expect(stats.activeWindows).toBe(2);
    });

    it('should return top 5 patterns sorted by count', async () => {
      await processor.processEventStream([
        ...Array(100).fill({ metric_name: 'pattern_a', value: 1 }),
        ...Array(80).fill({ metric_name: 'pattern_b', value: 1 }),
        ...Array(60).fill({ metric_name: 'pattern_c', value: 1 }),
        ...Array(40).fill({ metric_name: 'pattern_d', value: 1 }),
        ...Array(20).fill({ metric_name: 'pattern_e', value: 1 }),
        ...Array(10).fill({ metric_name: 'pattern_f', value: 1 }),
      ]);

      const stats = processor.getWindowStats();

      expect(stats.topPatterns.length).toBe(5);
      expect(stats.topPatterns[0]).toEqual({ pattern: 'pattern_a', count: 100 });
      expect(stats.topPatterns[1]).toEqual({ pattern: 'pattern_b', count: 80 });
      expect(stats.topPatterns[4]).toEqual({ pattern: 'pattern_e', count: 20 });
    });

    it('should aggregate patterns across windows', async () => {
      await processor.processEventStream([
        ...Array(50).fill({ metric_name: 'requests', value: 1 }),
      ]);

      jest.advanceTimersByTime(61000);

      await processor.processEventStream([
        ...Array(30).fill({ metric_name: 'requests', value: 1 }),
      ]);

      const stats = processor.getWindowStats();

      const requestsPattern = stats.topPatterns.find((p: any) => p.pattern === 'requests');
      expect(requestsPattern.count).toBe(80);
    });

    it('should return fewer than 5 patterns if not enough exist', async () => {
      await processor.processEventStream([
        { metric_name: 'only_one', value: 1 },
        { metric_name: 'only_two', value: 1 },
      ]);

      const stats = processor.getWindowStats();

      expect(stats.topPatterns.length).toBe(2);
    });
  });

  describe('exported instance', () => {
    it('should export a streamProcessor instance', () => {
      const { streamProcessor } = require('../../../src/streaming/stream-processor');
      expect(streamProcessor).toBeInstanceOf(StreamProcessor);
    });
  });
});
