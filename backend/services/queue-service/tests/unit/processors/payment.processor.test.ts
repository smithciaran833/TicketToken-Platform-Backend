// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock stripeService
jest.mock('../../../src/services/stripe.service', () => ({
  stripeService: {
    createPaymentIntent: jest.fn(),
  },
}));

// Mock emailService
jest.mock('../../../src/services/email.service', () => ({
  emailService: {
    sendAdminAlert: jest.fn().mockResolvedValue(undefined),
    sendPaymentConfirmation: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock webhookService
jest.mock('../../../src/services/webhook.service', () => ({
  webhookService: {
    sendOperationFailed: jest.fn().mockResolvedValue(undefined),
    sendPaymentCompleted: jest.fn().mockResolvedValue(undefined),
  },
}));

import {
  processPayment,
  onPaymentFailed,
  onPaymentCompleted,
  onPaymentProgress,
  PaymentJobData,
  PaymentJobResult,
} from '../../../src/processors/payment.processor';
import { BullJobData } from '../../../src/adapters/bull-job-adapter';
import { stripeService } from '../../../src/services/stripe.service';
import { emailService } from '../../../src/services/email.service';
import { webhookService } from '../../../src/services/webhook.service';
import { logger } from '../../../src/utils/logger';

describe('PaymentProcessor', () => {
  let mockJob: BullJobData<PaymentJobData>;

  beforeEach(() => {
    mockJob = {
      id: 'payment-job-123',
      name: 'payment',
      data: {
        amount: 9999,
        currency: 'usd',
        customerId: 'cus_abc123',
        orderId: 'order-456',
        userId: 'user-789',
        tenantId: 'tenant-111',
        retryCount: 0,
        metadata: {
          userEmail: 'customer@example.com',
          userName: 'Jane Customer',
          items: [{ name: 'Concert Ticket', quantity: 2 }],
          webhookUrl: 'https://webhook.example.com/payment',
        },
      },
      attemptsMade: 0,
      progress: jest.fn().mockResolvedValue(undefined),
    };

    (stripeService.createPaymentIntent as jest.Mock).mockResolvedValue({
      success: true,
      paymentIntentId: 'pi_test_123',
      status: 'succeeded',
      clientSecret: 'pi_test_123_secret_abc',
    });
  });

  describe('processPayment', () => {
    it('should process payment successfully', async () => {
      const result = await processPayment(mockJob);

      expect(result.success).toBe(true);
      expect(result.paymentIntentId).toBe('pi_test_123');
      expect(result.status).toBe('succeeded');
      expect(result.orderId).toBe('order-456');
      expect(result.userId).toBe('user-789');
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should call stripeService with correct payment data', async () => {
      await processPayment(mockJob);

      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith({
        amount: 9999,
        currency: 'usd',
        customerId: 'cus_abc123',
        metadata: mockJob.data.metadata,
      });
    });

    it('should update job progress to 100% on success', async () => {
      await processPayment(mockJob);

      expect(mockJob.progress).toHaveBeenCalledWith(100);
    });

    it('should log payment processing start', async () => {
      await processPayment(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing payment job',
        expect.objectContaining({
          jobId: 'payment-job-123',
          orderId: 'order-456',
          userId: 'user-789',
          tenantId: 'tenant-111',
          amount: 9999,
          attempt: 1,
        })
      );
    });

    it('should log successful payment', async () => {
      await processPayment(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Payment processed successfully',
        expect.objectContaining({
          jobId: 'payment-job-123',
          orderId: 'order-456',
          paymentIntentId: 'pi_test_123',
          status: 'succeeded',
        })
      );
    });

    it('should throw error when payment fails', async () => {
      (stripeService.createPaymentIntent as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Card declined',
      });

      await expect(processPayment(mockJob)).rejects.toThrow('Card declined');

      expect(logger.error).toHaveBeenCalledWith(
        'Payment processing failed',
        expect.objectContaining({
          jobId: 'payment-job-123',
          orderId: 'order-456',
          error: 'Card declined',
        })
      );
    });

    it('should throw generic error when payment fails without message', async () => {
      (stripeService.createPaymentIntent as jest.Mock).mockResolvedValue({
        success: false,
      });

      await expect(processPayment(mockJob)).rejects.toThrow('Payment processing failed');
    });

    it('should re-throw errors from stripe service', async () => {
      const error = new Error('Stripe API unavailable');
      (stripeService.createPaymentIntent as jest.Mock).mockRejectedValue(error);

      await expect(processPayment(mockJob)).rejects.toThrow('Stripe API unavailable');

      expect(logger.error).toHaveBeenCalledWith(
        'Payment job failed',
        expect.objectContaining({
          jobId: 'payment-job-123',
          orderId: 'order-456',
          userId: 'user-789',
          error: 'Stripe API unavailable',
          attempt: 1,
        })
      );
    });

    it('should handle missing optional fields', async () => {
      mockJob.data = {
        amount: 5000,
        currency: 'eur',
        customerId: 'cus_xyz',
      };

      const result = await processPayment(mockJob);

      expect(result.success).toBe(true);
      expect(result.orderId).toBeUndefined();
      expect(result.userId).toBeUndefined();
    });

    it('should use default retryCount of 0', async () => {
      delete (mockJob.data as any).retryCount;

      await processPayment(mockJob);

      expect(stripeService.createPaymentIntent).toHaveBeenCalled();
    });

    it('should track correct attempt number', async () => {
      mockJob.attemptsMade = 3;

      (stripeService.createPaymentIntent as jest.Mock).mockRejectedValue(
        new Error('Temporary failure')
      );

      await expect(processPayment(mockJob)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Payment job failed',
        expect.objectContaining({
          attempt: 4,
        })
      );
    });

    it('should handle progress function being undefined', async () => {
      mockJob.progress = undefined;

      const result = await processPayment(mockJob);

      expect(result.success).toBe(true);
    });
  });

  describe('onPaymentFailed', () => {
    it('should log permanent failure', async () => {
      const error = new Error('Payment gateway down');
      mockJob.attemptsMade = 10;

      await onPaymentFailed(mockJob, error);

      expect(logger.error).toHaveBeenCalledWith(
        'Payment job failed permanently',
        expect.objectContaining({
          jobId: 'payment-job-123',
          orderId: 'order-456',
          userId: 'user-789',
          tenantId: 'tenant-111',
          error: 'Payment gateway down',
          attempts: 10,
        })
      );
    });

    it('should send admin alert', async () => {
      const error = new Error('Critical payment failure');
      mockJob.attemptsMade = 5;

      await onPaymentFailed(mockJob, error);

      expect(emailService.sendAdminAlert).toHaveBeenCalledWith(
        'Payment Processing Failed',
        'Payment failed after 5 attempts',
        expect.objectContaining({
          jobId: 'payment-job-123',
          orderId: 'order-456',
          userId: 'user-789',
          tenantId: 'tenant-111',
          error: 'Critical payment failure',
          attempts: 5,
        })
      );
    });

    it('should send failure webhook', async () => {
      const error = new Error('Card expired');

      await onPaymentFailed(mockJob, error);

      expect(webhookService.sendOperationFailed).toHaveBeenCalledWith({
        operation: 'payment',
        orderId: 'order-456',
        userId: 'user-789',
        error: 'Card expired',
      });
    });

    it('should handle missing optional data', async () => {
      mockJob.data = {
        amount: 1000,
        currency: 'usd',
        customerId: 'cus_test',
      };
      const error = new Error('Test');

      await onPaymentFailed(mockJob, error);

      expect(webhookService.sendOperationFailed).toHaveBeenCalledWith({
        operation: 'payment',
        orderId: undefined,
        userId: undefined,
        error: 'Test',
      });
    });
  });

  describe('onPaymentCompleted', () => {
    let mockResult: PaymentJobResult;

    beforeEach(() => {
      mockResult = {
        success: true,
        paymentIntentId: 'pi_completed_123',
        status: 'succeeded',
        clientSecret: 'secret_abc',
        orderId: 'order-456',
        userId: 'user-789',
        processingTime: 2500,
      };
    });

    it('should log completion details', async () => {
      await onPaymentCompleted(mockJob, mockResult);

      expect(logger.info).toHaveBeenCalledWith(
        'Payment job completed',
        expect.objectContaining({
          jobId: 'payment-job-123',
          orderId: 'order-456',
          userId: 'user-789',
          tenantId: 'tenant-111',
          paymentIntentId: 'pi_completed_123',
          status: 'succeeded',
          processingTime: 2500,
        })
      );
    });

    it('should send payment confirmation email when user data available', async () => {
      await onPaymentCompleted(mockJob, mockResult);

      expect(emailService.sendPaymentConfirmation).toHaveBeenCalledWith({
        recipientEmail: 'customer@example.com',
        recipientName: 'Jane Customer',
        orderId: 'order-456',
        amount: 9999,
        currency: 'usd',
        paymentIntentId: 'pi_completed_123',
        items: [{ name: 'Concert Ticket', quantity: 2 }],
      });
    });

    it('should not send email when userEmail is missing', async () => {
      mockJob.data.metadata = { webhookUrl: 'https://example.com' };

      await onPaymentCompleted(mockJob, mockResult);

      expect(emailService.sendPaymentConfirmation).not.toHaveBeenCalled();
    });

    it('should not send email when userName is missing', async () => {
      mockJob.data.metadata = {
        userEmail: 'test@example.com',
        webhookUrl: 'https://example.com',
      };

      await onPaymentCompleted(mockJob, mockResult);

      expect(emailService.sendPaymentConfirmation).not.toHaveBeenCalled();
    });

    it('should use N/A for orderId in email when orderId is missing', async () => {
      mockJob.data.orderId = undefined;

      await onPaymentCompleted(mockJob, mockResult);

      expect(emailService.sendPaymentConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'N/A',
        })
      );
    });

    it('should handle non-array items gracefully', async () => {
      mockJob.data.metadata = {
        userEmail: 'user@test.com',
        userName: 'Test User',
        items: 'not-an-array',
      };

      await onPaymentCompleted(mockJob, mockResult);

      expect(emailService.sendPaymentConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          items: undefined,
        })
      );
    });

    it('should send webhook notification', async () => {
      await onPaymentCompleted(mockJob, mockResult);

      expect(webhookService.sendPaymentCompleted).toHaveBeenCalledWith({
        orderId: 'order-456',
        userId: 'user-789',
        amount: 9999,
        currency: 'usd',
        paymentIntentId: 'pi_completed_123',
        webhookUrl: 'https://webhook.example.com/payment',
      });
    });

    it('should handle missing orderId and userId in webhook', async () => {
      mockJob.data.orderId = undefined;
      mockJob.data.userId = undefined;

      await onPaymentCompleted(mockJob, mockResult);

      expect(webhookService.sendPaymentCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: '',
          userId: '',
        })
      );
    });

    it('should handle missing metadata', async () => {
      mockJob.data.metadata = undefined;

      await onPaymentCompleted(mockJob, mockResult);

      expect(emailService.sendPaymentConfirmation).not.toHaveBeenCalled();
      expect(webhookService.sendPaymentCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookUrl: undefined,
        })
      );
    });
  });

  describe('onPaymentProgress', () => {
    it('should log progress', async () => {
      await onPaymentProgress(mockJob, 75);

      expect(logger.debug).toHaveBeenCalledWith(
        'Payment job progress',
        expect.objectContaining({
          jobId: 'payment-job-123',
          orderId: 'order-456',
          progress: 75,
        })
      );
    });

    it('should handle 0 progress', async () => {
      await onPaymentProgress(mockJob, 0);

      expect(logger.debug).toHaveBeenCalledWith(
        'Payment job progress',
        expect.objectContaining({ progress: 0 })
      );
    });

    it('should handle 100 progress', async () => {
      await onPaymentProgress(mockJob, 100);

      expect(logger.debug).toHaveBeenCalledWith(
        'Payment job progress',
        expect.objectContaining({ progress: 100 })
      );
    });

    it('should handle missing orderId', async () => {
      mockJob.data.orderId = undefined;

      await onPaymentProgress(mockJob, 50);

      expect(logger.debug).toHaveBeenCalledWith(
        'Payment job progress',
        expect.objectContaining({
          orderId: undefined,
          progress: 50,
        })
      );
    });
  });
});
