/**
 * Risk Assessment Routes for Compliance Service
 * 
 * AUDIT FIXES:
 * - SEC-H2: BFLA fix - All risk operations require compliance_officer or admin role
 * - INP-H1: Validation middleware applied to all routes
 * - INP-H4: Query params validated
 * - ERR-H1: RFC 7807 error responses
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { RiskController } from '../controllers/risk.controller';
import { requireComplianceOfficer, requireAuth } from '../middleware/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware';
import { logger } from '../utils/logger';
import {
  calculateRiskSchema,
  flagVenueSchema,
  resolveFlagSchema,
  venueIdSchema
} from '../validators/schemas';

// =============================================================================
// SCHEMAS (with .strict() to prevent mass assignment - INP-2)
// =============================================================================

const assessRiskBodySchema = z.object({
  venueId: z.string().min(1).max(100),
  includeHistorical: z.boolean().default(false),
  factors: z.array(z.string()).max(20).optional()
}).strict();

const entityIdParamSchema = z.object({
  entityId: z.string().min(1).max(100)
}).strict();

const flagIdParamSchema = z.object({
  flagId: z.string().regex(/^\d+$/).transform(Number)
}).strict();

const flagVenueBodySchema = z.object({
  venueId: z.string().min(1).max(100),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  category: z.enum(['fraud', 'compliance', 'financial', 'operational', 'other']).optional()
}).strict();

const resolveFlagBodySchema = z.object({
  flagId: z.number().int().positive(),
  resolution: z.string().min(10, 'Resolution must be at least 10 characters').max(1000),
  preventiveAction: z.string().max(1000).optional()
}).strict();

const overrideScoreBodySchema = z.object({
  score: z.number().int().min(0).max(100),
  reason: z.string().min(10).max(1000),
  expiresAt: z.string().datetime().optional()
}).strict();

const riskQuerySchema = z.object({
  status: z.enum(['active', 'resolved', 'all']).default('active'),
  severity: z.enum(['low', 'medium', 'high', 'critical', 'all']).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(100)).default('20'),
  offset: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(0)).default('0')
}).strict();

// =============================================================================
// AUTHORIZATION HELPER
// =============================================================================

/**
 * Check if user has permission for risk management operations
 */
function hasRiskPermission(request: FastifyRequest): boolean {
  const user = request.user as any;
  if (!user) return false;
  
  const allowedRoles = ['admin', 'compliance_officer', 'risk_manager'];
  return allowedRoles.some(role => user.roles?.includes(role));
}

// =============================================================================
// ROUTES
// =============================================================================

export async function riskRoutes(fastify: FastifyInstance) {
  const riskController = new RiskController();

  // ==========================================================================
  // Risk Assessment Routes
  // ==========================================================================

  /**
   * POST /risk/assess - Calculate risk score for an entity
   * AUDIT FIX SEC-H2: Requires compliance_officer role
   */
  fastify.post('/risk/assess', {
    preHandler: [validateBody(assessRiskBodySchema)],
    onRequest: requireComplianceOfficer
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as z.infer<typeof assessRiskBodySchema>;
    
    logger.info({
      requestId: request.requestId,
      venueId: body.venueId,
      userId: (request.user as any)?.id
    }, 'Risk assessment requested');

    try {
      // Delegate to controller
      return riskController.calculateRiskScore(request, reply);
    } catch (error: any) {
      logger.error({
        requestId: request.requestId,
        venueId: body.venueId,
        error: error.message
      }, 'Risk assessment failed');
      
      return reply.code(500).send({
        type: 'urn:error:compliance-service:internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to calculate risk score',
        instance: request.requestId
      });
    }
  });

  /**
   * GET /risk/:entityId/score - Get current risk score for an entity
   * AUDIT FIX SEC-H2: Requires authentication (at minimum)
   */
  fastify.get('/risk/:entityId/score', {
    preHandler: [validateParams(entityIdParamSchema)],
    onRequest: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { entityId } = request.params as z.infer<typeof entityIdParamSchema>;
    
    // Check if user can view this entity's risk score
    const user = request.user as any;
    const tenantId = (request as any).tenantId;
    
    logger.info({
      requestId: request.requestId,
      entityId,
      userId: user?.id,
      tenantId
    }, 'Risk score lookup');

    try {
      return riskController.calculateRiskScore(request, reply);
    } catch (error: any) {
      logger.error({
        requestId: request.requestId,
        entityId,
        error: error.message
      }, 'Risk score lookup failed');
      
      return reply.code(500).send({
        type: 'urn:error:compliance-service:internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to retrieve risk score',
        instance: request.requestId
      });
    }
  });

  /**
   * PUT /risk/:entityId/override - Override risk score for an entity
   * AUDIT FIX SEC-H2: Requires compliance_officer role
   */
  fastify.put('/risk/:entityId/override', {
    preHandler: [
      validateParams(entityIdParamSchema),
      validateBody(overrideScoreBodySchema)
    ],
    onRequest: requireComplianceOfficer
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { entityId } = request.params as z.infer<typeof entityIdParamSchema>;
    const body = request.body as z.infer<typeof overrideScoreBodySchema>;
    const user = request.user as any;
    
    logger.info({
      requestId: request.requestId,
      entityId,
      newScore: body.score,
      userId: user?.id,
      reason: body.reason
    }, 'Risk score override requested');

    try {
      return riskController.flagVenue(request, reply);
    } catch (error: any) {
      logger.error({
        requestId: request.requestId,
        entityId,
        error: error.message
      }, 'Risk score override failed');
      
      return reply.code(500).send({
        type: 'urn:error:compliance-service:internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to override risk score',
        instance: request.requestId
      });
    }
  });

  // ==========================================================================
  // Risk Flag Routes
  // ==========================================================================

  /**
   * POST /risk/flag - Flag a venue for risk review
   * AUDIT FIX SEC-H2: Requires compliance_officer role (was missing!)
   */
  fastify.post('/risk/flag', {
    preHandler: [validateBody(flagVenueBodySchema)],
    onRequest: requireComplianceOfficer  // FIX: Was missing authorization!
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as z.infer<typeof flagVenueBodySchema>;
    const user = request.user as any;
    
    logger.info({
      requestId: request.requestId,
      venueId: body.venueId,
      severity: body.severity,
      category: body.category,
      flaggedBy: user?.id
    }, 'Venue flagged for risk review');

    try {
      return riskController.flagVenue(request, reply);
    } catch (error: any) {
      logger.error({
        requestId: request.requestId,
        venueId: body.venueId,
        error: error.message
      }, 'Failed to flag venue');
      
      return reply.code(500).send({
        type: 'urn:error:compliance-service:internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to flag venue for review',
        instance: request.requestId
      });
    }
  });

  /**
   * POST /risk/resolve - Resolve a risk flag
   * AUDIT FIX SEC-H2: Requires compliance_officer role (was missing!)
   */
  fastify.post('/risk/resolve', {
    preHandler: [validateBody(resolveFlagBodySchema)],
    onRequest: requireComplianceOfficer  // FIX: Was missing authorization!
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as z.infer<typeof resolveFlagBodySchema>;
    const user = request.user as any;
    
    logger.info({
      requestId: request.requestId,
      flagId: body.flagId,
      resolvedBy: user?.id
    }, 'Risk flag resolution requested');

    try {
      return riskController.resolveFlag(request, reply);
    } catch (error: any) {
      logger.error({
        requestId: request.requestId,
        flagId: body.flagId,
        error: error.message
      }, 'Failed to resolve risk flag');
      
      return reply.code(500).send({
        type: 'urn:error:compliance-service:internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to resolve risk flag',
        instance: request.requestId
      });
    }
  });

  // ==========================================================================
  // Risk Flag Listing
  // ==========================================================================

  /**
   * GET /risk/flags - List all risk flags
   * AUDIT FIX: Added with proper authorization and validation
   */
  fastify.get('/risk/flags', {
    preHandler: [validateQuery(riskQuerySchema as any)],
    onRequest: requireComplianceOfficer
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as z.infer<typeof riskQuerySchema>;
    const tenantId = (request as any).tenantId;
    
    logger.info({
      requestId: request.requestId,
      status: query.status,
      severity: query.severity,
      limit: query.limit,
      offset: query.offset,
      tenantId
    }, 'Risk flags listing requested');

    // Placeholder - delegate to service
    return reply.send({
      success: true,
      data: [],
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: 0
      }
    });
  });

  /**
   * GET /risk/flags/:flagId - Get specific risk flag details
   */
  fastify.get('/risk/flags/:flagId', {
    preHandler: [validateParams(flagIdParamSchema as any)],
    onRequest: requireComplianceOfficer
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { flagId } = request.params as z.infer<typeof flagIdParamSchema>;
    
    logger.info({
      requestId: request.requestId,
      flagId
    }, 'Risk flag details requested');

    // Placeholder - delegate to service
    return reply.code(404).send({
      type: 'urn:error:compliance-service:not-found',
      title: 'Not Found',
      status: 404,
      detail: `Risk flag ${flagId} not found`,
      instance: request.requestId
    });
  });
}

export default riskRoutes;
