import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { addTenantContext } from '../middleware/tenant.middleware';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { getRedis } from '../config/redis';

interface VenueParams {
  venueId: string;
}

interface VerificationParams extends VenueParams {
  verificationId: string;
}

interface SubmitDocumentBody {
  documentType: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  metadata?: Record<string, any>;
}

interface CompleteBankVerificationBody {
  publicToken: string;
}

export async function verificationRoutes(fastify: FastifyInstance) {
  const { verificationService, venueService, logger } = (fastify as any).container.cradle;
  const redis = getRedis();

  const createRateLimiter = (max: number, windowMs: number) => {
    return async (request: any, reply: any) => {
      if (process.env.DISABLE_RATE_LIMIT === 'true') return;

      const key = request.user?.id || request.ip;
      const redisKey = `rate_limit:verification:${key}:${Date.now() - (Date.now() % windowMs)}`;

      try {
        const current = await redis.incr(redisKey);
        if (current === 1) {
          await redis.expire(redisKey, Math.ceil(windowMs / 1000));
        }

        reply.header('X-RateLimit-Limit', max.toString());
        reply.header('X-RateLimit-Remaining', Math.max(0, max - current).toString());

        if (current > max) {
          reply.header('Retry-After', Math.ceil(windowMs / 1000).toString());
          return reply.status(429).send({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil(windowMs / 1000)} seconds`
          });
        }
      } catch (error) {
        fastify.log.warn({ error }, 'Rate limit check failed, allowing request');
      }
    };
  };

  const rateLimiter = createRateLimiter(100, 60000);
  const writeRateLimiter = createRateLimiter(20, 60000);

  const verifyVenueAccess = async (request: any, reply: any) => {
    const { venueId } = request.params;
    const userId = request.user?.id;
    const tenantId = request.tenantId;

    const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
    if (!hasAccess) {
      throw new ForbiddenError('Access denied to this venue');
    }
  };

  /**
   * GET /api/venues/:venueId/verification/status
   * Get verification status for a venue
   */
  fastify.get<{ Params: VenueParams }>(
    '/status',
    { preHandler: [authenticate, addTenantContext, rateLimiter, verifyVenueAccess] },
    async (request, reply) => {
      try {
        const { venueId } = request.params;
        const tenantId = (request as any).tenantId;

        const status = await verificationService.getVerificationStatus(venueId, tenantId);
        return reply.send(status);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get verification status');
        return reply.status(500).send({ error: 'Failed to get verification status' });
      }
    }
  );

  /**
   * POST /api/venues/:venueId/verification/verify
   * Run full verification check on a venue
   */
  fastify.post<{ Params: VenueParams }>(
    '/verify',
    { preHandler: [authenticate, addTenantContext, writeRateLimiter, verifyVenueAccess] },
    async (request, reply) => {
      try {
        const { venueId } = request.params;
        const tenantId = (request as any).tenantId;

        const result = await verificationService.verifyVenue(venueId, tenantId);
        return reply.send(result);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to verify venue');
        return reply.status(500).send({ error: 'Failed to verify venue' });
      }
    }
  );

  /**
   * POST /api/venues/:venueId/verification/documents
   * Submit a document for verification
   */
  fastify.post<{ Params: VenueParams; Body: SubmitDocumentBody }>(
    '/documents',
    { preHandler: [authenticate, addTenantContext, writeRateLimiter, verifyVenueAccess] },
    async (request, reply) => {
      try {
        const { venueId } = request.params;
        const tenantId = (request as any).tenantId;
        const { documentType, ...documentData } = request.body;

        if (!documentType) {
          return reply.status(400).send({ error: 'documentType is required' });
        }

        const validTypes = [
          'business_license', 'articles_of_incorporation',
          'tax_id', 'w9',
          'bank_statement', 'voided_check',
          'drivers_license', 'passport'
        ];

        if (!validTypes.includes(documentType)) {
          return reply.status(400).send({
            error: `Invalid document type. Valid types: ${validTypes.join(', ')}`
          });
        }

        const result = await verificationService.submitDocument(venueId, tenantId, documentType, documentData);
        return reply.status(201).send(result);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to submit document');
        return reply.status(500).send({ error: 'Failed to submit document' });
      }
    }
  );

  /**
   * GET /api/venues/:venueId/verification/external
   * Get external verifications for a venue
   */
  fastify.get<{ Params: VenueParams }>(
    '/external',
    { preHandler: [authenticate, addTenantContext, rateLimiter, verifyVenueAccess] },
    async (request, reply) => {
      try {
        const { venueId } = request.params;
        const tenantId = (request as any).tenantId;

        const verifications = await verificationService.getExternalVerifications(venueId, tenantId);
        return reply.send({ verifications });
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get external verifications');
        return reply.status(500).send({ error: 'Failed to get external verifications' });
      }
    }
  );

  /**
   * GET /api/venues/:venueId/verification/manual-reviews
   * Get manual review queue items for a venue
   */
  fastify.get<{ Params: VenueParams }>(
    '/manual-reviews',
    { preHandler: [authenticate, addTenantContext, rateLimiter, verifyVenueAccess] },
    async (request, reply) => {
      try {
        const { venueId } = request.params;
        const tenantId = (request as any).tenantId;

        const reviews = await verificationService.getManualReviewItems(venueId, tenantId);
        return reply.send({ reviews });
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get manual reviews');
        return reply.status(500).send({ error: 'Failed to get manual reviews' });
      }
    }
  );

  /**
   * POST /api/venues/:venueId/verification/identity/start
   * Start identity verification via Stripe Identity
   */
  fastify.post<{ Params: VenueParams }>(
    '/identity/start',
    { preHandler: [authenticate, addTenantContext, writeRateLimiter, verifyVenueAccess] },
    async (request, reply) => {
      try {
        const { venueId } = request.params;
        const tenantId = (request as any).tenantId;

        const result = await verificationService.startIdentityVerification(venueId, tenantId);
        return reply.send(result);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to start identity verification');
        return reply.status(500).send({ error: 'Failed to start identity verification' });
      }
    }
  );

  /**
   * POST /api/venues/:venueId/verification/bank/start
   * Start bank verification via Plaid
   */
  fastify.post<{ Params: VenueParams }>(
    '/bank/start',
    { preHandler: [authenticate, addTenantContext, writeRateLimiter, verifyVenueAccess] },
    async (request, reply) => {
      try {
        const { venueId } = request.params;
        const tenantId = (request as any).tenantId;

        const result = await verificationService.startBankVerification(venueId, tenantId);
        return reply.send(result);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to start bank verification');
        return reply.status(500).send({ error: 'Failed to start bank verification' });
      }
    }
  );

  /**
   * POST /api/venues/:venueId/verification/bank/complete
   * Complete bank verification with Plaid public token
   */
  fastify.post<{ Params: VenueParams; Body: CompleteBankVerificationBody }>(
    '/bank/complete',
    { preHandler: [authenticate, addTenantContext, writeRateLimiter, verifyVenueAccess] },
    async (request, reply) => {
      try {
        const { venueId } = request.params;
        const tenantId = (request as any).tenantId;
        const { publicToken } = request.body;

        if (!publicToken) {
          return reply.status(400).send({ error: 'publicToken is required' });
        }

        const result = await verificationService.completeBankVerification(venueId, tenantId, publicToken);
        return reply.send(result);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to complete bank verification');
        return reply.status(500).send({ error: 'Failed to complete bank verification' });
      }
    }
  );

  /**
   * GET /api/venues/:venueId/verification/:verificationId/check
   * Check status of a specific external verification
   */
  fastify.get<{ Params: VerificationParams }>(
    '/:verificationId/check',
    { preHandler: [authenticate, addTenantContext, rateLimiter, verifyVenueAccess] },
    async (request, reply) => {
      try {
        const { venueId, verificationId } = request.params;
        const tenantId = (request as any).tenantId;

        const result = await verificationService.checkExternalVerificationStatus(venueId, tenantId, verificationId);
        return reply.send(result);
      } catch (error: any) {
        if (error.message === 'Verification not found') {
          return reply.status(404).send({ error: 'Verification not found' });
        }
        logger.error({ error, venueId: request.params.venueId, verificationId: request.params.verificationId }, 'Failed to check verification status');
        return reply.status(500).send({ error: 'Failed to check verification status' });
      }
    }
  );
}
