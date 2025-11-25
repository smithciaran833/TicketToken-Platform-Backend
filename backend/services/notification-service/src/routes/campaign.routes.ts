import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { campaignService } from '../services/campaign.service';
import { logger } from '../config/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  CreateCampaignRequest,
  CreateSegmentRequest,
  CreateAutomationTriggerRequest,
  TrackAbandonedCartRequest,
  CreateABTestRequest
} from '../types/campaign.types';

// Helper to check admin role
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (request.user!.role !== 'admin') {
    logger.warn('Unauthorized campaign access attempt', {
      userId: request.user!.id,
      role: request.user!.role
    });
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Admin access required for campaign management'
    });
  }
};

export default async function campaignRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // CAMPAIGNS - Admin Only
  // ============================================================================

  /**
   * POST /api/v1/campaigns
   * Create a new campaign
   */
  fastify.post('/', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as CreateCampaignRequest;
      const campaignId = await campaignService.createCampaign(body);
      reply.status(201).send({ campaignId });
    } catch (error) {
      logger.error('Failed to create campaign', { error });
      reply.status(500).send({ error: 'Failed to create campaign' });
    }
  });

  /**
   * POST /api/v1/campaigns/:id/send
   * Send a campaign
   */
  fastify.post('/:id/send', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      await campaignService.sendCampaign(params.id);
      reply.send({ message: 'Campaign sent successfully' });
    } catch (error) {
      logger.error('Failed to send campaign', { error });
      reply.status(500).send({ error: 'Failed to send campaign' });
    }
  });

  /**
   * GET /api/v1/campaigns/:id/stats
   * Get campaign statistics
   */
  fastify.get('/:id/stats', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      const stats = await campaignService.getCampaignStats(params.id);
      reply.send(stats);
    } catch (error) {
      logger.error('Failed to get campaign stats', { error });
      reply.status(500).send({ error: 'Failed to get campaign stats' });
    }
  });

  // ============================================================================
  // AUDIENCE SEGMENTS - Admin Only
  // ============================================================================

  /**
   * POST /api/v1/campaigns/segments
   * Create audience segment
   */
  fastify.post('/segments', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as CreateSegmentRequest;
      const segmentId = await campaignService.createSegment(body);
      reply.status(201).send({ segmentId });
    } catch (error) {
      logger.error('Failed to create segment', { error });
      reply.status(500).send({ error: 'Failed to create segment' });
    }
  });

  /**
   * POST /api/v1/campaigns/segments/:id/refresh
   * Refresh segment member count
   */
  fastify.post('/segments/:id/refresh', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      const memberCount = await campaignService.refreshSegment(params.id);
      reply.send({ memberCount });
    } catch (error) {
      logger.error('Failed to refresh segment', { error });
      reply.status(500).send({ error: 'Failed to refresh segment' });
    }
  });

  // ============================================================================
  // AUTOMATION TRIGGERS - Admin Only
  // ============================================================================

  /**
   * POST /api/v1/campaigns/triggers
   * Create automation trigger
   */
  fastify.post('/triggers', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as CreateAutomationTriggerRequest;
      const triggerId = await campaignService.createAutomationTrigger(body);
      reply.status(201).send({ triggerId });
    } catch (error) {
      logger.error('Failed to create automation trigger', { error });
      reply.status(500).send({ error: 'Failed to create automation trigger' });
    }
  });

  // ============================================================================
  // ABANDONED CARTS - Admin Only
  // ============================================================================

  /**
   * POST /api/v1/campaigns/abandoned-carts
   * Track abandoned cart
   */
  fastify.post('/abandoned-carts', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as TrackAbandonedCartRequest;
      const cartId = await campaignService.trackAbandonedCart(body);
      reply.status(201).send({ cartId });
    } catch (error) {
      logger.error('Failed to track abandoned cart', { error });
      reply.status(500).send({ error: 'Failed to track abandoned cart' });
    }
  });

  // ============================================================================
  // A/B TESTING - Admin Only
  // ============================================================================

  /**
   * POST /api/v1/campaigns/ab-tests
   * Create A/B test
   */
  fastify.post('/ab-tests', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as CreateABTestRequest;
      const testId = await campaignService.createABTest(body);
      reply.status(201).send({ testId });
    } catch (error) {
      logger.error('Failed to create A/B test', { error });
      reply.status(500).send({ error: 'Failed to create A/B test' });
    }
  });

  /**
   * POST /api/v1/campaigns/ab-tests/:id/start
   * Start A/B test
   */
  fastify.post('/ab-tests/:id/start', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      await campaignService.startABTest(params.id);
      reply.send({ message: 'A/B test started' });
    } catch (error) {
      logger.error('Failed to start A/B test', { error });
      reply.status(500).send({ error: 'Failed to start A/B test' });
    }
  });

  /**
   * POST /api/v1/campaigns/ab-tests/:id/determine-winner
   * Determine A/B test winner
   */
  fastify.post('/ab-tests/:id/determine-winner', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { id: string };
      const winner = await campaignService.determineABTestWinner(params.id);
      reply.send({ winner });
    } catch (error) {
      logger.error('Failed to determine A/B test winner', { error });
      reply.status(500).send({ error: 'Failed to determine A/B test winner' });
    }
  });
}
