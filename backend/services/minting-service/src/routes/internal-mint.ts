import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import logger from '../utils/logger';
import { MintingOrchestrator } from '../services/MintingOrchestrator';
import { validateInternalRequest } from '../middleware/internal-auth';
import { authMiddleware } from '../middleware/admin-auth';
import { internalMintSchema, InternalMintRequest } from '../validators/mint.schemas';

// =============================================================================
// RATE LIMIT CONFIGURATIONS
// =============================================================================

// Single mint - 10 per minute (expensive operation)
const SINGLE_MINT_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute'
    }
  }
};

// Batch mint - 5 per minute (very expensive)
const BATCH_MINT_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute'
    }
  }
};

// Status check - 60 per minute (cheap)
const STATUS_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: '1 minute'
    }
  }
};

// =============================================================================
// BATCH SIZE LIMITS
// =============================================================================

const MAX_BATCH_SIZE = 100;
const MAX_SINGLE_MINT_TICKETS = 10; // Max tickets in a single request

// =============================================================================
// TYPES
// =============================================================================

interface MintResult {
  ticketId: string;
  success: boolean;
  result?: any;
  mintAddress?: string;
  error?: string;
}

interface BatchMintBody {
  tickets: Array<{
    ticketId: string;
    eventId: string;
    userId?: string;
    metadata?: Record<string, any>;
  }>;
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function internalMintRoutes(
  fastify: FastifyInstance,
  options: any
): Promise<void> {

  // =========================================================================
  // Single/Multi ticket mint - stricter rate limit (10/min)
  // =========================================================================
  fastify.post<{ Body: InternalMintRequest }>(
    '/internal/mint',
    {
      ...SINGLE_MINT_RATE_LIMIT,
      preHandler: [validateInternalRequest, authMiddleware]
    } as RouteShorthandOptions,
    async (request: FastifyRequest<{ Body: InternalMintRequest }>, reply: FastifyReply) => {
      try {
        // Validate request body with Zod schema
        const validation = internalMintSchema.safeParse(request.body);
        
        if (!validation.success) {
          return reply.code(400).send({
            success: false,
            error: 'Validation failed',
            details: validation.error.flatten()
          });
        }

        const { ticketIds, eventId, userId, queue, orderId } = validation.data;
        
        // ===== BATCH SIZE VALIDATION =====
        // Enforce maximum tickets per single request
        if (ticketIds.length > MAX_SINGLE_MINT_TICKETS) {
          logger.warn('Single mint request exceeds ticket limit', {
            received: ticketIds.length,
            max: MAX_SINGLE_MINT_TICKETS,
            service: request.internalService
          });
          
          return reply.code(400).send({
            success: false,
            error: 'Batch size exceeds maximum for single mint',
            code: 'BATCH_SIZE_EXCEEDED',
            maxAllowed: MAX_SINGLE_MINT_TICKETS,
            received: ticketIds.length,
            suggestion: `Use /internal/mint/batch for larger batches (up to ${MAX_BATCH_SIZE} tickets)`
          });
        }
        
        // SECURITY: Extract tenant from verified JWT, NOT from request body
        // This prevents tenant spoofing attacks
        const tenantId = request.user?.tenant_id;
        
        if (!tenantId) {
          logger.error('Internal mint called without tenant context', {
            service: request.internalService
          });
          return reply.code(401).send({
            success: false,
            error: 'Missing tenant context in JWT'
          });
        }
        
        // Warn if body tenantId differs from JWT tenantId (potential attack or bug)
        if (validation.data.tenantId && validation.data.tenantId !== tenantId) {
          logger.warn('Tenant ID mismatch: body differs from JWT', {
            bodyTenantId: validation.data.tenantId,
            jwtTenantId: tenantId,
            service: request.internalService,
            userId
          });
        }

        logger.info('Internal mint request received', {
          ticketIds,
          eventId,
          userId,
          tenantId,
          queue,
          ticketCount: ticketIds.length,
          fromService: request.internalService
        });

        const orchestrator = new MintingOrchestrator();
        const results: MintResult[] = [];

        for (const ticketId of ticketIds) {
          try {
            const result = await orchestrator.mintCompressedNFT({
              ticketId,
              eventId,
              tenantId,
              orderId: orderId || `order-${ticketId}`,
            });

            results.push({
              ticketId,
              success: true,
              result,
              mintAddress: result.mintAddress
            });
          } catch (error) {
            logger.error('Mint failed for ticket', {
              ticketId,
              tenantId,
              error: (error as Error).message,
              service: request.internalService
            });

            results.push({
              ticketId,
              success: false,
              error: (error as Error).message
            });
          }
        }

        const allSuccessful = results.every(r => r.success);
        const successCount = results.filter(r => r.success).length;

        return reply.send({
          success: allSuccessful,
          results,
          summary: {
            total: results.length,
            successful: successCount,
            failed: results.length - successCount
          },
          mintedBy: request.internalService,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Internal mint endpoint error:', {
          error: (error as Error).message,
          service: request.internalService,
          body: request.body
        });

        return reply.code(500).send({
          success: false,
          error: (error as Error).message
        });
      }
    }
  );

  // =========================================================================
  // Batch mint endpoint - strictest rate limit (5/min)
  // =========================================================================
  fastify.post<{ Body: BatchMintBody }>(
    '/internal/mint/batch',
    {
      ...BATCH_MINT_RATE_LIMIT,
      preHandler: [validateInternalRequest, authMiddleware]
    } as RouteShorthandOptions,
    async (request: FastifyRequest<{ Body: BatchMintBody }>, reply: FastifyReply) => {
      const { tickets } = request.body;
      
      // ===== EARLY BATCH SIZE VALIDATION =====
      if (!tickets || !Array.isArray(tickets)) {
        return reply.code(400).send({
          success: false,
          error: 'tickets array required',
          code: 'INVALID_REQUEST'
        });
      }
      
      if (tickets.length === 0) {
        return reply.code(400).send({
          success: false,
          error: 'tickets array cannot be empty',
          code: 'INVALID_REQUEST'
        });
      }
      
      if (tickets.length > MAX_BATCH_SIZE) {
        logger.warn('Batch mint exceeds size limit', {
          received: tickets.length,
          max: MAX_BATCH_SIZE,
          service: request.internalService
        });
        
        return reply.code(400).send({
          success: false,
          error: 'Batch size exceeds maximum',
          code: 'BATCH_SIZE_EXCEEDED',
          maxAllowed: MAX_BATCH_SIZE,
          received: tickets.length
        });
      }

      // SECURITY: Extract tenant from verified JWT
      const tenantId = request.user?.tenant_id;
      
      if (!tenantId) {
        return reply.code(401).send({
          success: false,
          error: 'Missing tenant context in JWT'
        });
      }

      logger.info('Batch mint request received', {
        ticketCount: tickets.length,
        tenantId,
        fromService: request.internalService
      });

      const orchestrator = new MintingOrchestrator();
      const results: MintResult[] = [];
      const startTime = Date.now();

      for (const ticket of tickets) {
        try {
          const result = await orchestrator.mintCompressedNFT({
            ticketId: ticket.ticketId,
            eventId: ticket.eventId,
            tenantId,
            userId: ticket.userId,
            orderId: `batch-${Date.now()}-${ticket.ticketId}`,
            metadata: ticket.metadata
          });

          results.push({
            ticketId: ticket.ticketId,
            success: true,
            mintAddress: result.mintAddress
          });
        } catch (error) {
          results.push({
            ticketId: ticket.ticketId,
            success: false,
            error: (error as Error).message
          });
        }
      }

      const duration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;

      logger.info('Batch mint completed', {
        total: tickets.length,
        successful: successCount,
        failed: tickets.length - successCount,
        duration: `${duration}ms`,
        tenantId
      });

      return reply.send({
        success: successCount === tickets.length,
        results,
        summary: {
          total: tickets.length,
          successful: successCount,
          failed: tickets.length - successCount,
          durationMs: duration
        },
        timestamp: new Date().toISOString()
      });
    }
  );

  // =========================================================================
  // Mint status endpoint - lighter rate limit (60/min)
  // =========================================================================
  fastify.get<{ Params: { ticketId: string } }>(
    '/internal/mint/status/:ticketId',
    {
      ...STATUS_RATE_LIMIT,
      preHandler: [validateInternalRequest, authMiddleware]
    } as RouteShorthandOptions,
    async (request, reply) => {
      const { ticketId } = request.params;
      const tenantId = request.user?.tenant_id;

      if (!tenantId) {
        return reply.code(401).send({
          success: false,
          error: 'Missing tenant context'
        });
      }

      // TODO: Query mint status from database
      // For now, return a placeholder
      return reply.send({
        ticketId,
        tenantId,
        status: 'unknown',
        message: 'Status check endpoint - implementation pending'
      });
    }
  );
}
