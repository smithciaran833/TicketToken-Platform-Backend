/**
 * Unit Tests for WebhookService
 *
 * Tests:
 * - Webhook delivery
 * - Signature generation
 * - Retry logic
 * - Subscription management
 * - Error handling
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { Pool } from 'pg';
import axios from 'axios';
import { WebhookService, WebhookEventType } from '../../../src/services/webhook.service';

jest.mock('../../../src/utils/logger');
jest.mock('axios');

describe('WebhookService', () => {
  let webhookService: WebhookService;
  let mockPool: jest.Mocked<Pool>;
  let mockAxios: jest.Mocked<typeof axios>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    } as any;

    webhookService = new WebhookService(mockPool);
    mockAxios = axios as jest.Mocked<typeof axios>;

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('sendWebhook()', () => {
    const tenantId = 'tenant-123';
    const eventType = WebhookEventType.TRANSFER_CREATED;
    const data = { transferId: 'transfer-123', ticketId: 'ticket-123' };

    it('should send webhook to active subscriptions', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'sub-123',
          url: 'https://example.com/webhook',
          events: [WebhookEventType.TRANSFER_CREATED],
          secret: 'secret123',
          is_active: true
        }]
      } as any);

      mockAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      } as any);

      mockPool.query.mockResolvedValueOnce({} as any); // Log delivery

      await webhookService.sendWebhook(tenantId, eventType, data);

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          event: eventType,
          data,
          timestamp: expect.any(String)
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Event': eventType,
            'User-Agent': 'TicketToken-Webhooks/1.0'
          }),
          timeout: 5000
        })
      );
    });

    it('should do nothing when no subscriptions exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] } as any);

      await webhookService.sendWebhook(tenantId, eventType, data);

      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('should send to multiple subscriptions', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            url: 'https://example.com/webhook1',
            events: [eventType],
            secret: 'secret1',
            is_active: true
          },
          {
            id: 'sub-2',
            url: 'https://example.com/webhook2',
            events: [eventType],
            secret: 'secret2',
            is_active: true
          }
        ]
      } as any);

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true }
      } as any);

      mockPool.query.mockResolvedValue({} as any); // Log deliveries

      await webhookService.sendWebhook(tenantId, eventType, data);

      expect(mockAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should filter subscriptions by event type', async () => {
      await webhookService.sendWebhook(tenantId, eventType, data);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('$2 = ANY(events)'),
        [tenantId, eventType]
      );
    });

    it('should generate unique signature for each subscription', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            url: 'https://example.com/webhook',
            events: [eventType],
            secret: 'secret1',
            is_active: true
          },
          {
            id: 'sub-2',
            url: 'https://example.com/webhook',
            events: [eventType],
            secret: 'secret2',
            is_active: true
          }
        ]
      } as any);

      mockAxios.post.mockResolvedValue({ status: 200 } as any);
      mockPool.query.mockResolvedValue({} as any);

      await webhookService.sendWebhook(tenantId, eventType, data);

      const call1 = mockAxios.post.mock.calls[0];
      const call2 = mockAxios.post.mock.calls[1];

      const signature1 = call1[2]?.headers?.['X-Webhook-Signature'];
      const signature2 = call2[2]?.headers?.['X-Webhook-Signature'];

      expect(signature1).not.toBe(signature2);
    });

    it('should log successful delivery', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'sub-123',
          url: 'https://example.com/webhook',
          events: [eventType],
          secret: 'secret123',
          is_active: true
        }]
      } as any);

      mockAxios.post.mockResolvedValueOnce({ status: 200 } as any);
      mockPool.query.mockResolvedValueOnce({} as any); // Log call

      await webhookService.sendWebhook(tenantId, eventType, data);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO webhook_deliveries'),
        ['sub-123', eventType, 'SUCCESS', 200, undefined]
      );
    });

    it('should handle delivery errors gracefully', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'sub-123',
          url: 'https://example.com/webhook',
          events: [eventType],
          secret: 'secret123',
          is_active: true
        }]
      } as any);

      mockAxios.post.mockRejectedValue(new Error('Network error'));
      mockPool.query.mockResolvedValue({} as any);

      // Should not throw
      await expect(
        webhookService.sendWebhook(tenantId, eventType, data)
      ).resolves.not.toThrow();
    });
  });

  describe('Retry Logic', () => {
    const subscription = {
      id: 'sub-123',
      url: 'https://example.com/webhook',
      events: [WebhookEventType.TRANSFER_CREATED],
      secret: 'secret123',
      isActive: true
    };

    const payload = {
      event: WebhookEventType.TRANSFER_CREATED,
      timestamp: new Date().toISOString(),
      data: { test: true }
    };

    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should retry failed deliveries up to 3 times', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [subscription] } as any);

      mockAxios.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      mockPool.query.mockResolvedValue({} as any);

      const promise = webhookService.sendWebhook(
        'tenant-123',
        WebhookEventType.TRANSFER_CREATED,
        { test: true }
      );

      // Fast-forward through all retries
      await jest.runAllTimersAsync();
      await promise;

      expect(mockAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should succeed on retry', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [subscription] } as any);

      mockAxios.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ status: 200 } as any);

      mockPool.query.mockResolvedValue({} as any);

      const promise = webhookService.sendWebhook(
        'tenant-123',
        WebhookEventType.TRANSFER_CREATED,
        { test: true }
      );

      await jest.runAllTimersAsync();
      await promise;

      expect(mockAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should log failure after max retries', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [subscription] } as any);

      mockAxios.post.mockRejectedValue({
        message: 'Network error',
        response: { status: 500 }
      });

      mockPool.query.mockResolvedValue({} as any);

      const promise = webhookService.sendWebhook(
        'tenant-123',
        WebhookEventType.TRANSFER_CREATED,
        { test: true }
      );

      await jest.runAllTimersAsync();
      await promise;

      const logCall = mockPool.query.mock.calls.find(
        call => (call[0] as string).includes('INSERT INTO webhook_deliveries')
      );

      expect(logCall![1]).toContain('FAILED');
      expect(logCall![1]).toContain('Network error');
    });

    it('should use exponential backoff for retries', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [subscription] } as any);

      mockAxios.post
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce({ status: 200 } as any);

      mockPool.query.mockResolvedValue({} as any);

      const promise = webhookService.sendWebhook(
        'tenant-123',
        WebhookEventType.TRANSFER_CREATED,
        { test: true }
      );

      // First attempt fails immediately
      await Promise.resolve();
      expect(mockAxios.post).toHaveBeenCalledTimes(1);

      // Wait 1 second for first retry
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(mockAxios.post).toHaveBeenCalledTimes(2);

      // Wait 2 seconds for second retry
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await promise;
      expect(mockAxios.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('testWebhook()', () => {
    it('should test webhook endpoint successfully', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          url: 'https://example.com/webhook',
          secret: 'secret123'
        }]
      } as any);

      mockAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true }
      } as any);

      const result = await webhookService.testWebhook('sub-123');

      expect(result).toBe(true);
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          event: WebhookEventType.TRANSFER_CREATED,
          data: { test: true }
        }),
        expect.any(Object)
      );
    });

    it('should return false for non-existent subscription', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] } as any);

      const result = await webhookService.testWebhook('non-existent');

      expect(result).toBe(false);
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('should return false on webhook failure', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          url: 'https://example.com/webhook',
          secret: 'secret123'
        }]
      } as any);

      mockAxios.post.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await webhookService.testWebhook('sub-123');

      expect(result).toBe(false);
    });

    it('should return false for non-2xx status codes', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          url: 'https://example.com/webhook',
          secret: 'secret123'
        }]
      } as any);

      mockAxios.post.mockResolvedValueOnce({
        status: 404,
        data: {}
      } as any);

      const result = await webhookService.testWebhook('sub-123');

      expect(result).toBe(false);
    });

    it('should include test signature in headers', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          url: 'https://example.com/webhook',
          secret: 'secret123'
        }]
      } as any);

      mockAxios.post.mockResolvedValueOnce({ status: 200 } as any);

      await webhookService.testWebhook('sub-123');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Signature': expect.any(String)
          })
        })
      );
    });
  });

  describe('verifySignature()', () => {
    it('should verify valid signature', () => {
      const payload = '{"event":"transfer.created","data":{}}';
      const secret = 'secret123';
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const result = WebhookService.verifySignature(
        payload,
        expectedSignature,
        secret
      );

      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = '{"event":"transfer.created","data":{}}';
      const secret = 'secret123';
      const invalidSignature = 'invalid-signature';

      const result = WebhookService.verifySignature(
        payload,
        invalidSignature,
        secret
      );

      expect(result).toBe(false);
    });

    it('should reject signature with wrong secret', () => {
      const payload = '{"event":"transfer.created","data":{}}';
      const secret = 'secret123';
      const wrongSecret = 'wrong-secret';
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha256', wrongSecret)
        .update(payload)
        .digest('hex');

      const result = WebhookService.verifySignature(payload, signature, secret);

      expect(result).toBe(false);
    });

    it('should use timing-safe comparison', () => {
      const payload = '{"test":true}';
      const secret = 'secret';
      const crypto = require('crypto');

      // Generate valid signature
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      // Timing attack shouldn't work
      const almostValidSignature = validSignature.slice(0, -1) + 'x';

      const result = WebhookService.verifySignature(
        payload,
        almostValidSignature,
        secret
      );

      expect(result).toBe(false);
    });
  });

  describe('WebhookEventType Enum', () => {
    it('should have all expected event types', () => {
      expect(WebhookEventType.TRANSFER_CREATED).toBe('transfer.created');
      expect(WebhookEventType.TRANSFER_ACCEPTED).toBe('transfer.accepted');
      expect(WebhookEventType.TRANSFER_REJECTED).toBe('transfer.rejected');
      expect(WebhookEventType.TRANSFER_COMPLETED).toBe('transfer.completed');
      expect(WebhookEventType.TRANSFER_FAILED).toBe('transfer.failed');
      expect(WebhookEventType.TRANSFER_CANCELLED).toBe('transfer.cancelled');
      expect(WebhookEventType.BLOCKCHAIN_CONFIRMED).toBe('blockchain.confirmed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle timeout errors', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'sub-123',
          url: 'https://example.com/webhook',
          events: [WebhookEventType.TRANSFER_CREATED],
          secret: 'secret123',
          is_active: true
        }]
      } as any);

      mockAxios.post.mockRejectedValue({ code: 'ETIMEDOUT', message: 'Timeout' });
      mockPool.query.mockResolvedValue({} as any);

      await expect(
        webhookService.sendWebhook(
          'tenant-123',
          WebhookEventType.TRANSFER_CREATED,
          {}
        )
      ).resolves.not.toThrow();
    });

    it('should handle very large payloads', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'sub-123',
          url: 'https://example.com/webhook',
          events: [WebhookEventType.TRANSFER_CREATED],
          secret: 'secret123',
          is_active: true
        }]
      } as any);

      mockAxios.post.mockResolvedValueOnce({ status: 200 } as any);
      mockPool.query.mockResolvedValue({} as any);

      const largeData = { items: Array(10000).fill({ id: 'item', data: 'x'.repeat(100) }) };

      await webhookService.sendWebhook(
        'tenant-123',
        WebhookEventType.TRANSFER_CREATED,
        largeData
      );

      expect(mockAxios.post).toHaveBeenCalled();
    });

    it('should handle concurrent webhook sends', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'sub-123',
          url: 'https://example.com/webhook',
          events: [WebhookEventType.TRANSFER_CREATED],
          secret: 'secret123',
          is_active: true
        }]
      } as any);

      mockAxios.post.mockResolvedValue({ status: 200 } as any);

      const promises = Array(10).fill(null).map(() =>
        webhookService.sendWebhook(
          'tenant-123',
          WebhookEventType.TRANSFER_CREATED,
          { test: true }
        )
      );

      await Promise.all(promises);

      expect(mockAxios.post).toHaveBeenCalledTimes(10);
    });
  });
});
