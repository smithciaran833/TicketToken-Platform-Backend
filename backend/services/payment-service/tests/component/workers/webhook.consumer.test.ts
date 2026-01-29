/**
 * COMPONENT TEST: WebhookConsumer
 *
 * Tests RabbitMQ webhook consumer with MOCKED dependencies
 */

import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.RABBITMQ_URL = 'amqp://localhost';
process.env.MARKETPLACE_SERVICE_URL = 'http://marketplace-service:3006';

// Mock webhook data
let mockWebhooks: Map<string, any> = new Map();

// Mock channel
const mockAck = jest.fn();
const mockNack = jest.fn();
let consumeCallback: ((msg: any) => Promise<void>) | null = null;

const mockChannel = {
  assertQueue: jest.fn().mockResolvedValue({}),
  consume: jest.fn().mockImplementation((queue: string, callback: any) => {
    consumeCallback = callback;
    return Promise.resolve({});
  }),
  ack: mockAck,
  nack: mockNack,
};

// Mock connection
const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
};

// Mock amqplib
jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue(mockConnection),
}));

// Mock axios
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  post: (...args: any[]) => mockAxiosPost(...args),
}));

// Mock knex/db
const mockDbFirst = jest.fn();
const mockDbUpdate = jest.fn();
const mockDbWhere = jest.fn();

const mockDb = jest.fn((table: string) => ({
  where: mockDbWhere.mockImplementation((field: string, value: string) => ({
    first: mockDbFirst.mockImplementation(() => {
      return Promise.resolve(mockWebhooks.get(value));
    }),
    update: mockDbUpdate.mockResolvedValue(1),
  })),
}));

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { startWebhookConsumer } from '../../../src/workers/webhook.consumer';

describe('WebhookConsumer Component Tests', () => {
  beforeEach(async () => {
    // Reset mocks
    mockWebhooks.clear();
    mockAxiosPost.mockReset();
    mockAxiosPost.mockResolvedValue({ status: 200 });
    mockAck.mockReset();
    mockNack.mockReset();
    mockDbFirst.mockReset();
    mockDbUpdate.mockReset();
    consumeCallback = null;

    // Start consumer to capture callback
    await startWebhookConsumer();
  });

  // Helper to add mock webhook
  function addWebhook(id: string, payload: any): void {
    mockWebhooks.set(id, {
      id,
      payload: JSON.stringify(payload),
      processed_at: null,
      status: 'pending',
    });
  }

  // Helper to simulate message
  async function simulateMessage(data: any): Promise<void> {
    if (!consumeCallback) throw new Error('Consumer not started');
    
    const msg = {
      content: Buffer.from(JSON.stringify(data)),
    };
    
    await consumeCallback(msg);
  }

  // ===========================================================================
  // PAYMENT SUCCESS
  // ===========================================================================
  describe('payment_intent.succeeded', () => {
    it('should process payment success and notify marketplace', async () => {
      const webhookId = uuidv4();
      const orderId = uuidv4();

      addWebhook(webhookId, {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: `pi_${uuidv4().replace(/-/g, '')}`,
            metadata: { orderId },
          },
        },
      });

      await simulateMessage({ webhookId, source: 'stripe' });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://marketplace-service:3006/internal/events',
        expect.objectContaining({
          event: 'order.completed',
        })
      );

      expect(mockAck).toHaveBeenCalled();
    });

    it('should update webhook as processed', async () => {
      const webhookId = uuidv4();

      addWebhook(webhookId, {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      });

      await simulateMessage({ webhookId, source: 'stripe' });

      expect(mockDbUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          processed_at: expect.any(Date),
          status: 'processed',
        })
      );
    });
  });

  // ===========================================================================
  // PAYMENT FAILURE
  // ===========================================================================
  describe('payment_intent.payment_failed', () => {
    it('should process payment failure and notify marketplace', async () => {
      const webhookId = uuidv4();

      addWebhook(webhookId, {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_failed',
            last_payment_error: { message: 'Card declined' },
          },
        },
      });

      await simulateMessage({ webhookId, source: 'stripe' });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://marketplace-service:3006/internal/events',
        expect.objectContaining({
          event: 'payment.failed',
        })
      );

      expect(mockAck).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // REFUND
  // ===========================================================================
  describe('charge.refunded', () => {
    it('should process refund and notify marketplace', async () => {
      const webhookId = uuidv4();

      addWebhook(webhookId, {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_refunded',
            amount_refunded: 5000,
          },
        },
      });

      await simulateMessage({ webhookId, source: 'stripe' });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://marketplace-service:3006/internal/events',
        expect.objectContaining({
          event: 'refund.processed',
        })
      );

      expect(mockAck).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // UNKNOWN EVENT TYPE
  // ===========================================================================
  describe('unknown event type', () => {
    it('should ack message for unknown event type', async () => {
      const webhookId = uuidv4();

      addWebhook(webhookId, {
        type: 'unknown.event',
        data: {},
      });

      await simulateMessage({ webhookId, source: 'stripe' });

      // Should still ack and mark as processed
      expect(mockAck).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // WEBHOOK NOT FOUND
  // ===========================================================================
  describe('webhook not found', () => {
    it('should nack message when webhook not in database', async () => {
      const webhookId = uuidv4();
      // Don't add webhook to mock store

      await simulateMessage({ webhookId, source: 'stripe' });

      expect(mockNack).toHaveBeenCalledWith(expect.any(Object), false, true);
      expect(mockAck).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should nack and requeue on axios error', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('Connection refused'));

      const webhookId = uuidv4();
      addWebhook(webhookId, {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      });

      await simulateMessage({ webhookId, source: 'stripe' });

      expect(mockNack).toHaveBeenCalledWith(expect.any(Object), false, true);
    });

    it('should nack on database error', async () => {
      mockDbFirst.mockRejectedValueOnce(new Error('Database connection failed'));

      const webhookId = uuidv4();
      addWebhook(webhookId, {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      });

      await simulateMessage({ webhookId, source: 'stripe' });

      expect(mockNack).toHaveBeenCalledWith(expect.any(Object), false, true);
    });
  });

  // ===========================================================================
  // NULL MESSAGE
  // ===========================================================================
  describe('null message', () => {
    it('should handle null message gracefully', async () => {
      if (!consumeCallback) throw new Error('Consumer not started');
      
      // Should not throw
      await consumeCallback(null);

      expect(mockAck).not.toHaveBeenCalled();
      expect(mockNack).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // QUEUE SETUP
  // ===========================================================================
  describe('queue setup', () => {
    it('should assert durable queue', async () => {
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'payment.webhook',
        { durable: true }
      );
    });

    it('should connect to RabbitMQ', async () => {
      const amqp = require('amqplib');
      expect(amqp.connect).toHaveBeenCalled();
    });
  });
});
