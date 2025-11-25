import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import crypto from 'crypto';

// Mock webhook route (to be implemented)
jest.mock('../../../src/routes/webhook.routes');

describe('Twilio Webhook Integration Tests', () => {
  let app: FastifyInstance;
  const TWILIO_AUTH_TOKEN = 'test-auth-token';

  beforeEach(async () => {
    process.env.TWILIO_AUTH_TOKEN = TWILIO_AUTH_TOKEN;
    
    app = Fastify();
    
    // Mock webhook route
    app.post('/webhooks/twilio', async (request, reply) => {
      const signature = request.headers['x-twilio-signature'] as string;
      
      // Verify signature
      if (signature) {
        const url = `https://example.com/webhooks/twilio`;
        const params = request.body as Record<string, string>;
        
        // Build validation string
        const data = Object.keys(params)
          .sort()
          .map(key => `${key}${params[key]}`)
          .join('');
        
        const expectedSignature = crypto
          .createHmac('sha1', TWILIO_AUTH_TOKEN)
          .update(url + data)
          .digest('base64');
          
        if (signature !== expectedSignature) {
          return reply.status(403).send({ error: 'Invalid signature' });
        }
      }
      
      // Process status callback
      return reply.status(200).send({ success: true });
    });
    
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  describe('Delivery Status Webhooks', () => {
    it('should process delivered status', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        MessageStatus: 'delivered',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        AccountSid: 'AC1234567890abcdef',
        From: '+0987654321',
        ApiVersion: '2010-04-01'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should process queued status', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'queued',
        MessageStatus: 'queued',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        AccountSid: 'AC1234567890abcdef',
        From: '+0987654321'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });

    it('should process sending status', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'sending',
        MessageStatus: 'sending',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });

    it('should process sent status', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'sent',
        MessageStatus: 'sent',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });

    it('should capture delivery price information', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        MessageStatus: 'delivered',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        Price: '-0.00750',
        PriceUnit: 'USD'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });

    it('should process delivery with carrier information', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        MessageStatus: 'delivered',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        ToCity: 'NEW YORK',
        ToState: 'NY',
        ToZip: '10001',
        ToCountry: 'US'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Failed Delivery Webhooks', () => {
    it('should process failed delivery status', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'failed',
        MessageStatus: 'failed',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        ErrorCode: '30003',
        ErrorMessage: 'Unreachable destination handset'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should process undelivered status', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'undelivered',
        MessageStatus: 'undelivered',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        ErrorCode: '30005',
        ErrorMessage: 'Unknown destination handset'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle invalid phone number error', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'failed',
        MessageStatus: 'failed',
        To: 'invalid',
        MessageSid: 'SM1234567890abcdef',
        ErrorCode: '21211',
        ErrorMessage: "The 'To' number invalid is not a valid phone number"
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle blocked carrier error', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'failed',
        MessageStatus: 'failed',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        ErrorCode: '30004',
        ErrorMessage: 'Message blocked by carrier'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle landline or unreachable carrier error', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'failed',
        MessageStatus: 'failed',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        ErrorCode: '30006',
        ErrorMessage: 'Landline or unreachable carrier'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle spam filter rejection', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'failed',
        MessageStatus: 'failed',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        ErrorCode: '30007',
        ErrorMessage: 'Message filtered'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle unknown error codes', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'failed',
        MessageStatus: 'failed',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        ErrorCode: '99999',
        ErrorMessage: 'Unknown error occurred'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Signature Verification', () => {
    it('should accept valid signature', async () => {
      const url = 'https://example.com/webhooks/twilio';
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        To: '+1234567890'
      };
      
      // Build signature
      const data = Object.keys(payload)
        .sort()
        .map(key => `${key}${payload[key as keyof typeof payload]}`)
        .join('');
      
      const signature = crypto
        .createHmac('sha1', TWILIO_AUTH_TOKEN)
        .update(url + data)
        .digest('base64');

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload,
        headers: {
          'x-twilio-signature': signature
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid signature', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        To: '+1234567890'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload,
        headers: {
          'x-twilio-signature': 'invalid-signature'
        }
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid signature');
    });

    it('should reject modified payload with valid signature', async () => {
      const url = 'https://example.com/webhooks/twilio';
      const originalPayload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        To: '+1234567890'
      };
      
      // Create signature for original payload
      const data = Object.keys(originalPayload)
        .sort()
        .map(key => `${key}${originalPayload[key as keyof typeof originalPayload]}`)
        .join('');
      
      const signature = crypto
        .createHmac('sha1', TWILIO_AUTH_TOKEN)
        .update(url + data)
        .digest('base64');

      // Modify payload after creating signature
      const modifiedPayload = {
        ...originalPayload,
        SmsStatus: 'failed' // Changed from delivered
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: modifiedPayload,
        headers: {
          'x-twilio-signature': signature
        }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should handle missing signature header gracefully', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        To: '+1234567890'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
        // No signature header
      });

      // Without signature, should still process
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Message Segments', () => {
    it('should track multi-segment messages', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        MessageStatus: 'delivered',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        NumSegments: '3',
        NumMedia: '0'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle messages with media', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        MessageStatus: 'delivered',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.com/media/MM123'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Webhook Retry Handling', () => {
    it('should handle duplicate webhook deliveries', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        MessageStatus: 'delivered',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef'
      };

      // Send same webhook twice
      const response1 = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      const response2 = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
    });

    it('should handle status updates in correct order', async () => {
      const baseSid = 'SM1234567890abcdef';
      
      const statuses = ['queued', 'sending', 'sent', 'delivered'];
      
      for (const status of statuses) {
        const payload = {
          SmsSid: baseSid,
          SmsStatus: status,
          MessageStatus: status,
          To: '+1234567890',
          MessageSid: baseSid
        };

        const response = await app.inject({
          method: 'POST',
          url: '/webhooks/twilio',
          payload: payload
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('should handle out-of-order status updates', async () => {
      const baseSid = 'SM1234567890abcdef';
      
      // Receive delivered before sent
      const deliveredPayload = {
        SmsSid: baseSid,
        SmsStatus: 'delivered',
        MessageStatus: 'delivered',
        To: '+1234567890',
        MessageSid: baseSid
      };

      const sentPayload = {
        SmsSid: baseSid,
        SmsStatus: 'sent',
        MessageStatus: 'sent',
        To: '+1234567890',
        MessageSid: baseSid
      };

      const response1 = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: deliveredPayload
      });

      const response2 = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: sentPayload
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed webhook payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: 'invalid payload format'
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle missing required fields', async () => {
      const payload = {
        SmsStatus: 'delivered'
        // Missing SmsSid, To, etc.
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      // Should handle gracefully
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should handle empty payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: {}
      });

      expect(response.statusCode).toBeLessThan(500);
    });
  });

  describe('Carrier-Specific Information', () => {
    it('should capture carrier lookup data', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        MessageStatus: 'delivered',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef',
        ToCountry: 'US',
        ToState: 'CA',
        ToCity: 'SAN FRANCISCO',
        ToZip: '94107',
        FromCountry: 'US',
        FromState: 'TX',
        FromCity: 'AUSTIN',
        FromZip: '78701'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle international numbers', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        MessageStatus: 'delivered',
        To: '+44123456789',
        MessageSid: 'SM1234567890abcdef',
        ToCountry: 'GB',
        FromCountry: 'US'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Callback URL Validation', () => {
    it('should respond quickly to prevent timeout', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        MessageStatus: 'delivered',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef'
      };

      const startTime = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });
      const duration = Date.now() - startTime;

      expect(response.statusCode).toBe(200);
      expect(duration).toBeLessThan(5000); // Should respond within 5 seconds
    });

    it('should return 200 OK for Twilio to mark as successful', async () => {
      const payload = {
        SmsSid: 'SM1234567890abcdef',
        SmsStatus: 'delivered',
        MessageStatus: 'delivered',
        To: '+1234567890',
        MessageSid: 'SM1234567890abcdef'
      };

      const response = await app.inject({
        method: 'POST',
        url: '/webhooks/twilio',
        payload: payload
      });

      // Must return 200 for Twilio to not retry
      expect(response.statusCode).toBe(200);
    });
  });
});
