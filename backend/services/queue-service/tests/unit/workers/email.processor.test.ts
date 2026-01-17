// Set environment BEFORE any imports
process.env.SENDGRID_API_KEY = 'test-sendgrid-key';
process.env.SENDGRID_FROM_EMAIL = 'test@tickettoken.com';
process.env.SENDGRID_FROM_NAME = 'Test TicketToken';

// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock IdempotencyService
jest.mock('../../../src/services/idempotency.service', () => ({
  IdempotencyService: jest.fn().mockImplementation(() => ({
    generateKey: jest.fn().mockReturnValue('email-idem-key'),
    check: jest.fn().mockResolvedValue(null),
    store: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock RateLimiterService
jest.mock('../../../src/services/rate-limiter.service', () => ({
  RateLimiterService: {
    getInstance: jest.fn().mockReturnValue({
      acquire: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    }),
  },
}));

// Mock SendGrid - must be before import
const mockSgMailSend = jest.fn();
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: mockSgMailSend,
}));

import { EmailProcessor } from '../../../src/workers/communication/email.processor';
import { BullJobData } from '../../../src/adapters/bull-job-adapter';
import { EmailJobData } from '../../../src/types/job.types';
import { IdempotencyService } from '../../../src/services/idempotency.service';
import { RateLimiterService } from '../../../src/services/rate-limiter.service';
import { logger } from '../../../src/utils/logger';

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let mockJob: BullJobData<EmailJobData>;
  let mockIdempotencyService: any;
  let mockRateLimiter: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockIdempotencyService = {
      generateKey: jest.fn().mockReturnValue('email-idem-key'),
      check: jest.fn().mockResolvedValue(null),
      store: jest.fn().mockResolvedValue(undefined),
    };

    mockRateLimiter = {
      acquire: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    (IdempotencyService as jest.Mock).mockImplementation(() => mockIdempotencyService);
    (RateLimiterService.getInstance as jest.Mock).mockReturnValue(mockRateLimiter);

    // Mock SendGrid send - successful response
    mockSgMailSend.mockResolvedValue([
      {
        statusCode: 202,
        headers: { 'x-message-id': 'sg-msg-123' },
      },
    ]);

    processor = new EmailProcessor();

    mockJob = {
      id: 'email-job-123',
      name: 'send-email',
      data: {
        to: 'customer@example.com',
        template: 'ticket-purchase',
        data: {
          orderId: 'order-456',
          eventName: 'Amazing Concert',
          ticketCount: 2,
          total: '150.00',
        },
      },
      attemptsMade: 0,
      opts: { priority: 5 },
      queue: { name: 'communication' },
    };
  });

  describe('process', () => {
    it('should send email successfully', async () => {
      const result = await processor.process(mockJob);

      expect(result.success).toBe(true);
      expect(result.data.messageId).toBe('sg-msg-123');
      expect(result.data.to).toBe('customer@example.com');
      expect(result.data.template).toBe('ticket-purchase');
      expect(result.data.statusCode).toBe(202);
    });

    it('should check idempotency before sending', async () => {
      await processor.process(mockJob);

      expect(mockIdempotencyService.generateKey).toHaveBeenCalledWith(
        'send-email',
        mockJob.data
      );
      expect(mockIdempotencyService.check).toHaveBeenCalledWith('email-idem-key');
    });

    it('should return existing result if already sent', async () => {
      const existingResult = {
        success: true,
        data: { messageId: 'already-sent', alreadySent: true },
      };
      mockIdempotencyService.check.mockResolvedValue(existingResult);

      const result = await processor.process(mockJob);

      expect(result).toEqual(existingResult);
      expect(mockSgMailSend).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Email already sent today')
      );
    });

    it('should store result for idempotency (24 hours)', async () => {
      await processor.process(mockJob);

      expect(mockIdempotencyService.store).toHaveBeenCalledWith(
        'email-idem-key',
        'communication',
        'send-email',
        expect.objectContaining({ success: true }),
        24 * 60 * 60
      );
    });

    it('should acquire and release rate limit', async () => {
      await processor.process(mockJob);

      expect(mockRateLimiter.acquire).toHaveBeenCalledWith('sendgrid', 5);
      expect(mockRateLimiter.release).toHaveBeenCalledWith('sendgrid');
    });

    it('should release rate limit even on error', async () => {
      mockSgMailSend.mockRejectedValue(new Error('API error'));

      await expect(processor.process(mockJob)).rejects.toThrow('API error');

      expect(mockRateLimiter.release).toHaveBeenCalledWith('sendgrid');
    });

    it('should log email sending start', async () => {
      await processor.process(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Sending email:',
        expect.objectContaining({
          to: 'customer@example.com',
          template: 'ticket-purchase',
        })
      );
    });

    it('should log successful send', async () => {
      await processor.process(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Email sent successfully',
        expect.objectContaining({
          to: 'customer@example.com',
          messageId: 'sg-msg-123',
        })
      );
    });
  });

  describe('SendGrid integration', () => {
    it('should send with correct message structure', async () => {
      await processor.process(mockJob);

      expect(mockSgMailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['customer@example.com'],
          from: {
            email: 'test@tickettoken.com',
            name: 'Test TicketToken',
          },
          templateId: 'd-ticket-purchase-template-id',
          dynamicTemplateData: expect.objectContaining({
            orderId: 'order-456',
            eventName: 'Amazing Concert',
            ticketCount: 2,
            company: 'TicketToken',
          }),
        })
      );
    });

    it('should handle array of recipients', async () => {
      mockJob.data.to = ['user1@example.com', 'user2@example.com'];

      await processor.process(mockJob);

      expect(mockSgMailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['user1@example.com', 'user2@example.com'],
        })
      );
    });

    it('should include cc when provided', async () => {
      (mockJob.data as any).cc = 'cc@example.com';

      await processor.process(mockJob);

      expect(mockSgMailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: ['cc@example.com'],
        })
      );
    });

    it('should include bcc when provided', async () => {
      (mockJob.data as any).bcc = ['bcc1@example.com', 'bcc2@example.com'];

      await processor.process(mockJob);

      expect(mockSgMailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          bcc: ['bcc1@example.com', 'bcc2@example.com'],
        })
      );
    });

    it('should include replyTo when provided', async () => {
      (mockJob.data as any).replyTo = 'support@tickettoken.com';

      await processor.process(mockJob);

      expect(mockSgMailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'support@tickettoken.com',
        })
      );
    });

    it('should use custom subject when provided', async () => {
      (mockJob.data as any).subject = 'Custom Subject Line';

      await processor.process(mockJob);

      expect(mockSgMailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Custom Subject Line',
        })
      );
    });

    it('should use default subject when not provided', async () => {
      await processor.process(mockJob);

      expect(mockSgMailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Your TicketToken Purchase Confirmation',
        })
      );
    });

    it('should handle unknown template with fallback HTML', async () => {
      mockJob.data.template = 'unknown-template';

      await processor.process(mockJob);

      expect(mockSgMailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Message from TicketToken',
          html: expect.stringContaining('<!DOCTYPE html>'),
          text: expect.any(String),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {
      mockSgMailSend.mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(processor.process(mockJob)).rejects.toThrow(
        'Rate limit exceeded - will retry with backoff'
      );
    });

    it('should handle 429 errors', async () => {
      mockSgMailSend.mockRejectedValue(new Error('HTTP 429 Too Many Requests'));

      await expect(processor.process(mockJob)).rejects.toThrow(
        'Rate limit exceeded - will retry with backoff'
      );
    });

    it('should return failure for invalid email errors', async () => {
      mockSgMailSend.mockRejectedValue(new Error('invalid email address'));

      const result = await processor.process(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid recipient');
    });

    it('should return failure for bounce errors', async () => {
      mockSgMailSend.mockRejectedValue(new Error('email bounce detected'));

      const result = await processor.process(mockJob);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid recipient');
    });

    it('should throw for SendGrid 429 response', async () => {
      const error: any = new Error('SendGrid error');
      error.response = { statusCode: 429, body: { errors: [] } };
      mockSgMailSend.mockRejectedValue(error);

      await expect(processor.process(mockJob)).rejects.toThrow(
        'SendGrid rate limit exceeded'
      );
    });

    it('should throw for SendGrid 400 response', async () => {
      const error: any = new Error('SendGrid error');
      error.response = {
        statusCode: 400,
        body: { errors: [{ message: 'Invalid field' }] },
      };
      mockSgMailSend.mockRejectedValue(error);

      await expect(processor.process(mockJob)).rejects.toThrow(
        'SendGrid validation error'
      );
    });

    it('should throw unexpected errors', async () => {
      mockSgMailSend.mockRejectedValue(new Error('Network failure'));

      await expect(processor.process(mockJob)).rejects.toThrow('Network failure');
    });
  });

  describe('HTML content generation', () => {
    beforeEach(() => {
      mockJob.data.template = 'custom-unknown-template';
    });

    it('should build HTML content for unknown templates', async () => {
      await processor.process(mockJob);

      expect(mockSgMailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('<!DOCTYPE html>'),
          text: expect.any(String),
        })
      );
    });

    it('should include current year in footer', async () => {
      await processor.process(mockJob);

      const call = mockSgMailSend.mock.calls[0][0];
      expect(call.html).toContain(new Date().getFullYear().toString());
      expect(call.text).toContain(new Date().getFullYear().toString());
    });
  });

  describe('template-specific content', () => {
    it('should generate ticket-purchase HTML for unknown template', async () => {
      mockJob.data.template = 'some-unknown-template';
      mockJob.data.data = {
        orderId: 'ORD-123',
        eventName: 'Test Event',
        ticketCount: 3,
        total: '225.00',
        viewOrderUrl: 'https://example.com/order/123',
      };

      await processor.process(mockJob);

      const call = mockSgMailSend.mock.calls[0][0];
      expect(call.html).toContain('TicketToken');
    });

    it('should generate password-reset content', async () => {
      mockJob.data.template = 'password-reset';
      mockJob.data.data = {
        resetUrl: 'https://example.com/reset/token123',
      };

      await processor.process(mockJob);

      expect(mockSgMailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'd-password-reset-template-id',
          dynamicTemplateData: expect.objectContaining({
            resetUrl: 'https://example.com/reset/token123',
          }),
        })
      );
    });

    it('should generate welcome content', async () => {
      mockJob.data.template = 'welcome';
      mockJob.data.data = {
        name: 'John Doe',
        dashboardUrl: 'https://example.com/dashboard',
      };

      await processor.process(mockJob);

      expect(mockSgMailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'd-welcome-template-id',
          dynamicTemplateData: expect.objectContaining({
            name: 'John Doe',
            dashboardUrl: 'https://example.com/dashboard',
          }),
        })
      );
    });
  });

  describe('default subjects', () => {
    const templates = [
      ['ticket-purchase', 'Your TicketToken Purchase Confirmation'],
      ['ticket-confirmation', 'Your Tickets Are Ready!'],
      ['order-receipt', 'Your Order Receipt'],
      ['password-reset', 'Reset Your Password'],
      ['welcome', 'Welcome to TicketToken!'],
      ['verification', 'Verify Your Email Address'],
      ['event-reminder', 'Event Reminder'],
      ['transfer-notification', 'Ticket Transfer Notification'],
      ['refund-confirmation', 'Refund Confirmation'],
      ['marketplace-listing', 'Your Listing Update'],
    ];

    test.each(templates)(
      'should use correct subject for %s template',
      async (template, expectedSubject) => {
        mockJob.data.template = template;

        await processor.process(mockJob);

        expect(mockSgMailSend).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: expectedSubject,
          })
        );
      }
    );
  });

  describe('mock mode', () => {
    it('should generate message ID when header is missing', async () => {
      mockSgMailSend.mockResolvedValue([
        {
          statusCode: 202,
          headers: {},
        },
      ]);

      const result = await processor.process(mockJob);

      expect(result.success).toBe(true);
      expect(result.data.messageId).toMatch(/^sg_\d+$/);
    });
  });
});
