import { db } from '../config/database';
import { notificationService } from './notification.service';
import { notificationAnalytics } from './delivery-metrics.service';
import { walletPassService } from './wallet-pass.service';
import { automationService } from './automation.service';
import { i18nService } from './i18n.service';
import { logger } from '../config/logger';

export class NotificationOrchestrator {
  async initialize() {
    logger.info('Initializing Notification Orchestrator...');
    
    // Load translations
    await i18nService.loadTranslations();
    
    // Initialize automations
    await automationService.initializeAutomations();
    
    // Start background jobs
    this.startBackgroundJobs();
    
    logger.info('Notification Orchestrator initialized successfully');
  }

  private startBackgroundJobs() {
    // Check abandoned carts every hour
    setInterval(() => {
      automationService.checkAbandonedCarts();
    }, 60 * 60 * 1000);

    // Check for re-engagement daily
    setInterval(() => {
      automationService.checkReEngagement();
    }, 24 * 60 * 60 * 1000);

    // Generate daily analytics
    setInterval(() => {
      this.generateDailyAnalytics();
    }, 24 * 60 * 60 * 1000);

    logger.info('Background jobs started');
  }

  private async generateDailyAnalytics() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get all venues
      const venues = await db('venues').select('id');

      for (const venue of venues) {
        const metrics = await notificationAnalytics.getDeliveryMetrics(
          venue.id,
          yesterday,
          today
        );

        const engagement = await notificationAnalytics.getEngagementMetrics(
          venue.id,
          yesterday,
          today
        );

        const cost = await notificationAnalytics.getCostMetrics(
          venue.id,
          yesterday,
          today
        );

        // Store aggregated metrics
        await db('notification_analytics_daily').insert({
          venue_id: venue.id,
          date: yesterday,
          channel: 'email',
          sent: metrics.sent,
          delivered: metrics.delivered,
          opened: engagement.opened,
          clicked: engagement.clicked,
          bounced: metrics.bounced,
          failed: metrics.failed,
          cost: cost.emailCost,
        });

        // Calculate and update health score
        const healthScore = await notificationAnalytics.getVenueHealthScore(venue.id);
        await db('venue_health_scores').insert({
          venue_id: venue.id,
          overall_score: healthScore,
          delivery_score: 100 - metrics.bounceRate - metrics.failureRate,
          engagement_score: (engagement.openRate + engagement.clickRate) / 2,
          compliance_score: 100, // Would calculate based on compliance metrics
          metrics: JSON.stringify({ metrics, engagement, cost }),
        }).onConflict('venue_id').merge();
      }

      logger.info('Daily analytics generated');
    } catch (error) {
      logger.error('Failed to generate daily analytics', error);
    }
  }

  // Main orchestration methods
  async sendTicketConfirmation(data: {
    ticketId: string;
    customerId: string;
    customerEmail: string;
    customerName: string;
    eventName: string;
    venueName: string;
    venueAddress: string;
    eventDate: Date;
    seatInfo?: string;
  }) {
    try {
      // Check customer preferences
      // const preferences = await preferenceService.getPreferences(data.customerId);
      
      // Determine language
      // const language = preferences.language || 'en';
      
      // Generate wallet passes
      const qrCode = await walletPassService.generatePassQRCode(data.ticketId);
      const passData = {
        eventName: data.eventName,
        venueName: data.venueName,
        venueAddress: data.venueAddress,
        eventDate: data.eventDate,
        ticketId: data.ticketId,
        seatInfo: data.seatInfo,
        customerName: data.customerName,
        qrCodeData: qrCode,
      };

      // const _applePass = await walletPassService.generateApplePass(passData);
      const googlePassUrl = await walletPassService.generateGooglePass(passData);

      // Send confirmation with rich media
//       const richMedia = {
//         images: [{
//           url: qrCode,
//           alt: 'Ticket QR Code',
//         }],
//         buttons: [
//           {
//             text: i18nService.translate('buttons.add_to_apple_wallet', language),
//             url: `${process.env.API_URL}/passes/apple/${data.ticketId}`,
//             style: 'primary' as const,
//           },
//           {
//             text: i18nService.translate('buttons.add_to_google_wallet', language),
//             url: googlePassUrl,
//             style: 'primary' as const,
//           },
//         ],
//       };

      // const _htmlContent = richMediaService.generateEmailHTML(richMedia);

      await notificationService.send({
        recipientId: data.customerId,
        recipient: {
          id: data.customerId,
          email: data.customerEmail,
          name: data.customerName,
        },
        channel: 'email',
        type: 'transactional',
        template: 'purchase_confirmation',
        priority: 'high',
        data: {
          ...data,
          qrCode,
          applePassUrl: `${process.env.API_URL}/passes/apple/${data.ticketId}`,
          googlePassUrl,
        },
        venueId: '', // Would get from ticket data
      });

      logger.info('Ticket confirmation sent with wallet passes', {
        ticketId: data.ticketId,
        customerId: data.customerId,
      });
    } catch (error) {
      logger.error('Failed to send ticket confirmation', error);
      throw error;
    }
  }
}

export const notificationOrchestrator = new NotificationOrchestrator();
