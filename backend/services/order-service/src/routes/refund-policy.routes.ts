import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { RefundPolicyController } from '../controllers/refund-policy.controller';
import { validate } from '../middleware/validation.middleware';
import {
  policyParamSchema,
  ruleParamSchema,
  policyRuleParamSchema,
  reasonParamSchema,
  createPolicySchema,
  updatePolicySchema,
  createRuleSchema,
  updateRuleSchema,
  createReasonSchema,
  updateReasonSchema,
  checkEligibilitySchema,
  listPoliciesQuerySchema,
  listReasonsQuerySchema,
} from '../validators/refund-policy.schemas';

/**
 * RD1, RD5: Refund policy routes with full input validation, authentication, and response schemas
 * All routes require authentication and use strict schema validation
 */

// HIGH: Response schemas to prevent data leakage (RD5)
const policyResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    isDefault: { type: 'boolean' },
    isActive: { type: 'boolean' },
    priority: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const policiesListResponseSchema = {
  type: 'object',
  properties: {
    policies: { type: 'array', items: policyResponseSchema },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
  },
};

const ruleResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    policyId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    conditionType: { type: 'string' },
    conditionValue: { type: 'number', nullable: true },
    refundPercentage: { type: 'number' },
    priority: { type: 'integer' },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const rulesListResponseSchema = {
  type: 'object',
  properties: {
    rules: { type: 'array', items: ruleResponseSchema },
    total: { type: 'integer' },
  },
};

const reasonResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    code: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    requiresApproval: { type: 'boolean' },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const reasonsListResponseSchema = {
  type: 'object',
  properties: {
    reasons: { type: 'array', items: reasonResponseSchema },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
  },
};

const eligibilityResponseSchema = {
  type: 'object',
  properties: {
    eligible: { type: 'boolean' },
    reason: { type: 'string', nullable: true },
    maxRefundAmountCents: { type: 'integer', nullable: true },
    refundPercentage: { type: 'number', nullable: true },
    warnings: { type: 'array', items: { type: 'string' }, nullable: true },
    blockers: { type: 'array', items: { type: 'string' }, nullable: true },
    autoApprove: { type: 'boolean', nullable: true },
    requiresManualReview: { type: 'boolean', nullable: true },
    manualReviewReason: { type: 'string', nullable: true },
  },
};

const errorResponseSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    statusCode: { type: 'integer' },
  },
};

const successResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
  },
};

export default async function refundPolicyRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const controller = new RefundPolicyController();

  // SEC-R1: Use the registered authenticate decorator from JWT plugin
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    await fastify.authenticate(request, reply);
  };

  // Helper to check admin role
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
      return;
    }
  };

  // Policy routes - Admin only for write operations
  fastify.post('/policies', {
    schema: {
      response: {
        201: policyResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ body: createPolicySchema })],
  }, controller.createPolicy);

  fastify.get('/policies', {
    schema: {
      response: {
        200: policiesListResponseSchema,
        401: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ query: listPoliciesQuerySchema })],
  }, controller.getPolicies);

  fastify.get('/policies/:policyId', {
    schema: {
      response: {
        200: policyResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ params: policyParamSchema })],
  }, controller.getPolicy);

  fastify.patch('/policies/:policyId', {
    schema: {
      response: {
        200: policyResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ params: policyParamSchema, body: updatePolicySchema })],
  }, controller.updatePolicy);

  fastify.delete('/policies/:policyId', {
    schema: {
      response: {
        200: successResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ params: policyParamSchema })],
  }, controller.deactivatePolicy);

  // Rule routes - Admin only
  fastify.post('/rules', {
    schema: {
      response: {
        201: ruleResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ body: createRuleSchema })],
  }, controller.createRule);

  fastify.get('/policies/:policyId/rules', {
    schema: {
      response: {
        200: rulesListResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ params: policyRuleParamSchema })],
  }, controller.getRulesForPolicy);

  fastify.get('/rules/:ruleId', {
    schema: {
      response: {
        200: ruleResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ params: ruleParamSchema })],
  }, controller.getRule);

  fastify.patch('/rules/:ruleId', {
    schema: {
      response: {
        200: ruleResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ params: ruleParamSchema, body: updateRuleSchema })],
  }, controller.updateRule);

  fastify.delete('/rules/:ruleId/deactivate', {
    schema: {
      response: {
        200: successResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ params: ruleParamSchema })],
  }, controller.deactivateRule);

  fastify.delete('/rules/:ruleId', {
    schema: {
      response: {
        200: successResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ params: ruleParamSchema })],
  }, controller.deleteRule);

  // Reason routes - Admin only for write operations
  fastify.post('/reasons', {
    schema: {
      response: {
        201: reasonResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ body: createReasonSchema })],
  }, controller.createReason);

  fastify.get('/reasons', {
    schema: {
      response: {
        200: reasonsListResponseSchema,
        401: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ query: listReasonsQuerySchema })],
  }, controller.getReasons);

  fastify.get('/reasons/:reasonId', {
    schema: {
      response: {
        200: reasonResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ params: reasonParamSchema })],
  }, controller.getReason);

  fastify.patch('/reasons/:reasonId', {
    schema: {
      response: {
        200: reasonResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ params: reasonParamSchema, body: updateReasonSchema })],
  }, controller.updateReason);

  fastify.delete('/reasons/:reasonId', {
    schema: {
      response: {
        200: successResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ params: reasonParamSchema })],
  }, controller.deactivateReason);

  // Eligibility check - Available to authenticated users
  fastify.post('/check-eligibility', {
    schema: {
      response: {
        200: eligibilityResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ body: checkEligibilitySchema })],
  }, controller.checkEligibility);
}
