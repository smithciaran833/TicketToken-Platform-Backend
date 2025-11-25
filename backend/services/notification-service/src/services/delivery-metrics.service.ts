import { db } from '../config/database';
import { redis } from '../config/redis';

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
    await redis.setex(
      `metrics:delivery:${venueId || 'all'}`,
      300, // 5 minutes
      JSON.stringify(metrics)
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
