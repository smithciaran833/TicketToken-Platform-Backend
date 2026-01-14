import { BullJobData } from '../../adapters/bull-job-adapter';
import { BaseWorker } from '../base.worker';
import { EmailJobData, JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { RateLimiterService } from '../../services/rate-limiter.service';
import { logger } from '../../utils/logger';

// SendGrid client setup
const sgMail = require('@sendgrid/mail');

// Initialize SendGrid with API key from environment
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

// Email template configurations
const EMAIL_TEMPLATES: Record<string, string> = {
  'ticket-purchase': 'd-ticket-purchase-template-id',
  'ticket-confirmation': 'd-ticket-confirmation-template-id',
  'order-receipt': 'd-order-receipt-template-id',
  'password-reset': 'd-password-reset-template-id',
  'welcome': 'd-welcome-template-id',
  'verification': 'd-verification-template-id',
  'event-reminder': 'd-event-reminder-template-id',
  'transfer-notification': 'd-transfer-notification-template-id',
  'refund-confirmation': 'd-refund-confirmation-template-id',
  'marketplace-listing': 'd-marketplace-listing-template-id'
};

interface SendGridResponse {
  statusCode: number;
  headers: {
    'x-message-id'?: string;
  };
}

export class EmailProcessor extends BaseWorker<EmailJobData, JobResult> {
  protected name = 'email-processor';
  private idempotencyService: IdempotencyService;
  private rateLimiter: RateLimiterService;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
    this.rateLimiter = RateLimiterService.getInstance();
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@tickettoken.com';
    this.fromName = process.env.SENDGRID_FROM_NAME || 'TicketToken';
  }
  
  protected async execute(job: BullJobData<EmailJobData>): Promise<JobResult> {
    const { to, template, data } = job.data;
    // Extended email options (optional properties not in base type)
    const extendedData = job.data as EmailJobData & { 
      subject?: string; 
      cc?: string | string[]; 
      bcc?: string | string[]; 
      replyTo?: string; 
    };
    const { subject, cc, bcc, replyTo } = extendedData;
    
    // Generate idempotency key (daily uniqueness for emails)
    const idempotencyKey = this.idempotencyService.generateKey(
      'send-email',
      job.data
    );

    // Check if already sent today
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`Email already sent today (idempotent): ${idempotencyKey}`);
      return existing;
    }

    logger.info('Sending email:', {
      to,
      template,
      subject
    });
    
    try {
      // Acquire rate limit for SendGrid
      await this.rateLimiter.acquire('sendgrid', (job.opts?.priority as number) || 5);
      
      try {
        // Send actual email via SendGrid
        const response = await this.sendViaSendGrid({
          to,
          template,
          data,
          subject,
          cc,
          bcc,
          replyTo
        });
        
        const result: JobResult = {
          success: true,
          data: {
            messageId: response.messageId,
            to,
            template,
            sentAt: new Date().toISOString(),
            statusCode: response.statusCode
          }
        };

        // Store for 24 hours (daily uniqueness)
        await this.idempotencyService.store(
          idempotencyKey,
          job.queue?.name || 'communication',
          job.name || 'send-email',
          result,
          24 * 60 * 60
        );

        logger.info('Email sent successfully', {
          to,
          messageId: response.messageId
        });

        return result;
      } finally {
        this.rateLimiter.release('sendgrid');
      }
    } catch (error) {
      logger.error('Email sending failed:', error);
      
      if (error instanceof Error) {
        // Handle rate limit errors
        if (error.message.includes('Rate limit') || error.message.includes('429')) {
          throw new Error('Rate limit exceeded - will retry with backoff');
        }
        
        // Handle invalid email errors (don't retry)
        if (error.message.includes('invalid') || error.message.includes('bounce')) {
          return {
            success: false,
            error: `Invalid recipient: ${error.message}`,
            data: { to, template }
          };
        }
      }
      
      throw error;
    }
  }

  /**
   * Send email via SendGrid
   */
  private async sendViaSendGrid(params: {
    to: string | string[];
    template: string;
    data: Record<string, any>;
    subject?: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
  }): Promise<{ messageId: string; statusCode: number }> {
    const { to, template, data, subject, cc, bcc, replyTo } = params;

    // Check if SendGrid is configured
    if (!SENDGRID_API_KEY) {
      logger.warn('SendGrid API key not configured - using mock mode');
      return this.mockSendEmail(to, template, data);
    }

    // Get template ID or use dynamic template
    const templateId = EMAIL_TEMPLATES[template];
    
    // Build the message
    const msg: any = {
      to: Array.isArray(to) ? to : [to],
      from: {
        email: this.fromEmail,
        name: this.fromName
      },
      subject: subject || this.getDefaultSubject(template),
      trackingSettings: {
        clickTracking: { enable: true },
        openTracking: { enable: true }
      }
    };

    // Add optional fields
    if (cc) msg.cc = Array.isArray(cc) ? cc : [cc];
    if (bcc) msg.bcc = Array.isArray(bcc) ? bcc : [bcc];
    if (replyTo) msg.replyTo = replyTo;

    // Use SendGrid dynamic template if available
    if (templateId) {
      msg.templateId = templateId;
      msg.dynamicTemplateData = {
        ...data,
        year: new Date().getFullYear(),
        company: 'TicketToken'
      };
    } else {
      // Fallback to plain HTML/text
      msg.html = this.buildHtmlContent(template, data);
      msg.text = this.buildTextContent(template, data);
    }

    try {
      const [response]: [SendGridResponse] = await sgMail.send(msg);
      
      return {
        messageId: response.headers['x-message-id'] || `sg_${Date.now()}`,
        statusCode: response.statusCode
      };
    } catch (error: any) {
      // Handle SendGrid specific errors
      if (error.response) {
        const { statusCode, body } = error.response;
        logger.error('SendGrid API error', {
          statusCode,
          errors: body?.errors
        });
        
        if (statusCode === 429) {
          throw new Error('SendGrid rate limit exceeded');
        }
        
        if (statusCode === 400) {
          throw new Error(`SendGrid validation error: ${JSON.stringify(body?.errors)}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Mock email sending for development/testing
   */
  private async mockSendEmail(
    to: string | string[],
    template: string,
    data: Record<string, any>
  ): Promise<{ messageId: string; statusCode: number }> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const recipients = Array.isArray(to) ? to : [to];
    
    logger.info('[MOCK] Email would be sent:', {
      to: recipients,
      template,
      dataKeys: Object.keys(data)
    });
    
    return {
      messageId: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      statusCode: 202
    };
  }

  /**
   * Get default subject based on template
   */
  private getDefaultSubject(template: string): string {
    const subjects: Record<string, string> = {
      'ticket-purchase': 'Your TicketToken Purchase Confirmation',
      'ticket-confirmation': 'Your Tickets Are Ready!',
      'order-receipt': 'Your Order Receipt',
      'password-reset': 'Reset Your Password',
      'welcome': 'Welcome to TicketToken!',
      'verification': 'Verify Your Email Address',
      'event-reminder': 'Event Reminder',
      'transfer-notification': 'Ticket Transfer Notification',
      'refund-confirmation': 'Refund Confirmation',
      'marketplace-listing': 'Your Listing Update'
    };
    
    return subjects[template] || 'Message from TicketToken';
  }

  /**
   * Build HTML content for non-template emails
   */
  private buildHtmlContent(template: string, data: Record<string, any>): string {
    // Basic HTML template wrapper
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #6366f1; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9fafb; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .button { display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>TicketToken</h1>
    </div>
    <div class="content">
      ${this.getTemplateContent(template, data)}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} TicketToken. All rights reserved.</p>
      <p>This email was sent to you because you have an account with TicketToken.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Build text content for non-template emails
   */
  private buildTextContent(template: string, data: Record<string, any>): string {
    return `
TicketToken
===========

${this.getTemplateTextContent(template, data)}

---
© ${new Date().getFullYear()} TicketToken. All rights reserved.
    `.trim();
  }

  /**
   * Get template-specific HTML content
   */
  private getTemplateContent(template: string, data: Record<string, any>): string {
    switch (template) {
      case 'ticket-purchase':
        return `
          <h2>Thank you for your purchase!</h2>
          <p>Your order has been confirmed.</p>
          <p><strong>Order ID:</strong> ${data.orderId || 'N/A'}</p>
          <p><strong>Event:</strong> ${data.eventName || 'N/A'}</p>
          <p><strong>Tickets:</strong> ${data.ticketCount || 1}</p>
          <p><strong>Total:</strong> $${data.total || '0.00'}</p>
          ${data.viewOrderUrl ? `<p><a href="${data.viewOrderUrl}" class="button">View Order</a></p>` : ''}
        `;
      case 'password-reset':
        return `
          <h2>Reset Your Password</h2>
          <p>Click the link below to reset your password:</p>
          <p><a href="${data.resetUrl}" class="button">Reset Password</a></p>
          <p>This link expires in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `;
      case 'welcome':
        return `
          <h2>Welcome to TicketToken!</h2>
          <p>Hi ${data.name || 'there'},</p>
          <p>Thanks for joining TicketToken. You can now discover and purchase tickets for amazing events.</p>
          ${data.dashboardUrl ? `<p><a href="${data.dashboardUrl}" class="button">Get Started</a></p>` : ''}
        `;
      default:
        return `<p>${data.message || 'Thank you for using TicketToken.'}</p>`;
    }
  }

  /**
   * Get template-specific text content
   */
  private getTemplateTextContent(template: string, data: Record<string, any>): string {
    switch (template) {
      case 'ticket-purchase':
        return `
Thank you for your purchase!

Order ID: ${data.orderId || 'N/A'}
Event: ${data.eventName || 'N/A'}
Tickets: ${data.ticketCount || 1}
Total: $${data.total || '0.00'}

${data.viewOrderUrl ? `View your order: ${data.viewOrderUrl}` : ''}
        `.trim();
      case 'password-reset':
        return `
Reset Your Password

Click the link below to reset your password:
${data.resetUrl}

This link expires in 1 hour.
If you didn't request this, please ignore this email.
        `.trim();
      default:
        return data.message || 'Thank you for using TicketToken.';
    }
  }
}
