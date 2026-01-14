import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import { customerInsightsService } from '../services/customer-insights.service';
import { customerIntelligenceService } from '../services/customer-intelligence.service';
import { attributionService } from '../services/attribution.service';

interface VenueParams {
  venueId: string;
}

interface CustomerParams {
  venueId: string;
  customerId: string;
}

interface SegmentParams {
  venueId: string;
  segment: string;
}

interface JourneyQuery {
  startDate?: string;
  endDate?: string;
}

interface SearchQuery {
  q: string;
  segment?: string;
  page?: number;
  limit?: number;
}

// Use the globally augmented FastifyRequest which has user?: AuthUser
// See: middleware/auth.middleware.ts for the Fastify module augmentation

class CustomerController extends BaseController {
  getCustomerSegments = async (
    request: FastifyRequest<{ Params: VenueParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const tenantId = request.user?.tenantId || venueId;
      
      const segments = await customerInsightsService.segmentCustomers(venueId, tenantId);
      return this.success(reply, { segments });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getCustomerProfile = async (
    request: FastifyRequest<{ Params: CustomerParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { customerId } = request.params;
      const tenantId = request.user?.tenantId || '';
      
      const profile = await customerInsightsService.getCustomerProfile(customerId, tenantId);
      if (!profile) {
        return this.notFound(reply, 'Customer profile not found');
      }
      return this.success(reply, { profile });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getCustomerInsights = async (
    request: FastifyRequest<{ Params: CustomerParams }>,
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

  getCustomerJourney = async (
    request: FastifyRequest<{ Params: CustomerParams; Querystring: JourneyQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId, customerId } = request.params;
      const { startDate, endDate } = request.query;
      
      const journey = await attributionService.getCustomerJourney(
        venueId,
        customerId,
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      );
      return this.success(reply, { journey });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getRFMAnalysis = async (
    request: FastifyRequest<{ Params: CustomerParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId, customerId } = request.params;
      
      const rfm = await customerIntelligenceService.performRFMAnalysis(venueId, customerId);
      return this.success(reply, { rfm });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getCustomerLifetimeValue = async (
    request: FastifyRequest<{ Params: CustomerParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { customerId } = request.params;
      const tenantId = request.user?.tenantId || '';
      
      const clv = await customerInsightsService.getCustomerCLV(customerId, tenantId);
      if (!clv) {
        return this.notFound(reply, 'CLV data not found for customer');
      }
      return this.success(reply, { clv });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  searchCustomers = async (
    request: FastifyRequest<{ Params: VenueParams; Querystring: SearchQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { q, segment, limit = 50 } = request.query;
      
      // Use customer insights service to get filtered customers
      const customers = await customerInsightsService.getVenueCustomers(venueId, {
        segment,
        limit
      });
      
      // Filter by search query if provided
      const filteredCustomers = q 
        ? customers.filter((c: any) => 
            c.email?.toLowerCase().includes(q.toLowerCase()) ||
            c.first_name?.toLowerCase().includes(q.toLowerCase()) ||
            c.last_name?.toLowerCase().includes(q.toLowerCase())
          )
        : customers;
      
      return this.success(reply, { 
        customers: filteredCustomers,
        total: filteredCustomers.length
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getSegmentAnalysis = async (
    request: FastifyRequest<{ Params: SegmentParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId, segment } = request.params;
      
      // Get customers in the segment
      const customers = await customerInsightsService.getVenueCustomers(venueId, {
        segment,
        limit: 1000
      });
      
      // Get RFM scores for the segment
      const rfmScores = await customerInsightsService.getRFMScores(venueId, {
        segment,
        limit: 1000
      });
      
      // Calculate segment analysis metrics
      const totalCustomers = customers.length;
      const totalRevenue = customers.reduce((sum: number, c: any) => sum + (c.lifetime_value || 0), 0);
      const avgOrderValue = totalCustomers > 0 
        ? customers.reduce((sum: number, c: any) => sum + (c.average_order_value || 0), 0) / totalCustomers 
        : 0;
      
      const avgRFMScore = rfmScores.length > 0
        ? rfmScores.reduce((sum: number, r: any) => sum + (r.total_score || 0), 0) / rfmScores.length
        : 0;
      
      // Calculate churn risk distribution
      const churnRiskDistribution = {
        low: customers.filter((c: any) => c.churn_risk === 'low').length,
        medium: customers.filter((c: any) => c.churn_risk === 'medium').length,
        high: customers.filter((c: any) => c.churn_risk === 'high').length
      };
      
      return this.success(reply, { 
        analysis: {
          segment,
          totalCustomers,
          totalRevenue,
          avgOrderValue,
          avgRFMScore,
          churnRiskDistribution,
          topCustomers: customers.slice(0, 10),
          recommendations: this.getSegmentRecommendations(segment)
        }
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  private getSegmentRecommendations(segment: string): string[] {
    const recommendations: Record<string, string[]> = {
      'vip': [
        'Provide exclusive early access to events',
        'Offer VIP upgrade opportunities',
        'Assign dedicated account manager'
      ],
      'regular': [
        'Encourage more frequent purchases with loyalty rewards',
        'Cross-sell related events',
        'Send personalized event recommendations'
      ],
      'occasional': [
        'Re-engage with targeted campaigns',
        'Offer bundle discounts',
        'Highlight upcoming events matching past interests'
      ],
      'at_risk': [
        'Send win-back email campaign',
        'Offer special discounts',
        'Survey to understand disengagement reasons'
      ],
      'dormant': [
        'Aggressive win-back campaign',
        'Offer significant discount or free ticket',
        'Remove from high-frequency campaigns to avoid spam'
      ],
      'new': [
        'Welcome email series',
        'Onboarding guidance',
        'First-time purchase incentives'
      ]
    };
    
    return recommendations[segment.toLowerCase()] || [
      'Analyze customer behavior patterns',
      'Create targeted marketing campaigns',
      'Monitor engagement metrics'
    ];
  }
}

export const customerController = new CustomerController();
