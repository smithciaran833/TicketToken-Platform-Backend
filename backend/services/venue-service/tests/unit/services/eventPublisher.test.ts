/**
 * Unit tests for src/services/eventPublisher.ts
 * Tests RabbitMQ event publishing with circuit breaker pattern
 */

// Mock amqplib - must be defined before import
const mockChannel = {
  assertExchange: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn().mockReturnValue(true),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  close: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

import { EventPublisher, EventMessage } from '../../../src/services/eventPublisher';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock config
jest.mock('../../../src/config/index', () => ({
  getConfig: jest.fn(() => ({
    rabbitmq: {
      url: 'amqp://localhost:5672',
    },
  })),
}));

// Mock circuit breaker
jest.mock('../../../src/utils/circuitBreaker', () => ({
  createCircuitBreaker: jest.fn((fn) => ({
    fire: jest.fn(async (arg) => fn(arg)),
  })),
}));

// Mock shared search sync
jest.mock('@tickettoken/shared', () => ({
  publishSearchSync: jest.fn().mockResolvedValue(undefined),
}));

describe('services/eventPublisher', () => {
  let eventPublisher: EventPublisher;
  const amqplib = require('amqplib');
  const { publishSearchSync } = require('@tickettoken/shared');
  const { logger } = require('../../../src/utils/logger');

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up mock connection before creating publisher
    amqplib.connect.mockResolvedValue(mockConnection);
    eventPublisher = new EventPublisher();
  });

  afterEach(async () => {
    try {
      await eventPublisher.close();
    } catch (e) {
      // Ignore close errors in tests
    }
  });

  describe('connect()', () => {
    it('should connect to RabbitMQ successfully', async () => {
      await eventPublisher.connect();

      expect(amqplib.connect).toHaveBeenCalledWith('amqp://localhost:5672');
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'venue-events',
        'topic',
        { durable: true }
      );
    });

    it('should set connected to true after successful connection', async () => {
      await eventPublisher.connect();

      expect(eventPublisher.isConnected()).toBe(true);
    });

    it('should log connection success', async () => {
      await eventPublisher.connect();

      expect(logger.info).toHaveBeenCalledWith('Connected to RabbitMQ');
    });

    it('should set up error and close handlers', async () => {
      await eventPublisher.connect();

      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should handle connection failure gracefully', async () => {
      amqplib.connect.mockRejectedValueOnce(new Error('Connection refused'));

      await eventPublisher.connect();

      expect(eventPublisher.isConnected()).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Could not connect to RabbitMQ - running without event publishing'
      );
    });
  });

  describe('publish()', () => {
    beforeEach(async () => {
      await eventPublisher.connect();
    });

    it('should publish message to RabbitMQ', async () => {
      const message: EventMessage = {
        eventType: 'created',
        aggregateId: 'venue-123',
        aggregateType: 'venue',
        payload: { name: 'Test Venue' },
      };

      await eventPublisher.publish(message);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'venue-events',
        'venue.created',
        expect.any(Buffer),
        { persistent: true }
      );
    });

    it('should use correct routing key format', async () => {
      const message: EventMessage = {
        eventType: 'updated',
        aggregateId: 'venue-456',
        aggregateType: 'venue',
        payload: { changes: { name: 'New Name' } },
      };

      await eventPublisher.publish(message);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'venue-events',
        'venue.updated',
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should include metadata timestamp if not provided', async () => {
      const message: EventMessage = {
        eventType: 'created',
        aggregateId: 'venue-123',
        aggregateType: 'venue',
        payload: {},
      };

      await eventPublisher.publish(message);

      const publishedBuffer = mockChannel.publish.mock.calls[0][2];
      const publishedMessage = JSON.parse(publishedBuffer.toString());

      expect(publishedMessage.metadata.timestamp).toBeDefined();
    });

    it('should preserve provided metadata', async () => {
      const timestamp = new Date('2024-01-01');
      const message: EventMessage = {
        eventType: 'created',
        aggregateId: 'venue-123',
        aggregateType: 'venue',
        payload: {},
        metadata: {
          userId: 'user-456',
          timestamp,
          correlationId: 'corr-789',
        },
      };

      await eventPublisher.publish(message);

      const publishedBuffer = mockChannel.publish.mock.calls[0][2];
      const publishedMessage = JSON.parse(publishedBuffer.toString());

      expect(publishedMessage.metadata.userId).toBe('user-456');
      expect(publishedMessage.metadata.correlationId).toBe('corr-789');
    });

    it('should skip publishing when not connected', async () => {
      // Create a new publisher that never connected
      const disconnectedPublisher = new EventPublisher();

      await disconnectedPublisher.publish({
        eventType: 'created',
        aggregateId: 'venue-123',
        aggregateType: 'venue',
        payload: {},
      });

      expect(logger.debug).toHaveBeenCalledWith(
        'RabbitMQ not connected, skipping event publish'
      );
    });

    it('should handle publish error gracefully', async () => {
      mockChannel.publish.mockImplementationOnce(() => {
        throw new Error('Publish failed');
      });

      const message: EventMessage = {
        eventType: 'created',
        aggregateId: 'venue-123',
        aggregateType: 'venue',
        payload: {},
      };

      // Should not throw
      await expect(eventPublisher.publish(message)).resolves.not.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('publishVenueCreated()', () => {
    beforeEach(async () => {
      await eventPublisher.connect();
    });

    it('should publish venue created event', async () => {
      await eventPublisher.publishVenueCreated(
        'venue-123',
        { name: 'Test Venue', type: 'stadium' },
        'user-456'
      );

      expect(mockChannel.publish).toHaveBeenCalled();
      const publishedBuffer = mockChannel.publish.mock.calls[0][2];
      const publishedMessage = JSON.parse(publishedBuffer.toString());

      expect(publishedMessage.eventType).toBe('created');
      expect(publishedMessage.aggregateType).toBe('venue');
      expect(publishedMessage.metadata.userId).toBe('user-456');
      expect(publishedMessage.metadata.version).toBe(1);
    });

    it('should publish to search sync exchange', async () => {
      await eventPublisher.publishVenueCreated(
        'venue-123',
        { name: 'Test Venue', type: 'stadium', city: 'New York' },
        'user-456'
      );

      expect(publishSearchSync).toHaveBeenCalledWith(
        'venue.created',
        expect.objectContaining({
          id: 'venue-123',
          name: 'Test Venue',
          type: 'stadium',
          city: 'New York',
        })
      );
    });

    it('should handle alternative field names for address', async () => {
      await eventPublisher.publishVenueCreated(
        'venue-123',
        {
          name: 'Test Venue',
          venue_type: 'arena',
          max_capacity: 50000,
          address: { city: 'Chicago', state: 'IL', country: 'US' },
        },
        'user-456'
      );

      expect(publishSearchSync).toHaveBeenCalledWith(
        'venue.created',
        expect.objectContaining({
          type: 'arena',
          capacity: 50000,
          city: 'Chicago',
          state: 'IL',
          country: 'US',
        })
      );
    });
  });

  describe('publishVenueUpdated()', () => {
    beforeEach(async () => {
      await eventPublisher.connect();
    });

    it('should publish venue updated event', async () => {
      await eventPublisher.publishVenueUpdated(
        'venue-123',
        { name: 'Updated Venue' },
        'user-456'
      );

      expect(mockChannel.publish).toHaveBeenCalled();
      const publishedBuffer = mockChannel.publish.mock.calls[0][2];
      const publishedMessage = JSON.parse(publishedBuffer.toString());

      expect(publishedMessage.eventType).toBe('updated');
      expect(publishedMessage.payload.changes).toEqual({ name: 'Updated Venue' });
    });

    it('should publish to search sync for updates', async () => {
      await eventPublisher.publishVenueUpdated(
        'venue-123',
        { name: 'Updated Venue', status: 'INACTIVE' },
        'user-456'
      );

      expect(publishSearchSync).toHaveBeenCalledWith(
        'venue.updated',
        expect.objectContaining({
          id: 'venue-123',
          changes: expect.objectContaining({
            name: 'Updated Venue',
            status: 'INACTIVE',
          }),
        })
      );
    });
  });

  describe('publishVenueDeleted()', () => {
    beforeEach(async () => {
      await eventPublisher.connect();
    });

    it('should publish venue deleted event', async () => {
      await eventPublisher.publishVenueDeleted('venue-123', 'user-456');

      expect(mockChannel.publish).toHaveBeenCalled();
      const publishedBuffer = mockChannel.publish.mock.calls[0][2];
      const publishedMessage = JSON.parse(publishedBuffer.toString());

      expect(publishedMessage.eventType).toBe('deleted');
      expect(publishedMessage.aggregateId).toBe('venue-123');
      expect(publishedMessage.payload.deletedAt).toBeDefined();
    });

    it('should publish to search sync for deletion', async () => {
      await eventPublisher.publishVenueDeleted('venue-123', 'user-456');

      expect(publishSearchSync).toHaveBeenCalledWith(
        'venue.deleted',
        { id: 'venue-123' }
      );
    });
  });

  describe('close()', () => {
    it('should close channel and connection', async () => {
      await eventPublisher.connect();
      await eventPublisher.close();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should handle close when not connected', async () => {
      // Never connected, should not throw
      await expect(eventPublisher.close()).resolves.not.toThrow();
    });
  });

  describe('isConnected()', () => {
    it('should return false before connecting', () => {
      expect(eventPublisher.isConnected()).toBe(false);
    });

    it('should return true after connecting', async () => {
      await eventPublisher.connect();

      expect(eventPublisher.isConnected()).toBe(true);
    });
  });

  describe('Circuit Breaker integration', () => {
    it('should use circuit breaker for publishing', async () => {
      const { createCircuitBreaker } = require('../../../src/utils/circuitBreaker');
      
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
  });

  describe('Reconnection behavior', () => {
    it('should handle error event on connection', async () => {
      await eventPublisher.connect();

      // Get the error handler that was registered
      const errorHandler = mockConnection.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      expect(errorHandler).toBeDefined();
      
      // Simulate error - should log and set connected to false
      if (errorHandler) {
        // Reset connect mock to track reconnect
        amqplib.connect.mockClear();
        errorHandler(new Error('Connection lost'));
        
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          'RabbitMQ connection error'
        );
      }
    });

    it('should handle close event on connection', async () => {
      await eventPublisher.connect();

      const closeHandler = mockConnection.on.mock.calls.find(
        (call: any[]) => call[0] === 'close'
      )?.[1];

      expect(closeHandler).toBeDefined();
      
      if (closeHandler) {
        closeHandler();
        expect(logger.warn).toHaveBeenCalledWith('RabbitMQ connection closed');
      }
    });
  });
});
