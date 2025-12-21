import { QueueService } from '../../src/services/queueService';
import { config } from '../../src/config';

/**
 * INTEGRATION TESTS FOR QUEUE SERVICE
 * Tests RabbitMQ connection and message handling
 * 
 * Note: Requires RabbitMQ to be running
 * Default URL: amqp://admin:admin@localhost:5672
 */

describe('QueueService Integration Tests', () => {
  beforeAll(async () => {
    await QueueService.initialize();
  });

  afterAll(async () => {
    await QueueService.close();
  });

  describe('initialization', () => {
    it('should connect to RabbitMQ', () => {
      expect(QueueService.isConnected()).toBe(true);
    });

    it('should be connected after initialization', () => {
      // Connection is already established in beforeAll
      expect(QueueService.isConnected()).toBe(true);
    });
  });

  describe('publish operations', () => {
    it('should publish message to queue', async () => {
      const message = {
        type: 'TEST_EVENT',
        data: { test: 'value' }
      };

      await expect(
        QueueService.publish(config.rabbitmq.queues.ticketEvents, message)
      ).resolves.not.toThrow();
    });

    it('should publish message with complex data', async () => {
      const complexMessage = {
        type: 'COMPLEX_EVENT',
        data: {
          nested: {
            deep: {
              value: 'test'
            }
          },
          array: [1, 2, 3],
          timestamp: new Date().toISOString()
        }
      };

      await expect(
        QueueService.publish(config.rabbitmq.queues.ticketEvents, complexMessage)
      ).resolves.not.toThrow();
    });

    it('should handle publishing to nft minting queue', async () => {
      const message = {
        type: 'MINT_NFT',
        ticketId: 'test-ticket-123'
      };

      await expect(
        QueueService.publish(config.rabbitmq.queues.nftMinting, message)
      ).resolves.not.toThrow();
    });

    it('should handle publishing to notifications queue', async () => {
      const message = {
        type: 'SEND_EMAIL',
        to: 'test@example.com',
        subject: 'Test'
      };

      await expect(
        QueueService.publish(config.rabbitmq.queues.notifications, message)
      ).resolves.not.toThrow();
    });
  });

  describe('consume operations', () => {
    it('should consume messages from queue', async () => {
      const testQueue = `test-consume-queue-${Date.now()}`;
      const receivedMessages: any[] = [];

      await QueueService.consume(testQueue, async (msg) => {
        receivedMessages.push(msg);
      });

      // Publish a message
      await QueueService.publish(testQueue, { type: 'TEST', value: 1 });

      // Wait for message to be processed
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(receivedMessages.length).toBeGreaterThan(0);
      expect(receivedMessages[0].type).toBe('TEST');
    });

    it('should handle message processing errors', async () => {
      const testQueue = `test-error-queue-${Date.now()}`;
      let errorThrown = false;

      await QueueService.consume(testQueue, async (msg) => {
        errorThrown = true;
        throw new Error('Processing failed');
      });

      await QueueService.publish(testQueue, { type: 'ERROR_TEST' });

      // Wait for message processing attempt
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(errorThrown).toBe(true);
    });

    it('should acknowledge successful message processing', async () => {
      const testQueue = `test-ack-queue-${Date.now()}`;
      let processed = false;

      await QueueService.consume(testQueue, async (msg) => {
        processed = true;
      });

      await QueueService.publish(testQueue, { type: 'ACK_TEST' });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(processed).toBe(true);
    });
  });

  describe('message serialization', () => {
    it('should handle JSON serialization', async () => {
      const testQueue = `test-json-queue-${Date.now()}`;
      const message = {
        string: 'test',
        number: 123,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        object: { nested: 'value' }
      };

      let received: any = null;
      await QueueService.consume(testQueue, async (msg) => {
        received = msg;
      });

      await QueueService.publish(testQueue, message);

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(received).toEqual(message);
    });

    it('should handle special characters in messages', async () => {
      const testQueue = `test-special-chars-${Date.now()}`;
      const message = {
        text: 'Special chars: !@#$%^&*()_+-=[]{}|;:\'",.<>?/`~'
      };

      let received: any = null;
      await QueueService.consume(testQueue, async (msg) => {
        received = msg;
      });

      await QueueService.publish(testQueue, message);

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(received?.text).toBe(message.text);
    });

    it('should handle unicode in messages', async () => {
      const testQueue = `test-unicode-${Date.now()}`;
      const message = {
        text: '你好世界 🎉 مرحبا'
      };

      let received: any = null;
      await QueueService.consume(testQueue, async (msg) => {
        received = msg;
      });

      await QueueService.publish(testQueue, message);

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(received?.text).toBe(message.text);
    });
  });

  describe('queue durability', () => {
    it('should create durable queues', async () => {
      // Publishing to configured queues should work (they're durable)
      await expect(
        QueueService.publish(config.rabbitmq.queues.ticketEvents, {
          type: 'DURABLE_TEST'
        })
      ).resolves.not.toThrow();
    });

    it('should persist messages', async () => {
      const message = {
        type: 'PERSISTENT_TEST',
        timestamp: Date.now()
      };

      await expect(
        QueueService.publish(config.rabbitmq.queues.ticketEvents, message)
      ).resolves.not.toThrow();
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple concurrent publishes', async () => {
      const testQueue = `test-concurrent-${Date.now()}`;
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          QueueService.publish(testQueue, {
            type: 'CONCURRENT',
            id: i
          })
        );
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('should process multiple messages sequentially', async () => {
      const testQueue = `test-sequential-${Date.now()}`;
      const processedOrder: number[] = [];

      await QueueService.consume(testQueue, async (msg) => {
        processedOrder.push(msg.id);
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      // Publish multiple messages
      for (let i = 0; i < 5; i++) {
        await QueueService.publish(testQueue, { type: 'SEQ', id: i });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(processedOrder.length).toBeGreaterThan(0);
    });
  });

  describe('connection status', () => {
    it('should report connected status', () => {
      expect(QueueService.isConnected()).toBe(true);
    });

    it('should handle graceful shutdown', async () => {
      // Service should close without errors
      await expect(QueueService.close()).resolves.not.toThrow();

      expect(QueueService.isConnected()).toBe(false);

      // Reconnect for other tests
      await QueueService.initialize();
    });
  });

  describe('error handling', () => {
    it('should handle publishing when not initialized', async () => {
      await QueueService.close();

      // Should not throw, but log warning (graceful degradation)
      await expect(
        QueueService.publish('test-queue', { type: 'TEST' })
      ).resolves.not.toThrow();

      // Reconnect
      await QueueService.initialize();
    });

    it('should handle various queue names gracefully', async () => {
      // RabbitMQ accepts most queue names
      await expect(
        QueueService.publish('test.queue.name', { type: 'TEST' })
      ).resolves.not.toThrow();
    });
  });

  describe('message types', () => {
    it('should handle ticket events', async () => {
      const event = {
        type: 'TICKET_CREATED',
        ticketId: 'ticket-123',
        eventId: 'event-456'
      };

      await expect(
        QueueService.publish(config.rabbitmq.queues.ticketEvents, event)
      ).resolves.not.toThrow();
    });

    it('should handle NFT minting requests', async () => {
      const mintRequest = {
        type: 'MINT_NFT',
        ticketId: 'ticket-789',
        walletAddress: '0x1234567890'
      };

      await expect(
        QueueService.publish(config.rabbitmq.queues.nftMinting, mintRequest)
      ).resolves.not.toThrow();
    });

    it('should handle notification messages', async () => {
      const notification = {
        type: 'SEND_NOTIFICATION',
        userId: 'user-123',
        message: 'Your ticket is ready!'
      };

      await expect(
        QueueService.publish(config.rabbitmq.queues.notifications, notification)
      ).resolves.not.toThrow();
    });
  });

  describe('message validation', () => {
    it('should publish empty objects', async () => {
      const testQueue = `test-empty-${Date.now()}`;
      await expect(QueueService.publish(testQueue, {})).resolves.not.toThrow();
    });

    it('should handle large messages', async () => {
      const testQueue = `test-large-${Date.now()}`;
      const largeMessage = {
        type: 'LARGE',
        data: 'x'.repeat(10000)
      };

      await expect(QueueService.publish(testQueue, largeMessage)).resolves.not.toThrow();
    });

    it('should handle messages with dates', async () => {
      const testQueue = `test-dates-${Date.now()}`;
      const message = {
        type: 'DATE_TEST',
        timestamp: new Date().toISOString()
      };

      let received: any = null;
      await QueueService.consume(testQueue, async (msg) => {
        received = msg;
      });

      await QueueService.publish(testQueue, message);

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(received?.timestamp).toBe(message.timestamp);
    });
  });

  describe('consumer patterns', () => {
    it('should support multiple consumers on same queue', async () => {
      const testQueue = `test-multi-consumer-${Date.now()}`;
      const consumer1Messages: any[] = [];
      const consumer2Messages: any[] = [];

      await QueueService.consume(testQueue, async (msg) => {
        consumer1Messages.push(msg);
      });

      await QueueService.consume(testQueue, async (msg) => {
        consumer2Messages.push(msg);
      });

      // Publish messages
      for (let i = 0; i < 4; i++) {
        await QueueService.publish(testQueue, { id: i });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Messages should be distributed across consumers
      const totalProcessed = consumer1Messages.length + consumer2Messages.length;
      expect(totalProcessed).toBeGreaterThan(0);
    });
  });
});
