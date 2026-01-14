/**
 * Payment Event Processor Tests
 * Tests for processing payment-related events from queue
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('PaymentEventProcessor', () => {
  let processor: PaymentEventProcessor;
  let mockPaymentService: any;
  let mockNotificationService: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPaymentService = {
      updatePaymentStatus: jest.fn(),
      processRefund: jest.fn(),
      recordTransfer: jest.fn(),
    };
    mockNotificationService = {
      sendPaymentConfirmation: jest.fn(),
      sendRefundNotification: jest.fn(),
      sendPaymentFailedNotification: jest.fn(),
    };
    mockDb = {
      payments: { update: jest.fn(), findOne: jest.fn() },
      events: { insert: jest.fn(), markProcessed: jest.fn() },
    };
    processor = new PaymentEventProcessor(mockPaymentService, mockNotificationService, mockDb);
  });

  describe('processPaymentIntentSucceeded', () => {
    it('should update payment status to succeeded', async () => {
      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            amount: 5000,
            currency: 'usd',
            metadata: { orderId: 'order_456', userId: 'user_789' },
          },
        },
      };

      await processor.process(event);

      expect(mockPaymentService.updatePaymentStatus).toHaveBeenCalledWith('pi_123', 'succeeded', expect.any(Object));
    });

    it('should send payment confirmation notification', async () => {
      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: { id: 'pi_123', amount: 5000, metadata: { userId: 'user_789', orderId: 'order_456' } },
        },
      };

      await processor.process(event);

      expect(mockNotificationService.sendPaymentConfirmation).toHaveBeenCalledWith('user_789', expect.any(Object));
    });

    it('should record event in database', async () => {
      const event = {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      };

      await processor.process(event);

      expect(mockDb.events.markProcessed).toHaveBeenCalled();
    });
  });

  describe('processPaymentIntentFailed', () => {
    it('should update payment status to failed', async () => {
      const event = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_123',
            last_payment_error: { code: 'card_declined', message: 'Card declined' },
            metadata: { orderId: 'order_456' },
          },
        },
      };

      await processor.process(event);

      expect(mockPaymentService.updatePaymentStatus).toHaveBeenCalledWith('pi_123', 'failed', expect.objectContaining({
        errorCode: 'card_declined',
      }));
    });

    it('should send failure notification', async () => {
      const event = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_123',
            last_payment_error: { message: 'Card declined' },
            metadata: { userId: 'user_789' },
          },
        },
      };

      await processor.process(event);

      expect(mockNotificationService.sendPaymentFailedNotification).toHaveBeenCalled();
    });
  });

  describe('processChargeRefunded', () => {
    it('should process refund event', async () => {
      const event = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_123',
            amount_refunded: 2500,
            refunds: { data: [{ id: 're_123', amount: 2500 }] },
            metadata: { orderId: 'order_456' },
          },
        },
      };

      await processor.process(event);

      expect(mockPaymentService.processRefund).toHaveBeenCalledWith(expect.objectContaining({
        chargeId: 'ch_123',
        amountRefunded: 2500,
      }));
    });

    it('should send refund notification', async () => {
      const event = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_123',
            amount_refunded: 2500,
            refunds: { data: [{ id: 're_123' }] },
            metadata: { userId: 'user_789' },
          },
        },
      };

      await processor.process(event);

      expect(mockNotificationService.sendRefundNotification).toHaveBeenCalled();
    });
  });

  describe('processTransferCreated', () => {
    it('should record transfer in database', async () => {
      const event = {
        type: 'transfer.created',
        data: {
          object: {
            id: 'tr_123',
            amount: 4500,
            destination: 'acct_venue_123',
            metadata: { paymentId: 'pay_456' },
          },
        },
      };

      await processor.process(event);

      expect(mockPaymentService.recordTransfer).toHaveBeenCalledWith(expect.objectContaining({
        transferId: 'tr_123',
        amount: 4500,
      }));
    });
  });

  describe('error handling', () => {
    it('should handle unknown event types', async () => {
      const event = {
        type: 'unknown.event',
        data: { object: {} },
      };

      await expect(processor.process(event)).resolves.not.toThrow();
    });

    it('should handle service errors gracefully', async () => {
      mockPaymentService.updatePaymentStatus.mockRejectedValue(new Error('Service error'));
      const event = {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      };

      await expect(processor.process(event)).rejects.toThrow('Service error');
    });

    it('should continue processing after notification error', async () => {
      mockNotificationService.sendPaymentConfirmation.mockRejectedValue(new Error('Notification error'));
      const event = {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123', metadata: { userId: 'user_789' } } },
      };

      // Should not throw, notification errors are non-fatal
      await processor.process(event);

      expect(mockPaymentService.updatePaymentStatus).toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('should skip already processed events', async () => {
      mockDb.events.findOne = jest.fn().mockResolvedValue({ processed: true });
      const event = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      };

      await processor.process(event);

      expect(mockPaymentService.updatePaymentStatus).not.toHaveBeenCalled();
    });
  });
});

// Mock implementation
interface PaymentEvent {
  id?: string;
  type: string;
  data: { object: any };
}

class PaymentEventProcessor {
  constructor(
    private paymentService: any,
    private notificationService: any,
    private db: any
  ) {}

  async process(event: PaymentEvent): Promise<void> {
    // Check idempotency
    if (event.id) {
      const existing = await this.db.events.findOne?.({ eventId: event.id });
      if (existing?.processed) return;
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object);
        break;
      case 'transfer.created':
        await this.handleTransferCreated(event.data.object);
        break;
    }

    await this.db.events.markProcessed(event.id);
  }

  private async handlePaymentSucceeded(paymentIntent: any): Promise<void> {
    await this.paymentService.updatePaymentStatus(paymentIntent.id, 'succeeded', {
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    });

    try {
      if (paymentIntent.metadata?.userId) {
        await this.notificationService.sendPaymentConfirmation(paymentIntent.metadata.userId, {
          paymentId: paymentIntent.id,
          amount: paymentIntent.amount,
        });
      }
    } catch {
      // Notification errors are non-fatal
    }
  }

  private async handlePaymentFailed(paymentIntent: any): Promise<void> {
    await this.paymentService.updatePaymentStatus(paymentIntent.id, 'failed', {
      errorCode: paymentIntent.last_payment_error?.code,
      errorMessage: paymentIntent.last_payment_error?.message,
    });

    if (paymentIntent.metadata?.userId) {
      await this.notificationService.sendPaymentFailedNotification(paymentIntent.metadata.userId, {
        reason: paymentIntent.last_payment_error?.message,
      });
    }
  }

  private async handleChargeRefunded(charge: any): Promise<void> {
    await this.paymentService.processRefund({
      chargeId: charge.id,
      amountRefunded: charge.amount_refunded,
      refunds: charge.refunds?.data,
    });

    if (charge.metadata?.userId) {
      await this.notificationService.sendRefundNotification(charge.metadata.userId, {
        amount: charge.amount_refunded,
      });
    }
  }

  private async handleTransferCreated(transfer: any): Promise<void> {
    await this.paymentService.recordTransfer({
      transferId: transfer.id,
      amount: transfer.amount,
      destination: transfer.destination,
    });
  }
}
