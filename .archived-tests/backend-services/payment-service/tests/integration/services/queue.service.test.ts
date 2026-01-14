/**
 * QueueService Integration Tests
 * 
 * Tests RabbitMQ queue operations including:
 * - Connection management
 * - Message publishing
 * - Queue assertion
 * - Graceful shutdown
 * 
 * Note: Requires RabbitMQ running locally or via AMQP_URL
 */

import { QueueService, queueService } from '../../../src/services/queueService';

describe('QueueService', () => {
  let testQueue: QueueService;

  beforeAll(() => {
    // Use a fresh instance for testing
    testQueue = new QueueService();
  });

  afterAll(async () => {
    await testQueue.close();
    await queueService.close();
  });

  // ==========================================================================
  // connect
  // ==========================================================================
  describe('connect', () => {
    it('should connect to RabbitMQ successfully', async () => {
      await expect(testQueue.connect()).resolves.toBeUndefined();
    });

    it('should handle multiple connect calls gracefully', async () => {
      await testQueue.connect();
      await expect(testQueue.connect()).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // publish
  // ==========================================================================
  describe('publish', () => {
    beforeAll(async () => {
      await testQueue.connect();
    });

    it('should publish message to queue', async () => {
      const message = { type: 'test', data: 'hello' };
      
      await expect(
        testQueue.publish('test-payment-queue', message)
      ).resolves.toBeUndefined();
    });

    it('should publish message with complex payload', async () => {
      const message = {
        eventType: 'payment.completed',
        paymentId: '123e4567-e89b-12d3-a456-426614174000',
        amount: 5000,
        currency: 'USD',
        metadata: {
          orderId: 'order-123',
          userId: 'user-456',
        },
        timestamp: new Date().toISOString(),
      };
      
      await expect(
        testQueue.publish('test-payment-events', message)
      ).resolves.toBeUndefined();
    });

    it('should auto-connect if not connected', async () => {
      const freshQueue = new QueueService();
      
      // Should connect automatically
      await expect(
        freshQueue.publish('test-auto-connect', { test: true })
      ).resolves.toBeUndefined();
      
      await freshQueue.close();
    });

    it('should handle array payload', async () => {
      const messages = [
        { id: 1, action: 'create' },
        { id: 2, action: 'update' },
      ];
      
      await expect(
        testQueue.publish('test-batch-queue', messages)
      ).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // close
  // ==========================================================================
  describe('close', () => {
    it('should close connection gracefully', async () => {
      const tempQueue = new QueueService();
      await tempQueue.connect();
      
      await expect(tempQueue.close()).resolves.toBeUndefined();
    });

    it('should handle close when not connected', async () => {
      const tempQueue = new QueueService();
      
      await expect(tempQueue.close()).resolves.toBeUndefined();
    });

    it('should allow reconnect after close', async () => {
      const tempQueue = new QueueService();
      await tempQueue.connect();
      await tempQueue.close();
      
      await expect(tempQueue.connect()).resolves.toBeUndefined();
      await tempQueue.close();
    });
  });

  // ==========================================================================
  // singleton instance
  // ==========================================================================
  describe('singleton queueService', () => {
    it('should be defined', () => {
      expect(queueService).toBeDefined();
      expect(queueService).toBeInstanceOf(QueueService);
    });

    it('should publish via singleton', async () => {
      await expect(
        queueService.publish('test-singleton-queue', { from: 'singleton' })
      ).resolves.toBeUndefined();
    });
  });
});
