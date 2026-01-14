import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { validateSendRequest, validateBatchSendRequest } from '../../../src/middleware/validation.middleware';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('Input Validation Tests', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let replySent: { status?: number; body?: any };

  beforeEach(() => {
    replySent = {};

    mockRequest = {
      body: {}
    };

    mockReply = {
      status: jest.fn((code: number) => {
        replySent.status = code;
        return mockReply as FastifyReply;
      }),
      send: jest.fn((body: any) => {
        replySent.body = body;
        return mockReply as FastifyReply;
      })
    } as any;
  });

  describe('validateSendRequest() - Email Validation', () => {
    it('should reject invalid email addresses', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'invalid-email',
        subject: 'Test',
        message: 'Test message'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.error).toBe('Validation Error');
      expect(replySent.body.errors).toContainEqual({
        field: 'to',
        message: 'Valid email address is required'
      });
    });

    it('should reject email without @ symbol', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'invalidemail.com',
        subject: 'Test',
        message: 'Test message'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
    });

    it('should reject email without domain', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'user@',
        subject: 'Test',
        message: 'Test message'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
    });

    it('should accept valid email addresses', async () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user_name@sub.example.com'
      ];

      for (const email of validEmails) {
        mockRequest.body = {
          channel: 'email',
          to: email,
          subject: 'Test',
          message: 'Test message'
        };

        await validateSendRequest(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(replySent.status).toBeUndefined();
      }
    });
  });

  describe('validateSendRequest() - Phone Number Validation', () => {
    it('should reject invalid phone numbers', async () => {
      const invalidPhones = [
        '1234567890',          // Missing + prefix
        '+123',                // Too short
        '+12345678901234567',  // Too long
        '+0123456789',         // Starts with 0
        'invalid',             // Not a number
        '+1 234 567 8900'      // Contains spaces
      ];

      for (const phone of invalidPhones) {
        mockRequest.body = {
          channel: 'sms',
          to: phone,
          message: 'Test message'
        };

        await validateSendRequest(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(replySent.status).toBe(400);
        expect(replySent.body.errors).toContainEqual({
          field: 'to',
          message: 'Valid phone number in E.164 format is required (e.g., +1234567890)'
        });

        // Reset for next iteration
        replySent = {};
      }
    });

    it('should accept valid E.164 phone numbers', async () => {
      const validPhones = [
        '+1234567890',
        '+12345678901',
        '+123456789012345'
      ];

      for (const phone of validPhones) {
        mockRequest.body = {
          channel: 'sms',
          to: phone,
          message: 'Test message'
        };

        await validateSendRequest(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(replySent.status).toBeUndefined();
      }
    });
  });

  describe('validateSendRequest() - Missing Required Fields', () => {
    it('should reject request without channel', async () => {
      mockRequest.body = {
        to: 'test@example.com',
        subject: 'Test',
        message: 'Test message'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'channel',
        message: 'Channel must be either "email" or "sms"'
      });
    });

    it('should reject request with invalid channel', async () => {
      mockRequest.body = {
        channel: 'push',
        to: 'test@example.com',
        subject: 'Test',
        message: 'Test message'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'channel',
        message: 'Channel must be either "email" or "sms"'
      });
    });

    it('should reject email request without subject', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        message: 'Test message'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'subject',
        message: 'Subject is required for email notifications'
      });
    });

    it('should reject request without message', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: 'Test'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'message',
        message: 'Message is required'
      });
    });

    it('should reject request with empty message', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: 'Test',
        message: ''
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'message',
        message: 'Message cannot be empty'
      });
    });
  });

  describe('validateSendRequest() - Content Length Limits', () => {
    it('should reject subject exceeding max length', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: 'a'.repeat(256), // Max is 255
        message: 'Test message'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'subject',
        message: 'Subject must not exceed 255 characters'
      });
    });

    it('should reject message exceeding max length', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: 'Test',
        message: 'a'.repeat(10001) // Max is 10000
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'message',
        message: 'Message must not exceed 10000 characters'
      });
    });

    it('should accept subject at max length', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: 'a'.repeat(255),
        message: 'Test message'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBeUndefined();
    });
  });

  describe('validateSendRequest() - XSS Protection', () => {
    it('should sanitize script tags from subject', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: 'Test <script>alert("xss")</script> Subject',
        message: 'Test message'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBeUndefined();
      expect((mockRequest.body as any).subject).not.toContain('<script>');
    });

    it('should sanitize iframe tags from message', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: 'Test',
        message: 'Test <iframe src="evil.com"></iframe> message'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBeUndefined();
      expect((mockRequest.body as any).message).not.toContain('<iframe>');
    });

    it('should sanitize event handlers', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: 'Test',
        message: '<div onclick="alert(\'xss\')">Click me</div>'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBeUndefined();
      expect((mockRequest.body as any).message).not.toContain('onclick');
    });
  });

  describe('validateBatchSendRequest() - Batch Validation', () => {
    it('should reject request without recipients array', async () => {
      mockRequest.body = {
        channel: 'email'
      };

      await validateBatchSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'recipients',
        message: 'Recipients must be an array'
      });
    });

    it('should reject request with empty recipients array', async () => {
      mockRequest.body = {
        channel: 'email',
        recipients: []
      };

      await validateBatchSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'recipients',
        message: 'Recipients array cannot be empty'
      });
    });

    it('should reject request exceeding max recipients', async () => {
      mockRequest.body = {
        channel: 'email',
        recipients: Array(101).fill({ to: 'test@example.com', message: 'Test' })
      };

      await validateBatchSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'recipients',
        message: 'Recipients array must not exceed 100 items'
      });
    });

    it('should validate each recipient in batch', async () => {
      mockRequest.body = {
        channel: 'email',
        recipients: [
          { to: 'valid@example.com', message: 'Test 1' },
          { to: 'invalid-email', message: 'Test 2' },
          { to: 'another@example.com', message: 'Test 3' }
        ]
      };

      await validateBatchSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'recipients[1].to',
        message: 'Invalid email address'
      });
    });

    it('should accept valid batch request', async () => {
      mockRequest.body = {
        channel: 'email',
        recipients: [
          { to: 'user1@example.com', subject: 'Test 1', message: 'Message 1' },
          { to: 'user2@example.com', subject: 'Test 2', message: 'Message 2' }
        ]
      };

      await validateBatchSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBeUndefined();
    });
  });

  describe('validateSendRequest() - Type Validation', () => {
    it('should reject non-string subject', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: 12345,
        message: 'Test message'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'subject',
        message: 'Subject is required for email notifications'
      });
    });

    it('should reject non-string message', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: 'Test',
        message: { text: 'message' }
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'message',
        message: 'Message is required'
      });
    });

    it('should reject non-object data', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: 'Test',
        message: 'Test message',
        data: 'invalid'
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors).toContainEqual({
        field: 'data',
        message: 'Data must be an object'
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple validation errors', async () => {
      mockRequest.body = {
        channel: 'invalid',
        to: 'invalid-email',
        subject: '',
        message: ''
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(400);
      expect(replySent.body.errors.length).toBeGreaterThan(1);
    });

    it('should trim whitespace from inputs', async () => {
      mockRequest.body = {
        channel: 'email',
        to: 'test@example.com',
        subject: '  Test Subject  ',
        message: '  Test Message  '
      };

      await validateSendRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBeUndefined();
      expect((mockRequest.body as any).subject).toBe('Test Subject');
      expect((mockRequest.body as any).message).toBe('Test Message');
    });
  });
});
