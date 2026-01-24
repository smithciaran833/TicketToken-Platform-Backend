import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { purchaseController } from '../controllers/purchaseController';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
// Import idempotency middleware - Fixes Batch 4 audit findings
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
// Import rate limiters - Fixes Batch 5 audit findings
import { rateLimiters, combinedRateLimiter } from '../middleware/rate-limit';
import { 
  purchaseRequestSchema,
  confirmPurchaseSchema, 
  validateRequest 
} from '../schemas';
import { ValidationError } from '../utils/errors';
import { ZodError, ZodIssue } from 'zod';

/**
 * SECURITY: Validation middleware that uses Zod schemas with .strict()
 * This prevents prototype pollution and mass assignment attacks
 */
function createValidationHandler<T>(schema: Parameters<typeof validateRequest>[0]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      // SECURITY: Parse with strict schema - rejects unknown properties
      const validated = validateRequest(schema, request.body);
      // Replace body with validated (stripped of unknown properties)
      (request as any).validatedBody = validated;
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues as ZodIssue[];
        throw new ValidationError(
          `Validation failed: ${issues.map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          { errors: issues }
        );
      }
      throw error;
    }
  };
}

export default async function purchaseRoutes(fastify: FastifyInstance) {
  // ==========================================================================
  // POST /purchase - Create a new purchase/reservation
  // Fixes Batch 4: Idempotency middleware added for duplicate prevention
  // Fixes Batch 5: Purchase-tier rate limiting (5 req/min per user)
  // ==========================================================================
  fastify.post('/', {
    preHandler: [
      rateLimiters.purchase,  // Batch 5: Purchase-tier rate limit (5 req/min)
      authMiddleware, 
      tenantMiddleware,
      idempotencyMiddleware.purchase,  // Batch 4: Idempotency for purchase operations
      createValidationHandler(purchaseRequestSchema)
    ],
    schema: {
      description: 'Create a new ticket purchase or reservation',
      tags: ['purchase'],
      body: {
        type: 'object',
        required: ['eventId', 'tickets'],
        additionalProperties: false, // SECURITY: Reject unknown properties
        properties: {
          eventId: { type: 'string', format: 'uuid' },
          tickets: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: {
              type: 'object',
              required: ['ticketTypeId', 'quantity'],
              additionalProperties: false,
              properties: {
                ticketTypeId: { type: 'string', format: 'uuid' },
                quantity: { type: 'integer', minimum: 1, maximum: 10 }
              }
            }
          },
          paymentMethodId: { type: 'string', maxLength: 255 },
          idempotencyKey: { type: 'string', minLength: 16, maxLength: 64 }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                reservationId: { type: 'string' },
                tickets: { type: 'array' },
                expiresAt: { type: 'string' },
                totalAmount: { type: 'number' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    // Use validated body (stripped of unknown properties)
    const validatedBody = (request as any).validatedBody;
    return purchaseController.createOrder(
      { ...request, body: validatedBody } as FastifyRequest, 
      reply
    );
  });

  // ==========================================================================
  // POST /purchase/confirm - Confirm a reservation with payment
  // Fixes Batch 4: Idempotency middleware added for duplicate prevention
  // Fixes Batch 5: Purchase-tier rate limiting (5 req/min per user)
  // ==========================================================================
  fastify.post('/confirm', {
    preHandler: [
      rateLimiters.purchase,  // Batch 5: Purchase-tier rate limit (5 req/min)
      authMiddleware,
      tenantMiddleware,
      idempotencyMiddleware.reservation,  // Batch 4: Idempotency for reservation confirmation
      createValidationHandler(confirmPurchaseSchema)
    ],
    schema: {
      description: 'Confirm a reservation and complete purchase',
      tags: ['purchase'],
      body: {
        type: 'object',
        required: ['reservationId', 'paymentId'],
        additionalProperties: false,
        properties: {
          reservationId: { type: 'string', format: 'uuid' },
          paymentId: { type: 'string', minLength: 1, maxLength: 255 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                tickets: { type: 'array' },
                orderId: { type: 'string' },
                status: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const validatedBody = (request as any).validatedBody;
    return purchaseController.confirmPurchase(
      { ...request, body: validatedBody } as FastifyRequest,
      reply
    );
  });

  // ==========================================================================
  // DELETE /purchase/:reservationId - Cancel a reservation
  // ==========================================================================
  fastify.delete('/:reservationId', {
    preHandler: [authMiddleware, tenantMiddleware],
    schema: {
      description: 'Cancel a pending reservation',
      tags: ['purchase'],
      params: {
        type: 'object',
        required: ['reservationId'],
        properties: {
          reservationId: { type: 'string', format: 'uuid' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    return purchaseController.cancelReservation(request, reply);
  });
}
