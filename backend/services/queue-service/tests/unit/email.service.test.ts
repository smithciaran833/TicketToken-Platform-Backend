import { EmailService } from '../../src/services/email.service';

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn(),
    verify: jest.fn(),
  }),
}));

describe('EmailService', () => {
  let emailService: EmailService;
  let mockTransporter: any;

  beforeEach(() => {
    const nodemailer = require('nodemailer');
    mockTransporter = nodemailer.createTransport();
    emailService = new EmailService();
  });

  describe('sendPaymentConfirmation', () => {
    it('should send payment confirmation email successfully', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      const result = await emailService.sendPaymentConfirmation({
        recipientEmail: 'test@example.com',
        recipientName: 'Test User',
        orderId: 'order-123',
        amount: 5000,
        currency: 'usd',
        paymentIntentId: 'pi_123',
      });

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Payment Confirmation - Order #order-123',
        })
      );
    });

    it('should handle email sending failure', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('Email failed'));

      const result = await emailService.sendPaymentConfirmation({
        recipientEmail: 'test@example.com',
        recipientName: 'Test User',
        orderId: 'order-123',
        amount: 5000,
        currency: 'usd',
        paymentIntentId: 'pi_123',
      });

      expect(result).toBe(false);
    });
  });

  describe('sendRefundConfirmation', () => {
    it('should send refund confirmation email successfully', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      const result = await emailService.sendRefundConfirmation({
        recipientEmail: 'test@example.com',
        recipientName: 'Test User',
        orderId: 'order-123',
        amount: 5000,
        currency: 'usd',
        refundId: 'ref_123',
        reason: 'Customer request',
      });

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Refund Processed - Order #order-123',
        })
      );
    });
  });

  describe('sendNFTMintedConfirmation', () => {
    it('should send NFT minted confirmation email successfully', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      const result = await emailService.sendNFTMintedConfirmation({
        recipientEmail: 'test@example.com',
        recipientName: 'Test User',
        ticketName: 'VIP Ticket',
        mintAddress: 'mint_abc123',
        explorerUrl: 'https://explorer.solana.com/address/mint_abc123',
        imageUrl: 'https://example.com/image.png',
      });

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Your NFT Ticket is Ready - VIP Ticket',
        })
      );
    });
  });

  describe('sendAdminAlert', () => {
    it('should send admin alert successfully', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });

      const result = await emailService.sendAdminAlert(
        'Test Alert',
        'Test message',
        { key: 'value' }
      );

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@example.com',
          subject: '[QUEUE SERVICE ALERT] Test Alert',
        })
      );
    });

    it('should return false if admin email not configured', async () => {
      delete process.env.ADMIN_EMAIL;

      const result = await emailService.sendAdminAlert(
        'Test Alert',
        'Test message',
        {}
      );

      expect(result).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('should verify email connection successfully', async () => {
      mockTransporter.verify.mockResolvedValue(true);

      const result = await emailService.testConnection();

      expect(result).toBe(true);
      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    it('should handle verification failure', async () => {
      mockTransporter.verify.mockRejectedValue(new Error('Connection failed'));

      const result = await emailService.testConnection();

      expect(result).toBe(false);
    });
  });
});
