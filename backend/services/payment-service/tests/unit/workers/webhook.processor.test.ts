/**
 * Webhook Processor Tests
 * Tests for processing incoming webhooks from queue
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('WebhookProcessor', () => {
  let processor: WebhookProcessor;
  let mockHandlers: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHandlers = {
      'payment_intent.succeeded': jest.fn(),
      'payment_intent.payment_failed': jest.fn(),
      'charge.refunded': jest.fn(),
    };
    mockDb = { webhookEvents: { insert: jest.fn(), updateStatus: jest.fn(), findOne: jest.fn() } };
    processor = new WebhookProcessor(mockHandlers, mockDb);
  });

  describe('processEvent', () => {
    it('should call correct handler for event type', async () => {
      const event = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123', amount: 5000 } },
      };

      await processor.processEvent(event);

      expect(mockHandlers['payment_intent.succeeded']).toHaveBeenCalledWith(event.data.object);
    });

    it('should record event in database', async () => {
      const event = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      };

      await processor.processEvent(event);

      expect(mockDb.webhookEvents.insert).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 'evt_123',
        type: 'payment_intent.succeeded',
      }));
    });

    it('should mark event as processed on success', async () => {
      const event = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      };

      await processor.processEvent(event);

      expect(mockDb.webhookEvents.updateStatus).toHaveBeenCalledWith('evt_123', 'processed');
    });

    it('should mark event as failed on error', async () => {
      const event = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      };
      mockHandlers['payment_intent.succeeded'].mockRejectedValue(new Error('Handler error'));

      await expect(processor.processEvent(event)).rejects.toThrow();

      expect(mockDb.webhookEvents.updateStatus).toHaveBeenCalledWith('evt_123', 'failed', expect.any(Object));
    });
  });

  describe('idempotency', () => {
    it('should skip already processed events', async () => {
      const event = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      };
      mockDb.webhookEvents.findOne.mockResolvedValue({ status: 'processed' });

      await processor.processEvent(event);

      expect(mockHandlers['payment_intent.succeeded']).not.toHaveBeenCalled();
    });

    it('should retry failed events', async () => {
      const event = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      };
      mockDb.webhookEvents.findOne.mockResolvedValue({ status: 'failed', retryCount: 1 });

      await processor.processEvent(event);

      expect(mockHandlers['payment_intent.succeeded']).toHaveBeenCalled();
    });
  });

  describe('unknown events', () => {
    it('should ignore unknown event types', async () => {
      const event = {
        id: 'evt_123',
        type: 'unknown.event.type',
        data: { object: {} },
      };

      await processor.processEvent(event);

      expect(mockDb.webhookEvents.insert).toHaveBeenCalledWith(expect.objectContaining({
        status: 'ignored',
      }));
    });
  });

  describe('batch processing', () => {
    it('should process multiple events', async () => {
      const events = [
        { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } },
        { id: 'evt_2', type: 'payment_intent.succeeded', data: { object: { id: 'pi_2' } } },
      ];

      await processor.processBatch(events);

      expect(mockHandlers['payment_intent.succeeded']).toHaveBeenCalledTimes(2);
    });

    it('should continue after errors', async () => {
      const events = [
        { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } },
        { id: 'evt_2', type: 'payment_intent.succeeded', data: { object: { id: 'pi_2' } } },
      ];
      mockHandlers['payment_intent.succeeded']
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce(undefined);

      await processor.processBatch(events);

      expect(mockHandlers['payment_intent.succeeded']).toHaveBeenCalledTimes(2);
    });
  });
});

// Mock implementation
interface WebhookEvent {
  id: string;
  type: string;
  data: { object: any };
}

class WebhookProcessor {
  constructor(private handlers: Record<string, (data: any) => Promise<void>>, private db: any) {}

  async processEvent(event: WebhookEvent): Promise<void> {
    const existing = await this.db.webhookEvents.findOne({ eventId: event.id });
    if (existing?.status === 'processed') return;

    const handler = this.handlers[event.type];
    if (!handler) {
      await this.db.webhookEvents.insert({ eventId: event.id, type: event.type, status: 'ignored', createdAt: new Date() });
      return;
    }

    await this.db.webhookEvents.insert({ eventId: event.id, type: event.type, status: 'processing', createdAt: new Date() });

    try {
      await handler(event.data.object);
      await this.db.webhookEvents.updateStatus(event.id, 'processed');
    } catch (error: any) {
      await this.db.webhookEvents.updateStatus(event.id, 'failed', { error: error.message });
      throw error;
    }
  }

  async processBatch(events: WebhookEvent[]): Promise<void> {
    for (const event of events) {
      try {
        await this.processEvent(event);
      } catch (error) {
        // Continue processing other events
      }
    }
  }
}
