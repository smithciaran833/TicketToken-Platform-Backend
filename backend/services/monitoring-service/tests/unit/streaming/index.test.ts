// Mock all dependencies before imports
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

jest.mock('kafkajs', () => ({
  Kafka: jest.fn(() => ({
    producer: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
      send: jest.fn(),
      sendBatch: jest.fn(),
    })),
    consumer: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
      subscribe: jest.fn(),
      run: jest.fn(),
    })),
  })),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

describe('Streaming Index Exports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should export kafkaProducer', () => {
    const { kafkaProducer } = require('../../../src/streaming');
    expect(kafkaProducer).toBeDefined();
    expect(typeof kafkaProducer.connect).toBe('function');
    expect(typeof kafkaProducer.disconnect).toBe('function');
    expect(typeof kafkaProducer.sendMetric).toBe('function');
    expect(typeof kafkaProducer.sendAlert).toBe('function');
    expect(typeof kafkaProducer.sendFraudEvent).toBe('function');
    expect(typeof kafkaProducer.sendBatch).toBe('function');
  });

  it('should export kafkaConsumer', () => {
    const { kafkaConsumer } = require('../../../src/streaming');
    expect(kafkaConsumer).toBeDefined();
    expect(typeof kafkaConsumer.subscribeToMetrics).toBe('function');
    expect(typeof kafkaConsumer.disconnect).toBe('function');
  });

  it('should export initializeKafka', () => {
    const { initializeKafka } = require('../../../src/streaming');
    expect(initializeKafka).toBeDefined();
    expect(typeof initializeKafka).toBe('function');
  });

  it('should export shutdownKafka', () => {
    const { shutdownKafka } = require('../../../src/streaming');
    expect(shutdownKafka).toBeDefined();
    expect(typeof shutdownKafka).toBe('function');
  });

  it('should export initializeKafkaStreaming as alias', () => {
    const { initializeKafka, initializeKafkaStreaming } = require('../../../src/streaming');
    expect(initializeKafkaStreaming).toBeDefined();
    expect(initializeKafkaStreaming).toBe(initializeKafka);
  });

  it('should have all expected exports', () => {
    const streaming = require('../../../src/streaming');
    const exportKeys = Object.keys(streaming);

    expect(exportKeys).toContain('kafkaProducer');
    expect(exportKeys).toContain('kafkaConsumer');
    expect(exportKeys).toContain('initializeKafka');
    expect(exportKeys).toContain('shutdownKafka');
    expect(exportKeys).toContain('initializeKafkaStreaming');
  });
});
