import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { RefundPolicyController } from '../controllers/refund-policy.controller';

export default async function refundPolicyRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const controller = new RefundPolicyController();

  // Policy routes
  fastify.post('/policies', controller.createPolicy);
  fastify.get('/policies', controller.getPolicies);
  fastify.get('/policies/:policyId', controller.getPolicy);
  fastify.patch('/policies/:policyId', controller.updatePolicy);
  fastify.delete('/policies/:policyId', controller.deactivatePolicy);

  // Rule routes
  fastify.post('/rules', controller.createRule);
  fastify.get('/policies/:policyId/rules', controller.getRulesForPolicy);
  fastify.get('/rules/:ruleId', controller.getRule);
  fastify.patch('/rules/:ruleId', controller.updateRule);
  fastify.delete('/rules/:ruleId/deactivate', controller.deactivateRule);
  fastify.delete('/rules/:ruleId', controller.deleteRule);

  // Reason routes
  fastify.post('/reasons', controller.createReason);
  fastify.get('/reasons', controller.getReasons);
  fastify.get('/reasons/:reasonId', controller.getReason);
  fastify.patch('/reasons/:reasonId', controller.updateReason);
  fastify.delete('/reasons/:reasonId', controller.deactivateReason);

  // Eligibility check
  fastify.post('/check-eligibility', controller.checkEligibility);
}
