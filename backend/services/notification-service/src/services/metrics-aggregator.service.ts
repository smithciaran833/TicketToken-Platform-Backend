import { db } from '../config/database';
import { logger } from '../config/logger';
import { metricsService } from './metrics.service';

interface BusinessMetrics {
  realtime: {
    notifications_per_minute: number;
    success_rate: number;
    avg_send_time_ms: number;
  };
  last_hour: {
    total_sent: number;
    delivery_rate: number;
    bounce_rate: number;
    error_rate: number;
    open_rate?: number;
    click_rate?: number;
  };
  last_24h: {
    total_sent: number;
    delivery_rate: number;
    bounce_rate: number;
    error_rate: number;
    cost_per_notification: number;
  };
  by_channel: {
    email: ChannelMetrics;
    sms: ChannelMetrics;
  };
}

interface ChannelMetrics {
  sent: number;
  delivered: number;
  failed: number;
  delivery_rate: number;
  avg_cost: number;
}

class MetricsAggregatorService {
  async getDashboardMetrics(): Promise<BusinessMetrics> {
    try {
      const [realtime, lastHour, last24h, byChannel] = await Promise.all([
        this.getRealtimeMetrics(),
        this.getLastHourMetrics(),
        this.getLast24HourMetrics(),
        this.getChannelMetrics()
      ]);

      return {
        realtime,
        last_hour: lastHour,
        last_24h: last24h,
        by_channel: byChannel
      };
    } catch (error) {
      logger.error('Failed to get dashboard metrics', { error });
      throw error;
    }
  }

  private async getRealtimeMetrics() {
    const oneMinuteAgo = new Date(Date.now() - 60000);

    try {
      const recentNotifications = await db('notification_history')
        .where('created_at', '>=', oneMinuteAgo)
        .select('status', 'response_time_ms');

      const total = recentNotifications.length;
      const successful = recentNotifications.filter(n => n.status === 'delivered' || n.status === 'sent').length;
      const avgResponseTime = recentNotifications.reduce((sum, n) => sum + (n.response_time_ms || 0), 0) / (total || 1);

      return {
        notifications_per_minute: total,
        success_rate: total > 0 ? successful / total : 0,
        avg_send_time_ms: Math.round(avgResponseTime)
      };
    } catch (error) {
      logger.error('Failed to get realtime metrics', { error });
      return {
        notifications_per_minute: 0,
        success_rate: 0,
        avg_send_time_ms: 0
      };
    }
  }

  private async getLastHourMetrics() {
    const oneHourAgo = new Date(Date.now() - 3600000);

    try {
      const notifications = await db('notification_history')
        .where('created_at', '>=', oneHourAgo)
        .select('status', 'channel', 'delivery_status');

      const total = notifications.length;
      const delivered = notifications.filter(n => n.delivery_status === 'delivered').length;
      const bounced = notifications.filter(n => n.delivery_status === 'bounced').length;
      const failed = notifications.filter(n => n.status === 'failed').length;

      const emailEngagement = await db('notification_engagement')
        .where('created_at', '>=', oneHourAgo)
        .where('channel', 'email')
        .select('opened', 'clicked');

      const totalEmails = notifications.filter(n => n.channel === 'email').length;
      const opened = emailEngagement.filter(e => e.opened).length;
      const clicked = emailEngagement.filter(e => e.clicked).length;

      return {
        total_sent: total,
        delivery_rate: total > 0 ? delivered / total : 0,
        bounce_rate: total > 0 ? bounced / total : 0,
        error_rate: total > 0 ? failed / total : 0,
        open_rate: totalEmails > 0 ? opened / totalEmails : undefined,
        click_rate: totalEmails > 0 ? clicked / totalEmails : undefined
      };
    } catch (error) {
      logger.error('Failed to get last hour metrics', { error });
      return {
        total_sent: 0,
        delivery_rate: 0,
        bounce_rate: 0,
        error_rate: 0
      };
    }
  }

  private async getLast24HourMetrics() {
    const twentyFourHoursAgo = new Date(Date.now() - 86400000);

    try {
      const notifications = await db('notification_history')
        .where('created_at', '>=', twentyFourHoursAgo)
        .select('status', 'delivery_status', 'cost');

      const total = notifications.length;
      const delivered = notifications.filter(n => n.delivery_status === 'delivered').length;
      const bounced = notifications.filter(n => n.delivery_status === 'bounced').length;
      const failed = notifications.filter(n => n.status === 'failed').length;
      const totalCost = notifications.reduce((sum, n) => sum + (n.cost || 0), 0);

      return {
        total_sent: total,
        delivery_rate: total > 0 ? delivered / total : 0,
        bounce_rate: total > 0 ? bounced / total : 0,
        error_rate: total > 0 ? failed / total : 0,
        cost_per_notification: total > 0 ? totalCost / total : 0
      };
    } catch (error) {
      logger.error('Failed to get last 24h metrics', { error });
      return {
        total_sent: 0,
        delivery_rate: 0,
        bounce_rate: 0,
        error_rate: 0,
        cost_per_notification: 0
      };
    }
  }

  private async getChannelMetrics(): Promise<{ email: ChannelMetrics; sms: ChannelMetrics }> {
    const twentyFourHoursAgo = new Date(Date.now() - 86400000);

    try {
      const notifications = await db('notification_history')
        .where('created_at', '>=', twentyFourHoursAgo)
        .select('channel', 'status', 'delivery_status', 'cost');

      const emailNotifications = notifications.filter(n => n.channel === 'email');
      const smsNotifications = notifications.filter(n => n.channel === 'sms');

      return {
        email: this.calculateChannelMetrics(emailNotifications),
        sms: this.calculateChannelMetrics(smsNotifications)
      };
    } catch (error) {
      logger.error('Failed to get channel metrics', { error });
      return {
        email: { sent: 0, delivered: 0, failed: 0, delivery_rate: 0, avg_cost: 0 },
        sms: { sent: 0, delivered: 0, failed: 0, delivery_rate: 0, avg_cost: 0 }
      };
    }
  }

  private calculateChannelMetrics(notifications: any[]): ChannelMetrics {
    const sent = notifications.length;
    const delivered = notifications.filter(n => n.delivery_status === 'delivered').length;
    const failed = notifications.filter(n => n.status === 'failed').length;
    const totalCost = notifications.reduce((sum, n) => sum + (n.cost || 0), 0);

    return {
      sent,
      delivered,
      failed,
      delivery_rate: sent > 0 ? delivered / sent : 0,
      avg_cost: sent > 0 ? totalCost / sent : 0
    };
  }

  async getDeliveryRate(startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await db('notification_history')
        .whereBetween('created_at', [startDate, endDate])
        .select(
          db.raw('COUNT(*) as total'),
          db.raw("COUNT(*) FILTER (WHERE delivery_status = 'delivered') as delivered")
        )
        .first();

      const total = Number(result?.total || 0);
      const delivered = Number(result?.delivered || 0);
      return total > 0 ? delivered / total : 0;
    } catch (error) {
      logger.error('Failed to calculate delivery rate', { error });
      return 0;
    }
  }

  async getBounceRate(startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await db('notification_history')
        .whereBetween('created_at', [startDate, endDate])
        .select(
          db.raw('COUNT(*) as total'),
          db.raw("COUNT(*) FILTER (WHERE delivery_status = 'bounced') as bounced")
        )
        .first();

      const total = Number(result?.total || 0);
      const bounced = Number(result?.bounced || 0);
      return total > 0 ? bounced / total : 0;
    } catch (error) {
      logger.error('Failed to calculate bounce rate', { error });
      return 0;
    }
  }

  async getAverageSendTime(startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await db('notification_history')
        .whereBetween('created_at', [startDate, endDate])
        .whereNotNull('response_time_ms')
        .avg('response_time_ms as avg_time')
        .first();

      return Number(result?.avg_time || 0);
    } catch (error) {
      logger.error('Failed to calculate average send time', { error });
      return 0;
    }
  }

  async getUnsubscribeRate(startDate: Date, endDate: Date): Promise<number> {
    try {
      const [totalDelivered, unsubscribed] = await Promise.all([
        db('notification_history')
          .whereBetween('created_at', [startDate, endDate])
          .where('delivery_status', 'delivered')
          .count('* as count')
          .first(),
        db('notification_preferences')
          .whereBetween('unsubscribed_at', [startDate, endDate])
          .count('* as count')
          .first()
      ]);

      const total = Number(totalDelivered?.count || 0);
      const unsubs = Number(unsubscribed?.count || 0);

      return total > 0 ? unsubs / total : 0;
    } catch (error) {
      logger.error('Failed to calculate unsubscribe rate', { error });
      return 0;
    }
  }

  async getCostPerNotification(startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await db('notification_history')
        .whereBetween('created_at', [startDate, endDate])
        .select(
          db.raw('COUNT(*) as total'),
          db.raw('SUM(cost) as total_cost')
        )
        .first();

      const total = Number(result?.total || 0);
      const totalCost = Number(result?.total_cost || 0);

      return total > 0 ? totalCost / total : 0;
    } catch (error) {
      logger.error('Failed to calculate cost per notification', { error });
      return 0;
    }
  }
}

export const metricsAggregatorService = new MetricsAggregatorService();
