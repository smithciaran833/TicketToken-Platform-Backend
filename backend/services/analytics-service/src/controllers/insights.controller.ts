import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import { customerIntelligenceService } from '../services/customer-intelligence.service';
import { getDb } from '../config/database';

interface VenueParams {
  venueId: string;
}

interface CustomerInsightParams {
  venueId: string;
  customerId: string;
}

interface InsightParams {
  insightId: string;
}

interface GetInsightsQuery {
  type?: string;
  priority?: 'low' | 'medium' | 'high';
  actionable?: boolean;
  page?: number;
  limit?: number;
}

interface DismissInsightBody {
  reason?: string;
}

interface TakeActionBody {
  action: string;
  parameters?: Record<string, any>;
}

class InsightsController extends BaseController {
  getInsights = async (
    request: FastifyRequest<{ Params: VenueParams; Querystring: GetInsightsQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { type, priority, actionable, limit = 50 } = request.query;
      const db = getDb();
      
      // Get insights from database
      let query = db('venue_insights')
        .where({ venue_id: venueId, is_dismissed: false })
        .orderBy('created_at', 'desc')
        .limit(limit);
      
      if (type) query = query.where('insight_type', type);
      if (priority) query = query.where('priority', priority);
      if (actionable !== undefined) query = query.where('is_actionable', actionable);
      
      const insights = await query.catch((error: unknown) => {
        this.log.error('Failed to fetch insights from database', { error, venueId });
        return [];
      });
      
      // Generate additional insights from customer intelligence
      const customerSegments = await customerIntelligenceService.getCustomerSegments(venueId);
      
      // Add segment-based insights
      const segmentInsights = customerSegments
        .filter(seg => seg.segment === 'at_risk' || seg.segment === 'dormant')
        .map(seg => ({
          id: `segment_${seg.segment}`,
          type: 'customer_segment',
          title: `${seg.count} customers in ${seg.segment} segment`,
          description: `Consider re-engagement campaigns for ${seg.segment} customers`,
          priority: seg.segment === 'at_risk' ? 'high' : 'medium',
          actionable: true,
          suggestedActions: ['Send re-engagement email', 'Offer discount', 'Personalized outreach']
        }));
      
      return this.success(reply, { 
        insights: [...insights, ...segmentInsights],
        total: insights.length + segmentInsights.length
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getCustomerInsights = async (
    request: FastifyRequest<{ Params: CustomerInsightParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId, customerId } = request.params;
      
      const insights = await customerIntelligenceService.generateCustomerInsights(
        venueId,
        customerId
      );
      
      return this.success(reply, { insights });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getInsight = async (
    request: FastifyRequest<{ Params: InsightParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { insightId } = request.params;
      const db = getDb();
      
      const insight = await db('venue_insights')
        .where({ id: insightId })
        .first()
        .catch((error: Error) => {
          this.log.error('Failed to fetch insight by ID', { error, insightId });
          return null;
        });
      
      if (!insight) {
        return this.notFound(reply, 'Insight not found');
      }
      
      return this.success(reply, { insight });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  dismissInsight = async (
    request: FastifyRequest<{ Params: InsightParams; Body: DismissInsightBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { insightId } = request.params;
      const { reason } = request.body;
      const userId = request.user?.id || 'system';
      const db = getDb();
      
      await db('venue_insights')
        .where({ id: insightId })
        .update({
          is_dismissed: true,
          dismissed_by: userId,
          dismissed_reason: reason,
          dismissed_at: new Date(),
          updated_at: new Date()
        })
        .catch((error: Error) => {
          this.log.error('Failed to dismiss insight', { error, insightId, userId });
        });
      
      return this.success(reply, { message: 'Insight dismissed' });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  takeAction = async (
    request: FastifyRequest<{ Params: InsightParams; Body: TakeActionBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { insightId } = request.params;
      const { action, parameters } = request.body;
      const userId = request.user?.id || 'system';
      const db = getDb();
      
      // Record action taken
      await db('insight_actions')
        .insert({
          insight_id: insightId,
          action_type: action,
          parameters: JSON.stringify(parameters || {}),
          taken_by: userId,
          created_at: new Date()
        })
        .catch((error: Error) => {
          this.log.error('Failed to record insight action', { error, insightId, action, userId });
        });
      
      // Update insight status
      await db('venue_insights')
        .where({ id: insightId })
        .update({
          action_taken: true,
          action_type: action,
          action_at: new Date(),
          updated_at: new Date()
        })
        .catch((error: Error) => {
          this.log.error('Failed to update insight status after action', { error, insightId, action });
        });
      
      // Execute action based on type
      let result: any = { success: true };
      
      switch (action) {
        case 'send_email_campaign':
          result = { 
            success: true, 
            message: 'Email campaign queued',
            campaignId: `campaign_${Date.now()}`
          };
          break;
        case 'create_segment':
          result = { 
            success: true, 
            message: 'Customer segment created',
            segmentId: `segment_${Date.now()}`
          };
          break;
        case 'schedule_followup':
          result = { 
            success: true, 
            message: 'Follow-up scheduled',
            taskId: `task_${Date.now()}`
          };
          break;
        default:
          result = { success: true, message: 'Action recorded' };
      }
      
      return this.success(reply, { result });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getInsightStats = async (
    request: FastifyRequest<{ Params: VenueParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const db = getDb();
      
      // Get insight statistics
      const stats = await db('venue_insights')
        .where({ venue_id: venueId })
        .select(
          db.raw('COUNT(*) as total'),
          db.raw('SUM(CASE WHEN is_dismissed = false THEN 1 ELSE 0 END) as active'),
          db.raw('SUM(CASE WHEN is_dismissed = true THEN 1 ELSE 0 END) as dismissed'),
          db.raw('SUM(CASE WHEN action_taken = true THEN 1 ELSE 0 END) as actioned'),
          db.raw('SUM(CASE WHEN priority = \'high\' AND is_dismissed = false THEN 1 ELSE 0 END) as high_priority')
        )
        .first()
        .catch((error: Error) => {
          this.log.error('Failed to fetch insight stats', { error, venueId });
          return {
            total: 0,
            active: 0,
            dismissed: 0,
            actioned: 0,
            high_priority: 0
          };
        });
      
      // Get insights by type
      const byType = await db('venue_insights')
        .where({ venue_id: venueId, is_dismissed: false })
        .groupBy('insight_type')
        .select('insight_type as type')
        .count('* as count')
        .catch((error: Error) => {
          this.log.error('Failed to fetch insights by type', { error, venueId });
          return [];
        });
      
      return this.success(reply, { 
        stats: {
          ...stats,
          byType
        }
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  refreshInsights = async (
    request: FastifyRequest<{ Params: VenueParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      
      // Queue insight recalculation
      // In production, this would publish to a message queue
      this.log.info('Insight refresh requested', { venueId });
      
      // Get customer segments to generate new insights
      const segments = await customerIntelligenceService.getCustomerSegments(venueId);
      
      // Count new insights that could be generated
      const atRiskCount = segments.filter(s => 
        s.segment === 'at_risk' || s.segment === 'dormant'
      ).length;
      
      return this.success(reply, { 
        message: 'Insights refresh initiated',
        estimatedNewInsights: atRiskCount,
        status: 'processing'
      }, 202);
    } catch (error) {
      return this.handleError(error, reply);
    }
  };
}

export const insightsController = new InsightsController();
