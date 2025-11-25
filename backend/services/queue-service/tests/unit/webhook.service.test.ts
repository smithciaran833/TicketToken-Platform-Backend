import { WebhookService } from '../../src/services/webhook.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhookService', () => {
  let webhookService: WebhookService;

  beforeEach(() => {
    webhookService = new WebhookService();
    jest.clearAllMocks();
  });

  describe('sendWebhook', () => {
    it('should send webhook successfully', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await webhookService.sendWebhook('https://example.com/webhook', {
        event: 'test.event',
        timestamp: new Date().toISOString(),
        data: { test: 'data' },
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          event: 'test.event',
          data: { test: 'data' },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle webhook failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await webhookService.sendWebhook('https://example.com/webhook', {
        event: 'test.event',
        timestamp: new Date().toISOString(),
        data: {},
      });

      expect(result).toBe(false);
    });

    it('should return false for empty URL', async () => {
      const result = await webhookService.sendWebhook('', {
        event: 'test.event',
        timestamp: new Date().toISOString(),
        data: {},
      });

      expect(result).toBe(false);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('sendPaymentCompleted', () => {
    it('should send payment completed webhook', async () => {
      process.env.PAYMENT_WEBHOOK_URL = 'https://example.com/payment';
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await webhookService.sendPaymentCompleted({
        orderId: 'order-123',
        userId: 'user-123',
        amount: 5000,
        currency: 'usd',
        paymentIntentId: 'pi_123',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/payment',
        expect.objectContaining({
          event: 'payment.completed',
          data: expect.objectContaining({
            orderId: 'order-123',
            amount: 5000,
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('sendRefundCompleted', () => {
    it('should send refund completed webhook', async () => {
      process.env.REFUND_WEBHOOK_URL = 'https://example.com/refund';
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await webhookService.sendRefundCompleted({
        orderId: 'order-123',
        userId: 'user-123',
        amount: 5000,
        currency: 'usd',
        refundId: 'ref_123',
      });

      expect(result).toBe(true);
    });
  });

  describe('sendNFTMinted', () => {
    it('should send NFT minted webhook', async () => {
      process.env.NFT_WEBHOOK_URL = 'https://example.com/nft';
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await webhookService.sendNFTMinted({
        ticketId: 'ticket-123',
        orderId: 'order-123',
        userId: 'user-123',
        mintAddress: 'mint_abc',
        metadataUri: 'https://arweave.net/abc',
        explorerUrl: 'https://explorer.solana.com/address/mint_abc',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/nft',
        expect.objectContaining({
          event: 'nft.minted',
        }),
        expect.any(Object)
      );
    });
  });

  describe('sendOperationFailed', () => {
    it('should send operation failed webhook', async () => {
      process.env.ADMIN_WEBHOOK_URL = 'https://example.com/admin';
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await webhookService.sendOperationFailed({
        operation: 'payment',
        orderId: 'order-123',
        userId: 'user-123',
        error: 'Payment failed',
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/admin',
        expect.objectContaining({
          event: 'operation.failed',
          data: expect.objectContaining({
            operation: 'payment',
            error: 'Payment failed',
          }),
        }),
        expect.any(Object)
      );
    });
  });
});
