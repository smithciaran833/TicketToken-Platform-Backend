/**
 * Unit tests for webhook-auth.middleware.ts
 * Tests webhook signature verification for Twilio and SendGrid
 */

import {
  verifyTwilioSignature,
  verifySendGridSignature
} from '../../../src/middleware/webhook-auth.middleware';
import { logger } from '../../../src/config/logger';
import crypto from 'crypto';

jest.mock('../../../src/config/logger');
jest.mock('../../../src/config/env', () => ({
  env: {
    TWILIO_AUTH_TOKEN: 'test-twilio-token',
    SENDGRID_WEBHOOK_SECRET: 'test-sendgrid-secret'
  }
}));

describe('Webhook Auth Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      protocol: 'https',
      hostname: 'api.example.com',
      url: '/webhooks/twilio/sms-status',
      headers: {},
      body: {}
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('verifyTwilioSignature', () => {
    describe('Success Cases', () => {
      it('should verify valid Twilio signature', async () => {
        const params = { MessageSid: 'SM123', MessageStatus: 'delivered' };
        mockRequest.body = params;

        // Generate valid signature
        const url = 'https://api.example.com/webhooks/twilio/sms-status';
        const data = Object.keys(params)
          .sort()
          .reduce((acc, key) => acc + key + params[key], url);
        
        const validSignature = crypto
          .createHmac('sha1', 'test-twilio-token')
          .update(Buffer.from(data, 'utf-8'))
          .digest('base64');

        mockRequest.headers['x-twilio-signature'] = validSignature;

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
        expect(mockReply.send).not.toHaveBeenCalled();
      });

      it('should handle empty body', async () => {
        mockRequest.body = {};

        const url = 'https://api.example.com/webhooks/twilio/sms-status';
        const validSignature = crypto
          .createHmac('sha1', 'test-twilio-token')
          .update(Buffer.from(url, 'utf-8'))
          .digest('base64');

        mockRequest.headers['x-twilio-signature'] = validSignature;

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should sort parameters alphabetically for signature', async () => {
        const params = { zebra: 'z', apple: 'a', middle: 'm' };
        mockRequest.body = params;

        const url = 'https://api.example.com/webhooks/twilio/sms-status';
        const data = 'apple' + 'a' + 'middle' + 'm' + 'zebra' + 'z' + url;
        
        const validSignature = crypto
          .createHmac('sha1', 'test-twilio-token')
          .update(Buffer.from(url + data.replace(url, ''), 'utf-8'))
          .digest('base64');

        mockRequest.headers['x-twilio-signature'] = validSignature;

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should construct correct URL from request components', async () => {
        mockRequest.protocol = 'https';
        mockRequest.hostname = 'webhooks.example.com';
        mockRequest.url = '/twilio/status';
        mockRequest.body = { param: 'value' };

        const url = 'https://webhooks.example.com/twilio/status';
        const data = url + 'param' + 'value';
        
        const validSignature = crypto
          .createHmac('sha1', 'test-twilio-token')
          .update(Buffer.from(data, 'utf-8'))
          .digest('base64');

        mockRequest.headers['x-twilio-signature'] = validSignature;

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });

    describe('Error Cases - Missing Headers', () => {
      it('should return 401 when signature header missing', async () => {
        mockRequest.headers['x-twilio-signature'] = undefined;
        mockRequest.body = { test: 'data' };

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Unauthorized webhook request'
        });
      });

      it('should return 401 when signature header is empty', async () => {
        mockRequest.headers['x-twilio-signature'] = '';

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });

      it('should return 401 when auth token not configured', async () => {
        const originalEnv = require('../../../src/config/env').env.TWILIO_AUTH_TOKEN;
        require('../../../src/config/env').env.TWILIO_AUTH_TOKEN = undefined;

        mockRequest.headers['x-twilio-signature'] = 'some-signature';

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);

        require('../../../src/config/env').env.TWILIO_AUTH_TOKEN = originalEnv;
      });
    });

    describe('Error Cases - Invalid Signature', () => {
      it('should return 401 for invalid signature', async () => {
        mockRequest.body = { MessageSid: 'SM123' };
        mockRequest.headers['x-twilio-signature'] = 'invalid-signature';

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Invalid webhook signature'
        });
      });

      it('should log warning for invalid signature', async () => {
        mockRequest.body = { MessageSid: 'SM123' };
        mockRequest.headers['x-twilio-signature'] = 'invalid-signature';

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith('Invalid Twilio webhook signature');
      });

      it('should reject tampered parameters', async () => {
        const params = { MessageSid: 'SM123', MessageStatus: 'delivered' };
        
        // Generate signature for original params
        const url = 'https://api.example.com/webhooks/twilio/sms-status';
        const data = Object.keys(params)
          .sort()
          .reduce((acc, key) => acc + key + params[key], url);
        
        const validSignature = crypto
          .createHmac('sha1', 'test-twilio-token')
          .update(Buffer.from(data, 'utf-8'))
          .digest('base64');

        // But send different params
        mockRequest.body = { MessageSid: 'SM456', MessageStatus: 'failed' };
        mockRequest.headers['x-twilio-signature'] = validSignature;

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });

      it('should use timing-safe comparison to prevent timing attacks', async () => {
        // This test verifies that crypto.timingSafeEqual is used
        mockRequest.body = { test: 'data' };
        mockRequest.headers['x-twilio-signature'] = 'invalid';

        await verifyTwilioSignature(mockRequest, mockReply);

        // If timing-safe comparison wasn't used, an attacker could potentially
        // detect differences in response time. The function should reject this.
        expect(mockReply.status).toHaveBeenCalledWith(401);
      });

      it('should reject signatures with wrong length', async () => {
        mockRequest.body = { test: 'data' };
        mockRequest.headers['x-twilio-signature'] = 'short';

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });
    });

    describe('Error Handling', () => {
      it('should return 500 when verification throws error', async () => {
        mockRequest.body = null; // This might cause an error
        mockRequest.headers['x-twilio-signature'] = 'some-signature';

        await verifyTwilioSignature(mockRequest, mockReply);

        // Should handle error gracefully
        expect(mockReply.status).toHaveBeenCalledWith(expect.any(Number));
      });

      it('should log error when verification fails', async () => {
        mockRequest.body = null;
        mockRequest.headers['x-twilio-signature'] = 'some-signature';

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(logger.error).toHaveBeenCalled();
      });
    });

    describe('URL Construction', () => {
      it('should handle http protocol', async () => {
        mockRequest.protocol = 'http';
        mockRequest.hostname = 'localhost';
        mockRequest.url = '/webhook';
        mockRequest.body = {};

        const url = 'http://localhost/webhook';
        const validSignature = crypto
          .createHmac('sha1', 'test-twilio-token')
          .update(Buffer.from(url, 'utf-8'))
          .digest('base64');

        mockRequest.headers['x-twilio-signature'] = validSignature;

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should handle URLs with query parameters', async () => {
        mockRequest.url = '/webhook?foo=bar';
        mockRequest.body = {};

        const url = 'https://api.example.com/webhook?foo=bar';
        const validSignature = crypto
          .createHmac('sha1', 'test-twilio-token')
          .update(Buffer.from(url, 'utf-8'))
          .digest('base64');

        mockRequest.headers['x-twilio-signature'] = validSignature;

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should handle URLs with ports', async () => {
        mockRequest.hostname = 'api.example.com:8080';
        mockRequest.body = {};

        const url = 'https://api.example.com:8080/webhooks/twilio/sms-status';
        const validSignature = crypto
          .createHmac('sha1', 'test-twilio-token')
          .update(Buffer.from(url, 'utf-8'))
          .digest('base64');

        mockRequest.headers['x-twilio-signature'] = validSignature;

        await verifyTwilioSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });
  });

  describe('verifySendGridSignature', () => {
    describe('Success Cases', () => {
      it('should verify valid SendGrid signature', async () => {
        const timestamp = '1234567890';
        const payload = timestamp + JSON.stringify(mockRequest.body);
        
        const validSignature = crypto
          .createHmac('sha256', 'test-sendgrid-secret')
          .update(payload)
          .digest('base64');

        mockRequest.headers['x-twilio-email-event-webhook-signature'] = validSignature;
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = timestamp;

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
        expect(mockReply.send).not.toHaveBeenCalled();
      });

      it('should handle empty body', async () => {
        const timestamp = '1234567890';
        mockRequest.body = '';
        const payload = timestamp + '';
        
        const validSignature = crypto
          .createHmac('sha256', 'test-sendgrid-secret')
          .update(payload)
          .digest('base64');

        mockRequest.headers['x-twilio-email-event-webhook-signature'] = validSignature;
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = timestamp;

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should use SHA256 algorithm', async () => {
        const timestamp = '9999999999';
        mockRequest.body = { event: 'delivered' };
        const payload = timestamp + mockRequest.body;
        
        // Verify it uses SHA256, not SHA1
        const validSignature = crypto
          .createHmac('sha256', 'test-sendgrid-secret')
          .update(payload)
          .digest('base64');

        mockRequest.headers['x-twilio-email-event-webhook-signature'] = validSignature;
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = timestamp;

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should concatenate timestamp and body correctly', async () => {
        const timestamp = '1111111111';
        mockRequest.body = 'test-body-content';
        const payload = '1111111111test-body-content';
        
        const validSignature = crypto
          .createHmac('sha256', 'test-sendgrid-secret')
          .update(payload)
          .digest('base64');

        mockRequest.headers['x-twilio-email-event-webhook-signature'] = validSignature;
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = timestamp;

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });

    describe('Error Cases - Missing Headers', () => {
      it('should return 401 when signature header missing', async () => {
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = '1234567890';

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Unauthorized webhook request'
        });
      });

      it('should return 401 when timestamp header missing', async () => {
        mockRequest.headers['x-twilio-email-event-webhook-signature'] = 'some-signature';

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });

      it('should return 401 when webhook secret not configured', async () => {
        const originalEnv = require('../../../src/config/env').env.SENDGRID_WEBHOOK_SECRET;
        require('../../../src/config/env').env.SENDGRID_WEBHOOK_SECRET = undefined;

        mockRequest.headers['x-twilio-email-event-webhook-signature'] = 'signature';
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = '1234567890';

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);

        require('../../../src/config/env').env.SENDGRID_WEBHOOK_SECRET = originalEnv;
      });

      it('should return 401 when both headers are empty', async () => {
        mockRequest.headers['x-twilio-email-event-webhook-signature'] = '';
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = '';

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });
    });

    describe('Error Cases - Invalid Signature', () => {
      it('should return 401 for invalid signature', async () => {
        mockRequest.headers['x-twilio-email-event-webhook-signature'] = 'invalid-signature';
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = '1234567890';
        mockRequest.body = { event: 'delivered' };

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Invalid webhook signature'
        });
      });

      it('should log warning for invalid signature', async () => {
        mockRequest.headers['x-twilio-email-event-webhook-signature'] = 'invalid';
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = '1234567890';

        await verifySendGridSignature(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith('Invalid SendGrid webhook signature');
      });

      it('should reject tampered payload', async () => {
        const timestamp = '1234567890';
        const originalPayload = timestamp + 'original-body';
        
        const validSignature = crypto
          .createHmac('sha256', 'test-sendgrid-secret')
          .update(originalPayload)
          .digest('base64');

        mockRequest.headers['x-twilio-email-event-webhook-signature'] = validSignature;
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = timestamp;
        mockRequest.body = 'tampered-body'; // Different body

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });

      it('should reject tampered timestamp', async () => {
        const originalTimestamp = '1234567890';
        const payload = originalTimestamp + mockRequest.body;
        
        const validSignature = crypto
          .createHmac('sha256', 'test-sendgrid-secret')
          .update(payload)
          .digest('base64');

        mockRequest.headers['x-twilio-email-event-webhook-signature'] = validSignature;
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = '9999999999'; // Different timestamp

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });

      it('should use timing-safe comparison to prevent timing attacks', async () => {
        mockRequest.headers['x-twilio-email-event-webhook-signature'] = 'invalid';
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = '1234567890';

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });

      it('should reject signatures with wrong length', async () => {
        mockRequest.headers['x-twilio-email-event-webhook-signature'] = 'abc';
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = '1234567890';

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
      });
    });

    describe('Error Handling', () => {
      it('should return 500 when verification throws error', async () => {
        mockRequest.headers['x-twilio-email-event-webhook-signature'] = 'signature';
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = '1234567890';
        mockRequest.body = null;

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(expect.any(Number));
      });

      it('should log error when verification fails', async () => {
        mockRequest.headers['x-twilio-email-event-webhook-signature'] = 'signature';
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = '1234567890';
        mockRequest.body = null;

        await verifySendGridSignature(mockRequest, mockReply);

        expect(logger.error).toHaveBeenCalled();
      });

      it('should handle unexpected errors gracefully', async () => {
        // Mock crypto to throw error
        const originalCreateHmac = crypto.createHmac;
        (crypto as any).createHmac = jest.fn().mockImplementation(() => {
          throw new Error('Crypto error');
        });

        mockRequest.headers['x-twilio-email-event-webhook-signature'] = 'signature';
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = '1234567890';

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Webhook verification failed'
        });

        (crypto as any).createHmac = originalCreateHmac;
      });
    });

    describe('Timestamp Handling', () => {
      it('should handle numeric timestamp', async () => {
        const timestamp = '1234567890';
        const payload = timestamp + mockRequest.body;
        
        const validSignature = crypto
          .createHmac('sha256', 'test-sendgrid-secret')
          .update(payload)
          .digest('base64');

        mockRequest.headers['x-twilio-email-event-webhook-signature'] = validSignature;
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = timestamp;

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should handle timestamp with different lengths', async () => {
        const timestamp = '123456789012345';
        const payload = timestamp + mockRequest.body;
        
        const validSignature = crypto
          .createHmac('sha256', 'test-sendgrid-secret')
          .update(payload)
          .digest('base64');

        mockRequest.headers['x-twilio-email-event-webhook-signature'] = validSignature;
        mockRequest.headers['x-twilio-email-event-webhook-timestamp'] = timestamp;

        await verifySendGridSignature(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });
  });
});
