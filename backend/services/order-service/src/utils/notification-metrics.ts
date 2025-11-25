import { Counter, register } from 'prom-client';
import { logger } from './logger';

// Notification counters
const notificationSentTotal = new Counter({
  name: 'notification_sent_total',
  help: 'Total number of notifications sent',
  labelNames: ['channel', 'status'],
  registers: [register]
});

const notificationErrorsTotal = new Counter({
  name: 'notification_errors_total',
  help: 'Total number of notification errors',
  labelNames: ['channel', 'error_type'],
  registers: [register]
});

export class NotificationMetrics {
  static incrementSent(channel: string, status: 'success' | 'failed'): void {
    try {
      notificationSentTotal.inc({ channel, status });
    } catch (error) {
      logger.error('Failed to increment notification sent metric', { error, channel, status });
    }
  }

  static incrementError(channel: string, errorType: string): void {
    try {
      notificationErrorsTotal.inc({ channel, error_type: errorType });
    } catch (error) {
      logger.error('Failed to increment notification error metric', { error, channel, errorType });
    }
  }
}
