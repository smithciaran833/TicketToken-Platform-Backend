import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { MarketingController } from '../controllers/marketing.controller';

export default async function marketingRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const controller = new MarketingController();

  // Campaign CRUD - requires marketing_admin role
  fastify.post('/campaigns', controller.createCampaign);
  fastify.get('/campaigns', controller.getCampaigns);
  fastify.get('/campaigns/:campaignId', controller.getCampaign);
  fastify.put('/campaigns/:campaignId', controller.updateCampaign);
  fastify.delete('/campaigns/:campaignId', controller.deleteCampaign);

  // Campaign actions - requires marketing_admin role
  fastify.post('/campaigns/:campaignId/publish', controller.publishCampaign);
  fastify.post('/campaigns/:campaignId/pause', controller.pauseCampaign);

  // A/B Testing - requires marketing_admin role
  fastify.post('/campaigns/:campaignId/abtest', controller.createABTest);
  fastify.get('/campaigns/:campaignId/abtest/results', controller.getABTestResults);
  fastify.post('/campaigns/:campaignId/abtest/winner', controller.declareWinner);

  // Tracking endpoints - public/internal use
  fastify.post('/campaigns/:campaignId/track/impression', controller.trackImpression);
  fastify.post('/campaigns/:campaignId/track/click', controller.trackClick);
  fastify.post('/campaigns/:campaignId/track/conversion', controller.trackConversion);

  // Performance metrics - requires marketing_admin role
  fastify.get('/campaigns/:campaignId/metrics', controller.getPerformanceMetrics);
}
