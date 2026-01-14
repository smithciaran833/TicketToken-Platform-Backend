import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CampaignService } from '../../../src/services/campaign.service';
import { db } from '../../../src/config/database';
import { notificationService } from '../../../src/services/notification.service';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/services/notification.service');

const mockDb = db as any;
const mockNotificationService = notificationService as any;

describe('CampaignService', () => {
  let service: CampaignService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CampaignService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCampaign()', () => {
    it('should create a new campaign', async () => {
      mockDb.mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'campaign-123' }])
      });

      const campaignData = {
        venueId: 'venue-123',
        name: 'Summer Sale Campaign',
        templateId: 'template-123',
        type: 'marketing' as const,
        channel: 'email' as const
      };

      const campaignId = await service.createCampaign(campaignData);

      expect(campaignId).toBe('campaign-123');
      expect(mockDb).toHaveBeenCalledWith('notification_campaigns');
    });

    it('should create campaign with segment', async () => {
      mockDb.mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'campaign-123' }])
      });

      const campaignData = {
        venueId: 'venue-123',
        name: 'VIP Campaign',
        templateId: 'template-123',
        segmentId: 'segment-123',
        type: 'marketing' as const,
        channel: 'email' as const
      };

      await service.createCampaign(campaignData);

      expect(mockDb).toHaveBeenCalledWith('notification_campaigns');
    });

    it('should create scheduled campaign', async () => {
      mockDb.mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'campaign-123' }])
      });

      const scheduledFor = new Date('2024-12-25T10:00:00Z');
      const campaignData = {
        venueId: 'venue-123',
        name: 'Holiday Campaign',
        templateId: 'template-123',
        scheduledFor,
        type: 'marketing' as const,
        channel: 'email' as const
      };

      await service.createCampaign(campaignData);

      expect(mockDb).toHaveBeenCalledWith('notification_campaigns');
    });
  });

  describe('sendCampaign()', () => {
    it('should send campaign to all audience members', async () => {
      const mockCampaign = {
        id: 'campaign-123',
        venue_id: 'venue-123',
        name: 'Test Campaign',
        channel: 'email',
        type: 'marketing',
        template_name: 'newsletter'
      };

      const mockAudience = [
        { id: 'user-1', email: 'user1@example.com', name: 'User 1' },
        { id: 'user-2', email: 'user2@example.com', name: 'User 2' }
      ];

      // Mock campaign fetch
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockCampaign)
      });

      // Mock status update
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      // Mock audience query
      jest.spyOn(service as any, 'getAudience').mockResolvedValue(mockAudience);

      // Mock notification sends
      mockNotificationService.send.mockResolvedValue({ status: 'sent' });

      // Mock stats update
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      await service.sendCampaign('campaign-123');

      expect(mockNotificationService.send).toHaveBeenCalledTimes(2);
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-123',
          channel: 'email',
          type: 'marketing'
        })
      );
    });

    it('should handle send failures gracefully', async () => {
      const mockCampaign = {
        id: 'campaign-123',
        venue_id: 'venue-123',
        name: 'Test Campaign',
        channel: 'email',
        type: 'marketing',
        template_name: 'newsletter'
      };

      const mockAudience = [
        { id: 'user-1', email: 'user1@example.com', name: 'User 1' }
      ];

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockCampaign)
      });

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      jest.spyOn(service as any, 'getAudience').mockResolvedValue(mockAudience);

      mockNotificationService.send.mockRejectedValue(new Error('Send failed'));

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(true)
      });

      await service.sendCampaign('campaign-123');

      // Should complete despite failure
      expect(mockDb).toHaveBeenCalled();
    });

    it('should throw error if campaign not found', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      await expect(service.sendCampaign('non-existent')).rejects.toThrow('Campaign not found');
    });
  });

  describe('getCampaignStats()', () => {
    it('should return campaign statistics', async () => {
      const mockCampaign = {
        id: 'campaign-123',
        stats_total: 1000,
        stats_sent: 950,
        stats_delivered: 900,
        stats_failed: 50,
        stats_opened: 450,
        stats_clicked: 180,
        stats_converted: 45,
        stats_unsubscribed: 10
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockCampaign)
      });

      const stats = await service.getCampaignStats('campaign-123');

      expect(stats.total).toBe(1000);
      expect(stats.sent).toBe(950);
      expect(stats.openRate).toBe('47.37'); // 450/950 * 100
      expect(stats.clickRate).toBe('18.95'); // 180/950 * 100
      expect(stats.conversionRate).toBe('4.74'); // 45/950 * 100
    });

    it('should handle zero sent gracefully', async () => {
      const mockCampaign = {
        id: 'campaign-123',
        stats_total: 1000,
        stats_sent: 0,
        stats_delivered: 0,
        stats_failed: 0,
        stats_opened: 0,
        stats_clicked: 0,
        stats_converted: 0,
        stats_unsubscribed: 0
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockCampaign)
      });

      const stats = await service.getCampaignStats('campaign-123');

      expect(stats.openRate).toBe(0);
      expect(stats.clickRate).toBe(0);
      expect(stats.conversionRate).toBe(0);
    });

    it('should throw error if campaign not found', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      await expect(service.getCampaignStats('non-existent')).rejects.toThrow('Campaign not found');
    });
  });

  describe('Audience Segmentation', () => {
    describe('createSegment()', () => {
      it('should create audience segment', async () => {
        jest.spyOn(service as any, 'calculateSegmentSize').mockResolvedValue(150);

        mockDb.mockReturnValue({
          insert: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([{ id: 'segment-123' }])
        });

        const segmentData = {
          venueId: 'venue-123',
          name: 'Active Users',
          filterCriteria: { hasPurchasedInLast30Days: true },
          isDynamic: true
        };

        const segmentId = await service.createSegment(segmentData);

        expect(segmentId).toBe('segment-123');
        expect(mockDb).toHaveBeenCalledWith('audience_segments');
      });
    });

    describe('refreshSegment()', () => {
      it('should recalculate segment member count', async () => {
        const mockSegment = {
          id: 'segment-123',
          venue_id: 'venue-123',
          filter_criteria: JSON.stringify({ emailEnabled: true })
        };

        mockDb.mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(mockSegment)
        });

        jest.spyOn(service as any, 'calculateSegmentSize').mockResolvedValue(250);

        mockDb.mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(true)
        });

        const memberCount = await service.refreshSegment('segment-123');

        expect(memberCount).toBe(250);
      });

      it('should throw error if segment not found', async () => {
        mockDb.mockReturnValue({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null)
        });

        await expect(service.refreshSegment('non-existent')).rejects.toThrow('Segment not found');
      });
    });
  });

  describe('Abandoned Cart Recovery', () => {
    describe('trackAbandonedCart()', () => {
      it('should track abandoned cart', async () => {
        mockDb.mockReturnValue({
          insert: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([{ id: 'cart-123' }])
        });

        const cartData = {
          userId: 'user-123',
          venueId: 'venue-123',
          eventId: 'event-123',
          cartItems: [{ ticketId: 'ticket-1', quantity: 2 }],
          totalAmountCents: 10000
        };

        const cartId = await service.trackAbandonedCart(cartData);

        expect(cartId).toBe('cart-123');
        expect(mockDb).toHaveBeenCalledWith('abandoned_carts');
      });
    });

    describe('processAbandonedCarts()', () => {
      it('should process abandoned carts', async () => {
        const mockCarts = [
          {
            id: 'cart-1',
            user_id: 'user-1',
            venue_id: 'venue-123',
            event_id: 'event-123',
            cart_items: JSON.stringify([{ ticketId: 'ticket-1' }]),
            total_amount_cents: 5000
          }
        ];

        mockDb.mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue(mockCarts)
        });

        jest.spyOn(service as any, 'processAutomationTrigger').mockResolvedValue(undefined);

        mockDb.mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(true)
        });

        await service.processAbandonedCarts();

        expect(mockDb).toHaveBeenCalled();
      });
    });
  });

  describe('Email Automation Triggers', () => {
    describe('createAutomationTrigger()', () => {
      it('should create automation trigger', async () => {
        mockDb.mockReturnValue({
          insert: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([{ id: 'trigger-123' }])
        });

        const triggerData = {
          venueId: 'venue-123',
          name: 'Welcome Email',
          triggerType: 'user_signup',
          templateId: 'template-123',
          triggerConditions: {},
          delayMinutes: 0
        };

        const triggerId = await service.createAutomationTrigger(triggerData);

        expect(triggerId).toBe('trigger-123');
        expect(mockDb).toHaveBeenCalledWith('email_automation_triggers');
      });

      it('should create delayed trigger', async () => {
        mockDb.mockReturnValue({
          insert: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([{ id: 'trigger-123' }])
        });

        const triggerData = {
          venueId: 'venue-123',
          name: 'Post-Purchase Follow-up',
          triggerType: 'purchase_complete',
          templateId: 'template-123',
          triggerConditions: {},
          delayMinutes: 1440 // 24 hours
        };

        await service.createAutomationTrigger(triggerData);

        expect(mockDb).toHaveBeenCalled();
      });
    });

    describe('processAutomationTrigger()', () => {
      it('should process matching triggers', async () => {
        const mockTriggers = [
          {
            id: 'trigger-1',
            venue_id: 'venue-123',
            trigger_type: 'purchase_complete',
            template_name: 'thank-you',
            trigger_conditions: JSON.stringify({}),
            delay_minutes: 0
          }
        ];

        mockDb.mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue(mockTriggers)
        });

        jest.spyOn(service as any, 'checkTriggerConditions').mockReturnValue(true);

        mockNotificationService.send.mockResolvedValue({ status: 'sent' });

        mockDb.mockReturnValue({
          where: jest.fn().mockReturnThis(),
          increment: jest.fn().mockResolvedValue(true)
        });

        const eventData = {
          userId: 'user-123',
          recipient: { id: 'user-123', email: 'test@example.com', name: 'Test' }
        };

        await service.processAutomationTrigger('purchase_complete', eventData);

        expect(mockNotificationService.send).toHaveBeenCalled();
      });
    });
  });

  describe('A/B Testing', () => {
    describe('createABTest()', () => {
      it('should create A/B test', async () => {
        mockDb.mockReturnValueOnce({
          insert: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([{ id: 'test-123' }])
        });

        // Mock variant inserts
        mockDb.mockReturnValue({
          insert: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([{ id: 'variant-1' }])
        });

        const testData = {
          venueId: 'venue-123',
          name: 'Subject Line Test',
          testType: 'subject_line',
          variantCount: 2,
          sampleSizePerVariant: 500,
          winningMetric: 'open_rate',
          variants: [
            { name: 'Variant A', templateId: 'template-1', variantData: {} },
            { name: 'Variant B', templateId: 'template-2', variantData: {} }
          ]
        };

        const testId = await service.createABTest(testData);

        expect(testId).toBe('test-123');
        expect(mockDb).toHaveBeenCalledWith('ab_tests');
      });
    });

    describe('startABTest()', () => {
      it('should start A/B test', async () => {
        mockDb.mockReturnValue({
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(true)
        });

        await service.startABTest('test-123');

        expect(mockDb).toHaveBeenCalledWith('ab_tests');
      });
    });

    describe('recordABTestResult()', () => {
      it('should record test result and update rates', async () => {
        const mockVariant = {
          id: 'variant-1',
          sent_count: 100,
          opened_count: 45,
          clicked_count: 15,
          converted_count: 5
        };

        mockDb.mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          increment: jest.fn().mockResolvedValue(true)
        });

        mockDb.mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(mockVariant)
        });

        mockDb.mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(true)
        });

        await service.recordABTestResult('test-123', 'variant-1', 'opened');

        expect(mockDb).toHaveBeenCalled();
      });
    });

    describe('determineABTestWinner()', () => {
      it('should determine winner based on winning metric', async () => {
        const mockTest = {
          id: 'test-123',
          winning_metric: 'open_rate'
        };

        const mockVariants = [
          {
            id: 'variant-1',
            variant_name: 'Variant A',
            open_rate: 48.5
          },
          {
            id: 'variant-2',
            variant_name: 'Variant B',
            open_rate: 42.1
          }
        ];

        mockDb.mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(mockTest)
        });

        mockDb.mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockResolvedValue(mockVariants)
        });

        mockDb.mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(true)
        });

        const winner = await service.determineABTestWinner('test-123');

        expect(winner.id).toBe('variant-1');
        expect(winner.variant_name).toBe('Variant A');
      });

      it('should throw error if test not found', async () => {
        mockDb.mockReturnValue({
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null)
        });

        await expect(service.determineABTestWinner('non-existent')).rejects.toThrow('A/B test not found');
      });
    });
  });
});
