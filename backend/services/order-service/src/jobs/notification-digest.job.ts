import { JobExecutor } from './job-executor';
import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { EmailService } from '../services/email.service';
import { NotificationFrequency } from '../types/notification.types';

export class NotificationDigestJob extends JobExecutor {
  private emailService: EmailService;

  constructor() {
    super({
      name: 'notification-digest',
      intervalSeconds: 3600, // Every hour
      enableRetry: true,
      enableCircuitBreaker: true,
      enableDistributedLock: true,
    });
    this.emailService = new EmailService();
  }

  protected async executeCore(): Promise<void> {
    const db = getDatabase();
    try {
      const currentHour = new Date().getHours();
      const currentDay = new Date().getDay();

      // Send daily digests at 9 AM
      if (currentHour === 9) {
        await this.sendDailyDigests(db);
      }

      // Send weekly digests on Monday at 9 AM
      if (currentDay === 1 && currentHour === 9) {
        await this.sendWeeklyDigests(db);
      }
    } catch (error) {
      logger.error('Error in notification digest job', { error });
      throw error;
    }
  }

  private async sendDailyDigests(db: any): Promise<void> {
    try {
      // Get users who want daily digests and have pending notifications
      const result = await db.query(
        `SELECT DISTINCT 
           np.user_id,
           np.tenant_id,
           u.email,
           COUNT(nl.id) as notification_count
         FROM notification_preferences np
         JOIN users u ON u.id = np.user_id
         JOIN notification_logs nl ON nl.user_id = np.user_id AND nl.tenant_id = np.tenant_id
         WHERE np.frequency = $1
         AND nl.created_at >= NOW() - INTERVAL '24 hours'
         AND nl.status = 'PENDING'
         GROUP BY np.user_id, np.tenant_id, u.email
         HAVING COUNT(nl.id) > 0`,
        [NotificationFrequency.DAILY_DIGEST]
      );

      logger.info('Sending daily digests', { count: result.rows.length });

      for (const user of result.rows) {
        await this.sendDigest(user, 'daily');
      }
    } catch (error) {
      logger.error('Error sending daily digests', { error });
    }
  }

  private async sendWeeklyDigests(db: any): Promise<void> {
    try {
      // Get users who want weekly digests and have pending notifications
      const result = await db.query(
        `SELECT DISTINCT 
           np.user_id,
           np.tenant_id,
           u.email,
           COUNT(nl.id) as notification_count
         FROM notification_preferences np
         JOIN users u ON u.id = np.user_id
         JOIN notification_logs nl ON nl.user_id = np.user_id AND nl.tenant_id = np.tenant_id
         WHERE np.frequency = $1
         AND nl.created_at >= NOW() - INTERVAL '7 days'
         AND nl.status = 'PENDING'
         GROUP BY np.user_id, np.tenant_id, u.email
         HAVING COUNT(nl.id) > 0`,
        [NotificationFrequency.WEEKLY_DIGEST]
      );

      logger.info('Sending weekly digests', { count: result.rows.length });

      for (const user of result.rows) {
        await this.sendDigest(user, 'weekly');
      }
    } catch (error) {
      logger.error('Error sending weekly digests', { error });
    }
  }

  private async sendDigest(user: any, period: 'daily' | 'weekly'): Promise<void> {
    try {
      // Get all pending notifications for this user
      const db = getDatabase();
      const notifications = await db.query(
        `SELECT * FROM notification_logs
         WHERE user_id = $1 AND tenant_id = $2 AND status = 'PENDING'
         ORDER BY created_at DESC`,
        [user.user_id, user.tenant_id]
      );

      // Send digest email
      await this.emailService.sendEmail({
        to: user.email,
        subject: `Your ${period} notification digest`,
        htmlBody: this.buildDigestHTML(notifications.rows, period),
        textBody: this.buildDigestText(notifications.rows, period),
        metadata: { userId: user.user_id, tenantId: user.tenant_id, digestType: period },
      });

      // Mark notifications as sent
      await db.query(
        `UPDATE notification_logs 
         SET status = 'SENT', sent_at = NOW() 
         WHERE user_id = $1 AND tenant_id = $2 AND status = 'PENDING'`,
        [user.user_id, user.tenant_id]
      );

      logger.info('Sent notification digest', { userId: user.user_id, period, count: notifications.rows.length });
    } catch (error) {
      logger.error('Error sending digest', { error, userId: user.user_id });
    }
  }

  private buildDigestHTML(notifications: any[], period: string): string {
    let html = `<h2>Your ${period.charAt(0).toUpperCase() + period.slice(1)} Notification Digest</h2>`;
    html += `<p>You have ${notifications.length} notification(s):</p><ul>`;
    
    for (const notification of notifications) {
      html += `<li><strong>${notification.notification_type}</strong>: ${notification.subject || 'Update'}</li>`;
    }
    
    html += '</ul>';
    return html;
  }

  private buildDigestText(notifications: any[], period: string): string {
    let text = `Your ${period.charAt(0).toUpperCase() + period.slice(1)} Notification Digest\n\n`;
    text += `You have ${notifications.length} notification(s):\n\n`;
    
    for (const notification of notifications) {
      text += `- ${notification.notification_type}: ${notification.subject || 'Update'}\n`;
    }
    
    return text;
  }
}
