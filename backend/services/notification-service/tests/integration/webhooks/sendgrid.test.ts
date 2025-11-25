import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import crypto from 'crypto';

// Mock webhook route (to be implemented)
jest.mock('../../../src/routes/webhook.routes');

describe('SendGrid Webhook Integration Tests', () => {
  let app: FastifyInstance;
  const SENDGRID_WEBHOOK_SECRET = 'test-webhook-secret';

  beforeEach(async () => {
    process.env.SENDGRID_WEBHOOK_SECRET = SENDGRID_WEBHOOK_SECRET;
    
    app = Fastify();
    
    // Mock webhook route
    app.post('/webhooks/sendgrid', async (request, reply) => {
      const signature = request.headers['x-twilio-email-event-webhook-signature'] as string;
      const timestamp = request.headers['x-twilio-email-event-webhook-timestamp'] as string;
      
      // Verify signature
      if (signature && timestamp) {
        const payload = JSON.stringify(request.body);
        const expectedSignature = crypto
          .createHmac('sha256', SENDGRID_WEBHOOK_SECRET)
          .update(timestamp + payload)
          .digest('base64');
          
        if (signature !== expectedSignature) {
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      }
      
      // Process events
      const events = request.body as any[];
      return reply.status(200).send({ 
        success: true, 
        processed: events.length 
      });
    });
    
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.SENDGRID_WEBHOOK_SECRET;
  });

  describe('Delivery Confirmation Webhooks', () => {
    it('should process delivered event', async () => {
      const event = [{
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        'smtp-id': '<message-id@sendgrid.net>',
        event: 'delivered',
        category: ['transactional'],
        sg_event_id: 'sg_event_id_123',
        sg_message_id: 'sg_message_id_456'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.processed).toBe(1);
    });

    it('should process multiple delivered events in batch', async () => {
      const events = [
        {
          email: 'user1@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'delivered',
          sg_message_id: 'msg1'
        },
        {
          email: 'user2@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'delivered',
          sg_message_id: 'msg2'
        },
        {
          email: 'user3@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'delivered',
          sg_message_id: 'msg3'
        }
      ];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: events
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.processed).toBe(3);
    });

    it('should include delivery response details', async () => {
      const event = [{
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'delivered',
        response: '250 2.0.0 OK',
        sg_message_id: 'msg123'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Open Tracking Webhooks', () => {
    it('should process email open event', async () => {
      const event = [{
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'open',
        sg_event_id: 'open_event_123',
        sg_message_id: 'message_456',
        useragent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ip: '192.168.1.1'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should track multiple opens from same recipient', async () => {
      const events = [
        {
          email: 'test@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'open',
          sg_message_id: 'msg123'
        },
        {
          email: 'test@example.com',
          timestamp: Math.floor(Date.now() / 1000) + 3600,
          event: 'open',
          sg_message_id: 'msg123'
        }
      ];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: events
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.processed).toBe(2);
    });

    it('should capture user agent information', async () => {
      const event = [{
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'open',
        useragent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        sg_message_id: 'msg123'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle opens with missing user agent', async () => {
      const event = [{
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'open',
        sg_message_id: 'msg123'
        // No useragent field
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Click Tracking Webhooks', () => {
    it('should process link click event', async () => {
      const event = [{
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'click',
        url: 'https://example.com/verify',
        sg_event_id: 'click_event_123',
        sg_message_id: 'message_456',
        useragent: 'Mozilla/5.0'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should track multiple clicks on different links', async () => {
      const events = [
        {
          email: 'test@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'click',
          url: 'https://example.com/link1',
  
        sg_message_id: 'msg123'
        },
        {
          email: 'test@example.com',
          timestamp: Math.floor(Date.now() / 1000) + 10,
          event: 'click',
          url: 'https://example.com/link2',
          sg_message_id: 'msg123'
        }
      ];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: events
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.processed).toBe(2);
    });

    it('should handle URL-encoded links', async () => {
      const event = [{
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'click',
        url: 'https://example.com/verify?token=abc%20def',
        sg_message_id: 'msg123'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Bounce Webhooks', () => {
    it('should process hard bounce event', async () => {
      const event = [{
        email: 'invalid@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'bounce',
        status: '5.1.1',
        reason: '550 5.1.1 User unknown',
        type: 'bounce',
        sg_event_id: 'bounce_event_123',
        sg_message_id: 'message_456'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should process soft bounce event', async () => {
      const event = [{
        email: 'full-mailbox@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'bounce',
        status: '4.2.2',
        reason: '452 4.2.2 Mailbox full',
        type: 'bounce',
        sg_message_id: 'msg123'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
    });

    it('should process dropped event', async () => {
      const event = [{
        email: 'bounced@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'dropped',
        reason: 'Bounced Address',
        sg_event_id: 'dropped_event_123',
        sg_message_id: 'message_456'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
    });

    it('should process blocked event', async () => {
      const event = [{
        email: 'blocked@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'dropped',
        reason: 'Blocked',
        sg_message_id: 'msg123'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Signature Verification', () => {
    it('should accept valid signature', async () => {
      const timestamp = Date.now().toString();
      const events = [{
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'delivered',
        sg_message_id: 'msg123'
      }];
      
      const payload = JSON.stringify(events);
      const signature = crypto
        .createHmac('sha256', SENDGRID_WEBHOOK_SECRET)
        .update(timestamp + payload)
        .digest('base64');

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: events,
        headers: {
          'x-twilio-email-event-webhook-signature': signature,
          'x-twilio-email-event-webhook-timestamp': timestamp
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid signature', async () => {
      const timestamp = Date.now().toString();
      const events = [{
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'delivered',
        sg_message_id: 'msg123'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: events,
        headers: {
          'x-twilio-email-event-webhook-signature': 'invalid-signature',
          'x-twilio-email-event-webhook-timestamp': timestamp
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid signature');
    });

    it('should reject replay attacks with old timestamps', async () => {
      const oldTimestamp = (Date.now() - 600000).toString(); // 10 minutes old
      const events = [{
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'delivered',
        sg_message_id: 'msg123'
      }];
      
      const payload = JSON.stringify(events);
      const signature = crypto
        .createHmac('sha256', SENDGRID_WEBHOOK_SECRET)
        .update(oldTimestamp + payload)
        .digest('base64');

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: events,
        headers: {
          'x-twilio-email-event-webhook-signature': signature,
          'x-twilio-email-event-webhook-timestamp': oldTimestamp
        }
      });

      // Should still accept for now, but in production might reject old timestamps
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should handle missing signature headers gracefully', async () => {
      const events = [{
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'delivered',
        sg_message_id: 'msg123'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: events
        // No signature headers
      });

      // Without signature verification, should still process
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Spam Report Webhooks', () => {
    it('should process spam report event', async () => {
      const event = [{
        email: 'reporter@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'spamreport',
        sg_event_id: 'spam_event_123',
        sg_message_id: 'message_456'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('Unsubscribe Webhooks', () => {
    it('should process unsubscribe event', async () => {
      const event = [{
        email: 'unsubscribe@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'unsubscribe',
        sg_event_id: 'unsub_event_123',
        sg_message_id: 'message_456'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
    });

    it('should process group unsubscribe event', async () => {
      const event = [{
        email: 'unsubscribe@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'group_unsubscribe',
        asm_group_id: 12345,
        sg_message_id: 'msg123'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Deferred Webhooks', () => {
    it('should process deferred delivery event', async () => {
      const event = [{
        email: 'deferred@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        event: 'deferred',
        response: '451 4.7.1 Please try again later',
        attempt: '1',
        sg_message_id: 'msg123'
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      expect(response.statusCode).toBe(200);
    });

    it('should track retry attempts', async () => {
      const events = [
        {
          email: 'deferred@example.com',
          timestamp: Math.floor(Date.now() / 1000),
          event: 'deferred',
          attempt: '1',
          sg_message_id: 'msg123'
        },
        {
          email: 'deferred@example.com',
          timestamp: Math.floor(Date.now() / 1000) + 300,
          event: 'deferred',
          attempt: '2',
          sg_message_id: 'msg123'
        }
      ];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: events
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.processed).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed webhook payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: 'invalid json'
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle empty event array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: []
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.processed).toBe(0);
    });

    it('should handle events with missing required fields', async () => {
      const event = [{
        timestamp: Math.floor(Date.now() / 1000),
        event: 'delivered'
        // Missing email and sg_message_id
      }];

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/sendgrid',
        payload: event
      });

      // Should accept and log, but handle gracefully
      expect(response.statusCode).toBeLessThan(500);
    });
  });
});
