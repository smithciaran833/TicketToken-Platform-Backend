/**
 * Unit Tests for Marketplace Service RabbitMQ Publisher
 *
 * PHASE 1 FIX: Tests the real amqplib implementation that replaced the stub.
 */

// Mock modules before imports
jest.mock('amqplib', () => {
  const mockChannel = {
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({ queue: 'test-queue' }),
    bindQueue: jest.fn().mockResolvedValue({}),
    publish: jest.fn().mockReturnValue(true),
    prefetch: jest.fn().mockResolvedValue({}),
    consume: jest.fn().mockResolvedValue({ consumerTag: 'test-tag' }),
    ack: jest.fn(),
    nack: jest.fn(),
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
  },
}));

import {
  rabbitmq,
  initializeRabbitMQ,
  rabbitmqConfig,
  MarketplaceEventPublisher,
} from '../../src/config/rabbitmq';

const amqplib = require('amqplib');
const mockChannel = amqplib.__mockChannel;
const mockConnection = amqplib.__mockConnection;

describe('Marketplace Service RabbitMQ Publisher', () => {
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

      // Should assert marketplace-events exchange
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.marketplace,
        'topic',
        { durable: true }
      );

      // Should assert tickettoken_events exchange
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
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

      // Should not throw, just log warning
      await initializeRabbitMQ();

      expect(amqplib.connect).toHaveBeenCalled();
    });

    it('should report connected status correctly', async () => {
      expect(rabbitmq.isConnected()).toBe(false);

      await initializeRabbitMQ();

      expect(rabbitmq.isConnected()).toBe(true);
    });
  });

  describe('Event Publishing', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should publish listing.created event', async () => {
      const listing = {
        id: 'listing-123',
        sellerId: 'seller-456',
        ticketId: 'ticket-789',
        price: 100,
      };

      const result = await MarketplaceEventPublisher.listingCreated(listing, {
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.marketplace,
        rabbitmqConfig.routingKeys.listingCreated,
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
        })
      );
    });

    it('should publish listing.sold event', async () => {
      const listing = {
        id: 'listing-123',
        sellerId: 'seller-456',
        ticketId: 'ticket-789',
        price: 100,
      };

      const result = await MarketplaceEventPublisher.listingSold(
        listing,
        'buyer-999',
        'tx-abc123',
        { tenantId: 'tenant-1' }
      );

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.marketplace,
        rabbitmqConfig.routingKeys.listingSold,
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should publish transfer.complete event', async () => {
      const transfer = {
        id: 'transfer-123',
        listingId: 'listing-456',
        buyerId: 'buyer-789',
        sellerId: 'seller-abc',
        status: 'completed',
      };

      const result = await MarketplaceEventPublisher.transferComplete(transfer, {
        tenantId: 'tenant-1',
      });

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.transferComplete,
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should publish dispute.created event', async () => {
      const dispute = {
        id: 'dispute-123',
        listingId: 'listing-456',
        reason: 'Item not as described',
        complainantId: 'user-789',
      };

      const result = await MarketplaceEventPublisher.disputeCreated(dispute, {
        userId: 'user-789',
        tenantId: 'tenant-1',
      });

      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        rabbitmqConfig.exchanges.events,
        rabbitmqConfig.routingKeys.disputeCreated,
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should handle publish when buffer is full', async () => {
      mockChannel.publish.mockReturnValueOnce(false);

      const listing = { id: 'listing-123' };

      const result = await MarketplaceEventPublisher.listingCreated(listing);

      // Should return false when buffer is full
      expect(result).toBe(false);
    });

    it('should return false when not connected', async () => {
      await rabbitmq.disconnect();

      const listing = { id: 'listing-123' };

      const result = await MarketplaceEventPublisher.listingCreated(listing);

      expect(result).toBe(false);
    });
  });

  describe('Message Format', () => {
    beforeEach(async () => {
      await initializeRabbitMQ();
    });

    it('should include metadata in published messages', async () => {
      const listing = { id: 'listing-123' };

      await MarketplaceEventPublisher.listingCreated(listing, {
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      // Get the buffer that was published
      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message.metadata).toBeDefined();
      expect(message.metadata.userId).toBe('user-1');
      expect(message.metadata.tenantId).toBe('tenant-1');
      expect(message.metadata.timestamp).toBeDefined();
    });

    it('should include source service in _meta', async () => {
      const listing = { id: 'listing-123' };

      await MarketplaceEventPublisher.listingCreated(listing);

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const message = JSON.parse(messageBuffer.toString());

      expect(message._meta).toBeDefined();
      expect(message._meta.source).toBe('marketplace-service');
      expect(message._meta.publishedAt).toBeDefined();
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
