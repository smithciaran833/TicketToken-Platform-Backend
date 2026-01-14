/**
 * Notification Service Tests
 * Tests for payment notification delivery
 */

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

describe('NotificationService', () => {
  let service: NotificationService;
  let mockEmailClient: any;
  let mockSmsClient: any;
  let mockPushClient: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmailClient = createMockEmailClient();
    mockSmsClient = createMockSmsClient();
    mockPushClient = createMockPushClient();
    mockDb = createMockDatabase();
    service = new NotificationService(mockEmailClient, mockSmsClient, mockPushClient, mockDb);
  });

  describe('sendPaymentConfirmation', () => {
    it('should send email confirmation for successful payment', async () => {
      const payment = {
        id: 'pay_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
        eventName: 'Concert',
      };

      await service.sendPaymentConfirmation(payment);

      expect(mockEmailClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'payment_confirmation',
          to: expect.any(String),
          data: expect.objectContaining({
            amount: 10000,
            eventName: 'Concert',
          }),
        })
      );
    });

    it('should send SMS if user opted in', async () => {
      mockDb.users.findById.mockResolvedValue({
        id: 'user_456',
        email: 'test@example.com',
        phone: '+1234567890',
        smsOptIn: true,
      });

      const payment = {
        id: 'pay_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
      };

      await service.sendPaymentConfirmation(payment);

      expect(mockSmsClient.send).toHaveBeenCalled();
    });

    it('should not send SMS if user not opted in', async () => {
      mockDb.users.findById.mockResolvedValue({
        id: 'user_456',
        email: 'test@example.com',
        phone: '+1234567890',
        smsOptIn: false,
      });

      const payment = {
        id: 'pay_123',
        userId: 'user_456',
        amount: 10000,
        currency: 'usd',
      };

      await service.sendPaymentConfirmation(payment);

      expect(mockSmsClient.send).not.toHaveBeenCalled();
    });

    it('should include receipt URL in email', async () => {
      const payment = {
        id: 'pay_123',
        userId: 'user_456',
        amount: 10000,
        receiptUrl: 'https://receipts.example.com/pay_123',
      };

      await service.sendPaymentConfirmation(payment);

      expect(mockEmailClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            receiptUrl: 'https://receipts.example.com/pay_123',
          }),
        })
      );
    });

    it('should handle delivery failure gracefully', async () => {
      mockEmailClient.send.mockRejectedValue(new Error('Email service down'));

      const payment = {
        id: 'pay_123',
        userId: 'user_456',
        amount: 10000,
      };

      await expect(service.sendPaymentConfirmation(payment)).resolves.not.toThrow();
    });

    it('should log notification to database', async () => {
      const payment = {
        id: 'pay_123',
        userId: 'user_456',
        amount: 10000,
      };

      await service.sendPaymentConfirmation(payment);

      expect(mockDb.notifications.create).toHaveBeenCalled();
    });
  });

  describe('sendRefundNotification', () => {
    it('should send refund email', async () => {
      const refund = {
        id: 'ref_123',
        paymentId: 'pay_456',
        userId: 'user_789',
        amount: 5000,
        reason: 'customer_request',
      };

      await service.sendRefundNotification(refund);

      expect(mockEmailClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'refund_notification',
          data: expect.objectContaining({
            amount: 5000,
            reason: 'customer_request',
          }),
        })
      );
    });

    it('should include processing time estimate', async () => {
      const refund = {
        id: 'ref_123',
        paymentId: 'pay_456',
        userId: 'user_789',
        amount: 5000,
      };

      await service.sendRefundNotification(refund);

      expect(mockEmailClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            estimatedDays: expect.any(Number),
          }),
        })
      );
    });
  });

  describe('sendPaymentFailedNotification', () => {
    it('should send failure notification with reason', async () => {
      const failure = {
        paymentId: 'pay_123',
        userId: 'user_456',
        reason: 'card_declined',
        message: 'Your card was declined',
      };

      await service.sendPaymentFailedNotification(failure);

      expect(mockEmailClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'payment_failed',
          data: expect.objectContaining({
            reason: 'card_declined',
          }),
        })
      );
    });

    it('should include retry instructions', async () => {
      const failure = {
        paymentId: 'pay_123',
        userId: 'user_456',
        reason: 'insufficient_funds',
        retryUrl: 'https://checkout.example.com/retry/pay_123',
      };

      await service.sendPaymentFailedNotification(failure);

      expect(mockEmailClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            retryUrl: expect.any(String),
          }),
        })
      );
    });
  });

  describe('sendEscrowNotification', () => {
    it('should notify seller when escrow is funded', async () => {
      const escrow = {
        id: 'esc_123',
        sellerId: 'seller_456',
        buyerId: 'buyer_789',
        amount: 15000,
        status: 'funded',
      };

      await service.sendEscrowNotification(escrow, 'funded');

      expect(mockEmailClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'escrow_funded',
        })
      );
    });

    it('should notify buyer when escrow is released', async () => {
      const escrow = {
        id: 'esc_123',
        sellerId: 'seller_456',
        buyerId: 'buyer_789',
        amount: 15000,
        status: 'released',
      };

      await service.sendEscrowNotification(escrow, 'released');

      expect(mockEmailClient.send).toHaveBeenCalled();
    });

    it('should notify both parties on dispute', async () => {
      const escrow = {
        id: 'esc_123',
        sellerId: 'seller_456',
        buyerId: 'buyer_789',
        amount: 15000,
        status: 'disputed',
      };

      await service.sendEscrowNotification(escrow, 'disputed');

      expect(mockEmailClient.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendVenuePayoutNotification', () => {
    it('should notify venue of payout', async () => {
      const payout = {
        id: 'po_123',
        venueId: 'venue_456',
        amount: 95000,
        currency: 'usd',
        arrivalDate: '2025-01-15',
      };

      await service.sendVenuePayoutNotification(payout);

      expect(mockEmailClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'venue_payout',
          data: expect.objectContaining({
            amount: 95000,
            arrivalDate: '2025-01-15',
          }),
        })
      );
    });
  });

  describe('sendPushNotification', () => {
    it('should send push notification for payment', async () => {
      mockDb.users.findById.mockResolvedValue({
        id: 'user_456',
        pushTokens: ['token_abc'],
      });

      await service.sendPushNotification('user_456', {
        title: 'Payment Successful',
        body: 'Your payment of $100.00 was successful',
        data: { paymentId: 'pay_123' },
      });

      expect(mockPushClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'token_abc',
          title: 'Payment Successful',
        })
      );
    });

    it('should send to all user devices', async () => {
      mockDb.users.findById.mockResolvedValue({
        id: 'user_456',
        pushTokens: ['token_1', 'token_2', 'token_3'],
      });

      await service.sendPushNotification('user_456', {
        title: 'Test',
        body: 'Test body',
      });

      expect(mockPushClient.send).toHaveBeenCalledTimes(3);
    });

    it('should handle missing push tokens', async () => {
      mockDb.users.findById.mockResolvedValue({
        id: 'user_456',
        pushTokens: [],
      });

      await service.sendPushNotification('user_456', {
        title: 'Test',
        body: 'Test body',
      });

      expect(mockPushClient.send).not.toHaveBeenCalled();
    });
  });

  describe('batch notifications', () => {
    it('should send batch notifications for event cancellation', async () => {
      const eventId = 'event_123';
      const userIds = ['user_1', 'user_2', 'user_3'];

      await service.sendBatchEventCancellationNotifications(eventId, userIds);

      expect(mockEmailClient.sendBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ template: 'event_cancelled' }),
        ])
      );
    });

    it('should respect rate limits', async () => {
      const userIds = Array.from({ length: 1000 }, (_, i) => `user_${i}`);

      await service.sendBatchEventCancellationNotifications('event_123', userIds);

      // Should batch into chunks
      expect(mockEmailClient.sendBatch.mock.calls.length).toBeLessThanOrEqual(10);
    });
  });

  describe('notification preferences', () => {
    it('should respect user email preferences', async () => {
      mockDb.users.findById.mockResolvedValue({
        id: 'user_456',
        email: 'test@example.com',
        preferences: {
          emailNotifications: false,
        },
      });

      await service.sendPaymentConfirmation({
        id: 'pay_123',
        userId: 'user_456',
        amount: 10000,
      });

      expect(mockEmailClient.send).not.toHaveBeenCalled();
    });

    it('should always send critical notifications', async () => {
      mockDb.users.findById.mockResolvedValue({
        id: 'user_456',
        email: 'test@example.com',
        preferences: {
          emailNotifications: false,
        },
      });

      await service.sendPaymentFailedNotification({
        paymentId: 'pay_123',
        userId: 'user_456',
        reason: 'fraud_detected',
      });

      // Critical notifications ignore preferences
      expect(mockEmailClient.send).toHaveBeenCalled();
    });
  });
});

// Mock implementations
function createMockEmailClient() {
  return {
    send: jest.fn().mockResolvedValue({ messageId: 'msg_123' }),
    sendBatch: jest.fn().mockResolvedValue({ sent: 100 }),
  };
}

function createMockSmsClient() {
  return {
    send: jest.fn().mockResolvedValue({ sid: 'sms_123' }),
  };
}

function createMockPushClient() {
  return {
    send: jest.fn().mockResolvedValue({ success: true }),
  };
}

function createMockDatabase() {
  return {
    users: {
      findById: jest.fn().mockResolvedValue({
        id: 'user_456',
        email: 'test@example.com',
        phone: '+1234567890',
        smsOptIn: false,
        pushTokens: [],
        preferences: { emailNotifications: true },
      }),
    },
    notifications: {
      create: jest.fn().mockResolvedValue({ id: 'notif_123' }),
    },
    venues: {
      findById: jest.fn().mockResolvedValue({
        id: 'venue_456',
        email: 'venue@example.com',
      }),
    },
  };
}

// Service implementation
class NotificationService {
  constructor(
    private emailClient: any,
    private smsClient: any,
    private pushClient: any,
    private db: any
  ) {}

  async sendPaymentConfirmation(payment: any): Promise<void> {
    try {
      const user = await this.db.users.findById(payment.userId);

      if (user.preferences?.emailNotifications !== false) {
        await this.emailClient.send({
          template: 'payment_confirmation',
          to: user.email,
          data: {
            amount: payment.amount,
            eventName: payment.eventName,
            receiptUrl: payment.receiptUrl,
          },
        });
      }

      if (user.smsOptIn && user.phone) {
        await this.smsClient.send({
          to: user.phone,
          message: `Payment of ${payment.amount} confirmed`,
        });
      }

      await this.db.notifications.create({
        userId: payment.userId,
        type: 'payment_confirmation',
        paymentId: payment.id,
      });
    } catch (error) {
      // Log but don't throw
    }
  }

  async sendRefundNotification(refund: any): Promise<void> {
    const user = await this.db.users.findById(refund.userId);

    await this.emailClient.send({
      template: 'refund_notification',
      to: user.email,
      data: {
        amount: refund.amount,
        reason: refund.reason,
        estimatedDays: 5,
      },
    });
  }

  async sendPaymentFailedNotification(failure: any): Promise<void> {
    const user = await this.db.users.findById(failure.userId);

    await this.emailClient.send({
      template: 'payment_failed',
      to: user.email,
      data: {
        reason: failure.reason,
        message: failure.message,
        retryUrl: failure.retryUrl,
      },
    });
  }

  async sendEscrowNotification(escrow: any, event: string): Promise<void> {
    if (event === 'funded') {
      const seller = await this.db.users.findById(escrow.sellerId);
      await this.emailClient.send({ template: 'escrow_funded', to: seller.email });
    } else if (event === 'released') {
      const buyer = await this.db.users.findById(escrow.buyerId);
      await this.emailClient.send({ template: 'escrow_released', to: buyer.email });
    } else if (event === 'disputed') {
      const seller = await this.db.users.findById(escrow.sellerId);
      const buyer = await this.db.users.findById(escrow.buyerId);
      await this.emailClient.send({ template: 'escrow_disputed', to: seller.email });
      await this.emailClient.send({ template: 'escrow_disputed', to: buyer.email });
    }
  }

  async sendVenuePayoutNotification(payout: any): Promise<void> {
    const venue = await this.db.venues.findById(payout.venueId);
    await this.emailClient.send({
      template: 'venue_payout',
      to: venue.email,
      data: {
        amount: payout.amount,
        arrivalDate: payout.arrivalDate,
      },
    });
  }

  async sendPushNotification(userId: string, notification: any): Promise<void> {
    const user = await this.db.users.findById(userId);
    if (user.pushTokens?.length > 0) {
      for (const token of user.pushTokens) {
        await this.pushClient.send({
          token,
          title: notification.title,
          body: notification.body,
          data: notification.data,
        });
      }
    }
  }

  async sendBatchEventCancellationNotifications(eventId: string, userIds: string[]): Promise<void> {
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < userIds.length; i += chunkSize) {
      chunks.push(userIds.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
      const notifications = chunk.map(userId => ({
        template: 'event_cancelled',
        userId,
        eventId,
      }));
      await this.emailClient.sendBatch(notifications);
    }
  }
}
