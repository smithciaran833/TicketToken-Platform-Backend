// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock nodemailer
const mockSendMail = jest.fn();
const mockVerify = jest.fn();
const mockTransporter = {
  sendMail: mockSendMail,
  verify: mockVerify,
};

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => mockTransporter),
}));

describe('EmailService', () => {
  let EmailService: any;
  let service: any;
  let logger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockReset();
    mockVerify.mockReset();
    mockSendMail.mockResolvedValue({ messageId: 'test-message-id' });
    mockVerify.mockResolvedValue(true);

    // Set environment variables before importing
    process.env.EMAIL_HOST = 'smtp.test.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_USER = 'test@test.com';
    process.env.EMAIL_PASSWORD = 'password123';
    process.env.EMAIL_FROM = 'noreply@tickettoken.com';
    process.env.ADMIN_EMAIL = 'admin@tickettoken.com';

    // Reset modules to get fresh import with env vars set
    jest.resetModules();

    // Re-mock after reset
    jest.doMock('../../../src/utils/logger', () => ({
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
    }));

    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => mockTransporter),
    }));

    // Now import the module
    const emailModule = require('../../../src/services/email.service');
    EmailService = emailModule.EmailService;
    logger = require('../../../src/utils/logger').logger;
    service = new EmailService();
  });

  describe('sendPaymentConfirmation', () => {
    const validData = {
      recipientEmail: 'customer@example.com',
      recipientName: 'John Doe',
      orderId: 'order-123',
      amount: 5000,
      currency: 'usd',
      paymentIntentId: 'pi_123456',
    };

    it('should send payment confirmation email successfully', async () => {
      const result = await service.sendPaymentConfirmation(validData);

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@tickettoken.com',
        to: 'customer@example.com',
        subject: 'Payment Confirmation - Order #order-123',
        html: expect.stringContaining('Payment Confirmation'),
      });
    });

    it('should include recipient name in email', async () => {
      await service.sendPaymentConfirmation(validData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('Hi John Doe');
    });

    it('should format amount correctly (cents to dollars)', async () => {
      await service.sendPaymentConfirmation(validData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('50.00 USD');
    });

    it('should include order details', async () => {
      await service.sendPaymentConfirmation(validData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('order-123');
      expect(htmlArg).toContain('pi_123456');
    });

    it('should include items list when provided', async () => {
      const dataWithItems = {
        ...validData,
        items: ['VIP Ticket x1', 'Parking Pass x1'],
      };

      await service.sendPaymentConfirmation(dataWithItems);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('VIP Ticket x1');
      expect(htmlArg).toContain('Parking Pass x1');
    });

    it('should log success with recipient and orderId', async () => {
      await service.sendPaymentConfirmation(validData);

      expect(logger.info).toHaveBeenCalledWith('Payment confirmation email sent', {
        recipient: 'customer@example.com',
        orderId: 'order-123',
      });
    });

    it('should return false and log error when send fails', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP error'));

      const result = await service.sendPaymentConfirmation(validData);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Failed to send payment confirmation email', {
        recipient: 'customer@example.com',
        error: 'SMTP error',
      });
    });

    it('should handle zero amount', async () => {
      const zeroAmountData = { ...validData, amount: 0 };

      await service.sendPaymentConfirmation(zeroAmountData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('0.00 USD');
    });

    it('should uppercase currency code', async () => {
      await service.sendPaymentConfirmation(validData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('USD');
    });
  });

  describe('sendRefundConfirmation', () => {
    const validData = {
      recipientEmail: 'customer@example.com',
      recipientName: 'Jane Smith',
      orderId: 'order-456',
      amount: 2500,
      currency: 'eur',
      refundId: 'ref_789',
    };

    it('should send refund confirmation email successfully', async () => {
      const result = await service.sendRefundConfirmation(validData);

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@tickettoken.com',
        to: 'customer@example.com',
        subject: 'Refund Processed - Order #order-456',
        html: expect.stringContaining('Refund Confirmation'),
      });
    });

    it('should include refund details', async () => {
      await service.sendRefundConfirmation(validData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('25.00 EUR');
      expect(htmlArg).toContain('ref_789');
      expect(htmlArg).toContain('order-456');
    });

    it('should include reason when provided', async () => {
      const dataWithReason = {
        ...validData,
        reason: 'Event cancelled',
      };

      await service.sendRefundConfirmation(dataWithReason);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('Event cancelled');
    });

    it('should not include reason field when not provided', async () => {
      await service.sendRefundConfirmation(validData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      // The template uses conditional rendering, so Reason label shouldn't appear
      expect(htmlArg).not.toContain('<strong>Reason:</strong>');
    });

    it('should include processing time info', async () => {
      await service.sendRefundConfirmation(validData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('5-10 business days');
    });

    it('should log success', async () => {
      await service.sendRefundConfirmation(validData);

      expect(logger.info).toHaveBeenCalledWith('Refund confirmation email sent', {
        recipient: 'customer@example.com',
        orderId: 'order-456',
      });
    });

    it('should return false and log error when send fails', async () => {
      mockSendMail.mockRejectedValue(new Error('Connection refused'));

      const result = await service.sendRefundConfirmation(validData);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Failed to send refund confirmation email', {
        recipient: 'customer@example.com',
        error: 'Connection refused',
      });
    });
  });

  describe('sendNFTMintedConfirmation', () => {
    const validData = {
      recipientEmail: 'collector@example.com',
      recipientName: 'NFT Collector',
      ticketName: 'Summer Festival VIP Pass',
      mintAddress: 'ABC123xyz789DEF456',
      explorerUrl: 'https://explorer.solana.com/address/ABC123xyz789DEF456',
    };

    it('should send NFT minted confirmation email successfully', async () => {
      const result = await service.sendNFTMintedConfirmation(validData);

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@tickettoken.com',
        to: 'collector@example.com',
        subject: 'Your NFT Ticket is Ready - Summer Festival VIP Pass',
        html: expect.stringContaining('NFT Ticket is Ready'),
      });
    });

    it('should include NFT details', async () => {
      await service.sendNFTMintedConfirmation(validData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('Summer Festival VIP Pass');
      expect(htmlArg).toContain('ABC123xyz789DEF456');
    });

    it('should include explorer link', async () => {
      await service.sendNFTMintedConfirmation(validData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('https://explorer.solana.com/address/ABC123xyz789DEF456');
      expect(htmlArg).toContain('View on Solana Explorer');
    });

    it('should include image when provided', async () => {
      const dataWithImage = {
        ...validData,
        imageUrl: 'https://nft-images.com/ticket.png',
      };

      await service.sendNFTMintedConfirmation(dataWithImage);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('https://nft-images.com/ticket.png');
      expect(htmlArg).toContain('<img');
    });

    it('should not include image section when not provided', async () => {
      await service.sendNFTMintedConfirmation(validData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).not.toContain('<img');
    });

    it('should log success with recipient and mint address', async () => {
      await service.sendNFTMintedConfirmation(validData);

      expect(logger.info).toHaveBeenCalledWith('NFT minted confirmation email sent', {
        recipient: 'collector@example.com',
        mintAddress: 'ABC123xyz789DEF456',
      });
    });

    it('should return false and log error when send fails', async () => {
      mockSendMail.mockRejectedValue(new Error('Template error'));

      const result = await service.sendNFTMintedConfirmation(validData);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Failed to send NFT minted confirmation email', {
        recipient: 'collector@example.com',
        error: 'Template error',
      });
    });

    it('should include emoji in email body', async () => {
      await service.sendNFTMintedConfirmation(validData);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('🎉');
    });
  });

  describe('sendAdminAlert', () => {
    it('should send admin alert successfully', async () => {
      const result = await service.sendAdminAlert(
        'Payment Failed',
        'A critical payment has failed',
        { orderId: 'order-999', error: 'Gateway timeout' }
      );

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@tickettoken.com',
        to: 'admin@tickettoken.com',
        subject: '[QUEUE SERVICE ALERT] Payment Failed',
        html: expect.stringContaining('Admin Alert'),
      });
    });

    it('should include subject and message in email', async () => {
      await service.sendAdminAlert('Test Alert', 'This is a test message', {});

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('Test Alert');
      expect(htmlArg).toContain('This is a test message');
    });

    it('should include JSON formatted details', async () => {
      const details = { key1: 'value1', nested: { key2: 'value2' } };

      await service.sendAdminAlert('Test', 'Message', details);

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('key1');
      expect(htmlArg).toContain('value1');
      expect(htmlArg).toContain('nested');
    });

    it('should log success', async () => {
      await service.sendAdminAlert('Test Subject', 'Test message', {});

      expect(logger.info).toHaveBeenCalledWith('Admin alert sent', { subject: 'Test Subject' });
    });

    it('should return false and log error when send fails', async () => {
      mockSendMail.mockRejectedValue(new Error('Auth failed'));

      const result = await service.sendAdminAlert('Alert', 'Message', {});

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Failed to send admin alert', {
        subject: 'Alert',
        error: 'Auth failed',
      });
    });
  });

  describe('testConnection', () => {
    it('should return true when connection is valid', async () => {
      mockVerify.mockResolvedValue(true);

      const result = await service.testConnection();

      expect(result).toBe(true);
      expect(mockVerify).toHaveBeenCalled();
    });

    it('should log success on valid connection', async () => {
      mockVerify.mockResolvedValue(true);

      await service.testConnection();

      expect(logger.info).toHaveBeenCalledWith('Email connection verified');
    });

    it('should return false when connection fails', async () => {
      mockVerify.mockRejectedValue(new Error('Connection failed'));

      const result = await service.testConnection();

      expect(result).toBe(false);
    });

    it('should log error when connection fails', async () => {
      mockVerify.mockRejectedValue(new Error('Invalid credentials'));

      await service.testConnection();

      expect(logger.error).toHaveBeenCalledWith('Email connection failed', {
        error: 'Invalid credentials',
      });
    });
  });
});

describe('EmailService - Transporter Not Configured', () => {
  let EmailService: any;
  let service: any;
  let logger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Clear email credentials to simulate unconfigured state
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASSWORD;

    jest.resetModules();

    // Mock logger
    jest.doMock('../../../src/utils/logger', () => ({
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
    }));

    // Mock nodemailer to return null (simulating no credentials)
    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => null),
    }));

    const emailModule = require('../../../src/services/email.service');
    EmailService = emailModule.EmailService;
    logger = require('../../../src/utils/logger').logger;
    service = new EmailService();
  });

  it('should return false for sendPaymentConfirmation when not configured', async () => {
    const result = await service.sendPaymentConfirmation({
      recipientEmail: 'test@test.com',
      recipientName: 'Test',
      orderId: 'order-1',
      amount: 100,
      currency: 'usd',
      paymentIntentId: 'pi_1',
    });

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Email not sent - transporter not configured');
  });

  it('should return false for sendRefundConfirmation when not configured', async () => {
    const result = await service.sendRefundConfirmation({
      recipientEmail: 'test@test.com',
      recipientName: 'Test',
      orderId: 'order-1',
      amount: 100,
      currency: 'usd',
      refundId: 'ref_1',
    });

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Email not sent - transporter not configured');
  });

  it('should return false for sendNFTMintedConfirmation when not configured', async () => {
    const result = await service.sendNFTMintedConfirmation({
      recipientEmail: 'test@test.com',
      recipientName: 'Test',
      ticketName: 'Ticket',
      mintAddress: 'address',
      explorerUrl: 'https://explorer.com',
    });

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Email not sent - transporter not configured');
  });

  it('should return false for sendAdminAlert when not configured', async () => {
    const result = await service.sendAdminAlert('Subject', 'Message', {});

    expect(result).toBe(false);
  });

  it('should return false for testConnection when not configured', async () => {
    const result = await service.testConnection();

    expect(result).toBe(false);
  });
});

describe('EmailService - Admin Email Not Configured', () => {
  let EmailService: any;
  let service: any;
  let logger: any;
  const mockSendMailLocal = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMailLocal.mockReset();
    mockSendMailLocal.mockResolvedValue({ messageId: 'test' });

    // Set email credentials but NOT admin email
    process.env.EMAIL_USER = 'test@test.com';
    process.env.EMAIL_PASSWORD = 'password123';
    delete process.env.ADMIN_EMAIL;

    jest.resetModules();

    jest.doMock('../../../src/utils/logger', () => ({
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
    }));

    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => ({
        sendMail: mockSendMailLocal,
        verify: jest.fn().mockResolvedValue(true),
      })),
    }));

    const emailModule = require('../../../src/services/email.service');
    EmailService = emailModule.EmailService;
    logger = require('../../../src/utils/logger').logger;
    service = new EmailService();
  });

  it('should return false for sendAdminAlert when ADMIN_EMAIL not set', async () => {
    const result = await service.sendAdminAlert('Alert', 'Message', {});

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Admin email not configured');
  });
});
