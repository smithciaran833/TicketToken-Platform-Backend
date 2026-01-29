/**
 * COMPONENT TEST: OutboxProcessor
 *
 * Tests outbox event processing with MOCKED Database and HTTP
 */

import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.INTERNAL_WEBHOOK_SECRET = 'test-webhook-secret-at-least-32-chars';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/tickettoken_db';

// Mock data store
let mockOutboxEvents: any[] = [];
let mockQueryResults: any[] = [];

// Mock pg Pool
const mockRelease = jest.fn();
const mockClientQuery = jest.fn();
const mockClient = {
  query: mockClientQuery,
  release: mockRelease,
};

const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn().mockResolvedValue(mockClient);

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockPoolQuery,
    connect: mockPoolConnect,
  })),
}));

// Mock axios for HTTP calls
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  post: (...args: any[]) => mockAxiosPost(...args),
}));

// Mock queueService
const mockQueuePublish = jest.fn();
jest.mock('../../../src/services/queueService', () => ({
  queueService: {
    publish: (...args: any[]) => mockQueuePublish(...args),
  },
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

import { OutboxProcessor } from '../../../src/workers/outbox.processor';

describe('OutboxProcessor Component Tests', () => {
  let processor: OutboxProcessor;

  beforeEach(() => {
    // Reset mocks
    mockAxiosPost.mockReset();
    mockAxiosPost.mockResolvedValue({ status: 200 });
    mockQueuePublish.mockReset();
    mockQueuePublish.mockResolvedValue(undefined);
    mockClientQuery.mockReset();
    mockPoolQuery.mockReset();
    mockRelease.mockReset();
    mockOutboxEvents = [];

    // Setup default query behavior
    mockClientQuery.mockImplementation(async (query: string, params?: any[]) => {
      // Handle set_config calls
      if (query.includes('set_config')) {
        return { rows: [] };
      }
      
      // Handle SELECT from outbox
      if (query.includes('SELECT') && query.includes('outbox')) {
        return { rows: mockOutboxEvents.filter(e => !e.processed_at && e.attempts < 5) };
      }
      
      // Handle UPDATE outbox SET processed_at
      if (query.includes('UPDATE outbox') && query.includes('processed_at = NOW()')) {
        const eventId = params?.[0];
        const event = mockOutboxEvents.find(e => e.id === eventId);
        if (event) {
          event.processed_at = new Date();
        }
        return { rows: [] };
      }
      
      // Handle UPDATE outbox SET attempts
      if (query.includes('UPDATE outbox') && query.includes('attempts = attempts + 1')) {
        const eventId = params?.[0];
        const event = mockOutboxEvents.find(e => e.id === eventId);
        if (event) {
          event.attempts = (event.attempts || 0) + 1;
          event.last_attempt_at = new Date();
          event.last_error = params?.[1] || 'Processing failed';
        }
        return { rows: [] };
      }
      
      return { rows: [] };
    });

    processor = new OutboxProcessor();
  });

  afterEach(() => {
    processor.stop();
  });

  // Helper to add mock outbox event
  function addOutboxEvent(event: Partial<any>): string {
    const id = event.id || uuidv4();
    mockOutboxEvents.push({
      id,
      tenant_id: event.tenant_id || uuidv4(),
      aggregate_id: event.aggregate_id || uuidv4(),
      aggregate_type: event.aggregate_type || 'order',
      event_type: event.event_type || 'order.paid',
      payload: event.payload || {},
      attempts: event.attempts || 0,
      last_attempt_at: event.last_attempt_at || null,
      processed_at: event.processed_at || null,
      created_at: event.created_at || new Date(),
    });
    return id;
  }

  // ===========================================================================
  // ORDER.PAID EVENT
  // ===========================================================================
  describe('order.paid event', () => {
    it('should process order.paid and call ticket service', async () => {
      const orderId = uuidv4();
      const paymentId = uuidv4();
      const userId = uuidv4();
      const eventId = uuidv4();
      
      const outboxId = addOutboxEvent({
        aggregate_id: orderId,
        event_type: 'order.paid',
        payload: {
          orderId,
          paymentId,
          userId,
          eventId,
          amount: 5000,
          ticketQuantity: 2,
        },
      });

      // Process events
      await (processor as any).processOutboxEvents();

      // Check axios was called with correct endpoint
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://ticket:3004/api/v1/webhooks/payment-confirmed',
        expect.objectContaining({
          orderId,
          paymentId,
          userId,
          eventId,
          amount: 5000,
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-internal-signature': expect.any(String),
            'x-webhook-timestamp': expect.any(String),
            'x-webhook-nonce': expect.any(String),
          }),
        })
      );

      // Check event marked as processed
      const event = mockOutboxEvents.find(e => e.id === outboxId);
      expect(event?.processed_at).not.toBeNull();
    });

    it('should increment attempts on HTTP failure', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('Connection refused'));

      const orderId = uuidv4();
      const outboxId = addOutboxEvent({
        aggregate_id: orderId,
        event_type: 'order.paid',
        payload: { orderId, paymentId: uuidv4() },
      });

      await (processor as any).processOutboxEvents();

      const event = mockOutboxEvents.find(e => e.id === outboxId);
      expect(event?.attempts).toBe(1);
      expect(event?.last_error).toBeDefined();
      expect(event?.processed_at).toBeNull();
    });

    it('should handle non-2xx response as failure', async () => {
      mockAxiosPost.mockResolvedValueOnce({ status: 500 });

      const orderId = uuidv4();
      const outboxId = addOutboxEvent({
        aggregate_id: orderId,
        event_type: 'order.paid',
        payload: { orderId, paymentId: uuidv4() },
      });

      await (processor as any).processOutboxEvents();

      const event = mockOutboxEvents.find(e => e.id === outboxId);
      expect(event?.attempts).toBe(1);
      expect(event?.processed_at).toBeNull();
    });
  });

  // ===========================================================================
  // ORDER.PAYMENT_FAILED EVENT
  // ===========================================================================
  describe('order.payment_failed event', () => {
    it('should process payment_failed and notify ticket service', async () => {
      const orderId = uuidv4();
      
      const outboxId = addOutboxEvent({
        aggregate_id: orderId,
        event_type: 'order.payment_failed',
        payload: {
          orderId,
          reason: 'Card declined',
        },
      });

      await (processor as any).processOutboxEvents();

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://ticket:3004/api/v1/webhooks/payment-failed',
        expect.objectContaining({
          orderId,
          reason: 'Card declined',
        }),
        expect.any(Object)
      );

      const event = mockOutboxEvents.find(e => e.id === outboxId);
      expect(event?.processed_at).not.toBeNull();
    });

    it('should use default reason if not provided', async () => {
      const orderId = uuidv4();
      
      addOutboxEvent({
        aggregate_id: orderId,
        event_type: 'order.payment_failed',
        payload: { orderId },
      });

      await (processor as any).processOutboxEvents();

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reason: 'Payment failed',
        }),
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // TICKETS.CREATE EVENT
  // ===========================================================================
  describe('tickets.create event', () => {
    it('should queue tickets for minting', async () => {
      const orderId = uuidv4();
      const tickets = [{ id: uuidv4() }, { id: uuidv4() }];
      
      const outboxId = addOutboxEvent({
        aggregate_id: orderId,
        event_type: 'tickets.create',
        payload: {
          orderId,
          tickets,
        },
      });

      await (processor as any).processOutboxEvents();

      expect(mockQueuePublish).toHaveBeenCalledWith(
        'ticket.mint',
        expect.objectContaining({ orderId, tickets })
      );

      const event = mockOutboxEvents.find(e => e.id === outboxId);
      expect(event?.processed_at).not.toBeNull();
    });

    it('should increment attempts if queue publish fails', async () => {
      mockQueuePublish.mockRejectedValueOnce(new Error('Queue unavailable'));

      const orderId = uuidv4();
      const outboxId = addOutboxEvent({
        aggregate_id: orderId,
        event_type: 'tickets.create',
        payload: { orderId },
      });

      await (processor as any).processOutboxEvents();

      const event = mockOutboxEvents.find(e => e.id === outboxId);
      expect(event?.attempts).toBe(1);
      expect(event?.processed_at).toBeNull();
    });
  });

  // ===========================================================================
  // UNKNOWN EVENT TYPE
  // ===========================================================================
  describe('unknown event type', () => {
    it('should mark unknown event type as processed', async () => {
      const outboxId = addOutboxEvent({
        aggregate_id: uuidv4(),
        aggregate_type: 'unknown',
        event_type: 'unknown.event',
        payload: {},
      });

      await (processor as any).processOutboxEvents();

      const event = mockOutboxEvents.find(e => e.id === outboxId);
      expect(event?.processed_at).not.toBeNull();
    });
  });

  // ===========================================================================
  // RETRY LOGIC
  // ===========================================================================
  describe('retry logic', () => {
    it('should not process events that exceeded max attempts', async () => {
      addOutboxEvent({
        aggregate_id: uuidv4(),
        event_type: 'order.paid',
        payload: { orderId: uuidv4() },
        attempts: 5, // Max attempts reached
      });

      await (processor as any).processOutboxEvents();

      // Should not have been called since event is filtered out
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should skip already processed events', async () => {
      addOutboxEvent({
        aggregate_id: uuidv4(),
        event_type: 'order.paid',
        payload: { orderId: uuidv4() },
        processed_at: new Date(), // Already processed
      });

      await (processor as any).processOutboxEvents();

      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should process multiple events in order', async () => {
      const orderId1 = uuidv4();
      const orderId2 = uuidv4();

      addOutboxEvent({
        aggregate_id: orderId1,
        event_type: 'order.paid',
        payload: { orderId: orderId1, paymentId: uuidv4() },
        created_at: new Date(Date.now() - 1000),
      });

      addOutboxEvent({
        aggregate_id: orderId2,
        event_type: 'order.paid',
        payload: { orderId: orderId2, paymentId: uuidv4() },
        created_at: new Date(),
      });

      await (processor as any).processOutboxEvents();

      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // SIGNATURE GENERATION
  // ===========================================================================
  describe('signature generation', () => {
    it('should include signature headers in request', async () => {
      const orderId = uuidv4();
      
      addOutboxEvent({
        aggregate_id: orderId,
        event_type: 'order.paid',
        payload: { orderId, paymentId: uuidv4() },
      });

      await (processor as any).processOutboxEvents();

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-internal-signature': expect.any(String),
            'x-webhook-timestamp': expect.any(String),
            'x-webhook-nonce': expect.any(String),
            'x-idempotency-key': expect.any(String),
            'Content-Type': 'application/json',
          }),
          timeout: 10000,
        })
      );
    });

    it('should generate unique nonce for each request', async () => {
      const orderId1 = uuidv4();
      const orderId2 = uuidv4();

      addOutboxEvent({
        aggregate_id: orderId1,
        event_type: 'order.paid',
        payload: { orderId: orderId1, paymentId: uuidv4() },
      });

      addOutboxEvent({
        aggregate_id: orderId2,
        event_type: 'order.paid',
        payload: { orderId: orderId2, paymentId: uuidv4() },
      });

      await (processor as any).processOutboxEvents();

      const call1Headers = mockAxiosPost.mock.calls[0][2].headers;
      const call2Headers = mockAxiosPost.mock.calls[1][2].headers;

      expect(call1Headers['x-webhook-nonce']).not.toBe(call2Headers['x-webhook-nonce']);
    });
  });

  // ===========================================================================
  // CONCURRENCY PROTECTION
  // ===========================================================================
  describe('concurrency protection', () => {
    it('should not process if already processing', async () => {
      (processor as any).isProcessing = true;

      addOutboxEvent({
        aggregate_id: uuidv4(),
        event_type: 'order.paid',
        payload: { orderId: uuidv4() },
      });

      await (processor as any).processOutboxEvents();

      // Should have short-circuited before querying
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should reset isProcessing after completion', async () => {
      addOutboxEvent({
        aggregate_id: uuidv4(),
        event_type: 'order.paid',
        payload: { orderId: uuidv4(), paymentId: uuidv4() },
      });

      await (processor as any).processOutboxEvents();

      expect((processor as any).isProcessing).toBe(false);
    });

    it('should reset isProcessing even on error', async () => {
      mockClientQuery.mockRejectedValueOnce(new Error('DB error'));

      await (processor as any).processOutboxEvents();

      expect((processor as any).isProcessing).toBe(false);
    });
  });

  // ===========================================================================
  // START/STOP
  // ===========================================================================
  describe('start/stop', () => {
    it('should start processing interval', async () => {
      await processor.start();

      expect((processor as any).processingInterval).not.toBeNull();
    });

    it('should stop processing interval', async () => {
      await processor.start();
      await processor.stop();

      expect((processor as any).processingInterval).toBeNull();
    });
  });
});
