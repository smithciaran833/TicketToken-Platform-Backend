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
