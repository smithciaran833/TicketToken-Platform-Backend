import { campaignService } from '../services/campaign.service';
import { logger } from '../config/logger';

/**
 * Process abandoned cart recovery emails
 * Runs every hour
 */
export async function processAbandonedCartsJob() {
  logger.info('Starting abandoned cart recovery job');
  
  try {
    await campaignService.processAbandonedCarts();
    logger.info('Abandoned cart recovery job completed');
  } catch (error) {
    logger.error('Abandoned cart recovery job failed', { error });
  }
}

/**
 * Refresh dynamic audience segments
 * Runs every 6 hours
 */
export async function refreshSegmentsJob() {
  logger.info('Starting segment refresh job');
  
  try {
    // Get all dynamic segments
    const { db } = await import('../config/database');
    const segments = await db('audience_segments')
      .where('is_dynamic', true)
      .select('id');

    for (const segment of segments) {
      await campaignService.refreshSegment(segment.id);
    }

    logger.info('Segment refresh job completed', { count: segments.length });
  } catch (error) {
    logger.error('Segment refresh job failed', { error });
  }
}

/**
 * Send scheduled campaigns
 * Runs every 5 minutes
 */
export async function sendScheduledCampaignsJob() {
  logger.info('Starting scheduled campaigns job');
  
  try {
    const { db } = await import('../config/database');
    
    // Find campaigns scheduled for now
    const campaigns = await db('notification_campaigns')
      .where('status', 'scheduled')
      .where('scheduled_for', '<=', new Date())
      .select('id');

    for (const campaign of campaigns) {
      await campaignService.sendCampaign(campaign.id);
    }

    logger.info('Scheduled campaigns job completed', { count: campaigns.length });
  } catch (error) {
    logger.error('Scheduled campaigns job failed', { error });
  }
}

/**
 * Start all campaign jobs
 */
export function startCampaignJobs() {
  logger.info('Campaign jobs initialized');
  
  // These would be registered with your job scheduler
  // Example: node-cron, bull, etc.
}
