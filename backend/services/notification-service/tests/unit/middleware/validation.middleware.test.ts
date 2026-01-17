import { validateSendRequest, validateBatchSendRequest } from '../../../src/middleware/validation.middleware';
import { logger } from '../../../src/config/logger';

jest.mock('../../../src/config/logger');

describe('Validation Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      body: {}
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('validateSendRequest', () => {
    describe('Channel Validation', () => {
      it('should accept email channel', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@example.com',
          subject: 'Test',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should accept sms channel', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should reject missing channel', async () => {
        mockRequest.body = {
          to: 'user@example.com',
          message: 'Test'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'channel',
                message: 'Channel must be either "email" or "sms"'
              })
            ])
          })
        );
      });

      it('should reject invalid channel', async () => {
        mockRequest.body = {
          channel: 'push',
          to: 'user@example.com',
          message: 'Test'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject numeric channel', async () => {
        mockRequest.body = {
          channel: 123,
          to: 'user@example.com',
          message: 'Test'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });
    });

    describe('Email Validation', () => {
      it('should accept valid email', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@example.com',
          subject: 'Test',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should accept email with subdomain', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@mail.example.com',
          subject: 'Test',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should accept email with plus addressing', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user+tag@example.com',
          subject: 'Test',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should reject invalid email format', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'not-an-email',
          subject: 'Test',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'to',
                message: 'Valid email address is required'
              })
            ])
          })
        );
      });

      it('should reject missing @ in email', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'userexample.com',
          subject: 'Test',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject missing domain', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@',
          subject: 'Test',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject email with spaces', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user name@example.com',
          subject: 'Test',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });
    });

    describe('Phone Number Validation (E.164)', () => {
      it('should accept valid US number', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should accept valid UK number', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+447911123456',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should reject phone without + prefix', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '12025551234',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'to',
                message: expect.stringContaining('E.164')
              })
            ])
          })
        );
      });

      it('should reject phone starting with +0', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+02025551234',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject phone with spaces', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+1 202 555 1234',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject phone with dashes', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+1-202-555-1234',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject too long phone (>15 digits)', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234567890',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });
    });

    describe('Subject Validation (Email)', () => {
      it('should require subject for email', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@example.com',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'subject',
                message: 'Subject is required for email notifications'
              })
            ])
          })
        );
      });

      it('should reject non-string subject', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@example.com',
          subject: 123,
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject subject exceeding 255 characters', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@example.com',
          subject: 'a'.repeat(256),
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'subject',
                message: 'Subject must not exceed 255 characters'
              })
            ])
          })
        );
      });

      it('should accept 255 character subject', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@example.com',
          subject: 'a'.repeat(255),
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should NOT require subject for SMS', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });

    describe('Message Validation', () => {
      it('should require message', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'message',
                message: 'Message is required'
              })
            ])
          })
        );
      });

      it('should reject non-string message', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234',
          message: 123
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject empty message', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234',
          message: ''
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'message',
                message: 'Message cannot be empty'
              })
            ])
          })
        );
      });

      it('should reject message exceeding 10000 characters', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234',
          message: 'a'.repeat(10001)
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'message',
                message: 'Message must not exceed 10000 characters'
              })
            ])
          })
        );
      });

      it('should accept 10000 character message', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234',
          message: 'a'.repeat(10000)
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });

    describe('XSS Sanitization', () => {
      it('should remove script tags from subject', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@example.com',
          subject: 'Test <script>alert("XSS")</script> Subject',
          message: 'Hello'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockRequest.body.subject).toBe('Test  Subject');
      });

      it('should remove iframe tags from message', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234',
          message: 'Hello <iframe src="evil.com"></iframe> World'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockRequest.body.message).toBe('Hello  World');
      });

      it('should remove onclick attributes', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234',
          message: 'Click <a onclick="alert(\'XSS\')">here</a>'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockRequest.body.message).not.toContain('onclick');
      });

      it('should trim whitespace', async () => {
        mockRequest.body = {
          channel: 'sms',
          to: '+12025551234',
          message: '  Hello World  '
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockRequest.body.message).toBe('Hello World');
      });
    });

    describe('Optional Fields', () => {
      it('should accept valid template', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@example.com',
          subject: 'Test',
          message: 'Hello',
          template: 'welcome-email'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should reject non-string template', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@example.com',
          subject: 'Test',
          message: 'Hello',
          template: 123
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should accept valid data object', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@example.com',
          subject: 'Test',
          message: 'Hello',
          data: { name: 'John', age: 30 }
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should reject non-object data', async () => {
        mockRequest.body = {
          channel: 'email',
          to: 'user@example.com',
          subject: 'Test',
          message: 'Hello',
          data: 'not an object'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });
    });

    describe('Logging', () => {
      it('should log validation failures', async () => {
        mockRequest.body = {
          channel: 'invalid'
        };

        await validateSendRequest(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith(
          'Validation failed for send request',
          expect.objectContaining({
            errors: expect.any(Array)
          })
        );
      });
    });
  });

  describe('validateBatchSendRequest', () => {
    describe('Channel Validation', () => {
      it('should accept valid batch request', async () => {
        mockRequest.body = {
          channel: 'email',
          recipients: [
            { to: 'user1@example.com', subject: 'Test', message: 'Hello' }
          ]
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should reject missing channel', async () => {
        mockRequest.body = {
          recipients: []
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });
    });

    describe('Recipients Array Validation', () => {
      it('should reject missing recipients', async () => {
        mockRequest.body = {
          channel: 'email'
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'recipients',
                message: 'Recipients must be an array'
              })
            ])
          })
        );
      });

      it('should reject non-array recipients', async () => {
        mockRequest.body = {
          channel: 'email',
          recipients: 'not an array'
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject empty recipients array', async () => {
        mockRequest.body = {
          channel: 'email',
          recipients: []
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'recipients',
                message: 'Recipients array cannot be empty'
              })
            ])
          })
        );
      });

      it('should reject > 100 recipients', async () => {
        const recipients = Array(101).fill({ to: 'user@example.com', message: 'Test' });
        mockRequest.body = {
          channel: 'email',
          recipients
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'recipients',
                message: 'Recipients array must not exceed 100 items'
              })
            ])
          })
        );
      });

      it('should accept 100 recipients', async () => {
        const recipients = Array(100).fill(null).map(() => ({
          to: 'user@example.com',
          subject: 'Test',
          message: 'Hello'
        }));
        mockRequest.body = {
          channel: 'email',
          recipients
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });

    describe('Individual Recipient Validation', () => {
      it('should validate each recipient email', async () => {
        mockRequest.body = {
          channel: 'email',
          recipients: [
            { to: 'invalid-email', message: 'Test' }
          ]
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'recipients[0].to',
                message: 'Invalid email address'
              })
            ])
          })
        );
      });

      it('should validate multiple recipient errors', async () => {
        mockRequest.body = {
          channel: 'email',
          recipients: [
            { to: 'invalid1', message: 'Test' },
            { to: 'invalid2', message: 'Test' }
          ]
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        const call = mockReply.send.mock.calls[0][0];
        expect(call.errors).toHaveLength(2);
        expect(call.errors[0].field).toBe('recipients[0].to');
        expect(call.errors[1].field).toBe('recipients[1].to');
      });

      it('should validate recipient message length', async () => {
        mockRequest.body = {
          channel: 'email',
          recipients: [
            { to: 'user@example.com', subject: 'Test', message: 'a'.repeat(10001) }
          ]
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'recipients[0].message',
                message: expect.stringContaining('10000')
              })
            ])
          })
        );
      });

      it('should sanitize recipient messages', async () => {
        mockRequest.body = {
          channel: 'email',
          recipients: [
            { to: 'user@example.com', subject: 'Test', message: '<script>alert("XSS")</script>Hello' }
          ]
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockRequest.body.recipients[0].message).toBe('Hello');
      });
    });

    describe('Default Fields', () => {
      it('should accept default template', async () => {
        mockRequest.body = {
          channel: 'email',
          template: 'welcome-email',
          recipients: [
            { to: 'user@example.com' }
          ]
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should accept default subject for email', async () => {
        mockRequest.body = {
          channel: 'email',
          subject: 'Default Subject',
          recipients: [
            { to: 'user@example.com', message: 'Hello' }
          ]
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should accept default message', async () => {
        mockRequest.body = {
          channel: 'email',
          message: 'Default Message',
          recipients: [
            { to: 'user@example.com', subject: 'Test' }
          ]
        };

        await validateBatchSendRequest(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });
  });
});
