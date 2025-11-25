# COMPLETE DATABASE ANALYSIS: notification-service
Generated: Thu Oct  2 15:07:52 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/analytics.routes.ts
```typescript
import { Router } from 'express';
import { analyticsService } from '../services/analytics';
import { logger } from '../config/logger';

const router = Router();

// Get overall metrics
router.get('/analytics/metrics', async (req, res) => {
  try {
    const { startDate, endDate, channel } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();
    
    const metrics = await analyticsService.getMetrics(start, end, channel as string);
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get metrics', { error });
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Get channel breakdown
router.get('/analytics/channels', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();
    
    const metrics = await analyticsService.getChannelMetrics(start, end);
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get channel metrics', { error });
    res.status(500).json({ error: 'Failed to get channel metrics' });
  }
});

// Get hourly breakdown
router.get('/analytics/hourly/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { channel } = req.query;
    
    const breakdown = await analyticsService.getHourlyBreakdown(
      new Date(date),
      channel as string
    );
    res.json(breakdown);
  } catch (error) {
    logger.error('Failed to get hourly breakdown', { error });
    res.status(500).json({ error: 'Failed to get hourly breakdown' });
  }
});

// Get top notification types
router.get('/analytics/top-types', async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();
    
    const types = await analyticsService.getTopNotificationTypes(
      start,
      end,
      parseInt(limit as string) || 10
    );
    res.json(types);
  } catch (error) {
    logger.error('Failed to get top types', { error });
    res.status(500).json({ error: 'Failed to get top types' });
  }
});

// Track email open
router.get('/track/open/:trackingId', async (req, res) => {
  try {
    const { n: notificationId, u: userId } = req.query;
    
    if (notificationId && userId) {
      await analyticsService.trackEngagement({
        notificationId: notificationId as string,
        userId: userId as string,
        action: 'opened'
      });
    }
    
    // Return 1x1 transparent pixel
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    });
    res.end(pixel);
  } catch (error) {
    logger.error('Failed to track open', { error });
    res.status(200).end(); // Still return pixel
  }
});

// Track link click
router.get('/track/click', async (req, res) => {
  try {
    const { n: notificationId, u: userId, l: linkId, url } = req.query;
    
    if (notificationId && userId && linkId && url) {
      await analyticsService.trackClick({
        notificationId: notificationId as string,
        userId: userId as string,
        linkId: linkId as string,
        originalUrl: url as string,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    }
    
    // Redirect to original URL
    res.redirect(url as string || '/');
  } catch (error) {
    logger.error('Failed to track click', { error });
    res.redirect(req.query.url as string || '/');
  }
});

export default router;
```

### FILE: src/routes/health.routes.ts
```typescript
import { Router } from 'express';
import { db } from '../config/database';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

router.get('/health/db', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'notification-service' 
    });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'notification-service'
    });
  }
});

export default router;
```

### FILE: src/config/env.ts
```typescript
import { config } from 'dotenv';

// Load environment variables
config();

export interface EnvConfig {
  // Server
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  PORT: number;
  SERVICE_NAME: string;

  // Database
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_POOL_MIN: number;
  DB_POOL_MAX: number;

  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB: number;

  // RabbitMQ
  RABBITMQ_URL: string;
  RABBITMQ_EXCHANGE: string;
  RABBITMQ_QUEUE: string;

  // SendGrid
  SENDGRID_API_KEY: string;
  SENDGRID_FROM_EMAIL: string;
  SENDGRID_FROM_NAME: string;

  // Twilio
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM_NUMBER: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;

  // JWT
  JWT_SECRET: string;

  // Service URLs
  AUTH_SERVICE_URL: string;
  VENUE_SERVICE_URL: string;
  EVENT_SERVICE_URL: string;
  TICKET_SERVICE_URL: string;
  PAYMENT_SERVICE_URL: string;

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;

  // Notification Settings
  SMS_TIME_RESTRICTION_START: number;
  SMS_TIME_RESTRICTION_END: number;
  DEFAULT_TIMEZONE: string;
  MAX_RETRY_ATTEMPTS: number;
  RETRY_DELAY_MS: number;

  // Template Settings
  TEMPLATE_CACHE_TTL: number;
  ENABLE_TEMPLATE_PREVIEW: boolean;

  // Compliance Settings
  ENABLE_CONSENT_CHECK: boolean;
  ENABLE_SUPPRESSION_CHECK: boolean;
  LOG_ALL_NOTIFICATIONS: boolean;
  DATA_RETENTION_DAYS: number;

  // Feature Flags
  ENABLE_SMS: boolean;
  ENABLE_EMAIL: boolean;
  ENABLE_PUSH: boolean;
  ENABLE_WEBHOOK_DELIVERY: boolean;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

function getEnvVarAsNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (!value && defaultValue !== undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value || '', 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} is not a valid number`);
  }
  return parsed;
}

function getEnvVarAsBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const env: EnvConfig = {
  // Server
  NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
  PORT: getEnvVarAsNumber('PORT', 3009),
  SERVICE_NAME: getEnvVar('SERVICE_NAME', 'notification-service'),

  // Database
  DB_HOST: getEnvVar('DB_HOST', 'postgres'),
  DB_PORT: getEnvVarAsNumber('DB_PORT', 5432),
  DB_NAME: getEnvVar('DB_NAME', 'tickettoken_db'),
  DB_USER: getEnvVar('DB_USER', 'postgres'),
  DB_PASSWORD: getEnvVar('DB_PASSWORD', ''),
  DB_POOL_MIN: getEnvVarAsNumber('DB_POOL_MIN', 2),
  DB_POOL_MAX: getEnvVarAsNumber('DB_POOL_MAX', 10),

  // Redis
  REDIS_HOST: getEnvVar('REDIS_HOST', 'postgres'),
  REDIS_PORT: getEnvVarAsNumber('REDIS_PORT', 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DB: getEnvVarAsNumber('REDIS_DB', 9),

  // RabbitMQ
  RABBITMQ_URL: getEnvVar('RABBITMQ_URL', 'amqp://rabbitmq:5672'),
  RABBITMQ_EXCHANGE: getEnvVar('RABBITMQ_EXCHANGE', 'tickettoken_events'),
  RABBITMQ_QUEUE: getEnvVar('RABBITMQ_QUEUE', 'notifications'),

  // SendGrid
  SENDGRID_API_KEY: getEnvVar('SENDGRID_API_KEY', ''),
  SENDGRID_FROM_EMAIL: getEnvVar('SENDGRID_FROM_EMAIL', 'noreply@tickettoken.com'),
  SENDGRID_FROM_NAME: getEnvVar('SENDGRID_FROM_NAME', 'TicketToken'),

  // Twilio
  TWILIO_ACCOUNT_SID: getEnvVar('TWILIO_ACCOUNT_SID', ''),
  TWILIO_AUTH_TOKEN: getEnvVar('TWILIO_AUTH_TOKEN', ''),
  TWILIO_FROM_NUMBER: getEnvVar('TWILIO_FROM_NUMBER', ''),
  TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,

  // JWT - REMOVED DANGEROUS DEFAULT
  JWT_SECRET: getEnvVar('JWT_SECRET'),

  // Service URLs
  AUTH_SERVICE_URL: getEnvVar('AUTH_SERVICE_URL', 'http://auth-service:3001'),
  VENUE_SERVICE_URL: getEnvVar('VENUE_SERVICE_URL', 'http://venue-service:3002'),
  EVENT_SERVICE_URL: getEnvVar('EVENT_SERVICE_URL', 'http://event-service:3003'),
  TICKET_SERVICE_URL: getEnvVar('TICKET_SERVICE_URL', 'http://ticket-service:3004'),
  PAYMENT_SERVICE_URL: getEnvVar('PAYMENT_SERVICE_URL', 'http://payment-service:3005'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: getEnvVarAsNumber('RATE_LIMIT_WINDOW_MS', 60000),
  RATE_LIMIT_MAX_REQUESTS: getEnvVarAsNumber('RATE_LIMIT_MAX_REQUESTS', 100),

  // Notification Settings
  SMS_TIME_RESTRICTION_START: getEnvVarAsNumber('SMS_TIME_RESTRICTION_START', 8),
  SMS_TIME_RESTRICTION_END: getEnvVarAsNumber('SMS_TIME_RESTRICTION_END', 21),
  DEFAULT_TIMEZONE: getEnvVar('DEFAULT_TIMEZONE', 'America/Chicago'),
  MAX_RETRY_ATTEMPTS: getEnvVarAsNumber('MAX_RETRY_ATTEMPTS', 3),
  RETRY_DELAY_MS: getEnvVarAsNumber('RETRY_DELAY_MS', 5000),

  // Template Settings
  TEMPLATE_CACHE_TTL: getEnvVarAsNumber('TEMPLATE_CACHE_TTL', 3600),
  ENABLE_TEMPLATE_PREVIEW: getEnvVarAsBoolean('ENABLE_TEMPLATE_PREVIEW', true),

  // Compliance Settings
  ENABLE_CONSENT_CHECK: getEnvVarAsBoolean('ENABLE_CONSENT_CHECK', true),
  ENABLE_SUPPRESSION_CHECK: getEnvVarAsBoolean('ENABLE_SUPPRESSION_CHECK', true),
  LOG_ALL_NOTIFICATIONS: getEnvVarAsBoolean('LOG_ALL_NOTIFICATIONS', true),
  DATA_RETENTION_DAYS: getEnvVarAsNumber('DATA_RETENTION_DAYS', 90),

  // Feature Flags
  ENABLE_SMS: getEnvVarAsBoolean('ENABLE_SMS', true),
  ENABLE_EMAIL: getEnvVarAsBoolean('ENABLE_EMAIL', true),
  ENABLE_PUSH: getEnvVarAsBoolean('ENABLE_PUSH', false),
  ENABLE_WEBHOOK_DELIVERY: getEnvVarAsBoolean('ENABLE_WEBHOOK_DELIVERY', true),
};
```

### FILE: src/config/rabbitmq.ts
```typescript
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
const amqp = require('amqplib');
import { env } from './env';
import { logger } from './logger';

export class RabbitMQService {
  private connection: any = null;
  private channel: any = null;
  private isConnected: boolean = false;

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(env.RABBITMQ_URL);
      
      if (!this.connection) {
        throw new Error('Failed to establish RabbitMQ connection');
      }
      
      this.channel = await this.connection.createChannel();
      
      if (!this.channel) {
        throw new Error('Failed to create RabbitMQ channel');
      }

      await this.channel.assertExchange(env.RABBITMQ_EXCHANGE, 'topic', { durable: true });
      await this.channel.assertQueue(env.RABBITMQ_QUEUE, { durable: true });

      const routingKeys = [
        'payment.completed',
        'ticket.purchased',
        'ticket.transferred',
        'event.reminder',
        'event.cancelled',
        'event.updated',
        'user.registered',
        'user.password_reset',
        'venue.announcement',
        'marketing.campaign'
      ];

      for (const key of routingKeys) {
        await this.channel.bindQueue(env.RABBITMQ_QUEUE, env.RABBITMQ_EXCHANGE, key);
      }

      await this.channel.prefetch(1);

      this.connection.on('error', (err: Error) => {
        logger.error('RabbitMQ connection error:', err);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.isConnected = false;
        setTimeout(() => this.connect(), 5000);
      });

      this.isConnected = true;
      logger.info('RabbitMQ connected and configured');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      setTimeout(() => this.connect(), 5000);
      throw error;
    }
  }

  async consume(callback: (msg: any) => Promise<void>): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    await this.channel.consume(env.RABBITMQ_QUEUE, async (msg: any) => {
      if (msg) {
        try {
          await callback(msg);
          if (this.channel) {
            this.channel.ack(msg);
          }
        } catch (error) {
          logger.error('Error processing message:', error);
          if (this.channel) {
            this.channel.nack(msg, false, true);
          }
        }
      }
    });
  }

  async publish(routingKey: string, data: any): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const message = Buffer.from(JSON.stringify(data));
    this.channel.publish(env.RABBITMQ_EXCHANGE, routingKey, message, {
      persistent: true,
      timestamp: Date.now(),
    });
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.isConnected = false;
      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error('Error closing RabbitMQ connection:', error);
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

export const rabbitmqService = new RabbitMQService();
```

### FILE: src/config/database.ts
```typescript
import knex from 'knex';
import path from 'path';

export const db = knex({
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'tickettoken',
    password: process.env.DB_PASSWORD || ''
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: path.join(__dirname, '../migrations')
  }
});

export async function closeDatabaseConnections(): Promise<void> {
  await db.destroy();
}
```

### FILE: src/events/payment-event-handler.ts
```typescript
import { BaseEventHandler } from './base-event-handler';
import { ProviderFactory } from '../providers/provider-factory';
import { logger } from '../config/logger';

interface PaymentEventData {
  userId: string;
  amount: number;
  currency: string;
  eventId?: string;
  eventName?: string;
  ticketCount?: number;
  orderId: string;
  paymentIntentId?: string;
  refundId?: string;
  reason?: string;
  timestamp: string;
}

export class PaymentEventHandler extends BaseEventHandler {
  private emailProvider = ProviderFactory.getEmailProvider();
  private smsProvider = ProviderFactory.getSMSProvider();

  constructor() {
    super('payment-notifications', 'PaymentEventHandler');
  }

  initializeListeners(): void {
    this.queue.process('payment.succeeded', async (job) => {
      await this.handlePaymentSuccess(job.data);
    });

    this.queue.process('payment.failed', async (job) => {
      await this.handlePaymentFailed(job.data);
    });

    this.queue.process('refund.processed', async (job) => {
      await this.handleRefundProcessed(job.data);
    });

    this.queue.process('dispute.created', async (job) => {
      await this.handleDisputeCreated(job.data);
    });

    logger.info('Payment event listeners initialized');
  }

  private async handlePaymentSuccess(data: PaymentEventData): Promise<void> {
    try {
      logger.info(`Processing payment success for order ${data.orderId}`);

      const user = await this.getUserDetails(data.userId);
      
      let eventDetails: any = null;
      if (data.eventId) {
        eventDetails = await this.getEventDetails(data.eventId);
      }

      const templateData = {
        user: {
          name: user.name || user.email?.split('@')[0] || 'Customer',
          email: user.email || `user_${data.userId}@tickettoken.com`
        },
        amount: (data.amount / 100).toFixed(2),
        currency: (data.currency || 'USD').toUpperCase(),
        eventName: data.eventName || eventDetails?.name || 'Event',
        ticketCount: data.ticketCount || 1,
        orderId: data.orderId,
        orderUrl: `${process.env.FRONTEND_URL || 'https://app.tickettoken.com'}/orders/${data.orderId}`,
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com'
      };

      // For now, create simple HTML without template service
      const emailHtml = this.createPaymentSuccessHtml(templateData);
      const emailText = this.stripHtml(emailHtml);

      try {
        const emailResult = await this.emailProvider.send({
          to: user.email || templateData.user.email,
          subject: `Payment Confirmed - ${templateData.eventName}`,
          html: emailHtml,
          text: emailText,
          tags: ['payment', 'confirmation'],
          metadata: {
            orderId: data.orderId,
            userId: data.userId,
            type: 'payment_success'
          }
        });

        await this.recordNotification({
          userId: data.userId,
          type: 'payment_success',
          channel: 'email',
          recipient: user.email,
          status: emailResult.status,
          metadata: {
            orderId: data.orderId,
            amount: data.amount,
            messageId: emailResult.id
          }
        });

        logger.info(`Payment success email sent to ${user.email} for order ${data.orderId}`);
      } catch (error) {
        logger.error(`Failed to send payment success email:`, error);
      }

      if (user.phone && this.isValidPhone(user.phone)) {
        try {
          const smsMessage = `TicketToken: Payment of $${templateData.amount} confirmed for ${templateData.eventName}. Order #${data.orderId.slice(-8)}`;
          
          const smsResult = await this.smsProvider.send({
            to: user.phone,
            message: smsMessage,
            metadata: {
              orderId: data.orderId,
              type: 'payment_success'
            }
          });

          await this.recordNotification({
            userId: data.userId,
            type: 'payment_success',
            channel: 'sms',
            recipient: user.phone,
            status: smsResult.status,
            metadata: {
              orderId: data.orderId,
              messageId: smsResult.id
            }
          });

          logger.info(`Payment success SMS sent to ${user.phone}`);
        } catch (error) {
          logger.error(`Failed to send payment success SMS:`, error);
        }
      }
    } catch (error) {
      logger.error(`Error handling payment success:`, error);
    }
  }

  private async handlePaymentFailed(data: PaymentEventData): Promise<void> {
    try {
      logger.info(`Processing payment failure for order ${data.orderId}`);

      const user = await this.getUserDetails(data.userId);

      const templateData = {
        user: {
          name: user.name || user.email?.split('@')[0] || 'Customer',
          email: user.email || `user_${data.userId}@tickettoken.com`
        },
        amount: (data.amount / 100).toFixed(2),
        currency: (data.currency || 'USD').toUpperCase(),
        eventName: data.eventName || 'Event',
        orderId: data.orderId,
        reason: data.reason || 'Payment could not be processed',
        retryUrl: `${process.env.FRONTEND_URL || 'https://app.tickettoken.com'}/checkout/retry/${data.orderId}`,
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com'
      };

      const emailHtml = this.createPaymentFailedHtml(templateData);
      const emailText = this.stripHtml(emailHtml);

      const emailResult = await this.emailProvider.send({
        to: user.email || templateData.user.email,
        subject: `Payment Failed - Action Required`,
        html: emailHtml,
        text: emailText,
        tags: ['payment', 'failed'],
        metadata: {
          orderId: data.orderId,
          type: 'payment_failed'
        }
      });

      await this.recordNotification({
        userId: data.userId,
        type: 'payment_failed',
        channel: 'email',
        recipient: user.email,
        status: emailResult.status,
        metadata: {
          orderId: data.orderId,
          reason: data.reason
        }
      });

      logger.info(`Payment failure email sent to ${user.email}`);
    } catch (error) {
      logger.error(`Error handling payment failure:`, error);
    }
  }

  private async handleRefundProcessed(data: PaymentEventData): Promise<void> {
    try {
      logger.info(`Processing refund for order ${data.orderId}`);

      const user = await this.getUserDetails(data.userId);

      const templateData = {
        user: {
          name: user.name || user.email?.split('@')[0] || 'Customer',
          email: user.email || `user_${data.userId}@tickettoken.com`
        },
        amount: (data.amount / 100).toFixed(2),
        currency: (data.currency || 'USD').toUpperCase(),
        orderId: data.orderId,
        refundId: data.refundId,
        reason: data.reason || 'Refund processed',
        processingTime: '3-5 business days',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com'
      };

      const emailHtml = this.createRefundHtml(templateData);
      const emailText = this.stripHtml(emailHtml);

      const emailResult = await this.emailProvider.send({
        to: user.email || templateData.user.email,
        subject: `Refund Processed - Order #${data.orderId.slice(-8)}`,
        html: emailHtml,
        text: emailText,
        tags: ['payment', 'refund'],
        metadata: {
          orderId: data.orderId,
          refundId: data.refundId,
          type: 'refund_processed'
        }
      });

      await this.recordNotification({
        userId: data.userId,
        type: 'refund_processed',
        channel: 'email',
        recipient: user.email,
        status: emailResult.status,
        metadata: {
          orderId: data.orderId,
          refundId: data.refundId,
          amount: data.amount
        }
      });

      if (user.phone && this.isValidPhone(user.phone)) {
        const smsMessage = `TicketToken: Refund of $${templateData.amount} has been processed. Expect funds in ${templateData.processingTime}.`;
        
        await this.smsProvider.send({
          to: user.phone,
          message: smsMessage,
          metadata: {
            orderId: data.orderId,
            refundId: data.refundId,
            type: 'refund_processed'
          }
        });
      }

      logger.info(`Refund notification sent to ${user.email}`);
    } catch (error) {
      logger.error(`Error handling refund:`, error);
    }
  }

  private async handleDisputeCreated(data: any): Promise<void> {
    try {
      logger.info(`Processing dispute for order ${data.orderId}`);

      const csEmail = process.env.CS_TEAM_EMAIL || 'disputes@tickettoken.com';
      
      await this.emailProvider.send({
        to: csEmail,
        subject: `[URGENT] Payment Dispute Created - Order #${data.orderId}`,
        html: `
          <h2>Payment Dispute Alert</h2>
          <p>A payment dispute has been created.</p>
          <ul>
            <li>Order ID: ${data.orderId}</li>
            <li>Amount: $${(data.amount / 100).toFixed(2)}</li>
            <li>User ID: ${data.userId}</li>
            <li>Reason: ${data.reason || 'Not specified'}</li>
            <li>Created: ${new Date(data.timestamp).toLocaleString()}</li>
          </ul>
          <p>Please review in the admin dashboard immediately.</p>
        `,
        text: `Payment dispute created for order ${data.orderId}. Amount: $${(data.amount / 100).toFixed(2)}. Please review immediately.`,
        tags: ['dispute', 'urgent']
      });

      logger.info(`Dispute alert sent to customer service`);
    } catch (error) {
      logger.error(`Error handling dispute:`, error);
    }
  }

  private createPaymentSuccessHtml(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Payment Confirmation</title>
      </head>
      <body>
          <h1>Payment Confirmed! 🎉</h1>
          <p>Hi ${data.user.name},</p>
          <p>Your payment has been successfully processed.</p>
          <h3>Order Details</h3>
          <ul>
              <li>Event: ${data.eventName}</li>
              <li>Tickets: ${data.ticketCount}</li>
              <li>Amount: $${data.amount} ${data.currency}</li>
              <li>Order ID: #${data.orderId}</li>
          </ul>
          <p><a href="${data.orderUrl}">View Your Tickets</a></p>
          <p>Thank you for using TicketToken!</p>
      </body>
      </html>
    `;
  }

  private createPaymentFailedHtml(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Payment Failed</title>
      </head>
      <body>
          <h1>Payment Failed</h1>
          <p>Hi ${data.user.name},</p>
          <p>Unfortunately, we were unable to process your payment.</p>
          <p>Reason: ${data.reason}</p>
          <p>Event: ${data.eventName}</p>
          <p>Amount: $${data.amount} ${data.currency}</p>
          <p><a href="${data.retryUrl}">Try Payment Again</a></p>
      </body>
      </html>
    `;
  }

  private createRefundHtml(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Refund Processed</title>
      </head>
      <body>
          <h1>Refund Processed</h1>
          <p>Hi ${data.user.name},</p>
          <p>Your refund has been processed.</p>
          <ul>
              <li>Amount: $${data.amount} ${data.currency}</li>
              <li>Order ID: ${data.orderId}</li>
              <li>Refund ID: ${data.refundId}</li>
              <li>Processing Time: ${data.processingTime}</li>
          </ul>
          <p>If you have questions, contact ${data.supportEmail}</p>
      </body>
      </html>
    `;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  private isValidPhone(phone: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }
}
```

### FILE: src/controllers/webhook.controller.ts
```typescript
import { Request, Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import * as crypto from 'crypto';

export class WebhookController {
  // Webhook secrets for external providers
  private readonly SENDGRID_WEBHOOK_KEY = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY || '';
  private readonly TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
  
  async handleSendGridWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Verify SendGrid webhook signature
      if (!this.verifySendGridSignature(req)) {
        logger.warn('Invalid SendGrid webhook signature', {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        res.status(401).send('Unauthorized');
        return;
      }

      const events = req.body;
      for (const event of events) {
        if (event.sg_message_id) {
          await this.updateNotificationStatus(
            event.sg_message_id,
            this.mapSendGridStatus(event.event),
            event
          );
        }
      }
      res.status(200).send('OK');
    } catch (error) {
      logger.error('SendGrid webhook error', error);
      res.status(500).send('Error processing webhook');
    }
  }
  
  async handleTwilioWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Verify Twilio webhook signature
      if (!this.verifyTwilioSignature(req)) {
        logger.warn('Invalid Twilio webhook signature', {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        res.status(401).send('Unauthorized');
        return;
      }

      const { MessageSid, MessageStatus, ErrorCode } = req.body;
      await this.updateNotificationStatus(
        MessageSid,
        this.mapTwilioStatus(MessageStatus),
        { errorCode: ErrorCode }
      );
      res.status(200).send('OK');
    } catch (error) {
      logger.error('Twilio webhook error', error);
      res.status(500).send('Error processing webhook');
    }
  }

  private verifySendGridSignature(req: Request): boolean {
    // SendGrid Event Webhook uses the Event Webhook Signing Key
    const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;
    
    if (!signature || !timestamp || !this.SENDGRID_WEBHOOK_KEY) {
      logger.warn('Missing SendGrid webhook verification components', {
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
        hasKey: !!this.SENDGRID_WEBHOOK_KEY
      });
      return false;
    }

    // Check timestamp is recent (within 5 minutes)
    const currentTime = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp);
    if (Math.abs(currentTime - webhookTime) > 300) {
      logger.warn('SendGrid webhook timestamp too old', {
        webhookTime,
        currentTime,
        diff: Math.abs(currentTime - webhookTime)
      });
      return false;
    }

    // Compute signature using SendGrid's method
    const payload = timestamp + JSON.stringify(req.body) + this.SENDGRID_WEBHOOK_KEY;
    const expectedSignature = crypto
      .createHmac('sha256', this.SENDGRID_WEBHOOK_KEY)
      .update(payload)
      .digest('base64');

    // Compare signatures using timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      logger.error('Signature comparison error', err);
      return false;
    }
  }

  private verifyTwilioSignature(req: Request): boolean {
    const twilioSignature = req.headers['x-twilio-signature'] as string;
    
    if (!twilioSignature || !this.TWILIO_AUTH_TOKEN) {
      logger.warn('Missing Twilio webhook verification components', {
        hasSignature: !!twilioSignature,
        hasToken: !!this.TWILIO_AUTH_TOKEN
      });
      return false;
    }

    // Build the full URL (Twilio requires the exact URL)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const fullUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;
    
    // Sort the POST parameters alphabetically and concatenate
    const params = Object.keys(req.body)
      .sort()
      .reduce((acc, key) => {
        return acc + key + req.body[key];
      }, '');

    // Create the signature string
    const signatureString = fullUrl + params;
    
    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha1', this.TWILIO_AUTH_TOKEN)
      .update(signatureString)
      .digest('base64');

    // Compare signatures using timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(twilioSignature),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      logger.error('Signature comparison error', err);
      return false;
    }
  }

  // Generic webhook handler for other providers with HMAC verification
  async handleGenericWebhook(req: Request, res: Response): Promise<void> {
    try {
      const provider = req.params.provider;
      const signature = req.headers['x-webhook-signature'] as string;
      const timestamp = req.headers['x-webhook-timestamp'] as string;
      
      // Get provider-specific secret
      const webhookSecret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`];
      
      if (!webhookSecret) {
        logger.error(`No webhook secret configured for provider: ${provider}`);
        res.status(500).send('Provider not configured');
        return;
      }

      // Verify signature
      if (!this.verifyGenericSignature(req, webhookSecret)) {
        logger.warn(`Invalid webhook signature for provider: ${provider}`, {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        res.status(401).send('Unauthorized');
        return;
      }

      // Process webhook based on provider
      await this.processGenericWebhook(provider, req.body);
      res.status(200).send('OK');
    } catch (error) {
      logger.error('Generic webhook error', error);
      res.status(500).send('Error processing webhook');
    }
  }

  private verifyGenericSignature(req: Request, secret: string): boolean {
    const signature = req.headers['x-webhook-signature'] as string;
    const timestamp = req.headers['x-webhook-timestamp'] as string;
    
    if (!signature || !timestamp) {
      return false;
    }

    // Check timestamp is recent (within 5 minutes)
    const currentTime = Date.now();
    const webhookTime = parseInt(timestamp);
    if (Math.abs(currentTime - webhookTime) > 300000) {
      logger.warn('Webhook timestamp too old', {
        webhookTime,
        currentTime,
        diff: Math.abs(currentTime - webhookTime)
      });
      return false;
    }

    // Compute expected signature
    const payload = `${timestamp}.${JSON.stringify(req.body)}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Compare signatures using timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      return false;
    }
  }

  private async processGenericWebhook(provider: string, data: any): Promise<void> {
    // Process based on provider type
    logger.info(`Processing webhook for provider: ${provider}`, { 
      provider,
      dataKeys: Object.keys(data)
    });
    
    // Store webhook data for processing
    await db('webhook_events').insert({
      provider,
      payload: JSON.stringify(data),
      received_at: new Date(),
      processed: false
    });
  }
  
  private async updateNotificationStatus(
    providerMessageId: string,
    status: string,
    additionalData?: any
  ) {
    await db('notification_tracking')
      .where('provider_message_id', providerMessageId)
      .update({
        status,
        updated_at: new Date(),
        ...(status === 'delivered' && { delivered_at: new Date() }),
        ...(additionalData?.errorCode && { failure_reason: additionalData.errorCode }),
      });
  }
  
  private mapSendGridStatus(event: string): string {
    switch (event) {
      case 'delivered': return 'delivered';
      case 'bounce': return 'bounced';
      case 'dropped': return 'failed';
      case 'deferred': return 'queued';
      default: return 'sent';
    }
  }
  
  private mapTwilioStatus(status: string): string {
    switch (status) {
      case 'delivered': return 'delivered';
      case 'failed': return 'failed';
      case 'undelivered': return 'bounced';
      default: return 'sent';
    }
  }
}

export const webhookController = new WebhookController();
```

### FILE: src/controllers/consent.controller.ts
```typescript
import { Request, Response } from 'express';
import { complianceService } from '../services/compliance.service';
import { logger } from '../config/logger';
import { validationResult } from 'express-validator';

export class ConsentController {
  async grant(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { customerId, channel, type, source, venueId } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');

      await complianceService.recordConsent(
        customerId,
        channel,
        type,
        source,
        venueId,
        ipAddress,
        userAgent
      );

      res.status(201).json({
        success: true,
        message: 'Consent recorded successfully',
      });
    } catch (error: any) {
      logger.error('Failed to record consent', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async revoke(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { customerId, channel, type, venueId } = req.body;

      await complianceService.revokeConsent(
        customerId,
        channel,
        type,
        venueId
      );

      res.status(200).json({
        success: true,
        message: 'Consent revoked successfully',
      });
    } catch (error: any) {
      logger.error('Failed to revoke consent', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async check(req: Request, res: Response): Promise<void> {
    try {
      const { customerId } = req.params;
      const { channel, type, venueId } = req.query;

      const consentModel = require('../models/consent.model').consentModel;
      const hasConsent = await consentModel.hasConsent(
        customerId,
        channel as any,
        type as any,
        venueId as string
      );

      res.status(200).json({
        success: true,
        data: {
          hasConsent,
          customerId,
          channel,
          type,
          venueId,
        },
      });
    } catch (error: any) {
      logger.error('Failed to check consent', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export const consentController = new ConsentController();
```

### FILE: src/models/suppression.model.ts
```typescript
import { db } from '../config/database';
import { SuppressionRecord, NotificationChannel } from '../types/notification.types';
import { logger } from '../config/logger';
import crypto from 'crypto';

export class SuppressionModel {
  private readonly tableName = 'suppression_list';

  async add(suppression: Omit<SuppressionRecord, 'id'>): Promise<SuppressionRecord> {
    // Hash the identifier for privacy
    const hashedIdentifier = this.hashIdentifier(suppression.identifier);

    const [record] = await db(this.tableName)
      .insert({
        ...suppression,
        id: db.raw('gen_random_uuid()'),
        identifier_hash: hashedIdentifier,
        created_at: new Date(),
      })
      .returning('*');
    
    logger.info('Added to suppression list', { 
      channel: suppression.channel,
      reason: suppression.reason 
    });
    
    return this.mapToSuppressionRecord(record);
  }

  async isSuppressed(identifier: string, channel: NotificationChannel): Promise<boolean> {
    const hashedIdentifier = this.hashIdentifier(identifier);

    const result = await db(this.tableName)
      .where('identifier_hash', hashedIdentifier)
      .andWhere('channel', channel)
      .andWhere(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', new Date());
      })
      .first();

    return !!result;
  }

  async remove(identifier: string, channel?: NotificationChannel): Promise<void> {
    const hashedIdentifier = this.hashIdentifier(identifier);

    let query = db(this.tableName)
      .where('identifier_hash', hashedIdentifier);

    if (channel) {
      query = query.andWhere('channel', channel);
    }

    await query.delete();

    logger.info('Removed from suppression list', { channel });
  }

  async findAll(limit: number = 100, offset: number = 0): Promise<SuppressionRecord[]> {
    const records = await db(this.tableName)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return records.map(this.mapToSuppressionRecord);
  }

  private hashIdentifier(identifier: string): string {
    return crypto
      .createHash('sha256')
      .update(identifier.toLowerCase().trim())
      .digest('hex');
  }

  private mapToSuppressionRecord(row: any): SuppressionRecord {
    return {
      id: row.id,
      identifier: row.identifier, // Note: This might be null for privacy
      channel: row.channel,
      reason: row.reason,
      suppressedAt: row.suppressed_at || row.created_at,
      suppressedBy: row.suppressed_by,
      expiresAt: row.expires_at,
    };
  }
}

export const suppressionModel = new SuppressionModel();
```

### FILE: src/models/consent.model.ts
```typescript
import { db } from '../config/database';
import { ConsentRecord, NotificationChannel, NotificationType } from '../types/notification.types';
import { logger } from '../config/logger';

export class ConsentModel {
  private readonly tableName = 'consent_records';

  async create(consent: Omit<ConsentRecord, 'id'>): Promise<ConsentRecord> {
    const [record] = await db(this.tableName)
      .insert({
        customer_id: consent.customerId,
        venue_id: consent.venueId,
        channel: consent.channel,
        type: consent.type,
        status: consent.status,
        granted_at: consent.grantedAt,
        source: consent.source,
        ip_address: consent.ipAddress,
        user_agent: consent.userAgent,
        id: db.raw('gen_random_uuid()'),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    
    logger.info('Consent record created', { 
      customerId: consent.customerId, 
      channel: consent.channel,
      status: consent.status 
    });
    
    return this.mapToConsentRecord(record);
  }

  async findByCustomer(
    customerId: string, 
    channel?: NotificationChannel, 
    type?: NotificationType
  ): Promise<ConsentRecord[]> {
    let query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('status', 'granted');

    if (channel) {
      query = query.andWhere('channel', channel);
    }

    if (type) {
      query = query.andWhere('type', type);
    }

    const records = await query;
    return records.map(this.mapToConsentRecord);
  }

  async hasConsent(
    customerId: string,
    channel: NotificationChannel,
    type: NotificationType,
    venueId?: string
  ): Promise<boolean> {
    const query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('channel', channel)
      .andWhere('type', type)
      .andWhere('status', 'granted')
      .andWhere(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', new Date());
      });

    if (venueId) {
      query.andWhere(function() {
        this.whereNull('venue_id')
          .orWhere('venue_id', venueId);
      });
    }

    const result = await query.first();
    return !!result;
  }

  async revoke(
    customerId: string,
    channel: NotificationChannel,
    type?: NotificationType,
    venueId?: string
  ): Promise<void> {
    const query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('channel', channel)
      .andWhere('status', 'granted');

    if (type) {
      query.andWhere('type', type);
    }

    if (venueId) {
      query.andWhere('venue_id', venueId);
    }

    await query.update({
      status: 'revoked',
      revoked_at: new Date(),
      updated_at: new Date(),
    });

    logger.info('Consent revoked', { customerId, channel, type, venueId });
  }

  async getAuditTrail(customerId: string): Promise<ConsentRecord[]> {
    const records = await db(this.tableName)
      .where('customer_id', customerId)
      .orderBy('created_at', 'desc');
    
    return records.map(this.mapToConsentRecord);
  }

  private mapToConsentRecord(row: any): ConsentRecord {
    return {
      id: row.id,
      customerId: row.customer_id,
      venueId: row.venue_id,
      channel: row.channel,
      type: row.type,
      status: row.status,
      grantedAt: row.granted_at,
      revokedAt: row.revoked_at,
      expiresAt: row.expires_at,
      source: row.source,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }
}

export const consentModel = new ConsentModel();
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    venueId?: string;
    role?: string;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'No authorization token provided',
      });
      return;
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as any;

    req.user = {
      id: decoded.userId || decoded.id,
      email: decoded.email,
      venueId: decoded.venueId,
      role: decoded.role,
    };

    next();
  } catch (error: any) {
    logger.error('Authentication failed', error);
    
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
      return;
    }

    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: 'Token expired',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
};

export const optionalAuthMiddleware = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      req.user = {
        id: decoded.userId || decoded.id,
        email: decoded.email,
        venueId: decoded.venueId,
        role: decoded.role,
      };
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};
```

### FILE: src/middleware/webhook-auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const verifyTwilioSignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const twilioSignature = req.headers['x-twilio-signature'] as string;
    
    if (!twilioSignature || !env.TWILIO_AUTH_TOKEN) {
      res.status(401).json({ error: 'Unauthorized webhook request' });
      return;
    }

    // Twilio signature verification logic
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = req.body || {};
    
    // Sort parameters alphabetically and concatenate
    const data = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], url);
    
    const expectedSignature = crypto
      .createHmac('sha1', env.TWILIO_AUTH_TOKEN)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');
    
    if (twilioSignature !== expectedSignature) {
      logger.warn('Invalid Twilio webhook signature');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
    
    next();
  } catch (error) {
    logger.error('Webhook verification error:', error);
    res.status(500).json({ error: 'Webhook verification failed' });
  }
};

export const verifySendGridSignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;
    
    if (!signature || !timestamp || !(env as any).SENDGRID_WEBHOOK_SECRET) {
      res.status(401).json({ error: 'Unauthorized webhook request' });
      return;
    }
    
    const payload = timestamp + req.body;
    const expectedSignature = crypto
      .createHmac('sha256', (env as any).SENDGRID_WEBHOOK_SECRET)
      .update(payload)
      .digest('base64');
    
    if (signature !== expectedSignature) {
      logger.warn('Invalid SendGrid webhook signature');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
    
    next();
  } catch (error) {
    logger.error('Webhook verification error:', error);
    res.status(500).json({ error: 'Webhook verification failed' });
  }
};
```

### FILE: src/providers/base.provider.ts
```typescript
export interface NotificationResult {
  id: string;
  status: 'sent' | 'failed' | 'queued' | 'delivered' | 'bounced';
  channel: 'email' | 'sms' | 'push';
  timestamp: string;
  provider: string;
  metadata?: Record<string, any>;
}

export interface BaseProviderConfig {
  apiKey?: string;
  apiSecret?: string;
  from?: string;
  region?: string;
  sandbox?: boolean;
  retryAttempts?: number;
  timeout?: number;
}

export abstract class BaseProvider {
  protected config: BaseProviderConfig;
  protected name: string;

  constructor(config: BaseProviderConfig = {}) {
    this.config = config;
    this.name = this.constructor.name;
  }

  abstract verify(): Promise<boolean>;
  abstract getStatus(): Promise<Record<string, any>>;
}
```

### FILE: src/providers/webhook.provider.ts
```typescript
import axios from 'axios';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface WebhookOptions {
  url: string;
  secret?: string;
  data: any;
  headers?: Record<string, string>;
}

class WebhookProvider {
  async send(options: WebhookOptions): Promise<NotificationResponse> {
    try {
      if (!env.ENABLE_WEBHOOK_DELIVERY) {
        logger.info('Webhook delivery disabled', { url: options.url });
        return {
          id: 'mock-webhook-' + Date.now(),
          status: 'sent',
          channel: 'webhook',
        };
      }

      // Generate signature if secret provided
      const signature = options.secret 
        ? this.generateSignature(options.data, options.secret)
        : undefined;

      const headers = {
        'Content-Type': 'application/json',
        'X-TicketToken-Signature': signature,
        'X-TicketToken-Timestamp': Date.now().toString(),
        ...options.headers,
      };

      const response = await axios.post(options.url, options.data, {
        headers,
        timeout: 10000,
      });

      logger.info('Webhook delivered successfully', {
        url: options.url,
        status: response.status,
      });

      return {
        id: 'webhook-' + Date.now(),
        status: 'delivered',
        channel: 'webhook',
        deliveredAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Failed to deliver webhook', {
        url: options.url,
        error: error.message,
      });

      return {
        id: 'webhook-' + Date.now(),
        status: 'failed',
        channel: 'webhook',
        failureReason: error.message,
      };
    }
  }

  private generateSignature(data: any, secret: string): string {
    const payload = JSON.stringify(data);
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  async validateWebhook(body: string, signature: string, secret: string): Promise<boolean> {
    const expectedSignature = this.generateSignature(JSON.parse(body), secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

export const webhookProvider = new WebhookProvider();
```

### FILE: src/providers/aws-sns.provider.ts
```typescript
// @ts-nocheck
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import AWS from 'aws-sdk';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface SNSSmsOptions {
  to: string;
  body: string;
  messageType?: 'Transactional' | 'Promotional';
}

class AWSSNSProvider {
  private sns: AWS.SNS;

  constructor() {
    this.sns = new AWS.SNS({
      region: env.AWS_REGION || 'us-east-1',
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    });
  }

  async send(options: SNSSmsOptions): Promise<NotificationResponse> {
    try {
      const params: AWS.SNS.PublishRequest = {
        Message: options.body,
        PhoneNumber: this.formatPhoneNumber(options.to),
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: options.messageType || 'Transactional',
          },
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: 'TicketToken',
          },
        },
      };

      const result = await this.sns.publish(params).promise();

      logger.info('SMS sent via AWS SNS', {
        messageId: result.MessageId,
        to: options.to,
      });

      return {
        id: result.MessageId!,
        status: 'sent',
        channel: 'sms',
        sentAt: new Date(),
        providerMessageId: result.MessageId,
        cost: 0.00645, // AWS SNS pricing for US
      };
    } catch (error: any) {
      logger.error('AWS SNS send failed', error);
      throw error;
    }
  }

  private formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }

  async setSMSAttributes(attributes: AWS.SNS.SetSMSAttributesInput): Promise<void> {
    await this.sns.setSMSAttributes(attributes).promise();
  }
}

export const awsSNSProvider = new AWSSNSProvider();
```

### FILE: src/providers/sms.provider.ts
```typescript
import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface SmsOptions {
  to: string;
  body: string;
  from?: string;
  mediaUrl?: string[];
}

class SmsProvider {
  private client: twilio.Twilio | null = null;

  constructor() {
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    }
  }

  async send(options: SmsOptions): Promise<NotificationResponse> {
    try {
      if (!env.ENABLE_SMS) {
        logger.info('SMS sending disabled', { to: options.to });
        return {
          id: 'mock-sms-' + Date.now(),
          status: 'sent',
          channel: 'sms',
        };
      }

      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      // Format phone number
      const toNumber = this.formatPhoneNumber(options.to);
      
      const message = await this.client.messages.create({
        body: options.body,
        to: toNumber,
        from: options.from || env.TWILIO_FROM_NUMBER,
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
        mediaUrl: options.mediaUrl,
      });

      logger.info('SMS sent successfully', {
        to: toNumber,
        sid: message.sid,
        status: message.status,
      });

      return {
        id: message.sid,
        status: this.mapTwilioStatus(message.status),
        channel: 'sms',
        sentAt: new Date(),
        providerMessageId: message.sid,
        cost: message.price ? Math.abs(parseFloat(message.price)) : 0.0079, // Approximate cost
      };
    } catch (error: any) {
      logger.error('Failed to send SMS', {
        to: options.to,
        error: error.message,
        code: error.code,
      });

      // Handle specific Twilio errors
      if (error.code === 20003) {
        throw new Error('Invalid Twilio credentials');
      }
      if (error.code === 21211) {
        throw new Error('Invalid phone number');
      }
      if (error.code === 21610) {
        throw new Error('Recipient has opted out of SMS');
      }

      throw error;
    }
  }

  async sendBulk(messages: SmsOptions[]): Promise<NotificationResponse[]> {
    const results: NotificationResponse[] = [];

    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const promises = batch.map(msg => this.send(msg));
      const batchResults = await Promise.allSettled(promises);
      
      results.push(...batchResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            id: 'failed-sms-' + Date.now() + '-' + index,
            status: 'failed' as const,
            channel: 'sms' as const,
            failureReason: result.reason.message,
          };
        }
      }));

      // Add delay between batches to respect rate limits
      if (i + batchSize < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');

    // Add US country code if not present
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }

    // Add + prefix if not present
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  private mapTwilioStatus(status: string): NotificationResponse['status'] {
    switch (status) {
      case 'queued':
      case 'accepted':
        return 'queued';
      case 'sending':
        return 'sending';
      case 'sent':
      case 'delivered':
        return 'delivered';
      case 'failed':
      case 'undelivered':
        return 'failed';
      default:
        return 'sent';
    }
  }

  async validatePhoneNumber(phone: string): Promise<boolean> {
    if (!this.client) {
      // Basic validation if Twilio is not configured
      const cleaned = phone.replace(/\D/g, '');
      return cleaned.length >= 10 && cleaned.length <= 15;
    }

    try {
      const lookup = await this.client.lookups.v1
        .phoneNumbers(phone)
        .fetch();
      
      return lookup.phoneNumber !== null;
    } catch (error) {
      logger.warn('Phone validation failed', { phone, error });
      return false;
    }
  }

  async getDeliveryStatus(messageSid: string): Promise<string> {
    if (!this.client) {
      throw new Error('Twilio client not initialized');
    }

    const message = await this.client.messages(messageSid).fetch();
    return message.status;
  }
}

export const smsProvider = new SmsProvider();
```

### FILE: src/providers/sms/base-sms.provider.ts
```typescript
import { BaseProvider, NotificationResult } from '../base.provider';

export interface SendSMSInput {
  to: string;
  message: string;
  from?: string;
  metadata?: Record<string, any>;
}

export abstract class BaseSMSProvider extends BaseProvider {
  abstract send(input: SendSMSInput): Promise<NotificationResult>;
  abstract sendBulk(inputs: SendSMSInput[]): Promise<NotificationResult[]>;
  
  protected validatePhoneNumber(phone: string): boolean {
    // E.164 format validation
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }
}
```

### FILE: src/providers/sms/sms.provider.ts
```typescript

export interface SendSMSInput { to:string; message:string; }
export class SMSProvider { async send(_i: SendSMSInput){ return { id:'stub-sms', status:'queued' as const, channel:'sms' as const }; } }
```

### FILE: src/providers/email/base-email.provider.ts
```typescript
import { BaseProvider, NotificationResult } from '../base.provider';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  tags?: string[];
  metadata?: Record<string, any>;
}

export abstract class BaseEmailProvider extends BaseProvider {
  abstract send(input: SendEmailInput): Promise<NotificationResult>;
  abstract sendBulk(inputs: SendEmailInput[]): Promise<NotificationResult[]>;
}
```

### FILE: src/providers/email/email.provider.ts
```typescript

export interface SendEmailInput { to:string; subject:string; html?:string; text?:string; from?:string; }
export class EmailProvider { async send(_i: SendEmailInput){ return { id:'stub-email', status:'queued' as const, channel:'email' as const }; } }
```

### FILE: src/providers/push/push.provider.ts
```typescript

export interface SendPushInput { token:string; title:string; body:string; data?: any; }
export class PushProvider { async send(_i: SendPushInput){ return { id:'stub-push', status:'queued' as const, channel:'push' as const }; } }
```

### FILE: src/providers/aws-ses.provider.ts
```typescript
// @ts-nocheck
import AWS from 'aws-sdk';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface SESEmailOptions {
  to: string | string[];
  from: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

class AWSSESProvider {
  private ses: AWS.SES;

  constructor() {
    this.ses = new AWS.SES({
      region: env.AWS_REGION || 'us-east-1',
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    });
  }

  async send(options: SESEmailOptions): Promise<NotificationResponse> {
    try {
      const params: AWS.SES.SendEmailRequest = {
        Source: options.from,
        Destination: {
          ToAddresses: Array.isArray(options.to) ? options.to : [options.to],
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Text: {
              Data: options.text,
              Charset: 'UTF-8',
            },
            ...(options.html && {
              Html: {
                Data: options.html,
                Charset: 'UTF-8',
              },
            }),
          },
        },
        ...(options.replyTo && { ReplyToAddresses: [options.replyTo] }),
      };

      const result = await this.ses.sendEmail(params).promise();

      logger.info('Email sent via AWS SES', {
        messageId: result.MessageId,
        to: options.to,
      });

      return {
        id: result.MessageId,
        status: 'sent',
        channel: 'email',
        sentAt: new Date(),
        providerMessageId: result.MessageId,
        cost: 0.0001, // AWS SES pricing
      };
    } catch (error: any) {
      logger.error('AWS SES send failed', error);
      throw error;
    }
  }

  async getQuota(): Promise<AWS.SES.GetSendQuotaResponse> {
    return await this.ses.getSendQuota().promise();
  }

  async verifyEmailIdentity(email: string): Promise<void> {
    await this.ses.verifyEmailIdentity({ EmailAddress: email }).promise();
  }
}

export const awsSESProvider = new AWSSESProvider();
```

### FILE: src/providers/email.provider.ts
```typescript
import sgMail from '@sendgrid/mail';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface EmailOptions {
  to: string;
  from: string;
  fromName?: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: Array<{
    content: string;
    filename: string;
    type?: string;
    disposition?: string;
  }>;
}

class EmailProvider {
  constructor() {
    if (env.SENDGRID_API_KEY) {
      sgMail.setApiKey(env.SENDGRID_API_KEY);
    }
  }

  async send(options: EmailOptions): Promise<NotificationResponse> {
    try {
      if (!env.ENABLE_EMAIL) {
        logger.info('Email sending disabled', { to: options.to });
        return {
          id: 'mock-' + Date.now(),
          status: 'sent',
          channel: 'email',
        };
      }

      const msg = {
        to: options.to,
        from: {
          email: options.from,
          name: options.fromName || env.SENDGRID_FROM_NAME,
        },
        subject: options.subject,
        text: options.text,
        html: options.html || options.text,
        replyTo: options.replyTo,
        attachments: options.attachments,
        trackingSettings: {
          clickTracking: {
            enable: true,
          },
          openTracking: {
            enable: true,
          },
        },
      };

      const [response] = await sgMail.send(msg);

      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        messageId: response.headers['x-message-id'],
      });

      return {
        id: response.headers['x-message-id'] || 'sg-' + Date.now(),
        status: 'sent',
        channel: 'email',
        sentAt: new Date(),
        providerMessageId: response.headers['x-message-id'],
        cost: 0.0001, // Approximate SendGrid cost per email
      };
    } catch (error: any) {
      logger.error('Failed to send email', {
        to: options.to,
        error: error.message,
        code: error.code,
      });

      // Handle specific SendGrid errors
      if (error.code === 401) {
        throw new Error('Invalid SendGrid API key');
      }

      if (error.response?.body?.errors) {
        const sgError = error.response.body.errors[0];
        throw new Error(sgError.message || 'SendGrid error');
      }

      throw error;
    }
  }

  async sendBulk(messages: EmailOptions[]): Promise<NotificationResponse[]> {
    // SendGrid supports up to 1000 recipients per request
    const chunks = this.chunkArray(messages, 1000);
    const results: NotificationResponse[] = [];

    for (const chunk of chunks) {
      const promises = chunk.map(msg => this.send(msg));
      const chunkResults = await Promise.allSettled(promises);
      
      results.push(...chunkResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            id: 'failed-' + Date.now() + '-' + index,
            status: 'failed' as const,
            channel: 'email' as const,
            failureReason: result.reason.message,
          };
        }
      }));
    }

    return results;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async validateEmail(email: string): Promise<boolean> {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export const emailProvider = new EmailProvider();
```

### FILE: src/services/automation.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { notificationServiceV2 } from './notification.service.v2';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';

interface AutomationTrigger {
  id: string;
  venueId: string;
  name: string;
  triggerType: 'event' | 'time' | 'behavior' | 'api';
  conditions: any;
  actions: any[];
  enabled: boolean;
}

export class AutomationService {
  private triggers: Map<string, cron.ScheduledTask> = new Map();

  async initializeAutomations() {
    const automations = await db('automation_triggers')
      .where('enabled', true);

    for (const automation of automations) {
      await this.setupTrigger(automation);
    }

    logger.info('Automations initialized', { count: automations.length });
  }

  async createAutomation(automation: {
    venueId: string;
    name: string;
    triggerType: AutomationTrigger['triggerType'];
    conditions: any;
    actions: any[];
  }): Promise<string> {
    const id = uuidv4();

    await db('automation_triggers').insert({
      id,
      venue_id: automation.venueId,
      name: automation.name,
      trigger_type: automation.triggerType,
      conditions: JSON.stringify(automation.conditions),
      actions: JSON.stringify(automation.actions),
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await this.setupTrigger({
      id,
      ...automation,
      enabled: true,
    });

    logger.info('Automation created', { id, name: automation.name });
    return id;
  }

  private async setupTrigger(trigger: any) {
    switch (trigger.trigger_type || trigger.triggerType) {
      case 'time':
        this.setupTimeTrigger(trigger);
        break;
      case 'event':
        this.setupEventTrigger(trigger);
        break;
      case 'behavior':
        this.setupBehaviorTrigger(trigger);
        break;
    }
  }

  private setupTimeTrigger(trigger: any) {
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    if (conditions.cronExpression) {
      const task = cron.schedule(conditions.cronExpression, async () => {
        await this.executeActions(trigger);
      });

      this.triggers.set(trigger.id, task);
      logger.info('Time trigger scheduled', { 
        id: trigger.id, 
        cron: conditions.cronExpression 
      });
    }
  }

  private setupEventTrigger(trigger: any) {
    // Register event listener for specific events
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    // This would integrate with your event system
    logger.info('Event trigger registered', { 
      id: trigger.id, 
      event: conditions.eventName 
    });
  }

  private setupBehaviorTrigger(trigger: any) {
    // Set up behavior-based triggers
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    // Examples:
    // - Customer hasn't purchased in 30 days
    // - Customer viewed event 3 times
    // - Cart abandoned for 2 hours
    
    logger.info('Behavior trigger configured', { 
      id: trigger.id, 
      behavior: conditions.behaviorType 
    });
  }

  private async executeActions(trigger: any) {
    const actions = typeof trigger.actions === 'string' 
      ? JSON.parse(trigger.actions) 
      : trigger.actions;

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'send_notification':
            await this.executeSendNotification(trigger.venue_id, action);
            break;
          case 'update_customer':
            await this.executeUpdateCustomer(action);
            break;
          case 'webhook':
            await this.executeWebhook(action);
            break;
          case 'delay':
            await this.executeDelay(action);
            break;
        }
      } catch (error) {
        logger.error('Failed to execute automation action', {
          triggerId: trigger.id,
          action: action.type,
          error,
        });
      }
    }

    // Log execution
    await db('automation_executions').insert({
      id: uuidv4(),
      trigger_id: trigger.id,
      executed_at: new Date(),
      status: 'completed',
    });
  }

  private async executeSendNotification(venueId: string, action: any) {
    const recipients = await this.getActionRecipients(action);
    
    for (const recipient of recipients) {
      await notificationServiceV2.send({
        venueId,
        recipientId: recipient.id,
        recipient,
        channel: action.channel || 'email',
        type: 'transactional',
        template: action.template,
        priority: action.priority || 'normal',
        data: action.data || {},
      });
    }
  }

  private async executeUpdateCustomer(action: any) {
    // Update customer attributes
    logger.info('Updating customer', action);
  }

  private async executeWebhook(action: any) {
    // Call external webhook
    logger.info('Calling webhook', { url: action.url });
  }

  private async executeDelay(action: any) {
    const delay = action.duration || 60000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async getActionRecipients(action: any): Promise<any[]> {
    // Get recipients based on action criteria
    if (action.recipientQuery) {
      // Execute dynamic query
      return [];
    }

    if (action.recipientIds) {
      // Get specific recipients
      return action.recipientIds.map((id: string) => ({
        id,
        email: `${id}@example.com`, // Would fetch from DB
      }));
    }

    return [];
  }

  // Behavioral trigger checks
  async checkAbandonedCarts() {
    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

    // Find abandoned carts
    const abandonedCarts = await db('shopping_carts')
      .where('status', 'active')
      .where('updated_at', '<', twoHoursAgo)
      .whereNull('completed_at');

    for (const cart of abandonedCarts) {
      // Trigger abandoned cart automation
      const triggers = await db('automation_triggers')
        .where('trigger_type', 'behavior')
        .whereRaw(`conditions->>'behaviorType' = 'cart_abandoned'`)
        .where('venue_id', cart.venue_id)
        .where('enabled', true);

      for (const trigger of triggers) {
        await this.executeActions(trigger);
      }
    }
  }

  async checkReEngagement() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find inactive customers
    const inactiveCustomers = await db('customers')
      .where('last_activity_at', '<', thirtyDaysAgo)
      .whereNotIn('id', function() {
        this.select('customer_id')
          .from('suppression_list')
          .where('channel', 'all');
      });

    logger.info('Found inactive customers', { count: inactiveCustomers.length });
    // Trigger re-engagement campaigns
  }
}

export const automationService = new AutomationService();
```

### FILE: src/services/preference-manager.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import * as crypto from 'crypto';

export interface UserPreferences {
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  
  // Category preferences
  emailPayment: boolean;
  emailMarketing: boolean;
  emailEventUpdates: boolean;
  emailAccount: boolean;
  
  smsCriticalOnly: boolean;
  smsPayment: boolean;
  smsEventReminders: boolean;
  
  pushPayment: boolean;
  pushEventUpdates: boolean;
  pushMarketing: boolean;
  
  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;
  
  // Limits
  maxEmailsPerDay: number;
  maxSmsPerDay: number;
  
  unsubscribeToken?: string;
  unsubscribedAt?: Date;
}

export class PreferenceManager {
  private cache: Map<string, UserPreferences> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes
  
  async getPreferences(userId: string): Promise<UserPreferences> {
    // Check cache first
    if (this.cache.has(userId)) {
      const cached = this.cache.get(userId)!;
      return cached;
    }
    
    // Get from database
    let prefs = await db('notification_preferences')
      .where('user_id', userId)
      .first();
    
    // Create default preferences if not exists
    if (!prefs) {
      prefs = await this.createDefaultPreferences(userId);
    }
    
    const preferences = this.mapToPreferences(prefs);
    
    // Cache it
    this.cache.set(userId, preferences);
    setTimeout(() => this.cache.delete(userId), this.CACHE_TTL);
    
    return preferences;
  }
  
  async updatePreferences(
    userId: string, 
    updates: Partial<UserPreferences>,
    changedBy?: string,
    reason?: string
  ): Promise<UserPreferences> {
    // Record current state for history
    const current = await this.getPreferences(userId);
    
    // Map updates to database columns
    const dbUpdates = this.mapToDatabase(updates);
    
    // Update database
    const [updated] = await db('notification_preferences')
      .where('user_id', userId)
      .update({
        ...dbUpdates,
        updated_at: new Date()
      })
      .returning('*');
    
    // Record history
    await this.recordHistory(userId, current, updates, changedBy, reason);
    
    // Clear cache
    this.cache.delete(userId);
    
    const newPrefs = this.mapToPreferences(updated);
    
    logger.info('Preferences updated', {
      userId,
      changes: Object.keys(updates)
    });
    
    return newPrefs;
  }
  
  async canSendNotification(
    userId: string,
    channel: 'email' | 'sms' | 'push',
    type: string
  ): Promise<boolean> {
    const prefs = await this.getPreferences(userId);
    
    // Check if completely unsubscribed
    if (prefs.unsubscribedAt) {
      return false;
    }
    
    // Check channel enabled
    if (channel === 'email' && !prefs.emailEnabled) return false;
    if (channel === 'sms' && !prefs.smsEnabled) return false;
    if (channel === 'push' && !prefs.pushEnabled) return false;
    
    // Check category preferences
    if (channel === 'email') {
      if (type === 'payment' && !prefs.emailPayment) return false;
      if (type === 'marketing' && !prefs.emailMarketing) return false;
      if (type === 'event_update' && !prefs.emailEventUpdates) return false;
      if (type === 'account' && !prefs.emailAccount) return false;
    }
    
    if (channel === 'sms') {
      if (prefs.smsCriticalOnly && !this.isCritical(type)) return false;
      if (type === 'payment' && !prefs.smsPayment) return false;
      if (type === 'event_reminder' && !prefs.smsEventReminders) return false;
    }
    
    if (channel === 'push') {
      if (type === 'payment' && !prefs.pushPayment) return false;
      if (type === 'event_update' && !prefs.pushEventUpdates) return false;
      if (type === 'marketing' && !prefs.pushMarketing) return false;
    }
    
    // Check quiet hours
    if (prefs.quietHoursEnabled && this.isQuietHours(prefs)) {
      if (!this.isCritical(type)) {
        return false;
      }
    }
    
    // Check daily limits
    const todayCount = await this.getTodayCount(userId, channel);
    if (channel === 'email' && todayCount >= prefs.maxEmailsPerDay) return false;
    if (channel === 'sms' && todayCount >= prefs.maxSmsPerDay) return false;
    
    return true;
  }
  
  async unsubscribe(token: string): Promise<boolean> {
    const [updated] = await db('notification_preferences')
      .where('unsubscribe_token', token)
      .update({
        email_enabled: false,
        sms_enabled: false,
        push_enabled: false,
        unsubscribed_at: new Date(),
        updated_at: new Date()
      })
      .returning('user_id');
    
    if (updated) {
      this.cache.delete(updated.user_id);
      logger.info('User unsubscribed', { userId: updated.user_id });
      return true;
    }
    
    return false;
  }
  
  async generateUnsubscribeLink(userId: string): Promise<string> {
    const prefs = await this.getPreferences(userId);
    const baseUrl = process.env.FRONTEND_URL || 'https://app.tickettoken.com';
    return `${baseUrl}/unsubscribe/${prefs.unsubscribeToken}`;
  }
  
  private async createDefaultPreferences(userId: string): Promise<any> {
    const [created] = await db('notification_preferences')
      .insert({
        user_id: userId,
        unsubscribe_token: crypto.randomBytes(32).toString('hex'),
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    return created;
  }
  
  private mapToPreferences(row: any): UserPreferences {
    return {
      userId: row.user_id,
      emailEnabled: row.email_enabled,
      smsEnabled: row.sms_enabled,
      pushEnabled: row.push_enabled,
      
      emailPayment: row.email_payment,
      emailMarketing: row.email_marketing,
      emailEventUpdates: row.email_event_updates,
      emailAccount: row.email_account,
      
      smsCriticalOnly: row.sms_critical_only,
      smsPayment: row.sms_payment,
      smsEventReminders: row.sms_event_reminders,
      
      pushPayment: row.push_payment,
      pushEventUpdates: row.push_event_updates,
      pushMarketing: row.push_marketing,
      
      quietHoursEnabled: row.quiet_hours_enabled,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      timezone: row.timezone,
      
      maxEmailsPerDay: row.max_emails_per_day,
      maxSmsPerDay: row.max_sms_per_day,
      
      unsubscribeToken: row.unsubscribe_token,
      unsubscribedAt: row.unsubscribed_at
    };
  }
  
  private mapToDatabase(prefs: Partial<UserPreferences>): any {
    const mapped: any = {};
    
    if (prefs.emailEnabled !== undefined) mapped.email_enabled = prefs.emailEnabled;
    if (prefs.smsEnabled !== undefined) mapped.sms_enabled = prefs.smsEnabled;
    if (prefs.pushEnabled !== undefined) mapped.push_enabled = prefs.pushEnabled;
    
    if (prefs.emailPayment !== undefined) mapped.email_payment = prefs.emailPayment;
    if (prefs.emailMarketing !== undefined) mapped.email_marketing = prefs.emailMarketing;
    if (prefs.emailEventUpdates !== undefined) mapped.email_event_updates = prefs.emailEventUpdates;
    if (prefs.emailAccount !== undefined) mapped.email_account = prefs.emailAccount;
    
    if (prefs.smsCriticalOnly !== undefined) mapped.sms_critical_only = prefs.smsCriticalOnly;
    if (prefs.smsPayment !== undefined) mapped.sms_payment = prefs.smsPayment;
    if (prefs.smsEventReminders !== undefined) mapped.sms_event_reminders = prefs.smsEventReminders;
    
    if (prefs.pushPayment !== undefined) mapped.push_payment = prefs.pushPayment;
    if (prefs.pushEventUpdates !== undefined) mapped.push_event_updates = prefs.pushEventUpdates;
    if (prefs.pushMarketing !== undefined) mapped.push_marketing = prefs.pushMarketing;
    
    if (prefs.quietHoursEnabled !== undefined) mapped.quiet_hours_enabled = prefs.quietHoursEnabled;
    if (prefs.quietHoursStart !== undefined) mapped.quiet_hours_start = prefs.quietHoursStart;
    if (prefs.quietHoursEnd !== undefined) mapped.quiet_hours_end = prefs.quietHoursEnd;
    if (prefs.timezone !== undefined) mapped.timezone = prefs.timezone;
    
    if (prefs.maxEmailsPerDay !== undefined) mapped.max_emails_per_day = prefs.maxEmailsPerDay;
    if (prefs.maxSmsPerDay !== undefined) mapped.max_sms_per_day = prefs.maxSmsPerDay;
    
    return mapped;
  }
  
  private async recordHistory(
    userId: string,
    before: UserPreferences,
    after: Partial<UserPreferences>,
    changedBy?: string,
    reason?: string
  ): Promise<void> {
    const changes: any = {};
    
    for (const [key, value] of Object.entries(after)) {
      if ((before as any)[key] !== value) {
        changes[key] = {
          from: (before as any)[key],
          to: value
        };
      }
    }
    
    if (Object.keys(changes).length > 0) {
      await db('notification_preference_history').insert({
        user_id: userId,
        changed_by: changedBy,
        changes: JSON.stringify(changes),
        reason,
        created_at: new Date()
      });
    }
  }
  
  private isQuietHours(prefs: UserPreferences): boolean {
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) {
      return false;
    }
    
    // Convert to user's timezone and check
    // For now, simple implementation
    const now = new Date();
    const currentHour = now.getHours();
    const startHour = parseInt(prefs.quietHoursStart.split(':')[0]);
    const endHour = parseInt(prefs.quietHoursEnd.split(':')[0]);
    
    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Overnight quiet hours
      return currentHour >= startHour || currentHour < endHour;
    }
  }
  
  private isCritical(type: string): boolean {
    return ['payment_failed', 'account_security', 'urgent'].includes(type);
  }
  
  private async getTodayCount(userId: string, channel: string): Promise<number> {
    const result = await db('notification_history')
      .where('user_id', userId)
      .where('channel', channel)
      .where('created_at', '>=', new Date(new Date().setHours(0, 0, 0, 0)))
      .count('id as count')
      .first();
    
    return Number(result?.count) || 0;
  }
}

export const preferenceManager = new PreferenceManager();
```

### FILE: src/services/analytics.service.ts
```typescript
import { db } from '../config/database';
import { redisHelper } from '../config/redis';

interface DeliveryMetrics {
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  bounceRate: number;
  failureRate: number;
}

interface EngagementMetrics {
  opened: number;
  clicked: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
}

interface CostMetrics {
  totalCost: number;
  emailCost: number;
  smsCost: number;
  costPerRecipient: number;
  costByVenue: Record<string, number>;
}

export class NotificationAnalyticsService {
  async getDeliveryMetrics(
    venueId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DeliveryMetrics> {
    let query = db('notification_tracking');

    if (venueId) {
      query = query.where('venue_id', venueId);
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const statusCounts = await query
      .select('status')
      .count('* as count')
      .groupBy('status');

    const metrics: DeliveryMetrics = {
      sent: 0,
      delivered: 0,
      bounced: 0,
      failed: 0,
      pending: 0,
      deliveryRate: 0,
      bounceRate: 0,
      failureRate: 0,
    };

    let total = 0;
    for (const row of statusCounts) {
      const count = parseInt(row.count as string);
      total += count;

      switch (row.status) {
        case 'sent':
          metrics.sent = count;
          break;
        case 'delivered':
          metrics.delivered = count;
          break;
        case 'bounced':
          metrics.bounced = count;
          break;
        case 'failed':
          metrics.failed = count;
          break;
        case 'pending':
        case 'queued':
          metrics.pending += count;
          break;
      }
    }

    if (total > 0) {
      metrics.deliveryRate = (metrics.delivered / total) * 100;
      metrics.bounceRate = (metrics.bounced / total) * 100;
      metrics.failureRate = (metrics.failed / total) * 100;
    }

    // Cache metrics for dashboard
    await redisHelper.setWithTTL(
      `metrics:delivery:${venueId || 'all'}`,
      metrics,
      300 // 5 minutes
    );

    return metrics;
  }

  async getEngagementMetrics(
    venueId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<EngagementMetrics> {
    let query = db('notification_tracking');

    if (venueId) {
      query = query.where('venue_id', venueId);
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const total = await query.clone().count('* as count').first();
    const opened = await query.clone().whereNotNull('opened_at').count('* as count').first();
    const clicked = await query.clone().whereNotNull('clicked_at').count('* as count').first();

    const totalCount = parseInt(total?.count as string || '0');
    const openedCount = parseInt(opened?.count as string || '0');
    const clickedCount = parseInt(clicked?.count as string || '0');

    const metrics: EngagementMetrics = {
      opened: openedCount,
      clicked: clickedCount,
      unsubscribed: 0, // Would need to track this separately
      openRate: totalCount > 0 ? (openedCount / totalCount) * 100 : 0,
      clickRate: totalCount > 0 ? (clickedCount / totalCount) * 100 : 0,
      clickToOpenRate: openedCount > 0 ? (clickedCount / openedCount) * 100 : 0,
    };

    return metrics;
  }

  async getCostMetrics(
    venueId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<CostMetrics> {
    let query = db('notification_costs');

    if (venueId) {
      query = query.where('venue_id', venueId);
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const costs = await query.select('channel', 'venue_id').sum('cost as total').groupBy('channel', 'venue_id');

    const metrics: CostMetrics = {
      totalCost: 0,
      emailCost: 0,
      smsCost: 0,
      costPerRecipient: 0,
      costByVenue: {},
    };

    for (const row of costs) {
      const cost = parseFloat(row.total as string || '0');
      metrics.totalCost += cost;

      if (row.channel === 'email') {
        metrics.emailCost += cost;
      } else if (row.channel === 'sms') {
        metrics.smsCost += cost;
      }

      if (row.venue_id) {
        metrics.costByVenue[row.venue_id] =
          (metrics.costByVenue[row.venue_id] || 0) + cost;
      }
    }

    // Calculate cost per recipient
    const recipientCount = await db('notification_tracking')
      .modify((qb) => {
        if (venueId) qb.where('venue_id', venueId);
        if (startDate) qb.where('created_at', '>=', startDate);
        if (endDate) qb.where('created_at', '<=', endDate);
      })
      .countDistinct('recipient_id as count')
      .first();

    const recipients = parseInt(recipientCount?.count as string || '1');
    metrics.costPerRecipient = metrics.totalCost / recipients;

    return metrics;
  }

  async getVenueHealthScore(venueId: string): Promise<number> {
    // Calculate a health score based on various metrics
    const delivery = await this.getDeliveryMetrics(venueId);
    const engagement = await this.getEngagementMetrics(venueId);

    let score = 100;

    // Deduct points for poor metrics
    if (delivery.bounceRate > 5) score -= 10;
    if (delivery.bounceRate > 10) score -= 20;
    if (delivery.failureRate > 5) score -= 10;
    if (engagement.openRate < 20) score -= 10;
    if (engagement.clickRate < 2) score -= 10;

    // Bonus points for good metrics
    if (delivery.deliveryRate > 95) score += 5;
    if (engagement.openRate > 30) score += 5;
    if (engagement.clickRate > 5) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  async getTimeSeriesMetrics(
    venueId: string,
    metric: 'sent' | 'delivered' | 'opened' | 'clicked',
    period: 'hour' | 'day' | 'week' | 'month',
    startDate: Date,
    endDate: Date
  ) {
    // SECURITY FIX: Use whitelist approach for date truncation
    const periodFunctions: Record<string, string> = {
      hour: "date_trunc('hour', created_at)",
      day: "date_trunc('day', created_at)",
      week: "date_trunc('week', created_at)",
      month: "date_trunc('month', created_at)",
    };

    // Validate period parameter is in whitelist
    if (!periodFunctions[period]) {
      throw new Error(`Invalid period: ${period}. Must be one of: hour, day, week, month`);
    }

    // Validate metric parameter is in allowed list
    const allowedMetrics = ['sent', 'delivered', 'opened', 'clicked'];
    if (!allowedMetrics.includes(metric)) {
      throw new Error(`Invalid metric: ${metric}. Must be one of: ${allowedMetrics.join(', ')}`);
    }

    const truncateFunc = periodFunctions[period];

    let query = db('notification_tracking')
      .select(db.raw(`${truncateFunc} as period`))
      .where('venue_id', venueId)
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .groupBy('period')
      .orderBy('period');

    switch (metric) {
      case 'sent':
        query = query.count('* as value').where('status', 'sent');
        break;
      case 'delivered':
        query = query.count('* as value').where('status', 'delivered');
        break;
      case 'opened':
        query = query.count('* as value').whereNotNull('opened_at');
        break;
      case 'clicked':
        query = query.count('* as value').whereNotNull('clicked_at');
        break;
    }

    const results = await query;

    return results.map(row => ({
      period: row.period,
      value: parseInt(row.value as string),
    }));
  }

  async getTopPerformingTemplates(
    venueId?: string,
    limit: number = 10
  ) {
    let query = db('notification_tracking')
      .select('template')
      .count('* as total')
      .sum(db.raw('CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END as opens'))
      .sum(db.raw('CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END as clicks'))
      .groupBy('template')
      .orderBy('opens', 'desc')
      .limit(limit);

    if (venueId) {
      query = query.where('venue_id', venueId);
    }

    const results = await query;

    return results.map(row => ({
      template: row.template,
      total: parseInt(row.total as string),
      opens: parseInt(row.opens as string || '0'),
      clicks: parseInt(row.clicks as string || '0'),
      openRate: parseInt(row.total as string) > 0
        ? (parseInt(row.opens as string || '0') / parseInt(row.total as string)) * 100
        : 0,
      clickRate: parseInt(row.total as string) > 0
        ? (parseInt(row.clicks as string || '0') / parseInt(row.total as string)) * 100
        : 0,
    }));
  }

  async generateComplianceReport(
    venueId: string,
    startDate: Date,
    endDate: Date
  ) {
    // Consent metrics
    const consentGranted = await db('consent_records')
      .where('venue_id', venueId)
      .where('status', 'granted')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .count('* as count')
      .first();

    const consentRevoked = await db('consent_records')
      .where('venue_id', venueId)
      .where('status', 'revoked')
      .where('updated_at', '>=', startDate)
      .where('updated_at', '<=', endDate)
      .count('* as count')
      .first();

    // Suppression metrics
    const suppressions = await db('suppression_list')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .count('* as count')
      .first();

    // Bounce metrics
    const bounces = await db('bounces')
      .where('bounced_at', '>=', startDate)
      .where('bounced_at', '<=', endDate)
      .select('bounce_type')
      .count('* as count')
      .groupBy('bounce_type');

    // Failed consent checks
    const failedConsent = await db('notification_tracking')
      .where('venue_id', venueId)
      .where('status', 'failed')
      .where('failure_reason', 'like', '%consent%')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .count('* as count')
      .first();

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      consent: {
        granted: parseInt(consentGranted?.count as string || '0'),
        revoked: parseInt(consentRevoked?.count as string || '0'),
      },
      suppressions: parseInt(suppressions?.count as string || '0'),
      bounces: bounces.reduce((acc, row) => {
        acc[row.bounce_type as string] = parseInt(row.count as string);
        return acc;
      }, {} as Record<string, number>),
      blockedByConsent: parseInt(failedConsent?.count as string || '0'),
    };
  }
}

export const notificationAnalytics = new NotificationAnalyticsService();
```

### FILE: src/services/preference.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

interface CustomerPreferences {
  customerId: string;
  email: {
    enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly' | 'monthly';
    categories: string[];
  };
  sms: {
    enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly' | 'monthly';
    categories: string[];
  };
  timezone: string;
  language: string;
  quietHours: {
    enabled: boolean;
    start: number;
    end: number;
  };
}

export class PreferenceService {
  async getPreferences(customerId: string): Promise<CustomerPreferences> {
    const prefs = await db('customer_preferences')
      .where('customer_id', customerId)
      .first();

    if (!prefs) {
      // Return defaults
      return this.getDefaultPreferences(customerId);
    }

    return {
      customerId: prefs.customer_id,
      email: JSON.parse(prefs.email_preferences),
      sms: JSON.parse(prefs.sms_preferences),
      timezone: prefs.timezone,
      language: prefs.language,
      quietHours: JSON.parse(prefs.quiet_hours),
    };
  }

  async updatePreferences(
    customerId: string,
    updates: Partial<CustomerPreferences>
  ): Promise<void> {
    const existing = await db('customer_preferences')
      .where('customer_id', customerId)
      .first();

    if (existing) {
      await db('customer_preferences')
        .where('customer_id', customerId)
        .update({
          email_preferences: updates.email ? JSON.stringify(updates.email) : existing.email_preferences,
          sms_preferences: updates.sms ? JSON.stringify(updates.sms) : existing.sms_preferences,
          timezone: updates.timezone || existing.timezone,
          language: updates.language || existing.language,
          quiet_hours: updates.quietHours ? JSON.stringify(updates.quietHours) : existing.quiet_hours,
          updated_at: new Date(),
        });
    } else {
      const defaults = this.getDefaultPreferences(customerId);
      const merged = { ...defaults, ...updates };

      await db('customer_preferences').insert({
        id: uuidv4(),
        customer_id: customerId,
        email_preferences: JSON.stringify(merged.email),
        sms_preferences: JSON.stringify(merged.sms),
        timezone: merged.timezone,
        language: merged.language,
        quiet_hours: JSON.stringify(merged.quietHours),
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    logger.info('Customer preferences updated', { customerId });
  }

  async getUnsubscribeToken(customerId: string): Promise<string> {
    const token = Buffer.from(
      JSON.stringify({
        customerId,
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
      })
    ).toString('base64url');

    return token;
  }

  async processUnsubscribe(token: string, channel?: 'email' | 'sms'): Promise<void> {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      
      if (decoded.expires < Date.now()) {
        throw new Error('Unsubscribe link expired');
      }

      const preferences = await this.getPreferences(decoded.customerId);
      
      if (channel) {
        preferences[channel].enabled = false;
      } else {
        // Unsubscribe from all
        preferences.email.enabled = false;
        preferences.sms.enabled = false;
      }

      await this.updatePreferences(decoded.customerId, preferences);

      // Add to suppression list
      await db('suppression_list').insert({
        id: uuidv4(),
        identifier: decoded.customerId,
        identifier_hash: decoded.customerId, // Should be hashed in production
        channel: channel || 'all',
        reason: 'customer_unsubscribe',
        suppressed_at: new Date(),
        created_at: new Date(),
      });

      logger.info('Customer unsubscribed', { 
        customerId: decoded.customerId, 
        channel 
      });
    } catch (error) {
      logger.error('Failed to process unsubscribe', { token, error });
      throw error;
    }
  }

  private getDefaultPreferences(customerId: string): CustomerPreferences {
    return {
      customerId,
      email: {
        enabled: true,
        frequency: 'immediate',
        categories: ['transactional', 'marketing'],
      },
      sms: {
        enabled: true,
        frequency: 'immediate',
        categories: ['transactional'],
      },
      timezone: 'America/Chicago',
      language: 'en',
      quietHours: {
        enabled: false,
        start: 22,
        end: 8,
      },
    };
  }

  async exportCustomerData(customerId: string): Promise<any> {
    // GDPR compliance - export all customer notification data
    const [
      preferences,
      consents,
      notifications,
      engagements,
    ] = await Promise.all([
      this.getPreferences(customerId),
      db('consent_records').where('customer_id', customerId),
      db('notification_tracking').where('recipient_id', customerId).limit(100),
      db('engagement_events')
        .join('notification_tracking', 'engagement_events.notification_id', 'notification_tracking.id')
        .where('notification_tracking.recipient_id', customerId)
        .select('engagement_events.*'),
    ]);

    return {
      exportDate: new Date(),
      customerId,
      preferences,
      consents,
      notificationHistory: notifications,
      engagementHistory: engagements,
    };
  }
}

export const preferenceService = new PreferenceService();
```

### FILE: src/services/wallet-pass.service.ts
```typescript
import { logger } from '../config/logger';
import crypto from 'crypto';
import QRCode from 'qrcode';

interface WalletPassData {
  eventName: string;
  venueName: string;
  venueAddress: string;
  eventDate: Date;
  ticketId: string;
  seatInfo?: string;
  customerName: string;
  qrCodeData: string;
}

export class WalletPassService {
  async generateApplePass(data: WalletPassData): Promise<Buffer> {
    try {
      // Apple Wallet pass structure
      const pass = {
        formatVersion: 1,
        passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID || 'pass.com.tickettoken',
        serialNumber: data.ticketId,
        teamIdentifier: process.env.APPLE_TEAM_ID || 'ABCDE12345',
        organizationName: 'TicketToken',
        description: `Ticket for ${data.eventName}`,
        foregroundColor: 'rgb(255, 255, 255)',
        backgroundColor: 'rgb(60, 65, 76)',
        labelColor: 'rgb(255, 255, 255)',
        
        eventTicket: {
          primaryFields: [
            {
              key: 'event',
              label: 'EVENT',
              value: data.eventName,
            },
          ],
          secondaryFields: [
            {
              key: 'loc',
              label: 'VENUE',
              value: data.venueName,
            },
            {
              key: 'date',
              label: 'DATE',
              value: this.formatDate(data.eventDate),
              dateStyle: 'PKDateStyleMedium',
              timeStyle: 'PKDateStyleShort',
            },
          ],
          auxiliaryFields: data.seatInfo ? [
            {
              key: 'seat',
              label: 'SEAT',
              value: data.seatInfo,
            },
            {
              key: 'name',
              label: 'ATTENDEE',
              value: data.customerName,
            },
          ] : [
            {
              key: 'name',
              label: 'ATTENDEE',
              value: data.customerName,
            },
          ],
          backFields: [
            {
              key: 'terms',
              label: 'TERMS & CONDITIONS',
              value: 'This ticket is non-transferable. Valid ID required.',
            },
            {
              key: 'venue-address',
              label: 'VENUE ADDRESS',
              value: data.venueAddress,
            },
          ],
        },
        
        barcode: {
          format: 'PKBarcodeFormatQR',
          message: data.qrCodeData,
          messageEncoding: 'iso-8859-1',
        },
        
        relevantDate: data.eventDate.toISOString(),
      };

      // In production, this would:
      // 1. Create pass.json
      // 2. Generate manifest.json with file hashes
      // 3. Sign the manifest
      // 4. Create .pkpass file (zip archive)
      
      // For now, return mock buffer
      return Buffer.from(JSON.stringify(pass));
    } catch (error) {
      logger.error('Failed to generate Apple Pass', error);
      throw error;
    }
  }

  async generateGooglePass(data: WalletPassData): Promise<string> {
    try {
      // Google Wallet pass structure
      const jwt = {
        iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        payload: {
          eventTicketObjects: [
            {
              id: `${process.env.GOOGLE_ISSUER_ID}.${data.ticketId}`,
              classId: `${process.env.GOOGLE_ISSUER_ID}.event_ticket_class`,
              state: 'ACTIVE',
              ticketHolderName: data.customerName,
              ticketNumber: data.ticketId,
              barcode: {
                type: 'QR_CODE',
                value: data.qrCodeData,
              },
              eventName: {
                defaultValue: {
                  language: 'en-US',
                  value: data.eventName,
                },
              },
              venue: {
                name: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.venueName,
                  },
                },
                address: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.venueAddress,
                  },
                },
              },
              dateTime: {
                start: data.eventDate.toISOString(),
              },
              seatInfo: data.seatInfo ? {
                seat: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.seatInfo,
                  },
                },
              } : undefined,
            },
          ],
        },
      };

      // In production, sign JWT with Google service account
      // For now, return the save URL
      const token = Buffer.from(JSON.stringify(jwt)).toString('base64url');
      return `https://pay.google.com/gp/v/save/${token}`;
    } catch (error) {
      logger.error('Failed to generate Google Pass', error);
      throw error;
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async generatePassQRCode(ticketId: string): Promise<string> {
    const data = {
      ticketId,
      validationUrl: `${process.env.API_URL}/validate/${ticketId}`,
      timestamp: Date.now(),
    };

    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'secret')
      .update(JSON.stringify(data))
      .digest('hex');

    const qrData = {
      ...data,
      signature,
    };

    return await QRCode.toDataURL(JSON.stringify(qrData));
  }
}

export const walletPassService = new WalletPassService();
```

### FILE: src/services/rate-limiter.ts
```typescript
import Redis from 'ioredis';
import { logger } from '../config/logger';

interface RateLimitConfig {
  max: number;           // Maximum requests
  duration: number;      // Time window in seconds
  keyPrefix?: string;    // Redis key prefix
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // Seconds until retry
}

export class RateLimiter {
  private redis: Redis;
  private configs: Map<string, RateLimitConfig>;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });
    
    this.configs = new Map();
    this.initializeConfigs();
  }
  
  private initializeConfigs() {
    // Per-user rate limits
    this.configs.set('email:user', {
      max: parseInt(process.env.RATE_LIMIT_EMAIL_PER_HOUR || '20'),
      duration: 3600, // 1 hour
      keyPrefix: 'rl:email:user:'
    });
    
    this.configs.set('sms:user', {
      max: parseInt(process.env.RATE_LIMIT_SMS_PER_HOUR || '5'),
      duration: 3600, // 1 hour
      keyPrefix: 'rl:sms:user:'
    });
    
    this.configs.set('push:user', {
      max: parseInt(process.env.RATE_LIMIT_PUSH_PER_HOUR || '50'),
      duration: 3600, // 1 hour
      keyPrefix: 'rl:push:user:'
    });
    
    // Global rate limits
    this.configs.set('email:global', {
      max: parseInt(process.env.RATE_LIMIT_GLOBAL_EMAIL_PER_MIN || '1000'),
      duration: 60, // 1 minute
      keyPrefix: 'rl:email:global'
    });
    
    this.configs.set('sms:global', {
      max: parseInt(process.env.RATE_LIMIT_GLOBAL_SMS_PER_MIN || '100'),
      duration: 60, // 1 minute
      keyPrefix: 'rl:sms:global'
    });
    
    // API endpoint rate limits
    this.configs.set('api:send', {
      max: 100,
      duration: 60, // 100 requests per minute
      keyPrefix: 'rl:api:send:'
    });
    
    this.configs.set('api:preferences', {
      max: 50,
      duration: 60, // 50 requests per minute
      keyPrefix: 'rl:api:pref:'
    });
  }
  
  async checkLimit(
    type: string,
    identifier: string = 'global'
  ): Promise<RateLimitResult> {
    const config = this.configs.get(type);
    
    if (!config) {
      // No rate limit configured, allow
      return {
        allowed: true,
        remaining: Infinity,
        resetAt: new Date(Date.now() + 3600000)
      };
    }
    
    const key = `${config.keyPrefix}${identifier}`;
    const now = Date.now();
    const windowStart = now - (config.duration * 1000);
    
    try {
      // Use Redis sorted set for sliding window
      const pipe = this.redis.pipeline();
      
      // Remove old entries outside the window
      pipe.zremrangebyscore(key, '-inf', windowStart);
      
      // Count current entries in window
      pipe.zcard(key);
      
      // Add current request
      pipe.zadd(key, now, `${now}-${Math.random()}`);
      
      // Set expiry
      pipe.expire(key, config.duration);
      
      const results = await pipe.exec();
      
      if (!results) {
        throw new Error('Redis pipeline failed');
      }
      
      const count = (results[1]?.[1] as number) || 0;
      const allowed = count < config.max;
      
      if (!allowed) {
        // Get oldest entry to calculate retry time
        const oldestEntry = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestTime = oldestEntry?.[1] ? parseInt(oldestEntry[1]) : now;
        const retryAfter = Math.ceil((oldestTime + config.duration * 1000 - now) / 1000);
        
        logger.warn('Rate limit exceeded', {
          type,
          identifier,
          count,
          max: config.max,
          retryAfter
        });
        
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(oldestTime + config.duration * 1000),
          retryAfter
        };
      }
      
      return {
        allowed: true,
        remaining: config.max - count - 1,
        resetAt: new Date(now + config.duration * 1000)
      };
      
    } catch (error) {
      logger.error('Rate limit check failed', { error, type, identifier });
      
      // On error, be permissive but log
      return {
        allowed: true,
        remaining: 0,
        resetAt: new Date(now + 60000)
      };
    }
  }
  
  async checkMultiple(
    checks: Array<{ type: string; identifier?: string }>
  ): Promise<boolean> {
    const results = await Promise.all(
      checks.map(check => this.checkLimit(check.type, check.identifier))
    );
    
    return results.every(result => result.allowed);
  }
  
  async reset(type: string, identifier: string = 'global'): Promise<void> {
    const config = this.configs.get(type);
    if (!config) return;
    
    const key = `${config.keyPrefix}${identifier}`;
    await this.redis.del(key);
    
    logger.info('Rate limit reset', { type, identifier });
  }
  
  async getStatus(type: string, identifier: string = 'global'): Promise<any> {
    const config = this.configs.get(type);
    if (!config) {
      return { configured: false };
    }
    
    const key = `${config.keyPrefix}${identifier}`;
    const now = Date.now();
    const windowStart = now - (config.duration * 1000);
    
    // Clean old entries and get count
    await this.redis.zremrangebyscore(key, '-inf', windowStart);
    const count = await this.redis.zcard(key);
    
    return {
      configured: true,
      current: count,
      max: config.max,
      remaining: Math.max(0, config.max - count),
      duration: config.duration,
      resetAt: new Date(now + config.duration * 1000)
    };
  }
  
  // Middleware for Express routes
  middleware(type: string = 'api:send') {
    return async (req: any, res: any, next: any) => {
      const identifier = req.ip || req.connection.remoteAddress || 'unknown';
      const result = await this.checkLimit(type, identifier);
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': this.configs.get(type)?.max || 0,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': result.resetAt.toISOString()
      });
      
      if (!result.allowed) {
        res.set('Retry-After', result.retryAfter);
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: result.retryAfter,
          resetAt: result.resetAt
        });
      }
      
      next();
    };
  }
  
  // Check if notification should be sent based on rate limits
  async canSendNotification(
    userId: string,
    channel: 'email' | 'sms' | 'push'
  ): Promise<boolean> {
    // Check both user and global limits
    const checks = [
      { type: `${channel}:user`, identifier: userId },
      { type: `${channel}:global` }
    ];
    
    return this.checkMultiple(checks);
  }
  
  // Record notification sent (for accurate counting)
  async recordNotificationSent(
    userId: string,
    channel: 'email' | 'sms' | 'push'
  ): Promise<void> {
    const now = Date.now();
    
    // Update user limit
    const userConfig = this.configs.get(`${channel}:user`);
    if (userConfig) {
      const userKey = `${userConfig.keyPrefix}${userId}`;
      await this.redis.zadd(userKey, now, `${now}-sent`);
      await this.redis.expire(userKey, userConfig.duration);
    }
    
    // Update global limit
    const globalConfig = this.configs.get(`${channel}:global`);
    if (globalConfig) {
      const globalKey = globalConfig.keyPrefix!;
      await this.redis.zadd(globalKey, now, `${now}-${userId}`);
      await this.redis.expire(globalKey, globalConfig.duration);
    }
  }
}

export const rateLimiter = new RateLimiter();
```

### FILE: src/services/rich-media.service.ts
```typescript
import { logger } from '../config/logger';

interface RichMediaOptions {
  images?: Array<{
    url: string;
    alt?: string;
    width?: number;
    height?: number;
  }>;
  videos?: Array<{
    url: string;
    thumbnail?: string;
    duration?: number;
  }>;
  buttons?: Array<{
    text: string;
    url: string;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
  cards?: Array<{
    title: string;
    description: string;
    image?: string;
    link?: string;
  }>;
}

export class RichMediaService {
  async processImages(images: RichMediaOptions['images']): Promise<any[]> {
    if (!images) return [];

    const processed: any[] = [];
    for (const image of images) {
      try {
        // In production, this would:
        // 1. Download image if needed
        // 2. Optimize for email (resize, compress)
        // 3. Upload to CDN
        // 4. Return optimized URL
        
        processed.push({
          ...image,
          optimizedUrl: image.url, // Would be CDN URL
          width: image.width || 600,
          height: image.height || 400,
        });
      } catch (error) {
        logger.error('Failed to process image', { url: image.url, error });
      }
    }

    return processed;
  }

  generateEmailHTML(options: RichMediaOptions): string {
    let html = '';

    // Add images
    if (options.images && options.images.length > 0) {
      html += '<div style="margin: 20px 0;">';
      for (const image of options.images) {
        html += `
          <img src="${image.url}" 
               alt="${image.alt || ''}" 
               style="max-width: 100%; height: auto; display: block; margin: 10px auto;"
               width="${image.width || 600}">
        `;
      }
      html += '</div>';
    }

    // Add buttons
    if (options.buttons && options.buttons.length > 0) {
      html += '<div style="margin: 20px 0; text-align: center;">';
      for (const button of options.buttons) {
        const bgColor = {
          primary: '#007bff',
          secondary: '#6c757d',
          danger: '#dc3545',
        }[button.style || 'primary'];

        html += `
          <a href="${button.url}" 
             style="display: inline-block; padding: 12px 24px; margin: 5px;
                    background-color: ${bgColor}; color: white; 
                    text-decoration: none; border-radius: 4px;">
            ${button.text}
          </a>
        `;
      }
      html += '</div>';
    }

    // Add cards
    if (options.cards && options.cards.length > 0) {
      html += '<div style="margin: 20px 0;">';
      for (const card of options.cards) {
        html += `
          <div style="border: 1px solid #ddd; border-radius: 8px; 
                      padding: 15px; margin: 10px 0;">
            ${card.image ? `<img src="${card.image}" style="max-width: 100%; margin-bottom: 10px;">` : ''}
            <h3 style="margin: 10px 0;">${card.title}</h3>
            <p style="margin: 10px 0;">${card.description}</p>
            ${card.link ? `<a href="${card.link}" style="color: #007bff;">Learn more →</a>` : ''}
          </div>
        `;
      }
      html += '</div>';
    }

    return html;
  }

  generateAMPEmail(options: RichMediaOptions): string {
    // Generate AMP-compatible email content
    let amp = `
      <!doctype html>
      <html ⚡4email>
      <head>
        <meta charset="utf-8">
        <script async src="https://cdn.ampproject.org/v0.js"></script>
        <style amp4email-boilerplate>body{visibility:hidden}</style>
      </head>
      <body>
    `;

    // Add AMP carousel for images
    if (options.images && options.images.length > 1) {
      amp += `
        <amp-carousel width="600" height="400" layout="responsive" type="slides">
          ${options.images.map(img => `
            <amp-img src="${img.url}" 
                     width="${img.width || 600}" 
                     height="${img.height || 400}" 
                     layout="responsive"
                     alt="${img.alt || ''}">
            </amp-img>
          `).join('')}
        </amp-carousel>
      `;
    }

    amp += '</body></html>';
    return amp;
  }
}

export const richMediaService = new RichMediaService();
```

### FILE: src/services/provider-manager.service.ts
```typescript
import { logger } from '../config/logger';

interface ProviderHealth {
  provider: string;
  healthy: boolean;
  lastCheck: Date;
  failureCount: number;
  successCount: number;
}

export class ProviderManager {
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly MAX_FAILURES = 3;
  
  constructor() {
    this.initializeProviders();
    this.startHealthChecks();
  }

  private initializeProviders() {
    // Initialize provider health tracking
    this.providerHealth.set('sendgrid', {
      provider: 'sendgrid',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('aws-ses', {
      provider: 'aws-ses',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('twilio', {
      provider: 'twilio',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('aws-sns', {
      provider: 'aws-sns',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });
  }

  private startHealthChecks() {
    setInterval(() => {
      this.checkProviderHealth();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private async checkProviderHealth() {
    for (const [name, health] of this.providerHealth) {
      try {
        // Implement actual health check based on provider
        // For now, using the existing connection status
        health.lastCheck = new Date();
        
        // Mark unhealthy if too many failures
        if (health.failureCount >= this.MAX_FAILURES) {
          health.healthy = false;
          logger.warn(`Provider ${name} marked unhealthy`, {
            failureCount: health.failureCount
          });
        }
      } catch (error) {
        logger.error(`Health check failed for ${name}`, error);
      }
    }
  }

  async getHealthyEmailProvider(): Promise<string> {
    // Primary provider
    if (this.providerHealth.get('sendgrid')?.healthy) {
      return 'sendgrid';
    }
    
    // Fallback provider
    if (this.providerHealth.get('aws-ses')?.healthy) {
      logger.info('Failing over to AWS SES from SendGrid');
      return 'aws-ses';
    }
    
    throw new Error('No healthy email providers available');
  }

  async getHealthySmsProvider(): Promise<string> {
    // Primary provider
    if (this.providerHealth.get('twilio')?.healthy) {
      return 'twilio';
    }
    
    // Fallback provider
    if (this.providerHealth.get('aws-sns')?.healthy) {
      logger.info('Failing over to AWS SNS from Twilio');
      return 'aws-sns';
    }
    
    throw new Error('No healthy SMS providers available');
  }

  recordSuccess(provider: string) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.successCount++;
      health.failureCount = 0; // Reset failure count on success
      health.healthy = true;
    }
  }

  recordFailure(provider: string, error: Error) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.failureCount++;
      logger.error(`Provider ${provider} failure`, {
        failureCount: health.failureCount,
        error: error.message
      });
      
      if (health.failureCount >= this.MAX_FAILURES) {
        health.healthy = false;
      }
    }
  }

  getProviderStatus(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }
}

export const providerManager = new ProviderManager();
```

### FILE: src/services/retry.service.ts
```typescript
import { logger } from '../config/logger';
import { db } from '../config/database';

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  factor: number;
}

export class RetryService {
  private readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 5000,
    maxDelay: 300000, // 5 minutes
    factor: 2,
  };

  async shouldRetry(
    notificationId: string,
    error: Error
  ): Promise<{ retry: boolean; delay: number }> {
    // Get current attempt count
    const notification = await db('notification_tracking')
      .where('id', notificationId)
      .first();

    if (!notification) {
      return { retry: false, delay: 0 };
    }

    const attempts = notification.retry_attempts || 0;

    // Check if we should retry based on error type
    if (!this.isRetryableError(error)) {
      logger.info('Error is not retryable', { 
        notificationId, 
        error: error.message 
      });
      return { retry: false, delay: 0 };
    }

    // Check max attempts
    if (attempts >= this.defaultConfig.maxAttempts) {
      logger.warn('Max retry attempts reached', { 
        notificationId, 
        attempts 
      });
      return { retry: false, delay: 0 };
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      this.defaultConfig.baseDelay * Math.pow(this.defaultConfig.factor, attempts),
      this.defaultConfig.maxDelay
    );

    // Update retry count
    await db('notification_tracking')
      .where('id', notificationId)
      .update({
        retry_attempts: attempts + 1,
        next_retry_at: new Date(Date.now() + delay),
        updated_at: new Date(),
      });

    logger.info('Scheduling retry', { 
      notificationId, 
      attempt: attempts + 1, 
      delay 
    });

    return { retry: true, delay };
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Don't retry on permanent failures
    if (
      message.includes('invalid') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not found') ||
      message.includes('bad request')
    ) {
      return false;
    }

    // Retry on temporary failures
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('rate limit') ||
      message.includes('service unavailable') ||
      message.includes('gateway timeout')
    ) {
      return true;
    }

    // Default to retry for unknown errors
    return true;
  }

  async recordRetryMetrics(notificationId: string, success: boolean) {
    const key = success ? 'retry_success' : 'retry_failure';
    await db('notification_tracking')
      .where('id', notificationId)
      .increment(key, 1);
  }
}

export const retryService = new RetryService();
```

### FILE: src/services/engagement-tracking.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export class EngagementTrackingService {
  async trackOpen(trackingId: string, metadata?: any): Promise<void> {
    try {
      const notification = await db('notification_tracking')
        .where('id', trackingId)
        .first();

      if (!notification) {
        logger.warn('Notification not found for open tracking', { trackingId });
        return;
      }

      await db('notification_tracking')
        .where('id', trackingId)
        .update({
          opened_at: notification.opened_at || new Date(),
          open_count: db.raw('open_count + 1'),
          updated_at: new Date(),
        });

      // Track engagement event
      await this.recordEngagementEvent(trackingId, 'open', metadata);

      logger.info('Email open tracked', { trackingId });
    } catch (error) {
      logger.error('Failed to track open', { trackingId, error });
    }
  }

  async trackClick(
    trackingId: string,
    url: string,
    metadata?: any
  ): Promise<void> {
    try {
      const notification = await db('notification_tracking')
        .where('id', trackingId)
        .first();

      if (!notification) {
        logger.warn('Notification not found for click tracking', { trackingId });
        return;
      }

      // Update notification tracking
      await db('notification_tracking')
        .where('id', trackingId)
        .update({
          clicked_at: notification.clicked_at || new Date(),
          click_count: db.raw('click_count + 1'),
          click_data: JSON.stringify({
            ...(notification.click_data ? JSON.parse(notification.click_data) : {}),
            [url]: ((notification.click_data ? JSON.parse(notification.click_data)[url] : 0) || 0) + 1,
          }),
          updated_at: new Date(),
        });

      // Track engagement event
      await this.recordEngagementEvent(trackingId, 'click', {
        url,
        ...metadata,
      });

      logger.info('Link click tracked', { trackingId, url });
    } catch (error) {
      logger.error('Failed to track click', { trackingId, url, error });
    }
  }

  async trackConversion(
    trackingId: string,
    conversionType: string,
    value?: number,
    metadata?: any
  ): Promise<void> {
    try {
      await this.recordEngagementEvent(trackingId, 'conversion', {
        type: conversionType,
        value,
        ...metadata,
      });

      logger.info('Conversion tracked', { 
        trackingId, 
        conversionType, 
        value 
      });
    } catch (error) {
      logger.error('Failed to track conversion', { 
        trackingId, 
        conversionType, 
        error 
      });
    }
  }

  private async recordEngagementEvent(
    notificationId: string,
    eventType: string,
    metadata?: any
  ): Promise<void> {
    await db('engagement_events').insert({
      id: uuidv4(),
      notification_id: notificationId,
      event_type: eventType,
      metadata: JSON.stringify(metadata || {}),
      created_at: new Date(),
    });
  }

  generateTrackingPixel(notificationId: string): string {
    const token = this.generateTrackingToken(notificationId, 'open');
    return `<img src="${process.env.API_URL}/track/open/${token}" width="1" height="1" style="display:none;" />`;
  }

  wrapLinksForTracking(
    html: string,
    notificationId: string
  ): string {
    // Replace all links with tracking links
    return html.replace(
      /<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi,
      (_match, url, rest) => {
        const token = this.generateTrackingToken(notificationId, 'click', url);
        const trackingUrl = `${process.env.API_URL}/track/click/${token}`;
        return `<a href="${trackingUrl}"${rest}>`;
      }
    );
  }

  private generateTrackingToken(
    notificationId: string,
    action: string,
    url?: string
  ): string {
    const data = {
      id: notificationId,
      action,
      url,
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    };

    const token = Buffer.from(JSON.stringify(data)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'secret')
      .update(token)
      .digest('base64url');

    return `${token}.${signature}`;
  }

  async verifyTrackingToken(token: string): Promise<any> {
    try {
      const [data, signature] = token.split('.');
      
      const expectedSignature = crypto
        .createHmac('sha256', process.env.JWT_SECRET || 'secret')
        .update(data)
        .digest('base64url');

      if (signature !== expectedSignature) {
        throw new Error('Invalid token signature');
      }

      const decoded = JSON.parse(Buffer.from(data, 'base64url').toString());
      
      if (decoded.expires < Date.now()) {
        throw new Error('Token expired');
      }

      return decoded;
    } catch (error) {
      logger.error('Invalid tracking token', { token, error });
      throw error;
    }
  }

  async getEngagementScore(recipientId: string): Promise<number> {
    // Calculate engagement score based on recent activity
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await db('notification_tracking')
      .where('recipient_id', recipientId)
      .where('created_at', '>=', thirtyDaysAgo)
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened'),
        db.raw('SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked')
      )
      .first();

    const total = parseInt(stats?.total || '0');
    const opened = parseInt(stats?.opened || '0');
    const clicked = parseInt(stats?.clicked || '0');

    if (total === 0) return 50; // Default score for new recipients

    // Calculate score (0-100)
    const openRate = opened / total;
    const clickRate = clicked / total;

    let score = 50; // Base score
    score += openRate * 30; // Up to 30 points for opens
    score += clickRate * 20; // Up to 20 points for clicks

    return Math.round(Math.min(100, Math.max(0, score)));
  }
}

export const engagementTracking = new EngagementTrackingService();
```

### FILE: src/services/template-registry.ts
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import Handlebars from 'handlebars';
import { logger } from '../config/logger';

interface TemplateInfo {
  name: string;
  channel: 'email' | 'sms';
  subject?: string;
  variables: string[];
  description: string;
}

export class TemplateRegistry {
  private templates: Map<string, TemplateInfo> = new Map();
  
  constructor() {
    this.registerTemplates();
  }
  
  private registerTemplates() {
    // Email templates
    this.templates.set('payment-success', {
      name: 'payment-success',
      channel: 'email',
      subject: 'Payment Confirmed - {{eventName}}',
      variables: ['user', 'amount', 'currency', 'eventName', 'ticketCount', 'orderId'],
      description: 'Sent when payment is successfully processed'
    });
    
    this.templates.set('payment-failed', {
      name: 'payment-failed',
      channel: 'email',
      subject: 'Payment Failed - Action Required',
      variables: ['user', 'amount', 'eventName', 'reason', 'retryUrl'],
      description: 'Sent when payment fails'
    });
    
    this.templates.set('refund-processed', {
      name: 'refund-processed',
      channel: 'email',
      subject: 'Refund Processed',
      variables: ['user', 'amount', 'orderId', 'refundId'],
      description: 'Sent when refund is processed'
    });
    
    this.templates.set('ticket-purchased', {
      name: 'ticket-purchased',
      channel: 'email',
      subject: 'Your Tickets for {{event.name}}',
      variables: ['user', 'event', 'ticketCount', 'ticketType', 'orderId', 'nftMinted'],
      description: 'Sent after successful ticket purchase'
    });
    
    this.templates.set('event-reminder', {
      name: 'event-reminder',
      channel: 'email',
      subject: 'Reminder: {{event.name}} is coming up!',
      variables: ['user', 'event', 'hoursUntil', 'ticketCount'],
      description: 'Sent 24 hours before event'
    });
    
    this.templates.set('account-verification', {
      name: 'account-verification',
      channel: 'email',
      subject: 'Verify Your TicketToken Account',
      variables: ['user', 'verificationCode', 'verificationUrl'],
      description: 'Sent for email verification'
    });
    
    // SMS templates
    this.templates.set('sms-payment-success', {
      name: 'payment-success',
      channel: 'sms',
      variables: ['amount', 'eventName', 'orderIdShort', 'shortUrl'],
      description: 'SMS payment confirmation'
    });
    
    this.templates.set('sms-event-reminder', {
      name: 'event-reminder',
      channel: 'sms',
      variables: ['eventName', 'timeUntil', 'venue', 'shortUrl'],
      description: 'SMS event reminder'
    });
  }
  
  getTemplate(name: string): TemplateInfo | undefined {
    return this.templates.get(name);
  }
  
  getAllTemplates(): TemplateInfo[] {
    return Array.from(this.templates.values());
  }
  
  getTemplatesByChannel(channel: 'email' | 'sms'): TemplateInfo[] {
    return this.getAllTemplates().filter(t => t.channel === channel);
  }
  
  async validateTemplate(name: string, data: any): Promise<string[]> {
    const template = this.templates.get(name);
    if (!template) {
      return ['Template not found'];
    }
    
    const errors: string[] = [];
    const providedKeys = Object.keys(data);
    
    // Check for missing required variables
    for (const variable of template.variables) {
      if (!providedKeys.includes(variable)) {
        errors.push(`Missing required variable: ${variable}`);
      }
    }
    
    return errors;
  }
  
  async renderTemplate(
    templateName: string,
    data: any
  ): Promise<{ subject?: string; body: string }> {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }
    
    const templatePath = path.join(
      __dirname,
      '../templates',
      template.channel,
      `${template.name}.${template.channel === 'email' ? 'hbs' : 'txt'}`
    );
    
    try {
      const templateContent = await fs.readFile(templatePath, 'utf8');
      const compiled = Handlebars.compile(templateContent);
      const body = compiled(data);
      
      let subject: string | undefined;
      if (template.subject) {
        const subjectCompiled = Handlebars.compile(template.subject);
        subject = subjectCompiled(data);
      }
      
      return { subject, body };
    } catch (error) {
      logger.error(`Failed to render template ${templateName}:`, error);
      throw error;
    }
  }
}

export const templateRegistry = new TemplateRegistry();
```

### FILE: src/services/analytics.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import * as crypto from 'crypto';

interface NotificationMetrics {
  sent: number;
  delivered: number;
  failed: number;
  bounced: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
}

interface ChannelMetrics {
  email: NotificationMetrics;
  sms: NotificationMetrics;
  push: NotificationMetrics;
}

export class AnalyticsService {
  // Track notification sent
  async trackSent(data: {
    notificationId: string;
    userId: string;
    channel: string;
    type: string;
    provider: string;
  }): Promise<void> {
    try {
      await this.updateHourlyMetrics({
        channel: data.channel,
        type: data.type,
        provider: data.provider,
        metric: 'total_sent',
        increment: 1
      });

      logger.debug('Tracked notification sent', data);
    } catch (error) {
      logger.error('Failed to track sent notification', { error, data });
    }
  }

  // Track delivery status
  async trackDelivery(data: {
    notificationId: string;
    status: 'delivered' | 'failed' | 'bounced';
    deliveryTimeMs?: number;
  }): Promise<void> {
    try {
      const notification = await db('notification_history')
        .where('id', data.notificationId)
        .first();

      if (!notification) return;

      const metric = `total_${data.status}`;
      await this.updateHourlyMetrics({
        channel: notification.channel,
        type: notification.type,
        provider: notification.metadata?.provider,
        metric,
        increment: 1,
        deliveryTimeMs: data.deliveryTimeMs
      });

      logger.debug('Tracked delivery status', data);
    } catch (error) {
      logger.error('Failed to track delivery', { error, data });
    }
  }

  // Track engagement (open/click)
  async trackEngagement(data: {
    notificationId: string;
    userId: string;
    action: 'opened' | 'clicked' | 'unsubscribed';
    metadata?: any;
  }): Promise<void> {
    try {
      // Record engagement
      await db('notification_engagement')
        .insert({
          notification_id: data.notificationId,
          user_id: data.userId,
          channel: 'email', // Usually only email has open/click tracking
          action: data.action,
          action_timestamp: new Date(),
          metadata: JSON.stringify(data.metadata || {}),
          created_at: new Date()
        })
        .onConflict(['notification_id', 'user_id', 'action'])
        .ignore();

      // Update metrics
      if (data.action === 'opened') {
        await this.updateMetricForNotification(data.notificationId, 'total_opened');
      } else if (data.action === 'clicked') {
        await this.updateMetricForNotification(data.notificationId, 'total_clicked');
      }

      logger.debug('Tracked engagement', data);
    } catch (error) {
      logger.error('Failed to track engagement', { error, data });
    }
  }

  // Track link clicks
  async trackClick(data: {
    notificationId: string;
    userId: string;
    linkId: string;
    originalUrl: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await db('notification_clicks').insert({
        notification_id: data.notificationId,
        user_id: data.userId,
        link_id: data.linkId,
        original_url: data.originalUrl,
        clicked_at: new Date(),
        ip_address: data.ipAddress,
        user_agent: data.userAgent
      });

      await this.trackEngagement({
        notificationId: data.notificationId,
        userId: data.userId,
        action: 'clicked',
        metadata: { linkId: data.linkId }
      });

      logger.debug('Tracked link click', data);
    } catch (error) {
      logger.error('Failed to track click', { error, data });
    }
  }

  // Get metrics for date range
  async getMetrics(
    startDate: Date,
    endDate: Date,
    channel?: string
  ): Promise<any> {
    const query = db('notification_analytics')
      .whereBetween('date', [startDate, endDate])
      .select(
        db.raw('SUM(total_sent) as sent'),
        db.raw('SUM(total_delivered) as delivered'),
        db.raw('SUM(total_failed) as failed'),
        db.raw('SUM(total_bounced) as bounced'),
        db.raw('SUM(total_opened) as opened'),
        db.raw('SUM(total_clicked) as clicked'),
        db.raw('AVG(avg_delivery_time_ms) as avg_delivery_time'),
        db.raw('SUM(total_cost) / 100.0 as total_cost')
      );

    if (channel) {
      query.where('channel', channel);
    }

    const result = await query.first();

    // Calculate rates
    const sent = parseInt(result.sent) || 0;
    const delivered = parseInt(result.delivered) || 0;
    const opened = parseInt(result.opened) || 0;
    const clicked = parseInt(result.clicked) || 0;

    return {
      sent,
      delivered,
      failed: parseInt(result.failed) || 0,
      bounced: parseInt(result.bounced) || 0,
      opened,
      clicked,
      deliveryRate: sent > 0 ? (delivered / sent * 100).toFixed(2) : 0,
      openRate: delivered > 0 ? (opened / delivered * 100).toFixed(2) : 0,
      clickRate: opened > 0 ? (clicked / opened * 100).toFixed(2) : 0,
      avgDeliveryTime: result.avg_delivery_time || 0,
      totalCost: result.total_cost || 0
    };
  }

  // Get metrics by channel
  async getChannelMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<ChannelMetrics> {
    const channels = ['email', 'sms', 'push'];
    const metrics: any = {};

    for (const channel of channels) {
      metrics[channel] = await this.getMetrics(startDate, endDate, channel);
    }

    return metrics;
  }

  // Get hourly breakdown
  async getHourlyBreakdown(date: Date, channel?: string): Promise<any[]> {
    const query = db('notification_analytics')
      .where('date', date)
      .select('hour', 'channel', 'total_sent', 'total_delivered', 'total_failed')
      .orderBy('hour');

    if (channel) {
      query.where('channel', channel);
    }

    return query;
  }

  // Get top notification types
  async getTopNotificationTypes(
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ): Promise<any[]> {
    return db('notification_analytics')
      .whereBetween('date', [startDate, endDate])
      .groupBy('type')
      .select(
        'type',
        db.raw('SUM(total_sent) as count'),
        db.raw('ROUND(100.0 * SUM(total_delivered) / NULLIF(SUM(total_sent), 0), 2) as delivery_rate')
      )
      .orderBy('count', 'desc')
      .limit(limit);
  }

  // Get user engagement stats
  async getUserEngagement(userId: string): Promise<any> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const notifications = await db('notification_history')
      .where('user_id', userId)
      .where('created_at', '>=', thirtyDaysAgo)
      .count('id as total')
      .first();

    const engagement = await db('notification_engagement')
      .where('user_id', userId)
      .where('action_timestamp', '>=', thirtyDaysAgo)
      .select('action')
      .count('id as count')
      .groupBy('action');

    const engagementMap: any = {};
    engagement.forEach(row => {
      engagementMap[row.action] = parseInt(String(row.count));
    });

    return {
      totalReceived: parseInt(String(notifications?.total || 0)) || 0,
      opened: engagementMap.opened || 0,
      clicked: engagementMap.clicked || 0,
      unsubscribed: engagementMap.unsubscribed || 0
    };
  }

  // Private helper methods
  private async updateHourlyMetrics(data: {
    channel: string;
    type: string;
    provider: string;
    metric: string;
    increment: number;
    deliveryTimeMs?: number;
  }): Promise<void> {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const hour = now.getHours();

    // SECURITY FIX: Whitelist allowed metric columns
    const allowedMetrics = [
      'total_sent',
      'total_delivered', 
      'total_failed',
      'total_bounced',
      'total_opened',
      'total_clicked'
    ];

    if (!allowedMetrics.includes(data.metric)) {
      throw new Error(`Invalid metric column: ${data.metric}`);
    }

    // Build update data object safely
    const updateData: any = {};
    
    // Since the metric is now validated, we can use it in the raw query
    // But we'll use a different approach to avoid any SQL injection
    if (data.metric === 'total_sent') {
      updateData.total_sent = db.raw('COALESCE(total_sent, 0) + ?', [data.increment]);
    } else if (data.metric === 'total_delivered') {
      updateData.total_delivered = db.raw('COALESCE(total_delivered, 0) + ?', [data.increment]);
    } else if (data.metric === 'total_failed') {
      updateData.total_failed = db.raw('COALESCE(total_failed, 0) + ?', [data.increment]);
    } else if (data.metric === 'total_bounced') {
      updateData.total_bounced = db.raw('COALESCE(total_bounced, 0) + ?', [data.increment]);
    } else if (data.metric === 'total_opened') {
      updateData.total_opened = db.raw('COALESCE(total_opened, 0) + ?', [data.increment]);
    } else if (data.metric === 'total_clicked') {
      updateData.total_clicked = db.raw('COALESCE(total_clicked, 0) + ?', [data.increment]);
    }

    if (data.deliveryTimeMs) {
      updateData.avg_delivery_time_ms = db.raw(
        '(COALESCE(avg_delivery_time_ms * total_delivered, 0) + ?) / NULLIF(total_delivered + 1, 0)',
        [data.deliveryTimeMs]
      );
    }

    const insertData: any = {
      date,
      hour,
      channel: data.channel,
      type: data.type,
      provider: data.provider,
      created_at: now,
      updated_at: now
    };

    // Set the initial value for the metric
    insertData[data.metric] = data.increment;
    
    if (data.deliveryTimeMs) {
      insertData.avg_delivery_time_ms = data.deliveryTimeMs;
    }

    await db('notification_analytics')
      .insert(insertData)
      .onConflict(['date', 'hour', 'channel', 'type', 'provider'])
      .merge(updateData);
  }

  private async updateMetricForNotification(
    notificationId: string,
    metric: string
  ): Promise<void> {
    const notification = await db('notification_history')
      .where('id', notificationId)
      .first();

    if (!notification) return;

    await this.updateHourlyMetrics({
      channel: notification.channel,
      type: notification.type,
      provider: notification.metadata?.provider,
      metric,
      increment: 1
    });
  }

  // Generate tracking pixel
  generateTrackingPixel(notificationId: string, userId: string): string {
    const trackingId = crypto.randomBytes(16).toString('hex');
    const baseUrl = process.env.API_URL || 'https://api.tickettoken.com';
    return `${baseUrl}/track/open/${trackingId}?n=${notificationId}&u=${userId}`;
  }

  // Generate tracked link
  generateTrackedLink(
    notificationId: string,
    userId: string,
    originalUrl: string,
    linkId: string
  ): string {
    const baseUrl = process.env.API_URL || 'https://api.tickettoken.com';
    const params = new URLSearchParams({
      n: notificationId,
      u: userId,
      l: linkId,
      url: originalUrl
    });
    return `${baseUrl}/track/click?${params.toString()}`;
  }
}

export const analyticsService = new AnalyticsService();
```

### FILE: src/services/campaign.service.v2.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { notificationServiceV2 } from './notification.service.v2';
import { v4 as uuidv4 } from 'uuid';


interface ABTestVariant {
  id: string;
  name: string;
  templateId: string;
  subject?: string;
  percentage: number;
}

export class CampaignServiceV2 {
  private readonly campaignsTable = 'campaigns';
  private readonly segmentsTable = 'campaign_segments';

  async createCampaign(campaign: {
    venueId: string;
    name: string;
    type: 'marketing' | 'transactional';
    channel: 'email' | 'sms';
    segmentId?: string;
    templateId?: string;
    abTest?: {
      enabled: boolean;
      variants: ABTestVariant[];
    };
    scheduledFor?: Date;
    dailyLimit?: number;
    monthlyLimit?: number;
  }) {
    const campaignId = uuidv4();
    
    // Check venue limits
    const limits = await this.checkVenueLimits(campaign.venueId, campaign.channel);
    if (!limits.canSend) {
      throw new Error(`Venue has reached ${campaign.channel} limit: ${limits.reason}`);
    }

    await db(this.campaignsTable).insert({
      id: campaignId,
      venue_id: campaign.venueId,
      name: campaign.name,
      type: campaign.type,
      channel: campaign.channel,
      segment_id: campaign.segmentId,
      template_id: campaign.templateId,
      ab_test_config: campaign.abTest ? JSON.stringify(campaign.abTest) : null,
      scheduled_for: campaign.scheduledFor,
      status: campaign.scheduledFor ? 'scheduled' : 'draft',
      daily_limit: campaign.dailyLimit,
      monthly_limit: campaign.monthlyLimit,
      created_at: new Date(),
      updated_at: new Date(),
    });

    logger.info('Campaign created', { campaignId, name: campaign.name });
    return campaignId;
  }

  async sendCampaign(campaignId: string) {
    const campaign = await db(this.campaignsTable)
      .where('id', campaignId)
      .first();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Check spam score before sending
    if (campaign.channel === 'email') {
      const spamScore = await this.checkSpamScore(campaign.template_id);
      if (spamScore > 5) {
        throw new Error(`Campaign has high spam score: ${spamScore}. Please review content.`);
      }
    }

    // Update status
    await db(this.campaignsTable)
      .where('id', campaignId)
      .update({ 
        status: 'sending',
        started_at: new Date(),
        updated_at: new Date()
      });

    // Get audience based on segment
    const audience = await this.getSegmentedAudience(
      campaign.venue_id,
      campaign.segment_id
    );

    // Handle A/B testing if enabled
    let variants: ABTestVariant[] = [];
    if (campaign.ab_test_config) {
      const config = JSON.parse(campaign.ab_test_config);
      if (config.enabled) {
        variants = config.variants;
      }
    }

    const stats = {
      total: audience.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      variants: {} as Record<string, number>,
    };

    // Process in batches to respect rate limits
    const batchSize = campaign.daily_limit || 1000;
    const batches = this.chunkArray(audience, batchSize);

    for (const batch of batches) {
      await this.processBatch(
        batch,
        campaign,
        campaignId,
        variants,
        stats
      );

      // Add delay between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Update campaign with final stats
    await db(this.campaignsTable)
      .where('id', campaignId)
      .update({
        status: 'completed',
        completed_at: new Date(),
        stats: JSON.stringify(stats),
        updated_at: new Date(),
      });

    logger.info('Campaign completed', { 
      campaignId, 
      stats 
    });

    return stats;
  }

  private async processBatch(
    batch: any[],
    campaign: any,
    campaignId: string,
    variants: ABTestVariant[],
    stats: any
  ) {
    for (const recipient of batch) {
      try {
        // Select variant for A/B testing
        let templateId = campaign.template_id;
        let variantId = 'control';
        
        if (variants.length > 0) {
          const selected = this.selectVariant(variants, recipient.id);
          templateId = selected.templateId;
          variantId = selected.id;
          stats.variants[variantId] = (stats.variants[variantId] || 0) + 1;
        }

        await notificationServiceV2.send({
          venueId: campaign.venue_id,
          recipientId: recipient.id,
          recipient: {
            id: recipient.id,
            email: recipient.email,
            phone: recipient.phone,
            name: recipient.name,
            timezone: recipient.timezone,
          },
          channel: campaign.channel,
          type: campaign.type,
          template: campaign.template_name || templateId,
          priority: 'low',
          data: {
            campaignId,
            variantId,
            ...recipient.data,
          },
          metadata: {
            campaignId,
            campaignName: campaign.name,
            variantId,
          },
        });
        
        stats.sent++;
      } catch (error) {
        stats.failed++;
        logger.error('Failed to send campaign message', { 
          campaignId, 
          recipientId: recipient.id,
          error 
        });
      }
    }
  }

  private async getSegmentedAudience(venueId: string, segmentId?: string) {
    if (!segmentId) {
      // Return all customers for venue
      return this.getAllVenueCustomers(venueId);
    }

    const segment = await db(this.segmentsTable)
      .where('id', segmentId)
      .first();

    if (!segment) {
      throw new Error('Segment not found');
    }

    const filters = JSON.parse(segment.filters);
    return this.applySegmentFilters(venueId, filters);
  }

  private async applySegmentFilters(venueId: string, filters: any) {
    // This would build a complex query based on filters
    // For now, returning mock filtered data
    let query = db('customers')
      .where('venue_id', venueId)
      .where('opt_in_marketing', true);

    if (filters.lastPurchase) {
      const date = new Date();
      date.setDate(date.getDate() - filters.lastPurchase.days);
      
      if (filters.lastPurchase.operator === 'within') {
        query = query.where('last_purchase_at', '>=', date);
      } else {
        query = query.where('last_purchase_at', '<', date);
      }
    }

    if (filters.customerType) {
      query = query.where('customer_type', filters.customerType);
    }

    if (filters.eventAttendance) {
      // This would join with ticket purchases
      // Simplified for now
    }

    return await query.select(
      'id',
      'email',
      'phone',
      'first_name as name',
      'timezone'
    );
  }

  private async getAllVenueCustomers(_venueId: string) {
    // Mock implementation - would query actual customer database
    return [
      {
        id: 'cust-1',
        email: 'customer1@example.com',
        phone: '+15551234567',
        name: 'John Doe',
        timezone: 'America/Chicago',
        data: {
          firstName: 'John',
          lastName: 'Doe',
          lastEvent: 'Rock Concert',
        },
      },
    ];
  }

  private selectVariant(variants: ABTestVariant[], recipientId: string): ABTestVariant {
    // Use consistent hashing to ensure same recipient always gets same variant
    const hash = this.hashCode(recipientId);
    const random = (hash % 100) / 100;
    
    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.percentage / 100;
      if (random <= cumulative) {
        return variant;
      }
    }
    
    return variants[0];
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private async checkVenueLimits(venueId: string, channel: string) {
    const settings = await db('venue_notification_settings')
      .where('venue_id', venueId)
      .first();

    if (!settings) {
      return { canSend: true };
    }

    // Check daily limit
    if (channel === 'email' && settings.daily_email_limit) {
      const todayCount = await this.getTodayCount(venueId, 'email');
      if (todayCount >= settings.daily_email_limit) {
        return { 
          canSend: false, 
          reason: `Daily email limit reached (${settings.daily_email_limit})` 
        };
      }
    }

    if (channel === 'sms' && settings.daily_sms_limit) {
      const todayCount = await this.getTodayCount(venueId, 'sms');
      if (todayCount >= settings.daily_sms_limit) {
        return { 
          canSend: false, 
          reason: `Daily SMS limit reached (${settings.daily_sms_limit})` 
        };
      }
    }

    // Check monthly limit
    if (channel === 'email' && settings.monthly_email_limit) {
      const monthCount = await this.getMonthCount(venueId, 'email');
      if (monthCount >= settings.monthly_email_limit) {
        return { 
          canSend: false, 
          reason: `Monthly email limit reached (${settings.monthly_email_limit})` 
        };
      }
    }

    if (channel === 'sms' && settings.monthly_sms_limit) {
      const monthCount = await this.getMonthCount(venueId, 'sms');
      if (monthCount >= settings.monthly_sms_limit) {
        return { 
          canSend: false, 
          reason: `Monthly SMS limit reached (${settings.monthly_sms_limit})` 
        };
      }
    }

    return { canSend: true };
  }

  private async getTodayCount(venueId: string, channel: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db('notification_tracking')
      .where('venue_id', venueId)
      .where('channel', channel)
      .where('created_at', '>=', today)
      .count('id as count')
      .first();

    return parseInt(String(result?.count || '0'));
  }

  private async getMonthCount(venueId: string, channel: string): Promise<number> {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const result = await db('notification_tracking')
      .where('venue_id', venueId)
      .where('channel', channel)
      .where('created_at', '>=', firstOfMonth)
      .count('id as count')
      .first();

    return parseInt(String(result?.count || '0'));
  }

  private async checkSpamScore(templateId: string): Promise<number> {
    // Implement spam scoring logic
    // Check for spam trigger words, excessive caps, too many links, etc.
    const template = await db('notification_templates')
      .where('id', templateId)
      .first();

    if (!template) return 0;

    let score = 0;
    const content = (template.content + ' ' + template.subject).toLowerCase();

    // Spam trigger words
    const spamWords = ['free', 'winner', 'cash', 'prize', 'urgent', 'act now', 'limited time'];
    for (const word of spamWords) {
      if (content.includes(word)) score++;
    }

    // Check for excessive caps
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.3) score += 3;

    // Check for excessive exclamation marks
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > 3) score += 2;

    return score;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async createSegment(segment: {
    venueId: string;
    name: string;
    filters: any;
  }): Promise<string> {
    const segmentId = uuidv4();
    
    await db(this.segmentsTable).insert({
      id: segmentId,
      venue_id: segment.venueId,
      name: segment.name,
      filters: JSON.stringify(segment.filters),
      created_at: new Date(),
      updated_at: new Date(),
    });

    return segmentId;
  }

  async getCampaignAnalytics(campaignId: string) {
    const campaign = await db(this.campaignsTable)
      .where('id', campaignId)
      .first();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get detailed analytics
    const opens = await db('notification_tracking')
      .where('metadata', '@>', JSON.stringify({ campaignId }))
      .whereNotNull('opened_at')
      .count('id as count')
      .first();

    const clicks = await db('notification_tracking')
      .where('metadata', '@>', JSON.stringify({ campaignId }))
      .whereNotNull('clicked_at')
      .count('id as count')
      .first();

    const bounces = await db('notification_tracking')
      .where('metadata', '@>', JSON.stringify({ campaignId }))
      .where('status', 'bounced')
      .count('id as count')
      .first();

    const stats = JSON.parse(campaign.stats || '{}');

    return {
      campaignId,
      name: campaign.name,
      status: campaign.status,
      ...stats,
      opens: parseInt(String(opens?.count || '0')),
      clicks: parseInt(String(clicks?.count || '0')),
      bounces: parseInt(String(bounces?.count || '0')),
      openRate: stats.sent ? (parseInt(String(opens?.count || '0')) / stats.sent) * 100 : 0,
      clickRate: stats.sent ? (parseInt(String(clicks?.count || '0')) / stats.sent) * 100 : 0,
      bounceRate: stats.sent ? (parseInt(String(bounces?.count || '0')) / stats.sent) * 100 : 0,
    };
  }
}

export const campaignServiceV2 = new CampaignServiceV2();
```

### FILE: src/services/delivery-tracker.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import Bull from 'bull';

export interface DeliveryTrackingData {
  notificationId: string;
  userId: string;
  channel: 'email' | 'sms' | 'push';
  recipient: string;
  providerMessageId?: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'retrying';
  attempts: number;
  maxAttempts?: number;
  lastError?: string;
  providerResponse?: any;
}

export class DeliveryTracker {
  private retryQueue: Bull.Queue;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_DELAYS = [
    5000,    // 5 seconds
    30000,   // 30 seconds
    300000   // 5 minutes
  ];

  constructor() {
    this.retryQueue = new Bull('notification-retry', {
      redis: {
        port: parseInt(process.env.REDIS_PORT || '6379'),
        host: process.env.REDIS_HOST || 'redis',
        password: process.env.REDIS_PASSWORD
      }
    });

    this.initializeRetryProcessor();
  }

  private initializeRetryProcessor() {
    this.retryQueue.process(async (job) => {
      const { notificationId, attempt } = job.data;
      await this.retryNotification(notificationId, attempt);
    });
  }

  async trackDelivery(data: DeliveryTrackingData): Promise<void> {
    try {
      // Update notification history
      await db('notification_history')
        .where('id', data.notificationId)
        .update({
          delivery_status: data.status,
          delivery_attempts: data.attempts,
          last_attempt_at: new Date(),
          delivered_at: data.status === 'delivered' ? new Date() : null,
          failed_reason: data.lastError,
          provider_message_id: data.providerMessageId,
          provider_response: JSON.stringify(data.providerResponse || {}),
          should_retry: this.shouldRetry(data),
          updated_at: new Date()
        });

      // Update daily stats
      await this.updateStats(data);

      // Schedule retry if needed
      if (this.shouldRetry(data)) {
        await this.scheduleRetry(data);
      }

      logger.info('Delivery tracked', {
        notificationId: data.notificationId,
        status: data.status,
        attempts: data.attempts
      });
    } catch (error) {
      logger.error('Failed to track delivery', { error, data });
    }
  }

  private shouldRetry(data: DeliveryTrackingData): boolean {
    if (data.status === 'delivered' || data.status === 'bounced') {
      return false;
    }

    if (data.attempts >= (data.maxAttempts || this.MAX_ATTEMPTS)) {
      return false;
    }

    if (data.status === 'failed' || data.status === 'retrying') {
      return true;
    }

    return false;
  }

  private async scheduleRetry(data: DeliveryTrackingData): Promise<void> {
    const delay = this.RETRY_DELAYS[data.attempts - 1] || this.RETRY_DELAYS[this.RETRY_DELAYS.length - 1];
    
    await this.retryQueue.add(
      {
        notificationId: data.notificationId,
        attempt: data.attempts + 1,
        userId: data.userId,
        channel: data.channel,
        recipient: data.recipient
      },
      {
        delay,
        attempts: 1,
        backoff: {
          type: 'fixed',
          delay: 0
        }
      }
    );

    // Update retry_after timestamp
    await db('notification_history')
      .where('id', data.notificationId)
      .update({
        retry_after: new Date(Date.now() + delay),
        delivery_status: 'retrying'
      });

    logger.info('Retry scheduled', {
      notificationId: data.notificationId,
      attempt: data.attempts + 1,
      delayMs: delay
    });
  }

  private async retryNotification(notificationId: string, attempt: number): Promise<void> {
    try {
      // Get notification details
      const notification = await db('notification_history')
        .where('id', notificationId)
        .first();

      if (!notification) {
        logger.error('Notification not found for retry', { notificationId });
        return;
      }

      // Re-send based on channel
      // This would call back to the notification service
      // For now, just mark as retried
      logger.info('Retrying notification', {
        notificationId,
        attempt,
        channel: notification.channel
      });

      // In real implementation, this would re-send the notification
      // For mock, simulate success/failure
      const success = Math.random() > 0.3; // 70% success rate on retry

      await this.trackDelivery({
        notificationId,
        userId: notification.user_id,
        channel: notification.channel,
        recipient: notification.recipient,
        status: success ? 'delivered' : 'failed',
        attempts: attempt,
        lastError: success ? undefined : 'Retry failed'
      });
    } catch (error) {
      logger.error('Retry failed', { error, notificationId });
    }
  }

  private async updateStats(data: DeliveryTrackingData): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      await db.raw(`
        INSERT INTO notification_delivery_stats (
          date, channel, provider,
          total_sent, total_delivered, total_failed, total_bounced, total_retried
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (date, channel, provider) 
        DO UPDATE SET
          total_sent = notification_delivery_stats.total_sent + EXCLUDED.total_sent,
          total_delivered = notification_delivery_stats.total_delivered + EXCLUDED.total_delivered,
          total_failed = notification_delivery_stats.total_failed + EXCLUDED.total_failed,
          total_bounced = notification_delivery_stats.total_bounced + EXCLUDED.total_bounced,
          total_retried = notification_delivery_stats.total_retried + EXCLUDED.total_retried,
          updated_at = CURRENT_TIMESTAMP
      `, [
        today,
        data.channel,
        'mock', // or get from provider response
        data.status === 'sent' ? 1 : 0,
        data.status === 'delivered' ? 1 : 0,
        data.status === 'failed' ? 1 : 0,
        data.status === 'bounced' ? 1 : 0,
        data.status === 'retrying' ? 1 : 0
      ]);
    } catch (error) {
      logger.error('Failed to update stats', { error });
    }
  }

  async getDeliveryStats(startDate?: Date, endDate?: Date): Promise<any> {
    const query = db('notification_delivery_stats');
    
    if (startDate) {
      query.where('date', '>=', startDate);
    }
    
    if (endDate) {
      query.where('date', '<=', endDate);
    }
    
    return query.select(
      db.raw('SUM(total_sent) as total_sent'),
      db.raw('SUM(total_delivered) as total_delivered'),
      db.raw('SUM(total_failed) as total_failed'),
      db.raw('SUM(total_bounced) as total_bounced'),
      db.raw('SUM(total_retried) as total_retried'),
      db.raw('ROUND(100.0 * SUM(total_delivered) / NULLIF(SUM(total_sent), 0), 2) as delivery_rate'),
      'channel'
    )
    .groupBy('channel');
  }

  async getPendingRetries(): Promise<any[]> {
    return db('notification_history')
      .where('delivery_status', 'retrying')
      .where('should_retry', true)
      .where('retry_after', '<=', new Date())
      .orderBy('retry_after', 'asc')
      .limit(100);
  }
}

export const deliveryTracker = new DeliveryTracker();
```

### FILE: src/services/spam-score.service.ts
```typescript
import { logger } from '../config/logger';

interface SpamCheckResult {
  score: number;
  flags: string[];
  passed: boolean;
  recommendations: string[];
}

export class SpamScoreService {
  private readonly MAX_ACCEPTABLE_SCORE = 5;
  
  async checkContent(
    subject: string,
    content: string,
    htmlContent?: string
  ): Promise<SpamCheckResult> {
    const flags: string[] = [];
    const recommendations: string[] = [];
    let score = 0;

    // Combine all content for analysis
    const fullContent = `${subject} ${content} ${htmlContent || ''}`.toLowerCase();

    // Check spam trigger words
    score += this.checkSpamWords(fullContent, flags);
    
    // Check capitalization
    score += this.checkCapitalization(fullContent, flags);
    
    // Check punctuation
    score += this.checkPunctuation(fullContent, flags);
    
    // Check links
    score += this.checkLinks(htmlContent || content, flags);
    
    // Check images ratio
    if (htmlContent) {
      score += this.checkImageRatio(htmlContent, flags);
    }
    
    // Check subject line
    score += this.checkSubjectLine(subject, flags);
    
    // Generate recommendations
    if (score > 3) {
      recommendations.push('Consider rewording to avoid spam triggers');
    }
    if (flags.includes('excessive_caps')) {
      recommendations.push('Reduce use of capital letters');
    }
    if (flags.includes('too_many_links')) {
      recommendations.push('Reduce the number of links');
    }

    const result = {
      score,
      flags,
      passed: score <= this.MAX_ACCEPTABLE_SCORE,
      recommendations,
    };

    logger.info('Spam check completed', result);
    return result;
  }

  private checkSpamWords(content: string, flags: string[]): number {
    let score = 0;
    
    const highRiskWords = [
      'viagra', 'pills', 'weight loss', 'get rich', 'work from home',
      'nigerian prince', 'inheritance', 'winner', 'selected'
    ];
    
    const mediumRiskWords = [
      'free', 'guarantee', 'no obligation', 'risk free', 'urgent',
      'act now', 'limited time', 'exclusive deal', 'click here'
    ];
    
    const lowRiskWords = [
      'sale', 'discount', 'offer', 'special', 'new', 'important'
    ];

    // Check high risk words (3 points each)
    for (const word of highRiskWords) {
      if (content.includes(word)) {
        score += 3;
        flags.push(`high_risk_word: ${word}`);
      }
    }

    // Check medium risk words (2 points each)
    for (const word of mediumRiskWords) {
      if (content.includes(word)) {
        score += 2;
        flags.push(`medium_risk_word: ${word}`);
      }
    }

    // Check low risk words (1 point each)
    let lowRiskCount = 0;
    for (const word of lowRiskWords) {
      if (content.includes(word)) {
        lowRiskCount++;
      }
    }
    if (lowRiskCount > 3) {
      score += lowRiskCount;
      flags.push('multiple_promotional_words');
    }

    return score;
  }

  private checkCapitalization(content: string, flags: string[]): number {
    const upperCount = (content.match(/[A-Z]/g) || []).length;
    const totalCount = content.length;
    const ratio = upperCount / totalCount;

    if (ratio > 0.3) {
      flags.push('excessive_caps');
      return 3;
    } else if (ratio > 0.2) {
      flags.push('high_caps');
      return 1;
    }
    
    return 0;
  }

  private checkPunctuation(content: string, flags: string[]): number {
    let score = 0;
    
    // Check excessive exclamation marks
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > 5) {
      score += 2;
      flags.push('excessive_exclamation');
    } else if (exclamationCount > 3) {
      score += 1;
      flags.push('multiple_exclamation');
    }

    // Check excessive question marks
    const questionCount = (content.match(/\?/g) || []).length;
    if (questionCount > 5) {
      score += 1;
      flags.push('excessive_questions');
    }

    // Check for $$$ or similar
    if (content.includes('$$$') || content.includes('€€€')) {
      score += 2;
      flags.push('money_symbols');
    }

    return score;
  }

  private checkLinks(content: string, flags: string[]): number {
    const linkCount = (content.match(/https?:\/\//gi) || []).length;
    
    if (linkCount > 10) {
      flags.push('too_many_links');
      return 3;
    } else if (linkCount > 5) {
      flags.push('multiple_links');
      return 1;
    }
    
    // Check for URL shorteners
    const shorteners = ['bit.ly', 'tinyurl', 'goo.gl', 'ow.ly'];
    for (const shortener of shorteners) {
      if (content.includes(shortener)) {
        flags.push('url_shortener');
        return 2;
      }
    }
    
    return 0;
  }

  private checkImageRatio(htmlContent: string, flags: string[]): number {
    const imgCount = (htmlContent.match(/<img/gi) || []).length;
    const textLength = htmlContent.replace(/<[^>]*>/g, '').length;
    
    if (textLength < 100 && imgCount > 1) {
      flags.push('image_heavy');
      return 2;
    }
    
    return 0;
  }

  private checkSubjectLine(subject: string, flags: string[]): number {
    let score = 0;
    
    // Check if subject is all caps
    if (subject === subject.toUpperCase() && subject.length > 5) {
      flags.push('subject_all_caps');
      score += 2;
    }
    
    // Check for RE: or FWD: spam
    if (subject.match(/^(re:|fwd?:)/i) && !subject.match(/^(re:|fwd?):\s*\w/i)) {
      flags.push('fake_reply');
      score += 3;
    }
    
    // Check for empty or very short subject
    if (subject.length < 3) {
      flags.push('short_subject');
      score += 1;
    }
    
    return score;
  }
}

export const spamScoreService = new SpamScoreService();
```

### FILE: src/services/i18n.service.ts
```typescript
import { logger } from '../config/logger';
import { db } from '../config/database';

interface TranslationData {
  [key: string]: string | TranslationData;
}

export class I18nService {
  private translations: Map<string, TranslationData> = new Map();
  private readonly supportedLanguages = ['en', 'es', 'fr', 'de', 'pt', 'zh', 'ja'];
  private readonly defaultLanguage = 'en';

  async loadTranslations() {
    for (const lang of this.supportedLanguages) {
      const translations = await db('translations')
        .where('language', lang)
        .select('key', 'value');

      const data: TranslationData = {};
      for (const trans of translations) {
        this.setNestedProperty(data, trans.key, trans.value);
      }

      this.translations.set(lang, data);
    }

    logger.info('Translations loaded', { 
      languages: this.supportedLanguages 
    });
  }

  translate(
    key: string,
    language: string = this.defaultLanguage,
    variables?: Record<string, any>
  ): string {
    const lang = this.supportedLanguages.includes(language) 
      ? language 
      : this.defaultLanguage;

    const translations = this.translations.get(lang) || {};
    const value = this.getNestedProperty(translations, key);

    if (!value) {
      logger.warn('Translation missing', { key, language });
      return key;
    }

    // Replace variables
    let translated = value as string;
    if (variables) {
      Object.entries(variables).forEach(([varKey, varValue]) => {
        translated = translated.replace(
          new RegExp(`{{${varKey}}}`, 'g'),
          String(varValue)
        );
      });
    }

    return translated;
  }

  detectLanguage(text: string): string {
    // Simple language detection based on character sets
    // In production, would use a proper language detection library
    
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh'; // Chinese
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'; // Japanese
    if (/[àâäæçéèêëïîôùûüÿœ]/i.test(text)) return 'fr'; // French
    if (/[áéíóúñ¿¡]/i.test(text)) return 'es'; // Spanish
    if (/[äöüßẞ]/i.test(text)) return 'de'; // German
    if (/[ãõçáéíóú]/i.test(text)) return 'pt'; // Portuguese
    
    return 'en';
  }

  async translateTemplate(
    templateContent: string,
    fromLang: string,
    toLang: string
  ): Promise<string> {
    // In production, this would use a translation API (Google Translate, DeepL, etc.)
    // For now, return the original content
    
    logger.info('Template translation requested', { 
      from: fromLang, 
      to: toLang 
    });
    
    return templateContent;
  }

  formatDate(date: Date, language: string): string {
    const locale = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      pt: 'pt-BR',
      zh: 'zh-CN',
      ja: 'ja-JP',
    }[language] || 'en-US';

    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  formatCurrency(amount: number, currency: string, language: string): string {
    const locale = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      pt: 'pt-BR',
      zh: 'zh-CN',
      ja: 'ja-JP',
    }[language] || 'en-US';

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  private setNestedProperty(obj: any, path: string, value: any) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  private getNestedProperty(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (!current[key]) return null;
      current = current[key];
    }
    
    return current;
  }
}

export const i18nService = new I18nService();
```

### FILE: src/services/compliance.service.ts
```typescript
import { consentModel } from '../models/consent.model';
import { suppressionModel } from '../models/suppression.model';
import { NotificationChannel, NotificationType, NotificationRequest } from '../types/notification.types';
import { logger } from '../config/logger';
import { env } from '../config/env';

export class ComplianceService {
  async checkCompliance(request: NotificationRequest): Promise<{
    isCompliant: boolean;
    reason?: string;
  }> {
    try {
      // Skip compliance checks if disabled (NOT recommended for production)
      if (!env.ENABLE_CONSENT_CHECK && !env.ENABLE_SUPPRESSION_CHECK) {
        return { isCompliant: true };
      }

      // Check suppression list first (highest priority)
      if (env.ENABLE_SUPPRESSION_CHECK) {
        const identifier = request.channel === 'email' 
          ? request.recipient.email 
          : request.recipient.phone;

        if (identifier && await suppressionModel.isSuppressed(identifier, request.channel)) {
          logger.warn('Notification blocked: recipient is suppressed', {
            channel: request.channel,
            venueId: request.venueId,
          });
          return { 
            isCompliant: false, 
            reason: 'Recipient is on suppression list' 
          };
        }
      }

      // Check consent for marketing messages
      if (env.ENABLE_CONSENT_CHECK && request.type === 'marketing') {
        const hasConsent = await consentModel.hasConsent(
          request.recipientId,
          request.channel,
          request.type,
          request.venueId
        );

        if (!hasConsent) {
          logger.warn('Notification blocked: no consent', {
            recipientId: request.recipientId,
            channel: request.channel,
            type: request.type,
            venueId: request.venueId,
          });
          return { 
            isCompliant: false, 
            reason: 'No consent for marketing communications' 
          };
        }
      }

      // Check SMS time restrictions
      if (request.channel === 'sms' && !this.isWithinSmsTimeWindow(request.recipient.timezone)) {
        return { 
          isCompliant: false, 
          reason: 'Outside SMS delivery hours (8am-9pm recipient time)' 
        };
      }

      return { isCompliant: true };
    } catch (error) {
      logger.error('Compliance check failed', error);
      // Fail closed - if we can't verify compliance, don't send
      return { 
        isCompliant: false, 
        reason: 'Compliance check failed' 
      };
    }
  }

  private isWithinSmsTimeWindow(timezone?: string): boolean {
    const tz = timezone || env.DEFAULT_TIMEZONE;
    const now = new Date();
    
    // Convert to recipient's timezone
    const recipientTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const hour = recipientTime.getHours();

    return hour >= env.SMS_TIME_RESTRICTION_START && hour < env.SMS_TIME_RESTRICTION_END;
  }

  async recordConsent(
    customerId: string,
    channel: NotificationChannel,
    type: NotificationType,
    source: string,
    venueId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await consentModel.create({
      customerId,
      venueId,
      channel,
      type,
      status: 'granted',
      grantedAt: new Date(),
      source,
      ipAddress,
      userAgent,
    });
  }

  async revokeConsent(
    customerId: string,
    channel: NotificationChannel,
    type?: NotificationType,
    venueId?: string
  ): Promise<void> {
    await consentModel.revoke(customerId, channel, type, venueId);
  }

  async addToSuppressionList(
    identifier: string,
    channel: NotificationChannel,
    reason: string,
    suppressedBy?: string
  ): Promise<void> {
    await suppressionModel.add({
      identifier,
      channel,
      reason,
      suppressedAt: new Date(),
      suppressedBy,
    });
  }

  async removeFromSuppressionList(
    identifier: string,
    channel?: NotificationChannel
  ): Promise<void> {
    await suppressionModel.remove(identifier, channel);
  }
}

export const complianceService = new ComplianceService();
```

### FILE: src/types/env-augment.d.ts
```typescript

declare module '../config/env' {
  export interface EnvConfig {
    SENDGRID_WEBHOOK_SECRET?: string;
    AWS_REGION?: string;
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
  }
}
```

### FILE: src/types/events.types.ts
```typescript
export interface BaseEvent {
  eventId: string;
  timestamp: Date;
  venueId: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface PaymentCompletedEvent extends BaseEvent {
  type: 'payment.completed';
  data: {
    orderId: string;
    customerId: string;
    amount: number;
    currency: string;
    tickets: Array<{
      ticketId: string;
      eventName: string;
      eventDate: Date;
      venueName: string;
    }>;
    paymentMethod: string;
  };
}

export interface TicketTransferredEvent extends BaseEvent {
  type: 'ticket.transferred';
  data: {
    ticketId: string;
    fromUserId: string;
    toUserId: string;
    fromEmail: string;
    toEmail: string;
    eventName: string;
    eventDate: Date;
    transferredAt: Date;
  };
}

export interface EventReminderEvent extends BaseEvent {
  type: 'event.reminder';
  data: {
    eventId: string;
    eventName: string;
    eventDate: Date;
    venueName: string;
    venueAddress: string;
    ticketHolders: Array<{
      userId: string;
      email: string;
      ticketId: string;
    }>;
  };
}

export interface EventCancelledEvent extends BaseEvent {
  type: 'event.cancelled';
  data: {
    eventId: string;
    eventName: string;
    eventDate: Date;
    reason: string;
    refundAvailable: boolean;
    affectedTickets: Array<{
      ticketId: string;
      userId: string;
      email: string;
    }>;
  };
}

export interface UserRegisteredEvent extends BaseEvent {
  type: 'user.registered';
  data: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    registrationSource: string;
    verificationToken?: string;
  };
}

export interface PasswordResetEvent extends BaseEvent {
  type: 'user.password_reset';
  data: {
    userId: string;
    email: string;
    resetToken: string;
    expiresAt: Date;
  };
}

export type NotificationEvent = 
  | PaymentCompletedEvent
  | TicketTransferredEvent
  | EventReminderEvent
  | EventCancelledEvent
  | UserRegisteredEvent
  | PasswordResetEvent;
```

### FILE: src/types/notification.types.ts
```typescript
export type NotificationChannel = 'email' | 'sms' | 'push' | 'webhook';
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';
export type NotificationStatus = 'pending' | 'queued' | 'sending' | 'sent' | 'failed' | 'bounced' | 'delivered';
export type ConsentStatus = 'granted' | 'revoked' | 'pending';
export type NotificationType = 'transactional' | 'marketing' | 'system';

export interface NotificationRecipient {
  id: string;
  email?: string;
  phone?: string;
  name?: string;
  timezone?: string;
  locale?: string;
}

export interface NotificationData {
  [key: string]: any;
}

export interface NotificationRequest {
  id?: string;
  venueId: string;
  recipientId: string;
  recipient: NotificationRecipient;
  channel: NotificationChannel;
  type: NotificationType;
  template: string;
  data: NotificationData;
  priority: NotificationPriority;
  scheduledFor?: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface NotificationResponse {
  id: string;
  status: NotificationStatus;
  channel: NotificationChannel;
  sentAt?: Date;
  deliveredAt?: Date;
  failureReason?: string;
  providerMessageId?: string;
  cost?: number;
}

export interface ConsentRecord {
  id: string;
  customerId: string;
  venueId?: string;
  channel: NotificationChannel;
  type: NotificationType;
  status: ConsentStatus;
  grantedAt?: Date;
  revokedAt?: Date;
  expiresAt?: Date;
  source: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SuppressionRecord {
  id: string;
  identifier: string; // email or phone
  channel: NotificationChannel;
  reason: string;
  suppressedAt: Date;
  suppressedBy?: string;
  expiresAt?: Date;
}

export interface NotificationTemplate {
  id: string;
  venueId?: string;
  name: string;
  channel: NotificationChannel;
  type: NotificationType;
  subject?: string;
  content: string;
  htmlContent?: string;
  variables: string[];
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Campaign {
  id: string;
  venueId: string;
  name: string;
  type: NotificationType;
  channel: NotificationChannel;
  templateId: string;
  audienceFilter?: Record<string, any>;
  scheduledFor?: Date;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled';
  stats?: {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    opened?: number;
    clicked?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryTracking {
  id: string;
  notificationId: string;
  status: NotificationStatus;
  attempts: number;
  lastAttemptAt: Date;
  nextRetryAt?: Date;
  providerResponse?: any;
  events: Array<{
    type: string;
    timestamp: Date;
    data?: any;
  }>;
}

export interface VenueNotificationSettings {
  id: string;
  venueId: string;
  dailyEmailLimit?: number;
  dailySmsLimit?: number;
  monthlyEmailLimit?: number;
  monthlySmsLimit?: number;
  blockedChannels?: NotificationChannel[];
  defaultTimezone: string;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  replyToEmail?: string;
  smsCallbackNumber?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  customBranding?: {
    logoUrl?: string;
    primaryColor?: string;
    footerText?: string;
  };
}

export interface NotificationCost {
  id: string;
  notificationId: string;
  venueId: string;
  channel: NotificationChannel;
  provider: string;
  cost: number;
  currency: string;
  billingPeriod: string;
  isPlatformCost: boolean;
  createdAt: Date;
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/config/env.ts
```typescript
import { config } from 'dotenv';

// Load environment variables
config();

export interface EnvConfig {
  // Server
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  PORT: number;
  SERVICE_NAME: string;

  // Database
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_POOL_MIN: number;
  DB_POOL_MAX: number;

  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB: number;

  // RabbitMQ
  RABBITMQ_URL: string;
  RABBITMQ_EXCHANGE: string;
  RABBITMQ_QUEUE: string;

  // SendGrid
  SENDGRID_API_KEY: string;
  SENDGRID_FROM_EMAIL: string;
  SENDGRID_FROM_NAME: string;

  // Twilio
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM_NUMBER: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;

  // JWT
  JWT_SECRET: string;

  // Service URLs
  AUTH_SERVICE_URL: string;
  VENUE_SERVICE_URL: string;
  EVENT_SERVICE_URL: string;
  TICKET_SERVICE_URL: string;
  PAYMENT_SERVICE_URL: string;

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;

  // Notification Settings
  SMS_TIME_RESTRICTION_START: number;
  SMS_TIME_RESTRICTION_END: number;
  DEFAULT_TIMEZONE: string;
  MAX_RETRY_ATTEMPTS: number;
  RETRY_DELAY_MS: number;

  // Template Settings
  TEMPLATE_CACHE_TTL: number;
  ENABLE_TEMPLATE_PREVIEW: boolean;

  // Compliance Settings
  ENABLE_CONSENT_CHECK: boolean;
  ENABLE_SUPPRESSION_CHECK: boolean;
  LOG_ALL_NOTIFICATIONS: boolean;
  DATA_RETENTION_DAYS: number;

  // Feature Flags
  ENABLE_SMS: boolean;
  ENABLE_EMAIL: boolean;
  ENABLE_PUSH: boolean;
  ENABLE_WEBHOOK_DELIVERY: boolean;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

function getEnvVarAsNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (!value && defaultValue !== undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value || '', 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} is not a valid number`);
  }
  return parsed;
}

function getEnvVarAsBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const env: EnvConfig = {
  // Server
  NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
  PORT: getEnvVarAsNumber('PORT', 3009),
  SERVICE_NAME: getEnvVar('SERVICE_NAME', 'notification-service'),

  // Database
  DB_HOST: getEnvVar('DB_HOST', 'postgres'),
  DB_PORT: getEnvVarAsNumber('DB_PORT', 5432),
  DB_NAME: getEnvVar('DB_NAME', 'tickettoken_db'),
  DB_USER: getEnvVar('DB_USER', 'postgres'),
  DB_PASSWORD: getEnvVar('DB_PASSWORD', ''),
  DB_POOL_MIN: getEnvVarAsNumber('DB_POOL_MIN', 2),
  DB_POOL_MAX: getEnvVarAsNumber('DB_POOL_MAX', 10),

  // Redis
  REDIS_HOST: getEnvVar('REDIS_HOST', 'postgres'),
  REDIS_PORT: getEnvVarAsNumber('REDIS_PORT', 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DB: getEnvVarAsNumber('REDIS_DB', 9),

  // RabbitMQ
  RABBITMQ_URL: getEnvVar('RABBITMQ_URL', 'amqp://rabbitmq:5672'),
  RABBITMQ_EXCHANGE: getEnvVar('RABBITMQ_EXCHANGE', 'tickettoken_events'),
  RABBITMQ_QUEUE: getEnvVar('RABBITMQ_QUEUE', 'notifications'),

  // SendGrid
  SENDGRID_API_KEY: getEnvVar('SENDGRID_API_KEY', ''),
  SENDGRID_FROM_EMAIL: getEnvVar('SENDGRID_FROM_EMAIL', 'noreply@tickettoken.com'),
  SENDGRID_FROM_NAME: getEnvVar('SENDGRID_FROM_NAME', 'TicketToken'),

  // Twilio
  TWILIO_ACCOUNT_SID: getEnvVar('TWILIO_ACCOUNT_SID', ''),
  TWILIO_AUTH_TOKEN: getEnvVar('TWILIO_AUTH_TOKEN', ''),
  TWILIO_FROM_NUMBER: getEnvVar('TWILIO_FROM_NUMBER', ''),
  TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,

  // JWT - REMOVED DANGEROUS DEFAULT
  JWT_SECRET: getEnvVar('JWT_SECRET'),

  // Service URLs
  AUTH_SERVICE_URL: getEnvVar('AUTH_SERVICE_URL', 'http://auth-service:3001'),
  VENUE_SERVICE_URL: getEnvVar('VENUE_SERVICE_URL', 'http://venue-service:3002'),
  EVENT_SERVICE_URL: getEnvVar('EVENT_SERVICE_URL', 'http://event-service:3003'),
  TICKET_SERVICE_URL: getEnvVar('TICKET_SERVICE_URL', 'http://ticket-service:3004'),
  PAYMENT_SERVICE_URL: getEnvVar('PAYMENT_SERVICE_URL', 'http://payment-service:3005'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: getEnvVarAsNumber('RATE_LIMIT_WINDOW_MS', 60000),
  RATE_LIMIT_MAX_REQUESTS: getEnvVarAsNumber('RATE_LIMIT_MAX_REQUESTS', 100),

  // Notification Settings
  SMS_TIME_RESTRICTION_START: getEnvVarAsNumber('SMS_TIME_RESTRICTION_START', 8),
  SMS_TIME_RESTRICTION_END: getEnvVarAsNumber('SMS_TIME_RESTRICTION_END', 21),
  DEFAULT_TIMEZONE: getEnvVar('DEFAULT_TIMEZONE', 'America/Chicago'),
  MAX_RETRY_ATTEMPTS: getEnvVarAsNumber('MAX_RETRY_ATTEMPTS', 3),
  RETRY_DELAY_MS: getEnvVarAsNumber('RETRY_DELAY_MS', 5000),

  // Template Settings
  TEMPLATE_CACHE_TTL: getEnvVarAsNumber('TEMPLATE_CACHE_TTL', 3600),
  ENABLE_TEMPLATE_PREVIEW: getEnvVarAsBoolean('ENABLE_TEMPLATE_PREVIEW', true),

  // Compliance Settings
  ENABLE_CONSENT_CHECK: getEnvVarAsBoolean('ENABLE_CONSENT_CHECK', true),
  ENABLE_SUPPRESSION_CHECK: getEnvVarAsBoolean('ENABLE_SUPPRESSION_CHECK', true),
  LOG_ALL_NOTIFICATIONS: getEnvVarAsBoolean('LOG_ALL_NOTIFICATIONS', true),
  DATA_RETENTION_DAYS: getEnvVarAsNumber('DATA_RETENTION_DAYS', 90),

  // Feature Flags
  ENABLE_SMS: getEnvVarAsBoolean('ENABLE_SMS', true),
  ENABLE_EMAIL: getEnvVarAsBoolean('ENABLE_EMAIL', true),
  ENABLE_PUSH: getEnvVarAsBoolean('ENABLE_PUSH', false),
  ENABLE_WEBHOOK_DELIVERY: getEnvVarAsBoolean('ENABLE_WEBHOOK_DELIVERY', true),
};
```

### FILE: src/events/payment-event-handler.ts
```typescript
import { BaseEventHandler } from './base-event-handler';
import { ProviderFactory } from '../providers/provider-factory';
import { logger } from '../config/logger';

interface PaymentEventData {
  userId: string;
  amount: number;
  currency: string;
  eventId?: string;
  eventName?: string;
  ticketCount?: number;
  orderId: string;
  paymentIntentId?: string;
  refundId?: string;
  reason?: string;
  timestamp: string;
}

export class PaymentEventHandler extends BaseEventHandler {
  private emailProvider = ProviderFactory.getEmailProvider();
  private smsProvider = ProviderFactory.getSMSProvider();

  constructor() {
    super('payment-notifications', 'PaymentEventHandler');
  }

  initializeListeners(): void {
    this.queue.process('payment.succeeded', async (job) => {
      await this.handlePaymentSuccess(job.data);
    });

    this.queue.process('payment.failed', async (job) => {
      await this.handlePaymentFailed(job.data);
    });

    this.queue.process('refund.processed', async (job) => {
      await this.handleRefundProcessed(job.data);
    });

    this.queue.process('dispute.created', async (job) => {
      await this.handleDisputeCreated(job.data);
    });

    logger.info('Payment event listeners initialized');
  }

  private async handlePaymentSuccess(data: PaymentEventData): Promise<void> {
    try {
      logger.info(`Processing payment success for order ${data.orderId}`);

      const user = await this.getUserDetails(data.userId);
      
      let eventDetails: any = null;
      if (data.eventId) {
        eventDetails = await this.getEventDetails(data.eventId);
      }

      const templateData = {
        user: {
          name: user.name || user.email?.split('@')[0] || 'Customer',
          email: user.email || `user_${data.userId}@tickettoken.com`
        },
        amount: (data.amount / 100).toFixed(2),
        currency: (data.currency || 'USD').toUpperCase(),
        eventName: data.eventName || eventDetails?.name || 'Event',
        ticketCount: data.ticketCount || 1,
        orderId: data.orderId,
        orderUrl: `${process.env.FRONTEND_URL || 'https://app.tickettoken.com'}/orders/${data.orderId}`,
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com'
      };

      // For now, create simple HTML without template service
      const emailHtml = this.createPaymentSuccessHtml(templateData);
      const emailText = this.stripHtml(emailHtml);

      try {
        const emailResult = await this.emailProvider.send({
          to: user.email || templateData.user.email,
          subject: `Payment Confirmed - ${templateData.eventName}`,
          html: emailHtml,
          text: emailText,
          tags: ['payment', 'confirmation'],
          metadata: {
            orderId: data.orderId,
            userId: data.userId,
            type: 'payment_success'
          }
        });

        await this.recordNotification({
          userId: data.userId,
          type: 'payment_success',
          channel: 'email',
          recipient: user.email,
          status: emailResult.status,
          metadata: {
            orderId: data.orderId,
            amount: data.amount,
            messageId: emailResult.id
          }
        });

        logger.info(`Payment success email sent to ${user.email} for order ${data.orderId}`);
      } catch (error) {
        logger.error(`Failed to send payment success email:`, error);
      }

      if (user.phone && this.isValidPhone(user.phone)) {
        try {
          const smsMessage = `TicketToken: Payment of $${templateData.amount} confirmed for ${templateData.eventName}. Order #${data.orderId.slice(-8)}`;
          
          const smsResult = await this.smsProvider.send({
            to: user.phone,
            message: smsMessage,
            metadata: {
              orderId: data.orderId,
              type: 'payment_success'
            }
          });

          await this.recordNotification({
            userId: data.userId,
            type: 'payment_success',
            channel: 'sms',
            recipient: user.phone,
            status: smsResult.status,
            metadata: {
              orderId: data.orderId,
              messageId: smsResult.id
            }
          });

          logger.info(`Payment success SMS sent to ${user.phone}`);
        } catch (error) {
          logger.error(`Failed to send payment success SMS:`, error);
        }
      }
    } catch (error) {
      logger.error(`Error handling payment success:`, error);
    }
  }

  private async handlePaymentFailed(data: PaymentEventData): Promise<void> {
    try {
      logger.info(`Processing payment failure for order ${data.orderId}`);

      const user = await this.getUserDetails(data.userId);

      const templateData = {
        user: {
          name: user.name || user.email?.split('@')[0] || 'Customer',
          email: user.email || `user_${data.userId}@tickettoken.com`
        },
        amount: (data.amount / 100).toFixed(2),
        currency: (data.currency || 'USD').toUpperCase(),
        eventName: data.eventName || 'Event',
        orderId: data.orderId,
        reason: data.reason || 'Payment could not be processed',
        retryUrl: `${process.env.FRONTEND_URL || 'https://app.tickettoken.com'}/checkout/retry/${data.orderId}`,
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com'
      };

      const emailHtml = this.createPaymentFailedHtml(templateData);
      const emailText = this.stripHtml(emailHtml);

      const emailResult = await this.emailProvider.send({
        to: user.email || templateData.user.email,
        subject: `Payment Failed - Action Required`,
        html: emailHtml,
        text: emailText,
        tags: ['payment', 'failed'],
        metadata: {
          orderId: data.orderId,
          type: 'payment_failed'
        }
      });

      await this.recordNotification({
        userId: data.userId,
        type: 'payment_failed',
        channel: 'email',
        recipient: user.email,
        status: emailResult.status,
        metadata: {
          orderId: data.orderId,
          reason: data.reason
        }
      });

      logger.info(`Payment failure email sent to ${user.email}`);
    } catch (error) {
      logger.error(`Error handling payment failure:`, error);
    }
  }

  private async handleRefundProcessed(data: PaymentEventData): Promise<void> {
    try {
      logger.info(`Processing refund for order ${data.orderId}`);

      const user = await this.getUserDetails(data.userId);

      const templateData = {
        user: {
          name: user.name || user.email?.split('@')[0] || 'Customer',
          email: user.email || `user_${data.userId}@tickettoken.com`
        },
        amount: (data.amount / 100).toFixed(2),
        currency: (data.currency || 'USD').toUpperCase(),
        orderId: data.orderId,
        refundId: data.refundId,
        reason: data.reason || 'Refund processed',
        processingTime: '3-5 business days',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tickettoken.com'
      };

      const emailHtml = this.createRefundHtml(templateData);
      const emailText = this.stripHtml(emailHtml);

      const emailResult = await this.emailProvider.send({
        to: user.email || templateData.user.email,
        subject: `Refund Processed - Order #${data.orderId.slice(-8)}`,
        html: emailHtml,
        text: emailText,
        tags: ['payment', 'refund'],
        metadata: {
          orderId: data.orderId,
          refundId: data.refundId,
          type: 'refund_processed'
        }
      });

      await this.recordNotification({
        userId: data.userId,
        type: 'refund_processed',
        channel: 'email',
        recipient: user.email,
        status: emailResult.status,
        metadata: {
          orderId: data.orderId,
          refundId: data.refundId,
          amount: data.amount
        }
      });

      if (user.phone && this.isValidPhone(user.phone)) {
        const smsMessage = `TicketToken: Refund of $${templateData.amount} has been processed. Expect funds in ${templateData.processingTime}.`;
        
        await this.smsProvider.send({
          to: user.phone,
          message: smsMessage,
          metadata: {
            orderId: data.orderId,
            refundId: data.refundId,
            type: 'refund_processed'
          }
        });
      }

      logger.info(`Refund notification sent to ${user.email}`);
    } catch (error) {
      logger.error(`Error handling refund:`, error);
    }
  }

  private async handleDisputeCreated(data: any): Promise<void> {
    try {
      logger.info(`Processing dispute for order ${data.orderId}`);

      const csEmail = process.env.CS_TEAM_EMAIL || 'disputes@tickettoken.com';
      
      await this.emailProvider.send({
        to: csEmail,
        subject: `[URGENT] Payment Dispute Created - Order #${data.orderId}`,
        html: `
          <h2>Payment Dispute Alert</h2>
          <p>A payment dispute has been created.</p>
          <ul>
            <li>Order ID: ${data.orderId}</li>
            <li>Amount: $${(data.amount / 100).toFixed(2)}</li>
            <li>User ID: ${data.userId}</li>
            <li>Reason: ${data.reason || 'Not specified'}</li>
            <li>Created: ${new Date(data.timestamp).toLocaleString()}</li>
          </ul>
          <p>Please review in the admin dashboard immediately.</p>
        `,
        text: `Payment dispute created for order ${data.orderId}. Amount: $${(data.amount / 100).toFixed(2)}. Please review immediately.`,
        tags: ['dispute', 'urgent']
      });

      logger.info(`Dispute alert sent to customer service`);
    } catch (error) {
      logger.error(`Error handling dispute:`, error);
    }
  }

  private createPaymentSuccessHtml(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Payment Confirmation</title>
      </head>
      <body>
          <h1>Payment Confirmed! 🎉</h1>
          <p>Hi ${data.user.name},</p>
          <p>Your payment has been successfully processed.</p>
          <h3>Order Details</h3>
          <ul>
              <li>Event: ${data.eventName}</li>
              <li>Tickets: ${data.ticketCount}</li>
              <li>Amount: $${data.amount} ${data.currency}</li>
              <li>Order ID: #${data.orderId}</li>
          </ul>
          <p><a href="${data.orderUrl}">View Your Tickets</a></p>
          <p>Thank you for using TicketToken!</p>
      </body>
      </html>
    `;
  }

  private createPaymentFailedHtml(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Payment Failed</title>
      </head>
      <body>
          <h1>Payment Failed</h1>
          <p>Hi ${data.user.name},</p>
          <p>Unfortunately, we were unable to process your payment.</p>
          <p>Reason: ${data.reason}</p>
          <p>Event: ${data.eventName}</p>
          <p>Amount: $${data.amount} ${data.currency}</p>
          <p><a href="${data.retryUrl}">Try Payment Again</a></p>
      </body>
      </html>
    `;
  }

  private createRefundHtml(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Refund Processed</title>
      </head>
      <body>
          <h1>Refund Processed</h1>
          <p>Hi ${data.user.name},</p>
          <p>Your refund has been processed.</p>
          <ul>
              <li>Amount: $${data.amount} ${data.currency}</li>
              <li>Order ID: ${data.orderId}</li>
              <li>Refund ID: ${data.refundId}</li>
              <li>Processing Time: ${data.processingTime}</li>
          </ul>
          <p>If you have questions, contact ${data.supportEmail}</p>
      </body>
      </html>
    `;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  private isValidPhone(phone: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }
}
```

### FILE: src/models/suppression.model.ts
```typescript
import { db } from '../config/database';
import { SuppressionRecord, NotificationChannel } from '../types/notification.types';
import { logger } from '../config/logger';
import crypto from 'crypto';

export class SuppressionModel {
  private readonly tableName = 'suppression_list';

  async add(suppression: Omit<SuppressionRecord, 'id'>): Promise<SuppressionRecord> {
    // Hash the identifier for privacy
    const hashedIdentifier = this.hashIdentifier(suppression.identifier);

    const [record] = await db(this.tableName)
      .insert({
        ...suppression,
        id: db.raw('gen_random_uuid()'),
        identifier_hash: hashedIdentifier,
        created_at: new Date(),
      })
      .returning('*');
    
    logger.info('Added to suppression list', { 
      channel: suppression.channel,
      reason: suppression.reason 
    });
    
    return this.mapToSuppressionRecord(record);
  }

  async isSuppressed(identifier: string, channel: NotificationChannel): Promise<boolean> {
    const hashedIdentifier = this.hashIdentifier(identifier);

    const result = await db(this.tableName)
      .where('identifier_hash', hashedIdentifier)
      .andWhere('channel', channel)
      .andWhere(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', new Date());
      })
      .first();

    return !!result;
  }

  async remove(identifier: string, channel?: NotificationChannel): Promise<void> {
    const hashedIdentifier = this.hashIdentifier(identifier);

    let query = db(this.tableName)
      .where('identifier_hash', hashedIdentifier);

    if (channel) {
      query = query.andWhere('channel', channel);
    }

    await query.delete();

    logger.info('Removed from suppression list', { channel });
  }

  async findAll(limit: number = 100, offset: number = 0): Promise<SuppressionRecord[]> {
    const records = await db(this.tableName)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return records.map(this.mapToSuppressionRecord);
  }

  private hashIdentifier(identifier: string): string {
    return crypto
      .createHash('sha256')
      .update(identifier.toLowerCase().trim())
      .digest('hex');
  }

  private mapToSuppressionRecord(row: any): SuppressionRecord {
    return {
      id: row.id,
      identifier: row.identifier, // Note: This might be null for privacy
      channel: row.channel,
      reason: row.reason,
      suppressedAt: row.suppressed_at || row.created_at,
      suppressedBy: row.suppressed_by,
      expiresAt: row.expires_at,
    };
  }
}

export const suppressionModel = new SuppressionModel();
```

### FILE: src/models/consent.model.ts
```typescript
import { db } from '../config/database';
import { ConsentRecord, NotificationChannel, NotificationType } from '../types/notification.types';
import { logger } from '../config/logger';

export class ConsentModel {
  private readonly tableName = 'consent_records';

  async create(consent: Omit<ConsentRecord, 'id'>): Promise<ConsentRecord> {
    const [record] = await db(this.tableName)
      .insert({
        customer_id: consent.customerId,
        venue_id: consent.venueId,
        channel: consent.channel,
        type: consent.type,
        status: consent.status,
        granted_at: consent.grantedAt,
        source: consent.source,
        ip_address: consent.ipAddress,
        user_agent: consent.userAgent,
        id: db.raw('gen_random_uuid()'),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    
    logger.info('Consent record created', { 
      customerId: consent.customerId, 
      channel: consent.channel,
      status: consent.status 
    });
    
    return this.mapToConsentRecord(record);
  }

  async findByCustomer(
    customerId: string, 
    channel?: NotificationChannel, 
    type?: NotificationType
  ): Promise<ConsentRecord[]> {
    let query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('status', 'granted');

    if (channel) {
      query = query.andWhere('channel', channel);
    }

    if (type) {
      query = query.andWhere('type', type);
    }

    const records = await query;
    return records.map(this.mapToConsentRecord);
  }

  async hasConsent(
    customerId: string,
    channel: NotificationChannel,
    type: NotificationType,
    venueId?: string
  ): Promise<boolean> {
    const query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('channel', channel)
      .andWhere('type', type)
      .andWhere('status', 'granted')
      .andWhere(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', new Date());
      });

    if (venueId) {
      query.andWhere(function() {
        this.whereNull('venue_id')
          .orWhere('venue_id', venueId);
      });
    }

    const result = await query.first();
    return !!result;
  }

  async revoke(
    customerId: string,
    channel: NotificationChannel,
    type?: NotificationType,
    venueId?: string
  ): Promise<void> {
    const query = db(this.tableName)
      .where('customer_id', customerId)
      .andWhere('channel', channel)
      .andWhere('status', 'granted');

    if (type) {
      query.andWhere('type', type);
    }

    if (venueId) {
      query.andWhere('venue_id', venueId);
    }

    await query.update({
      status: 'revoked',
      revoked_at: new Date(),
      updated_at: new Date(),
    });

    logger.info('Consent revoked', { customerId, channel, type, venueId });
  }

  async getAuditTrail(customerId: string): Promise<ConsentRecord[]> {
    const records = await db(this.tableName)
      .where('customer_id', customerId)
      .orderBy('created_at', 'desc');
    
    return records.map(this.mapToConsentRecord);
  }

  private mapToConsentRecord(row: any): ConsentRecord {
    return {
      id: row.id,
      customerId: row.customer_id,
      venueId: row.venue_id,
      channel: row.channel,
      type: row.type,
      status: row.status,
      grantedAt: row.granted_at,
      revokedAt: row.revoked_at,
      expiresAt: row.expires_at,
      source: row.source,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }
}

export const consentModel = new ConsentModel();
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    venueId?: string;
    role?: string;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'No authorization token provided',
      });
      return;
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as any;

    req.user = {
      id: decoded.userId || decoded.id,
      email: decoded.email,
      venueId: decoded.venueId,
      role: decoded.role,
    };

    next();
  } catch (error: any) {
    logger.error('Authentication failed', error);
    
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
      return;
    }

    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: 'Token expired',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
};

export const optionalAuthMiddleware = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      req.user = {
        id: decoded.userId || decoded.id,
        email: decoded.email,
        venueId: decoded.venueId,
        role: decoded.role,
      };
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};
```

### FILE: src/providers/base.provider.ts
```typescript
export interface NotificationResult {
  id: string;
  status: 'sent' | 'failed' | 'queued' | 'delivered' | 'bounced';
  channel: 'email' | 'sms' | 'push';
  timestamp: string;
  provider: string;
  metadata?: Record<string, any>;
}

export interface BaseProviderConfig {
  apiKey?: string;
  apiSecret?: string;
  from?: string;
  region?: string;
  sandbox?: boolean;
  retryAttempts?: number;
  timeout?: number;
}

export abstract class BaseProvider {
  protected config: BaseProviderConfig;
  protected name: string;

  constructor(config: BaseProviderConfig = {}) {
    this.config = config;
    this.name = this.constructor.name;
  }

  abstract verify(): Promise<boolean>;
  abstract getStatus(): Promise<Record<string, any>>;
}
```

### FILE: src/providers/webhook.provider.ts
```typescript
import axios from 'axios';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface WebhookOptions {
  url: string;
  secret?: string;
  data: any;
  headers?: Record<string, string>;
}

class WebhookProvider {
  async send(options: WebhookOptions): Promise<NotificationResponse> {
    try {
      if (!env.ENABLE_WEBHOOK_DELIVERY) {
        logger.info('Webhook delivery disabled', { url: options.url });
        return {
          id: 'mock-webhook-' + Date.now(),
          status: 'sent',
          channel: 'webhook',
        };
      }

      // Generate signature if secret provided
      const signature = options.secret 
        ? this.generateSignature(options.data, options.secret)
        : undefined;

      const headers = {
        'Content-Type': 'application/json',
        'X-TicketToken-Signature': signature,
        'X-TicketToken-Timestamp': Date.now().toString(),
        ...options.headers,
      };

      const response = await axios.post(options.url, options.data, {
        headers,
        timeout: 10000,
      });

      logger.info('Webhook delivered successfully', {
        url: options.url,
        status: response.status,
      });

      return {
        id: 'webhook-' + Date.now(),
        status: 'delivered',
        channel: 'webhook',
        deliveredAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Failed to deliver webhook', {
        url: options.url,
        error: error.message,
      });

      return {
        id: 'webhook-' + Date.now(),
        status: 'failed',
        channel: 'webhook',
        failureReason: error.message,
      };
    }
  }

  private generateSignature(data: any, secret: string): string {
    const payload = JSON.stringify(data);
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  async validateWebhook(body: string, signature: string, secret: string): Promise<boolean> {
    const expectedSignature = this.generateSignature(JSON.parse(body), secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

export const webhookProvider = new WebhookProvider();
```

### FILE: src/providers/aws-sns.provider.ts
```typescript
// @ts-nocheck
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import AWS from 'aws-sdk';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface SNSSmsOptions {
  to: string;
  body: string;
  messageType?: 'Transactional' | 'Promotional';
}

class AWSSNSProvider {
  private sns: AWS.SNS;

  constructor() {
    this.sns = new AWS.SNS({
      region: env.AWS_REGION || 'us-east-1',
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    });
  }

  async send(options: SNSSmsOptions): Promise<NotificationResponse> {
    try {
      const params: AWS.SNS.PublishRequest = {
        Message: options.body,
        PhoneNumber: this.formatPhoneNumber(options.to),
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: options.messageType || 'Transactional',
          },
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: 'TicketToken',
          },
        },
      };

      const result = await this.sns.publish(params).promise();

      logger.info('SMS sent via AWS SNS', {
        messageId: result.MessageId,
        to: options.to,
      });

      return {
        id: result.MessageId!,
        status: 'sent',
        channel: 'sms',
        sentAt: new Date(),
        providerMessageId: result.MessageId,
        cost: 0.00645, // AWS SNS pricing for US
      };
    } catch (error: any) {
      logger.error('AWS SNS send failed', error);
      throw error;
    }
  }

  private formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }

  async setSMSAttributes(attributes: AWS.SNS.SetSMSAttributesInput): Promise<void> {
    await this.sns.setSMSAttributes(attributes).promise();
  }
}

export const awsSNSProvider = new AWSSNSProvider();
```

### FILE: src/providers/sms.provider.ts
```typescript
import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface SmsOptions {
  to: string;
  body: string;
  from?: string;
  mediaUrl?: string[];
}

class SmsProvider {
  private client: twilio.Twilio | null = null;

  constructor() {
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    }
  }

  async send(options: SmsOptions): Promise<NotificationResponse> {
    try {
      if (!env.ENABLE_SMS) {
        logger.info('SMS sending disabled', { to: options.to });
        return {
          id: 'mock-sms-' + Date.now(),
          status: 'sent',
          channel: 'sms',
        };
      }

      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      // Format phone number
      const toNumber = this.formatPhoneNumber(options.to);
      
      const message = await this.client.messages.create({
        body: options.body,
        to: toNumber,
        from: options.from || env.TWILIO_FROM_NUMBER,
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
        mediaUrl: options.mediaUrl,
      });

      logger.info('SMS sent successfully', {
        to: toNumber,
        sid: message.sid,
        status: message.status,
      });

      return {
        id: message.sid,
        status: this.mapTwilioStatus(message.status),
        channel: 'sms',
        sentAt: new Date(),
        providerMessageId: message.sid,
        cost: message.price ? Math.abs(parseFloat(message.price)) : 0.0079, // Approximate cost
      };
    } catch (error: any) {
      logger.error('Failed to send SMS', {
        to: options.to,
        error: error.message,
        code: error.code,
      });

      // Handle specific Twilio errors
      if (error.code === 20003) {
        throw new Error('Invalid Twilio credentials');
      }
      if (error.code === 21211) {
        throw new Error('Invalid phone number');
      }
      if (error.code === 21610) {
        throw new Error('Recipient has opted out of SMS');
      }

      throw error;
    }
  }

  async sendBulk(messages: SmsOptions[]): Promise<NotificationResponse[]> {
    const results: NotificationResponse[] = [];

    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const promises = batch.map(msg => this.send(msg));
      const batchResults = await Promise.allSettled(promises);
      
      results.push(...batchResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            id: 'failed-sms-' + Date.now() + '-' + index,
            status: 'failed' as const,
            channel: 'sms' as const,
            failureReason: result.reason.message,
          };
        }
      }));

      // Add delay between batches to respect rate limits
      if (i + batchSize < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');

    // Add US country code if not present
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }

    // Add + prefix if not present
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  private mapTwilioStatus(status: string): NotificationResponse['status'] {
    switch (status) {
      case 'queued':
      case 'accepted':
        return 'queued';
      case 'sending':
        return 'sending';
      case 'sent':
      case 'delivered':
        return 'delivered';
      case 'failed':
      case 'undelivered':
        return 'failed';
      default:
        return 'sent';
    }
  }

  async validatePhoneNumber(phone: string): Promise<boolean> {
    if (!this.client) {
      // Basic validation if Twilio is not configured
      const cleaned = phone.replace(/\D/g, '');
      return cleaned.length >= 10 && cleaned.length <= 15;
    }

    try {
      const lookup = await this.client.lookups.v1
        .phoneNumbers(phone)
        .fetch();
      
      return lookup.phoneNumber !== null;
    } catch (error) {
      logger.warn('Phone validation failed', { phone, error });
      return false;
    }
  }

  async getDeliveryStatus(messageSid: string): Promise<string> {
    if (!this.client) {
      throw new Error('Twilio client not initialized');
    }

    const message = await this.client.messages(messageSid).fetch();
    return message.status;
  }
}

export const smsProvider = new SmsProvider();
```

### FILE: src/providers/sms/base-sms.provider.ts
```typescript
import { BaseProvider, NotificationResult } from '../base.provider';

export interface SendSMSInput {
  to: string;
  message: string;
  from?: string;
  metadata?: Record<string, any>;
}

export abstract class BaseSMSProvider extends BaseProvider {
  abstract send(input: SendSMSInput): Promise<NotificationResult>;
  abstract sendBulk(inputs: SendSMSInput[]): Promise<NotificationResult[]>;
  
  protected validatePhoneNumber(phone: string): boolean {
    // E.164 format validation
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }
}
```

### FILE: src/providers/sms/sms.provider.ts
```typescript

export interface SendSMSInput { to:string; message:string; }
export class SMSProvider { async send(_i: SendSMSInput){ return { id:'stub-sms', status:'queued' as const, channel:'sms' as const }; } }
```

### FILE: src/providers/email/base-email.provider.ts
```typescript
import { BaseProvider, NotificationResult } from '../base.provider';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  tags?: string[];
  metadata?: Record<string, any>;
}

export abstract class BaseEmailProvider extends BaseProvider {
  abstract send(input: SendEmailInput): Promise<NotificationResult>;
  abstract sendBulk(inputs: SendEmailInput[]): Promise<NotificationResult[]>;
}
```

### FILE: src/providers/email/email.provider.ts
```typescript

export interface SendEmailInput { to:string; subject:string; html?:string; text?:string; from?:string; }
export class EmailProvider { async send(_i: SendEmailInput){ return { id:'stub-email', status:'queued' as const, channel:'email' as const }; } }
```

### FILE: src/providers/push/push.provider.ts
```typescript

export interface SendPushInput { token:string; title:string; body:string; data?: any; }
export class PushProvider { async send(_i: SendPushInput){ return { id:'stub-push', status:'queued' as const, channel:'push' as const }; } }
```

### FILE: src/providers/aws-ses.provider.ts
```typescript
// @ts-nocheck
import AWS from 'aws-sdk';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface SESEmailOptions {
  to: string | string[];
  from: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

class AWSSESProvider {
  private ses: AWS.SES;

  constructor() {
    this.ses = new AWS.SES({
      region: env.AWS_REGION || 'us-east-1',
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    });
  }

  async send(options: SESEmailOptions): Promise<NotificationResponse> {
    try {
      const params: AWS.SES.SendEmailRequest = {
        Source: options.from,
        Destination: {
          ToAddresses: Array.isArray(options.to) ? options.to : [options.to],
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Text: {
              Data: options.text,
              Charset: 'UTF-8',
            },
            ...(options.html && {
              Html: {
                Data: options.html,
                Charset: 'UTF-8',
              },
            }),
          },
        },
        ...(options.replyTo && { ReplyToAddresses: [options.replyTo] }),
      };

      const result = await this.ses.sendEmail(params).promise();

      logger.info('Email sent via AWS SES', {
        messageId: result.MessageId,
        to: options.to,
      });

      return {
        id: result.MessageId,
        status: 'sent',
        channel: 'email',
        sentAt: new Date(),
        providerMessageId: result.MessageId,
        cost: 0.0001, // AWS SES pricing
      };
    } catch (error: any) {
      logger.error('AWS SES send failed', error);
      throw error;
    }
  }

  async getQuota(): Promise<AWS.SES.GetSendQuotaResponse> {
    return await this.ses.getSendQuota().promise();
  }

  async verifyEmailIdentity(email: string): Promise<void> {
    await this.ses.verifyEmailIdentity({ EmailAddress: email }).promise();
  }
}

export const awsSESProvider = new AWSSESProvider();
```

### FILE: src/providers/email.provider.ts
```typescript
import sgMail from '@sendgrid/mail';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface EmailOptions {
  to: string;
  from: string;
  fromName?: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: Array<{
    content: string;
    filename: string;
    type?: string;
    disposition?: string;
  }>;
}

class EmailProvider {
  constructor() {
    if (env.SENDGRID_API_KEY) {
      sgMail.setApiKey(env.SENDGRID_API_KEY);
    }
  }

  async send(options: EmailOptions): Promise<NotificationResponse> {
    try {
      if (!env.ENABLE_EMAIL) {
        logger.info('Email sending disabled', { to: options.to });
        return {
          id: 'mock-' + Date.now(),
          status: 'sent',
          channel: 'email',
        };
      }

      const msg = {
        to: options.to,
        from: {
          email: options.from,
          name: options.fromName || env.SENDGRID_FROM_NAME,
        },
        subject: options.subject,
        text: options.text,
        html: options.html || options.text,
        replyTo: options.replyTo,
        attachments: options.attachments,
        trackingSettings: {
          clickTracking: {
            enable: true,
          },
          openTracking: {
            enable: true,
          },
        },
      };

      const [response] = await sgMail.send(msg);

      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        messageId: response.headers['x-message-id'],
      });

      return {
        id: response.headers['x-message-id'] || 'sg-' + Date.now(),
        status: 'sent',
        channel: 'email',
        sentAt: new Date(),
        providerMessageId: response.headers['x-message-id'],
        cost: 0.0001, // Approximate SendGrid cost per email
      };
    } catch (error: any) {
      logger.error('Failed to send email', {
        to: options.to,
        error: error.message,
        code: error.code,
      });

      // Handle specific SendGrid errors
      if (error.code === 401) {
        throw new Error('Invalid SendGrid API key');
      }

      if (error.response?.body?.errors) {
        const sgError = error.response.body.errors[0];
        throw new Error(sgError.message || 'SendGrid error');
      }

      throw error;
    }
  }

  async sendBulk(messages: EmailOptions[]): Promise<NotificationResponse[]> {
    // SendGrid supports up to 1000 recipients per request
    const chunks = this.chunkArray(messages, 1000);
    const results: NotificationResponse[] = [];

    for (const chunk of chunks) {
      const promises = chunk.map(msg => this.send(msg));
      const chunkResults = await Promise.allSettled(promises);
      
      results.push(...chunkResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            id: 'failed-' + Date.now() + '-' + index,
            status: 'failed' as const,
            channel: 'email' as const,
            failureReason: result.reason.message,
          };
        }
      }));
    }

    return results;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async validateEmail(email: string): Promise<boolean> {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export const emailProvider = new EmailProvider();
```

### FILE: src/services/automation.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { notificationServiceV2 } from './notification.service.v2';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';

interface AutomationTrigger {
  id: string;
  venueId: string;
  name: string;
  triggerType: 'event' | 'time' | 'behavior' | 'api';
  conditions: any;
  actions: any[];
  enabled: boolean;
}

export class AutomationService {
  private triggers: Map<string, cron.ScheduledTask> = new Map();

  async initializeAutomations() {
    const automations = await db('automation_triggers')
      .where('enabled', true);

    for (const automation of automations) {
      await this.setupTrigger(automation);
    }

    logger.info('Automations initialized', { count: automations.length });
  }

  async createAutomation(automation: {
    venueId: string;
    name: string;
    triggerType: AutomationTrigger['triggerType'];
    conditions: any;
    actions: any[];
  }): Promise<string> {
    const id = uuidv4();

    await db('automation_triggers').insert({
      id,
      venue_id: automation.venueId,
      name: automation.name,
      trigger_type: automation.triggerType,
      conditions: JSON.stringify(automation.conditions),
      actions: JSON.stringify(automation.actions),
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await this.setupTrigger({
      id,
      ...automation,
      enabled: true,
    });

    logger.info('Automation created', { id, name: automation.name });
    return id;
  }

  private async setupTrigger(trigger: any) {
    switch (trigger.trigger_type || trigger.triggerType) {
      case 'time':
        this.setupTimeTrigger(trigger);
        break;
      case 'event':
        this.setupEventTrigger(trigger);
        break;
      case 'behavior':
        this.setupBehaviorTrigger(trigger);
        break;
    }
  }

  private setupTimeTrigger(trigger: any) {
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    if (conditions.cronExpression) {
      const task = cron.schedule(conditions.cronExpression, async () => {
        await this.executeActions(trigger);
      });

      this.triggers.set(trigger.id, task);
      logger.info('Time trigger scheduled', { 
        id: trigger.id, 
        cron: conditions.cronExpression 
      });
    }
  }

  private setupEventTrigger(trigger: any) {
    // Register event listener for specific events
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    // This would integrate with your event system
    logger.info('Event trigger registered', { 
      id: trigger.id, 
      event: conditions.eventName 
    });
  }

  private setupBehaviorTrigger(trigger: any) {
    // Set up behavior-based triggers
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    // Examples:
    // - Customer hasn't purchased in 30 days
    // - Customer viewed event 3 times
    // - Cart abandoned for 2 hours
    
    logger.info('Behavior trigger configured', { 
      id: trigger.id, 
      behavior: conditions.behaviorType 
    });
  }

  private async executeActions(trigger: any) {
    const actions = typeof trigger.actions === 'string' 
      ? JSON.parse(trigger.actions) 
      : trigger.actions;

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'send_notification':
            await this.executeSendNotification(trigger.venue_id, action);
            break;
          case 'update_customer':
            await this.executeUpdateCustomer(action);
            break;
          case 'webhook':
            await this.executeWebhook(action);
            break;
          case 'delay':
            await this.executeDelay(action);
            break;
        }
      } catch (error) {
        logger.error('Failed to execute automation action', {
          triggerId: trigger.id,
          action: action.type,
          error,
        });
      }
    }

    // Log execution
    await db('automation_executions').insert({
      id: uuidv4(),
      trigger_id: trigger.id,
      executed_at: new Date(),
      status: 'completed',
    });
  }

  private async executeSendNotification(venueId: string, action: any) {
    const recipients = await this.getActionRecipients(action);
    
    for (const recipient of recipients) {
      await notificationServiceV2.send({
        venueId,
        recipientId: recipient.id,
        recipient,
        channel: action.channel || 'email',
        type: 'transactional',
        template: action.template,
        priority: action.priority || 'normal',
        data: action.data || {},
      });
    }
  }

  private async executeUpdateCustomer(action: any) {
    // Update customer attributes
    logger.info('Updating customer', action);
  }

  private async executeWebhook(action: any) {
    // Call external webhook
    logger.info('Calling webhook', { url: action.url });
  }

  private async executeDelay(action: any) {
    const delay = action.duration || 60000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async getActionRecipients(action: any): Promise<any[]> {
    // Get recipients based on action criteria
    if (action.recipientQuery) {
      // Execute dynamic query
      return [];
    }

    if (action.recipientIds) {
      // Get specific recipients
      return action.recipientIds.map((id: string) => ({
        id,
        email: `${id}@example.com`, // Would fetch from DB
      }));
    }

    return [];
  }

  // Behavioral trigger checks
  async checkAbandonedCarts() {
    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

    // Find abandoned carts
    const abandonedCarts = await db('shopping_carts')
      .where('status', 'active')
      .where('updated_at', '<', twoHoursAgo)
      .whereNull('completed_at');

    for (const cart of abandonedCarts) {
      // Trigger abandoned cart automation
      const triggers = await db('automation_triggers')
        .where('trigger_type', 'behavior')
        .whereRaw(`conditions->>'behaviorType' = 'cart_abandoned'`)
        .where('venue_id', cart.venue_id)
        .where('enabled', true);

      for (const trigger of triggers) {
        await this.executeActions(trigger);
      }
    }
  }

  async checkReEngagement() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find inactive customers
    const inactiveCustomers = await db('customers')
      .where('last_activity_at', '<', thirtyDaysAgo)
      .whereNotIn('id', function() {
        this.select('customer_id')
          .from('suppression_list')
          .where('channel', 'all');
      });

    logger.info('Found inactive customers', { count: inactiveCustomers.length });
    // Trigger re-engagement campaigns
  }
}

export const automationService = new AutomationService();
```

### FILE: src/services/preference-manager.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import * as crypto from 'crypto';

export interface UserPreferences {
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  
  // Category preferences
  emailPayment: boolean;
  emailMarketing: boolean;
  emailEventUpdates: boolean;
  emailAccount: boolean;
  
  smsCriticalOnly: boolean;
  smsPayment: boolean;
  smsEventReminders: boolean;
  
  pushPayment: boolean;
  pushEventUpdates: boolean;
  pushMarketing: boolean;
  
  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;
  
  // Limits
  maxEmailsPerDay: number;
  maxSmsPerDay: number;
  
  unsubscribeToken?: string;
  unsubscribedAt?: Date;
}

export class PreferenceManager {
  private cache: Map<string, UserPreferences> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes
  
  async getPreferences(userId: string): Promise<UserPreferences> {
    // Check cache first
    if (this.cache.has(userId)) {
      const cached = this.cache.get(userId)!;
      return cached;
    }
    
    // Get from database
    let prefs = await db('notification_preferences')
      .where('user_id', userId)
      .first();
    
    // Create default preferences if not exists
    if (!prefs) {
      prefs = await this.createDefaultPreferences(userId);
    }
    
    const preferences = this.mapToPreferences(prefs);
    
    // Cache it
    this.cache.set(userId, preferences);
    setTimeout(() => this.cache.delete(userId), this.CACHE_TTL);
    
    return preferences;
  }
  
  async updatePreferences(
    userId: string, 
    updates: Partial<UserPreferences>,
    changedBy?: string,
    reason?: string
  ): Promise<UserPreferences> {
    // Record current state for history
    const current = await this.getPreferences(userId);
    
    // Map updates to database columns
    const dbUpdates = this.mapToDatabase(updates);
    
    // Update database
    const [updated] = await db('notification_preferences')
      .where('user_id', userId)
      .update({
        ...dbUpdates,
        updated_at: new Date()
      })
      .returning('*');
    
    // Record history
    await this.recordHistory(userId, current, updates, changedBy, reason);
    
    // Clear cache
    this.cache.delete(userId);
    
    const newPrefs = this.mapToPreferences(updated);
    
    logger.info('Preferences updated', {
      userId,
      changes: Object.keys(updates)
    });
    
    return newPrefs;
  }
  
  async canSendNotification(
    userId: string,
    channel: 'email' | 'sms' | 'push',
    type: string
  ): Promise<boolean> {
    const prefs = await this.getPreferences(userId);
    
    // Check if completely unsubscribed
    if (prefs.unsubscribedAt) {
      return false;
    }
    
    // Check channel enabled
    if (channel === 'email' && !prefs.emailEnabled) return false;
    if (channel === 'sms' && !prefs.smsEnabled) return false;
    if (channel === 'push' && !prefs.pushEnabled) return false;
    
    // Check category preferences
    if (channel === 'email') {
      if (type === 'payment' && !prefs.emailPayment) return false;
      if (type === 'marketing' && !prefs.emailMarketing) return false;
      if (type === 'event_update' && !prefs.emailEventUpdates) return false;
      if (type === 'account' && !prefs.emailAccount) return false;
    }
    
    if (channel === 'sms') {
      if (prefs.smsCriticalOnly && !this.isCritical(type)) return false;
      if (type === 'payment' && !prefs.smsPayment) return false;
      if (type === 'event_reminder' && !prefs.smsEventReminders) return false;
    }
    
    if (channel === 'push') {
      if (type === 'payment' && !prefs.pushPayment) return false;
      if (type === 'event_update' && !prefs.pushEventUpdates) return false;
      if (type === 'marketing' && !prefs.pushMarketing) return false;
    }
    
    // Check quiet hours
    if (prefs.quietHoursEnabled && this.isQuietHours(prefs)) {
      if (!this.isCritical(type)) {
        return false;
      }
    }
    
    // Check daily limits
    const todayCount = await this.getTodayCount(userId, channel);
    if (channel === 'email' && todayCount >= prefs.maxEmailsPerDay) return false;
    if (channel === 'sms' && todayCount >= prefs.maxSmsPerDay) return false;
    
    return true;
  }
  
  async unsubscribe(token: string): Promise<boolean> {
    const [updated] = await db('notification_preferences')
      .where('unsubscribe_token', token)
      .update({
        email_enabled: false,
        sms_enabled: false,
        push_enabled: false,
        unsubscribed_at: new Date(),
        updated_at: new Date()
      })
      .returning('user_id');
    
    if (updated) {
      this.cache.delete(updated.user_id);
      logger.info('User unsubscribed', { userId: updated.user_id });
      return true;
    }
    
    return false;
  }
  
  async generateUnsubscribeLink(userId: string): Promise<string> {
    const prefs = await this.getPreferences(userId);
    const baseUrl = process.env.FRONTEND_URL || 'https://app.tickettoken.com';
    return `${baseUrl}/unsubscribe/${prefs.unsubscribeToken}`;
  }
  
  private async createDefaultPreferences(userId: string): Promise<any> {
    const [created] = await db('notification_preferences')
      .insert({
        user_id: userId,
        unsubscribe_token: crypto.randomBytes(32).toString('hex'),
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    return created;
  }
  
  private mapToPreferences(row: any): UserPreferences {
    return {
      userId: row.user_id,
      emailEnabled: row.email_enabled,
      smsEnabled: row.sms_enabled,
      pushEnabled: row.push_enabled,
      
      emailPayment: row.email_payment,
      emailMarketing: row.email_marketing,
      emailEventUpdates: row.email_event_updates,
      emailAccount: row.email_account,
      
      smsCriticalOnly: row.sms_critical_only,
      smsPayment: row.sms_payment,
      smsEventReminders: row.sms_event_reminders,
      
      pushPayment: row.push_payment,
      pushEventUpdates: row.push_event_updates,
      pushMarketing: row.push_marketing,
      
      quietHoursEnabled: row.quiet_hours_enabled,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      timezone: row.timezone,
      
      maxEmailsPerDay: row.max_emails_per_day,
      maxSmsPerDay: row.max_sms_per_day,
      
      unsubscribeToken: row.unsubscribe_token,
      unsubscribedAt: row.unsubscribed_at
    };
  }
  
  private mapToDatabase(prefs: Partial<UserPreferences>): any {
    const mapped: any = {};
    
    if (prefs.emailEnabled !== undefined) mapped.email_enabled = prefs.emailEnabled;
    if (prefs.smsEnabled !== undefined) mapped.sms_enabled = prefs.smsEnabled;
    if (prefs.pushEnabled !== undefined) mapped.push_enabled = prefs.pushEnabled;
    
    if (prefs.emailPayment !== undefined) mapped.email_payment = prefs.emailPayment;
    if (prefs.emailMarketing !== undefined) mapped.email_marketing = prefs.emailMarketing;
    if (prefs.emailEventUpdates !== undefined) mapped.email_event_updates = prefs.emailEventUpdates;
    if (prefs.emailAccount !== undefined) mapped.email_account = prefs.emailAccount;
    
    if (prefs.smsCriticalOnly !== undefined) mapped.sms_critical_only = prefs.smsCriticalOnly;
    if (prefs.smsPayment !== undefined) mapped.sms_payment = prefs.smsPayment;
    if (prefs.smsEventReminders !== undefined) mapped.sms_event_reminders = prefs.smsEventReminders;
    
    if (prefs.pushPayment !== undefined) mapped.push_payment = prefs.pushPayment;
    if (prefs.pushEventUpdates !== undefined) mapped.push_event_updates = prefs.pushEventUpdates;
    if (prefs.pushMarketing !== undefined) mapped.push_marketing = prefs.pushMarketing;
    
    if (prefs.quietHoursEnabled !== undefined) mapped.quiet_hours_enabled = prefs.quietHoursEnabled;
    if (prefs.quietHoursStart !== undefined) mapped.quiet_hours_start = prefs.quietHoursStart;
    if (prefs.quietHoursEnd !== undefined) mapped.quiet_hours_end = prefs.quietHoursEnd;
    if (prefs.timezone !== undefined) mapped.timezone = prefs.timezone;
    
    if (prefs.maxEmailsPerDay !== undefined) mapped.max_emails_per_day = prefs.maxEmailsPerDay;
    if (prefs.maxSmsPerDay !== undefined) mapped.max_sms_per_day = prefs.maxSmsPerDay;
    
    return mapped;
  }
  
  private async recordHistory(
    userId: string,
    before: UserPreferences,
    after: Partial<UserPreferences>,
    changedBy?: string,
    reason?: string
  ): Promise<void> {
    const changes: any = {};
    
    for (const [key, value] of Object.entries(after)) {
      if ((before as any)[key] !== value) {
        changes[key] = {
          from: (before as any)[key],
          to: value
        };
      }
    }
    
    if (Object.keys(changes).length > 0) {
      await db('notification_preference_history').insert({
        user_id: userId,
        changed_by: changedBy,
        changes: JSON.stringify(changes),
        reason,
        created_at: new Date()
      });
    }
  }
  
  private isQuietHours(prefs: UserPreferences): boolean {
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) {
      return false;
    }
    
    // Convert to user's timezone and check
    // For now, simple implementation
    const now = new Date();
    const currentHour = now.getHours();
    const startHour = parseInt(prefs.quietHoursStart.split(':')[0]);
    const endHour = parseInt(prefs.quietHoursEnd.split(':')[0]);
    
    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Overnight quiet hours
      return currentHour >= startHour || currentHour < endHour;
    }
  }
  
  private isCritical(type: string): boolean {
    return ['payment_failed', 'account_security', 'urgent'].includes(type);
  }
  
  private async getTodayCount(userId: string, channel: string): Promise<number> {
    const result = await db('notification_history')
      .where('user_id', userId)
      .where('channel', channel)
      .where('created_at', '>=', new Date(new Date().setHours(0, 0, 0, 0)))
      .count('id as count')
      .first();
    
    return Number(result?.count) || 0;
  }
}

export const preferenceManager = new PreferenceManager();
```

### FILE: src/services/analytics.service.ts
```typescript
import { db } from '../config/database';
import { redisHelper } from '../config/redis';

interface DeliveryMetrics {
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  bounceRate: number;
  failureRate: number;
}

interface EngagementMetrics {
  opened: number;
  clicked: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
}

interface CostMetrics {
  totalCost: number;
  emailCost: number;
  smsCost: number;
  costPerRecipient: number;
  costByVenue: Record<string, number>;
}

export class NotificationAnalyticsService {
  async getDeliveryMetrics(
    venueId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DeliveryMetrics> {
    let query = db('notification_tracking');

    if (venueId) {
      query = query.where('venue_id', venueId);
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const statusCounts = await query
      .select('status')
      .count('* as count')
      .groupBy('status');

    const metrics: DeliveryMetrics = {
      sent: 0,
      delivered: 0,
      bounced: 0,
      failed: 0,
      pending: 0,
      deliveryRate: 0,
      bounceRate: 0,
      failureRate: 0,
    };

    let total = 0;
    for (const row of statusCounts) {
      const count = parseInt(row.count as string);
      total += count;

      switch (row.status) {
        case 'sent':
          metrics.sent = count;
          break;
        case 'delivered':
          metrics.delivered = count;
          break;
        case 'bounced':
          metrics.bounced = count;
          break;
        case 'failed':
          metrics.failed = count;
          break;
        case 'pending':
        case 'queued':
          metrics.pending += count;
          break;
      }
    }

    if (total > 0) {
      metrics.deliveryRate = (metrics.delivered / total) * 100;
      metrics.bounceRate = (metrics.bounced / total) * 100;
      metrics.failureRate = (metrics.failed / total) * 100;
    }

    // Cache metrics for dashboard
    await redisHelper.setWithTTL(
      `metrics:delivery:${venueId || 'all'}`,
      metrics,
      300 // 5 minutes
    );

    return metrics;
  }

  async getEngagementMetrics(
    venueId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<EngagementMetrics> {
    let query = db('notification_tracking');

    if (venueId) {
      query = query.where('venue_id', venueId);
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const total = await query.clone().count('* as count').first();
    const opened = await query.clone().whereNotNull('opened_at').count('* as count').first();
    const clicked = await query.clone().whereNotNull('clicked_at').count('* as count').first();

    const totalCount = parseInt(total?.count as string || '0');
    const openedCount = parseInt(opened?.count as string || '0');
    const clickedCount = parseInt(clicked?.count as string || '0');

    const metrics: EngagementMetrics = {
      opened: openedCount,
      clicked: clickedCount,
      unsubscribed: 0, // Would need to track this separately
      openRate: totalCount > 0 ? (openedCount / totalCount) * 100 : 0,
      clickRate: totalCount > 0 ? (clickedCount / totalCount) * 100 : 0,
      clickToOpenRate: openedCount > 0 ? (clickedCount / openedCount) * 100 : 0,
    };

    return metrics;
  }

  async getCostMetrics(
    venueId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<CostMetrics> {
    let query = db('notification_costs');

    if (venueId) {
      query = query.where('venue_id', venueId);
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const costs = await query.select('channel', 'venue_id').sum('cost as total').groupBy('channel', 'venue_id');

    const metrics: CostMetrics = {
      totalCost: 0,
      emailCost: 0,
      smsCost: 0,
      costPerRecipient: 0,
      costByVenue: {},
    };

    for (const row of costs) {
      const cost = parseFloat(row.total as string || '0');
      metrics.totalCost += cost;

      if (row.channel === 'email') {
        metrics.emailCost += cost;
      } else if (row.channel === 'sms') {
        metrics.smsCost += cost;
      }

      if (row.venue_id) {
        metrics.costByVenue[row.venue_id] =
          (metrics.costByVenue[row.venue_id] || 0) + cost;
      }
    }

    // Calculate cost per recipient
    const recipientCount = await db('notification_tracking')
      .modify((qb) => {
        if (venueId) qb.where('venue_id', venueId);
        if (startDate) qb.where('created_at', '>=', startDate);
        if (endDate) qb.where('created_at', '<=', endDate);
      })
      .countDistinct('recipient_id as count')
      .first();

    const recipients = parseInt(recipientCount?.count as string || '1');
    metrics.costPerRecipient = metrics.totalCost / recipients;

    return metrics;
  }

  async getVenueHealthScore(venueId: string): Promise<number> {
    // Calculate a health score based on various metrics
    const delivery = await this.getDeliveryMetrics(venueId);
    const engagement = await this.getEngagementMetrics(venueId);

    let score = 100;

    // Deduct points for poor metrics
    if (delivery.bounceRate > 5) score -= 10;
    if (delivery.bounceRate > 10) score -= 20;
    if (delivery.failureRate > 5) score -= 10;
    if (engagement.openRate < 20) score -= 10;
    if (engagement.clickRate < 2) score -= 10;

    // Bonus points for good metrics
    if (delivery.deliveryRate > 95) score += 5;
    if (engagement.openRate > 30) score += 5;
    if (engagement.clickRate > 5) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  async getTimeSeriesMetrics(
    venueId: string,
    metric: 'sent' | 'delivered' | 'opened' | 'clicked',
    period: 'hour' | 'day' | 'week' | 'month',
    startDate: Date,
    endDate: Date
  ) {
    // SECURITY FIX: Use whitelist approach for date truncation
    const periodFunctions: Record<string, string> = {
      hour: "date_trunc('hour', created_at)",
      day: "date_trunc('day', created_at)",
      week: "date_trunc('week', created_at)",
      month: "date_trunc('month', created_at)",
    };

    // Validate period parameter is in whitelist
    if (!periodFunctions[period]) {
      throw new Error(`Invalid period: ${period}. Must be one of: hour, day, week, month`);
    }

    // Validate metric parameter is in allowed list
    const allowedMetrics = ['sent', 'delivered', 'opened', 'clicked'];
    if (!allowedMetrics.includes(metric)) {
      throw new Error(`Invalid metric: ${metric}. Must be one of: ${allowedMetrics.join(', ')}`);
    }

    const truncateFunc = periodFunctions[period];

    let query = db('notification_tracking')
      .select(db.raw(`${truncateFunc} as period`))
      .where('venue_id', venueId)
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .groupBy('period')
      .orderBy('period');

    switch (metric) {
      case 'sent':
        query = query.count('* as value').where('status', 'sent');
        break;
      case 'delivered':
        query = query.count('* as value').where('status', 'delivered');
        break;
      case 'opened':
        query = query.count('* as value').whereNotNull('opened_at');
        break;
      case 'clicked':
        query = query.count('* as value').whereNotNull('clicked_at');
        break;
    }

    const results = await query;

    return results.map(row => ({
      period: row.period,
      value: parseInt(row.value as string),
    }));
  }

  async getTopPerformingTemplates(
    venueId?: string,
    limit: number = 10
  ) {
    let query = db('notification_tracking')
      .select('template')
      .count('* as total')
      .sum(db.raw('CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END as opens'))
      .sum(db.raw('CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END as clicks'))
      .groupBy('template')
      .orderBy('opens', 'desc')
      .limit(limit);

    if (venueId) {
      query = query.where('venue_id', venueId);
    }

    const results = await query;

    return results.map(row => ({
      template: row.template,
      total: parseInt(row.total as string),
      opens: parseInt(row.opens as string || '0'),
      clicks: parseInt(row.clicks as string || '0'),
      openRate: parseInt(row.total as string) > 0
        ? (parseInt(row.opens as string || '0') / parseInt(row.total as string)) * 100
        : 0,
      clickRate: parseInt(row.total as string) > 0
        ? (parseInt(row.clicks as string || '0') / parseInt(row.total as string)) * 100
        : 0,
    }));
  }

  async generateComplianceReport(
    venueId: string,
    startDate: Date,
    endDate: Date
  ) {
    // Consent metrics
    const consentGranted = await db('consent_records')
      .where('venue_id', venueId)
      .where('status', 'granted')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .count('* as count')
      .first();

    const consentRevoked = await db('consent_records')
      .where('venue_id', venueId)
      .where('status', 'revoked')
      .where('updated_at', '>=', startDate)
      .where('updated_at', '<=', endDate)
      .count('* as count')
      .first();

    // Suppression metrics
    const suppressions = await db('suppression_list')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .count('* as count')
      .first();

    // Bounce metrics
    const bounces = await db('bounces')
      .where('bounced_at', '>=', startDate)
      .where('bounced_at', '<=', endDate)
      .select('bounce_type')
      .count('* as count')
      .groupBy('bounce_type');

    // Failed consent checks
    const failedConsent = await db('notification_tracking')
      .where('venue_id', venueId)
      .where('status', 'failed')
      .where('failure_reason', 'like', '%consent%')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .count('* as count')
      .first();

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      consent: {
        granted: parseInt(consentGranted?.count as string || '0'),
        revoked: parseInt(consentRevoked?.count as string || '0'),
      },
      suppressions: parseInt(suppressions?.count as string || '0'),
      bounces: bounces.reduce((acc, row) => {
        acc[row.bounce_type as string] = parseInt(row.count as string);
        return acc;
      }, {} as Record<string, number>),
      blockedByConsent: parseInt(failedConsent?.count as string || '0'),
    };
  }
}

export const notificationAnalytics = new NotificationAnalyticsService();
```

### FILE: src/services/preference.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

interface CustomerPreferences {
  customerId: string;
  email: {
    enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly' | 'monthly';
    categories: string[];
  };
  sms: {
    enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly' | 'monthly';
    categories: string[];
  };
  timezone: string;
  language: string;
  quietHours: {
    enabled: boolean;
    start: number;
    end: number;
  };
}

export class PreferenceService {
  async getPreferences(customerId: string): Promise<CustomerPreferences> {
    const prefs = await db('customer_preferences')
      .where('customer_id', customerId)
      .first();

    if (!prefs) {
      // Return defaults
      return this.getDefaultPreferences(customerId);
    }

    return {
      customerId: prefs.customer_id,
      email: JSON.parse(prefs.email_preferences),
      sms: JSON.parse(prefs.sms_preferences),
      timezone: prefs.timezone,
      language: prefs.language,
      quietHours: JSON.parse(prefs.quiet_hours),
    };
  }

  async updatePreferences(
    customerId: string,
    updates: Partial<CustomerPreferences>
  ): Promise<void> {
    const existing = await db('customer_preferences')
      .where('customer_id', customerId)
      .first();

    if (existing) {
      await db('customer_preferences')
        .where('customer_id', customerId)
        .update({
          email_preferences: updates.email ? JSON.stringify(updates.email) : existing.email_preferences,
          sms_preferences: updates.sms ? JSON.stringify(updates.sms) : existing.sms_preferences,
          timezone: updates.timezone || existing.timezone,
          language: updates.language || existing.language,
          quiet_hours: updates.quietHours ? JSON.stringify(updates.quietHours) : existing.quiet_hours,
          updated_at: new Date(),
        });
    } else {
      const defaults = this.getDefaultPreferences(customerId);
      const merged = { ...defaults, ...updates };

      await db('customer_preferences').insert({
        id: uuidv4(),
        customer_id: customerId,
        email_preferences: JSON.stringify(merged.email),
        sms_preferences: JSON.stringify(merged.sms),
        timezone: merged.timezone,
        language: merged.language,
        quiet_hours: JSON.stringify(merged.quietHours),
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    logger.info('Customer preferences updated', { customerId });
  }

  async getUnsubscribeToken(customerId: string): Promise<string> {
    const token = Buffer.from(
      JSON.stringify({
        customerId,
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
      })
    ).toString('base64url');

    return token;
  }

  async processUnsubscribe(token: string, channel?: 'email' | 'sms'): Promise<void> {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      
      if (decoded.expires < Date.now()) {
        throw new Error('Unsubscribe link expired');
      }

      const preferences = await this.getPreferences(decoded.customerId);
      
      if (channel) {
        preferences[channel].enabled = false;
      } else {
        // Unsubscribe from all
        preferences.email.enabled = false;
        preferences.sms.enabled = false;
      }

      await this.updatePreferences(decoded.customerId, preferences);

      // Add to suppression list
      await db('suppression_list').insert({
        id: uuidv4(),
        identifier: decoded.customerId,
        identifier_hash: decoded.customerId, // Should be hashed in production
        channel: channel || 'all',
        reason: 'customer_unsubscribe',
        suppressed_at: new Date(),
        created_at: new Date(),
      });

      logger.info('Customer unsubscribed', { 
        customerId: decoded.customerId, 
        channel 
      });
    } catch (error) {
      logger.error('Failed to process unsubscribe', { token, error });
      throw error;
    }
  }

  private getDefaultPreferences(customerId: string): CustomerPreferences {
    return {
      customerId,
      email: {
        enabled: true,
        frequency: 'immediate',
        categories: ['transactional', 'marketing'],
      },
      sms: {
        enabled: true,
        frequency: 'immediate',
        categories: ['transactional'],
      },
      timezone: 'America/Chicago',
      language: 'en',
      quietHours: {
        enabled: false,
        start: 22,
        end: 8,
      },
    };
  }

  async exportCustomerData(customerId: string): Promise<any> {
    // GDPR compliance - export all customer notification data
    const [
      preferences,
      consents,
      notifications,
      engagements,
    ] = await Promise.all([
      this.getPreferences(customerId),
      db('consent_records').where('customer_id', customerId),
      db('notification_tracking').where('recipient_id', customerId).limit(100),
      db('engagement_events')
        .join('notification_tracking', 'engagement_events.notification_id', 'notification_tracking.id')
        .where('notification_tracking.recipient_id', customerId)
        .select('engagement_events.*'),
    ]);

    return {
      exportDate: new Date(),
      customerId,
      preferences,
      consents,
      notificationHistory: notifications,
      engagementHistory: engagements,
    };
  }
}

export const preferenceService = new PreferenceService();
```

### FILE: src/services/wallet-pass.service.ts
```typescript
import { logger } from '../config/logger';
import crypto from 'crypto';
import QRCode from 'qrcode';

interface WalletPassData {
  eventName: string;
  venueName: string;
  venueAddress: string;
  eventDate: Date;
  ticketId: string;
  seatInfo?: string;
  customerName: string;
  qrCodeData: string;
}

export class WalletPassService {
  async generateApplePass(data: WalletPassData): Promise<Buffer> {
    try {
      // Apple Wallet pass structure
      const pass = {
        formatVersion: 1,
        passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID || 'pass.com.tickettoken',
        serialNumber: data.ticketId,
        teamIdentifier: process.env.APPLE_TEAM_ID || 'ABCDE12345',
        organizationName: 'TicketToken',
        description: `Ticket for ${data.eventName}`,
        foregroundColor: 'rgb(255, 255, 255)',
        backgroundColor: 'rgb(60, 65, 76)',
        labelColor: 'rgb(255, 255, 255)',
        
        eventTicket: {
          primaryFields: [
            {
              key: 'event',
              label: 'EVENT',
              value: data.eventName,
            },
          ],
          secondaryFields: [
            {
              key: 'loc',
              label: 'VENUE',
              value: data.venueName,
            },
            {
              key: 'date',
              label: 'DATE',
              value: this.formatDate(data.eventDate),
              dateStyle: 'PKDateStyleMedium',
              timeStyle: 'PKDateStyleShort',
            },
          ],
          auxiliaryFields: data.seatInfo ? [
            {
              key: 'seat',
              label: 'SEAT',
              value: data.seatInfo,
            },
            {
              key: 'name',
              label: 'ATTENDEE',
              value: data.customerName,
            },
          ] : [
            {
              key: 'name',
              label: 'ATTENDEE',
              value: data.customerName,
            },
          ],
          backFields: [
            {
              key: 'terms',
              label: 'TERMS & CONDITIONS',
              value: 'This ticket is non-transferable. Valid ID required.',
            },
            {
              key: 'venue-address',
              label: 'VENUE ADDRESS',
              value: data.venueAddress,
            },
          ],
        },
        
        barcode: {
          format: 'PKBarcodeFormatQR',
          message: data.qrCodeData,
          messageEncoding: 'iso-8859-1',
        },
        
        relevantDate: data.eventDate.toISOString(),
      };

      // In production, this would:
      // 1. Create pass.json
      // 2. Generate manifest.json with file hashes
      // 3. Sign the manifest
      // 4. Create .pkpass file (zip archive)
      
      // For now, return mock buffer
      return Buffer.from(JSON.stringify(pass));
    } catch (error) {
      logger.error('Failed to generate Apple Pass', error);
      throw error;
    }
  }

  async generateGooglePass(data: WalletPassData): Promise<string> {
    try {
      // Google Wallet pass structure
      const jwt = {
        iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        payload: {
          eventTicketObjects: [
            {
              id: `${process.env.GOOGLE_ISSUER_ID}.${data.ticketId}`,
              classId: `${process.env.GOOGLE_ISSUER_ID}.event_ticket_class`,
              state: 'ACTIVE',
              ticketHolderName: data.customerName,
              ticketNumber: data.ticketId,
              barcode: {
                type: 'QR_CODE',
                value: data.qrCodeData,
              },
              eventName: {
                defaultValue: {
                  language: 'en-US',
                  value: data.eventName,
                },
              },
              venue: {
                name: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.venueName,
                  },
                },
                address: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.venueAddress,
                  },
                },
              },
              dateTime: {
                start: data.eventDate.toISOString(),
              },
              seatInfo: data.seatInfo ? {
                seat: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.seatInfo,
                  },
                },
              } : undefined,
            },
          ],
        },
      };

      // In production, sign JWT with Google service account
      // For now, return the save URL
      const token = Buffer.from(JSON.stringify(jwt)).toString('base64url');
      return `https://pay.google.com/gp/v/save/${token}`;
    } catch (error) {
      logger.error('Failed to generate Google Pass', error);
      throw error;
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async generatePassQRCode(ticketId: string): Promise<string> {
    const data = {
      ticketId,
      validationUrl: `${process.env.API_URL}/validate/${ticketId}`,
      timestamp: Date.now(),
    };

    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'secret')
      .update(JSON.stringify(data))
      .digest('hex');

    const qrData = {
      ...data,
      signature,
    };

    return await QRCode.toDataURL(JSON.stringify(qrData));
  }
}

export const walletPassService = new WalletPassService();
```

### FILE: src/services/rate-limiter.ts
```typescript
import Redis from 'ioredis';
import { logger } from '../config/logger';

interface RateLimitConfig {
  max: number;           // Maximum requests
  duration: number;      // Time window in seconds
  keyPrefix?: string;    // Redis key prefix
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // Seconds until retry
}

export class RateLimiter {
  private redis: Redis;
  private configs: Map<string, RateLimitConfig>;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });
    
    this.configs = new Map();
    this.initializeConfigs();
  }
  
  private initializeConfigs() {
    // Per-user rate limits
    this.configs.set('email:user', {
      max: parseInt(process.env.RATE_LIMIT_EMAIL_PER_HOUR || '20'),
      duration: 3600, // 1 hour
      keyPrefix: 'rl:email:user:'
    });
    
    this.configs.set('sms:user', {
      max: parseInt(process.env.RATE_LIMIT_SMS_PER_HOUR || '5'),
      duration: 3600, // 1 hour
      keyPrefix: 'rl:sms:user:'
    });
    
    this.configs.set('push:user', {
      max: parseInt(process.env.RATE_LIMIT_PUSH_PER_HOUR || '50'),
      duration: 3600, // 1 hour
      keyPrefix: 'rl:push:user:'
    });
    
    // Global rate limits
    this.configs.set('email:global', {
      max: parseInt(process.env.RATE_LIMIT_GLOBAL_EMAIL_PER_MIN || '1000'),
      duration: 60, // 1 minute
      keyPrefix: 'rl:email:global'
    });
    
    this.configs.set('sms:global', {
      max: parseInt(process.env.RATE_LIMIT_GLOBAL_SMS_PER_MIN || '100'),
      duration: 60, // 1 minute
      keyPrefix: 'rl:sms:global'
    });
    
    // API endpoint rate limits
    this.configs.set('api:send', {
      max: 100,
      duration: 60, // 100 requests per minute
      keyPrefix: 'rl:api:send:'
    });
    
    this.configs.set('api:preferences', {
      max: 50,
      duration: 60, // 50 requests per minute
      keyPrefix: 'rl:api:pref:'
    });
  }
  
  async checkLimit(
    type: string,
    identifier: string = 'global'
  ): Promise<RateLimitResult> {
    const config = this.configs.get(type);
    
    if (!config) {
      // No rate limit configured, allow
      return {
        allowed: true,
        remaining: Infinity,
        resetAt: new Date(Date.now() + 3600000)
      };
    }
    
    const key = `${config.keyPrefix}${identifier}`;
    const now = Date.now();
    const windowStart = now - (config.duration * 1000);
    
    try {
      // Use Redis sorted set for sliding window
      const pipe = this.redis.pipeline();
      
      // Remove old entries outside the window
      pipe.zremrangebyscore(key, '-inf', windowStart);
      
      // Count current entries in window
      pipe.zcard(key);
      
      // Add current request
      pipe.zadd(key, now, `${now}-${Math.random()}`);
      
      // Set expiry
      pipe.expire(key, config.duration);
      
      const results = await pipe.exec();
      
      if (!results) {
        throw new Error('Redis pipeline failed');
      }
      
      const count = (results[1]?.[1] as number) || 0;
      const allowed = count < config.max;
      
      if (!allowed) {
        // Get oldest entry to calculate retry time
        const oldestEntry = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestTime = oldestEntry?.[1] ? parseInt(oldestEntry[1]) : now;
        const retryAfter = Math.ceil((oldestTime + config.duration * 1000 - now) / 1000);
        
        logger.warn('Rate limit exceeded', {
          type,
          identifier,
          count,
          max: config.max,
          retryAfter
        });
        
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(oldestTime + config.duration * 1000),
          retryAfter
        };
      }
      
      return {
        allowed: true,
        remaining: config.max - count - 1,
        resetAt: new Date(now + config.duration * 1000)
      };
      
    } catch (error) {
      logger.error('Rate limit check failed', { error, type, identifier });
      
      // On error, be permissive but log
      return {
        allowed: true,
        remaining: 0,
        resetAt: new Date(now + 60000)
      };
    }
  }
  
  async checkMultiple(
    checks: Array<{ type: string; identifier?: string }>
  ): Promise<boolean> {
    const results = await Promise.all(
      checks.map(check => this.checkLimit(check.type, check.identifier))
    );
    
    return results.every(result => result.allowed);
  }
  
  async reset(type: string, identifier: string = 'global'): Promise<void> {
    const config = this.configs.get(type);
    if (!config) return;
    
    const key = `${config.keyPrefix}${identifier}`;
    await this.redis.del(key);
    
    logger.info('Rate limit reset', { type, identifier });
  }
  
  async getStatus(type: string, identifier: string = 'global'): Promise<any> {
    const config = this.configs.get(type);
    if (!config) {
      return { configured: false };
    }
    
    const key = `${config.keyPrefix}${identifier}`;
    const now = Date.now();
    const windowStart = now - (config.duration * 1000);
    
    // Clean old entries and get count
    await this.redis.zremrangebyscore(key, '-inf', windowStart);
    const count = await this.redis.zcard(key);
    
    return {
      configured: true,
      current: count,
      max: config.max,
      remaining: Math.max(0, config.max - count),
      duration: config.duration,
      resetAt: new Date(now + config.duration * 1000)
    };
  }
  
  // Middleware for Express routes
  middleware(type: string = 'api:send') {
    return async (req: any, res: any, next: any) => {
      const identifier = req.ip || req.connection.remoteAddress || 'unknown';
      const result = await this.checkLimit(type, identifier);
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': this.configs.get(type)?.max || 0,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': result.resetAt.toISOString()
      });
      
      if (!result.allowed) {
        res.set('Retry-After', result.retryAfter);
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: result.retryAfter,
          resetAt: result.resetAt
        });
      }
      
      next();
    };
  }
  
  // Check if notification should be sent based on rate limits
  async canSendNotification(
    userId: string,
    channel: 'email' | 'sms' | 'push'
  ): Promise<boolean> {
    // Check both user and global limits
    const checks = [
      { type: `${channel}:user`, identifier: userId },
      { type: `${channel}:global` }
    ];
    
    return this.checkMultiple(checks);
  }
  
  // Record notification sent (for accurate counting)
  async recordNotificationSent(
    userId: string,
    channel: 'email' | 'sms' | 'push'
  ): Promise<void> {
    const now = Date.now();
    
    // Update user limit
    const userConfig = this.configs.get(`${channel}:user`);
    if (userConfig) {
      const userKey = `${userConfig.keyPrefix}${userId}`;
      await this.redis.zadd(userKey, now, `${now}-sent`);
      await this.redis.expire(userKey, userConfig.duration);
    }
    
    // Update global limit
    const globalConfig = this.configs.get(`${channel}:global`);
    if (globalConfig) {
      const globalKey = globalConfig.keyPrefix!;
      await this.redis.zadd(globalKey, now, `${now}-${userId}`);
      await this.redis.expire(globalKey, globalConfig.duration);
    }
  }
}

export const rateLimiter = new RateLimiter();
```

### FILE: src/services/rich-media.service.ts
```typescript
import { logger } from '../config/logger';

interface RichMediaOptions {
  images?: Array<{
    url: string;
    alt?: string;
    width?: number;
    height?: number;
  }>;
  videos?: Array<{
    url: string;
    thumbnail?: string;
    duration?: number;
  }>;
  buttons?: Array<{
    text: string;
    url: string;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
  cards?: Array<{
    title: string;
    description: string;
    image?: string;
    link?: string;
  }>;
}

export class RichMediaService {
  async processImages(images: RichMediaOptions['images']): Promise<any[]> {
    if (!images) return [];

    const processed: any[] = [];
    for (const image of images) {
      try {
        // In production, this would:
        // 1. Download image if needed
        // 2. Optimize for email (resize, compress)
        // 3. Upload to CDN
        // 4. Return optimized URL
        
        processed.push({
          ...image,
          optimizedUrl: image.url, // Would be CDN URL
          width: image.width || 600,
          height: image.height || 400,
        });
      } catch (error) {
        logger.error('Failed to process image', { url: image.url, error });
      }
    }

    return processed;
  }

  generateEmailHTML(options: RichMediaOptions): string {
    let html = '';

    // Add images
    if (options.images && options.images.length > 0) {
      html += '<div style="margin: 20px 0;">';
      for (const image of options.images) {
        html += `
          <img src="${image.url}" 
               alt="${image.alt || ''}" 
               style="max-width: 100%; height: auto; display: block; margin: 10px auto;"
               width="${image.width || 600}">
        `;
      }
      html += '</div>';
    }

    // Add buttons
    if (options.buttons && options.buttons.length > 0) {
      html += '<div style="margin: 20px 0; text-align: center;">';
      for (const button of options.buttons) {
        const bgColor = {
          primary: '#007bff',
          secondary: '#6c757d',
          danger: '#dc3545',
        }[button.style || 'primary'];

        html += `
          <a href="${button.url}" 
             style="display: inline-block; padding: 12px 24px; margin: 5px;
                    background-color: ${bgColor}; color: white; 
                    text-decoration: none; border-radius: 4px;">
            ${button.text}
          </a>
        `;
      }
      html += '</div>';
    }

    // Add cards
    if (options.cards && options.cards.length > 0) {
      html += '<div style="margin: 20px 0;">';
      for (const card of options.cards) {
        html += `
          <div style="border: 1px solid #ddd; border-radius: 8px; 
                      padding: 15px; margin: 10px 0;">
            ${card.image ? `<img src="${card.image}" style="max-width: 100%; margin-bottom: 10px;">` : ''}
            <h3 style="margin: 10px 0;">${card.title}</h3>
            <p style="margin: 10px 0;">${card.description}</p>
            ${card.link ? `<a href="${card.link}" style="color: #007bff;">Learn more →</a>` : ''}
          </div>
        `;
      }
      html += '</div>';
    }

    return html;
  }

  generateAMPEmail(options: RichMediaOptions): string {
    // Generate AMP-compatible email content
    let amp = `
      <!doctype html>
      <html ⚡4email>
      <head>
        <meta charset="utf-8">
        <script async src="https://cdn.ampproject.org/v0.js"></script>
        <style amp4email-boilerplate>body{visibility:hidden}</style>
      </head>
      <body>
    `;

    // Add AMP carousel for images
    if (options.images && options.images.length > 1) {
      amp += `
        <amp-carousel width="600" height="400" layout="responsive" type="slides">
          ${options.images.map(img => `
            <amp-img src="${img.url}" 
                     width="${img.width || 600}" 
                     height="${img.height || 400}" 
                     layout="responsive"
                     alt="${img.alt || ''}">
            </amp-img>
          `).join('')}
        </amp-carousel>
      `;
    }

    amp += '</body></html>';
    return amp;
  }
}

export const richMediaService = new RichMediaService();
```

### FILE: src/services/provider-manager.service.ts
```typescript
import { logger } from '../config/logger';

interface ProviderHealth {
  provider: string;
  healthy: boolean;
  lastCheck: Date;
  failureCount: number;
  successCount: number;
}

export class ProviderManager {
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly MAX_FAILURES = 3;
  
  constructor() {
    this.initializeProviders();
    this.startHealthChecks();
  }

  private initializeProviders() {
    // Initialize provider health tracking
    this.providerHealth.set('sendgrid', {
      provider: 'sendgrid',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('aws-ses', {
      provider: 'aws-ses',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('twilio', {
      provider: 'twilio',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('aws-sns', {
      provider: 'aws-sns',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });
  }

  private startHealthChecks() {
    setInterval(() => {
      this.checkProviderHealth();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private async checkProviderHealth() {
    for (const [name, health] of this.providerHealth) {
      try {
        // Implement actual health check based on provider
        // For now, using the existing connection status
        health.lastCheck = new Date();
        
        // Mark unhealthy if too many failures
        if (health.failureCount >= this.MAX_FAILURES) {
          health.healthy = false;
          logger.warn(`Provider ${name} marked unhealthy`, {
            failureCount: health.failureCount
          });
        }
      } catch (error) {
        logger.error(`Health check failed for ${name}`, error);
      }
    }
  }

  async getHealthyEmailProvider(): Promise<string> {
    // Primary provider
    if (this.providerHealth.get('sendgrid')?.healthy) {
      return 'sendgrid';
    }
    
    // Fallback provider
    if (this.providerHealth.get('aws-ses')?.healthy) {
      logger.info('Failing over to AWS SES from SendGrid');
      return 'aws-ses';
    }
    
    throw new Error('No healthy email providers available');
  }

  async getHealthySmsProvider(): Promise<string> {
    // Primary provider
    if (this.providerHealth.get('twilio')?.healthy) {
      return 'twilio';
    }
    
    // Fallback provider
    if (this.providerHealth.get('aws-sns')?.healthy) {
      logger.info('Failing over to AWS SNS from Twilio');
      return 'aws-sns';
    }
    
    throw new Error('No healthy SMS providers available');
  }

  recordSuccess(provider: string) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.successCount++;
      health.failureCount = 0; // Reset failure count on success
      health.healthy = true;
    }
  }

  recordFailure(provider: string, error: Error) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.failureCount++;
      logger.error(`Provider ${provider} failure`, {
        failureCount: health.failureCount,
        error: error.message
      });
      
      if (health.failureCount >= this.MAX_FAILURES) {
        health.healthy = false;
      }
    }
  }

  getProviderStatus(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }
}

export const providerManager = new ProviderManager();
```

### FILE: src/services/retry.service.ts
```typescript
import { logger } from '../config/logger';
import { db } from '../config/database';

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  factor: number;
}

export class RetryService {
  private readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 5000,
    maxDelay: 300000, // 5 minutes
    factor: 2,
  };

  async shouldRetry(
    notificationId: string,
    error: Error
  ): Promise<{ retry: boolean; delay: number }> {
    // Get current attempt count
    const notification = await db('notification_tracking')
      .where('id', notificationId)
      .first();

    if (!notification) {
      return { retry: false, delay: 0 };
    }

    const attempts = notification.retry_attempts || 0;

    // Check if we should retry based on error type
    if (!this.isRetryableError(error)) {
      logger.info('Error is not retryable', { 
        notificationId, 
        error: error.message 
      });
      return { retry: false, delay: 0 };
    }

    // Check max attempts
    if (attempts >= this.defaultConfig.maxAttempts) {
      logger.warn('Max retry attempts reached', { 
        notificationId, 
        attempts 
      });
      return { retry: false, delay: 0 };
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      this.defaultConfig.baseDelay * Math.pow(this.defaultConfig.factor, attempts),
      this.defaultConfig.maxDelay
    );

    // Update retry count
    await db('notification_tracking')
      .where('id', notificationId)
      .update({
        retry_attempts: attempts + 1,
        next_retry_at: new Date(Date.now() + delay),
        updated_at: new Date(),
      });

    logger.info('Scheduling retry', { 
      notificationId, 
      attempt: attempts + 1, 
      delay 
    });

    return { retry: true, delay };
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Don't retry on permanent failures
    if (
      message.includes('invalid') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not found') ||
      message.includes('bad request')
    ) {
      return false;
    }

    // Retry on temporary failures
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('rate limit') ||
      message.includes('service unavailable') ||
      message.includes('gateway timeout')
    ) {
      return true;
    }

    // Default to retry for unknown errors
    return true;
  }

  async recordRetryMetrics(notificationId: string, success: boolean) {
    const key = success ? 'retry_success' : 'retry_failure';
    await db('notification_tracking')
      .where('id', notificationId)
      .increment(key, 1);
  }
}

export const retryService = new RetryService();
```

### FILE: src/services/template-registry.ts
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import Handlebars from 'handlebars';
import { logger } from '../config/logger';

interface TemplateInfo {
  name: string;
  channel: 'email' | 'sms';
  subject?: string;
  variables: string[];
  description: string;
}

export class TemplateRegistry {
  private templates: Map<string, TemplateInfo> = new Map();
  
  constructor() {
    this.registerTemplates();
  }
  
  private registerTemplates() {
    // Email templates
    this.templates.set('payment-success', {
      name: 'payment-success',
      channel: 'email',
      subject: 'Payment Confirmed - {{eventName}}',
      variables: ['user', 'amount', 'currency', 'eventName', 'ticketCount', 'orderId'],
      description: 'Sent when payment is successfully processed'
    });
    
    this.templates.set('payment-failed', {
      name: 'payment-failed',
      channel: 'email',
      subject: 'Payment Failed - Action Required',
      variables: ['user', 'amount', 'eventName', 'reason', 'retryUrl'],
      description: 'Sent when payment fails'
    });
    
    this.templates.set('refund-processed', {
      name: 'refund-processed',
      channel: 'email',
      subject: 'Refund Processed',
      variables: ['user', 'amount', 'orderId', 'refundId'],
      description: 'Sent when refund is processed'
    });
    
    this.templates.set('ticket-purchased', {
      name: 'ticket-purchased',
      channel: 'email',
      subject: 'Your Tickets for {{event.name}}',
      variables: ['user', 'event', 'ticketCount', 'ticketType', 'orderId', 'nftMinted'],
      description: 'Sent after successful ticket purchase'
    });
    
    this.templates.set('event-reminder', {
      name: 'event-reminder',
      channel: 'email',
      subject: 'Reminder: {{event.name}} is coming up!',
      variables: ['user', 'event', 'hoursUntil', 'ticketCount'],
      description: 'Sent 24 hours before event'
    });
    
    this.templates.set('account-verification', {
      name: 'account-verification',
      channel: 'email',
      subject: 'Verify Your TicketToken Account',
      variables: ['user', 'verificationCode', 'verificationUrl'],
      description: 'Sent for email verification'
    });
    
    // SMS templates
    this.templates.set('sms-payment-success', {
      name: 'payment-success',
      channel: 'sms',
      variables: ['amount', 'eventName', 'orderIdShort', 'shortUrl'],
      description: 'SMS payment confirmation'
    });
    
    this.templates.set('sms-event-reminder', {
      name: 'event-reminder',
      channel: 'sms',
      variables: ['eventName', 'timeUntil', 'venue', 'shortUrl'],
      description: 'SMS event reminder'
    });
  }
  
  getTemplate(name: string): TemplateInfo | undefined {
    return this.templates.get(name);
  }
  
  getAllTemplates(): TemplateInfo[] {
    return Array.from(this.templates.values());
  }
  
  getTemplatesByChannel(channel: 'email' | 'sms'): TemplateInfo[] {
    return this.getAllTemplates().filter(t => t.channel === channel);
  }
  
  async validateTemplate(name: string, data: any): Promise<string[]> {
    const template = this.templates.get(name);
    if (!template) {
      return ['Template not found'];
    }
    
    const errors: string[] = [];
    const providedKeys = Object.keys(data);
    
    // Check for missing required variables
    for (const variable of template.variables) {
      if (!providedKeys.includes(variable)) {
        errors.push(`Missing required variable: ${variable}`);
      }
    }
    
    return errors;
  }
  
  async renderTemplate(
    templateName: string,
    data: any
  ): Promise<{ subject?: string; body: string }> {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }
    
    const templatePath = path.join(
      __dirname,
      '../templates',
      template.channel,
      `${template.name}.${template.channel === 'email' ? 'hbs' : 'txt'}`
    );
    
    try {
      const templateContent = await fs.readFile(templatePath, 'utf8');
      const compiled = Handlebars.compile(templateContent);
      const body = compiled(data);
      
      let subject: string | undefined;
      if (template.subject) {
        const subjectCompiled = Handlebars.compile(template.subject);
        subject = subjectCompiled(data);
      }
      
      return { subject, body };
    } catch (error) {
      logger.error(`Failed to render template ${templateName}:`, error);
      throw error;
    }
  }
}

export const templateRegistry = new TemplateRegistry();
```

### FILE: src/services/analytics.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import * as crypto from 'crypto';

interface NotificationMetrics {
  sent: number;
  delivered: number;
  failed: number;
  bounced: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
}

interface ChannelMetrics {
  email: NotificationMetrics;
  sms: NotificationMetrics;
  push: NotificationMetrics;
}

export class AnalyticsService {
  // Track notification sent
  async trackSent(data: {
    notificationId: string;
    userId: string;
    channel: string;
    type: string;
    provider: string;
  }): Promise<void> {
    try {
      await this.updateHourlyMetrics({
        channel: data.channel,
        type: data.type,
        provider: data.provider,
        metric: 'total_sent',
        increment: 1
      });

      logger.debug('Tracked notification sent', data);
    } catch (error) {
      logger.error('Failed to track sent notification', { error, data });
    }
  }

  // Track delivery status
  async trackDelivery(data: {
    notificationId: string;
    status: 'delivered' | 'failed' | 'bounced';
    deliveryTimeMs?: number;
  }): Promise<void> {
    try {
      const notification = await db('notification_history')
        .where('id', data.notificationId)
        .first();

      if (!notification) return;

      const metric = `total_${data.status}`;
      await this.updateHourlyMetrics({
        channel: notification.channel,
        type: notification.type,
        provider: notification.metadata?.provider,
        metric,
        increment: 1,
        deliveryTimeMs: data.deliveryTimeMs
      });

      logger.debug('Tracked delivery status', data);
    } catch (error) {
      logger.error('Failed to track delivery', { error, data });
    }
  }

  // Track engagement (open/click)
  async trackEngagement(data: {
    notificationId: string;
    userId: string;
    action: 'opened' | 'clicked' | 'unsubscribed';
    metadata?: any;
  }): Promise<void> {
    try {
      // Record engagement
      await db('notification_engagement')
        .insert({
          notification_id: data.notificationId,
          user_id: data.userId,
          channel: 'email', // Usually only email has open/click tracking
          action: data.action,
          action_timestamp: new Date(),
          metadata: JSON.stringify(data.metadata || {}),
          created_at: new Date()
        })
        .onConflict(['notification_id', 'user_id', 'action'])
        .ignore();

      // Update metrics
      if (data.action === 'opened') {
        await this.updateMetricForNotification(data.notificationId, 'total_opened');
      } else if (data.action === 'clicked') {
        await this.updateMetricForNotification(data.notificationId, 'total_clicked');
      }

      logger.debug('Tracked engagement', data);
    } catch (error) {
      logger.error('Failed to track engagement', { error, data });
    }
  }

  // Track link clicks
  async trackClick(data: {
    notificationId: string;
    userId: string;
    linkId: string;
    originalUrl: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await db('notification_clicks').insert({
        notification_id: data.notificationId,
        user_id: data.userId,
        link_id: data.linkId,
        original_url: data.originalUrl,
        clicked_at: new Date(),
        ip_address: data.ipAddress,
        user_agent: data.userAgent
      });

      await this.trackEngagement({
        notificationId: data.notificationId,
        userId: data.userId,
        action: 'clicked',
        metadata: { linkId: data.linkId }
      });

      logger.debug('Tracked link click', data);
    } catch (error) {
      logger.error('Failed to track click', { error, data });
    }
  }

  // Get metrics for date range
  async getMetrics(
    startDate: Date,
    endDate: Date,
    channel?: string
  ): Promise<any> {
    const query = db('notification_analytics')
      .whereBetween('date', [startDate, endDate])
      .select(
        db.raw('SUM(total_sent) as sent'),
        db.raw('SUM(total_delivered) as delivered'),
        db.raw('SUM(total_failed) as failed'),
        db.raw('SUM(total_bounced) as bounced'),
        db.raw('SUM(total_opened) as opened'),
        db.raw('SUM(total_clicked) as clicked'),
        db.raw('AVG(avg_delivery_time_ms) as avg_delivery_time'),
        db.raw('SUM(total_cost) / 100.0 as total_cost')
      );

    if (channel) {
      query.where('channel', channel);
    }

    const result = await query.first();

    // Calculate rates
    const sent = parseInt(result.sent) || 0;
    const delivered = parseInt(result.delivered) || 0;
    const opened = parseInt(result.opened) || 0;
    const clicked = parseInt(result.clicked) || 0;

    return {
      sent,
      delivered,
      failed: parseInt(result.failed) || 0,
      bounced: parseInt(result.bounced) || 0,
      opened,
      clicked,
      deliveryRate: sent > 0 ? (delivered / sent * 100).toFixed(2) : 0,
      openRate: delivered > 0 ? (opened / delivered * 100).toFixed(2) : 0,
      clickRate: opened > 0 ? (clicked / opened * 100).toFixed(2) : 0,
      avgDeliveryTime: result.avg_delivery_time || 0,
      totalCost: result.total_cost || 0
    };
  }

  // Get metrics by channel
  async getChannelMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<ChannelMetrics> {
    const channels = ['email', 'sms', 'push'];
    const metrics: any = {};

    for (const channel of channels) {
      metrics[channel] = await this.getMetrics(startDate, endDate, channel);
    }

    return metrics;
  }

  // Get hourly breakdown
  async getHourlyBreakdown(date: Date, channel?: string): Promise<any[]> {
    const query = db('notification_analytics')
      .where('date', date)
      .select('hour', 'channel', 'total_sent', 'total_delivered', 'total_failed')
      .orderBy('hour');

    if (channel) {
      query.where('channel', channel);
    }

    return query;
  }

  // Get top notification types
  async getTopNotificationTypes(
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ): Promise<any[]> {
    return db('notification_analytics')
      .whereBetween('date', [startDate, endDate])
      .groupBy('type')
      .select(
        'type',
        db.raw('SUM(total_sent) as count'),
        db.raw('ROUND(100.0 * SUM(total_delivered) / NULLIF(SUM(total_sent), 0), 2) as delivery_rate')
      )
      .orderBy('count', 'desc')
      .limit(limit);
  }

  // Get user engagement stats
  async getUserEngagement(userId: string): Promise<any> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const notifications = await db('notification_history')
      .where('user_id', userId)
      .where('created_at', '>=', thirtyDaysAgo)
      .count('id as total')
      .first();

    const engagement = await db('notification_engagement')
      .where('user_id', userId)
      .where('action_timestamp', '>=', thirtyDaysAgo)
      .select('action')
      .count('id as count')
      .groupBy('action');

    const engagementMap: any = {};
    engagement.forEach(row => {
      engagementMap[row.action] = parseInt(String(row.count));
    });

    return {
      totalReceived: parseInt(String(notifications?.total || 0)) || 0,
      opened: engagementMap.opened || 0,
      clicked: engagementMap.clicked || 0,
      unsubscribed: engagementMap.unsubscribed || 0
    };
  }

  // Private helper methods
  private async updateHourlyMetrics(data: {
    channel: string;
    type: string;
    provider: string;
    metric: string;
    increment: number;
    deliveryTimeMs?: number;
  }): Promise<void> {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const hour = now.getHours();

    // SECURITY FIX: Whitelist allowed metric columns
    const allowedMetrics = [
      'total_sent',
      'total_delivered', 
      'total_failed',
      'total_bounced',
      'total_opened',
      'total_clicked'
    ];

    if (!allowedMetrics.includes(data.metric)) {
      throw new Error(`Invalid metric column: ${data.metric}`);
    }

    // Build update data object safely
    const updateData: any = {};
    
    // Since the metric is now validated, we can use it in the raw query
    // But we'll use a different approach to avoid any SQL injection
    if (data.metric === 'total_sent') {
      updateData.total_sent = db.raw('COALESCE(total_sent, 0) + ?', [data.increment]);
    } else if (data.metric === 'total_delivered') {
      updateData.total_delivered = db.raw('COALESCE(total_delivered, 0) + ?', [data.increment]);
    } else if (data.metric === 'total_failed') {
      updateData.total_failed = db.raw('COALESCE(total_failed, 0) + ?', [data.increment]);
    } else if (data.metric === 'total_bounced') {
      updateData.total_bounced = db.raw('COALESCE(total_bounced, 0) + ?', [data.increment]);
    } else if (data.metric === 'total_opened') {
      updateData.total_opened = db.raw('COALESCE(total_opened, 0) + ?', [data.increment]);
    } else if (data.metric === 'total_clicked') {
      updateData.total_clicked = db.raw('COALESCE(total_clicked, 0) + ?', [data.increment]);
    }

    if (data.deliveryTimeMs) {
      updateData.avg_delivery_time_ms = db.raw(
        '(COALESCE(avg_delivery_time_ms * total_delivered, 0) + ?) / NULLIF(total_delivered + 1, 0)',
        [data.deliveryTimeMs]
      );
    }

    const insertData: any = {
      date,
      hour,
      channel: data.channel,
      type: data.type,
      provider: data.provider,
      created_at: now,
      updated_at: now
    };

    // Set the initial value for the metric
    insertData[data.metric] = data.increment;
    
    if (data.deliveryTimeMs) {
      insertData.avg_delivery_time_ms = data.deliveryTimeMs;
    }

    await db('notification_analytics')
      .insert(insertData)
      .onConflict(['date', 'hour', 'channel', 'type', 'provider'])
      .merge(updateData);
  }

  private async updateMetricForNotification(
    notificationId: string,
    metric: string
  ): Promise<void> {
    const notification = await db('notification_history')
      .where('id', notificationId)
      .first();

    if (!notification) return;

    await this.updateHourlyMetrics({
      channel: notification.channel,
      type: notification.type,
      provider: notification.metadata?.provider,
      metric,
      increment: 1
    });
  }

  // Generate tracking pixel
  generateTrackingPixel(notificationId: string, userId: string): string {
    const trackingId = crypto.randomBytes(16).toString('hex');
    const baseUrl = process.env.API_URL || 'https://api.tickettoken.com';
    return `${baseUrl}/track/open/${trackingId}?n=${notificationId}&u=${userId}`;
  }

  // Generate tracked link
  generateTrackedLink(
    notificationId: string,
    userId: string,
    originalUrl: string,
    linkId: string
  ): string {
    const baseUrl = process.env.API_URL || 'https://api.tickettoken.com';
    const params = new URLSearchParams({
      n: notificationId,
      u: userId,
      l: linkId,
      url: originalUrl
    });
    return `${baseUrl}/track/click?${params.toString()}`;
  }
}

export const analyticsService = new AnalyticsService();
```

### FILE: src/services/campaign.service.v2.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { notificationServiceV2 } from './notification.service.v2';
import { v4 as uuidv4 } from 'uuid';


interface ABTestVariant {
  id: string;
  name: string;
  templateId: string;
  subject?: string;
  percentage: number;
}

export class CampaignServiceV2 {
  private readonly campaignsTable = 'campaigns';
  private readonly segmentsTable = 'campaign_segments';

  async createCampaign(campaign: {
    venueId: string;
    name: string;
    type: 'marketing' | 'transactional';
    channel: 'email' | 'sms';
    segmentId?: string;
    templateId?: string;
    abTest?: {
      enabled: boolean;
      variants: ABTestVariant[];
    };
    scheduledFor?: Date;
    dailyLimit?: number;
    monthlyLimit?: number;
  }) {
    const campaignId = uuidv4();
    
    // Check venue limits
    const limits = await this.checkVenueLimits(campaign.venueId, campaign.channel);
    if (!limits.canSend) {
      throw new Error(`Venue has reached ${campaign.channel} limit: ${limits.reason}`);
    }

    await db(this.campaignsTable).insert({
      id: campaignId,
      venue_id: campaign.venueId,
      name: campaign.name,
      type: campaign.type,
      channel: campaign.channel,
      segment_id: campaign.segmentId,
      template_id: campaign.templateId,
      ab_test_config: campaign.abTest ? JSON.stringify(campaign.abTest) : null,
      scheduled_for: campaign.scheduledFor,
      status: campaign.scheduledFor ? 'scheduled' : 'draft',
      daily_limit: campaign.dailyLimit,
      monthly_limit: campaign.monthlyLimit,
      created_at: new Date(),
      updated_at: new Date(),
    });

    logger.info('Campaign created', { campaignId, name: campaign.name });
    return campaignId;
  }

  async sendCampaign(campaignId: string) {
    const campaign = await db(this.campaignsTable)
      .where('id', campaignId)
      .first();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Check spam score before sending
    if (campaign.channel === 'email') {
      const spamScore = await this.checkSpamScore(campaign.template_id);
      if (spamScore > 5) {
        throw new Error(`Campaign has high spam score: ${spamScore}. Please review content.`);
      }
    }

    // Update status
    await db(this.campaignsTable)
      .where('id', campaignId)
      .update({ 
        status: 'sending',
        started_at: new Date(),
        updated_at: new Date()
      });

    // Get audience based on segment
    const audience = await this.getSegmentedAudience(
      campaign.venue_id,
      campaign.segment_id
    );

    // Handle A/B testing if enabled
    let variants: ABTestVariant[] = [];
    if (campaign.ab_test_config) {
      const config = JSON.parse(campaign.ab_test_config);
      if (config.enabled) {
        variants = config.variants;
      }
    }

    const stats = {
      total: audience.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      variants: {} as Record<string, number>,
    };

    // Process in batches to respect rate limits
    const batchSize = campaign.daily_limit || 1000;
    const batches = this.chunkArray(audience, batchSize);

    for (const batch of batches) {
      await this.processBatch(
        batch,
        campaign,
        campaignId,
        variants,
        stats
      );

      // Add delay between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Update campaign with final stats
    await db(this.campaignsTable)
      .where('id', campaignId)
      .update({
        status: 'completed',
        completed_at: new Date(),
        stats: JSON.stringify(stats),
        updated_at: new Date(),
      });

    logger.info('Campaign completed', { 
      campaignId, 
      stats 
    });

    return stats;
  }

  private async processBatch(
    batch: any[],
    campaign: any,
    campaignId: string,
    variants: ABTestVariant[],
    stats: any
  ) {
    for (const recipient of batch) {
      try {
        // Select variant for A/B testing
        let templateId = campaign.template_id;
        let variantId = 'control';
        
        if (variants.length > 0) {
          const selected = this.selectVariant(variants, recipient.id);
          templateId = selected.templateId;
          variantId = selected.id;
          stats.variants[variantId] = (stats.variants[variantId] || 0) + 1;
        }

        await notificationServiceV2.send({
          venueId: campaign.venue_id,
          recipientId: recipient.id,
          recipient: {
            id: recipient.id,
            email: recipient.email,
            phone: recipient.phone,
            name: recipient.name,
            timezone: recipient.timezone,
          },
          channel: campaign.channel,
          type: campaign.type,
          template: campaign.template_name || templateId,
          priority: 'low',
          data: {
            campaignId,
            variantId,
            ...recipient.data,
          },
          metadata: {
            campaignId,
            campaignName: campaign.name,
            variantId,
          },
        });
        
        stats.sent++;
      } catch (error) {
        stats.failed++;
        logger.error('Failed to send campaign message', { 
          campaignId, 
          recipientId: recipient.id,
          error 
        });
      }
    }
  }

  private async getSegmentedAudience(venueId: string, segmentId?: string) {
    if (!segmentId) {
      // Return all customers for venue
      return this.getAllVenueCustomers(venueId);
    }

    const segment = await db(this.segmentsTable)
      .where('id', segmentId)
      .first();

    if (!segment) {
      throw new Error('Segment not found');
    }

    const filters = JSON.parse(segment.filters);
    return this.applySegmentFilters(venueId, filters);
  }

  private async applySegmentFilters(venueId: string, filters: any) {
    // This would build a complex query based on filters
    // For now, returning mock filtered data
    let query = db('customers')
      .where('venue_id', venueId)
      .where('opt_in_marketing', true);

    if (filters.lastPurchase) {
      const date = new Date();
      date.setDate(date.getDate() - filters.lastPurchase.days);
      
      if (filters.lastPurchase.operator === 'within') {
        query = query.where('last_purchase_at', '>=', date);
      } else {
        query = query.where('last_purchase_at', '<', date);
      }
    }

    if (filters.customerType) {
      query = query.where('customer_type', filters.customerType);
    }

    if (filters.eventAttendance) {
      // This would join with ticket purchases
      // Simplified for now
    }

    return await query.select(
      'id',
      'email',
      'phone',
      'first_name as name',
      'timezone'
    );
  }

  private async getAllVenueCustomers(_venueId: string) {
    // Mock implementation - would query actual customer database
    return [
      {
        id: 'cust-1',
        email: 'customer1@example.com',
        phone: '+15551234567',
        name: 'John Doe',
        timezone: 'America/Chicago',
        data: {
          firstName: 'John',
          lastName: 'Doe',
          lastEvent: 'Rock Concert',
        },
      },
    ];
  }

  private selectVariant(variants: ABTestVariant[], recipientId: string): ABTestVariant {
    // Use consistent hashing to ensure same recipient always gets same variant
    const hash = this.hashCode(recipientId);
    const random = (hash % 100) / 100;
    
    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.percentage / 100;
      if (random <= cumulative) {
        return variant;
      }
    }
    
    return variants[0];
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private async checkVenueLimits(venueId: string, channel: string) {
    const settings = await db('venue_notification_settings')
      .where('venue_id', venueId)
      .first();

    if (!settings) {
      return { canSend: true };
    }

    // Check daily limit
    if (channel === 'email' && settings.daily_email_limit) {
      const todayCount = await this.getTodayCount(venueId, 'email');
      if (todayCount >= settings.daily_email_limit) {
        return { 
          canSend: false, 
          reason: `Daily email limit reached (${settings.daily_email_limit})` 
        };
      }
    }

    if (channel === 'sms' && settings.daily_sms_limit) {
      const todayCount = await this.getTodayCount(venueId, 'sms');
      if (todayCount >= settings.daily_sms_limit) {
        return { 
          canSend: false, 
          reason: `Daily SMS limit reached (${settings.daily_sms_limit})` 
        };
      }
    }

    // Check monthly limit
    if (channel === 'email' && settings.monthly_email_limit) {
      const monthCount = await this.getMonthCount(venueId, 'email');
      if (monthCount >= settings.monthly_email_limit) {
        return { 
          canSend: false, 
          reason: `Monthly email limit reached (${settings.monthly_email_limit})` 
        };
      }
    }

    if (channel === 'sms' && settings.monthly_sms_limit) {
      const monthCount = await this.getMonthCount(venueId, 'sms');
      if (monthCount >= settings.monthly_sms_limit) {
        return { 
          canSend: false, 
          reason: `Monthly SMS limit reached (${settings.monthly_sms_limit})` 
        };
      }
    }

    return { canSend: true };
  }

  private async getTodayCount(venueId: string, channel: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db('notification_tracking')
      .where('venue_id', venueId)
      .where('channel', channel)
      .where('created_at', '>=', today)
      .count('id as count')
      .first();

    return parseInt(String(result?.count || '0'));
  }

  private async getMonthCount(venueId: string, channel: string): Promise<number> {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const result = await db('notification_tracking')
      .where('venue_id', venueId)
      .where('channel', channel)
      .where('created_at', '>=', firstOfMonth)
      .count('id as count')
      .first();

    return parseInt(String(result?.count || '0'));
  }

  private async checkSpamScore(templateId: string): Promise<number> {
    // Implement spam scoring logic
    // Check for spam trigger words, excessive caps, too many links, etc.
    const template = await db('notification_templates')
      .where('id', templateId)
      .first();

    if (!template) return 0;

    let score = 0;
    const content = (template.content + ' ' + template.subject).toLowerCase();

    // Spam trigger words
    const spamWords = ['free', 'winner', 'cash', 'prize', 'urgent', 'act now', 'limited time'];
    for (const word of spamWords) {
      if (content.includes(word)) score++;
    }

    // Check for excessive caps
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.3) score += 3;

    // Check for excessive exclamation marks
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > 3) score += 2;

    return score;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async createSegment(segment: {
    venueId: string;
    name: string;
    filters: any;
  }): Promise<string> {
    const segmentId = uuidv4();
    
    await db(this.segmentsTable).insert({
      id: segmentId,
      venue_id: segment.venueId,
      name: segment.name,
      filters: JSON.stringify(segment.filters),
      created_at: new Date(),
      updated_at: new Date(),
    });

    return segmentId;
  }

  async getCampaignAnalytics(campaignId: string) {
    const campaign = await db(this.campaignsTable)
      .where('id', campaignId)
      .first();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get detailed analytics
    const opens = await db('notification_tracking')
      .where('metadata', '@>', JSON.stringify({ campaignId }))
      .whereNotNull('opened_at')
      .count('id as count')
      .first();

    const clicks = await db('notification_tracking')
      .where('metadata', '@>', JSON.stringify({ campaignId }))
      .whereNotNull('clicked_at')
      .count('id as count')
      .first();

    const bounces = await db('notification_tracking')
      .where('metadata', '@>', JSON.stringify({ campaignId }))
      .where('status', 'bounced')
      .count('id as count')
      .first();

    const stats = JSON.parse(campaign.stats || '{}');

    return {
      campaignId,
      name: campaign.name,
      status: campaign.status,
      ...stats,
      opens: parseInt(String(opens?.count || '0')),
      clicks: parseInt(String(clicks?.count || '0')),
      bounces: parseInt(String(bounces?.count || '0')),
      openRate: stats.sent ? (parseInt(String(opens?.count || '0')) / stats.sent) * 100 : 0,
      clickRate: stats.sent ? (parseInt(String(clicks?.count || '0')) / stats.sent) * 100 : 0,
      bounceRate: stats.sent ? (parseInt(String(bounces?.count || '0')) / stats.sent) * 100 : 0,
    };
  }
}

export const campaignServiceV2 = new CampaignServiceV2();
```

### FILE: src/services/delivery-tracker.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import Bull from 'bull';

export interface DeliveryTrackingData {
  notificationId: string;
  userId: string;
  channel: 'email' | 'sms' | 'push';
  recipient: string;
  providerMessageId?: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'retrying';
  attempts: number;
  maxAttempts?: number;
  lastError?: string;
  providerResponse?: any;
}

export class DeliveryTracker {
  private retryQueue: Bull.Queue;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_DELAYS = [
    5000,    // 5 seconds
    30000,   // 30 seconds
    300000   // 5 minutes
  ];

  constructor() {
    this.retryQueue = new Bull('notification-retry', {
      redis: {
        port: parseInt(process.env.REDIS_PORT || '6379'),
        host: process.env.REDIS_HOST || 'redis',
        password: process.env.REDIS_PASSWORD
      }
    });

    this.initializeRetryProcessor();
  }

  private initializeRetryProcessor() {
    this.retryQueue.process(async (job) => {
      const { notificationId, attempt } = job.data;
      await this.retryNotification(notificationId, attempt);
    });
  }

  async trackDelivery(data: DeliveryTrackingData): Promise<void> {
    try {
      // Update notification history
      await db('notification_history')
        .where('id', data.notificationId)
        .update({
          delivery_status: data.status,
          delivery_attempts: data.attempts,
          last_attempt_at: new Date(),
          delivered_at: data.status === 'delivered' ? new Date() : null,
          failed_reason: data.lastError,
          provider_message_id: data.providerMessageId,
          provider_response: JSON.stringify(data.providerResponse || {}),
          should_retry: this.shouldRetry(data),
          updated_at: new Date()
        });

      // Update daily stats
      await this.updateStats(data);

      // Schedule retry if needed
      if (this.shouldRetry(data)) {
        await this.scheduleRetry(data);
      }

      logger.info('Delivery tracked', {
        notificationId: data.notificationId,
        status: data.status,
        attempts: data.attempts
      });
    } catch (error) {
      logger.error('Failed to track delivery', { error, data });
    }
  }

  private shouldRetry(data: DeliveryTrackingData): boolean {
    if (data.status === 'delivered' || data.status === 'bounced') {
      return false;
    }

    if (data.attempts >= (data.maxAttempts || this.MAX_ATTEMPTS)) {
      return false;
    }

    if (data.status === 'failed' || data.status === 'retrying') {
      return true;
    }

    return false;
  }

  private async scheduleRetry(data: DeliveryTrackingData): Promise<void> {
    const delay = this.RETRY_DELAYS[data.attempts - 1] || this.RETRY_DELAYS[this.RETRY_DELAYS.length - 1];
    
    await this.retryQueue.add(
      {
        notificationId: data.notificationId,
        attempt: data.attempts + 1,
        userId: data.userId,
        channel: data.channel,
        recipient: data.recipient
      },
      {
        delay,
        attempts: 1,
        backoff: {
          type: 'fixed',
          delay: 0
        }
      }
    );

    // Update retry_after timestamp
    await db('notification_history')
      .where('id', data.notificationId)
      .update({
        retry_after: new Date(Date.now() + delay),
        delivery_status: 'retrying'
      });

    logger.info('Retry scheduled', {
      notificationId: data.notificationId,
      attempt: data.attempts + 1,
      delayMs: delay
    });
  }

  private async retryNotification(notificationId: string, attempt: number): Promise<void> {
    try {
      // Get notification details
      const notification = await db('notification_history')
        .where('id', notificationId)
        .first();

      if (!notification) {
        logger.error('Notification not found for retry', { notificationId });
        return;
      }

      // Re-send based on channel
      // This would call back to the notification service
      // For now, just mark as retried
      logger.info('Retrying notification', {
        notificationId,
        attempt,
        channel: notification.channel
      });

      // In real implementation, this would re-send the notification
      // For mock, simulate success/failure
      const success = Math.random() > 0.3; // 70% success rate on retry

      await this.trackDelivery({
        notificationId,
        userId: notification.user_id,
        channel: notification.channel,
        recipient: notification.recipient,
        status: success ? 'delivered' : 'failed',
        attempts: attempt,
        lastError: success ? undefined : 'Retry failed'
      });
    } catch (error) {
      logger.error('Retry failed', { error, notificationId });
    }
  }

  private async updateStats(data: DeliveryTrackingData): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      await db.raw(`
        INSERT INTO notification_delivery_stats (
          date, channel, provider,
          total_sent, total_delivered, total_failed, total_bounced, total_retried
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (date, channel, provider) 
        DO UPDATE SET
          total_sent = notification_delivery_stats.total_sent + EXCLUDED.total_sent,
          total_delivered = notification_delivery_stats.total_delivered + EXCLUDED.total_delivered,
          total_failed = notification_delivery_stats.total_failed + EXCLUDED.total_failed,
          total_bounced = notification_delivery_stats.total_bounced + EXCLUDED.total_bounced,
          total_retried = notification_delivery_stats.total_retried + EXCLUDED.total_retried,
          updated_at = CURRENT_TIMESTAMP
      `, [
        today,
        data.channel,
        'mock', // or get from provider response
        data.status === 'sent' ? 1 : 0,
        data.status === 'delivered' ? 1 : 0,
        data.status === 'failed' ? 1 : 0,
        data.status === 'bounced' ? 1 : 0,
        data.status === 'retrying' ? 1 : 0
      ]);
    } catch (error) {
      logger.error('Failed to update stats', { error });
    }
  }

  async getDeliveryStats(startDate?: Date, endDate?: Date): Promise<any> {
    const query = db('notification_delivery_stats');
    
    if (startDate) {
      query.where('date', '>=', startDate);
    }
    
    if (endDate) {
      query.where('date', '<=', endDate);
    }
    
    return query.select(
      db.raw('SUM(total_sent) as total_sent'),
      db.raw('SUM(total_delivered) as total_delivered'),
      db.raw('SUM(total_failed) as total_failed'),
      db.raw('SUM(total_bounced) as total_bounced'),
      db.raw('SUM(total_retried) as total_retried'),
      db.raw('ROUND(100.0 * SUM(total_delivered) / NULLIF(SUM(total_sent), 0), 2) as delivery_rate'),
      'channel'
    )
    .groupBy('channel');
  }

  async getPendingRetries(): Promise<any[]> {
    return db('notification_history')
      .where('delivery_status', 'retrying')
      .where('should_retry', true)
      .where('retry_after', '<=', new Date())
      .orderBy('retry_after', 'asc')
      .limit(100);
  }
}

export const deliveryTracker = new DeliveryTracker();
```

### FILE: src/services/spam-score.service.ts
```typescript
import { logger } from '../config/logger';

interface SpamCheckResult {
  score: number;
  flags: string[];
  passed: boolean;
  recommendations: string[];
}

export class SpamScoreService {
  private readonly MAX_ACCEPTABLE_SCORE = 5;
  
  async checkContent(
    subject: string,
    content: string,
    htmlContent?: string
  ): Promise<SpamCheckResult> {
    const flags: string[] = [];
    const recommendations: string[] = [];
    let score = 0;

    // Combine all content for analysis
    const fullContent = `${subject} ${content} ${htmlContent || ''}`.toLowerCase();

    // Check spam trigger words
    score += this.checkSpamWords(fullContent, flags);
    
    // Check capitalization
    score += this.checkCapitalization(fullContent, flags);
    
    // Check punctuation
    score += this.checkPunctuation(fullContent, flags);
    
    // Check links
    score += this.checkLinks(htmlContent || content, flags);
    
    // Check images ratio
    if (htmlContent) {
      score += this.checkImageRatio(htmlContent, flags);
    }
    
    // Check subject line
    score += this.checkSubjectLine(subject, flags);
    
    // Generate recommendations
    if (score > 3) {
      recommendations.push('Consider rewording to avoid spam triggers');
    }
    if (flags.includes('excessive_caps')) {
      recommendations.push('Reduce use of capital letters');
    }
    if (flags.includes('too_many_links')) {
      recommendations.push('Reduce the number of links');
    }

    const result = {
      score,
      flags,
      passed: score <= this.MAX_ACCEPTABLE_SCORE,
      recommendations,
    };

    logger.info('Spam check completed', result);
    return result;
  }

  private checkSpamWords(content: string, flags: string[]): number {
    let score = 0;
    
    const highRiskWords = [
      'viagra', 'pills', 'weight loss', 'get rich', 'work from home',
      'nigerian prince', 'inheritance', 'winner', 'selected'
    ];
    
    const mediumRiskWords = [
      'free', 'guarantee', 'no obligation', 'risk free', 'urgent',
      'act now', 'limited time', 'exclusive deal', 'click here'
    ];
    
    const lowRiskWords = [
      'sale', 'discount', 'offer', 'special', 'new', 'important'
    ];

    // Check high risk words (3 points each)
    for (const word of highRiskWords) {
      if (content.includes(word)) {
        score += 3;
        flags.push(`high_risk_word: ${word}`);
      }
    }

    // Check medium risk words (2 points each)
    for (const word of mediumRiskWords) {
      if (content.includes(word)) {
        score += 2;
        flags.push(`medium_risk_word: ${word}`);
      }
    }

    // Check low risk words (1 point each)
    let lowRiskCount = 0;
    for (const word of lowRiskWords) {
      if (content.includes(word)) {
        lowRiskCount++;
      }
    }
    if (lowRiskCount > 3) {
      score += lowRiskCount;
      flags.push('multiple_promotional_words');
    }

    return score;
  }

  private checkCapitalization(content: string, flags: string[]): number {
    const upperCount = (content.match(/[A-Z]/g) || []).length;
    const totalCount = content.length;
    const ratio = upperCount / totalCount;

    if (ratio > 0.3) {
      flags.push('excessive_caps');
      return 3;
    } else if (ratio > 0.2) {
      flags.push('high_caps');
      return 1;
    }
    
    return 0;
  }

  private checkPunctuation(content: string, flags: string[]): number {
    let score = 0;
    
    // Check excessive exclamation marks
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > 5) {
      score += 2;
      flags.push('excessive_exclamation');
    } else if (exclamationCount > 3) {
      score += 1;
      flags.push('multiple_exclamation');
    }

    // Check excessive question marks
    const questionCount = (content.match(/\?/g) || []).length;
    if (questionCount > 5) {
      score += 1;
      flags.push('excessive_questions');
    }

    // Check for $$$ or similar
    if (content.includes('$$$') || content.includes('€€€')) {
      score += 2;
      flags.push('money_symbols');
    }

    return score;
  }

  private checkLinks(content: string, flags: string[]): number {
    const linkCount = (content.match(/https?:\/\//gi) || []).length;
    
    if (linkCount > 10) {
      flags.push('too_many_links');
      return 3;
    } else if (linkCount > 5) {
      flags.push('multiple_links');
      return 1;
    }
    
    // Check for URL shorteners
    const shorteners = ['bit.ly', 'tinyurl', 'goo.gl', 'ow.ly'];
    for (const shortener of shorteners) {
      if (content.includes(shortener)) {
        flags.push('url_shortener');
        return 2;
      }
    }
    
    return 0;
  }

  private checkImageRatio(htmlContent: string, flags: string[]): number {
    const imgCount = (htmlContent.match(/<img/gi) || []).length;
    const textLength = htmlContent.replace(/<[^>]*>/g, '').length;
    
    if (textLength < 100 && imgCount > 1) {
      flags.push('image_heavy');
      return 2;
    }
    
    return 0;
  }

  private checkSubjectLine(subject: string, flags: string[]): number {
    let score = 0;
    
    // Check if subject is all caps
    if (subject === subject.toUpperCase() && subject.length > 5) {
      flags.push('subject_all_caps');
      score += 2;
    }
    
    // Check for RE: or FWD: spam
    if (subject.match(/^(re:|fwd?:)/i) && !subject.match(/^(re:|fwd?):\s*\w/i)) {
      flags.push('fake_reply');
      score += 3;
    }
    
    // Check for empty or very short subject
    if (subject.length < 3) {
      flags.push('short_subject');
      score += 1;
    }
    
    return score;
  }
}

export const spamScoreService = new SpamScoreService();
```

### FILE: src/services/i18n.service.ts
```typescript
import { logger } from '../config/logger';
import { db } from '../config/database';

interface TranslationData {
  [key: string]: string | TranslationData;
}

export class I18nService {
  private translations: Map<string, TranslationData> = new Map();
  private readonly supportedLanguages = ['en', 'es', 'fr', 'de', 'pt', 'zh', 'ja'];
  private readonly defaultLanguage = 'en';

  async loadTranslations() {
    for (const lang of this.supportedLanguages) {
      const translations = await db('translations')
        .where('language', lang)
        .select('key', 'value');

      const data: TranslationData = {};
      for (const trans of translations) {
        this.setNestedProperty(data, trans.key, trans.value);
      }

      this.translations.set(lang, data);
    }

    logger.info('Translations loaded', { 
      languages: this.supportedLanguages 
    });
  }

  translate(
    key: string,
    language: string = this.defaultLanguage,
    variables?: Record<string, any>
  ): string {
    const lang = this.supportedLanguages.includes(language) 
      ? language 
      : this.defaultLanguage;

    const translations = this.translations.get(lang) || {};
    const value = this.getNestedProperty(translations, key);

    if (!value) {
      logger.warn('Translation missing', { key, language });
      return key;
    }

    // Replace variables
    let translated = value as string;
    if (variables) {
      Object.entries(variables).forEach(([varKey, varValue]) => {
        translated = translated.replace(
          new RegExp(`{{${varKey}}}`, 'g'),
          String(varValue)
        );
      });
    }

    return translated;
  }

  detectLanguage(text: string): string {
    // Simple language detection based on character sets
    // In production, would use a proper language detection library
    
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh'; // Chinese
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'; // Japanese
    if (/[àâäæçéèêëïîôùûüÿœ]/i.test(text)) return 'fr'; // French
    if (/[áéíóúñ¿¡]/i.test(text)) return 'es'; // Spanish
    if (/[äöüßẞ]/i.test(text)) return 'de'; // German
    if (/[ãõçáéíóú]/i.test(text)) return 'pt'; // Portuguese
    
    return 'en';
  }

  async translateTemplate(
    templateContent: string,
    fromLang: string,
    toLang: string
  ): Promise<string> {
    // In production, this would use a translation API (Google Translate, DeepL, etc.)
    // For now, return the original content
    
    logger.info('Template translation requested', { 
      from: fromLang, 
      to: toLang 
    });
    
    return templateContent;
  }

  formatDate(date: Date, language: string): string {
    const locale = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      pt: 'pt-BR',
      zh: 'zh-CN',
      ja: 'ja-JP',
    }[language] || 'en-US';

    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  formatCurrency(amount: number, currency: string, language: string): string {
    const locale = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      pt: 'pt-BR',
      zh: 'zh-CN',
      ja: 'ja-JP',
    }[language] || 'en-US';

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  private setNestedProperty(obj: any, path: string, value: any) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  private getNestedProperty(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (!current[key]) return null;
      current = current[key];
    }
    
    return current;
  }
}

export const i18nService = new I18nService();
```

### FILE: src/types/env-augment.d.ts
```typescript

declare module '../config/env' {
  export interface EnvConfig {
    SENDGRID_WEBHOOK_SECRET?: string;
    AWS_REGION?: string;
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
  }
}
```

### FILE: src/types/events.types.ts
```typescript
export interface BaseEvent {
  eventId: string;
  timestamp: Date;
  venueId: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface PaymentCompletedEvent extends BaseEvent {
  type: 'payment.completed';
  data: {
    orderId: string;
    customerId: string;
    amount: number;
    currency: string;
    tickets: Array<{
      ticketId: string;
      eventName: string;
      eventDate: Date;
      venueName: string;
    }>;
    paymentMethod: string;
  };
}

export interface TicketTransferredEvent extends BaseEvent {
  type: 'ticket.transferred';
  data: {
    ticketId: string;
    fromUserId: string;
    toUserId: string;
    fromEmail: string;
    toEmail: string;
    eventName: string;
    eventDate: Date;
    transferredAt: Date;
  };
}

export interface EventReminderEvent extends BaseEvent {
  type: 'event.reminder';
  data: {
    eventId: string;
    eventName: string;
    eventDate: Date;
    venueName: string;
    venueAddress: string;
    ticketHolders: Array<{
      userId: string;
      email: string;
      ticketId: string;
    }>;
  };
}

export interface EventCancelledEvent extends BaseEvent {
  type: 'event.cancelled';
  data: {
    eventId: string;
    eventName: string;
    eventDate: Date;
    reason: string;
    refundAvailable: boolean;
    affectedTickets: Array<{
      ticketId: string;
      userId: string;
      email: string;
    }>;
  };
}

export interface UserRegisteredEvent extends BaseEvent {
  type: 'user.registered';
  data: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    registrationSource: string;
    verificationToken?: string;
  };
}

export interface PasswordResetEvent extends BaseEvent {
  type: 'user.password_reset';
  data: {
    userId: string;
    email: string;
    resetToken: string;
    expiresAt: Date;
  };
}

export type NotificationEvent = 
  | PaymentCompletedEvent
  | TicketTransferredEvent
  | EventReminderEvent
  | EventCancelledEvent
  | UserRegisteredEvent
  | PasswordResetEvent;
```

### FILE: src/types/notification.types.ts
```typescript
export type NotificationChannel = 'email' | 'sms' | 'push' | 'webhook';
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';
export type NotificationStatus = 'pending' | 'queued' | 'sending' | 'sent' | 'failed' | 'bounced' | 'delivered';
export type ConsentStatus = 'granted' | 'revoked' | 'pending';
export type NotificationType = 'transactional' | 'marketing' | 'system';

export interface NotificationRecipient {
  id: string;
  email?: string;
  phone?: string;
  name?: string;
  timezone?: string;
  locale?: string;
}

export interface NotificationData {
  [key: string]: any;
}

export interface NotificationRequest {
  id?: string;
  venueId: string;
  recipientId: string;
  recipient: NotificationRecipient;
  channel: NotificationChannel;
  type: NotificationType;
  template: string;
  data: NotificationData;
  priority: NotificationPriority;
  scheduledFor?: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface NotificationResponse {
  id: string;
  status: NotificationStatus;
  channel: NotificationChannel;
  sentAt?: Date;
  deliveredAt?: Date;
  failureReason?: string;
  providerMessageId?: string;
  cost?: number;
}

export interface ConsentRecord {
  id: string;
  customerId: string;
  venueId?: string;
  channel: NotificationChannel;
  type: NotificationType;
  status: ConsentStatus;
  grantedAt?: Date;
  revokedAt?: Date;
  expiresAt?: Date;
  source: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SuppressionRecord {
  id: string;
  identifier: string; // email or phone
  channel: NotificationChannel;
  reason: string;
  suppressedAt: Date;
  suppressedBy?: string;
  expiresAt?: Date;
}

export interface NotificationTemplate {
  id: string;
  venueId?: string;
  name: string;
  channel: NotificationChannel;
  type: NotificationType;
  subject?: string;
  content: string;
  htmlContent?: string;
  variables: string[];
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Campaign {
  id: string;
  venueId: string;
  name: string;
  type: NotificationType;
  channel: NotificationChannel;
  templateId: string;
  audienceFilter?: Record<string, any>;
  scheduledFor?: Date;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled';
  stats?: {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    opened?: number;
    clicked?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryTracking {
  id: string;
  notificationId: string;
  status: NotificationStatus;
  attempts: number;
  lastAttemptAt: Date;
  nextRetryAt?: Date;
  providerResponse?: any;
  events: Array<{
    type: string;
    timestamp: Date;
    data?: any;
  }>;
}

export interface VenueNotificationSettings {
  id: string;
  venueId: string;
  dailyEmailLimit?: number;
  dailySmsLimit?: number;
  monthlyEmailLimit?: number;
  monthlySmsLimit?: number;
  blockedChannels?: NotificationChannel[];
  defaultTimezone: string;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  replyToEmail?: string;
  smsCallbackNumber?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  customBranding?: {
    logoUrl?: string;
    primaryColor?: string;
    footerText?: string;
  };
}

export interface NotificationCost {
  id: string;
  notificationId: string;
  venueId: string;
  channel: NotificationChannel;
  provider: string;
  cost: number;
  currency: string;
  billingPeriod: string;
  isPlatformCost: boolean;
  createdAt: Date;
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/notification-service//src/routes/health.routes.ts:12:    await db.raw('SELECT 1');
backend/services/notification-service//src/routes/preferences.routes.ts:19:// Update user preferences
backend/services/notification-service//src/routes/preferences.routes.ts:23:    const updates = req.body;
backend/services/notification-service//src/routes/preferences.routes.ts:24:    const preferences = await preferenceManager.updatePreferences(
backend/services/notification-service//src/routes/preferences.routes.ts:26:      updates,
backend/services/notification-service//src/routes/preferences.routes.ts:28:      'User update'
backend/services/notification-service//src/routes/preferences.routes.ts:32:    logger.error('Failed to update preferences', { error });
backend/services/notification-service//src/routes/preferences.routes.ts:33:    res.status(500).json({ error: 'Failed to update preferences' });
backend/services/notification-service//src/config/rabbitmq.ts:34:        'event.updated',
backend/services/notification-service//src/events/base-event-handler.ts:97:        updated_at: new Date()
backend/services/notification-service//src/migrations/009_analytics.sql:30:    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
backend/services/notification-service//src/migrations/009_analytics.sql:83:    INSERT INTO notification_analytics (
backend/services/notification-service//src/migrations/009_analytics.sql:87:    SELECT 
backend/services/notification-service//src/migrations/009_analytics.sql:101:    DO UPDATE SET
backend/services/notification-service//src/migrations/009_analytics.sql:106:        updated_at = CURRENT_TIMESTAMP;
backend/services/notification-service//src/migrations/008_user_preferences.sql:14:    email_event_updates BOOLEAN DEFAULT true,
backend/services/notification-service//src/migrations/008_user_preferences.sql:22:    push_event_updates BOOLEAN DEFAULT true,
backend/services/notification-service//src/migrations/008_user_preferences.sql:40:    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
backend/services/notification-service//src/migrations/007_delivery_tracking.sql:41:    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
backend/services/notification-service//src/controllers/webhook.controller.ts:26:          await this.updateNotificationStatus(
backend/services/notification-service//src/controllers/webhook.controller.ts:53:      await this.updateNotificationStatus(
backend/services/notification-service//src/controllers/webhook.controller.ts:95:      .update(payload)
backend/services/notification-service//src/controllers/webhook.controller.ts:138:      .update(signatureString)
backend/services/notification-service//src/controllers/webhook.controller.ts:212:      .update(payload)
backend/services/notification-service//src/controllers/webhook.controller.ts:242:  private async updateNotificationStatus(
backend/services/notification-service//src/controllers/webhook.controller.ts:249:      .update({
backend/services/notification-service//src/controllers/webhook.controller.ts:251:        updated_at: new Date(),
backend/services/notification-service//src/models/suppression.model.ts:72:      .update(identifier.toLowerCase().trim())
backend/services/notification-service//src/models/consent.model.ts:22:        updated_at: new Date(),
backend/services/notification-service//src/models/consent.model.ts:102:    await query.update({
backend/services/notification-service//src/models/consent.model.ts:105:      updated_at: new Date(),
backend/services/notification-service//src/middleware/webhook-auth.middleware.ts:30:      .update(Buffer.from(data, 'utf-8'))
backend/services/notification-service//src/middleware/webhook-auth.middleware.ts:63:      .update(payload)
backend/services/notification-service//src/providers/webhook.provider.ts:73:      .update(payload)
backend/services/notification-service//src/services/notification.service.ts:87:      // Update notification status
backend/services/notification-service//src/services/notification.service.ts:88:      await this.updateNotificationStatus(notificationId, result.status);
backend/services/notification-service//src/services/notification.service.ts:168:  private async updateNotificationStatus(id: string, status: string): Promise<void> {
backend/services/notification-service//src/services/notification.service.ts:171:      .update({
backend/services/notification-service//src/services/automation.service.ts:49:      updated_at: new Date(),
backend/services/notification-service//src/services/automation.service.ts:135:          case 'update_customer':
backend/services/notification-service//src/services/automation.service.ts:136:            await this.executeUpdateCustomer(action);
backend/services/notification-service//src/services/automation.service.ts:180:  private async executeUpdateCustomer(action: any) {
backend/services/notification-service//src/services/automation.service.ts:181:    // Update customer attributes
backend/services/notification-service//src/services/automation.service.ts:221:      .where('updated_at', '<', twoHoursAgo)
backend/services/notification-service//src/services/automation.service.ts:246:        this.select('customer_id')
backend/services/notification-service//src/services/preference-manager.ts:14:  emailEventUpdates: boolean;
backend/services/notification-service//src/services/preference-manager.ts:22:  pushEventUpdates: boolean;
backend/services/notification-service//src/services/preference-manager.ts:69:  async updatePreferences(
backend/services/notification-service//src/services/preference-manager.ts:71:    updates: Partial<UserPreferences>,
backend/services/notification-service//src/services/preference-manager.ts:78:    // Map updates to database columns
backend/services/notification-service//src/services/preference-manager.ts:79:    const dbUpdates = this.mapToDatabase(updates);
backend/services/notification-service//src/services/preference-manager.ts:81:    // Update database
backend/services/notification-service//src/services/preference-manager.ts:82:    const [updated] = await db('notification_preferences')
backend/services/notification-service//src/services/preference-manager.ts:84:      .update({
backend/services/notification-service//src/services/preference-manager.ts:85:        ...dbUpdates,
backend/services/notification-service//src/services/preference-manager.ts:86:        updated_at: new Date()
backend/services/notification-service//src/services/preference-manager.ts:91:    await this.recordHistory(userId, current, updates, changedBy, reason);
backend/services/notification-service//src/services/preference-manager.ts:96:    const newPrefs = this.mapToPreferences(updated);
backend/services/notification-service//src/services/preference-manager.ts:98:    logger.info('Preferences updated', {
backend/services/notification-service//src/services/preference-manager.ts:100:      changes: Object.keys(updates)
backend/services/notification-service//src/services/preference-manager.ts:127:      if (type === 'event_update' && !prefs.emailEventUpdates) return false;
backend/services/notification-service//src/services/preference-manager.ts:139:      if (type === 'event_update' && !prefs.pushEventUpdates) return false;
backend/services/notification-service//src/services/preference-manager.ts:159:    const [updated] = await db('notification_preferences')
backend/services/notification-service//src/services/preference-manager.ts:161:      .update({
backend/services/notification-service//src/services/preference-manager.ts:166:        updated_at: new Date()
backend/services/notification-service//src/services/preference-manager.ts:170:    if (updated) {
backend/services/notification-service//src/services/preference-manager.ts:171:      this.cache.delete(updated.user_id);
backend/services/notification-service//src/services/preference-manager.ts:172:      logger.info('User unsubscribed', { userId: updated.user_id });
backend/services/notification-service//src/services/preference-manager.ts:191:        updated_at: new Date()
backend/services/notification-service//src/services/preference-manager.ts:207:      emailEventUpdates: row.email_event_updates,
backend/services/notification-service//src/services/preference-manager.ts:215:      pushEventUpdates: row.push_event_updates,
backend/services/notification-service//src/services/preference-manager.ts:240:    if (prefs.emailEventUpdates !== undefined) mapped.email_event_updates = prefs.emailEventUpdates;
backend/services/notification-service//src/services/preference-manager.ts:248:    if (prefs.pushEventUpdates !== undefined) mapped.push_event_updates = prefs.pushEventUpdates;
backend/services/notification-service//src/services/analytics.service.ts:51:      .select('status')
backend/services/notification-service//src/services/analytics.service.ts:161:    const costs = await query.select('channel', 'venue_id').sum('cost as total').groupBy('channel', 'venue_id');
backend/services/notification-service//src/services/analytics.service.ts:254:      .select(db.raw(`${truncateFunc} as period`))
backend/services/notification-service//src/services/analytics.service.ts:289:      .select('template')
backend/services/notification-service//src/services/analytics.service.ts:334:      .where('updated_at', '>=', startDate)
backend/services/notification-service//src/services/analytics.service.ts:335:      .where('updated_at', '<=', endDate)
backend/services/notification-service//src/services/analytics.service.ts:350:      .select('bounce_type')
backend/services/notification-service//src/services/preference.service.ts:47:  async updatePreferences(
backend/services/notification-service//src/services/preference.service.ts:49:    updates: Partial<CustomerPreferences>
backend/services/notification-service//src/services/preference.service.ts:58:        .update({
backend/services/notification-service//src/services/preference.service.ts:59:          email_preferences: updates.email ? JSON.stringify(updates.email) : existing.email_preferences,
backend/services/notification-service//src/services/preference.service.ts:60:          sms_preferences: updates.sms ? JSON.stringify(updates.sms) : existing.sms_preferences,
backend/services/notification-service//src/services/preference.service.ts:61:          timezone: updates.timezone || existing.timezone,
backend/services/notification-service//src/services/preference.service.ts:62:          language: updates.language || existing.language,
backend/services/notification-service//src/services/preference.service.ts:63:          quiet_hours: updates.quietHours ? JSON.stringify(updates.quietHours) : existing.quiet_hours,
backend/services/notification-service//src/services/preference.service.ts:64:          updated_at: new Date(),
backend/services/notification-service//src/services/preference.service.ts:68:      const merged = { ...defaults, ...updates };
backend/services/notification-service//src/services/preference.service.ts:79:        updated_at: new Date(),
backend/services/notification-service//src/services/preference.service.ts:83:    logger.info('Customer preferences updated', { customerId });
backend/services/notification-service//src/services/preference.service.ts:115:      await this.updatePreferences(decoded.customerId, preferences);
backend/services/notification-service//src/services/preference.service.ts:175:        .select('engagement_events.*'),
backend/services/notification-service//src/services/wallet-pass.service.ts:194:      .update(JSON.stringify(data))
backend/services/notification-service//src/services/template.service.ts:165:  async createTemplate(template: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationTemplate> {
backend/services/notification-service//src/services/template.service.ts:173:        updated_at: new Date(),
backend/services/notification-service//src/services/template.service.ts:185:  async updateTemplate(
backend/services/notification-service//src/services/template.service.ts:187:    updates: Partial<NotificationTemplate>
backend/services/notification-service//src/services/template.service.ts:189:    const [updated] = await db(this.tableName)
backend/services/notification-service//src/services/template.service.ts:191:      .update({
backend/services/notification-service//src/services/template.service.ts:192:        ...updates,
backend/services/notification-service//src/services/template.service.ts:193:        updated_at: new Date(),
backend/services/notification-service//src/services/template.service.ts:198:    const template = this.mapToTemplate(updated);
backend/services/notification-service//src/services/template.service.ts:219:      updatedAt: row.updated_at,
backend/services/notification-service//src/services/rate-limiter.ts:254:    // Update user limit
backend/services/notification-service//src/services/rate-limiter.ts:262:    // Update global limit
backend/services/notification-service//src/services/retry.service.ts:58:    // Update retry count
backend/services/notification-service//src/services/retry.service.ts:61:      .update({
backend/services/notification-service//src/services/retry.service.ts:64:        updated_at: new Date(),
backend/services/notification-service//src/services/engagement-tracking.service.ts:20:        .update({
backend/services/notification-service//src/services/engagement-tracking.service.ts:23:          updated_at: new Date(),
backend/services/notification-service//src/services/engagement-tracking.service.ts:50:      // Update notification tracking
backend/services/notification-service//src/services/engagement-tracking.service.ts:53:        .update({
backend/services/notification-service//src/services/engagement-tracking.service.ts:60:          updated_at: new Date(),
backend/services/notification-service//src/services/engagement-tracking.service.ts:151:      .update(token)
backend/services/notification-service//src/services/engagement-tracking.service.ts:163:        .update(data)
backend/services/notification-service//src/services/engagement-tracking.service.ts:191:      .select(
backend/services/notification-service//src/services/notification-orchestrator.ts:54:      const venues = await db('venues').select('id');
backend/services/notification-service//src/services/notification-orchestrator.ts:89:        // Calculate and update health score
backend/services/notification-service//src/services/campaign.service.ts:27:      updated_at: new Date(),
backend/services/notification-service//src/services/campaign.service.ts:43:    // Update status
backend/services/notification-service//src/services/campaign.service.ts:46:      .update({ 
backend/services/notification-service//src/services/campaign.service.ts:48:        updated_at: new Date()
backend/services/notification-service//src/services/campaign.service.ts:96:    // Update campaign stats
backend/services/notification-service//src/services/campaign.service.ts:99:      .update({
backend/services/notification-service//src/services/campaign.service.ts:109:        updated_at: new Date(),
backend/services/notification-service//src/services/analytics.ts:33:      await this.updateHourlyMetrics({
backend/services/notification-service//src/services/analytics.ts:61:      await this.updateHourlyMetrics({
backend/services/notification-service//src/services/analytics.ts:98:      // Update metrics
backend/services/notification-service//src/services/analytics.ts:100:        await this.updateMetricForNotification(data.notificationId, 'total_opened');
backend/services/notification-service//src/services/analytics.ts:102:        await this.updateMetricForNotification(data.notificationId, 'total_clicked');
backend/services/notification-service//src/services/analytics.ts:152:      .select(
backend/services/notification-service//src/services/analytics.ts:209:      .select('hour', 'channel', 'total_sent', 'total_delivered', 'total_failed')
backend/services/notification-service//src/services/analytics.ts:228:      .select(
backend/services/notification-service//src/services/analytics.ts:250:      .select('action')
backend/services/notification-service//src/services/analytics.ts:268:  private async updateHourlyMetrics(data: {
backend/services/notification-service//src/services/analytics.ts:294:    // Build update data object safely
backend/services/notification-service//src/services/analytics.ts:295:    const updateData: any = {};
backend/services/notification-service//src/services/analytics.ts:300:      updateData.total_sent = db.raw('COALESCE(total_sent, 0) + ?', [data.increment]);
backend/services/notification-service//src/services/analytics.ts:302:      updateData.total_delivered = db.raw('COALESCE(total_delivered, 0) + ?', [data.increment]);
backend/services/notification-service//src/services/analytics.ts:304:      updateData.total_failed = db.raw('COALESCE(total_failed, 0) + ?', [data.increment]);
backend/services/notification-service//src/services/analytics.ts:306:      updateData.total_bounced = db.raw('COALESCE(total_bounced, 0) + ?', [data.increment]);
backend/services/notification-service//src/services/analytics.ts:308:      updateData.total_opened = db.raw('COALESCE(total_opened, 0) + ?', [data.increment]);
backend/services/notification-service//src/services/analytics.ts:310:      updateData.total_clicked = db.raw('COALESCE(total_clicked, 0) + ?', [data.increment]);
backend/services/notification-service//src/services/analytics.ts:314:      updateData.avg_delivery_time_ms = db.raw(
backend/services/notification-service//src/services/analytics.ts:327:      updated_at: now
backend/services/notification-service//src/services/analytics.ts:340:      .merge(updateData);
backend/services/notification-service//src/services/analytics.ts:343:  private async updateMetricForNotification(
backend/services/notification-service//src/services/analytics.ts:353:    await this.updateHourlyMetrics({
backend/services/notification-service//src/services/campaign.service.v2.ts:56:      updated_at: new Date(),
backend/services/notification-service//src/services/campaign.service.v2.ts:80:    // Update status
backend/services/notification-service//src/services/campaign.service.v2.ts:83:      .update({ 
backend/services/notification-service//src/services/campaign.service.v2.ts:86:        updated_at: new Date()
backend/services/notification-service//src/services/campaign.service.v2.ts:131:    // Update campaign with final stats
backend/services/notification-service//src/services/campaign.service.v2.ts:134:      .update({
backend/services/notification-service//src/services/campaign.service.v2.ts:138:        updated_at: new Date(),
backend/services/notification-service//src/services/campaign.service.v2.ts:158:        // Select variant for A/B testing
backend/services/notification-service//src/services/campaign.service.v2.ts:163:          const selected = this.selectVariant(variants, recipient.id);
backend/services/notification-service//src/services/campaign.service.v2.ts:164:          templateId = selected.templateId;
backend/services/notification-service//src/services/campaign.service.v2.ts:165:          variantId = selected.id;
backend/services/notification-service//src/services/campaign.service.v2.ts:252:    return await query.select(
backend/services/notification-service//src/services/campaign.service.v2.ts:279:  private selectVariant(variants: ABTestVariant[], recipientId: string): ABTestVariant {
backend/services/notification-service//src/services/campaign.service.v2.ts:438:      updated_at: new Date(),
backend/services/notification-service//src/services/delivery-tracker.ts:48:      // Update notification history
backend/services/notification-service//src/services/delivery-tracker.ts:51:        .update({
backend/services/notification-service//src/services/delivery-tracker.ts:60:          updated_at: new Date()
backend/services/notification-service//src/services/delivery-tracker.ts:63:      // Update daily stats
backend/services/notification-service//src/services/delivery-tracker.ts:64:      await this.updateStats(data);
backend/services/notification-service//src/services/delivery-tracker.ts:118:    // Update retry_after timestamp
backend/services/notification-service//src/services/delivery-tracker.ts:121:      .update({
backend/services/notification-service//src/services/delivery-tracker.ts:172:  private async updateStats(data: DeliveryTrackingData): Promise<void> {
backend/services/notification-service//src/services/delivery-tracker.ts:177:        INSERT INTO notification_delivery_stats (
backend/services/notification-service//src/services/delivery-tracker.ts:183:        DO UPDATE SET
backend/services/notification-service//src/services/delivery-tracker.ts:189:          updated_at = CURRENT_TIMESTAMP
backend/services/notification-service//src/services/delivery-tracker.ts:201:      logger.error('Failed to update stats', { error });
backend/services/notification-service//src/services/delivery-tracker.ts:216:    return query.select(
backend/services/notification-service//src/services/notification.service.v2.ts:82:      // Update status to sending
backend/services/notification-service//src/services/notification.service.v2.ts:83:      await this.updateNotificationStatus(id, 'sending');
backend/services/notification-service//src/services/notification.service.v2.ts:107:      // Update tracking with result
backend/services/notification-service//src/services/notification.service.v2.ts:108:      await this.updateNotificationStatus(id, result.status, result);
backend/services/notification-service//src/services/notification.service.v2.ts:134:        await this.updateNotificationStatus(id, 'queued', { 
backend/services/notification-service//src/services/notification.service.v2.ts:138:        await this.updateNotificationStatus(id, 'failed', { 
backend/services/notification-service//src/services/notification.service.v2.ts:218:      updated_at: new Date(),
backend/services/notification-service//src/services/notification.service.v2.ts:222:  private async updateNotificationStatus(
backend/services/notification-service//src/services/notification.service.v2.ts:227:    const updates: any = {
backend/services/notification-service//src/services/notification.service.v2.ts:229:      updated_at: new Date(),
backend/services/notification-service//src/services/notification.service.v2.ts:233:      updates.sent_at = new Date();
backend/services/notification-service//src/services/notification.service.v2.ts:237:      updates.delivered_at = new Date();
backend/services/notification-service//src/services/notification.service.v2.ts:241:      updates.failure_reason = additionalData.failureReason;
backend/services/notification-service//src/services/notification.service.v2.ts:245:      updates.provider_message_id = additionalData.providerMessageId;
backend/services/notification-service//src/services/notification.service.v2.ts:250:      .update(updates);
backend/services/notification-service//src/services/spam-score.service.ts:72:      'nigerian prince', 'inheritance', 'winner', 'selected'
backend/services/notification-service//src/services/i18n.service.ts:17:        .select('key', 'value');
backend/services/notification-service//src/templates/sms/payment-failed.txt:1:TicketToken: Payment failed for {{eventName}}. Please update payment method: {{shortUrl}}
backend/services/notification-service//src/types/notification.types.ts:84:  updatedAt: Date;
backend/services/notification-service//src/types/notification.types.ts:106:  updatedAt: Date;

### All JOIN operations:
backend/services/notification-service//src/config/database.ts:18:    directory: path.join(__dirname, '../migrations')
backend/services/notification-service//src/providers/email/mock-email.provider.ts:78:      throw new Error(`Email bounced: ${recipients.join(', ')}`);
backend/services/notification-service//src/services/notification.service.ts:31:    const templateDir = path.join(__dirname, '../templates/email');
backend/services/notification-service//src/services/notification.service.ts:40:            path.join(templateDir, file),
backend/services/notification-service//src/services/analytics.service.ts:248:      throw new Error(`Invalid metric: ${metric}. Must be one of: ${allowedMetrics.join(', ')}`);
backend/services/notification-service//src/services/preference.service.ts:173:        .join('notification_tracking', 'engagement_events.notification_id', 'notification_tracking.id')
backend/services/notification-service//src/services/template.service.ts:155:    const templatePath = path.join(__dirname, '../templates/email', `${templateName}.hbs`);
backend/services/notification-service//src/services/rich-media.service.ts:138:          `).join('')}
backend/services/notification-service//src/services/template-registry.ts:127:    const templatePath = path.join(
backend/services/notification-service//src/services/campaign.service.v2.ts:248:      // This would join with ticket purchases

### All WHERE clauses:
backend/services/notification-service//src/migrations/009_analytics.sql:93:        COUNT(*) FILTER (WHERE delivery_status = 'sent') as total_sent,
backend/services/notification-service//src/migrations/009_analytics.sql:94:        COUNT(*) FILTER (WHERE delivery_status = 'delivered') as total_delivered,
backend/services/notification-service//src/migrations/009_analytics.sql:95:        COUNT(*) FILTER (WHERE delivery_status = 'failed') as total_failed,
backend/services/notification-service//src/migrations/009_analytics.sql:96:        COUNT(*) FILTER (WHERE delivery_status = 'bounced') as total_bounced
backend/services/notification-service//src/migrations/009_analytics.sql:98:    WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
backend/services/notification-service//src/migrations/008_user_preferences.sql:46:WHERE unsubscribe_token IS NOT NULL;
backend/services/notification-service//src/migrations/008_user_preferences.sql:50:WHERE unsubscribed_at IS NOT NULL;
backend/services/notification-service//src/migrations/007_delivery_tracking.sql:19:WHERE delivery_status IN ('pending', 'retrying');
backend/services/notification-service//src/migrations/007_delivery_tracking.sql:23:WHERE retry_after IS NOT NULL AND should_retry = true;

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import knex from 'knex';
import path from 'path';

export const db = knex({
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'tickettoken',
    password: process.env.DB_PASSWORD || ''
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: path.join(__dirname, '../migrations')
  }
});

export async function closeDatabaseConnections(): Promise<void> {
  await db.destroy();
}
```
### .env.example
```
# ================================================
# NOTIFICATION-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: notification-service
# Port: 3008
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=notification-service           # Service identifier

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Email Configuration ====
SMTP_HOST=smtp.gmail.com                       # SMTP server host
SMTP_PORT=587                                  # SMTP server port
SMTP_SECURE=false                              # Use TLS
SMTP_USER=<EMAIL_ADDRESS>                      # SMTP username
SMTP_PASSWORD=<EMAIL_PASSWORD>                 # SMTP password
EMAIL_FROM=noreply@tickettoken.com            # From email address

# ==== SMS Configuration (Optional) ====
TWILIO_ACCOUNT_SID=<TWILIO_SID>               # Twilio account SID
TWILIO_AUTH_TOKEN=<TWILIO_TOKEN>              # Twilio auth token
TWILIO_PHONE_NUMBER=<TWILIO_PHONE>            # Twilio phone number

# ==== Push Notifications (Optional) ====
FCM_SERVER_KEY=<FCM_KEY>                      # Firebase Cloud Messaging key

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/services/notification.service.ts
```typescript
import * as fs from 'fs';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import * as path from 'path';
import * as handlebars from 'handlebars';
import { EmailProvider } from '../providers/email/email.provider';
import { SMSProvider } from '../providers/sms/sms.provider';
import { PushProvider } from '../providers/push/push.provider';
import { NotificationRequest, NotificationResponse } from '../types/notification.types';
import { logger } from '../config/logger';
import { db } from '../config/database';

export class NotificationService {
  async getNotificationStatus(_id: string): Promise<'queued'|'sent'|'failed'|'unknown'> {
    // compile-time stub; replace with real lookup when wired
    return 'queued';
  }

  private emailProvider: EmailProvider;
  private smsProvider: SMSProvider;
  private pushProvider: PushProvider;
  private templates: Map<string, handlebars.TemplateDelegate> = new Map();

  constructor() {
    this.emailProvider = new EmailProvider();
    this.smsProvider = new SMSProvider();
    this.pushProvider = new PushProvider();
    this.loadTemplates();
  }

  private loadTemplates() {
    const templateDir = path.join(__dirname, '../templates/email');
    
    try {
      const files = fs.readdirSync(templateDir);
      
      files.forEach(file => {
        if (file.endsWith('.hbs')) {
          const templateName = file.replace('.hbs', '');
          const templateContent = fs.readFileSync(
            path.join(templateDir, file),
            'utf-8'
          );
          const compiled = handlebars.compile(templateContent);
          this.templates.set(templateName, compiled);
          logger.info(`Loaded template: ${templateName}`);
        }
      });
    } catch (error) {
      logger.error('Failed to load templates:', error);
    }
  }

  async send(request: NotificationRequest): Promise<NotificationResponse> {
    try {
      // Check consent
      const hasConsent = await this.checkConsent(
        request.recipientId,
        request.channel,
        request.type
      );

      if (!hasConsent && request.type === 'marketing') {
        logger.info(`No consent for marketing notification to ${request.recipientId}`);
        return { id: '', status: 'queued', channel: 'email' };
      }

      // Store notification record
      const notificationId = await this.storeNotification(request);

      // Process based on channel
      let result: NotificationResponse;
      
      switch (request.channel) {
        case 'email':
          result = await this.sendEmail(request);
          break;
        case 'sms':
          result = await this.sendSMS(request);
          break;
        case 'push':
          result = await this.sendPush(request);
          break;
        default:
          throw new Error(`Unsupported channel: ${request.channel}`);
      }

      // Update notification status
      await this.updateNotificationStatus(notificationId, result.status);

      return result;
      
    } catch (error) {
      logger.error('Failed to send notification:', error);
      throw error;
    }
  }

  private async sendEmail(request: NotificationRequest): Promise<NotificationResponse> {
    // Get template
    const template = this.templates.get(request.template);
    
    if (!template) {
      throw new Error(`Template not found: ${request.template}`);
    }

    // Render template with data
    const html = template(request.data);
    
    // Extract subject from template or use default
    const subject = request.data.subject || this.getSubjectForTemplate(request.template);

    // Send via provider
    return await this.emailProvider.send({
      to: request.recipient.email!,
      subject,
      html,
      from: process.env.EMAIL_FROM || 'noreply@tickettoken.com'
    });
  }

  private async sendSMS(request: NotificationRequest): Promise<NotificationResponse> {
    return await this.smsProvider.send({
      to: request.recipient.phone!,
      message: request.data.message || 'TicketToken notification'
    });
  }

  private async sendPush(request: NotificationRequest): Promise<NotificationResponse> {
    return await this.pushProvider.send({
      token: (request as any).recipient?.pushToken as any,
      title: request.data.title,
      body: request.data.body,
      data: request.data
    });
  }

  private async checkConsent(recipientId: string, channel: string, type: string): Promise<boolean> {
    // Check consent in database
    const consent = await db('consent')
      .where({
        customer_id: recipientId,
        channel,
        type,
        granted: true
      })
      .first();

    return !!consent;
  }

  private async storeNotification(request: NotificationRequest): Promise<string> {
    const [notification] = await db('notifications')
      .insert({
        venue_id: request.venueId,
        recipient_id: request.recipientId,
        channel: request.channel,
        type: request.type,
        template: request.template,
        priority: request.priority,
        data: JSON.stringify(request.data),
        status: 'pending'
      })
      .returning('id');

    return notification.id;
  }

  private async updateNotificationStatus(id: string, status: string): Promise<void> {
    await db('notifications')
      .where({ id })
      .update({
        status,
        sent_at: status === 'sent' ? new Date() : null
      });
  }

  private getSubjectForTemplate(template: string): string {
    const subjects: Record<string, string> = {
      'order-confirmation': 'Order Confirmed - Your tickets are ready!',
      'payment-failed': 'Payment Failed - Action required',
      'refund-processed': 'Refund Processed Successfully'
    };

    return subjects[template] || 'TicketToken Notification';
  }
}

export const notificationService = new NotificationService();
```

### FILE: src/services/automation.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { notificationServiceV2 } from './notification.service.v2';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';

interface AutomationTrigger {
  id: string;
  venueId: string;
  name: string;
  triggerType: 'event' | 'time' | 'behavior' | 'api';
  conditions: any;
  actions: any[];
  enabled: boolean;
}

export class AutomationService {
  private triggers: Map<string, cron.ScheduledTask> = new Map();

  async initializeAutomations() {
    const automations = await db('automation_triggers')
      .where('enabled', true);

    for (const automation of automations) {
      await this.setupTrigger(automation);
    }

    logger.info('Automations initialized', { count: automations.length });
  }

  async createAutomation(automation: {
    venueId: string;
    name: string;
    triggerType: AutomationTrigger['triggerType'];
    conditions: any;
    actions: any[];
  }): Promise<string> {
    const id = uuidv4();

    await db('automation_triggers').insert({
      id,
      venue_id: automation.venueId,
      name: automation.name,
      trigger_type: automation.triggerType,
      conditions: JSON.stringify(automation.conditions),
      actions: JSON.stringify(automation.actions),
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await this.setupTrigger({
      id,
      ...automation,
      enabled: true,
    });

    logger.info('Automation created', { id, name: automation.name });
    return id;
  }

  private async setupTrigger(trigger: any) {
    switch (trigger.trigger_type || trigger.triggerType) {
      case 'time':
        this.setupTimeTrigger(trigger);
        break;
      case 'event':
        this.setupEventTrigger(trigger);
        break;
      case 'behavior':
        this.setupBehaviorTrigger(trigger);
        break;
    }
  }

  private setupTimeTrigger(trigger: any) {
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    if (conditions.cronExpression) {
      const task = cron.schedule(conditions.cronExpression, async () => {
        await this.executeActions(trigger);
      });

      this.triggers.set(trigger.id, task);
      logger.info('Time trigger scheduled', { 
        id: trigger.id, 
        cron: conditions.cronExpression 
      });
    }
  }

  private setupEventTrigger(trigger: any) {
    // Register event listener for specific events
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    // This would integrate with your event system
    logger.info('Event trigger registered', { 
      id: trigger.id, 
      event: conditions.eventName 
    });
  }

  private setupBehaviorTrigger(trigger: any) {
    // Set up behavior-based triggers
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    // Examples:
    // - Customer hasn't purchased in 30 days
    // - Customer viewed event 3 times
    // - Cart abandoned for 2 hours
    
    logger.info('Behavior trigger configured', { 
      id: trigger.id, 
      behavior: conditions.behaviorType 
    });
  }

  private async executeActions(trigger: any) {
    const actions = typeof trigger.actions === 'string' 
      ? JSON.parse(trigger.actions) 
      : trigger.actions;

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'send_notification':
            await this.executeSendNotification(trigger.venue_id, action);
            break;
          case 'update_customer':
            await this.executeUpdateCustomer(action);
            break;
          case 'webhook':
            await this.executeWebhook(action);
            break;
          case 'delay':
            await this.executeDelay(action);
            break;
        }
      } catch (error) {
        logger.error('Failed to execute automation action', {
          triggerId: trigger.id,
          action: action.type,
          error,
        });
      }
    }

    // Log execution
    await db('automation_executions').insert({
      id: uuidv4(),
      trigger_id: trigger.id,
      executed_at: new Date(),
      status: 'completed',
    });
  }

  private async executeSendNotification(venueId: string, action: any) {
    const recipients = await this.getActionRecipients(action);
    
    for (const recipient of recipients) {
      await notificationServiceV2.send({
        venueId,
        recipientId: recipient.id,
        recipient,
        channel: action.channel || 'email',
        type: 'transactional',
        template: action.template,
        priority: action.priority || 'normal',
        data: action.data || {},
      });
    }
  }

  private async executeUpdateCustomer(action: any) {
    // Update customer attributes
    logger.info('Updating customer', action);
  }

  private async executeWebhook(action: any) {
    // Call external webhook
    logger.info('Calling webhook', { url: action.url });
  }

  private async executeDelay(action: any) {
    const delay = action.duration || 60000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async getActionRecipients(action: any): Promise<any[]> {
    // Get recipients based on action criteria
    if (action.recipientQuery) {
      // Execute dynamic query
      return [];
    }

    if (action.recipientIds) {
      // Get specific recipients
      return action.recipientIds.map((id: string) => ({
        id,
        email: `${id}@example.com`, // Would fetch from DB
      }));
    }

    return [];
  }

  // Behavioral trigger checks
  async checkAbandonedCarts() {
    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

    // Find abandoned carts
    const abandonedCarts = await db('shopping_carts')
      .where('status', 'active')
      .where('updated_at', '<', twoHoursAgo)
      .whereNull('completed_at');

    for (const cart of abandonedCarts) {
      // Trigger abandoned cart automation
      const triggers = await db('automation_triggers')
        .where('trigger_type', 'behavior')
        .whereRaw(`conditions->>'behaviorType' = 'cart_abandoned'`)
        .where('venue_id', cart.venue_id)
        .where('enabled', true);

      for (const trigger of triggers) {
        await this.executeActions(trigger);
      }
    }
  }

  async checkReEngagement() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find inactive customers
    const inactiveCustomers = await db('customers')
      .where('last_activity_at', '<', thirtyDaysAgo)
      .whereNotIn('id', function() {
        this.select('customer_id')
          .from('suppression_list')
          .where('channel', 'all');
      });

    logger.info('Found inactive customers', { count: inactiveCustomers.length });
    // Trigger re-engagement campaigns
  }
}

export const automationService = new AutomationService();
```

### FILE: src/services/analytics.service.ts
```typescript
import { db } from '../config/database';
import { redisHelper } from '../config/redis';

interface DeliveryMetrics {
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  bounceRate: number;
  failureRate: number;
}

interface EngagementMetrics {
  opened: number;
  clicked: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
}

interface CostMetrics {
  totalCost: number;
  emailCost: number;
  smsCost: number;
  costPerRecipient: number;
  costByVenue: Record<string, number>;
}

export class NotificationAnalyticsService {
  async getDeliveryMetrics(
    venueId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DeliveryMetrics> {
    let query = db('notification_tracking');

    if (venueId) {
      query = query.where('venue_id', venueId);
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const statusCounts = await query
      .select('status')
      .count('* as count')
      .groupBy('status');

    const metrics: DeliveryMetrics = {
      sent: 0,
      delivered: 0,
      bounced: 0,
      failed: 0,
      pending: 0,
      deliveryRate: 0,
      bounceRate: 0,
      failureRate: 0,
    };

    let total = 0;
    for (const row of statusCounts) {
      const count = parseInt(row.count as string);
      total += count;

      switch (row.status) {
        case 'sent':
          metrics.sent = count;
          break;
        case 'delivered':
          metrics.delivered = count;
          break;
        case 'bounced':
          metrics.bounced = count;
          break;
        case 'failed':
          metrics.failed = count;
          break;
        case 'pending':
        case 'queued':
          metrics.pending += count;
          break;
      }
    }

    if (total > 0) {
      metrics.deliveryRate = (metrics.delivered / total) * 100;
      metrics.bounceRate = (metrics.bounced / total) * 100;
      metrics.failureRate = (metrics.failed / total) * 100;
    }

    // Cache metrics for dashboard
    await redisHelper.setWithTTL(
      `metrics:delivery:${venueId || 'all'}`,
      metrics,
      300 // 5 minutes
    );

    return metrics;
  }

  async getEngagementMetrics(
    venueId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<EngagementMetrics> {
    let query = db('notification_tracking');

    if (venueId) {
      query = query.where('venue_id', venueId);
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const total = await query.clone().count('* as count').first();
    const opened = await query.clone().whereNotNull('opened_at').count('* as count').first();
    const clicked = await query.clone().whereNotNull('clicked_at').count('* as count').first();

    const totalCount = parseInt(total?.count as string || '0');
    const openedCount = parseInt(opened?.count as string || '0');
    const clickedCount = parseInt(clicked?.count as string || '0');

    const metrics: EngagementMetrics = {
      opened: openedCount,
      clicked: clickedCount,
      unsubscribed: 0, // Would need to track this separately
      openRate: totalCount > 0 ? (openedCount / totalCount) * 100 : 0,
      clickRate: totalCount > 0 ? (clickedCount / totalCount) * 100 : 0,
      clickToOpenRate: openedCount > 0 ? (clickedCount / openedCount) * 100 : 0,
    };

    return metrics;
  }

  async getCostMetrics(
    venueId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<CostMetrics> {
    let query = db('notification_costs');

    if (venueId) {
      query = query.where('venue_id', venueId);
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const costs = await query.select('channel', 'venue_id').sum('cost as total').groupBy('channel', 'venue_id');

    const metrics: CostMetrics = {
      totalCost: 0,
      emailCost: 0,
      smsCost: 0,
      costPerRecipient: 0,
      costByVenue: {},
    };

    for (const row of costs) {
      const cost = parseFloat(row.total as string || '0');
      metrics.totalCost += cost;

      if (row.channel === 'email') {
        metrics.emailCost += cost;
      } else if (row.channel === 'sms') {
        metrics.smsCost += cost;
      }

      if (row.venue_id) {
        metrics.costByVenue[row.venue_id] =
          (metrics.costByVenue[row.venue_id] || 0) + cost;
      }
    }

    // Calculate cost per recipient
    const recipientCount = await db('notification_tracking')
      .modify((qb) => {
        if (venueId) qb.where('venue_id', venueId);
        if (startDate) qb.where('created_at', '>=', startDate);
        if (endDate) qb.where('created_at', '<=', endDate);
      })
      .countDistinct('recipient_id as count')
      .first();

    const recipients = parseInt(recipientCount?.count as string || '1');
    metrics.costPerRecipient = metrics.totalCost / recipients;

    return metrics;
  }

  async getVenueHealthScore(venueId: string): Promise<number> {
    // Calculate a health score based on various metrics
    const delivery = await this.getDeliveryMetrics(venueId);
    const engagement = await this.getEngagementMetrics(venueId);

    let score = 100;

    // Deduct points for poor metrics
    if (delivery.bounceRate > 5) score -= 10;
    if (delivery.bounceRate > 10) score -= 20;
    if (delivery.failureRate > 5) score -= 10;
    if (engagement.openRate < 20) score -= 10;
    if (engagement.clickRate < 2) score -= 10;

    // Bonus points for good metrics
    if (delivery.deliveryRate > 95) score += 5;
    if (engagement.openRate > 30) score += 5;
    if (engagement.clickRate > 5) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  async getTimeSeriesMetrics(
    venueId: string,
    metric: 'sent' | 'delivered' | 'opened' | 'clicked',
    period: 'hour' | 'day' | 'week' | 'month',
    startDate: Date,
    endDate: Date
  ) {
    // SECURITY FIX: Use whitelist approach for date truncation
    const periodFunctions: Record<string, string> = {
      hour: "date_trunc('hour', created_at)",
      day: "date_trunc('day', created_at)",
      week: "date_trunc('week', created_at)",
      month: "date_trunc('month', created_at)",
    };

    // Validate period parameter is in whitelist
    if (!periodFunctions[period]) {
      throw new Error(`Invalid period: ${period}. Must be one of: hour, day, week, month`);
    }

    // Validate metric parameter is in allowed list
    const allowedMetrics = ['sent', 'delivered', 'opened', 'clicked'];
    if (!allowedMetrics.includes(metric)) {
      throw new Error(`Invalid metric: ${metric}. Must be one of: ${allowedMetrics.join(', ')}`);
    }

    const truncateFunc = periodFunctions[period];

    let query = db('notification_tracking')
      .select(db.raw(`${truncateFunc} as period`))
      .where('venue_id', venueId)
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .groupBy('period')
      .orderBy('period');

    switch (metric) {
      case 'sent':
        query = query.count('* as value').where('status', 'sent');
        break;
      case 'delivered':
        query = query.count('* as value').where('status', 'delivered');
        break;
      case 'opened':
        query = query.count('* as value').whereNotNull('opened_at');
        break;
      case 'clicked':
        query = query.count('* as value').whereNotNull('clicked_at');
        break;
    }

    const results = await query;

    return results.map(row => ({
      period: row.period,
      value: parseInt(row.value as string),
    }));
  }

  async getTopPerformingTemplates(
    venueId?: string,
    limit: number = 10
  ) {
    let query = db('notification_tracking')
      .select('template')
      .count('* as total')
      .sum(db.raw('CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END as opens'))
      .sum(db.raw('CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END as clicks'))
      .groupBy('template')
      .orderBy('opens', 'desc')
      .limit(limit);

    if (venueId) {
      query = query.where('venue_id', venueId);
    }

    const results = await query;

    return results.map(row => ({
      template: row.template,
      total: parseInt(row.total as string),
      opens: parseInt(row.opens as string || '0'),
      clicks: parseInt(row.clicks as string || '0'),
      openRate: parseInt(row.total as string) > 0
        ? (parseInt(row.opens as string || '0') / parseInt(row.total as string)) * 100
        : 0,
      clickRate: parseInt(row.total as string) > 0
        ? (parseInt(row.clicks as string || '0') / parseInt(row.total as string)) * 100
        : 0,
    }));
  }

  async generateComplianceReport(
    venueId: string,
    startDate: Date,
    endDate: Date
  ) {
    // Consent metrics
    const consentGranted = await db('consent_records')
      .where('venue_id', venueId)
      .where('status', 'granted')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .count('* as count')
      .first();

    const consentRevoked = await db('consent_records')
      .where('venue_id', venueId)
      .where('status', 'revoked')
      .where('updated_at', '>=', startDate)
      .where('updated_at', '<=', endDate)
      .count('* as count')
      .first();

    // Suppression metrics
    const suppressions = await db('suppression_list')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .count('* as count')
      .first();

    // Bounce metrics
    const bounces = await db('bounces')
      .where('bounced_at', '>=', startDate)
      .where('bounced_at', '<=', endDate)
      .select('bounce_type')
      .count('* as count')
      .groupBy('bounce_type');

    // Failed consent checks
    const failedConsent = await db('notification_tracking')
      .where('venue_id', venueId)
      .where('status', 'failed')
      .where('failure_reason', 'like', '%consent%')
      .where('created_at', '>=', startDate)
      .where('created_at', '<=', endDate)
      .count('* as count')
      .first();

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      consent: {
        granted: parseInt(consentGranted?.count as string || '0'),
        revoked: parseInt(consentRevoked?.count as string || '0'),
      },
      suppressions: parseInt(suppressions?.count as string || '0'),
      bounces: bounces.reduce((acc, row) => {
        acc[row.bounce_type as string] = parseInt(row.count as string);
        return acc;
      }, {} as Record<string, number>),
      blockedByConsent: parseInt(failedConsent?.count as string || '0'),
    };
  }
}

export const notificationAnalytics = new NotificationAnalyticsService();
```

### FILE: src/services/preference.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

interface CustomerPreferences {
  customerId: string;
  email: {
    enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly' | 'monthly';
    categories: string[];
  };
  sms: {
    enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly' | 'monthly';
    categories: string[];
  };
  timezone: string;
  language: string;
  quietHours: {
    enabled: boolean;
    start: number;
    end: number;
  };
}

export class PreferenceService {
  async getPreferences(customerId: string): Promise<CustomerPreferences> {
    const prefs = await db('customer_preferences')
      .where('customer_id', customerId)
      .first();

    if (!prefs) {
      // Return defaults
      return this.getDefaultPreferences(customerId);
    }

    return {
      customerId: prefs.customer_id,
      email: JSON.parse(prefs.email_preferences),
      sms: JSON.parse(prefs.sms_preferences),
      timezone: prefs.timezone,
      language: prefs.language,
      quietHours: JSON.parse(prefs.quiet_hours),
    };
  }

  async updatePreferences(
    customerId: string,
    updates: Partial<CustomerPreferences>
  ): Promise<void> {
    const existing = await db('customer_preferences')
      .where('customer_id', customerId)
      .first();

    if (existing) {
      await db('customer_preferences')
        .where('customer_id', customerId)
        .update({
          email_preferences: updates.email ? JSON.stringify(updates.email) : existing.email_preferences,
          sms_preferences: updates.sms ? JSON.stringify(updates.sms) : existing.sms_preferences,
          timezone: updates.timezone || existing.timezone,
          language: updates.language || existing.language,
          quiet_hours: updates.quietHours ? JSON.stringify(updates.quietHours) : existing.quiet_hours,
          updated_at: new Date(),
        });
    } else {
      const defaults = this.getDefaultPreferences(customerId);
      const merged = { ...defaults, ...updates };

      await db('customer_preferences').insert({
        id: uuidv4(),
        customer_id: customerId,
        email_preferences: JSON.stringify(merged.email),
        sms_preferences: JSON.stringify(merged.sms),
        timezone: merged.timezone,
        language: merged.language,
        quiet_hours: JSON.stringify(merged.quietHours),
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    logger.info('Customer preferences updated', { customerId });
  }

  async getUnsubscribeToken(customerId: string): Promise<string> {
    const token = Buffer.from(
      JSON.stringify({
        customerId,
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
      })
    ).toString('base64url');

    return token;
  }

  async processUnsubscribe(token: string, channel?: 'email' | 'sms'): Promise<void> {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      
      if (decoded.expires < Date.now()) {
        throw new Error('Unsubscribe link expired');
      }

      const preferences = await this.getPreferences(decoded.customerId);
      
      if (channel) {
        preferences[channel].enabled = false;
      } else {
        // Unsubscribe from all
        preferences.email.enabled = false;
        preferences.sms.enabled = false;
      }

      await this.updatePreferences(decoded.customerId, preferences);

      // Add to suppression list
      await db('suppression_list').insert({
        id: uuidv4(),
        identifier: decoded.customerId,
        identifier_hash: decoded.customerId, // Should be hashed in production
        channel: channel || 'all',
        reason: 'customer_unsubscribe',
        suppressed_at: new Date(),
        created_at: new Date(),
      });

      logger.info('Customer unsubscribed', { 
        customerId: decoded.customerId, 
        channel 
      });
    } catch (error) {
      logger.error('Failed to process unsubscribe', { token, error });
      throw error;
    }
  }

  private getDefaultPreferences(customerId: string): CustomerPreferences {
    return {
      customerId,
      email: {
        enabled: true,
        frequency: 'immediate',
        categories: ['transactional', 'marketing'],
      },
      sms: {
        enabled: true,
        frequency: 'immediate',
        categories: ['transactional'],
      },
      timezone: 'America/Chicago',
      language: 'en',
      quietHours: {
        enabled: false,
        start: 22,
        end: 8,
      },
    };
  }

  async exportCustomerData(customerId: string): Promise<any> {
    // GDPR compliance - export all customer notification data
    const [
      preferences,
      consents,
      notifications,
      engagements,
    ] = await Promise.all([
      this.getPreferences(customerId),
      db('consent_records').where('customer_id', customerId),
      db('notification_tracking').where('recipient_id', customerId).limit(100),
      db('engagement_events')
        .join('notification_tracking', 'engagement_events.notification_id', 'notification_tracking.id')
        .where('notification_tracking.recipient_id', customerId)
        .select('engagement_events.*'),
    ]);

    return {
      exportDate: new Date(),
      customerId,
      preferences,
      consents,
      notificationHistory: notifications,
      engagementHistory: engagements,
    };
  }
}

export const preferenceService = new PreferenceService();
```

### FILE: src/services/wallet-pass.service.ts
```typescript
import { logger } from '../config/logger';
import crypto from 'crypto';
import QRCode from 'qrcode';

interface WalletPassData {
  eventName: string;
  venueName: string;
  venueAddress: string;
  eventDate: Date;
  ticketId: string;
  seatInfo?: string;
  customerName: string;
  qrCodeData: string;
}

export class WalletPassService {
  async generateApplePass(data: WalletPassData): Promise<Buffer> {
    try {
      // Apple Wallet pass structure
      const pass = {
        formatVersion: 1,
        passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID || 'pass.com.tickettoken',
        serialNumber: data.ticketId,
        teamIdentifier: process.env.APPLE_TEAM_ID || 'ABCDE12345',
        organizationName: 'TicketToken',
        description: `Ticket for ${data.eventName}`,
        foregroundColor: 'rgb(255, 255, 255)',
        backgroundColor: 'rgb(60, 65, 76)',
        labelColor: 'rgb(255, 255, 255)',
        
        eventTicket: {
          primaryFields: [
            {
              key: 'event',
              label: 'EVENT',
              value: data.eventName,
            },
          ],
          secondaryFields: [
            {
              key: 'loc',
              label: 'VENUE',
              value: data.venueName,
            },
            {
              key: 'date',
              label: 'DATE',
              value: this.formatDate(data.eventDate),
              dateStyle: 'PKDateStyleMedium',
              timeStyle: 'PKDateStyleShort',
            },
          ],
          auxiliaryFields: data.seatInfo ? [
            {
              key: 'seat',
              label: 'SEAT',
              value: data.seatInfo,
            },
            {
              key: 'name',
              label: 'ATTENDEE',
              value: data.customerName,
            },
          ] : [
            {
              key: 'name',
              label: 'ATTENDEE',
              value: data.customerName,
            },
          ],
          backFields: [
            {
              key: 'terms',
              label: 'TERMS & CONDITIONS',
              value: 'This ticket is non-transferable. Valid ID required.',
            },
            {
              key: 'venue-address',
              label: 'VENUE ADDRESS',
              value: data.venueAddress,
            },
          ],
        },
        
        barcode: {
          format: 'PKBarcodeFormatQR',
          message: data.qrCodeData,
          messageEncoding: 'iso-8859-1',
        },
        
        relevantDate: data.eventDate.toISOString(),
      };

      // In production, this would:
      // 1. Create pass.json
      // 2. Generate manifest.json with file hashes
      // 3. Sign the manifest
      // 4. Create .pkpass file (zip archive)
      
      // For now, return mock buffer
      return Buffer.from(JSON.stringify(pass));
    } catch (error) {
      logger.error('Failed to generate Apple Pass', error);
      throw error;
    }
  }

  async generateGooglePass(data: WalletPassData): Promise<string> {
    try {
      // Google Wallet pass structure
      const jwt = {
        iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        payload: {
          eventTicketObjects: [
            {
              id: `${process.env.GOOGLE_ISSUER_ID}.${data.ticketId}`,
              classId: `${process.env.GOOGLE_ISSUER_ID}.event_ticket_class`,
              state: 'ACTIVE',
              ticketHolderName: data.customerName,
              ticketNumber: data.ticketId,
              barcode: {
                type: 'QR_CODE',
                value: data.qrCodeData,
              },
              eventName: {
                defaultValue: {
                  language: 'en-US',
                  value: data.eventName,
                },
              },
              venue: {
                name: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.venueName,
                  },
                },
                address: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.venueAddress,
                  },
                },
              },
              dateTime: {
                start: data.eventDate.toISOString(),
              },
              seatInfo: data.seatInfo ? {
                seat: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.seatInfo,
                  },
                },
              } : undefined,
            },
          ],
        },
      };

      // In production, sign JWT with Google service account
      // For now, return the save URL
      const token = Buffer.from(JSON.stringify(jwt)).toString('base64url');
      return `https://pay.google.com/gp/v/save/${token}`;
    } catch (error) {
      logger.error('Failed to generate Google Pass', error);
      throw error;
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async generatePassQRCode(ticketId: string): Promise<string> {
    const data = {
      ticketId,
      validationUrl: `${process.env.API_URL}/validate/${ticketId}`,
      timestamp: Date.now(),
    };

    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'secret')
      .update(JSON.stringify(data))
      .digest('hex');

    const qrData = {
      ...data,
      signature,
    };

    return await QRCode.toDataURL(JSON.stringify(qrData));
  }
}

export const walletPassService = new WalletPassService();
```

### FILE: src/services/template.service.ts
```typescript
import { db } from '../config/database';
import { NotificationTemplate, NotificationChannel } from '../types/notification.types';
import { logger } from '../config/logger';
import Handlebars from 'handlebars';
import { redisHelper } from '../config/redis';
import { env } from '../config/env';
import * as fs from 'fs/promises';
import * as path from 'path';

export class TemplateService {
  private readonly tableName = 'notification_templates';
  private compiledTemplates: Map<string, Handlebars.TemplateDelegate> = new Map();
  private templates: Map<string, Handlebars.TemplateDelegate> = new Map();

  constructor() {
    this.registerHelpers();
  }

  private registerHelpers() {
    // Register common Handlebars helpers
    Handlebars.registerHelper('formatDate', (date: Date) => {
      return new Date(date).toLocaleDateString();
    });

    Handlebars.registerHelper('formatTime', (date: Date) => {
      return new Date(date).toLocaleTimeString();
    });

    Handlebars.registerHelper('formatCurrency', (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount / 100);
    });

    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    Handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    Handlebars.registerHelper('gte', (a: any, b: any) => a >= b);
    Handlebars.registerHelper('lt', (a: any, b: any) => a < b);
    Handlebars.registerHelper('lte', (a: any, b: any) => a <= b);
  }

  async getTemplate(
    name: string,
    channel: NotificationChannel,
    venueId?: string
  ): Promise<NotificationTemplate | null> {
    // Check cache first
    const cacheKey = `template:${venueId || 'default'}:${channel}:${name}`;
    const cached = await redisHelper.get<NotificationTemplate>(cacheKey);
    if (cached) {
      return cached;
    }

    // Try to find venue-specific template first
    let template = null;
    if (venueId) {
      template = await db(this.tableName)
        .where('venue_id', venueId)
        .andWhere('name', name)
        .andWhere('channel', channel)
        .andWhere('is_active', true)
        .orderBy('version', 'desc')
        .first();
    }

    // Fall back to default template
    if (!template) {
      template = await db(this.tableName)
        .whereNull('venue_id')
        .andWhere('name', name)
        .andWhere('channel', channel)
        .andWhere('is_active', true)
        .orderBy('version', 'desc')
        .first();
    }

    if (template) {
      const mapped = this.mapToTemplate(template);
      // Cache for 1 hour
      await redisHelper.setWithTTL(cacheKey, mapped, env.TEMPLATE_CACHE_TTL);
      return mapped;
    }

    return null;
  }

  async renderTemplate(
    template: NotificationTemplate,
    data: Record<string, any>
  ): Promise<{
    subject?: string;
    content: string;
    htmlContent?: string;
  }> {
    try {
      // Compile and cache template
      const contentKey = `${template.id}:content`;
      if (!this.compiledTemplates.has(contentKey)) {
        this.compiledTemplates.set(contentKey, Handlebars.compile(template.content));
      }

      const htmlKey = `${template.id}:html`;
      if (template.htmlContent && !this.compiledTemplates.has(htmlKey)) {
        this.compiledTemplates.set(htmlKey, Handlebars.compile(template.htmlContent));
      }

      const subjectKey = `${template.id}:subject`;
      if (template.subject && !this.compiledTemplates.has(subjectKey)) {
        this.compiledTemplates.set(subjectKey, Handlebars.compile(template.subject));
      }

      // Render templates with data
      const content = this.compiledTemplates.get(contentKey)!(data);
      const htmlContent = template.htmlContent
        ? this.compiledTemplates.get(htmlKey)!(data)
        : undefined;
      const subject = template.subject
        ? this.compiledTemplates.get(subjectKey)!(data)
        : undefined;

      return { subject, content, htmlContent };
    } catch (error) {
      logger.error('Template rendering failed', {
        templateId: template.id,
        error
      });
      throw new Error('Failed to render template');
    }
  }

  // New render method for file-based templates
  async render(templateName: string, data: any): Promise<string> {
    try {
      // Check if template is already loaded
      if (!this.templates.has(templateName)) {
        await this.loadTemplate(templateName);
      }

      const template = this.templates.get(templateName);
      if (!template) {
        throw new Error(`Template ${templateName} not found`);
      }

      return template(data);
    } catch (error) {
      logger.error(`Failed to render template ${templateName}:`, error);
      // Return a basic fallback
      return `<html><body><h1>${templateName}</h1><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`;
    }
  }

  private async loadTemplate(templateName: string): Promise<void> {
    const templatePath = path.join(__dirname, '../templates/email', `${templateName}.hbs`);
    try {
      const templateContent = await fs.readFile(templatePath, 'utf8');
      const compiled = Handlebars.compile(templateContent);
      this.templates.set(templateName, compiled);
    } catch (error) {
      logger.error(`Failed to load template ${templateName}:`, error);
    }
  }

  async createTemplate(template: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationTemplate> {
    const [created] = await db(this.tableName)
      .insert({
        ...template,
        venue_id: template.venueId,
        is_active: template.isActive,
        html_content: template.htmlContent,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    logger.info('Template created', {
      name: template.name,
      channel: template.channel
    });

    return this.mapToTemplate(created);
  }

  async updateTemplate(
    id: string,
    updates: Partial<NotificationTemplate>
  ): Promise<NotificationTemplate> {
    const [updated] = await db(this.tableName)
      .where('id', id)
      .update({
        ...updates,
        updated_at: new Date(),
      })
      .returning('*');

    // Clear cache
    const template = this.mapToTemplate(updated);
    const cacheKey = `template:${template.venueId || 'default'}:${template.channel}:${template.name}`;
    await redisHelper.delete(cacheKey);

    return template;
  }

  private mapToTemplate(row: any): NotificationTemplate {
    return {
      id: row.id,
      venueId: row.venue_id,
      name: row.name,
      channel: row.channel,
      type: row.type,
      subject: row.subject,
      content: row.content,
      htmlContent: row.html_content,
      variables: row.variables || [],
      isActive: row.is_active,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const templateService = new TemplateService();
```

### FILE: src/services/rich-media.service.ts
```typescript
import { logger } from '../config/logger';

interface RichMediaOptions {
  images?: Array<{
    url: string;
    alt?: string;
    width?: number;
    height?: number;
  }>;
  videos?: Array<{
    url: string;
    thumbnail?: string;
    duration?: number;
  }>;
  buttons?: Array<{
    text: string;
    url: string;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
  cards?: Array<{
    title: string;
    description: string;
    image?: string;
    link?: string;
  }>;
}

export class RichMediaService {
  async processImages(images: RichMediaOptions['images']): Promise<any[]> {
    if (!images) return [];

    const processed: any[] = [];
    for (const image of images) {
      try {
        // In production, this would:
        // 1. Download image if needed
        // 2. Optimize for email (resize, compress)
        // 3. Upload to CDN
        // 4. Return optimized URL
        
        processed.push({
          ...image,
          optimizedUrl: image.url, // Would be CDN URL
          width: image.width || 600,
          height: image.height || 400,
        });
      } catch (error) {
        logger.error('Failed to process image', { url: image.url, error });
      }
    }

    return processed;
  }

  generateEmailHTML(options: RichMediaOptions): string {
    let html = '';

    // Add images
    if (options.images && options.images.length > 0) {
      html += '<div style="margin: 20px 0;">';
      for (const image of options.images) {
        html += `
          <img src="${image.url}" 
               alt="${image.alt || ''}" 
               style="max-width: 100%; height: auto; display: block; margin: 10px auto;"
               width="${image.width || 600}">
        `;
      }
      html += '</div>';
    }

    // Add buttons
    if (options.buttons && options.buttons.length > 0) {
      html += '<div style="margin: 20px 0; text-align: center;">';
      for (const button of options.buttons) {
        const bgColor = {
          primary: '#007bff',
          secondary: '#6c757d',
          danger: '#dc3545',
        }[button.style || 'primary'];

        html += `
          <a href="${button.url}" 
             style="display: inline-block; padding: 12px 24px; margin: 5px;
                    background-color: ${bgColor}; color: white; 
                    text-decoration: none; border-radius: 4px;">
            ${button.text}
          </a>
        `;
      }
      html += '</div>';
    }

    // Add cards
    if (options.cards && options.cards.length > 0) {
      html += '<div style="margin: 20px 0;">';
      for (const card of options.cards) {
        html += `
          <div style="border: 1px solid #ddd; border-radius: 8px; 
                      padding: 15px; margin: 10px 0;">
            ${card.image ? `<img src="${card.image}" style="max-width: 100%; margin-bottom: 10px;">` : ''}
            <h3 style="margin: 10px 0;">${card.title}</h3>
            <p style="margin: 10px 0;">${card.description}</p>
            ${card.link ? `<a href="${card.link}" style="color: #007bff;">Learn more →</a>` : ''}
          </div>
        `;
      }
      html += '</div>';
    }

    return html;
  }

  generateAMPEmail(options: RichMediaOptions): string {
    // Generate AMP-compatible email content
    let amp = `
      <!doctype html>
      <html ⚡4email>
      <head>
        <meta charset="utf-8">
        <script async src="https://cdn.ampproject.org/v0.js"></script>
        <style amp4email-boilerplate>body{visibility:hidden}</style>
      </head>
      <body>
    `;

    // Add AMP carousel for images
    if (options.images && options.images.length > 1) {
      amp += `
        <amp-carousel width="600" height="400" layout="responsive" type="slides">
          ${options.images.map(img => `
            <amp-img src="${img.url}" 
                     width="${img.width || 600}" 
                     height="${img.height || 400}" 
                     layout="responsive"
                     alt="${img.alt || ''}">
            </amp-img>
          `).join('')}
        </amp-carousel>
      `;
    }

    amp += '</body></html>';
    return amp;
  }
}

export const richMediaService = new RichMediaService();
```

### FILE: src/services/queue-manager.service.ts
```typescript
import Bull from 'bull';
import { env } from '../config/env';
import { logger } from '../config/logger';

export class QueueManager {
  private queues: Map<string, Bull.Queue> = new Map();
  private readonly QUEUE_CONFIGS = {
    CRITICAL: { 
      name: 'critical-notifications',
      concurrency: 10,
      maxDelay: 30000, // 30 seconds
      priority: 1
    },
    HIGH: { 
      name: 'high-notifications',
      concurrency: 5,
      maxDelay: 300000, // 5 minutes
      priority: 2
    },
    NORMAL: { 
      name: 'normal-notifications',
      concurrency: 3,
      maxDelay: 1800000, // 30 minutes
      priority: 3
    },
    BULK: { 
      name: 'bulk-notifications',
      concurrency: 1,
      maxDelay: 14400000, // 4 hours
      priority: 4
    }
  };

  constructor() {
    this.initializeQueues();
  }

  private initializeQueues() {
    Object.entries(this.QUEUE_CONFIGS).forEach(([priority, config]) => {
      const queue = new Bull(config.name, {
        redis: {
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD,
        },
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: env.MAX_RETRY_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: env.RETRY_DELAY_MS,
          },
        },
      });

      // Add queue event handlers
      queue.on('completed', (job) => {
        logger.info(`${priority} notification completed`, { jobId: job.id });
      });

      queue.on('failed', (job, err) => {
        logger.error(`${priority} notification failed`, { 
          jobId: job.id, 
          error: err.message 
        });
      });

      queue.on('stalled', (job) => {
        logger.warn(`${priority} notification stalled`, { jobId: job.id });
      });

      this.queues.set(priority, queue);
    });
  }

  async addToQueue(
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'BULK',
    data: any
  ): Promise<Bull.Job> {
    const queue = this.queues.get(priority);
    if (!queue) {
      throw new Error(`Queue for priority ${priority} not found`);
    }

    const config = this.QUEUE_CONFIGS[priority];
    return await queue.add(data, {
      priority: config.priority,
      delay: this.calculateDelay(priority),
    });
  }

  private calculateDelay(_priority: string): number {
    // Implement rate limiting logic here
    // For now, return 0 for immediate processing
    return 0;
  }

  async getQueueMetrics() {
    const metrics: any = {};
    
    for (const [priority, queue] of this.queues) {
      const jobCounts = await queue.getJobCounts();
      metrics[priority] = {
        waiting: jobCounts.waiting,
        active: jobCounts.active,
        completed: jobCounts.completed,
        failed: jobCounts.failed,
        delayed: jobCounts.delayed,
      };
    }
    
    return metrics;
  }

  async pauseQueue(priority: string) {
    const queue = this.queues.get(priority);
    if (queue) {
      await queue.pause();
      logger.info(`Queue ${priority} paused`);
    }
  }

  async resumeQueue(priority: string) {
    const queue = this.queues.get(priority);
    if (queue) {
      await queue.resume();
      logger.info(`Queue ${priority} resumed`);
    }
  }

  async drainQueue(priority: string) {
    const queue = this.queues.get(priority);
    if (queue) {
      await queue.empty();
      logger.info(`Queue ${priority} drained`);
    }
  }

  setupQueueProcessors(processor: (job: Bull.Job) => Promise<any>) {
    this.queues.forEach((queue, priority) => {
      const config = this.QUEUE_CONFIGS[priority as keyof typeof this.QUEUE_CONFIGS];
      queue.process(config.concurrency, processor);
    });
  }
}

export const queueManager = new QueueManager();
```

### FILE: src/services/provider-manager.service.ts
```typescript
import { logger } from '../config/logger';

interface ProviderHealth {
  provider: string;
  healthy: boolean;
  lastCheck: Date;
  failureCount: number;
  successCount: number;
}

export class ProviderManager {
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly MAX_FAILURES = 3;
  
  constructor() {
    this.initializeProviders();
    this.startHealthChecks();
  }

  private initializeProviders() {
    // Initialize provider health tracking
    this.providerHealth.set('sendgrid', {
      provider: 'sendgrid',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('aws-ses', {
      provider: 'aws-ses',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('twilio', {
      provider: 'twilio',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('aws-sns', {
      provider: 'aws-sns',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });
  }

  private startHealthChecks() {
    setInterval(() => {
      this.checkProviderHealth();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private async checkProviderHealth() {
    for (const [name, health] of this.providerHealth) {
      try {
        // Implement actual health check based on provider
        // For now, using the existing connection status
        health.lastCheck = new Date();
        
        // Mark unhealthy if too many failures
        if (health.failureCount >= this.MAX_FAILURES) {
          health.healthy = false;
          logger.warn(`Provider ${name} marked unhealthy`, {
            failureCount: health.failureCount
          });
        }
      } catch (error) {
        logger.error(`Health check failed for ${name}`, error);
      }
    }
  }

  async getHealthyEmailProvider(): Promise<string> {
    // Primary provider
    if (this.providerHealth.get('sendgrid')?.healthy) {
      return 'sendgrid';
    }
    
    // Fallback provider
    if (this.providerHealth.get('aws-ses')?.healthy) {
      logger.info('Failing over to AWS SES from SendGrid');
      return 'aws-ses';
    }
    
    throw new Error('No healthy email providers available');
  }

  async getHealthySmsProvider(): Promise<string> {
    // Primary provider
    if (this.providerHealth.get('twilio')?.healthy) {
      return 'twilio';
    }
    
    // Fallback provider
    if (this.providerHealth.get('aws-sns')?.healthy) {
      logger.info('Failing over to AWS SNS from Twilio');
      return 'aws-sns';
    }
    
    throw new Error('No healthy SMS providers available');
  }

  recordSuccess(provider: string) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.successCount++;
      health.failureCount = 0; // Reset failure count on success
      health.healthy = true;
    }
  }

  recordFailure(provider: string, error: Error) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.failureCount++;
      logger.error(`Provider ${provider} failure`, {
        failureCount: health.failureCount,
        error: error.message
      });
      
      if (health.failureCount >= this.MAX_FAILURES) {
        health.healthy = false;
      }
    }
  }

  getProviderStatus(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }
}

export const providerManager = new ProviderManager();
```

### FILE: src/services/retry.service.ts
```typescript
import { logger } from '../config/logger';
import { db } from '../config/database';

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  factor: number;
}

export class RetryService {
  private readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 5000,
    maxDelay: 300000, // 5 minutes
    factor: 2,
  };

  async shouldRetry(
    notificationId: string,
    error: Error
  ): Promise<{ retry: boolean; delay: number }> {
    // Get current attempt count
    const notification = await db('notification_tracking')
      .where('id', notificationId)
      .first();

    if (!notification) {
      return { retry: false, delay: 0 };
    }

    const attempts = notification.retry_attempts || 0;

    // Check if we should retry based on error type
    if (!this.isRetryableError(error)) {
      logger.info('Error is not retryable', { 
        notificationId, 
        error: error.message 
      });
      return { retry: false, delay: 0 };
    }

    // Check max attempts
    if (attempts >= this.defaultConfig.maxAttempts) {
      logger.warn('Max retry attempts reached', { 
        notificationId, 
        attempts 
      });
      return { retry: false, delay: 0 };
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      this.defaultConfig.baseDelay * Math.pow(this.defaultConfig.factor, attempts),
      this.defaultConfig.maxDelay
    );

    // Update retry count
    await db('notification_tracking')
      .where('id', notificationId)
      .update({
        retry_attempts: attempts + 1,
        next_retry_at: new Date(Date.now() + delay),
        updated_at: new Date(),
      });

    logger.info('Scheduling retry', { 
      notificationId, 
      attempt: attempts + 1, 
      delay 
    });

    return { retry: true, delay };
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Don't retry on permanent failures
    if (
      message.includes('invalid') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not found') ||
      message.includes('bad request')
    ) {
      return false;
    }

    // Retry on temporary failures
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('rate limit') ||
      message.includes('service unavailable') ||
      message.includes('gateway timeout')
    ) {
      return true;
    }

    // Default to retry for unknown errors
    return true;
  }

  async recordRetryMetrics(notificationId: string, success: boolean) {
    const key = success ? 'retry_success' : 'retry_failure';
    await db('notification_tracking')
      .where('id', notificationId)
      .increment(key, 1);
  }
}

export const retryService = new RetryService();
```

### FILE: src/services/engagement-tracking.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export class EngagementTrackingService {
  async trackOpen(trackingId: string, metadata?: any): Promise<void> {
    try {
      const notification = await db('notification_tracking')
        .where('id', trackingId)
        .first();

      if (!notification) {
        logger.warn('Notification not found for open tracking', { trackingId });
        return;
      }

      await db('notification_tracking')
        .where('id', trackingId)
        .update({
          opened_at: notification.opened_at || new Date(),
          open_count: db.raw('open_count + 1'),
          updated_at: new Date(),
        });

      // Track engagement event
      await this.recordEngagementEvent(trackingId, 'open', metadata);

      logger.info('Email open tracked', { trackingId });
    } catch (error) {
      logger.error('Failed to track open', { trackingId, error });
    }
  }

  async trackClick(
    trackingId: string,
    url: string,
    metadata?: any
  ): Promise<void> {
    try {
      const notification = await db('notification_tracking')
        .where('id', trackingId)
        .first();

      if (!notification) {
        logger.warn('Notification not found for click tracking', { trackingId });
        return;
      }

      // Update notification tracking
      await db('notification_tracking')
        .where('id', trackingId)
        .update({
          clicked_at: notification.clicked_at || new Date(),
          click_count: db.raw('click_count + 1'),
          click_data: JSON.stringify({
            ...(notification.click_data ? JSON.parse(notification.click_data) : {}),
            [url]: ((notification.click_data ? JSON.parse(notification.click_data)[url] : 0) || 0) + 1,
          }),
          updated_at: new Date(),
        });

      // Track engagement event
      await this.recordEngagementEvent(trackingId, 'click', {
        url,
        ...metadata,
      });

      logger.info('Link click tracked', { trackingId, url });
    } catch (error) {
      logger.error('Failed to track click', { trackingId, url, error });
    }
  }

  async trackConversion(
    trackingId: string,
    conversionType: string,
    value?: number,
    metadata?: any
  ): Promise<void> {
    try {
      await this.recordEngagementEvent(trackingId, 'conversion', {
        type: conversionType,
        value,
        ...metadata,
      });

      logger.info('Conversion tracked', { 
        trackingId, 
        conversionType, 
        value 
      });
    } catch (error) {
      logger.error('Failed to track conversion', { 
        trackingId, 
        conversionType, 
        error 
      });
    }
  }

  private async recordEngagementEvent(
    notificationId: string,
    eventType: string,
    metadata?: any
  ): Promise<void> {
    await db('engagement_events').insert({
      id: uuidv4(),
      notification_id: notificationId,
      event_type: eventType,
      metadata: JSON.stringify(metadata || {}),
      created_at: new Date(),
    });
  }

  generateTrackingPixel(notificationId: string): string {
    const token = this.generateTrackingToken(notificationId, 'open');
    return `<img src="${process.env.API_URL}/track/open/${token}" width="1" height="1" style="display:none;" />`;
  }

  wrapLinksForTracking(
    html: string,
    notificationId: string
  ): string {
    // Replace all links with tracking links
    return html.replace(
      /<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi,
      (_match, url, rest) => {
        const token = this.generateTrackingToken(notificationId, 'click', url);
        const trackingUrl = `${process.env.API_URL}/track/click/${token}`;
        return `<a href="${trackingUrl}"${rest}>`;
      }
    );
  }

  private generateTrackingToken(
    notificationId: string,
    action: string,
    url?: string
  ): string {
    const data = {
      id: notificationId,
      action,
      url,
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    };

    const token = Buffer.from(JSON.stringify(data)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'secret')
      .update(token)
      .digest('base64url');

    return `${token}.${signature}`;
  }

  async verifyTrackingToken(token: string): Promise<any> {
    try {
      const [data, signature] = token.split('.');
      
      const expectedSignature = crypto
        .createHmac('sha256', process.env.JWT_SECRET || 'secret')
        .update(data)
        .digest('base64url');

      if (signature !== expectedSignature) {
        throw new Error('Invalid token signature');
      }

      const decoded = JSON.parse(Buffer.from(data, 'base64url').toString());
      
      if (decoded.expires < Date.now()) {
        throw new Error('Token expired');
      }

      return decoded;
    } catch (error) {
      logger.error('Invalid tracking token', { token, error });
      throw error;
    }
  }

  async getEngagementScore(recipientId: string): Promise<number> {
    // Calculate engagement score based on recent activity
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await db('notification_tracking')
      .where('recipient_id', recipientId)
      .where('created_at', '>=', thirtyDaysAgo)
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened'),
        db.raw('SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked')
      )
      .first();

    const total = parseInt(stats?.total || '0');
    const opened = parseInt(stats?.opened || '0');
    const clicked = parseInt(stats?.clicked || '0');

    if (total === 0) return 50; // Default score for new recipients

    // Calculate score (0-100)
    const openRate = opened / total;
    const clickRate = clicked / total;

    let score = 50; // Base score
    score += openRate * 30; // Up to 30 points for opens
    score += clickRate * 20; // Up to 20 points for clicks

    return Math.round(Math.min(100, Math.max(0, score)));
  }
}

export const engagementTracking = new EngagementTrackingService();
```

### FILE: src/services/campaign.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { notificationService } from './notification.service';
import { v4 as uuidv4 } from 'uuid';

export class CampaignService {
  private readonly tableName = 'campaigns';

  async createCampaign(campaign: {
    venueId: string;
    name: string;
    templateId: string;
    audienceFilter: any;
    scheduledFor?: Date;
  }) {
    const campaignId = uuidv4();
    
    await db(this.tableName).insert({
      id: campaignId,
      venue_id: campaign.venueId,
      name: campaign.name,
      template_id: campaign.templateId,
      audience_filter: JSON.stringify(campaign.audienceFilter),
      scheduled_for: campaign.scheduledFor,
      status: campaign.scheduledFor ? 'scheduled' : 'draft',
      created_at: new Date(),
      updated_at: new Date(),
    });

    logger.info('Campaign created', { campaignId, name: campaign.name });
    return campaignId;
  }

  async sendCampaign(campaignId: string) {
    const campaign = await db(this.tableName)
      .where('id', campaignId)
      .first();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Update status
    await db(this.tableName)
      .where('id', campaignId)
      .update({ 
        status: 'sending',
        updated_at: new Date()
      });

    // Get audience based on filter
    const audience = await this.getAudience(
      campaign.venue_id,
      JSON.parse(campaign.audience_filter)
    );

    let sent = 0;
    let failed = 0;

    // Send to each recipient
    for (const recipient of audience) {
      try {
        await notificationService.send({
          venueId: campaign.venue_id,
          recipientId: recipient.id,
          recipient: {
            id: recipient.id,
            email: recipient.email,
            phone: recipient.phone,
            name: recipient.name,
          },
          channel: 'email',
          type: 'marketing',
          template: campaign.template_name,
          priority: 'low',
          data: {
            campaignId,
            ...recipient,
          },
          metadata: {
            campaignId,
            campaignName: campaign.name,
          },
        });
        sent++;
      } catch (error) {
        failed++;
        logger.error('Failed to send campaign message', { 
          campaignId, 
          recipientId: recipient.id,
          error 
        });
      }
    }

    // Update campaign stats
    await db(this.tableName)
      .where('id', campaignId)
      .update({
        status: 'completed',
        stats: JSON.stringify({
          total: audience.length,
          sent,
          failed,
          delivered: 0,
          opened: 0,
          clicked: 0,
        }),
        updated_at: new Date(),
      });

    logger.info('Campaign completed', { 
      campaignId, 
      sent, 
      failed 
    });
  }

  private async getAudience(_venueId: string, _filter: any) {
    // This would query your customer database based on filter criteria
    // For now, returning mock data
    return [
      {
        id: 'customer-1',
        email: 'customer1@example.com',
        name: 'John Doe',
        phone: '+15551234567',
      },
    ];
  }
}

export const campaignService = new CampaignService();
```

### FILE: src/services/campaign.service.v2.ts
```typescript
import { db } from '../config/database';
import { logger } from '../config/logger';
import { notificationServiceV2 } from './notification.service.v2';
import { v4 as uuidv4 } from 'uuid';


interface ABTestVariant {
  id: string;
  name: string;
  templateId: string;
  subject?: string;
  percentage: number;
}

export class CampaignServiceV2 {
  private readonly campaignsTable = 'campaigns';
  private readonly segmentsTable = 'campaign_segments';

  async createCampaign(campaign: {
    venueId: string;
    name: string;
    type: 'marketing' | 'transactional';
    channel: 'email' | 'sms';
    segmentId?: string;
    templateId?: string;
    abTest?: {
      enabled: boolean;
      variants: ABTestVariant[];
    };
    scheduledFor?: Date;
    dailyLimit?: number;
    monthlyLimit?: number;
  }) {
    const campaignId = uuidv4();
    
    // Check venue limits
    const limits = await this.checkVenueLimits(campaign.venueId, campaign.channel);
    if (!limits.canSend) {
      throw new Error(`Venue has reached ${campaign.channel} limit: ${limits.reason}`);
    }

    await db(this.campaignsTable).insert({
      id: campaignId,
      venue_id: campaign.venueId,
      name: campaign.name,
      type: campaign.type,
      channel: campaign.channel,
      segment_id: campaign.segmentId,
      template_id: campaign.templateId,
      ab_test_config: campaign.abTest ? JSON.stringify(campaign.abTest) : null,
      scheduled_for: campaign.scheduledFor,
      status: campaign.scheduledFor ? 'scheduled' : 'draft',
      daily_limit: campaign.dailyLimit,
      monthly_limit: campaign.monthlyLimit,
      created_at: new Date(),
      updated_at: new Date(),
    });

    logger.info('Campaign created', { campaignId, name: campaign.name });
    return campaignId;
  }

  async sendCampaign(campaignId: string) {
    const campaign = await db(this.campaignsTable)
      .where('id', campaignId)
      .first();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Check spam score before sending
    if (campaign.channel === 'email') {
      const spamScore = await this.checkSpamScore(campaign.template_id);
      if (spamScore > 5) {
        throw new Error(`Campaign has high spam score: ${spamScore}. Please review content.`);
      }
    }

    // Update status
    await db(this.campaignsTable)
      .where('id', campaignId)
      .update({ 
        status: 'sending',
        started_at: new Date(),
        updated_at: new Date()
      });

    // Get audience based on segment
    const audience = await this.getSegmentedAudience(
      campaign.venue_id,
      campaign.segment_id
    );

    // Handle A/B testing if enabled
    let variants: ABTestVariant[] = [];
    if (campaign.ab_test_config) {
      const config = JSON.parse(campaign.ab_test_config);
      if (config.enabled) {
        variants = config.variants;
      }
    }

    const stats = {
      total: audience.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      variants: {} as Record<string, number>,
    };

    // Process in batches to respect rate limits
    const batchSize = campaign.daily_limit || 1000;
    const batches = this.chunkArray(audience, batchSize);

    for (const batch of batches) {
      await this.processBatch(
        batch,
        campaign,
        campaignId,
        variants,
        stats
      );

      // Add delay between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Update campaign with final stats
    await db(this.campaignsTable)
      .where('id', campaignId)
      .update({
        status: 'completed',
        completed_at: new Date(),
        stats: JSON.stringify(stats),
        updated_at: new Date(),
      });

    logger.info('Campaign completed', { 
      campaignId, 
      stats 
    });

    return stats;
  }

  private async processBatch(
    batch: any[],
    campaign: any,
    campaignId: string,
    variants: ABTestVariant[],
    stats: any
  ) {
    for (const recipient of batch) {
      try {
        // Select variant for A/B testing
        let templateId = campaign.template_id;
        let variantId = 'control';
        
        if (variants.length > 0) {
          const selected = this.selectVariant(variants, recipient.id);
          templateId = selected.templateId;
          variantId = selected.id;
          stats.variants[variantId] = (stats.variants[variantId] || 0) + 1;
        }

        await notificationServiceV2.send({
          venueId: campaign.venue_id,
          recipientId: recipient.id,
          recipient: {
            id: recipient.id,
            email: recipient.email,
            phone: recipient.phone,
            name: recipient.name,
            timezone: recipient.timezone,
          },
          channel: campaign.channel,
          type: campaign.type,
          template: campaign.template_name || templateId,
          priority: 'low',
          data: {
            campaignId,
            variantId,
            ...recipient.data,
          },
          metadata: {
            campaignId,
            campaignName: campaign.name,
            variantId,
          },
        });
        
        stats.sent++;
      } catch (error) {
        stats.failed++;
        logger.error('Failed to send campaign message', { 
          campaignId, 
          recipientId: recipient.id,
          error 
        });
      }
    }
  }

  private async getSegmentedAudience(venueId: string, segmentId?: string) {
    if (!segmentId) {
      // Return all customers for venue
      return this.getAllVenueCustomers(venueId);
    }

    const segment = await db(this.segmentsTable)
      .where('id', segmentId)
      .first();

    if (!segment) {
      throw new Error('Segment not found');
    }

    const filters = JSON.parse(segment.filters);
    return this.applySegmentFilters(venueId, filters);
  }

  private async applySegmentFilters(venueId: string, filters: any) {
    // This would build a complex query based on filters
    // For now, returning mock filtered data
    let query = db('customers')
      .where('venue_id', venueId)
      .where('opt_in_marketing', true);

    if (filters.lastPurchase) {
      const date = new Date();
      date.setDate(date.getDate() - filters.lastPurchase.days);
      
      if (filters.lastPurchase.operator === 'within') {
        query = query.where('last_purchase_at', '>=', date);
      } else {
        query = query.where('last_purchase_at', '<', date);
      }
    }

    if (filters.customerType) {
      query = query.where('customer_type', filters.customerType);
    }

    if (filters.eventAttendance) {
      // This would join with ticket purchases
      // Simplified for now
    }

    return await query.select(
      'id',
      'email',
      'phone',
      'first_name as name',
      'timezone'
    );
  }

  private async getAllVenueCustomers(_venueId: string) {
    // Mock implementation - would query actual customer database
    return [
      {
        id: 'cust-1',
        email: 'customer1@example.com',
        phone: '+15551234567',
        name: 'John Doe',
        timezone: 'America/Chicago',
        data: {
          firstName: 'John',
          lastName: 'Doe',
          lastEvent: 'Rock Concert',
        },
      },
    ];
  }

  private selectVariant(variants: ABTestVariant[], recipientId: string): ABTestVariant {
    // Use consistent hashing to ensure same recipient always gets same variant
    const hash = this.hashCode(recipientId);
    const random = (hash % 100) / 100;
    
    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.percentage / 100;
      if (random <= cumulative) {
        return variant;
      }
    }
    
    return variants[0];
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private async checkVenueLimits(venueId: string, channel: string) {
    const settings = await db('venue_notification_settings')
      .where('venue_id', venueId)
      .first();

    if (!settings) {
      return { canSend: true };
    }

    // Check daily limit
    if (channel === 'email' && settings.daily_email_limit) {
      const todayCount = await this.getTodayCount(venueId, 'email');
      if (todayCount >= settings.daily_email_limit) {
        return { 
          canSend: false, 
          reason: `Daily email limit reached (${settings.daily_email_limit})` 
        };
      }
    }

    if (channel === 'sms' && settings.daily_sms_limit) {
      const todayCount = await this.getTodayCount(venueId, 'sms');
      if (todayCount >= settings.daily_sms_limit) {
        return { 
          canSend: false, 
          reason: `Daily SMS limit reached (${settings.daily_sms_limit})` 
        };
      }
    }

    // Check monthly limit
    if (channel === 'email' && settings.monthly_email_limit) {
      const monthCount = await this.getMonthCount(venueId, 'email');
      if (monthCount >= settings.monthly_email_limit) {
        return { 
          canSend: false, 
          reason: `Monthly email limit reached (${settings.monthly_email_limit})` 
        };
      }
    }

    if (channel === 'sms' && settings.monthly_sms_limit) {
      const monthCount = await this.getMonthCount(venueId, 'sms');
      if (monthCount >= settings.monthly_sms_limit) {
        return { 
          canSend: false, 
          reason: `Monthly SMS limit reached (${settings.monthly_sms_limit})` 
        };
      }
    }

    return { canSend: true };
  }

  private async getTodayCount(venueId: string, channel: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db('notification_tracking')
      .where('venue_id', venueId)
      .where('channel', channel)
      .where('created_at', '>=', today)
      .count('id as count')
      .first();

    return parseInt(String(result?.count || '0'));
  }

  private async getMonthCount(venueId: string, channel: string): Promise<number> {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const result = await db('notification_tracking')
      .where('venue_id', venueId)
      .where('channel', channel)
      .where('created_at', '>=', firstOfMonth)
      .count('id as count')
      .first();

    return parseInt(String(result?.count || '0'));
  }

  private async checkSpamScore(templateId: string): Promise<number> {
    // Implement spam scoring logic
    // Check for spam trigger words, excessive caps, too many links, etc.
    const template = await db('notification_templates')
      .where('id', templateId)
      .first();

    if (!template) return 0;

    let score = 0;
    const content = (template.content + ' ' + template.subject).toLowerCase();

    // Spam trigger words
    const spamWords = ['free', 'winner', 'cash', 'prize', 'urgent', 'act now', 'limited time'];
    for (const word of spamWords) {
      if (content.includes(word)) score++;
    }

    // Check for excessive caps
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.3) score += 3;

    // Check for excessive exclamation marks
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > 3) score += 2;

    return score;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async createSegment(segment: {
    venueId: string;
    name: string;
    filters: any;
  }): Promise<string> {
    const segmentId = uuidv4();
    
    await db(this.segmentsTable).insert({
      id: segmentId,
      venue_id: segment.venueId,
      name: segment.name,
      filters: JSON.stringify(segment.filters),
      created_at: new Date(),
      updated_at: new Date(),
    });

    return segmentId;
  }

  async getCampaignAnalytics(campaignId: string) {
    const campaign = await db(this.campaignsTable)
      .where('id', campaignId)
      .first();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get detailed analytics
    const opens = await db('notification_tracking')
      .where('metadata', '@>', JSON.stringify({ campaignId }))
      .whereNotNull('opened_at')
      .count('id as count')
      .first();

    const clicks = await db('notification_tracking')
      .where('metadata', '@>', JSON.stringify({ campaignId }))
      .whereNotNull('clicked_at')
      .count('id as count')
      .first();

    const bounces = await db('notification_tracking')
      .where('metadata', '@>', JSON.stringify({ campaignId }))
      .where('status', 'bounced')
      .count('id as count')
      .first();

    const stats = JSON.parse(campaign.stats || '{}');

    return {
      campaignId,
      name: campaign.name,
      status: campaign.status,
      ...stats,
      opens: parseInt(String(opens?.count || '0')),
      clicks: parseInt(String(clicks?.count || '0')),
      bounces: parseInt(String(bounces?.count || '0')),
      openRate: stats.sent ? (parseInt(String(opens?.count || '0')) / stats.sent) * 100 : 0,
      clickRate: stats.sent ? (parseInt(String(clicks?.count || '0')) / stats.sent) * 100 : 0,
      bounceRate: stats.sent ? (parseInt(String(bounces?.count || '0')) / stats.sent) * 100 : 0,
    };
  }
}

export const campaignServiceV2 = new CampaignServiceV2();
```

### FILE: src/services/notification.service.v2.ts
```typescript
import { NotificationRequest, NotificationResponse, NotificationStatus } from '../types/notification.types';
import { complianceService } from './compliance.service';
import { templateService } from './template.service';
import { providerManager } from './provider-manager.service';
import { queueManager } from './queue-manager.service';
import { retryService } from './retry.service';
import { emailProvider } from '../providers/email.provider';
import { smsProvider } from '../providers/sms.provider';
import { awsSESProvider } from '../providers/aws-ses.provider';
import { awsSNSProvider } from '../providers/aws-sns.provider';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

export class NotificationServiceV2 {
  private readonly tableName = 'notification_tracking';

  constructor() {
    this.setupQueueProcessors();
  }

  private setupQueueProcessors() {
    queueManager.setupQueueProcessors(async (job) => {
      return this.processNotification(job.data);
    });
  }

  async send(request: NotificationRequest): Promise<NotificationResponse> {
    const notificationId = request.id || uuidv4();

    try {
      // Step 1: Compliance check
      const compliance = await complianceService.checkCompliance(request);
      if (!compliance.isCompliant) {
        return this.createResponse(notificationId, 'failed', request.channel, compliance.reason);
      }

      // Step 2: Get and render template
      const template = await templateService.getTemplate(
        request.template,
        request.channel,
        request.venueId
      );

      if (!template) {
        return this.createResponse(notificationId, 'failed', request.channel, 'Template not found');
      }

      const rendered = await templateService.renderTemplate(template, request.data);

      // Step 3: Track notification
      await this.trackNotification({
        id: notificationId,
        ...request,
        status: 'queued',
      });

      // Step 4: Add to appropriate queue based on priority
      const queuePriority = this.mapPriorityToQueue(request.priority);
      await queueManager.addToQueue(queuePriority, {
        id: notificationId,
        request,
        rendered,
        template,
      });

      return this.createResponse(notificationId, 'queued', request.channel);
    } catch (error: any) {
      logger.error('Failed to send notification', { 
        notificationId, 
        error: error.message 
      });
      return this.createResponse(notificationId, 'failed', request.channel, error.message);
    }
  }

  private async processNotification(jobData: any): Promise<NotificationResponse> {
    const { id, request, rendered, template: _template } = jobData;

    try {
      // Update status to sending
      await this.updateNotificationStatus(id, 'sending');

      let result: NotificationResponse;
      let provider: string;

      // Send based on channel with provider failover
      switch (request.channel) {
        case 'email':
          provider = await providerManager.getHealthyEmailProvider();
          result = await this.sendEmail(provider, request, rendered);
          break;

        case 'sms':
          provider = await providerManager.getHealthySmsProvider();
          result = await this.sendSms(provider, request, rendered);
          break;

        default:
          throw new Error(`Unsupported channel: ${request.channel}`);
      }

      // Record success
      providerManager.recordSuccess(provider!);

      // Update tracking with result
      await this.updateNotificationStatus(id, result.status, result);

      // Track cost if applicable
      if (result.cost) {
        await this.trackCost(id, request.venueId, request.channel, result.cost, provider!);
      }

      return result;
    } catch (error: any) {
      logger.error('Notification processing failed', { 
        notificationId: id, 
        error: error.message 
      });

      // Check if we should retry
      const retryDecision = await retryService.shouldRetry(id, error);
      
      if (retryDecision.retry) {
        // Re-queue with delay
        const queuePriority = this.mapPriorityToQueue(jobData.request.priority);
        await queueManager.addToQueue(queuePriority, {
          ...jobData,
          _retry: true,
          _delay: retryDecision.delay,
        });
        
        await this.updateNotificationStatus(id, 'queued', { 
          failureReason: `Retrying: ${error.message}` 
        });
      } else {
        await this.updateNotificationStatus(id, 'failed', { 
          failureReason: error.message 
        });
      }
      
      throw error;
    }
  }

  private async sendEmail(provider: string, request: any, rendered: any): Promise<NotificationResponse> {
    switch (provider) {
      case 'sendgrid':
        return await emailProvider.send({
          to: request.recipient.email!,
          subject: rendered.subject || 'Notification from TicketToken',
          text: rendered.content,
          html: rendered.htmlContent,
          from: env.SENDGRID_FROM_EMAIL,
          fromName: env.SENDGRID_FROM_NAME,
        });

      case 'aws-ses':
        return await awsSESProvider.send({
          to: request.recipient.email!,
          subject: rendered.subject || 'Notification from TicketToken',
          text: rendered.content,
          html: rendered.htmlContent,
          from: env.SENDGRID_FROM_EMAIL,
        });

      default:
        throw new Error(`Unknown email provider: ${provider}`);
    }
  }

  private async sendSms(provider: string, request: any, rendered: any): Promise<NotificationResponse> {
    switch (provider) {
      case 'twilio':
        return await smsProvider.send({
          to: request.recipient.phone!,
          body: rendered.content,
          from: env.TWILIO_FROM_NUMBER,
        });

      case 'aws-sns':
        return await awsSNSProvider.send({
          to: request.recipient.phone!,
          body: rendered.content,
          messageType: request.type === 'marketing' ? 'Promotional' : 'Transactional',
        });

      default:
        throw new Error(`Unknown SMS provider: ${provider}`);
    }
  }

  private mapPriorityToQueue(priority: string): 'CRITICAL' | 'HIGH' | 'NORMAL' | 'BULK' {
    switch (priority) {
      case 'critical': return 'CRITICAL';
      case 'high': return 'HIGH';
      case 'normal': return 'NORMAL';
      case 'low': 
      case 'bulk': return 'BULK';
      default: return 'NORMAL';
    }
  }

  private async trackNotification(data: any): Promise<void> {
    await db(this.tableName).insert({
      id: data.id,
      venue_id: data.venueId,
      recipient_id: data.recipientId,
      channel: data.channel,
      type: data.type,
      template: data.template,
      priority: data.priority,
      status: data.status,
      scheduled_for: data.scheduledFor,
      metadata: JSON.stringify(data.metadata || {}),
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  private async updateNotificationStatus(
    id: string, 
    status: NotificationStatus,
    additionalData?: any
  ): Promise<void> {
    const updates: any = {
      status,
      updated_at: new Date(),
    };

    if (status === 'sent') {
      updates.sent_at = new Date();
    }

    if (status === 'delivered') {
      updates.delivered_at = new Date();
    }

    if (additionalData?.failureReason) {
      updates.failure_reason = additionalData.failureReason;
    }

    if (additionalData?.providerMessageId) {
      updates.provider_message_id = additionalData.providerMessageId;
    }

    await db(this.tableName)
      .where('id', id)
      .update(updates);
  }

  private async trackCost(
    notificationId: string,
    venueId: string,
    channel: string,
    cost: number,
    provider: string
  ): Promise<void> {
    await db('notification_costs').insert({
      id: uuidv4(),
      notification_id: notificationId,
      venue_id: venueId,
      channel,
      provider,
      cost,
      currency: 'USD',
      billing_period: new Date().toISOString().slice(0, 7),
      is_platform_cost: false,
      created_at: new Date(),
    });
  }

  private createResponse(
    id: string,
    status: NotificationStatus,
    channel: string,
    failureReason?: string
  ): NotificationResponse {
    return {
      id,
      status,
      channel: channel as any,
      failureReason,
    };
  }

  async getNotificationStatus(id: string): Promise<any> {
    const notification = await db(this.tableName)
      .where('id', id)
      .first();
    
    return notification;
  }

  async getQueueMetrics() {
    return await queueManager.getQueueMetrics();
  }

  async getProviderHealth(): Promise<any> {
    return providerManager.getProviderStatus();
  }
}

export const notificationServiceV2 = new NotificationServiceV2();
```

### FILE: src/services/spam-score.service.ts
```typescript
import { logger } from '../config/logger';

interface SpamCheckResult {
  score: number;
  flags: string[];
  passed: boolean;
  recommendations: string[];
}

export class SpamScoreService {
  private readonly MAX_ACCEPTABLE_SCORE = 5;
  
  async checkContent(
    subject: string,
    content: string,
    htmlContent?: string
  ): Promise<SpamCheckResult> {
    const flags: string[] = [];
    const recommendations: string[] = [];
    let score = 0;

    // Combine all content for analysis
    const fullContent = `${subject} ${content} ${htmlContent || ''}`.toLowerCase();

    // Check spam trigger words
    score += this.checkSpamWords(fullContent, flags);
    
    // Check capitalization
    score += this.checkCapitalization(fullContent, flags);
    
    // Check punctuation
    score += this.checkPunctuation(fullContent, flags);
    
    // Check links
    score += this.checkLinks(htmlContent || content, flags);
    
    // Check images ratio
    if (htmlContent) {
      score += this.checkImageRatio(htmlContent, flags);
    }
    
    // Check subject line
    score += this.checkSubjectLine(subject, flags);
    
    // Generate recommendations
    if (score > 3) {
      recommendations.push('Consider rewording to avoid spam triggers');
    }
    if (flags.includes('excessive_caps')) {
      recommendations.push('Reduce use of capital letters');
    }
    if (flags.includes('too_many_links')) {
      recommendations.push('Reduce the number of links');
    }

    const result = {
      score,
      flags,
      passed: score <= this.MAX_ACCEPTABLE_SCORE,
      recommendations,
    };

    logger.info('Spam check completed', result);
    return result;
  }

  private checkSpamWords(content: string, flags: string[]): number {
    let score = 0;
    
    const highRiskWords = [
      'viagra', 'pills', 'weight loss', 'get rich', 'work from home',
      'nigerian prince', 'inheritance', 'winner', 'selected'
    ];
    
    const mediumRiskWords = [
      'free', 'guarantee', 'no obligation', 'risk free', 'urgent',
      'act now', 'limited time', 'exclusive deal', 'click here'
    ];
    
    const lowRiskWords = [
      'sale', 'discount', 'offer', 'special', 'new', 'important'
    ];

    // Check high risk words (3 points each)
    for (const word of highRiskWords) {
      if (content.includes(word)) {
        score += 3;
        flags.push(`high_risk_word: ${word}`);
      }
    }

    // Check medium risk words (2 points each)
    for (const word of mediumRiskWords) {
      if (content.includes(word)) {
        score += 2;
        flags.push(`medium_risk_word: ${word}`);
      }
    }

    // Check low risk words (1 point each)
    let lowRiskCount = 0;
    for (const word of lowRiskWords) {
      if (content.includes(word)) {
        lowRiskCount++;
      }
    }
    if (lowRiskCount > 3) {
      score += lowRiskCount;
      flags.push('multiple_promotional_words');
    }

    return score;
  }

  private checkCapitalization(content: string, flags: string[]): number {
    const upperCount = (content.match(/[A-Z]/g) || []).length;
    const totalCount = content.length;
    const ratio = upperCount / totalCount;

    if (ratio > 0.3) {
      flags.push('excessive_caps');
      return 3;
    } else if (ratio > 0.2) {
      flags.push('high_caps');
      return 1;
    }
    
    return 0;
  }

  private checkPunctuation(content: string, flags: string[]): number {
    let score = 0;
    
    // Check excessive exclamation marks
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > 5) {
      score += 2;
      flags.push('excessive_exclamation');
    } else if (exclamationCount > 3) {
      score += 1;
      flags.push('multiple_exclamation');
    }

    // Check excessive question marks
    const questionCount = (content.match(/\?/g) || []).length;
    if (questionCount > 5) {
      score += 1;
      flags.push('excessive_questions');
    }

    // Check for $$$ or similar
    if (content.includes('$$$') || content.includes('€€€')) {
      score += 2;
      flags.push('money_symbols');
    }

    return score;
  }

  private checkLinks(content: string, flags: string[]): number {
    const linkCount = (content.match(/https?:\/\//gi) || []).length;
    
    if (linkCount > 10) {
      flags.push('too_many_links');
      return 3;
    } else if (linkCount > 5) {
      flags.push('multiple_links');
      return 1;
    }
    
    // Check for URL shorteners
    const shorteners = ['bit.ly', 'tinyurl', 'goo.gl', 'ow.ly'];
    for (const shortener of shorteners) {
      if (content.includes(shortener)) {
        flags.push('url_shortener');
        return 2;
      }
    }
    
    return 0;
  }

  private checkImageRatio(htmlContent: string, flags: string[]): number {
    const imgCount = (htmlContent.match(/<img/gi) || []).length;
    const textLength = htmlContent.replace(/<[^>]*>/g, '').length;
    
    if (textLength < 100 && imgCount > 1) {
      flags.push('image_heavy');
      return 2;
    }
    
    return 0;
  }

  private checkSubjectLine(subject: string, flags: string[]): number {
    let score = 0;
    
    // Check if subject is all caps
    if (subject === subject.toUpperCase() && subject.length > 5) {
      flags.push('subject_all_caps');
      score += 2;
    }
    
    // Check for RE: or FWD: spam
    if (subject.match(/^(re:|fwd?:)/i) && !subject.match(/^(re:|fwd?):\s*\w/i)) {
      flags.push('fake_reply');
      score += 3;
    }
    
    // Check for empty or very short subject
    if (subject.length < 3) {
      flags.push('short_subject');
      score += 1;
    }
    
    return score;
  }
}

export const spamScoreService = new SpamScoreService();
```

### FILE: src/services/i18n.service.ts
```typescript
import { logger } from '../config/logger';
import { db } from '../config/database';

interface TranslationData {
  [key: string]: string | TranslationData;
}

export class I18nService {
  private translations: Map<string, TranslationData> = new Map();
  private readonly supportedLanguages = ['en', 'es', 'fr', 'de', 'pt', 'zh', 'ja'];
  private readonly defaultLanguage = 'en';

  async loadTranslations() {
    for (const lang of this.supportedLanguages) {
      const translations = await db('translations')
        .where('language', lang)
        .select('key', 'value');

      const data: TranslationData = {};
      for (const trans of translations) {
        this.setNestedProperty(data, trans.key, trans.value);
      }

      this.translations.set(lang, data);
    }

    logger.info('Translations loaded', { 
      languages: this.supportedLanguages 
    });
  }

  translate(
    key: string,
    language: string = this.defaultLanguage,
    variables?: Record<string, any>
  ): string {
    const lang = this.supportedLanguages.includes(language) 
      ? language 
      : this.defaultLanguage;

    const translations = this.translations.get(lang) || {};
    const value = this.getNestedProperty(translations, key);

    if (!value) {
      logger.warn('Translation missing', { key, language });
      return key;
    }

    // Replace variables
    let translated = value as string;
    if (variables) {
      Object.entries(variables).forEach(([varKey, varValue]) => {
        translated = translated.replace(
          new RegExp(`{{${varKey}}}`, 'g'),
          String(varValue)
        );
      });
    }

    return translated;
  }

  detectLanguage(text: string): string {
    // Simple language detection based on character sets
    // In production, would use a proper language detection library
    
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh'; // Chinese
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'; // Japanese
    if (/[àâäæçéèêëïîôùûüÿœ]/i.test(text)) return 'fr'; // French
    if (/[áéíóúñ¿¡]/i.test(text)) return 'es'; // Spanish
    if (/[äöüßẞ]/i.test(text)) return 'de'; // German
    if (/[ãõçáéíóú]/i.test(text)) return 'pt'; // Portuguese
    
    return 'en';
  }

  async translateTemplate(
    templateContent: string,
    fromLang: string,
    toLang: string
  ): Promise<string> {
    // In production, this would use a translation API (Google Translate, DeepL, etc.)
    // For now, return the original content
    
    logger.info('Template translation requested', { 
      from: fromLang, 
      to: toLang 
    });
    
    return templateContent;
  }

  formatDate(date: Date, language: string): string {
    const locale = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      pt: 'pt-BR',
      zh: 'zh-CN',
      ja: 'ja-JP',
    }[language] || 'en-US';

    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  formatCurrency(amount: number, currency: string, language: string): string {
    const locale = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      pt: 'pt-BR',
      zh: 'zh-CN',
      ja: 'ja-JP',
    }[language] || 'en-US';

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  private setNestedProperty(obj: any, path: string, value: any) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  private getNestedProperty(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (!current[key]) return null;
      current = current[key];
    }
    
    return current;
  }
}

export const i18nService = new I18nService();
```

### FILE: src/services/compliance.service.ts
```typescript
import { consentModel } from '../models/consent.model';
import { suppressionModel } from '../models/suppression.model';
import { NotificationChannel, NotificationType, NotificationRequest } from '../types/notification.types';
import { logger } from '../config/logger';
import { env } from '../config/env';

export class ComplianceService {
  async checkCompliance(request: NotificationRequest): Promise<{
    isCompliant: boolean;
    reason?: string;
  }> {
    try {
      // Skip compliance checks if disabled (NOT recommended for production)
      if (!env.ENABLE_CONSENT_CHECK && !env.ENABLE_SUPPRESSION_CHECK) {
        return { isCompliant: true };
      }

      // Check suppression list first (highest priority)
      if (env.ENABLE_SUPPRESSION_CHECK) {
        const identifier = request.channel === 'email' 
          ? request.recipient.email 
          : request.recipient.phone;

        if (identifier && await suppressionModel.isSuppressed(identifier, request.channel)) {
          logger.warn('Notification blocked: recipient is suppressed', {
            channel: request.channel,
            venueId: request.venueId,
          });
          return { 
            isCompliant: false, 
            reason: 'Recipient is on suppression list' 
          };
        }
      }

      // Check consent for marketing messages
      if (env.ENABLE_CONSENT_CHECK && request.type === 'marketing') {
        const hasConsent = await consentModel.hasConsent(
          request.recipientId,
          request.channel,
          request.type,
          request.venueId
        );

        if (!hasConsent) {
          logger.warn('Notification blocked: no consent', {
            recipientId: request.recipientId,
            channel: request.channel,
            type: request.type,
            venueId: request.venueId,
          });
          return { 
            isCompliant: false, 
            reason: 'No consent for marketing communications' 
          };
        }
      }

      // Check SMS time restrictions
      if (request.channel === 'sms' && !this.isWithinSmsTimeWindow(request.recipient.timezone)) {
        return { 
          isCompliant: false, 
          reason: 'Outside SMS delivery hours (8am-9pm recipient time)' 
        };
      }

      return { isCompliant: true };
    } catch (error) {
      logger.error('Compliance check failed', error);
      // Fail closed - if we can't verify compliance, don't send
      return { 
        isCompliant: false, 
        reason: 'Compliance check failed' 
      };
    }
  }

  private isWithinSmsTimeWindow(timezone?: string): boolean {
    const tz = timezone || env.DEFAULT_TIMEZONE;
    const now = new Date();
    
    // Convert to recipient's timezone
    const recipientTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const hour = recipientTime.getHours();

    return hour >= env.SMS_TIME_RESTRICTION_START && hour < env.SMS_TIME_RESTRICTION_END;
  }

  async recordConsent(
    customerId: string,
    channel: NotificationChannel,
    type: NotificationType,
    source: string,
    venueId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await consentModel.create({
      customerId,
      venueId,
      channel,
      type,
      status: 'granted',
      grantedAt: new Date(),
      source,
      ipAddress,
      userAgent,
    });
  }

  async revokeConsent(
    customerId: string,
    channel: NotificationChannel,
    type?: NotificationType,
    venueId?: string
  ): Promise<void> {
    await consentModel.revoke(customerId, channel, type, venueId);
  }

  async addToSuppressionList(
    identifier: string,
    channel: NotificationChannel,
    reason: string,
    suppressedBy?: string
  ): Promise<void> {
    await suppressionModel.add({
      identifier,
      channel,
      reason,
      suppressedAt: new Date(),
      suppressedBy,
    });
  }

  async removeFromSuppressionList(
    identifier: string,
    channel?: NotificationChannel
  ): Promise<void> {
    await suppressionModel.remove(identifier, channel);
  }
}

export const complianceService = new ComplianceService();
```

