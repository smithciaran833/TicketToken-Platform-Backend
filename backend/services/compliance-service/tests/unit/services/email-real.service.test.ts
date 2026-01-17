/**
 * Unit Tests for RealEmailService
 *
 * Tests email sending and 1099 notification functionality
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// =============================================================================
// MOCKS
// =============================================================================

// Store original env
const originalEnv = process.env;

// Mock console
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  // Reset env for each test
  process.env = { ...originalEnv };
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  process.env = originalEnv;
});

// Import module under test
import { RealEmailService, realEmailService } from '../../../src/services/email-real.service';

// =============================================================================
// TESTS
// =============================================================================

describe('RealEmailService', () => {
  let service: RealEmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RealEmailService();
  });

  // ===========================================================================
  // sendEmail Tests
  // ===========================================================================

  describe('sendEmail', () => {
    describe('without SendGrid API key', () => {
      beforeEach(() => {
        delete process.env.SENDGRID_API_KEY;
      });

      it('should log mock email when no API key', async () => {
        await service.sendEmail(
          'test@example.com',
          'Test Subject',
          '<p>Test content</p>'
        );

        expect(console.log).toHaveBeenCalledWith(
          '📧 [MOCK] Email to test@example.com: Test Subject'
        );
      });

      it('should not throw error when no API key', async () => {
        await expect(
          service.sendEmail('test@example.com', 'Subject', '<p>Body</p>')
        ).resolves.toBeUndefined();
      });

      it('should handle attachments in mock mode', async () => {
        const attachments = [{ filename: 'test.pdf', content: 'base64data' }];

        await expect(
          service.sendEmail('test@example.com', 'Subject', '<p>Body</p>', attachments)
        ).resolves.toBeUndefined();
      });
    });

    describe('with SendGrid API key (mocked)', () => {
      let mockSend: jest.Mock;

      beforeEach(() => {
        process.env.SENDGRID_API_KEY = 'SG.test-api-key';
        mockSend = jest.fn().mockResolvedValue([{ statusCode: 202 }]);
        
        // Create service with mocked sgMail
        service = new RealEmailService();
        (service as any).sgMail = { send: mockSend };
      });

      it('should call sgMail.send with correct message', async () => {
        await service.sendEmail(
          'recipient@example.com',
          'Test Subject',
          '<p>Test HTML</p>'
        );

        expect(mockSend).toHaveBeenCalledWith({
          to: 'recipient@example.com',
          from: 'compliance@tickettoken.com',
          subject: 'Test Subject',
          html: '<p>Test HTML</p>',
          attachments: undefined
        });
      });

      it('should use custom from address if set', async () => {
        process.env.SENDGRID_FROM_EMAIL = 'custom@tickettoken.com';
        
        await service.sendEmail('to@example.com', 'Subject', '<p>Body</p>');

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            from: 'custom@tickettoken.com'
          })
        );
      });

      it('should use default from address if not set', async () => {
        delete process.env.SENDGRID_FROM_EMAIL;

        await service.sendEmail('to@example.com', 'Subject', '<p>Body</p>');

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            from: 'compliance@tickettoken.com'
          })
        );
      });

      it('should include attachments when provided', async () => {
        const attachments = [
          { filename: 'doc1.pdf', content: 'base64content1' },
          { filename: 'doc2.pdf', content: 'base64content2' }
        ];

        await service.sendEmail(
          'to@example.com',
          'Subject',
          '<p>Body</p>',
          attachments
        );

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            attachments
          })
        );
      });

      it('should log success message', async () => {
        await service.sendEmail('to@example.com', 'Test Subject', '<p>Body</p>');

        expect(console.log).toHaveBeenCalledWith(
          '📧 Email sent to to@example.com: Test Subject'
        );
      });

      it('should throw and log error on send failure', async () => {
        const sendError = new Error('SendGrid API error');
        mockSend.mockRejectedValue(sendError);

        await expect(
          service.sendEmail('to@example.com', 'Subject', '<p>Body</p>')
        ).rejects.toThrow('SendGrid API error');

        expect(console.error).toHaveBeenCalledWith('Email send error:', sendError);
      });
    });
  });

  // ===========================================================================
  // send1099Notification Tests
  // ===========================================================================

  describe('send1099Notification', () => {
    beforeEach(() => {
      delete process.env.SENDGRID_API_KEY;
    });

    it('should send email with correct subject', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue();

      await service.send1099Notification(
        'venue@example.com',
        'Test Venue',
        2025,
        15000.50,
        '/path/to/1099.pdf'
      );

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'venue@example.com',
        'Your 2025 Form 1099-K from TicketToken',
        expect.any(String),
        expect.any(Array)
      );
    });

    it('should include venue name in HTML body', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue();

      await service.send1099Notification(
        'venue@example.com',
        'Amazing Venue LLC',
        2025,
        10000,
        '/path/to/1099.pdf'
      );

      const htmlArg = sendEmailSpy.mock.calls[0][2];
      expect(htmlArg).toContain('Amazing Venue LLC');
    });

    it('should include year in HTML body', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue();

      await service.send1099Notification(
        'venue@example.com',
        'Test Venue',
        2024,
        10000,
        '/path/to/1099.pdf'
      );

      const htmlArg = sendEmailSpy.mock.calls[0][2];
      expect(htmlArg).toContain('2024');
    });

    it('should include formatted amount in HTML body', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue();

      await service.send1099Notification(
        'venue@example.com',
        'Test Venue',
        2025,
        12345.67,
        '/path/to/1099.pdf'
      );

      const htmlArg = sendEmailSpy.mock.calls[0][2];
      expect(htmlArg).toContain('$12345.67');
    });

    it('should format amount with two decimal places', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue();

      await service.send1099Notification(
        'venue@example.com',
        'Test Venue',
        2025,
        1000,  // No decimals
        '/path/to/1099.pdf'
      );

      const htmlArg = sendEmailSpy.mock.calls[0][2];
      expect(htmlArg).toContain('$1000.00');
    });

    it('should attach PDF with correct filename', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue();

      await service.send1099Notification(
        'venue@example.com',
        'Test Venue',
        2025,
        10000,
        '/path/to/1099.pdf'
      );

      const attachments = sendEmailSpy.mock.calls[0][3];
      expect(attachments).toHaveLength(1);
      expect(attachments[0]).toEqual(
        expect.objectContaining({
          filename: '1099K_2025.pdf',
          type: 'application/pdf',
          disposition: 'attachment'
        })
      );
    });

    it('should include base64 encoded content in attachment', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue();

      await service.send1099Notification(
        'venue@example.com',
        'Test Venue',
        2025,
        10000,
        '/path/to/pdf'
      );

      const attachments = sendEmailSpy.mock.calls[0][3];
      expect(attachments[0]).toHaveProperty('content');
      expect(typeof attachments[0].content).toBe('string');
    });

    it('should include IRS filing notice in body', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue();

      await service.send1099Notification(
        'venue@example.com',
        'Test Venue',
        2025,
        10000,
        '/path/to/1099.pdf'
      );

      const htmlArg = sendEmailSpy.mock.calls[0][2];
      expect(htmlArg).toContain('filed with the IRS');
    });

    it('should use correct year in attachment filename', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue();

      await service.send1099Notification(
        'venue@example.com',
        'Test Venue',
        2023,
        10000,
        '/path/to/1099.pdf'
      );

      const attachments = sendEmailSpy.mock.calls[0][3];
      expect(attachments[0].filename).toBe('1099K_2023.pdf');
    });
  });

  // ===========================================================================
  // Singleton Export Test
  // ===========================================================================

  describe('realEmailService singleton', () => {
    it('should export a singleton instance', () => {
      expect(realEmailService).toBeInstanceOf(RealEmailService);
    });
  });
});
