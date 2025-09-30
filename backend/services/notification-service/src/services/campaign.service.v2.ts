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
