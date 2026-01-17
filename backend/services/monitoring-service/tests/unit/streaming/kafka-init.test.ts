// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockProducerConnect = jest.fn();
const mockProducerDisconnect = jest.fn();
const mockConsumerSubscribe = jest.fn();
const mockConsumerDisconnect = jest.fn();

jest.mock('../../../src/streaming/kafka-producer', () => ({
  kafkaProducer: {
    connect: mockProducerConnect,
    disconnect: mockProducerDisconnect,
  },
}));

jest.mock('../../../src/streaming/kafka-consumer', () => ({
  kafkaConsumer: {
    subscribeToMetrics: mockConsumerSubscribe,
    disconnect: mockConsumerDisconnect,
  },
}));

import { initializeKafka, shutdownKafka } from '../../../src/streaming/kafka-init';
import { logger } from '../../../src/utils/logger';

describe('Kafka Init', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProducerConnect.mockResolvedValue(undefined);
    mockProducerDisconnect.mockResolvedValue(undefined);
    mockConsumerSubscribe.mockResolvedValue(undefined);
    mockConsumerDisconnect.mockResolvedValue(undefined);
  });

  describe('initializeKafka', () => {
    it('should log initializing message', async () => {
      await initializeKafka();

      expect(logger.info).toHaveBeenCalledWith('Initializing Kafka connections...');
    });

    it('should connect producer', async () => {
      await initializeKafka();

      expect(mockProducerConnect).toHaveBeenCalled();
    });

    it('should subscribe consumer to metrics', async () => {
      await initializeKafka();

      expect(mockConsumerSubscribe).toHaveBeenCalled();
    });

    it('should connect producer before subscribing consumer', async () => {
      const callOrder: string[] = [];
      mockProducerConnect.mockImplementation(() => {
        callOrder.push('producer');
        return Promise.resolve();
      });
      mockConsumerSubscribe.mockImplementation(() => {
        callOrder.push('consumer');
        return Promise.resolve();
      });

      await initializeKafka();

      expect(callOrder).toEqual(['producer', 'consumer']);
    });

    it('should log success message on completion', async () => {
      await initializeKafka();

      expect(logger.info).toHaveBeenCalledWith('✅ Kafka streaming pipeline initialized');
    });

    it('should log error if producer connect fails', async () => {
      const error = new Error('Producer connection failed');
      mockProducerConnect.mockRejectedValueOnce(error);

      await initializeKafka();

      expect(logger.error).toHaveBeenCalledWith('Failed to initialize Kafka:', error);
    });

    it('should log error if consumer subscribe fails', async () => {
      const error = new Error('Consumer subscribe failed');
      mockConsumerSubscribe.mockRejectedValueOnce(error);

      await initializeKafka();

      expect(logger.error).toHaveBeenCalledWith('Failed to initialize Kafka:', error);
    });

    it('should not throw error when Kafka initialization fails', async () => {
      mockProducerConnect.mockRejectedValueOnce(new Error('Connection failed'));

      // Should not throw, service should continue
      await expect(initializeKafka()).resolves.not.toThrow();
    });

    it('should not log success if initialization fails', async () => {
      mockProducerConnect.mockRejectedValueOnce(new Error('Failed'));

      await initializeKafka();

      expect(logger.info).not.toHaveBeenCalledWith('✅ Kafka streaming pipeline initialized');
    });
  });

  describe('shutdownKafka', () => {
    it('should disconnect producer', async () => {
      await shutdownKafka();

      expect(mockProducerDisconnect).toHaveBeenCalled();
    });

    it('should disconnect consumer', async () => {
      await shutdownKafka();

      expect(mockConsumerDisconnect).toHaveBeenCalled();
    });

    it('should log success message', async () => {
      await shutdownKafka();

      expect(logger.info).toHaveBeenCalledWith('Kafka connections closed');
    });

    it('should log error if producer disconnect fails', async () => {
      const error = new Error('Producer disconnect failed');
      mockProducerDisconnect.mockRejectedValueOnce(error);

      await shutdownKafka();

      expect(logger.error).toHaveBeenCalledWith('Error shutting down Kafka:', error);
    });

    it('should log error if consumer disconnect fails', async () => {
      const error = new Error('Consumer disconnect failed');
      mockConsumerDisconnect.mockRejectedValueOnce(error);

      await shutdownKafka();

      expect(logger.error).toHaveBeenCalledWith('Error shutting down Kafka:', error);
    });

    it('should not throw error when shutdown fails', async () => {
      mockProducerDisconnect.mockRejectedValueOnce(new Error('Disconnect failed'));

      await expect(shutdownKafka()).resolves.not.toThrow();
    });

    it('should not log success if shutdown fails', async () => {
      mockProducerDisconnect.mockRejectedValueOnce(new Error('Failed'));

      await shutdownKafka();

      expect(logger.info).not.toHaveBeenCalledWith('Kafka connections closed');
    });
  });
});
