import { db } from '../config/database';
import { logger } from '../config/logger';
import { notificationService } from './notification.service';
import { v4 as uuidv4 } from 'uuid';

export class CampaignService {
  private readonly tableName = 'campaigns';

  async createCampaign(campaign: {
    venueId: string;
    name: string;
    templateId: string;
    audienceFilter: any;
    scheduledFor?: Date;
  }) {
    const campaignId = uuidv4();
    
    await db(this.tableName).insert({
      id: campaignId,
      venue_id: campaign.venueId,
      name: campaign.name,
      template_id: campaign.templateId,
      audience_filter: JSON.stringify(campaign.audienceFilter),
      scheduled_for: campaign.scheduledFor,
      status: campaign.scheduledFor ? 'scheduled' : 'draft',
      created_at: new Date(),
      updated_at: new Date(),
    });

    logger.info('Campaign created', { campaignId, name: campaign.name });
    return campaignId;
  }

  async sendCampaign(campaignId: string) {
    const campaign = await db(this.tableName)
      .where('id', campaignId)
      .first();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Update status
    await db(this.tableName)
      .where('id', campaignId)
      .update({ 
        status: 'sending',
        updated_at: new Date()
      });

    // Get audience based on filter
    const audience = await this.getAudience(
      campaign.venue_id,
      JSON.parse(campaign.audience_filter)
    );

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
          channel: 'email',
          type: 'marketing',
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
    await db(this.tableName)
      .where('id', campaignId)
      .update({
        status: 'completed',
        stats: JSON.stringify({
          total: audience.length,
          sent,
          failed,
          delivered: 0,
          opened: 0,
          clicked: 0,
        }),
        updated_at: new Date(),
      });

    logger.info('Campaign completed', { 
      campaignId, 
      sent, 
      failed 
    });
  }

  private async getAudience(_venueId: string, _filter: any) {
    // This would query your customer database based on filter criteria
    // For now, returning mock data
    return [
      {
        id: 'customer-1',
        email: 'customer1@example.com',
        name: 'John Doe',
        phone: '+15551234567',
      },
    ];
  }
}

export const campaignService = new CampaignService();
