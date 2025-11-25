import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import notificationRoutes from '../../src/routes/notification.routes';

// Mock dependencies
jest.mock('../../src/controllers/notification.controller');
jest.mock('../../src/middleware/auth.middleware');
jest.mock('../../src/middleware/validation.middleware');

const mockAuth = require('../../src/middleware/auth.middleware');
const mockValidation = require('../../src/middleware/validation.middleware');
const mockController = require('../../src/controllers/notification.controller');

describe('Rate Limiting - Integration Tests', () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeAll(async () => {
    // Mock auth middleware to pass through
    mockAuth.authMiddleware = jest.fn(async (request: any, reply: any) => {
      request.user = { id: 'test-user', venueId: 'test-venue' };
    });

    // Mock validation middleware
    mockValidation.validateSendRequest = jest.fn(async () => {});
    mockValidation.validateBatchSendRequest = jest.fn(async () => {});

    // Mock controller
    mockController.notificationController = {
      send: jest.fn(async (request: any, reply: any) => {
        return reply.status(200).send({ success: true, id: 'notif-123' });
      }),
      sendBatch: jest.fn(async (request: any, reply: any) => {
        return reply.status(200).send({ success: true, sent: 10 });
      }),
      getStatus: jest.fn(async (request: any, reply: any) => {
        return reply.status(200).send({ status: 'delivered' });
      })
    };
  });

  beforeEach(async () => {
    // Reset environment
    process.env = { ...originalEnv };
    
    // Create fresh Fastify instance
    app = Fastify();
    await app.register(notificationRoutes, { prefix: '/notifications' });
    await app.ready();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('POST /notifications/send - Email Rate Limiting', () => {
    it('should allow requests within email rate limit', async () => {
      process.env.EMAIL_RATE_LIMIT = '5';
      process.env.EMAIL_RATE_WINDOW_MS = '60000';

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'test@example.com', name: 'Test' },
          type: 'transactional',
          template: 'test-template',
          data: {}
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBe('5');
      expect(response.headers['x-ratelimit-remaining']).toBe('4');
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should block requests when email rate limit exceeded', async () => {
      process.env.EMAIL_RATE_LIMIT = '2';
      process.env.EMAIL_RATE_WINDOW_MS = '60000';

      const payload = {
        channel: 'email',
        recipientId: 'user-123',
        recipient: { email: 'test@example.com', name: 'Test' },
        type: 'transactional',
        template: 'test-template',
        data: {}
      };

      // Send requests up to limit
      await app.inject({ method: 'POST', url: '/notifications/send', payload });
      await app.inject({ method: 'POST', url: '/notifications/send', payload });

      // This should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
      expect(response.headers['retry-after']).toBeDefined();
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Too Many Requests');
      expect(body.message).toContain('Email rate limit exceeded');
    });

    it('should return proper rate limit headers', async () => {
      process.env.EMAIL_RATE_LIMIT = '100';

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'test@example.com', name: 'Test' },
          type: 'transactional',
          template: 'test-template',
          data: {}
        }
      });

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('POST /notifications/send - SMS Rate Limiting', () => {
    it('should allow requests within SMS rate limit', async () => {
      process.env.SMS_RATE_LIMIT = '5';
      process.env.SMS_RATE_WINDOW_MS = '60000';

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'sms',
          recipientId: 'user-123',
          recipient: { phone: '+1234567890', name: 'Test' },
          type: 'transactional',
          template: 'test-template',
          data: {}
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBe('5');
      expect(response.headers['x-ratelimit-remaining']).toBe('4');
    });

    it('should block requests when SMS rate limit exceeded', async () => {
      process.env.SMS_RATE_LIMIT = '2';

      const payload = {
        channel: 'sms',
        recipientId: 'user-123',
        recipient: { phone: '+1234567890', name: 'Test' },
        type: 'transactional',
        template: 'test-template',
        data: {}
      };

      await app.inject({ method: 'POST', url: '/notifications/send', payload });
      await app.inject({ method: 'POST', url: '/notifications/send', payload });

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload
      });

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('SMS rate limit exceeded');
    });

    it('should enforce stricter SMS limits than email', async () => {
      process.env.EMAIL_RATE_LIMIT = '10';
      process.env.SMS_RATE_LIMIT = '3';

      const emailResponse = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'email',
          recipientId: 'user-123',
          recipient: { email: 'test@example.com', name: 'Test' },
          type: 'transactional',
          template: 'test',
          data: {}
        }
      });

      const smsResponse = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload: {
          channel: 'sms',
          recipientId: 'user-123',
          recipient: { phone: '+1234567890', name: 'Test' },
          type: 'transactional',
          template: 'test',
          data: {}
        }
      });

      expect(emailResponse.headers['x-ratelimit-limit']).toBe('10');
      expect(smsResponse.headers['x-ratelimit-limit']).toBe('3');
    });
  });

  describe('POST /notifications/send-batch - Batch Rate Limiting', () => {
    it('should allow requests within batch rate limit', async () => {
      process.env.BATCH_RATE_LIMIT = '5';
      process.env.BATCH_RATE_WINDOW_MS = '60000';

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send-batch',
        payload: {
          notifications: [
            {
              channel: 'email',
              recipientId: 'user-1',
              recipient: { email: 'user1@example.com', name: 'User 1' },
              type: 'marketing',
              template: 'newsletter',
              data: {}
            }
          ]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBe('5');
      expect(response.headers['x-ratelimit-remaining']).toBe('4');
    });

    it('should block requests when batch rate limit exceeded', async () => {
      process.env.BATCH_RATE_LIMIT = '2';

      const payload = {
        notifications: [
          {
            channel: 'email',
            recipientId: 'user-1',
            recipient: { email: 'user1@example.com', name: 'User 1' },
            type: 'marketing',
            template: 'newsletter',
            data: {}
          }
        ]
      };

      await app.inject({ method: 'POST', url: '/notifications/send-batch', payload });
      await app.inject({ method: 'POST', url: '/notifications/send-batch', payload });

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send-batch',
        payload
      });

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Batch notification rate limit exceeded');
    });
  });

  describe('Rate Limit Window Reset', () => {
    it('should reset rate limit after window expires', async () => {
      process.env.EMAIL_RATE_LIMIT = '2';
      process.env.EMAIL_RATE_WINDOW_MS = '100'; // 100ms window

      const payload = {
        channel: 'email',
        recipientId: 'user-123',
        recipient: { email: 'test@example.com', name: 'Test' },
        type: 'transactional',
        template: 'test',
        data: {}
      };

      // Exhaust limit
      await app.inject({ method: 'POST', url: '/notifications/send', payload });
      await app.inject({ method: 'POST', url: '/notifications/send', payload });

      const blockedResponse = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload
      });

      expect(blockedResponse.statusCode).toBe(429);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be allowed again
      const allowedResponse = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload
      });

      expect(allowedResponse.statusCode).toBe(200);
      expect(allowedResponse.headers['x-ratelimit-remaining']).toBe('1');
    });
  });

  describe('Rate Limit Isolation', () => {
    it('should track rate limits separately for different users', async () => {
      process.env.EMAIL_RATE_LIMIT = '2';

      // Mock first user
      mockAuth.authMiddleware = jest.fn(async (request: any) => {
        request.user = { id: 'user-1', venueId: 'venue-1' };
      });

      await app.close();
      app = Fastify();
      await app.register(notificationRoutes, { prefix: '/notifications' });
      await app.ready();

      const payload = {
        channel: 'email',
        recipientId: 'recipient-1',
        recipient: { email: 'test@example.com', name: 'Test' },
        type: 'transactional',
        template: 'test',
        data: {}
      };

      // Exhaust limit for user 1
      await app.inject({ method: 'POST', url: '/notifications/send', payload });
      await app.inject({ method: 'POST', url: '/notifications/send', payload });

      const user1Blocked = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload
      });

      expect(user1Blocked.statusCode).toBe(429);

      // Switch to user 2
      mockAuth.authMiddleware = jest.fn(async (request: any) => {
        request.user = { id: 'user-2', venueId: 'venue-1' };
      });

      await app.close();
      app = Fastify();
      await app.register(notificationRoutes, { prefix: '/notifications' });
      await app.ready();

      // User 2 should not be blocked
      const user2Allowed = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload
      });

      expect(user2Allowed.statusCode).toBe(200);
    });

    it('should track rate limits separately for different IP addresses', async () => {
      process.env.EMAIL_RATE_LIMIT = '2';

      // Mock unauthenticated user
      mockAuth.authMiddleware = jest.fn(async () => {});

      await app.close();
      app = Fastify();
      await app.register(notificationRoutes, { prefix: '/notifications' });
      await app.ready();

      const payload = {
        channel: 'email',
        recipientId: 'recipient-1',
        recipient: { email: 'test@example.com', name: 'Test' },
        type: 'transactional',
        template: 'test',
        data: {}
      };

      // Exhaust limit for IP 1
      await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload,
        headers: { 'x-forwarded-for': '192.168.1.100' }
      });
      await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload,
        headers: { 'x-forwarded-for': '192.168.1.100' }
      });

      const ip1Blocked = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload,
        headers: { 'x-forwarded-for': '192.168.1.100' }
      });

      expect(ip1Blocked.statusCode).toBe(429);

      // Different IP should not be blocked
      const ip2Allowed = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload,
        headers: { 'x-forwarded-for': '192.168.1.101' }
      });

      expect(ip2Allowed.statusCode).toBe(200);
    });
  });

  describe('Rate Limit Error Responses', () => {
    it('should include Retry-After header when rate limited', async () => {
      process.env.EMAIL_RATE_LIMIT = '1';

      const payload = {
        channel: 'email',
        recipientId: 'user-123',
        recipient: { email: 'test@example.com', name: 'Test' },
        type: 'transactional',
        template: 'test',
        data: {}
      };

      await app.inject({ method: 'POST', url: '/notifications/send', payload });

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
      expect(parseInt(response.headers['retry-after'] as string, 10)).toBeGreaterThan(0);
    });

    it('should include retryAfter in response body', async () => {
      process.env.EMAIL_RATE_LIMIT = '1';

      const payload = {
        channel: 'email',
        recipientId: 'user-123',
        recipient: { email: 'test@example.com', name: 'Test' },
        type: 'transactional',
        template: 'test',
        data: {}
      };

      await app.inject({ method: 'POST', url: '/notifications/send', payload });

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/send',
        payload
      });

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Too Many Requests');
      expect(body.retryAfter).toBeDefined();
      expect(typeof body.retryAfter).toBe('number');
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests correctly', async () => {
      process.env.EMAIL_RATE_LIMIT = '5';

      const payload = {
        channel: 'email',
        recipientId: 'user-123',
        recipient: { email: 'test@example.com', name: 'Test' },
        type: 'transactional',
        template: 'test',
        data: {}
      };

      // Send 10 concurrent requests
      const requests = Array(10).fill(null).map(() =>
        app.inject({ method: 'POST', url: '/notifications/send', payload })
      );

      const responses = await Promise.all(requests);

      const successCount = responses.filter(r => r.statusCode === 200).length;
      const rateLimitedCount = responses.filter(r => r.statusCode === 429).length;

      // Some should succeed (up to 5), rest should be rate limited
      expect(successCount).toBeGreaterThan(0);
      expect(rateLimitedCount).toBeGreaterThan(0);
      expect(successCount + rateLimitedCount).toBe(10);
    });
  });
});
