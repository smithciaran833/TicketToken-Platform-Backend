import { PaymentProcessorService } from '../../../../src/services/core/payment-processor.service';
import { v4 as uuidv4 } from 'uuid';

// Mock the shared library
jest.mock('@tickettoken/shared', () => ({
  withLock: jest.fn((key, timeout, fn) => fn()),
  LockKeys: {
    userPurchase: (userId: string) => `lock:user:${userId}`
  }
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

describe('PaymentProcessorService', () => {
  let service: PaymentProcessorService;
  let mockStripe: any;
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock Stripe
    mockStripe = {
      paymentIntents: {
        create: jest.fn(),
        confirm: jest.fn(),
        retrieve: jest.fn()
      }
    };

    // Mock Database (Knex-style)
    const mockReturning = jest.fn().mockResolvedValue([{
      id: 'txn_123',
      order_id: 'order_123',
      user_id: 'user_123',
      amount: 5000,
      status: 'succeeded'
    }]);

    const mockInsert = jest.fn().mockReturnValue({ returning: mockReturning });
    const mockUpdate = jest.fn().mockResolvedValue(1);
    const mockWhere = jest.fn().mockReturnValue({ update: mockUpdate });

    mockDb = jest.fn((table: string) => ({
      insert: mockInsert,
      where: mockWhere,
      update: mockUpdate
    }));

    service = new PaymentProcessorService(mockStripe, mockDb);
  });

  describe('processPayment', () => {
    const validPaymentData = {
      userId: 'user_123',
      orderId: 'order_123',
      amountCents: 5000,
      currency: 'usd',
      idempotencyKey: 'idem_123',
      tenantId: 'tenant_123'
    };

    it('should create payment intent with correct parameters', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        status: 'requires_payment_method',
        client_secret: 'secret_123'
      });

      await service.processPayment(validPaymentData);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        {
          amount: 5000,
          currency: 'usd',
          metadata: {
            orderId: 'order_123',
            userId: 'user_123',
            tenantId: 'tenant_123'
          }
        },
        { idempotencyKey: 'idem_123' }
      );
    });

    it('should insert transaction record into database', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        status: 'requires_payment_method',
        client_secret: 'secret_123'
      });

      await service.processPayment(validPaymentData);

      const insertCall = mockDb().insert;
      expect(insertCall).toHaveBeenCalled();
      const insertedData = insertCall.mock.calls[0][0];
      
      expect(insertedData).toMatchObject({
        order_id: 'order_123',
        user_id: 'user_123',
        amount: 5000,
        currency: 'usd',
        stripe_payment_intent_id: 'pi_123',
        status: 'requires_payment_method',
        idempotency_key: 'idem_123',
        tenant_id: 'tenant_123'
      });
      expect(insertedData.id).toBeTruthy();
      expect(insertedData.created_at).toBeInstanceOf(Date);
    });

    it('should return transaction details with payment intent info', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        status: 'requires_payment_method',
        client_secret: 'secret_123'
      });

      const result = await service.processPayment(validPaymentData);

      expect(result).toEqual({
        transactionId: 'txn_123',
        paymentIntentId: 'pi_123',
        status: 'requires_payment_method',
        clientSecret: 'secret_123'
      });
    });

    it('should use default tenant when tenantId not provided', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        status: 'requires_payment_method',
        client_secret: 'secret_123'
      });

      const dataWithoutTenant = { ...validPaymentData };
      delete dataWithoutTenant.tenantId;

      await service.processPayment(dataWithoutTenant);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tenantId: 'default'
          })
        }),
        expect.anything()
      );
    });

    it('should handle Stripe API errors', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(
        new Error('Stripe API error: Invalid amount')
      );

      await expect(service.processPayment(validPaymentData))
        .rejects
        .toThrow('Stripe API error: Invalid amount');
    });

    it('should handle database errors', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        status: 'requires_payment_method',
        client_secret: 'secret_123'
      });

      // Make database insert fail
      mockDb().insert().returning.mockRejectedValue(
        new Error('Database connection error')
      );

      await expect(service.processPayment(validPaymentData))
        .rejects
        .toThrow('Database connection error');
    });

    it('should acquire lock for user purchase', async () => {
      const { withLock, LockKeys } = require('@tickettoken/shared');
      
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        status: 'requires_payment_method',
        client_secret: 'secret_123'
      });

      await service.processPayment(validPaymentData);

      expect(withLock).toHaveBeenCalledWith(
        LockKeys.userPurchase('user_123'),
        15000,
        expect.any(Function)
      );
    });

    it('should handle zero amount payments', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        status: 'succeeded',
        client_secret: 'secret_123'
      });

      const zeroAmountData = { ...validPaymentData, amountCents: 0 };
      await service.processPayment(zeroAmountData);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 0 }),
        expect.anything()
      );
    });

    it('should handle large amount payments', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        status: 'requires_payment_method',
        client_secret: 'secret_123'
      });

      const largeAmountData = { ...validPaymentData, amountCents: 999999999 };
      await service.processPayment(largeAmountData);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 999999999 }),
        expect.anything()
      );
    });

    it('should pass idempotency key to Stripe', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        status: 'requires_payment_method',
        client_secret: 'secret_123'
      });

      await service.processPayment(validPaymentData);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.anything(),
        { idempotencyKey: 'idem_123' }
      );
    });
  });

  describe('confirmPayment', () => {
    const paymentIntentId = 'pi_123';
    const userId = 'user_123';

    it('should confirm payment intent in Stripe', async () => {
      mockStripe.paymentIntents.confirm.mockResolvedValue({
        id: 'pi_123',
        status: 'succeeded'
      });

      await service.confirmPayment(paymentIntentId, userId);

      expect(mockStripe.paymentIntents.confirm).toHaveBeenCalledWith('pi_123');
    });

    it('should update transaction status in database', async () => {
      mockStripe.paymentIntents.confirm.mockResolvedValue({
        id: 'pi_123',
        status: 'succeeded'
      });

      await service.confirmPayment(paymentIntentId, userId);

      const whereCall = mockDb().where;
      const updateCall = whereCall().update;

      expect(whereCall).toHaveBeenCalledWith({
        stripe_payment_intent_id: 'pi_123'
      });
      
      expect(updateCall).toHaveBeenCalled();
      const updateData = updateCall.mock.calls[0][0];
      expect(updateData.status).toBe('succeeded');
      expect(updateData.confirmed_at).toBeInstanceOf(Date);
    });

    it('should return confirmation details', async () => {
      mockStripe.paymentIntents.confirm.mockResolvedValue({
        id: 'pi_123',
        status: 'succeeded'
      });

      const result = await service.confirmPayment(paymentIntentId, userId);

      expect(result).toMatchObject({
        status: 'succeeded'
      });
      expect(result.confirmedAt).toBeInstanceOf(Date);
    });

    it('should acquire lock for user purchase', async () => {
      const { withLock, LockKeys } = require('@tickettoken/shared');
      
      mockStripe.paymentIntents.confirm.mockResolvedValue({
        id: 'pi_123',
        status: 'succeeded'
      });

      await service.confirmPayment(paymentIntentId, userId);

      expect(withLock).toHaveBeenCalledWith(
        LockKeys.userPurchase(userId),
        10000,
        expect.any(Function)
      );
    });

    it('should handle Stripe confirmation errors', async () => {
      mockStripe.paymentIntents.confirm.mockRejectedValue(
        new Error('Payment method declined')
      );

      await expect(service.confirmPayment(paymentIntentId, userId))
        .rejects
        .toThrow('Payment method declined');
    });

    it('should handle database update errors', async () => {
      mockStripe.paymentIntents.confirm.mockResolvedValue({
        id: 'pi_123',
        status: 'succeeded'
      });

      mockDb().where().update.mockRejectedValue(
        new Error('Database error')
      );

      await expect(service.confirmPayment(paymentIntentId, userId))
        .rejects
        .toThrow('Database error');
    });

    it('should handle payment intent not found', async () => {
      mockStripe.paymentIntents.confirm.mockRejectedValue(
        new Error('No such payment_intent: pi_invalid')
      );

      await expect(service.confirmPayment('pi_invalid', userId))
        .rejects
        .toThrow('No such payment_intent');
    });

    it('should handle different confirmation statuses', async () => {
      const statuses = ['succeeded', 'processing', 'requires_action', 'canceled'];

      for (const status of statuses) {
        jest.clearAllMocks();
        
        mockStripe.paymentIntents.confirm.mockResolvedValue({
          id: 'pi_123',
          status
        });

        const result = await service.confirmPayment(paymentIntentId, userId);
        expect(result.status).toBe(status);
      }
    });

    it('should use shorter timeout for confirmation lock', async () => {
      const { withLock } = require('@tickettoken/shared');
      
      mockStripe.paymentIntents.confirm.mockResolvedValue({
        id: 'pi_123',
        status: 'succeeded'
      });

      await service.confirmPayment(paymentIntentId, userId);

      // Confirmation uses 10s timeout vs 15s for process
      expect(withLock).toHaveBeenCalledWith(
        expect.anything(),
        10000,
        expect.any(Function)
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent payment attempts with lock', async () => {
      const { withLock } = require('@tickettoken/shared');
      let lockCallCount = 0;

      withLock.mockImplementation(async (key, timeout, fn) => {
        lockCallCount++;
        if (lockCallCount === 1) {
          // First call succeeds
          return fn();
        } else {
          // Second call waits for lock
          await new Promise(resolve => setTimeout(resolve, 100));
          return fn();
        }
      });

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        status: 'requires_payment_method',
        client_secret: 'secret_123'
      });

      const data = {
        userId: 'user_123',
        orderId: 'order_123',
        amountCents: 5000,
        currency: 'usd'
      };

      // Simulate concurrent calls
      await Promise.all([
        service.processPayment(data),
        service.processPayment(data)
      ]);

      expect(withLock).toHaveBeenCalledTimes(2);
    });
  });
});
