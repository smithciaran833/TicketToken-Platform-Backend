import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';

/**
 * Email Service
 * Handles email notifications for payments, refunds, and NFT minting
 */

// Email configuration
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587', 10);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@tickettoken.com';

// Initialize transporter
let transporter: Transporter | null = null;

if (EMAIL_USER && EMAIL_PASSWORD) {
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASSWORD,
    },
  });

  logger.info('Email service initialized', {
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    from: EMAIL_FROM,
  });
} else {
  logger.warn('Email service not configured - EMAIL_USER and EMAIL_PASSWORD required');
}

export interface PaymentConfirmationData {
  recipientEmail: string;
  recipientName: string;
  orderId: string;
  amount: number;
  currency: string;
  paymentIntentId: string;
  items?: string[];
}

export interface RefundConfirmationData {
  recipientEmail: string;
  recipientName: string;
  orderId: string;
  amount: number;
  currency: string;
  refundId: string;
  reason?: string;
}

export interface NFTMintedData {
  recipientEmail: string;
  recipientName: string;
  ticketName: string;
  mintAddress: string;
  explorerUrl: string;
  imageUrl?: string;
}

export class EmailService {
  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmation(data: PaymentConfirmationData): Promise<boolean> {
    if (!transporter) {
      logger.warn('Email not sent - transporter not configured');
      return false;
    }

    try {
      const itemsList = data.items?.map(item => `<li>${item}</li>`).join('') || '';
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Payment Confirmation</h2>
          <p>Hi ${data.recipientName},</p>
          <p>Your payment has been successfully processed!</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Order Details</h3>
            <p><strong>Order ID:</strong> ${data.orderId}</p>
            <p><strong>Amount:</strong> ${(data.amount / 100).toFixed(2)} ${data.currency.toUpperCase()}</p>
            <p><strong>Payment ID:</strong> ${data.paymentIntentId}</p>
            ${itemsList ? `<p><strong>Items:</strong></p><ul>${itemsList}</ul>` : ''}
          </div>
          
          <p>Thank you for your purchase!</p>
          <p>Best regards,<br>TicketToken Team</p>
        </div>
      `;

      await transporter.sendMail({
        from: EMAIL_FROM,
        to: data.recipientEmail,
        subject: `Payment Confirmation - Order #${data.orderId}`,
        html,
      });

      logger.info('Payment confirmation email sent', {
        recipient: data.recipientEmail,
        orderId: data.orderId,
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to send payment confirmation email', {
        recipient: data.recipientEmail,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Send refund confirmation email
   */
  async sendRefundConfirmation(data: RefundConfirmationData): Promise<boolean> {
    if (!transporter) {
      logger.warn('Email not sent - transporter not configured');
      return false;
    }

    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Refund Confirmation</h2>
          <p>Hi ${data.recipientName},</p>
          <p>Your refund has been processed successfully!</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Refund Details</h3>
            <p><strong>Order ID:</strong> ${data.orderId}</p>
            <p><strong>Refund Amount:</strong> ${(data.amount / 100).toFixed(2)} ${data.currency.toUpperCase()}</p>
            <p><strong>Refund ID:</strong> ${data.refundId}</p>
            ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}
          </div>
          
          <p>The refund will appear in your account within 5-10 business days.</p>
          <p>Best regards,<br>TicketToken Team</p>
        </div>
      `;

      await transporter.sendMail({
        from: EMAIL_FROM,
        to: data.recipientEmail,
        subject: `Refund Processed - Order #${data.orderId}`,
        html,
      });

      logger.info('Refund confirmation email sent', {
        recipient: data.recipientEmail,
        orderId: data.orderId,
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to send refund confirmation email', {
        recipient: data.recipientEmail,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Send NFT minted confirmation email
   */
  async sendNFTMintedConfirmation(data: NFTMintedData): Promise<boolean> {
    if (!transporter) {
      logger.warn('Email not sent - transporter not configured');
      return false;
    }

    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>🎉 Your NFT Ticket is Ready!</h2>
          <p>Hi ${data.recipientName},</p>
          <p>Your NFT ticket has been successfully minted on the Solana blockchain!</p>
          
          ${data.imageUrl ? `<div style="text-align: center; margin: 20px 0;"><img src="${data.imageUrl}" alt="${data.ticketName}" style="max-width: 300px; border-radius: 10px;"></div>` : ''}
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>NFT Details</h3>
            <p><strong>Ticket Name:</strong> ${data.ticketName}</p>
            <p><strong>Mint Address:</strong> <code style="word-break: break-all;">${data.mintAddress}</code></p>
            <p><a href="${data.explorerUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px;">View on Solana Explorer</a></p>
          </div>
          
          <p>Your NFT ticket is now in your wallet and can be used for event access!</p>
          <p>Best regards,<br>TicketToken Team</p>
        </div>
      `;

      await transporter.sendMail({
        from: EMAIL_FROM,
        to: data.recipientEmail,
        subject: `Your NFT Ticket is Ready - ${data.ticketName}`,
        html,
      });

      logger.info('NFT minted confirmation email sent', {
        recipient: data.recipientEmail,
        mintAddress: data.mintAddress,
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to send NFT minted confirmation email', {
        recipient: data.recipientEmail,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Send admin alert for failed operations
   */
  async sendAdminAlert(subject: string, message: string, details: any): Promise<boolean> {
    if (!transporter) return false;

    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    if (!ADMIN_EMAIL) {
      logger.warn('Admin email not configured');
      return false;
    }

    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc3545;">⚠️ Admin Alert</h2>
          <h3>${subject}</h3>
          <p>${message}</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
            <h4>Details:</h4>
            <pre style="background-color: #fff; padding: 10px; overflow-x: auto;">${JSON.stringify(details, null, 2)}</pre>
          </div>
          
          <p><small>This is an automated alert from the Queue Service.</small></p>
        </div>
      `;

      await transporter.sendMail({
        from: EMAIL_FROM,
        to: ADMIN_EMAIL,
        subject: `[QUEUE SERVICE ALERT] ${subject}`,
        html,
      });

      logger.info('Admin alert sent', { subject });
      return true;
    } catch (error: any) {
      logger.error('Failed to send admin alert', {
        subject,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<boolean> {
    if (!transporter) return false;
    
    try {
      await transporter.verify();
      logger.info('Email connection verified');
      return true;
    } catch (error: any) {
      logger.error('Email connection failed', { error: error.message });
      return false;
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();
