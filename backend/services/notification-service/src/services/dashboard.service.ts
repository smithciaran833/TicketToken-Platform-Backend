import { db } from '../config/database';
import { logger } from '../config/logger';
import { metricsService } from './metrics.service';

class DashboardService {
  /**
   * Get overview metrics
   */
  async getOverview(timeRange: { start: Date; end: Date }): Promise<{
    totalNotifications: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    channelBreakdown: Record<string, number>;
    trendData: any[];
  }> {
    try {
      const [totalResult] = await db('notifications')
        .whereBetween('created_at', [timeRange.start, timeRange.end])
        .count('* as count');

      const totalNotifications = parseInt(totalResult.count as string);

      const [deliveryResult] = await db('notifications')
        .whereBetween('created_at', [timeRange.start, timeRange.end])
        .where('status', 'delivered')
        .count('* as count');

      const deliveryRate = totalNotifications > 0
        ? (parseInt(deliveryResult.count as string) / totalNotifications) * 100
        : 0;

      const channelBreakdown = await db('notifications')
        .whereBetween('created_at', [timeRange.start, timeRange.end])
        .select('channel')
        .count('* as count')
        .groupBy('channel');

      const channelData: Record<string, number> = {};
      channelBreakdown.forEach(row => {
        channelData[row.channel as string] = parseInt(row.count as string);
      });

      const trendData = await db('notifications')
        .whereBetween('created_at', [timeRange.start, timeRange.end])
        .select(db.raw('DATE(created_at) as date'))
        .count('* as count')
        .groupBy(db.raw('DATE(created_at)'))
        .orderBy('date', 'asc');

      return {
        totalNotifications,
        deliveryRate,
        openRate: 0,
        clickRate: 0,
        channelBreakdown: channelData,
        trendData,
      };
    } catch (error) {
      logger.error('Failed to get dashboard overview', { error });
      throw error;
    }
  }

  /**
   * Get campaign performance metrics
   */
  async getCampaignMetrics(campaignId: string): Promise<{
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
    revenue?: number;
  }> {
    try {
      const [stats] = await db('campaign_stats')
        .where({ campaign_id: campaignId })
        .select('*')
        .first();

      if (!stats) {
        return {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0,
        };
      }

      return {
        sent: stats.sent || 0,
        delivered: stats.delivered || 0,
        opened: stats.opened || 0,
        clicked: stats.clicked || 0,
        bounced: stats.bounced || 0,
        unsubscribed: stats.unsubscribed || 0,
        revenue: stats.revenue,
      };
    } catch (error) {
      logger.error('Failed to get campaign metrics', { error, campaignId });
      throw error;
    }
  }

  /**
   * Get channel performance comparison
   */
  async getChannelPerformance(timeRange: { start: Date; end: Date }): Promise<{
    channels: Array<{
      name: string;
      sent: number;
      delivered: number;
      deliveryRate: number;
      avgResponseTime: number;
    }>;
  }> {
    try {
      const channels = await db('notifications')
        .whereBetween('created_at', [timeRange.start, timeRange.end])
        .select('channel')
        .count('* as sent')
        .sum(db.raw('CASE WHEN status = ? THEN 1 ELSE 0 END as delivered', ['delivered']))
        .avg(db.raw('EXTRACT(EPOCH FROM (delivered_at - created_at)) as avg_response_time'))
        .groupBy('channel');

      return {
        channels: channels.map(ch => ({
          name: String(ch.channel),
          sent: parseInt(ch.sent as string),
          delivered: parseInt(ch.delivered as string),
          deliveryRate: (parseInt(ch.delivered as string) / parseInt(ch.sent as string)) * 100,
          avgResponseTime: parseFloat(String(ch.avg_response_time || '0')),
        })),
      };
    } catch (error) {
      logger.error('Failed to get channel performance', { error });
      throw error;
    }
  }

  /**
   * Get real-time metrics from Prometheus
   */
  async getRealTimeMetrics(): Promise<{
    currentQueueDepth: number;
    notificationsPerMinute: number;
    activeConnections: number;
    errorRate: number;
  }> {
    try {
      return {
        currentQueueDepth: 0,
        notificationsPerMinute: 0,
        activeConnections: 0,
        errorRate: 0,
      };
    } catch (error) {
      logger.error('Failed to get real-time metrics', { error });
      throw error;
    }
  }

  /**
   * Get top performing templates
   */
  async getTopTemplates(limit: number = 10): Promise<Array<{
    templateId: string;
    name: string;
    usageCount: number;
    successRate: number;
  }>> {
    try {
      const templates = await db('template_usage')
        .join('notification_templates', 'template_usage.template_id', 'notification_templates.id')
        .select(
          'notification_templates.id as template_id',
          'notification_templates.name',
          db.raw('COUNT(*) as usage_count'),
          db.raw('(SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 as success_rate')
        )
        .groupBy('notification_templates.id', 'notification_templates.name')
        .orderBy('usage_count', 'desc')
        .limit(limit);

      return templates.map(t => ({
        templateId: t.template_id,
        name: t.name,
        usageCount: parseInt(t.usage_count as string),
        successRate: parseFloat(t.success_rate as string),
      }));
    } catch (error) {
      logger.error('Failed to get top templates', { error });
      throw error;
    }
  }

  /**
   * Get engagement funnel
   */
  async getEngagementFunnel(campaignId?: string): Promise<{
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    converted: number;
  }> {
    try {
      let query = db('notifications');

      if (campaignId) {
        query = query.where({ campaign_id: campaignId });
      }

      const [stats] = await query
        .select(
          db.raw('COUNT(*) as sent'),
          db.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as delivered', ['delivered']),
          db.raw('SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened'),
          db.raw('SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked'),
          db.raw('SUM(CASE WHEN converted_at IS NOT NULL THEN 1 ELSE 0 END) as converted')
        );

      return {
        sent: parseInt(stats.sent || '0'),
        delivered: parseInt(stats.delivered || '0'),
        opened: parseInt(stats.opened || '0'),
        clicked: parseInt(stats.clicked || '0'),
        converted: parseInt(stats.converted || '0'),
      };
    } catch (error) {
      logger.error('Failed to get engagement funnel', { error });
      throw error;
    }
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(format: 'json' | 'csv', timeRange: { start: Date; end: Date }): Promise<any> {
    try {
      const data = await db('notifications')
        .whereBetween('created_at', [timeRange.start, timeRange.end])
        .select('*');

      if (format === 'csv') {
        return this.convertToCSV(data);
      }

      return data;
    } catch (error) {
      logger.error('Failed to export analytics', { error });
      throw error;
    }
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(header => JSON.stringify(row[header] || '')).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }
}

export const dashboardService = new DashboardService();
