/**
 * Unit Tests for Event Service RabbitMQ Publisher
 *
 * PHASE 1 FIX (Issue 5): Tests the real RabbitMQ event publishing implementation.
 */

// Mock modules before imports
jest.mock('amqplib', () => {
  const mockChannel = {
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({ queue: 'test-queue' }),
    bindQueue: jest.fn().mockResolvedValue({}),
    publish: jest.fn().mockReturnValue(true),
    close: jest.fn().mockResolvedValue({}),
    on: jest.fn(),
  };

  const mockConnection = {
    createChannel: jest.fn().mockResolvedValue(mockChannel),
    close: jest.fn().mockResolvedValue({}),
    on: jest.fn(),
  };

  return {
    connect: jest.fn().mockResolvedValue(mockConnection),
    __mockChannel: mockChannel,
    __mockConnection: mockConnection,
  };
});

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
  })),
}));

import {
  rabbitmq,
  initializeRabbitMQ,
  shutdownRabbitMQ,
  rabbitmqConfig,
  EventLifecyclePublisher,
} from '../../src/config/rabbitmq';

const amqplib = require('amqplib');
const mockChannel = amqplib.__mockChannel;
const mockConnection = amqplib.__mockConnection;

describe('Event Service RabbitMQ Publisher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await rabbitmq.disconnect();
  });

  describe('Connection', () => {
    it('should connect to RabbitMQ successfully', async () => {
      await initializeRabbitMQ();

      expect(amqplib.connect).toHaveBeenCalledWith(rabbitmqConfig.url);
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should assert required exchanges on connection', async () => {
      await initializeRabbitMQ();

      // Should assert tickettoken_events exchange
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        'topic',
        { durable: true }
      );

      // Should assert event-lifecycle exchange
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.eventLifecycle,
        'topic',
        { durable: true }
      );
    });

    it('should set up error handlers on connection', async () => {
      await initializeRabbitMQ();

      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should handle connection failure gracefully', async () => {
      const connectionError = new Error('Connection refused');
      amqplib.connect.mockRejectedValueOnce(connectionError);

      // Should not throw (initialization logs warning but doesn't fail)
      await initializeRabbitMQ();

      expect(amqplib.connect).toHaveBeenCalled();
    });

    it('should report connected status correctly', async () => {
      expect(rabbitmq.isConnected()).toBe(false);

      await initializeRabbitMQ();

      expect(rabbitmq.isConnected()).toBe(true);
    });
  });

  describe('Event Created Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish event.created', async () => {
      const event = {
        id: 'event-123',
        name: 'Test Concert',
        organizerId: 'org-456',
        venueId: 'venue-789',
        startDate: new Date('2025-06-15T19:00:00Z'),
        status: 'DRAFT',
      };

      const result = await EventLifecyclePublisher.eventCreated(event, {
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.eventCreated,
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
        })
      );
    });

    it('should include correct payload in event.created', async () => {
      const event = {
        id: 'event-456',
        name: 'Festival',
        organizerId: 'org-123',
        venueId: 'venue-abc',
        startDate: new Date('2025-07-20T14:00:00Z'),
        endDate: new Date('2025-07-20T23:00:00Z'),
        status: 'PUBLISHED',
      };

      await EventLifecyclePublisher.eventCreated(event, { tenantId: 'tenant-2' });

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message.eventId).toBe('event-456');
      expect(message.name).toBe('Festival');
      expect(message.organizerId).toBe('org-123');
      expect(message.venueId).toBe('venue-abc');
      expect(message.createdAt).toBeDefined();
      expect(message.metadata.tenantId).toBe('tenant-2');
    });
  });

  describe('Event Updated Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish event.updated', async () => {
      const result = await EventLifecyclePublisher.eventUpdated(
        'event-123',
        { name: 'Updated Name', status: 'PUBLISHED' },
        { userId: 'user-1', tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.eventUpdated,
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should include changes in event.updated', async () => {
      const changes = {
        name: 'New Event Name',
        status: 'ON_SALE',
        description: 'Updated description',
      };

      await EventLifecyclePublisher.eventUpdated('event-789', changes, { tenantId: 'tenant-3' });

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message.eventId).toBe('event-789');
      expect(message.changes).toEqual(changes);
      expect(message.updatedAt).toBeDefined();
    });
  });

  describe('Event Cancelled Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish event.cancelled', async () => {
      const result = await EventLifecyclePublisher.eventCancelled(
        'event-123',
        {
          reason: 'Weather conditions',
          cancelledBy: 'admin-1',
          affectedTickets: 500,
          refundPolicy: 'full',
        },
        { userId: 'admin-1', tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.eventCancelled,
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should include cancellation details', async () => {
      await EventLifecyclePublisher.eventCancelled(
        'event-456',
        {
          reason: 'Venue unavailable',
          cancelledBy: 'organizer-1',
          affectedTickets: 1000,
          refundPolicy: 'partial',
        },
        { tenantId: 'tenant-2' }
      );

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message.eventId).toBe('event-456');
      expect(message.reason).toBe('Venue unavailable');
      expect(message.cancelledBy).toBe('organizer-1');
      expect(message.affectedTickets).toBe(1000);
      expect(message.refundPolicy).toBe('partial');
      expect(message.cancelledAt).toBeDefined();
    });
  });

  describe('Event Published Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish event.published', async () => {
      const result = await EventLifecyclePublisher.eventPublished(
        'event-123',
        {
          name: 'Amazing Concert',
          startDate: new Date('2025-08-01'),
          venueId: 'venue-1',
        },
        { userId: 'user-1', tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.eventPublished,
        expect.any(Buffer),
        expect.any(Object)
      );
    });
  });

  describe('Event Reminder Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish event.reminder', async () => {
      const result = await EventLifecyclePublisher.eventReminder(
        'event-123',
        {
          type: 'upcoming',
          hoursUntilEvent: 24,
          message: 'Your event is tomorrow!',
          recipientUserIds: ['user-1', 'user-2'],
        },
        { tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.eventReminder,
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should include reminder details', async () => {
      await EventLifecyclePublisher.eventReminder(
        'event-456',
        {
          type: 'starting_soon',
          hoursUntilEvent: 1,
          message: 'Event starts in 1 hour!',
        },
        { tenantId: 'tenant-2' }
      );

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message.eventId).toBe('event-456');
      expect(message.type).toBe('starting_soon');
      expect(message.hoursUntilEvent).toBe(1);
      expect(message.message).toBe('Event starts in 1 hour!');
      expect(message.sentAt).toBeDefined();
    });
  });

  describe('Event Soldout Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish event.soldout', async () => {
      const result = await EventLifecyclePublisher.eventSoldout(
        'event-123',
        {
          totalCapacity: 5000,
          ticketsSold: 5000,
        },
        { tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.eventSoldout,
        expect.any(Buffer),
        expect.any(Object)
      );
    });
  });

  describe('Event Rescheduled Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish event.rescheduled', async () => {
      const result = await EventLifecyclePublisher.eventRescheduled(
        'event-123',
        {
          oldStartDate: new Date('2025-06-01'),
          newStartDate: new Date('2025-06-15'),
          reason: 'Artist availability',
        },
        { userId: 'user-1', tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.eventRescheduled,
        expect.any(Buffer),
        expect.any(Object)
      );
    });
  });

  describe('Capacity Events', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish event.capacity.warning', async () => {
      const result = await EventLifecyclePublisher.capacityWarning(
        'event-123',
        {
          percentSold: 80,
          remaining: 1000,
          totalCapacity: 5000,
        },
        { tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.capacityWarning,
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should publish event.capacity.critical', async () => {
      const result = await EventLifecyclePublisher.capacityCritical(
        'event-123',
        {
          percentSold: 95,
          remaining: 250,
          totalCapacity: 5000,
        },
        { tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.capacityCritical,
        expect.any(Buffer),
        expect.any(Object)
      );
    });
  });

  describe('Message Format', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should include metadata in published messages', async () => {
      await EventLifecyclePublisher.eventCreated(
        { id: 'event-123', name: 'Test Event' },
        { userId: 'user-1', tenantId: 'tenant-1' }
      );

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message.metadata).toBeDefined();
      expect(message.metadata.userId).toBe('user-1');
      expect(message.metadata.tenantId).toBe('tenant-1');
      expect(message.metadata.timestamp).toBeDefined();
      expect(message.metadata.source).toBe('event-service');
    });

    it('should include _meta in published messages', async () => {
      await EventLifecyclePublisher.eventUpdated('event-123', { status: 'PUBLISHED' }, {});

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message._meta).toBeDefined();
      expect(message._meta.source).toBe('event-service');
      expect(message._meta.publishedAt).toBeDefined();
      expect(message._meta.routingKey).toBe(rabbitmqConfig.routingKeys.eventUpdated);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should handle publish when buffer is full', async () => {
      mockChannel.publish.mockReturnValueOnce(false);

      const result = await EventLifecyclePublisher.eventCreated(
        { id: 'event-123', name: 'Test Event' }
      );

      expect(result).toBe(false);
    });

    it('should return false when not connected', async () => {
      await rabbitmq.disconnect();

      const result = await EventLifecyclePublisher.eventCreated(
        { id: 'event-123', name: 'Test Event' }
      );

      expect(result).toBe(false);
    });
  });

  describe('Disconnect', () => {
    it('should close channel and connection on disconnect', async () => {
      await initializeRabbitMQ();

      await rabbitmq.disconnect();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
      expect(rabbitmq.isConnected()).toBe(false);
    });
  });
});
