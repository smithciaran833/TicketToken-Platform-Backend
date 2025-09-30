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
    
    const updateData: any = {
      [`${data.metric}`]: db.raw(`COALESCE(${data.metric}, 0) + ?`, [data.increment])
    };
    
    if (data.deliveryTimeMs) {
      updateData.avg_delivery_time_ms = db.raw(
        `(COALESCE(avg_delivery_time_ms * total_delivered, 0) + ?) / NULLIF(total_delivered + 1, 0)`,
        [data.deliveryTimeMs]
      );
    }
    
    await db('notification_analytics')
      .insert({
        date,
        hour,
        channel: data.channel,
        type: data.type,
        provider: data.provider,
        [data.metric]: data.increment,
        avg_delivery_time_ms: data.deliveryTimeMs,
        created_at: now,
        updated_at: now
      })
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
