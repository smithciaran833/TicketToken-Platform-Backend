/**
 * Unit tests for WebhookController
 * Tests Stripe webhook handling with Redis-based idempotency
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

jest.mock('../../../src/services/transfer.service', () => ({
  transferService: {
    completeFiatTransfer: jest.fn()
  }
}));

jest.mock('../../../src/models/transfer.model', () => ({
  transferModel: {
    findByStripePaymentIntentId: jest.fn()
  }
}));

jest.mock('../../../src/services/stripe-payment.service', () => ({
  stripePaymentService: {
    verifyWebhookSignature: jest.fn()
  }
}));

jest.mock('../../../src/config/redis', () => ({
  cache: {
    setNX: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
  }
}));

import { WebhookController, webhookController } from '../../../src/controllers/webhook.controller';
import { transferService } from '../../../src/services/transfer.service';
import { transferModel } from '../../../src/models/transfer.model';
import { stripePaymentService } from '../../../src/services/stripe-payment.service';
import { cache } from '../../../src/config/redis';

describe('WebhookController', () => {
  let controller: WebhookController;
  let mockRequest: any;
  let mockReply: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WebhookController();
    process.env = { ...originalEnv, STRIPE_WEBHOOK_SECRET: 'whsec_test_secret' };

    mockRequest = {
      headers: { 'stripe-signature': 'sig_test' },
      body: 'raw_body'
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };

    (cache.setNX as jest.Mock).mockResolvedValue(true);
    (cache.set as jest.Mock).mockResolvedValue('OK');
    (cache.del as jest.Mock).mockResolvedValue(1);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('handleStripeWebhook', () => {
    describe('Signature Validation', () => {
      it('should return 400 if stripe-signature header missing', async () => {
        mockRequest.headers['stripe-signature'] = undefined;

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Missing stripe-signature header'
        });
      });

      it('should return 500 if STRIPE_WEBHOOK_SECRET not configured', async () => {
        delete process.env.STRIPE_WEBHOOK_SECRET;

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Webhook secret not configured'
        });
      });

      it('should return 400 if signature verification fails', async () => {
        (stripePaymentService.verifyWebhookSignature as jest.Mock).mockImplementation(() => {
          throw new Error('Invalid signature');
        });

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Invalid signature'
        });
      });

      it('should verify signature with correct params', async () => {
        const mockEvent = {
          id: 'evt_123',
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_123' } }
        };
        (stripePaymentService.verifyWebhookSignature as jest.Mock).mockReturnValue(mockEvent);
        (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue(null);

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(stripePaymentService.verifyWebhookSignature).toHaveBeenCalledWith(
          'raw_body',
          'sig_test',
          'whsec_test_secret'
        );
      });
    });

    describe('Idempotency', () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } }
      };

      beforeEach(() => {
        (stripePaymentService.verifyWebhookSignature as jest.Mock).mockReturnValue(mockEvent);
      });

      it('should check Redis for duplicate event using SETNX', async () => {
        (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue(null);

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(cache.setNX).toHaveBeenCalledWith(
          'marketplace:webhook:processed:evt_123',
          'processing',
          3600
        );
      });

      it('should return already_processed if event lock not acquired', async () => {
        (cache.setNX as jest.Mock).mockResolvedValue(false);

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          received: true,
          status: 'already_processed'
        });
      });

      it('should process event if lock acquired', async () => {
        const mockTransfer = { id: 'transfer-001', status: 'pending' };
        (cache.setNX as jest.Mock).mockResolvedValue(true);
        (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue(mockTransfer);

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(transferService.completeFiatTransfer).toHaveBeenCalledWith('transfer-001');
      });

      it('should mark event as processed on success', async () => {
        const mockTransfer = { id: 'transfer-001', status: 'pending' };
        (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue(mockTransfer);

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(cache.set).toHaveBeenCalledWith(
          'marketplace:webhook:processed:evt_123',
          'completed',
          3600
        );
      });

      it('should allow processing if Redis SETNX fails (fail open)', async () => {
        const mockTransfer = { id: 'transfer-001', status: 'pending' };
        (cache.setNX as jest.Mock).mockRejectedValue(new Error('Redis down'));
        (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue(mockTransfer);

        await controller.handleStripeWebhook(mockRequest, mockReply);

        // Should still process the event
        expect(transferService.completeFiatTransfer).toHaveBeenCalled();
      });
    });

    describe('payment_intent.succeeded', () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } }
      };

      beforeEach(() => {
        (stripePaymentService.verifyWebhookSignature as jest.Mock).mockReturnValue(mockEvent);
        (cache.setNX as jest.Mock).mockResolvedValue(true);
      });

      it('should look up transfer by PaymentIntent ID', async () => {
        (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue(null);

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(transferModel.findByStripePaymentIntentId).toHaveBeenCalledWith('pi_123');
      });

      it('should return 404 if transfer not found', async () => {
        (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue(null);

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Transfer not found'
        });
      });

      it('should return already_completed if transfer already done', async () => {
        (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue({
          id: 'transfer-001',
          status: 'completed'
        });

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          received: true,
          status: 'already_completed'
        });
      });

      it('should complete fiat transfer for pending transfer', async () => {
        (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue({
          id: 'transfer-001',
          status: 'pending_payment'
        });

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(transferService.completeFiatTransfer).toHaveBeenCalledWith('transfer-001');
      });

      it('should return success response with transfer ID', async () => {
        (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue({
          id: 'transfer-001',
          status: 'pending_payment'
        });

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          received: true,
          transferId: 'transfer-001'
        });
      });

      it('should return 500 on processing error', async () => {
        (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue({
          id: 'transfer-001',
          status: 'pending_payment'
        });
        (transferService.completeFiatTransfer as jest.Mock).mockRejectedValue(
          new Error('Processing failed')
        );

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Processing failed'
        });
      });
    });

    describe('Unhandled Event Types', () => {
      it('should return unhandled_event_type for unknown events', async () => {
        const mockEvent = {
          id: 'evt_123',
          type: 'charge.refunded',
          data: { object: {} }
        };
        (stripePaymentService.verifyWebhookSignature as jest.Mock).mockReturnValue(mockEvent);
        (cache.setNX as jest.Mock).mockResolvedValue(true);

        await controller.handleStripeWebhook(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          received: true,
          status: 'unhandled_event_type'
        });
      });
    });
  });

  describe('handlePaymentCompleted (legacy)', () => {
    const mockBody = {
      paymentIntentId: 'pi_123',
      listingId: 'listing-001',
      buyerId: 'buyer-001',
      sellerId: 'seller-001',
      amount: 10000,
      currency: 'usd'
    };

    beforeEach(() => {
      mockRequest.body = mockBody;
    });

    it('should look up transfer by PaymentIntent ID', async () => {
      (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue(null);

      await controller.handlePaymentCompleted(mockRequest, mockReply);

      expect(transferModel.findByStripePaymentIntentId).toHaveBeenCalledWith('pi_123');
    });

    it('should return 404 if transfer not found', async () => {
      (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue(null);

      await controller.handlePaymentCompleted(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Transfer not found'
      });
    });

    it('should complete fiat transfer', async () => {
      (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue({
        id: 'transfer-001'
      });

      await controller.handlePaymentCompleted(mockRequest, mockReply);

      expect(transferService.completeFiatTransfer).toHaveBeenCalledWith('transfer-001', undefined);
    });

    it('should pass transferDestination if provided', async () => {
      mockRequest.body = { ...mockBody, transferDestination: 'acct_dest' };
      (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue({
        id: 'transfer-001'
      });

      await controller.handlePaymentCompleted(mockRequest, mockReply);

      expect(transferService.completeFiatTransfer).toHaveBeenCalledWith('transfer-001', 'acct_dest');
    });

    it('should return success with transfer ID', async () => {
      (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue({
        id: 'transfer-001'
      });

      await controller.handlePaymentCompleted(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        transferId: 'transfer-001'
      });
    });

    it('should return 500 on error', async () => {
      (transferModel.findByStripePaymentIntentId as jest.Mock).mockResolvedValue({
        id: 'transfer-001'
      });
      (transferService.completeFiatTransfer as jest.Mock).mockRejectedValue(
        new Error('Transfer failed')
      );

      await controller.handlePaymentCompleted(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Transfer failed'
      });
    });
  });

  describe('Singleton export', () => {
    it('should export singleton instance', () => {
      expect(webhookController).toBeInstanceOf(WebhookController);
    });
  });
});
