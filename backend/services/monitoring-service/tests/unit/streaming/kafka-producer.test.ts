// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

const mockProducer = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  send: jest.fn(),
  sendBatch: jest.fn(),
};

const mockKafka = {
  producer: jest.fn(() => mockProducer),
};

jest.mock('kafkajs', () => ({
  Kafka: jest.fn(() => mockKafka),
}));

import { logger } from '../../../src/utils/logger';
import { Kafka } from 'kafkajs';

describe('KafkaProducerService', () => {
  let KafkaProducerService: any;
  let kafkaProducer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProducer.connect.mockResolvedValue(undefined);
    mockProducer.disconnect.mockResolvedValue(undefined);
    mockProducer.send.mockResolvedValue(undefined);
    mockProducer.sendBatch.mockResolvedValue(undefined);

    // Re-import to get fresh instance
    jest.isolateModules(() => {
      const module = require('../../../src/streaming/kafka-producer');
      kafkaProducer = module.kafkaProducer;
    });
  });

  describe('constructor', () => {
    it('should create Kafka instance with correct config', () => {
      expect(Kafka).toHaveBeenCalledWith({
        clientId: 'monitoring-service',
        brokers: ['kafka:9092'],
        retry: {
          retries: 5,
          initialRetryTime: 100,
        },
      });
    });

    it('should create producer with correct config', () => {
      expect(mockKafka.producer).toHaveBeenCalledWith({
        allowAutoTopicCreation: true,
        transactionTimeout: 30000,
      });
    });
  });

  describe('connect', () => {
    it('should connect producer successfully', async () => {
      await kafkaProducer.connect();

      expect(mockProducer.connect).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Kafka producer connected');
    });

    it('should log error if connection fails', async () => {
      const error = new Error('Connection failed');
      mockProducer.connect.mockRejectedValueOnce(error);

      await kafkaProducer.connect();

      expect(logger.error).toHaveBeenCalledWith('Failed to connect Kafka producer:', error);
    });
  });

  describe('disconnect', () => {
    it('should disconnect producer', async () => {
      await kafkaProducer.disconnect();

      expect(mockProducer.disconnect).toHaveBeenCalled();
    });
  });

  describe('sendMetric', () => {
    it('should connect if not connected', async () => {
      await kafkaProducer.sendMetric({ metric_name: 'cpu_usage', value: 85 });

      expect(mockProducer.connect).toHaveBeenCalled();
    });

    it('should send metric to metrics-stream topic', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      await kafkaProducer.sendMetric({ metric_name: 'cpu_usage', value: 85 });

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'metrics-stream',
        messages: [
          expect.objectContaining({
            key: 'mock-uuid-1234',
            value: expect.stringContaining('cpu_usage'),
            headers: {
              'correlation-id': 'mock-uuid-1234',
              'event-type': 'metric',
            },
          }),
        ],
      });
    });

    it('should include timestamp and source in message', async () => {
      await kafkaProducer.connect();

      await kafkaProducer.sendMetric({ metric_name: 'memory', value: 70 });

      const sendCall = mockProducer.send.mock.calls[0][0];
      const messageValue = JSON.parse(sendCall.messages[0].value);

      expect(messageValue).toHaveProperty('timestamp');
      expect(messageValue.source).toBe('monitoring-service');
    });

    it('should log error if send fails', async () => {
      const error = new Error('Send failed');
      mockProducer.send.mockRejectedValueOnce(error);

      await kafkaProducer.connect();
      await kafkaProducer.sendMetric({ metric_name: 'test' });

      expect(logger.error).toHaveBeenCalledWith('Failed to send metric to Kafka:', error);
    });
  });

  describe('sendAlert', () => {
    it('should connect if not connected', async () => {
      await kafkaProducer.sendAlert({ title: 'Test Alert', severity: 'warning' });

      expect(mockProducer.connect).toHaveBeenCalled();
    });

    it('should send alert to alerts-stream topic', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      await kafkaProducer.sendAlert({ id: 'alert-1', title: 'CPU High', severity: 'critical' });

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'alerts-stream',
        messages: [
          expect.objectContaining({
            key: 'alert-1',
            headers: expect.objectContaining({
              'event-type': 'alert',
              'severity': 'critical',
            }),
          }),
        ],
        acks: -1,
      });
    });

    it('should use uuid if alert has no id', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      await kafkaProducer.sendAlert({ title: 'No ID Alert' });

      const sendCall = mockProducer.send.mock.calls[0][0];
      expect(sendCall.messages[0].key).toBe('mock-uuid-1234');
    });

    it('should default severity to info', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      await kafkaProducer.sendAlert({ title: 'Info Alert' });

      const sendCall = mockProducer.send.mock.calls[0][0];
      expect(sendCall.messages[0].headers.severity).toBe('info');
    });

    it('should log debug message on success', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      await kafkaProducer.sendAlert({ title: 'Test Alert' });

      expect(logger.debug).toHaveBeenCalledWith('Alert sent to Kafka: Test Alert');
    });

    it('should log error if send fails', async () => {
      const error = new Error('Send failed');
      mockProducer.send.mockRejectedValueOnce(error);

      await kafkaProducer.connect();
      await kafkaProducer.sendAlert({ title: 'Test' });

      expect(logger.error).toHaveBeenCalledWith('Failed to send alert to Kafka:', error);
    });
  });

  describe('sendFraudEvent', () => {
    it('should connect if not connected', async () => {
      await kafkaProducer.sendFraudEvent({ userId: 'user-1', pattern: 'velocity' });

      expect(mockProducer.connect).toHaveBeenCalled();
    });

    it('should send fraud event to fraud-events topic', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      await kafkaProducer.sendFraudEvent({
        userId: 'user-123',
        pattern: 'velocity-abuse',
        riskLevel: 'high',
      });

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'fraud-events',
        messages: [
          expect.objectContaining({
            key: 'user-123',
            headers: expect.objectContaining({
              'event-type': 'fraud-detection',
              'risk-level': 'high',
            }),
          }),
        ],
        acks: -1,
      });
    });

    it('should use uuid if no userId', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      await kafkaProducer.sendFraudEvent({ pattern: 'suspicious' });

      const sendCall = mockProducer.send.mock.calls[0][0];
      expect(sendCall.messages[0].key).toBe('mock-uuid-1234');
    });

    it('should default risk level to medium', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      await kafkaProducer.sendFraudEvent({ pattern: 'test' });

      const sendCall = mockProducer.send.mock.calls[0][0];
      expect(sendCall.messages[0].headers['risk-level']).toBe('medium');
    });

    it('should include fraud-detection source', async () => {
      await kafkaProducer.connect();

      await kafkaProducer.sendFraudEvent({ pattern: 'test' });

      const sendCall = mockProducer.send.mock.calls[0][0];
      const messageValue = JSON.parse(sendCall.messages[0].value);
      expect(messageValue.source).toBe('fraud-detection');
    });

    it('should log info message on success', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      await kafkaProducer.sendFraudEvent({ pattern: 'velocity' });

      expect(logger.info).toHaveBeenCalledWith('🚨 Fraud event sent to Kafka: velocity');
    });

    it('should log error if send fails', async () => {
      const error = new Error('Send failed');
      mockProducer.send.mockRejectedValueOnce(error);

      await kafkaProducer.connect();
      await kafkaProducer.sendFraudEvent({ pattern: 'test' });

      expect(logger.error).toHaveBeenCalledWith('Failed to send fraud event to Kafka:', error);
    });
  });

  describe('sendBatch', () => {
    it('should connect if not connected', async () => {
      await kafkaProducer.sendBatch('test-topic', [{ data: 'test' }]);

      expect(mockProducer.connect).toHaveBeenCalled();
    });

    it('should send batch to specified topic', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      const messages = [
        { key: 'msg-1', data: 'test1' },
        { key: 'msg-2', data: 'test2' },
      ];

      await kafkaProducer.sendBatch('batch-topic', messages);

      expect(mockProducer.sendBatch).toHaveBeenCalledWith({
        topicMessages: [
          {
            topic: 'batch-topic',
            messages: expect.arrayContaining([
              expect.objectContaining({
                key: 'msg-1',
                headers: expect.objectContaining({
                  'batch-id': 'mock-uuid-1234',
                  'batch-size': '2',
                }),
              }),
            ]),
          },
        ],
      });
    });

    it('should use uuid for messages without key', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      await kafkaProducer.sendBatch('test-topic', [{ data: 'no-key' }]);

      const batchCall = mockProducer.sendBatch.mock.calls[0][0];
      expect(batchCall.topicMessages[0].messages[0].key).toBe('mock-uuid-1234');
    });

    it('should log debug message on success', async () => {
      await kafkaProducer.connect();
      jest.clearAllMocks();

      await kafkaProducer.sendBatch('test-topic', [{ a: 1 }, { b: 2 }, { c: 3 }]);

      expect(logger.debug).toHaveBeenCalledWith('Batch of 3 messages sent to test-topic');
    });

    it('should log error if sendBatch fails', async () => {
      const error = new Error('Batch send failed');
      mockProducer.sendBatch.mockRejectedValueOnce(error);

      await kafkaProducer.connect();
      await kafkaProducer.sendBatch('test-topic', [{ data: 'test' }]);

      expect(logger.error).toHaveBeenCalledWith('Failed to send batch to test-topic:', error);
    });
  });
});
