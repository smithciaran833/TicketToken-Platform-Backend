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
    createRefund: jest.fn(),
  },
}));

// Mock emailService
jest.mock('../../../src/services/email.service', () => ({
  emailService: {
    sendAdminAlert: jest.fn().mockResolvedValue(undefined),
    sendRefundConfirmation: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock webhookService
jest.mock('../../../src/services/webhook.service', () => ({
  webhookService: {
    sendOperationFailed: jest.fn().mockResolvedValue(undefined),
    sendRefundCompleted: jest.fn().mockResolvedValue(undefined),
  },
}));

import {
  processRefund,
  onRefundFailed,
  onRefundCompleted,
  onRefundProgress,
  RefundJobData,
  RefundJobResult,
} from '../../../src/processors/refund.processor';
import { BullJobData } from '../../../src/adapters/bull-job-adapter';
import { stripeService } from '../../../src/services/stripe.service';
import { emailService } from '../../../src/services/email.service';
import { webhookService } from '../../../src/services/webhook.service';
import { logger } from '../../../src/utils/logger';

describe('RefundProcessor', () => {
  let mockJob: BullJobData<RefundJobData>;

  beforeEach(() => {
    mockJob = {
      id: 'refund-job-123',
      name: 'refund',
      data: {
        paymentIntentId: 'pi_original_123',
        amount: 5000,
        reason: 'requested_by_customer',
        orderId: 'order-456',
        userId: 'user-789',
        tenantId: 'tenant-111',
        refundReason: 'Customer requested cancellation',
        metadata: {
          userEmail: 'refund@example.com',
          userName: 'Refund Customer',
          refundReason: 'Event cancelled',
          webhookUrl: 'https://webhook.example.com/refund',
        },
      },
      attemptsMade: 0,
      progress: jest.fn().mockResolvedValue(undefined),
    };

    (stripeService.createRefund as jest.Mock).mockResolvedValue({
      success: true,
      refundId: 're_test_123',
      status: 'succeeded',
      amount: 5000,
      currency: 'usd',
    });
  });

  describe('processRefund', () => {
    it('should process refund successfully', async () => {
      const result = await processRefund(mockJob);

      expect(result.success).toBe(true);
      expect(result.refundId).toBe('re_test_123');
      expect(result.status).toBe('succeeded');
      expect(result.amount).toBe(5000);
      expect(result.currency).toBe('usd');
      expect(result.orderId).toBe('order-456');
      expect(result.userId).toBe('user-789');
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should call stripeService.createRefund with correct data', async () => {
      await processRefund(mockJob);

      expect(stripeService.createRefund).toHaveBeenCalledWith({
        paymentIntentId: 'pi_original_123',
        amount: 5000,
        reason: 'requested_by_customer',
        metadata: mockJob.data.metadata,
      });
    });

    it('should update job progress to 100% on success', async () => {
      await processRefund(mockJob);

      expect(mockJob.progress).toHaveBeenCalledWith(100);
    });

    it('should log refund processing start', async () => {
      await processRefund(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing refund job',
        expect.objectContaining({
          jobId: 'refund-job-123',
          orderId: 'order-456',
          userId: 'user-789',
          tenantId: 'tenant-111',
          paymentIntentId: 'pi_original_123',
          amount: 5000,
          reason: 'requested_by_customer',
          attempt: 1,
        })
      );
    });

    it('should log successful refund', async () => {
      await processRefund(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Refund processed successfully',
        expect.objectContaining({
          jobId: 'refund-job-123',
          orderId: 'order-456',
          refundId: 're_test_123',
          status: 'succeeded',
          amount: 5000,
        })
      );
    });

    it('should throw error when refund fails', async () => {
      (stripeService.createRefund as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Charge already refunded',
      });

      await expect(processRefund(mockJob)).rejects.toThrow('Charge already refunded');

      expect(logger.error).toHaveBeenCalledWith(
        'Refund processing failed',
        expect.objectContaining({
          jobId: 'refund-job-123',
          orderId: 'order-456',
          error: 'Charge already refunded',
        })
      );
    });

    it('should throw generic error when refund fails without message', async () => {
      (stripeService.createRefund as jest.Mock).mockResolvedValue({
        success: false,
      });

      await expect(processRefund(mockJob)).rejects.toThrow('Refund processing failed');
    });

    it('should re-throw errors from stripe service', async () => {
      const error = new Error('Stripe connection timeout');
      (stripeService.createRefund as jest.Mock).mockRejectedValue(error);

      await expect(processRefund(mockJob)).rejects.toThrow('Stripe connection timeout');

      expect(logger.error).toHaveBeenCalledWith(
        'Refund job failed',
        expect.objectContaining({
          jobId: 'refund-job-123',
          orderId: 'order-456',
          userId: 'user-789',
          error: 'Stripe connection timeout',
          attempt: 1,
        })
      );
    });

    it('should handle missing optional fields', async () => {
      mockJob.data = {
        paymentIntentId: 'pi_min_123',
        amount: 1000,
        reason: 'duplicate',
      };

      const result = await processRefund(mockJob);

      expect(result.success).toBe(true);
      expect(result.orderId).toBeUndefined();
      expect(result.userId).toBeUndefined();
    });

    it('should track correct attempt number', async () => {
      mockJob.attemptsMade = 2;

      (stripeService.createRefund as jest.Mock).mockRejectedValue(
        new Error('Temporary error')
      );

      await expect(processRefund(mockJob)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Refund job failed',
        expect.objectContaining({
          attempt: 3,
        })
      );
    });

    it('should handle progress function being undefined', async () => {
      mockJob.progress = undefined;

      const result = await processRefund(mockJob);

      expect(result.success).toBe(true);
    });

    it('should handle undefined attemptsMade', async () => {
      mockJob.attemptsMade = undefined as any;

      await processRefund(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing refund job',
        expect.objectContaining({
          attempt: 1,
        })
      );
    });
  });

  describe('onRefundFailed', () => {
    it('should log permanent failure', async () => {
      const error = new Error('Refund gateway unavailable');
      mockJob.attemptsMade = 8;

      await onRefundFailed(mockJob, error);

      expect(logger.error).toHaveBeenCalledWith(
        'Refund job failed permanently',
        expect.objectContaining({
          jobId: 'refund-job-123',
          orderId: 'order-456',
          userId: 'user-789',
          tenantId: 'tenant-111',
          paymentIntentId: 'pi_original_123',
          error: 'Refund gateway unavailable',
          attempts: 8,
        })
      );
    });

    it('should send admin alert', async () => {
      const error = new Error('Critical refund error');
      mockJob.attemptsMade = 5;

      await onRefundFailed(mockJob, error);

      expect(emailService.sendAdminAlert).toHaveBeenCalledWith(
        'Refund Processing Failed',
        'Refund failed after 5 attempts',
        expect.objectContaining({
          jobId: 'refund-job-123',
          orderId: 'order-456',
          userId: 'user-789',
          tenantId: 'tenant-111',
          paymentIntentId: 'pi_original_123',
          error: 'Critical refund error',
          attempts: 5,
        })
      );
    });

    it('should send failure webhook', async () => {
      const error = new Error('Insufficient balance');

      await onRefundFailed(mockJob, error);

      expect(webhookService.sendOperationFailed).toHaveBeenCalledWith({
        operation: 'refund',
        orderId: 'order-456',
        userId: 'user-789',
        error: 'Insufficient balance',
      });
    });

    it('should handle missing optional data', async () => {
      mockJob.data = {
        paymentIntentId: 'pi_test',
        amount: 500,
        reason: 'test',
      };
      const error = new Error('Test error');

      await onRefundFailed(mockJob, error);

      expect(webhookService.sendOperationFailed).toHaveBeenCalledWith({
        operation: 'refund',
        orderId: undefined,
        userId: undefined,
        error: 'Test error',
      });
    });
  });

  describe('onRefundCompleted', () => {
    let mockResult: RefundJobResult;

    beforeEach(() => {
      mockResult = {
        success: true,
        refundId: 're_completed_456',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
        orderId: 'order-456',
        userId: 'user-789',
        processingTime: 1800,
      };
    });

    it('should log completion details', async () => {
      await onRefundCompleted(mockJob, mockResult);

      expect(logger.info).toHaveBeenCalledWith(
        'Refund job completed',
        expect.objectContaining({
          jobId: 'refund-job-123',
          orderId: 'order-456',
          userId: 'user-789',
          tenantId: 'tenant-111',
          refundId: 're_completed_456',
          status: 'succeeded',
          amount: 5000,
          processingTime: 1800,
        })
      );
    });

    it('should send refund confirmation email when user data available', async () => {
      await onRefundCompleted(mockJob, mockResult);

      expect(emailService.sendRefundConfirmation).toHaveBeenCalledWith({
        recipientEmail: 'refund@example.com',
        recipientName: 'Refund Customer',
        orderId: 'order-456',
        amount: 5000,
        currency: 'usd',
        refundId: 're_completed_456',
        reason: 'Event cancelled',
      });
    });

    it('should not send email when userEmail is missing', async () => {
      mockJob.data.metadata = { webhookUrl: 'https://example.com' };

      await onRefundCompleted(mockJob, mockResult);

      expect(emailService.sendRefundConfirmation).not.toHaveBeenCalled();
    });

    it('should not send email when userName is missing', async () => {
      mockJob.data.metadata = {
        userEmail: 'test@example.com',
        webhookUrl: 'https://example.com',
      };

      await onRefundCompleted(mockJob, mockResult);

      expect(emailService.sendRefundConfirmation).not.toHaveBeenCalled();
    });

    it('should use N/A for orderId in email when orderId is missing', async () => {
      mockJob.data.orderId = undefined;

      await onRefundCompleted(mockJob, mockResult);

      expect(emailService.sendRefundConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'N/A',
        })
      );
    });

    it('should send webhook notification', async () => {
      await onRefundCompleted(mockJob, mockResult);

      expect(webhookService.sendRefundCompleted).toHaveBeenCalledWith({
        orderId: 'order-456',
        userId: 'user-789',
        amount: 5000,
        currency: 'usd',
        refundId: 're_completed_456',
        webhookUrl: 'https://webhook.example.com/refund',
      });
    });

    it('should handle missing orderId and userId in webhook', async () => {
      mockJob.data.orderId = undefined;
      mockJob.data.userId = undefined;

      await onRefundCompleted(mockJob, mockResult);

      expect(webhookService.sendRefundCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: '',
          userId: '',
        })
      );
    });

    it('should handle missing metadata', async () => {
      mockJob.data.metadata = undefined;

      await onRefundCompleted(mockJob, mockResult);

      expect(emailService.sendRefundConfirmation).not.toHaveBeenCalled();
      expect(webhookService.sendRefundCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookUrl: undefined,
        })
      );
    });

    it('should handle undefined refundReason in metadata', async () => {
      mockJob.data.metadata = {
        userEmail: 'user@test.com',
        userName: 'Test User',
      };

      await onRefundCompleted(mockJob, mockResult);

      expect(emailService.sendRefundConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: undefined,
        })
      );
    });
  });

  describe('onRefundProgress', () => {
    it('should log progress', async () => {
      await onRefundProgress(mockJob, 60);

      expect(logger.debug).toHaveBeenCalledWith(
        'Refund job progress',
        expect.objectContaining({
          jobId: 'refund-job-123',
          orderId: 'order-456',
          progress: 60,
        })
      );
    });

    it('should handle 0 progress', async () => {
      await onRefundProgress(mockJob, 0);

      expect(logger.debug).toHaveBeenCalledWith(
        'Refund job progress',
        expect.objectContaining({ progress: 0 })
      );
    });

    it('should handle 100 progress', async () => {
      await onRefundProgress(mockJob, 100);

      expect(logger.debug).toHaveBeenCalledWith(
        'Refund job progress',
        expect.objectContaining({ progress: 100 })
      );
    });

    it('should handle missing orderId', async () => {
      mockJob.data.orderId = undefined;

      await onRefundProgress(mockJob, 25);

      expect(logger.debug).toHaveBeenCalledWith(
        'Refund job progress',
        expect.objectContaining({
          orderId: undefined,
          progress: 25,
        })
      );
    });
  });
});
