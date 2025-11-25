import { OrderService } from '../services/order.service';
import { getDatabase } from '../config/database';
import { orderConfig } from '../config';
import { logger } from '../utils/logger';

export class ReminderJob {
  private orderService: OrderService;
  private intervalId: NodeJS.Timeout | null = null;
  private sentReminders: Set<string> = new Set();

  constructor() {
    const pool = getDatabase();
    this.orderService = new OrderService(pool);
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('Reminder job already running');
      return;
    }

    logger.info('Starting reminder job');

    this.intervalId = setInterval(
      () => this.sendExpirationReminders(),
      60 * 1000 // Every minute
    );

    // Run immediately on start
    this.sendExpirationReminders();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.sentReminders.clear();
      logger.info('Reminder job stopped');
    }
  }

  private async sendExpirationReminders(): Promise<void> {
    try {
      const minutesBeforeExpiration = orderConfig.reservation.durationMinutes;
      
      // Get orders expiring in the next N minutes
      const expiringOrders = await this.orderService.getExpiringReservations(
        minutesBeforeExpiration,
        100
      );

      logger.debug(`Found ${expiringOrders.length} orders expiring soon`);

      for (const order of expiringOrders) {
        // Check if we already sent a reminder for this order
        if (this.sentReminders.has(order.id)) {
          continue;
        }

        try {
          // Publish event to notification service via RabbitMQ
          await this.publishReminderEvent({
            orderId: order.id,
            userId: order.userId,
            orderNumber: order.orderNumber,
            expiresAt: order.expiresAt,
            totalCents: order.totalCents,
            currency: order.currency,
            minutesRemaining: Math.round(
              (new Date(order.expiresAt).getTime() - Date.now()) / 60000
            )
          });

          this.sentReminders.add(order.id);
          
          logger.debug('Expiration reminder sent', {
            orderId: order.id,
            expiresAt: order.expiresAt,
          });
        } catch (error) {
          logger.error('Failed to send expiration reminder', {
            orderId: order.id,
            error: error instanceof Error ? error.message : error,
          });
        }
      }

      // Clean up old reminders (prevent memory leak)
      if (this.sentReminders.size > 10000) {
        this.sentReminders.clear();
      }
    } catch (error) {
      logger.error('Reminder job failed', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /**
   * Publish reminder event to notification service
   */
  private async publishReminderEvent(data: {
    orderId: string;
    userId: string;
    orderNumber: string;
    expiresAt: Date;
    totalCents: number;
    currency: string;
    minutesRemaining: number;
  }): Promise<void> {
    try {
      // In a full implementation, this would publish to RabbitMQ/event bus
      // For now, we'll use HTTP to notification service as a fallback
      const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL;
      
      if (!notificationServiceUrl) {
        logger.warn('NOTIFICATION_SERVICE_URL not configured, skipping reminder');
        return;
      }

      // Make HTTP request to notification service
      const payload = {
        type: 'order.expiring_soon',
        userId: data.userId,
        data: {
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          expiresAt: data.expiresAt.toISOString(),
          totalCents: data.totalCents,
          currency: data.currency,
          minutesRemaining: data.minutesRemaining
        },
        channels: ['email', 'push'],  // Send via both email and push notification
        priority: 'high',
        metadata: {
          source: 'order-service',
          timestamp: new Date().toISOString()
        }
      };

      // Use fetch or axios to send notification
      const response = await fetch(`${notificationServiceUrl}/api/v1/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': process.env.INTERNAL_SERVICE_SECRET || ''
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Notification service responded with status ${response.status}`);
      }

      logger.info('Reminder notification sent successfully', {
        orderId: data.orderId,
        userId: data.userId
      });
    } catch (error) {
      logger.error('Failed to publish reminder event', {
        orderId: data.orderId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }
}
