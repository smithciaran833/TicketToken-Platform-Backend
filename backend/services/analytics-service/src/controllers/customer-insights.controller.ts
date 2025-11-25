import { FastifyRequest, FastifyReply } from 'fastify';
import { customerInsightsService } from '../services/customer-insights.service';
import { logger } from '../utils/logger';

export class CustomerInsightsController {
  async getCustomerProfile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { userId } = request.params as { userId: string };
      const requestingUserId = (request as any).user?.id;
      const isAdmin = (request as any).user?.role === 'admin';

      if (!requestingUserId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      if (userId !== requestingUserId && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const profile = await customerInsightsService.getCustomerProfile(userId);
      
      if (!profile) {
        return reply.status(404).send({ error: 'Customer profile not found' });
      }

      reply.send({ success: true, data: profile });
    } catch (error) {
      logger.error('Error getting customer profile:', error);
      reply.status(500).send({ error: 'Failed to get customer profile' });
    }
  }

  async getVenueCustomerSegments(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { venueId } = request.params as { venueId: string };
      const userId = (request as any).user?.id;

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const segments = await customerInsightsService.segmentCustomers(venueId);
      reply.send({ success: true, data: segments });
    } catch (error) {
      logger.error('Error getting customer segments:', error);
      reply.status(500).send({ error: 'Failed to get customer segments' });
    }
  }

  async getCustomerPreferences(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { userId } = request.params as { userId: string };
      const requestingUserId = (request as any).user?.id;
      const isAdmin = (request as any).user?.role === 'admin';

      if (!requestingUserId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      if (userId !== requestingUserId && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const preferences = await customerInsightsService.getEventPreferences(userId);
      reply.send({ success: true, data: preferences });
    } catch (error) {
      logger.error('Error getting customer preferences:', error);
      reply.status(500).send({ error: 'Failed to get customer preferences' });
    }
  }

  async getVenueCustomerList(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { venueId } = request.params as { venueId: string };
      const userId = (request as any).user?.id;
      const query = request.query as {
        segment?: string;
        minSpent?: string;
        daysSinceLastPurchase?: string;
        eventCategory?: string;
      };

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const filters = {
        segment: query.segment,
        minSpent: query.minSpent ? parseInt(query.minSpent) : undefined,
        daysSinceLastPurchase: query.daysSinceLastPurchase ? parseInt(query.daysSinceLastPurchase) : undefined,
        eventCategory: query.eventCategory,
      };

      const customers = await customerInsightsService.getVenueCustomers(venueId, filters);
      reply.send({ success: true, data: customers, count: customers.length });
    } catch (error) {
      logger.error('Error getting venue customers:', error);
      reply.status(500).send({ error: 'Failed to get venue customers' });
    }
  }

  async getCohortAnalysis(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { venueId } = request.params as { venueId: string };
      const userId = (request as any).user?.id;
      const query = request.query as {
        startDate?: string;
        endDate?: string;
      };

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const endDate = query.endDate ? new Date(query.endDate) : new Date();

      const cohorts = await customerInsightsService.getCohortAnalysis(venueId, startDate, endDate);
      reply.send({ success: true, data: cohorts });
    } catch (error) {
      logger.error('Error getting cohort analysis:', error);
      reply.status(500).send({ error: 'Failed to get cohort analysis' });
    }
  }
}

export const customerInsightsController = new CustomerInsightsController();
