import { processPayment, onPaymentCompleted, onPaymentFailed } from '../../src/processors/payment.processor';

// Mock dependencies
jest.mock('../../src/services/stripe.service');
jest.mock('../../src/services/email.service');
jest.mock('../../src/services/webhook.service');

import { stripeService } from '../../src/services/stripe.service';
import { emailService } from '../../src/services/email.service';
import { webhookService } from '../../src/services/webhook.service';

describe('Payment Processor Integration', () => {
  const mockJob: any = {
    id: 'job-123',
    attemptsMade: 0,
    data: {
      amount: 5000,
      currency: 'usd',
      orderId: 'order-123',
      userId: 'user-123',
      tenantId: 'tenant-123',
      metadata: {
        userEmail: 'test@example.com',
        userName: 'Test User',
      },
    },
    progress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processPayment', () => {
    it('should process payment successfully', async () => {
      const mockResult = {
        success: true,
        paymentIntentId: 'pi_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
        clientSecret: 'secret_123',
      };

      (stripeService.createPaymentIntent as jest.Mock).mockResolvedValue(mockResult);

      const result = await processPayment(mockJob);

      expect(result.success).toBe(true);
      expect(result.paymentIntentId).toBe('pi_123');
      expect(result.orderId).toBe('order-123');
      expect(mockJob.progress).toHaveBeenCalledWith(100);
    });

    it('should throw error on payment failure', async () => {
      const mockResult = {
        success: false,
        error: 'Payment failed',
      };

      (stripeService.createPaymentIntent as jest.Mock).mockResolvedValue(mockResult);

      await expect(processPayment(mockJob)).rejects.toThrow('Payment failed');
    });

    it('should handle unexpected errors', async () => {
      (stripeService.createPaymentIntent as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      await expect(processPayment(mockJob)).rejects.toThrow('Network error');
    });
  });

  describe('onPaymentCompleted', () => {
    it('should send notifications on payment completion', async () => {
      const mockResult = {
        success: true,
        paymentIntentId: 'pi_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
        orderId: 'order-123',
        userId: 'user-123',
        processingTime: 1000,
      };

      (emailService.sendPaymentConfirmation as jest.Mock).mockResolvedValue(true);
      (webhookService.sendPaymentCompleted as jest.Mock).mockResolvedValue(true);

      await onPaymentCompleted(mockJob, mockResult);

      expect(emailService.sendPaymentConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: 'test@example.com',
          recipientName: 'Test User',
          orderId: 'order-123',
          amount: 5000,
        })
      );

      expect(webhookService.sendPaymentCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-123',
          userId: 'user-123',
          paymentIntentId: 'pi_123',
        })
      );
    });

    it('should handle missing user metadata gracefully', async () => {
      const jobWithoutMetadata = {
        ...mockJob,
        data: {
          ...mockJob.data,
          metadata: {},
        },
      };

      const mockResult = {
        success: true,
        paymentIntentId: 'pi_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
        processingTime: 1000,
      };

      await onPaymentCompleted(jobWithoutMetadata, mockResult);

      expect(emailService.sendPaymentConfirmation).not.toHaveBeenCalled();
      expect(webhookService.sendPaymentCompleted).toHaveBeenCalled();
    });
  });

  describe('onPaymentFailed', () => {
    it('should send failure notifications', async () => {
      const error = new Error('Payment processing failed');
      const failedJob = {
        ...mockJob,
        attemptsMade: 3,
      };

      (emailService.sendAdminAlert as jest.Mock).mockResolvedValue(true);
      (webhookService.sendOperationFailed as jest.Mock).mockResolvedValue(true);

      await onPaymentFailed(failedJob, error);

      expect(emailService.sendAdminAlert).toHaveBeenCalledWith(
        'Payment Processing Failed',
        expect.stringContaining('3 attempts'),
        expect.objectContaining({
          orderId: 'order-123',
          error: 'Payment processing failed',
        })
      );

      expect(webhookService.sendOperationFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'payment',
          error: 'Payment processing failed',
        })
      );
    });
  });
});
