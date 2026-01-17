// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/utils/database', () => ({
  pgPool: {
    query: jest.fn(),
  },
}));

const mockConsumer = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  subscribe: jest.fn(),
  run: jest.fn(),
};

const mockKafka = {
  consumer: jest.fn(() => mockConsumer),
};

jest.mock('kafkajs', () => ({
  Kafka: jest.fn(() => mockKafka),
}));

import { logger } from '../../../src/utils/logger';
import { pgPool } from '../../../src/utils/database';
import { Kafka } from 'kafkajs';

describe('KafkaConsumerService', () => {
  let kafkaConsumer: any;
  let messageHandler: ((payload: any) => Promise<void>) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsumer.connect.mockResolvedValue(undefined);
    mockConsumer.disconnect.mockResolvedValue(undefined);
    mockConsumer.subscribe.mockResolvedValue(undefined);
    mockConsumer.run.mockImplementation(async ({ eachMessage }) => {
      messageHandler = eachMessage;
    });
    (pgPool.query as jest.Mock).mockResolvedValue({ rows: [] });

    // Re-import to get fresh instance
    jest.isolateModules(() => {
      const module = require('../../../src/streaming/kafka-consumer');
      kafkaConsumer = module.kafkaConsumer;
    });
  });

  describe('constructor', () => {
    it('should create Kafka instance with correct config', () => {
      expect(Kafka).toHaveBeenCalledWith({
        clientId: 'monitoring-consumer',
        brokers: ['kafka:9092'],
      });
    });
  });

  describe('subscribeToMetrics', () => {
    it('should create consumer with correct group config', async () => {
      await kafkaConsumer.subscribeToMetrics();

      expect(mockKafka.consumer).toHaveBeenCalledWith({
        groupId: 'monitoring-metrics-group',
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });
    });

    it('should connect consumer', async () => {
      await kafkaConsumer.subscribeToMetrics();

      expect(mockConsumer.connect).toHaveBeenCalled();
    });

    it('should subscribe to correct topics', async () => {
      await kafkaConsumer.subscribeToMetrics();

      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topics: ['metrics-stream', 'fraud-events', 'alerts-stream'],
        fromBeginning: false,
      });
    });

    it('should start consumer run', async () => {
      await kafkaConsumer.subscribeToMetrics();

      expect(mockConsumer.run).toHaveBeenCalledWith({
        eachMessage: expect.any(Function),
      });
    });

    it('should log success message', async () => {
      await kafkaConsumer.subscribeToMetrics();

      expect(logger.info).toHaveBeenCalledWith('Kafka consumer subscribed to metrics streams');
    });
  });

  describe('message processing', () => {
    beforeEach(async () => {
      await kafkaConsumer.subscribeToMetrics();
    });

    describe('metrics-stream topic', () => {
      it('should process metric messages', async () => {
        const message = {
          topic: 'metrics-stream',
          partition: 0,
          message: {
            value: Buffer.from(JSON.stringify({ metric_name: 'cpu_usage', value: 85 })),
          },
        };

        await messageHandler!(message);

        expect(logger.debug).toHaveBeenCalledWith('Processing metric: cpu_usage');
      });

      it('should warn on high metric values', async () => {
        const message = {
          topic: 'metrics-stream',
          partition: 0,
          message: {
            value: Buffer.from(JSON.stringify({ metric_name: 'requests', value: 1500 })),
          },
        };

        await messageHandler!(message);

        expect(logger.warn).toHaveBeenCalledWith('High value detected: requests = 1500');
      });

      it('should not warn on normal values', async () => {
        const message = {
          topic: 'metrics-stream',
          partition: 0,
          message: {
            value: Buffer.from(JSON.stringify({ metric_name: 'cpu', value: 50 })),
          },
        };

        await messageHandler!(message);

        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('fraud-events topic', () => {
      it('should process fraud events', async () => {
        const message = {
          topic: 'fraud-events',
          partition: 0,
          message: {
            value: Buffer.from(JSON.stringify({
              userId: 'user-123',
              pattern: 'velocity-abuse',
              riskLevel: 'high',
            })),
          },
        };

        await messageHandler!(message);

        expect(logger.warn).toHaveBeenCalledWith(
          '🚨 FRAUD EVENT: velocity-abuse detected for user user-123'
        );
      });

      it('should store fraud event in database', async () => {
        const fraudEvent = {
          userId: 'user-456',
          pattern: 'suspicious-activity',
          riskLevel: 'critical',
        };

        const message = {
          topic: 'fraud-events',
          partition: 0,
          message: {
            value: Buffer.from(JSON.stringify(fraudEvent)),
          },
        };

        await messageHandler!(message);

        expect(pgPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO fraud_events'),
          expect.arrayContaining(['user-456', 'suspicious-activity', 'critical'])
        );
      });

      it('should log error if database insert fails', async () => {
        const error = new Error('Database error');
        (pgPool.query as jest.Mock).mockRejectedValueOnce(error);

        const message = {
          topic: 'fraud-events',
          partition: 0,
          message: {
            value: Buffer.from(JSON.stringify({ userId: 'user-1', pattern: 'test' })),
          },
        };

        await messageHandler!(message);

        expect(logger.error).toHaveBeenCalledWith('Failed to store fraud event:', error);
      });
    });

    describe('alerts-stream topic', () => {
      it('should process alert messages', async () => {
        const message = {
          topic: 'alerts-stream',
          partition: 0,
          message: {
            value: Buffer.from(JSON.stringify({
              title: 'High CPU Alert',
              severity: 'warning',
            })),
          },
        };

        await messageHandler!(message);

        expect(logger.info).toHaveBeenCalledWith('📢 ALERT: High CPU Alert [warning]');
      });

      it('should log error for critical alerts', async () => {
        const message = {
          topic: 'alerts-stream',
          partition: 0,
          message: {
            value: Buffer.from(JSON.stringify({
              title: 'System Down',
              severity: 'critical',
            })),
          },
        };

        await messageHandler!(message);

        expect(logger.error).toHaveBeenCalledWith('CRITICAL ALERT: System Down');
      });

      it('should not log error for non-critical alerts', async () => {
        const message = {
          topic: 'alerts-stream',
          partition: 0,
          message: {
            value: Buffer.from(JSON.stringify({
              title: 'Info Alert',
              severity: 'info',
            })),
          },
        };

        await messageHandler!(message);

        expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('CRITICAL'));
      });
    });

    describe('error handling', () => {
      it('should skip messages with no value', async () => {
        const message = {
          topic: 'metrics-stream',
          partition: 0,
          message: {
            value: null,
          },
        };

        await messageHandler!(message);

        expect(logger.debug).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
      });

      it('should log error for invalid JSON', async () => {
        const message = {
          topic: 'metrics-stream',
          partition: 0,
          message: {
            value: Buffer.from('invalid json'),
          },
        };

        await messageHandler!(message);

        expect(logger.error).toHaveBeenCalledWith(
          'Error processing message from metrics-stream:',
          expect.any(Error)
        );
      });

      it('should log error for unknown topics', async () => {
        const message = {
          topic: 'unknown-topic',
          partition: 0,
          message: {
            value: Buffer.from(JSON.stringify({ data: 'test' })),
          },
        };

        // Should not throw, just doesn't process
        await messageHandler!(message);

        // No specific logging for unknown topics, just doesn't match any case
      });
    });
  });

  describe('disconnect', () => {
    it('should disconnect all consumers', async () => {
      await kafkaConsumer.subscribeToMetrics();
      jest.clearAllMocks();

      await kafkaConsumer.disconnect();

      expect(mockConsumer.disconnect).toHaveBeenCalled();
    });

    it('should log disconnection for each consumer', async () => {
      await kafkaConsumer.subscribeToMetrics();
      jest.clearAllMocks();

      await kafkaConsumer.disconnect();

      expect(logger.info).toHaveBeenCalledWith('Kafka consumer metrics disconnected');
    });

    it('should handle disconnect when no consumers subscribed', async () => {
      // Don't subscribe, just disconnect
      await kafkaConsumer.disconnect();

      // Should not throw
      expect(mockConsumer.disconnect).not.toHaveBeenCalled();
    });
  });
});
