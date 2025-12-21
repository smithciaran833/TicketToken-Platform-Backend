/**
 * Payment Processor Service Integration Tests
 */

import { PaymentProcessorService } from '../../../../src/services/core/payment-processor.service';
import { v4 as uuidv4 } from 'uuid';

// Mock withLock from shared package
jest.mock('@tickettoken/shared', () => ({
  withLock: jest.fn((key, timeout, fn) => fn()),
  LockKeys: {
    userPurchase: (userId: string) => `lock:user:${userId}:purchase`,
  },
}));

describe('PaymentProcessorService Integration Tests', () => {
  let paymentProcessor: PaymentProcessorService;
  let mockStripe: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Stripe
    mockStripe = {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({
          id: 'pi_test_123',
          status: 'requires_confirmation',
          client_secret: 'cs_test_secret',
        }),
        confirm: jest.fn().mockResolvedValue({
          id: 'pi_test_123',
          status: 'succeeded',
        }),
      },
    };

    // Mock database (Knex-style)
    const mockReturning = jest.fn().mockResolvedValue([{
      id: uuidv4(),
      order_id: 'order-123',
      user_id: 'user-123',
      amount: 5000,
      currency: 'usd',
      stripe_payment_intent_id: 'pi_test_123',
      status: 'requires_confirmation',
    }]);

    const mockInsert = jest.fn().mockReturnValue({ returning: mockReturning });
    const mockUpdate = jest.fn().mockResolvedValue(1);
    const mockWhere = jest.fn().mockReturnValue({ update: mockUpdate });

    mockDb = jest.fn().mockReturnValue({
      insert: mockInsert,
      where: mockWhere,
    });

    paymentProcessor = new PaymentProcessorService(mockStripe, mockDb);
  });

  describe('processPayment', () => {
    it('should create payment intent and save transaction', async () => {
      const result = await paymentProcessor.processPayment({
        userId: 'user-123',
        orderId: 'order-123',
        amountCents: 5000,
        currency: 'usd',
        idempotencyKey: 'idem-123',
        tenantId: 'tenant-1',
      });

      expect(result.paymentIntentId).toBe('pi_test_123');
      expect(result.status).toBe('requires_confirmation');
      expect(result.clientSecret).toBe('cs_test_secret');
      expect(result.transactionId).toBeDefined();
    });

    it('should call Stripe with correct parameters', async () => {
      await paymentProcessor.processPayment({
        userId: 'user-456',
        orderId: 'order-456',
        amountCents: 10000,
        currency: 'eur',
        idempotencyKey: 'idem-456',
        tenantId: 'tenant-2',
      });

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        {
          amount: 10000,
          currency: 'eur',
          metadata: {
            orderId: 'order-456',
            userId: 'user-456',
            tenantId: 'tenant-2',
          },
        },
        {
          idempotencyKey: 'idem-456',
        }
      );
    });

    it('should save transaction to database', async () => {
      await paymentProcessor.processPayment({
        userId: 'user-789',
        orderId: 'order-789',
        amountCents: 7500,
        currency: 'usd',
      });

      expect(mockDb).toHaveBeenCalledWith('payment_transactions');
    });

    it('should use default tenant if not provided', async () => {
      await paymentProcessor.processPayment({
        userId: 'user-123',
        orderId: 'order-123',
        amountCents: 5000,
        currency: 'usd',
      });

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tenantId: 'default',
          }),
        }),
        expect.any(Object)
      );
    });

    it('should acquire lock during processing', async () => {
      const { withLock } = require('@tickettoken/shared');

      await paymentProcessor.processPayment({
        userId: 'user-lock',
        orderId: 'order-lock',
        amountCents: 5000,
        currency: 'usd',
      });

      expect(withLock).toHaveBeenCalledWith(
        'lock:user:user-lock:purchase',
        15000,
        expect.any(Function)
      );
    });
  });

  describe('confirmPayment', () => {
    it('should confirm payment intent', async () => {
      const result = await paymentProcessor.confirmPayment('pi_test_123', 'user-123');

      expect(result.status).toBe('succeeded');
      expect(result.confirmedAt).toBeInstanceOf(Date);
    });

    it('should call Stripe confirm', async () => {
      await paymentProcessor.confirmPayment('pi_confirm_test', 'user-123');

      expect(mockStripe.paymentIntents.confirm).toHaveBeenCalledWith('pi_confirm_test');
    });

    it('should update transaction status in database', async () => {
      await paymentProcessor.confirmPayment('pi_test_123', 'user-123');

      expect(mockDb).toHaveBeenCalledWith('payment_transactions');
    });

    it('should acquire lock during confirmation', async () => {
      const { withLock } = require('@tickettoken/shared');

      await paymentProcessor.confirmPayment('pi_test_123', 'user-confirm');

      expect(withLock).toHaveBeenCalledWith(
        'lock:user:user-confirm:purchase',
        10000,
        expect.any(Function)
      );
    });
  });

  describe('error handling', () => {
    it('should propagate Stripe errors', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(new Error('Stripe error'));

      await expect(
        paymentProcessor.processPayment({
          userId: 'user-123',
          orderId: 'order-123',
          amountCents: 5000,
          currency: 'usd',
        })
      ).rejects.toThrow('Stripe error');
    });

    it('should propagate database errors', async () => {
      mockDb.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          returning: jest.fn().mockRejectedValue(new Error('DB error')),
        }),
      });

      await expect(
        paymentProcessor.processPayment({
          userId: 'user-123',
          orderId: 'order-123',
          amountCents: 5000,
          currency: 'usd',
        })
      ).rejects.toThrow('DB error');
    });
  });
});
