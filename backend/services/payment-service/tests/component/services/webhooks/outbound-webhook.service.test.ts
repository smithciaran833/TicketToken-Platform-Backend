/**
 * COMPONENT TEST: OutboundWebhookService
 *
 * Tests outbound webhook delivery and logging
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock axios
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  post: mockAxiosPost,
}));

const mockPoolQuery = jest.fn();

import { OutboundWebhookService, OutboundWebhook } from '../../../../src/services/webhooks/outbound-webhook';

describe('OutboundWebhookService Component Tests', () => {
  let service: OutboundWebhookService;
  let mockPool: any;

  beforeEach(() => {
    mockAxiosPost.mockReset();
    mockPoolQuery.mockReset();
    mockPoolQuery.mockResolvedValue({ rows: [] });

    mockPool = { query: mockPoolQuery };
    service = new OutboundWebhookService(mockPool);
  });

  // ===========================================================================
  // SEND WEBHOOK
  // ===========================================================================
  describe('send()', () => {
    it('should send webhook with correct headers', async () => {
      mockAxiosPost.mockResolvedValueOnce({ status: 200 });

      const webhook: OutboundWebhook = {
        url: 'https://example.com/webhook',
        event: 'payment.completed',
        payload: { paymentId: uuidv4(), amount: 10000 },
        secret: 'webhook-secret-123',
      };

      await service.send(webhook);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://example.com/webhook',
        webhook.payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Event': 'payment.completed',
          }),
          timeout: 5000,
        })
      );
    });

    it('should generate HMAC signature', async () => {
      mockAxiosPost.mockResolvedValueOnce({ status: 200 });

      const webhook: OutboundWebhook = {
        url: 'https://example.com/webhook',
        event: 'payment.completed',
        payload: { test: 'data' },
        secret: 'my-secret',
      };

      await service.send(webhook);

      const call = mockAxiosPost.mock.calls[0];
      const signature = call[2].headers['X-Webhook-Signature'];

      // Signature should be 64 char hex (sha256)
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should log successful webhook', async () => {
      mockAxiosPost.mockResolvedValueOnce({ status: 200 });

      const webhook: OutboundWebhook = {
        url: 'https://example.com/webhook',
        event: 'payment.completed',
        payload: { paymentId: '123' },
        secret: 'secret',
      };

      await service.send(webhook);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbound_webhooks'),
        expect.arrayContaining([
          webhook.url,
          webhook.event,
          JSON.stringify(webhook.payload),
          200,
          null,
        ])
      );
    });

    it('should log failed webhook with error', async () => {
      const error = new Error('Connection refused');
      (error as any).response = { status: 500 };
      mockAxiosPost.mockRejectedValueOnce(error);

      const webhook: OutboundWebhook = {
        url: 'https://example.com/webhook',
        event: 'payment.failed',
        payload: { paymentId: '123' },
        secret: 'secret',
      };

      await expect(service.send(webhook)).rejects.toThrow('Connection refused');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbound_webhooks'),
        expect.arrayContaining([
          webhook.url,
          webhook.event,
          JSON.stringify(webhook.payload),
          500,
          'Connection refused',
        ])
      );
    });

    it('should log status 0 when no response', async () => {
      const error = new Error('Network error');
      mockAxiosPost.mockRejectedValueOnce(error);

      const webhook: OutboundWebhook = {
        url: 'https://example.com/webhook',
        event: 'payment.completed',
        payload: {},
        secret: 'secret',
      };

      await expect(service.send(webhook)).rejects.toThrow();

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbound_webhooks'),
        expect.arrayContaining([0, 'Network error'])
      );
    });

    it('should throw error on failure', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('Timeout'));

      const webhook: OutboundWebhook = {
        url: 'https://example.com/webhook',
        event: 'test',
        payload: {},
        secret: 'secret',
      };

      await expect(service.send(webhook)).rejects.toThrow('Timeout');
    });
  });

  // ===========================================================================
  // SIGNATURE VERIFICATION
  // ===========================================================================
  describe('signature generation', () => {
    it('should generate consistent signatures for same payload', async () => {
      mockAxiosPost.mockResolvedValue({ status: 200 });

      const webhook: OutboundWebhook = {
        url: 'https://example.com/webhook',
        event: 'test',
        payload: { id: '123', amount: 100 },
        secret: 'consistent-secret',
      };

      await service.send(webhook);
      const sig1 = mockAxiosPost.mock.calls[0][2].headers['X-Webhook-Signature'];

      mockAxiosPost.mockClear();
      await service.send(webhook);
      const sig2 = mockAxiosPost.mock.calls[0][2].headers['X-Webhook-Signature'];

      expect(sig1).toBe(sig2);
    });

    it('should generate different signatures for different secrets', async () => {
      mockAxiosPost.mockResolvedValue({ status: 200 });

      const webhook1: OutboundWebhook = {
        url: 'https://example.com/webhook',
        event: 'test',
        payload: { id: '123' },
        secret: 'secret-1',
      };

      const webhook2: OutboundWebhook = {
        ...webhook1,
        secret: 'secret-2',
      };

      await service.send(webhook1);
      const sig1 = mockAxiosPost.mock.calls[0][2].headers['X-Webhook-Signature'];

      mockAxiosPost.mockClear();
      await service.send(webhook2);
      const sig2 = mockAxiosPost.mock.calls[0][2].headers['X-Webhook-Signature'];

      expect(sig1).not.toBe(sig2);
    });
  });
});
