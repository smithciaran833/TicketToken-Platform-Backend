import { db } from '../config/database';
import { logger } from '../config/logger';
import { notificationService } from './notification.service';
import { v4 as uuidv4 } from 'uuid';

export class CampaignService {
  private readonly campaignsTable = 'notification_campaigns';
  private readonly segmentsTable = 'audience_segments';
  private readonly triggersTable = 'email_automation_triggers';
  private readonly abTestsTable = 'ab_tests';
  private readonly abandonedCartsTable = 'abandoned_carts';

  // ============================================================================
  // CAMPAIGN MANAGEMENT
  // ============================================================================

  async createCampaign(campaign: {
    venueId: string;
    name: string;
    templateId: string;
    segmentId?: string;
    audienceFilter?: any;
    scheduledFor?: Date;
    type?: 'transactional' | 'marketing' | 'system';
    channel?: 'email' | 'sms' | 'push' | 'webhook';
  }) {
    const campaignId = uuidv4();
    
    await db(this.campaignsTable).insert({
      id: campaignId,
      venue_id: campaign.venueId,
      name: campaign.name,
      template_id: campaign.templateId,
      segment_id: campaign.segmentId,
      audience_filter: campaign.audienceFilter ? JSON.stringify(campaign.audienceFilter) : null,
      scheduled_for: campaign.scheduledFor,
      type: campaign.type || 'marketing',
      channel: campaign.channel || 'email',
      status: campaign.scheduledFor ? 'scheduled' : 'draft',
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

    // Update status
    await db(this.campaignsTable)
      .where('id', campaignId)
      .update({
        status: 'sending',
        updated_at: new Date()
      });

    // Get audience
    const audience = await this.getAudience(campaign);

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
          channel: campaign.channel,
          type: campaign.type,
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
    await db(this.campaignsTable)
      .where('id', campaignId)
      .update({
        status: 'completed',
        stats_total: audience.length,
        stats_sent: sent,
        stats_failed: failed,
        updated_at: new Date(),
      });

    logger.info('Campaign completed', {
      campaignId,
      sent,
      failed
    });
  }

  async getCampaignStats(campaignId: string) {
    const campaign = await db(this.campaignsTable)
      .where('id', campaignId)
      .first();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    return {
      total: campaign.stats_total,
      sent: campaign.stats_sent,
      delivered: campaign.stats_delivered,
      failed: campaign.stats_failed,
      opened: campaign.stats_opened,
      clicked: campaign.stats_clicked,
      converted: campaign.stats_converted,
      unsubscribed: campaign.stats_unsubscribed,
      openRate: campaign.stats_sent > 0 ? (campaign.stats_opened / campaign.stats_sent * 100).toFixed(2) : 0,
      clickRate: campaign.stats_sent > 0 ? (campaign.stats_clicked / campaign.stats_sent * 100).toFixed(2) : 0,
      conversionRate: campaign.stats_sent > 0 ? (campaign.stats_converted / campaign.stats_sent * 100).toFixed(2) : 0,
    };
  }

  // ============================================================================
  // AUDIENCE SEGMENTATION
  // ============================================================================

  async createSegment(segment: {
    venueId: string;
    name: string;
    description?: string;
    filterCriteria: any;
    isDynamic?: boolean;
  }) {
    const segmentId = uuidv4();

    const memberCount = await this.calculateSegmentSize(segment.venueId, segment.filterCriteria);

    await db(this.segmentsTable).insert({
      id: segmentId,
      venue_id: segment.venueId,
      name: segment.name,
      description: segment.description,
      filter_criteria: JSON.stringify(segment.filterCriteria),
      member_count: memberCount,
      is_dynamic: segment.isDynamic !== false,
      last_calculated_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });

    logger.info('Audience segment created', { segmentId, name: segment.name, memberCount });
    return segmentId;
  }

  async refreshSegment(segmentId: string) {
    const segment = await db(this.segmentsTable)
      .where('id', segmentId)
      .first();

    if (!segment) {
      throw new Error('Segment not found');
    }

    const filterCriteria = JSON.parse(segment.filter_criteria);
    const memberCount = await this.calculateSegmentSize(segment.venue_id, filterCriteria);

    await db(this.segmentsTable)
      .where('id', segmentId)
      .update({
        member_count: memberCount,
        last_calculated_at: new Date(),
        updated_at: new Date(),
      });

    return memberCount;
  }

  private async calculateSegmentSize(venueId: string, filterCriteria: any): Promise<number> {
    // Build query based on filter criteria
    let query = db('users')
      .where('venue_id', venueId);

    // Apply filters
    if (filterCriteria.hasTickets) {
      query = query.whereExists(function() {
        this.select('*').from('tickets').whereRaw('tickets.user_id = users.id');
      });
    }

    if (filterCriteria.hasPurchasedInLast30Days) {
      query = query.whereExists(function() {
        this.select('*')
          .from('orders')
          .whereRaw('orders.user_id = users.id')
          .where('created_at', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      });
    }

    if (filterCriteria.totalSpentGreaterThan) {
      query = query.whereExists(function() {
        this.select('*')
          .from('orders')
          .whereRaw('orders.user_id = users.id')
          .havingRaw('SUM(total_amount) > ?', [filterCriteria.totalSpentGreaterThan]);
      });
    }

    if (filterCriteria.emailEnabled) {
      query = query.whereExists(function() {
        this.select('*')
          .from('notification_preferences')
          .whereRaw('notification_preferences.user_id = users.id')
          .where('email_enabled', true)
          .where('email_marketing', true);
      });
    }

    const result = await query.count('* as count').first();
    const count = result?.count;
    return parseInt(String(count || 0));
  }

  // ============================================================================
  // EMAIL AUTOMATION TRIGGERS
  // ============================================================================

  async createAutomationTrigger(trigger: {
    venueId: string;
    name: string;
    triggerType: string;
    templateId: string;
    triggerConditions: any;
    delayMinutes?: number;
  }) {
    const triggerId = uuidv4();

    await db(this.triggersTable).insert({
      id: triggerId,
      venue_id: trigger.venueId,
      name: trigger.name,
      trigger_type: trigger.triggerType,
      template_id: trigger.templateId,
      trigger_conditions: JSON.stringify(trigger.triggerConditions),
      delay_minutes: trigger.delayMinutes || 0,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    logger.info('Automation trigger created', { triggerId, name: trigger.name });
    return triggerId;
  }

  async processAutomationTrigger(triggerType: string, eventData: any) {
    // Find active triggers of this type
    const triggers = await db(this.triggersTable)
      .where('trigger_type', triggerType)
      .where('is_active', true);

    for (const trigger of triggers) {
      const conditions = JSON.parse(trigger.trigger_conditions);

      // Check if conditions are met
      if (this.checkTriggerConditions(conditions, eventData)) {
        // Schedule the email with delay
        const scheduledFor = new Date(Date.now() + trigger.delay_minutes * 60 * 1000);

        await notificationService.send({
          venueId: trigger.venue_id,
          recipientId: eventData.userId,
          recipient: eventData.recipient,
          channel: 'email',
          type: 'marketing',
          template: trigger.template_name,
          priority: 'normal',
          scheduledFor,
          data: eventData,
          metadata: {
            triggerId: trigger.id,
            triggerType: trigger.trigger_type,
          },
        });

        // Increment sent count
        await db(this.triggersTable)
          .where('id', trigger.id)
          .increment('sent_count', 1);

        logger.info('Automation trigger fired', {
          triggerId: trigger.id,
          triggerType: trigger.trigger_type,
          userId: eventData.userId
        });
      }
    }
  }

  private checkTriggerConditions(conditions: any, eventData: any): boolean {
    // Simple condition checking logic
    // Can be enhanced with more complex rules
    if (conditions.minCartValue && eventData.cartValue < conditions.minCartValue) {
      return false;
    }

    if (conditions.eventType && eventData.eventType !== conditions.eventType) {
      return false;
    }

    return true;
  }

  // ============================================================================
  // ABANDONED CART RECOVERY
  // ============================================================================

  async trackAbandonedCart(cartData: {
    userId: string;
    venueId: string;
    eventId: string;
    cartItems: any[];
    totalAmountCents: number;
  }) {
    const cartId = uuidv4();

    await db(this.abandonedCartsTable).insert({
      id: cartId,
      user_id: cartData.userId,
      venue_id: cartData.venueId,
      event_id: cartData.eventId,
      cart_items: JSON.stringify(cartData.cartItems),
      total_amount_cents: cartData.totalAmountCents,
      abandoned_at: new Date(),
      created_at: new Date(),
    });

    logger.info('Abandoned cart tracked', { cartId, userId: cartData.userId });
    return cartId;
  }

  async processAbandonedCarts() {
    // Find carts abandoned more than 1 hour ago that haven't been emailed
    const abandonedCarts = await db(this.abandonedCartsTable)
      .where('recovery_email_sent', false)
      .where('converted', false)
      .where('abandoned_at', '<', new Date(Date.now() - 60 * 60 * 1000))
      .limit(100);

    for (const cart of abandonedCarts) {
      await this.processAutomationTrigger('abandoned_cart', {
        userId: cart.user_id,
        venueId: cart.venue_id,
        eventId: cart.event_id,
        cartItems: JSON.parse(cart.cart_items),
        totalAmount: cart.total_amount_cents / 100,
        recipient: {
          id: cart.user_id,
          email: '', // Would fetch from user table
          name: '',
        }
      });

      // Mark as sent
      await db(this.abandonedCartsTable)
        .where('id', cart.id)
        .update({
          recovery_email_sent: true,
          recovery_email_sent_at: new Date(),
        });
    }

    logger.info('Processed abandoned carts', { count: abandonedCarts.length });
  }

  // ============================================================================
  // A/B TESTING
  // ============================================================================

  async createABTest(test: {
    venueId: string;
    name: string;
    description?: string;
    testType: string;
    variantCount: number;
    sampleSizePerVariant: number;
    winningMetric: string;
    variants: Array<{
      name: string;
      templateId?: string;
      variantData: any;
    }>;
  }) {
    const testId = uuidv4();

    await db(this.abTestsTable).insert({
      id: testId,
      venue_id: test.venueId,
      name: test.name,
      description: test.description,
      test_type: test.testType,
      variant_count: test.variantCount,
      sample_size_per_variant: test.sampleSizePerVariant,
      winning_metric: test.winningMetric,
      status: 'draft',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Create variants
    for (const variant of test.variants) {
      await db('ab_test_variants').insert({
        id: uuidv4(),
        ab_test_id: testId,
        variant_name: variant.name,
        template_id: variant.templateId,
        variant_data: JSON.stringify(variant.variantData),
        created_at: new Date(),
      });
    }

    logger.info('A/B test created', { testId, name: test.name });
    return testId;
  }

  async startABTest(testId: string) {
    await db(this.abTestsTable)
      .where('id', testId)
      .update({
        status: 'running',
        started_at: new Date(),
        updated_at: new Date(),
      });

    logger.info('A/B test started', { testId });
  }

  async recordABTestResult(testId: string, variantId: string, metric: 'opened' | 'clicked' | 'converted') {
    const column = `${metric}_count`;
    
    await db('ab_test_variants')
      .where('id', variantId)
      .increment(column, 1);

    // Recalculate rates
    const variant = await db('ab_test_variants').where('id', variantId).first();
    
    if (variant.sent_count > 0) {
      await db('ab_test_variants')
        .where('id', variantId)
        .update({
          open_rate: (variant.opened_count / variant.sent_count * 100).toFixed(2),
          click_rate: (variant.clicked_count / variant.sent_count * 100).toFixed(2),
          conversion_rate: (variant.converted_count / variant.sent_count * 100).toFixed(2),
        });
    }
  }

  async determineABTestWinner(testId: string) {
    const test = await db(this.abTestsTable).where('id', testId).first();
    
    if (!test) {
      throw new Error('A/B test not found');
    }

    const variants = await db('ab_test_variants')
      .where('ab_test_id', testId)
      .orderBy(test.winning_metric, 'desc');

    const winner = variants[0];

    await db(this.abTestsTable)
      .where('id', testId)
      .update({
        winner_variant_id: winner.id,
        status: 'completed',
        completed_at: new Date(),
        updated_at: new Date(),
      });

    logger.info('A/B test winner determined', {
      testId,
      winnerId: winner.id,
      winnerName: winner.variant_name
    });

    return winner;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async getAudience(campaign: any) {
    // If segment is specified, use that
    if (campaign.segment_id) {
      const segment = await db(this.segmentsTable)
        .where('id', campaign.segment_id)
        .first();

      const filterCriteria = JSON.parse(segment.filter_criteria);
      return await this.queryAudience(campaign.venue_id, filterCriteria);
    }

    // If audience filter is specified, use that
    if (campaign.audience_filter) {
      const filterCriteria = JSON.parse(campaign.audience_filter);
      return await this.queryAudience(campaign.venue_id, filterCriteria);
    }

    // Default: all users with email marketing enabled
    return await this.queryAudience(campaign.venue_id, { emailEnabled: true });
  }

  private async queryAudience(venueId: string, filterCriteria: any) {
    let query = db('users')
      .where('venue_id', venueId);

    // Apply same filters as calculateSegmentSize
    if (filterCriteria.emailEnabled) {
      query = query.whereExists(function() {
        this.select('*')
          .from('notification_preferences')
          .whereRaw('notification_preferences.user_id = users.id')
          .where('email_enabled', true)
          .where('email_marketing', true);
      });
    }

    // Add more filter logic as needed

    return await query.select('id', 'email', 'name', 'phone');
  }
}

export const campaignService = new CampaignService();
