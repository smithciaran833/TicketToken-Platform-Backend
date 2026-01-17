// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('axios');

import axios from 'axios';
import { WebhookService } from '../../../src/services/webhook.service';
import { logger } from '../../../src/utils/logger';

describe('WebhookService', () => {
  let service: WebhookService;
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WebhookService();
    delete process.env.PAYMENT_WEBHOOK_URL;
    delete process.env.REFUND_WEBHOOK_URL;
    delete process.env.NFT_WEBHOOK_URL;
    delete process.env.ADMIN_WEBHOOK_URL;
  });

  describe('sendWebhook', () => {
    it('should send webhook successfully', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const payload = {
        event: 'test.event',
        timestamp: new Date().toISOString(),
        data: { test: 'data' },
      };

      const result = await service.sendWebhook('https://example.com/webhook', payload);

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TicketToken-Queue-Service/1.0',
          },
          timeout: 10000,
        }
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Sending webhook',
        expect.objectContaining({
          event: 'test.event',
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Webhook sent successfully',
        expect.objectContaining({
          event: 'test.event',
          status: 200,
        })
      );
    });

    it('should handle empty URL', async () => {
      const payload = {
        event: 'test.event',
        timestamp: new Date().toISOString(),
        data: {},
      };

      const result = await service.sendWebhook('', payload);

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Webhook URL not provided');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle webhook sending errors', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const payload = {
        event: 'test.event',
        timestamp: new Date().toISOString(),
        data: {},
      };

      const result = await service.sendWebhook('https://example.com/webhook', payload);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Webhook failed',
        expect.objectContaining({
          event: 'test.event',
          error: 'Network error',
        })
      );
    });

    it('should truncate long URLs in logs', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const longUrl = 'https://example.com/' + 'a'.repeat(100) + '/webhook';
      const payload = {
        event: 'test.event',
        timestamp: new Date().toISOString(),
        data: {},
      };

      await service.sendWebhook(longUrl, payload);

      expect(logger.info).toHaveBeenCalledWith(
        'Sending webhook',
        expect.objectContaining({
          url: expect.stringContaining('...'),
        })
      );
    });

    it('should use 10 second timeout', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const payload = {
        event: 'test.event',
        timestamp: new Date().toISOString(),
        data: {},
      };

      await service.sendWebhook('https://example.com/webhook', payload);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 10000,
        })
      );
    });

    it('should set correct headers', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const payload = {
        event: 'test.event',
        timestamp: new Date().toISOString(),
        data: {},
      };

      await service.sendWebhook('https://example.com/webhook', payload);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TicketToken-Queue-Service/1.0',
          },
        })
      );
    });
  });

  describe('sendPaymentCompleted', () => {
    it('should send payment completed webhook with provided URL', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendPaymentCompleted({
        orderId: 'order_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
        paymentIntentId: 'pi_789',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        {
          event: 'payment.completed',
          timestamp: expect.any(String),
          data: {
            orderId: 'order_123',
            userId: 'user_456',
            amount: 5000,
            currency: 'usd',
            paymentIntentId: 'pi_789',
          },
        },
        expect.any(Object)
      );
    });

    it('should use environment variable URL if not provided', async () => {
      process.env.PAYMENT_WEBHOOK_URL = 'https://env-webhook.com/payment';
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendPaymentCompleted({
        orderId: 'order_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
        paymentIntentId: 'pi_789',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://env-webhook.com/payment',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should return false if no URL configured', async () => {
      const result = await service.sendPaymentCompleted({
        orderId: 'order_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
        paymentIntentId: 'pi_789',
      });

      expect(result).toBe(false);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should include valid ISO timestamp', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await service.sendPaymentCompleted({
        orderId: 'order_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
        paymentIntentId: 'pi_789',
        webhookUrl: 'https://example.com/webhook',
      });

      const payload = (mockedAxios.post as jest.Mock).mock.calls[0][1];
      expect(() => new Date(payload.timestamp)).not.toThrow();
      expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
    });
  });

  describe('sendRefundCompleted', () => {
    it('should send refund completed webhook with provided URL', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendRefundCompleted({
        orderId: 'order_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
        refundId: 're_789',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        {
          event: 'refund.completed',
          timestamp: expect.any(String),
          data: {
            orderId: 'order_123',
            userId: 'user_456',
            amount: 5000,
            currency: 'usd',
            refundId: 're_789',
          },
        },
        expect.any(Object)
      );
    });

    it('should use environment variable URL if not provided', async () => {
      process.env.REFUND_WEBHOOK_URL = 'https://env-webhook.com/refund';
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendRefundCompleted({
        orderId: 'order_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
        refundId: 're_789',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://env-webhook.com/refund',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should return false if no URL configured', async () => {
      const result = await service.sendRefundCompleted({
        orderId: 'order_123',
        userId: 'user_456',
        amount: 5000,
        currency: 'usd',
        refundId: 're_789',
      });

      expect(result).toBe(false);
    });
  });

  describe('sendNFTMinted', () => {
    it('should send NFT minted webhook with provided URL', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendNFTMinted({
        ticketId: 'ticket_123',
        orderId: 'order_456',
        userId: 'user_789',
        mintAddress: 'mint_abc',
        metadataUri: 'https://metadata.example.com/token',
        explorerUrl: 'https://explorer.solana.com/address/mint_abc',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        {
          event: 'nft.minted',
          timestamp: expect.any(String),
          data: {
            ticketId: 'ticket_123',
            orderId: 'order_456',
            userId: 'user_789',
            mintAddress: 'mint_abc',
            metadataUri: 'https://metadata.example.com/token',
            explorerUrl: 'https://explorer.solana.com/address/mint_abc',
          },
        },
        expect.any(Object)
      );
    });

    it('should use environment variable URL if not provided', async () => {
      process.env.NFT_WEBHOOK_URL = 'https://env-webhook.com/nft';
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendNFTMinted({
        ticketId: 'ticket_123',
        orderId: 'order_456',
        userId: 'user_789',
        mintAddress: 'mint_abc',
        metadataUri: 'https://metadata.example.com/token',
        explorerUrl: 'https://explorer.solana.com/address/mint_abc',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://env-webhook.com/nft',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should return false if no URL configured', async () => {
      const result = await service.sendNFTMinted({
        ticketId: 'ticket_123',
        orderId: 'order_456',
        userId: 'user_789',
        mintAddress: 'mint_abc',
        metadataUri: 'https://metadata.example.com/token',
        explorerUrl: 'https://explorer.solana.com/address/mint_abc',
      });

      expect(result).toBe(false);
    });
  });

  describe('sendOperationFailed', () => {
    it('should send operation failed webhook with provided URL', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendOperationFailed({
        operation: 'payment_processing',
        orderId: 'order_123',
        userId: 'user_456',
        error: 'Payment gateway timeout',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        {
          event: 'operation.failed',
          timestamp: expect.any(String),
          data: {
            operation: 'payment_processing',
            orderId: 'order_123',
            userId: 'user_456',
            error: 'Payment gateway timeout',
          },
        },
        expect.any(Object)
      );
    });

    it('should handle optional orderId and userId', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendOperationFailed({
        operation: 'system_check',
        error: 'Health check failed',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        {
          event: 'operation.failed',
          timestamp: expect.any(String),
          data: {
            operation: 'system_check',
            orderId: undefined,
            userId: undefined,
            error: 'Health check failed',
          },
        },
        expect.any(Object)
      );
    });

    it('should use environment variable URL if not provided', async () => {
      process.env.ADMIN_WEBHOOK_URL = 'https://env-webhook.com/admin';
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendOperationFailed({
        operation: 'payment_processing',
        error: 'Timeout',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://env-webhook.com/admin',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should return false if no URL configured', async () => {
      const result = await service.sendOperationFailed({
        operation: 'test_operation',
        error: 'Test error',
      });

      expect(result).toBe(false);
    });
  });
});
