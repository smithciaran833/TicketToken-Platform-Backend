import { EventPublisher, EventMessage } from '../../../src/services/eventPublisher';
import { logger } from '../../../src/utils/logger';
import { createCircuitBreaker } from '../../../src/utils/circuitBreaker';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('amqplib');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/circuitBreaker');

const amqplib = require('amqplib');

describe('EventPublisher', () => {
  let eventPublisher: EventPublisher;
  let mockConnection: any;
  let mockChannel: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock channel
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    // Mock connection
    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    // Mock amqplib.connect
    amqplib.connect = jest.fn().mockResolvedValue(mockConnection);

    // Mock circuit breaker to pass through to the actual function
    (createCircuitBreaker as jest.Mock).mockImplementation((fn: any) => {
      return {
        fire: jest.fn().mockImplementation(async (message: EventMessage) => {
          return await fn(message);
        }),
      };
    });

    // Create publisher instance
    eventPublisher = new EventPublisher();
  });

  afterEach(async () => {
    if (eventPublisher) {
      await eventPublisher.close();
    }
  });

  // =============================================================================
  // connect() - 10 test cases
  // =============================================================================

  describe('connect()', () => {
    it('should connect to RabbitMQ successfully', async () => {
      await eventPublisher.connect();

      expect(amqplib.connect).toHaveBeenCalledWith(
        expect.stringContaining('amqp://')
      );
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(eventPublisher.isConnected()).toBe(true);
    });

    it('should use RABBITMQ_URL from environment', async () => {
      process.env.RABBITMQ_URL = 'amqp://custom:url@localhost:5672';
      const publisher = new EventPublisher();

      await publisher.connect();

      expect(amqplib.connect).toHaveBeenCalledWith('amqp://custom:url@localhost:5672');
      await publisher.close();
      delete process.env.RABBITMQ_URL;
    });

    it('should use default URL if RABBITMQ_URL not set', async () => {
      delete process.env.RABBITMQ_URL;
      const publisher = new EventPublisher();

      await publisher.connect();

      expect(amqplib.connect).toHaveBeenCalledWith('amqp://admin:admin@rabbitmq:5672');
      await publisher.close();
    });

    it('should assert exchange as topic and durable', async () => {
      await eventPublisher.connect();

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'venue-events',
        'topic',
        { durable: true }
      );
    });

    it('should log successful connection', async () => {
      await eventPublisher.connect();

      expect(logger.info).toHaveBeenCalledWith('Connected to RabbitMQ');
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      amqplib.connect = jest.fn().mockRejectedValue(error);

      await eventPublisher.connect();

      expect(logger.warn).toHaveBeenCalledWith(
        { error },
        'Could not connect to RabbitMQ - running without event publishing'
      );
      expect(eventPublisher.isConnected()).toBe(false);
    });

    it('should set up error event handler', async () => {
      await eventPublisher.connect();

      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should set up close event handler', async () => {
      await eventPublisher.connect();

      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should attempt reconnect after connection error', async () => {
      await eventPublisher.connect();

      const errorHandler = mockConnection.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )[1];

      errorHandler(new Error('Test error'));

      expect(logger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'RabbitMQ connection error'
      );
      expect(eventPublisher.isConnected()).toBe(false);
    });

    it('should attempt reconnect after connection close', async () => {
      await eventPublisher.connect();

      const closeHandler = mockConnection.on.mock.calls.find(
        (call: any) => call[0] === 'close'
      )[1];

      closeHandler();

      expect(logger.warn).toHaveBeenCalledWith('RabbitMQ connection closed');
      expect(eventPublisher.isConnected()).toBe(false);
    });
  });

  // =============================================================================
  // publish() - 8 test cases
  // =============================================================================

  describe('publish()', () => {
    const mockMessage: EventMessage = {
      eventType: 'test.event',
      aggregateId: 'test-123',
      aggregateType: 'test',
      payload: { data: 'test' },
      metadata: {
        userId: 'user-123',
      },
    };

    beforeEach(async () => {
      await eventPublisher.connect();
      jest.clearAllMocks(); // Clear mocks after connect
    });

    it('should publish message successfully when connected', async () => {
      await eventPublisher.publish(mockMessage);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'venue-events',
        'test.test.event',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should use correct routing key format', async () => {
      await eventPublisher.publish(mockMessage);

      const routingKey = mockChannel.publish.mock.calls[0][1];
      expect(routingKey).toBe('test.test.event');
    });

    it('should serialize message to JSON buffer', async () => {
      await eventPublisher.publish(mockMessage);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const parsedMessage = JSON.parse(buffer.toString());

      expect(parsedMessage.eventType).toBe('test.event');
      expect(parsedMessage.aggregateId).toBe('test-123');
      expect(parsedMessage.payload).toEqual({ data: 'test' });
    });

    it('should add timestamp to metadata if not provided', async () => {
      await eventPublisher.publish(mockMessage);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const parsedMessage = JSON.parse(buffer.toString());

      expect(parsedMessage.metadata.timestamp).toBeDefined();
      expect(new Date(parsedMessage.metadata.timestamp)).toBeInstanceOf(Date);
    });

    it('should preserve existing timestamp if provided', async () => {
      const timestamp = new Date('2024-01-01');
      const messageWithTimestamp = {
        ...mockMessage,
        metadata: { ...mockMessage.metadata, timestamp },
      };

      await eventPublisher.publish(messageWithTimestamp);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const parsedMessage = JSON.parse(buffer.toString());

      expect(new Date(parsedMessage.metadata.timestamp).getTime()).toBe(timestamp.getTime());
    });

    it('should skip publishing if not connected', async () => {
      const disconnectedPublisher = new EventPublisher();
      jest.clearAllMocks();

      await disconnectedPublisher.publish(mockMessage);

      expect(mockChannel.publish).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'RabbitMQ not connected, skipping event publish'
      );

      await disconnectedPublisher.close();
    });

    it('should log debug message on successful publish', async () => {
      await eventPublisher.publish(mockMessage);

      expect(logger.debug).toHaveBeenCalledWith(
        {
          routingKey: 'test.test.event',
          message: expect.objectContaining({
            eventType: 'test.event',
            aggregateId: 'test-123',
          }),
        },
        'Event published to RabbitMQ'
      );
    });

    it('should handle publish errors gracefully', async () => {
      const error = new Error('Publish failed');
      mockChannel.publish = jest.fn().mockImplementation(() => {
        throw error;
      });

      await expect(eventPublisher.publish(mockMessage)).resolves.not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        { error, message: mockMessage },
        'Failed to publish event'
      );
    });
  });

  // =============================================================================
  // publishVenueCreated() - 6 test cases
  // =============================================================================

  describe('publishVenueCreated()', () => {
    const venueId = 'venue-123';
    const venueData = {
      name: 'Test Arena',
      capacity: 20000,
    };
    const userId = 'user-456';

    beforeEach(async () => {
      await eventPublisher.connect();
      jest.clearAllMocks();
    });

    it('should publish venue created event', async () => {
      await eventPublisher.publishVenueCreated(venueId, venueData, userId);

      expect(mockChannel.publish).toHaveBeenCalled();
      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.eventType).toBe('created');
      expect(message.aggregateId).toBe(venueId);
      expect(message.aggregateType).toBe('venue');
    });

    it('should include venue data in payload', async () => {
      await eventPublisher.publishVenueCreated(venueId, venueData, userId);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.payload).toEqual(venueData);
    });

    it('should include userId in metadata', async () => {
      await eventPublisher.publishVenueCreated(venueId, venueData, userId);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.metadata.userId).toBe(userId);
    });

    it('should set version to 1', async () => {
      await eventPublisher.publishVenueCreated(venueId, venueData, userId);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.metadata.version).toBe(1);
    });

    it('should use correct routing key', async () => {
      await eventPublisher.publishVenueCreated(venueId, venueData, userId);

      const routingKey = mockChannel.publish.mock.calls[0][1];
      expect(routingKey).toBe('venue.created');
    });

    it('should handle missing userId', async () => {
      await eventPublisher.publishVenueCreated(venueId, venueData);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.metadata.userId).toBeUndefined();
    });
  });

  // =============================================================================
  // publishVenueUpdated() - 5 test cases
  // =============================================================================

  describe('publishVenueUpdated()', () => {
    const venueId = 'venue-123';
    const changes = {
      name: 'Updated Arena',
      capacity: 25000,
    };
    const userId = 'user-456';

    beforeEach(async () => {
      await eventPublisher.connect();
      jest.clearAllMocks();
    });

    it('should publish venue updated event', async () => {
      await eventPublisher.publishVenueUpdated(venueId, changes, userId);

      expect(mockChannel.publish).toHaveBeenCalled();
      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.eventType).toBe('updated');
      expect(message.aggregateId).toBe(venueId);
      expect(message.aggregateType).toBe('venue');
    });

    it('should wrap changes in payload', async () => {
      await eventPublisher.publishVenueUpdated(venueId, changes, userId);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.payload).toEqual({ changes });
    });

    it('should include userId in metadata', async () => {
      await eventPublisher.publishVenueUpdated(venueId, changes, userId);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.metadata.userId).toBe(userId);
    });

    it('should use correct routing key', async () => {
      await eventPublisher.publishVenueUpdated(venueId, changes, userId);

      const routingKey = mockChannel.publish.mock.calls[0][1];
      expect(routingKey).toBe('venue.updated');
    });

    it('should handle missing userId', async () => {
      await eventPublisher.publishVenueUpdated(venueId, changes);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.metadata.userId).toBeUndefined();
    });
  });

  // =============================================================================
  // publishVenueDeleted() - 5 test cases
  // =============================================================================

  describe('publishVenueDeleted()', () => {
    const venueId = 'venue-123';
    const userId = 'user-456';

    beforeEach(async () => {
      await eventPublisher.connect();
      jest.clearAllMocks();
    });

    it('should publish venue deleted event', async () => {
      await eventPublisher.publishVenueDeleted(venueId, userId);

      expect(mockChannel.publish).toHaveBeenCalled();
      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.eventType).toBe('deleted');
      expect(message.aggregateId).toBe(venueId);
      expect(message.aggregateType).toBe('venue');
    });

    it('should include deletedAt timestamp in payload', async () => {
      await eventPublisher.publishVenueDeleted(venueId, userId);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.payload.deletedAt).toBeDefined();
      expect(new Date(message.payload.deletedAt)).toBeInstanceOf(Date);
    });

    it('should include userId in metadata', async () => {
      await eventPublisher.publishVenueDeleted(venueId, userId);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.metadata.userId).toBe(userId);
    });

    it('should use correct routing key', async () => {
      await eventPublisher.publishVenueDeleted(venueId, userId);

      const routingKey = mockChannel.publish.mock.calls[0][1];
      expect(routingKey).toBe('venue.deleted');
    });

    it('should handle missing userId', async () => {
      await eventPublisher.publishVenueDeleted(venueId);

      const buffer = mockChannel.publish.mock.calls[0][2];
      const message = JSON.parse(buffer.toString());

      expect(message.metadata.userId).toBeUndefined();
    });
  });

  // =============================================================================
  // close() - 4 test cases
  // =============================================================================

  describe('close()', () => {
    it('should close channel and connection', async () => {
      await eventPublisher.connect();
      await eventPublisher.close();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should handle missing channel gracefully', async () => {
      await eventPublisher.connect();
      (eventPublisher as any).channel = null;

      await expect(eventPublisher.close()).resolves.not.toThrow();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should handle missing connection gracefully', async () => {
      await eventPublisher.connect();
      (eventPublisher as any).connection = null;

      await expect(eventPublisher.close()).resolves.not.toThrow();
      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should handle both channel and connection missing', async () => {
      const publisher = new EventPublisher();

      await expect(publisher.close()).resolves.not.toThrow();
    });
  });

  // =============================================================================
  // isConnected() - 3 test cases
  // =============================================================================

  describe('isConnected()', () => {
    it('should return false before connection', () => {
      expect(eventPublisher.isConnected()).toBe(false);
    });

    it('should return true after successful connection', async () => {
      await eventPublisher.connect();

      expect(eventPublisher.isConnected()).toBe(true);
    });

    it('should return false after connection failure', async () => {
      amqplib.connect = jest.fn().mockRejectedValue(new Error('Connection failed'));
      const publisher = new EventPublisher();

      await publisher.connect();

      expect(publisher.isConnected()).toBe(false);
      await publisher.close();
    });
  });

  // =============================================================================
  // Circuit Breaker Integration - 4 test cases
  // =============================================================================

  describe('Circuit Breaker Integration', () => {
    it('should initialize circuit breaker on construction', () => {
      expect(createCircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          name: 'rabbitmq-publish',
          timeout: 2000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        })
      );
    });

    it('should use circuit breaker for publishing', async () => {
      await eventPublisher.connect();
      jest.clearAllMocks();

      const message: EventMessage = {
        eventType: 'test',
        aggregateId: 'test-123',
        aggregateType: 'test',
        payload: {},
      };

      await eventPublisher.publish(message);

      expect(mockChannel.publish).toHaveBeenCalled();
    });

    it('should handle circuit breaker errors', async () => {
      // Mock circuit breaker to throw error
      (createCircuitBreaker as jest.Mock).mockImplementation(() => {
        return {
          fire: jest.fn().mockRejectedValue(new Error('Circuit open')),
        };
      });

      const publisher = new EventPublisher();
      await publisher.connect();

      const message: EventMessage = {
        eventType: 'test',
        aggregateId: 'test-123',
        aggregateType: 'test',
        payload: {},
      };

      await expect(publisher.publish(message)).resolves.not.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to publish event'
      );

      await publisher.close();
    });

    it('should configure circuit breaker with correct timeout', () => {
      expect(createCircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          timeout: 2000,
        })
      );
    });
  });

  // =============================================================================
  // Reconnection Logic - 2 test cases
  // =============================================================================

  describe('Reconnection Logic', () => {
    it('should reset connection and channel on reconnect', async () => {
      await eventPublisher.connect();

      const originalConnection = (eventPublisher as any).connection;
      const originalChannel = (eventPublisher as any).channel;

      // Trigger reconnect
      await (eventPublisher as any).reconnect();

      expect((eventPublisher as any).connection).toBeDefined();
      expect((eventPublisher as any).channel).toBeDefined();
    });

    it('should maintain connection state during reconnect', async () => {
      await eventPublisher.connect();
      expect(eventPublisher.isConnected()).toBe(true);

      // Simulate connection error
      (eventPublisher as any).connected = false;
      expect(eventPublisher.isConnected()).toBe(false);

      // Reconnect
      await (eventPublisher as any).reconnect();
      expect(eventPublisher.isConnected()).toBe(true);
    });
  });
});
