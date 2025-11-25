import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { SendEmailRequest, NotificationType, NotificationStatus, NotificationChannel } from '../types/notification.types';
import { PDFGenerator, TicketData } from '../utils/pdf-generator';
import { emailTemplateService } from './email-template.service';
import { NotificationMetrics } from '../utils/notification-metrics';

export class EmailService {
  private provider: string;

  constructor() {
    this.provider = process.env.EMAIL_PROVIDER || 'console'; // 'sendgrid', 'ses', 'console'
  }

  async sendEmail(request: SendEmailRequest): Promise<void> {
    try {
      switch (this.provider) {
        case 'sendgrid':
          await this.sendViaSendGrid(request);
          break;
        case 'ses':
          await this.sendViaSES(request);
          break;
        default:
          await this.sendViaConsole(request);
      }
      
      NotificationMetrics.incrementSent('email', 'success');
      logger.info('Email sent successfully', { to: request.to, subject: request.subject });
    } catch (error) {
      NotificationMetrics.incrementSent('email', 'failed');
      NotificationMetrics.incrementError('email', error instanceof Error ? error.message : 'unknown');
      logger.error('Error sending email', { error, to: request.to });
      throw error;
    }
  }

  async sendOrderConfirmation(
    tenantId: string,
    userId: string,
    orderId: string,
    orderData: any
  ): Promise<void> {
    const db = getDatabase();
    try {
      // Get template
      const template = await emailTemplateService.getTemplate(tenantId, NotificationType.ORDER_CONFIRMATION);
      if (!template) {
        throw new Error('Order confirmation template not found');
      }

      // Render template
      const context = { tenantId, userId, orderId, order: orderData };
      const rendered = await emailTemplateService.renderTemplate(template, context);

      // Generate PDF ticket attachment
      const ticketData: TicketData = {
        orderId: orderData.id,
        orderNumber: orderData.orderNumber,
        eventName: orderData.event?.name || 'Event',
        eventDate: new Date(orderData.event?.date || Date.now()),
        eventVenue: orderData.event?.venue || '',
        ticketType: orderData.items?.[0]?.ticketType || 'General',
        seatNumber: orderData.items?.[0]?.seatNumber,
        quantity: orderData.items?.length || 1,
        customerName: orderData.customer?.name || '',
        customerEmail: orderData.customer?.email || '',
        qrCode: PDFGenerator.generateQRCode(orderId),
        totalAmount: orderData.totalCents || 0,
      };

      const pdfBuffer = await PDFGenerator.generateTicket(ticketData);

      // Send email
      await this.sendEmail({
        to: orderData.customer.email,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        attachments: [
          {
            filename: `ticket-${orderData.orderNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
        metadata: { orderId, tenantId },
      });

      // Log notification
      await this.logNotification(tenantId, userId, orderId, NotificationType.ORDER_CONFIRMATION, orderData.customer.email, rendered.subject);
    } catch (error) {
      logger.error('Error sending order confirmation', { error, orderId });
      throw error;
    }
  }

  private async sendViaSendGrid(request: SendEmailRequest): Promise<void> {
    // TODO: Implement SendGrid integration
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({ ... });
    logger.info('[SendGrid] Email would be sent', { to: request.to });
  }

  private async sendViaSES(request: SendEmailRequest): Promise<void> {
    // TODO: Implement AWS SES integration
    // const AWS = require('aws-sdk');
    // const ses = new AWS.SES();
    // await ses.sendEmail({ ... }).promise();
    logger.info('[SES] Email would be sent', { to: request.to });
  }

  private async sendViaConsole(request: SendEmailRequest): Promise<void> {
    logger.info('[Console] Email sent', {
      to: request.to,
      subject: request.subject,
      hasAttachments: !!request.attachments?.length,
    });
  }

  private async logNotification(
    tenantId: string,
    userId: string,
    orderId: string,
    type: NotificationType,
    recipient: string,
    subject: string
  ): Promise<void> {
    const db = getDatabase();
    try {
      await db.query(
        `INSERT INTO notification_logs (tenant_id, user_id, order_id, notification_type, channel, recipient, subject, status, sent_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [tenantId, userId, orderId, type, NotificationChannel.EMAIL, recipient, subject, NotificationStatus.SENT]
      );
    } catch (error) {
      logger.error('Failed to log email notification to database', { 
        error, 
        orderId, 
        recipient,
        type,
        impact: 'notification was sent but not recorded in logs'
      });
      // Don't throw - logging failure shouldn't prevent notification from being considered sent
    }
  }
}
