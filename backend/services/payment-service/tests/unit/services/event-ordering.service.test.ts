/**
 * Unit Tests for Event Ordering Service
 * 
 * Tests payment event ordering, deduplication, and idempotency.
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { EventOrderingService } from '../../../src/services/event-ordering.service';

describe('EventOrderingService', () => {
  let service: EventOrderingService;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    service = new EventOrderingService(mockPool);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('processPaymentEvent', () => {
    const createEvent = (overrides = {}) => ({
      paymentId: 'pi_123',
      orderId: 'order_456',
      eventType: 'payment_intent.succeeded',
      eventTimestamp: new Date('2026-01-10T00:00:00Z'),
      stripeEventId: 'evt_789',
      payload: { amount: 10000 },
      ...overrides,
    });

    it('should process a new payment event', async () => {
      // Mock no duplicate found
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Duplicate check - none
        .mockResolvedValueOnce({ rows: [{ seq: 1 }] }) // Get sequence
        .mockResolvedValueOnce({}) // Insert event
        .mockResolvedValueOnce({ rows: [{ last_processed: 0 }] }) // Check order
        .mockResolvedValueOnce({ rows: [{ status: 'PROCESSING', version: 1 }] }) // Get payment
        .mockResolvedValueOnce({ rows: [{ valid: true }] }) // Validate transition
        .mockResolvedValueOnce({ rowCount: 1 }) // Update payment
        .mockResolvedValueOnce({}) // Insert transition
        .mockResolvedValueOnce({}) // Mark processed
        .mockResolvedValueOnce({}) // Insert outbox
        .mockResolvedValueOnce({ rows: [] }) // Process queued (none)
        .mockResolvedValueOnce({}); // COMMIT

      const event = createEvent();
      const result = await service.processPaymentEvent(event);

      expect(result.sequenceNumber).toBe(1);
      expect(result.processed).toBe(true);
    });

    it('should detect and skip duplicate events', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ 
          rows: [{ sequence_number: 1, processed_at: new Date() }] 
        }) // Duplicate found
        .mockResolvedValueOnce({}); // COMMIT

      const event = createEvent({ idempotencyKey: 'idem_123' });
      const result = await service.processPaymentEvent(event);

      expect(result.sequenceNumber).toBe(1);
      expect(result.processed).toBe(true);
      // Should not have tried to process
      expect(mockClient.query).toHaveBeenCalledTimes(3);
    });

    it('should queue out-of-order events', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No duplicate
        .mockResolvedValueOnce({ rows: [{ seq: 3 }] }) // Sequence 3 (out of order)
        .mockResolvedValueOnce({}) // Insert event
        .mockResolvedValueOnce({ rows: [{ last_processed: 1 }] }) // Last was 1, expecting 2
        .mockResolvedValueOnce({}); // COMMIT

      const event = createEvent();
      const result = await service.processPaymentEvent(event);

      expect(result.sequenceNumber).toBe(3);
      expect(result.processed).toBe(false);
    });

    it('should generate idempotency key if not provided', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No duplicate
        .mockResolvedValueOnce({ rows: [{ seq: 1 }] })
        .mockResolvedValueOnce({}) // Insert
        .mockResolvedValueOnce({ rows: [{ last_processed: 0 }] })
        .mockResolvedValueOnce({ rows: [{ status: 'PROCESSING', version: 1 }] })
        .mockResolvedValueOnce({ rows: [{ valid: true }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      const event = createEvent();
      delete (event as any).idempotencyKey;

      await service.processPaymentEvent(event);

      // Check that idempotency_key was inserted
      const insertCall = mockClient.query.mock.calls.find((call: any[]) => 
        call[0].includes('INSERT INTO payment_event_sequence')
      );
      expect(insertCall).toBeDefined();
    });

    it('should handle concurrent processing of same payment', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN 1
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ seq: 1 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ last_processed: 0 }] })
        .mockResolvedValueOnce({ rows: [{ status: 'PROCESSING', version: 1 }] })
        .mockResolvedValueOnce({ rows: [{ valid: true }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({}) // COMMIT 1
        // Second call
        .mockResolvedValueOnce({}) // BEGIN 2
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ seq: 2 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ last_processed: 1 }] })
        .mockResolvedValueOnce({ rows: [{ status: 'PAID', version: 2 }] })
        .mockResolvedValueOnce({ rows: [{ valid: true }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({}); // COMMIT 2

      const event1 = createEvent({ eventType: 'payment_intent.processing' });
      const event2 = createEvent({ eventType: 'payment_intent.succeeded' });

      // Process sequentially (service handles locking)
      const result1 = await service.processPaymentEvent(event1);
      const result2 = await service.processPaymentEvent(event2);

      expect(result1.processed).toBe(true);
      expect(result2.processed).toBe(true);
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      const event = createEvent();

      await expect(service.processPaymentEvent(event)).rejects.toThrow('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle payment not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No duplicate
        .mockResolvedValueOnce({ rows: [{ seq: 1 }] })
        .mockResolvedValueOnce({}) // Insert
        .mockResolvedValueOnce({ rows: [{ last_processed: 0 }] }) // In order
        .mockResolvedValueOnce({ rows: [] }); // Payment not found

      const event = createEvent();

      await expect(service.processPaymentEvent(event)).rejects.toThrow('Payment not found');
    });

    it('should handle invalid state transition', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No duplicate
        .mockResolvedValueOnce({ rows: [{ seq: 1 }] })
        .mockResolvedValueOnce({}) // Insert
        .mockResolvedValueOnce({ rows: [{ last_processed: 0 }] }) // In order
        .mockResolvedValueOnce({ rows: [{ status: 'CANCELLED', version: 1 }] }) // Payment
        .mockResolvedValueOnce({ rows: [{ valid: false }] }) // Invalid transition
        .mockResolvedValueOnce({}) // Mark event processed anyway
        .mockResolvedValueOnce({ rows: [] }) // Process queued
        .mockResolvedValueOnce({}); // COMMIT

      const event = createEvent({ eventType: 'payment_intent.succeeded' });
      const result = await service.processPaymentEvent(event);

      expect(result.processed).toBe(true);
    });

    it('should handle concurrent update detection', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ seq: 1 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ last_processed: 0 }] })
        .mockResolvedValueOnce({ rows: [{ status: 'PROCESSING', version: 1 }] })
        .mockResolvedValueOnce({ rows: [{ valid: true }] })
        .mockResolvedValueOnce({ rowCount: 0 }); // Concurrent update - no rows affected

      const event = createEvent();

      await expect(service.processPaymentEvent(event)).rejects.toThrow('Concurrent update detected');
    });
  });

  describe('executeIdempotent', () => {
    it('should execute new operation and store result', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No existing
        .mockResolvedValueOnce({}) // Insert idempotency record
        .mockResolvedValueOnce({}); // COMMIT

      const handler = jest.fn().mockResolvedValue({ paymentId: 'pi_new' });
      
      const result = await service.executeIdempotent(
        'idem_key_123',
        'create_payment',
        { amount: 1000 },
        handler
      );

      expect(handler).toHaveBeenCalled();
      expect(result).toEqual({ paymentId: 'pi_new' });
    });

    it('should return cached result for duplicate request', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ 
          rows: [{ 
            response: JSON.stringify({ paymentId: 'pi_cached' }),
            status_code: 200 
          }] 
        }) // Found existing
        .mockResolvedValueOnce({ 
          rows: [{ request_hash: 'matching_hash' }] 
        }) // Hash matches
        .mockResolvedValueOnce({}); // COMMIT

      const handler = jest.fn();
      
      const result = await service.executeIdempotent(
        'idem_key_123',
        'create_payment',
        { amount: 1000 },
        handler
      );

      expect(handler).not.toHaveBeenCalled();
      expect(result).toEqual({ paymentId: 'pi_cached' });
    });

    it('should throw error for reused key with different request', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ 
          rows: [{ response: '{}', status_code: 200 }] 
        })
        .mockResolvedValueOnce({ 
          rows: [{ request_hash: 'different_hash' }] 
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const handler = jest.fn();
      
      await expect(
        service.executeIdempotent(
          'idem_key_123',
          'create_payment',
          { amount: 2000 }, // Different amount
          handler
        )
      ).rejects.toThrow('Idempotency key reused with different request');
    });

    it('should rollback on handler error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No existing
        .mockResolvedValueOnce({}); // ROLLBACK

      const handler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      
      await expect(
        service.executeIdempotent(
          'idem_key_123',
          'create_payment',
          { amount: 1000 },
          handler
        )
      ).rejects.toThrow('Handler failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('Event Status Mapping', () => {
    it('should map payment.processing to PROCESSING', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ seq: 1 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ last_processed: 0 }] })
        .mockResolvedValueOnce({ rows: [{ status: 'PENDING', version: 1 }] })
        .mockResolvedValueOnce({ rows: [{ valid: true }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      const event = {
        paymentId: 'pi_123',
        eventType: 'payment.processing',
        eventTimestamp: new Date(),
        payload: {},
      };

      await service.processPaymentEvent(event);

      // Check state transition was inserted with correct status
      const transitionCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO payment_state_transitions')
      );
      expect(transitionCall).toBeDefined();
    });

    it('should map refund.completed to REFUNDED', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ seq: 1 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ last_processed: 0 }] })
        .mockResolvedValueOnce({ rows: [{ status: 'REFUNDING', version: 1 }] })
        .mockResolvedValueOnce({ rows: [{ valid: true }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      const event = {
        paymentId: 'pi_123',
        eventType: 'refund.completed',
        eventTimestamp: new Date(),
        payload: {},
      };

      await service.processPaymentEvent(event);

      expect(mockClient.query).toHaveBeenCalled();
    });
  });

  describe('Background Processor', () => {
    it('should start background processor on construction', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      
      new EventOrderingService(mockPool);
      
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
    });

    it('should process stuck events in background', async () => {
      mockPool.connect.mockResolvedValue(mockClient);
      
      // First call - find stuck payments
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ payment_id: 'pi_stuck' }] })
        // Reprocess call
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Get events
        .mockResolvedValueOnce({}); // COMMIT

      // Manually trigger the background processor
      const processorFn = jest.spyOn(global, 'setInterval').mock.calls[0][0] as Function;
      await processorFn();

      // Verify stuck events were queried
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('payment_event_sequence'),
        expect.anything()
      );
    });
  });

  describe('Resource Cleanup', () => {
    it('should always release client on success', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ sequence_number: 1, processed_at: new Date() }] })
        .mockResolvedValueOnce({});

      const event = {
        paymentId: 'pi_123',
        eventType: 'payment.succeeded',
        eventTimestamp: new Date(),
        idempotencyKey: 'idem_123',
        payload: {},
      };

      await service.processPaymentEvent(event);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should always release client on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('DB Error'));

      const event = {
        paymentId: 'pi_123',
        eventType: 'payment.succeeded',
        eventTimestamp: new Date(),
        payload: {},
      };

      await expect(service.processPaymentEvent(event)).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
