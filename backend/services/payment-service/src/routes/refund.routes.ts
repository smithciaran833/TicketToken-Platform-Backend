/**
 * Refund Routes
 * 
 * HIGH FIX: Added proper validation middleware and RFC 7807 error responses.
 * 
 * MEDIUM FIXES:
 * - RD-4: validateQueryParams used consistently
 * - RD-5: Complete response schemas/DTOs
 * - RD-8: String fields have maxLength constraints
 * - SD-6: metadata has strict typing (not Record<string, any>)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { refundController } from '../controllers/refundController';
import { authenticate } from '../middleware/auth';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { requireTenant } from '../middleware/tenant.middleware';
import { 
  validateCreateRefund, 
  validateGetRefund,
  validateListRefunds 
} from '../validators/refund.validator';

// =============================================================================
// RD-5: RESPONSE DTOS / SCHEMAS
// =============================================================================

/**
 * Refund response DTO schema
 */
const refundResponseSchema = {
  type: 'object',
  required: ['id', 'paymentIntentId', 'amount', 'status', 'createdAt'],
  properties: {
    id: { 
      type: 'string', 
      description: 'Refund ID (from Stripe)',
      pattern: '^re_[a-zA-Z0-9]+$',
      maxLength: 64,
    },
    paymentIntentId: { 
      type: 'string', 
      description: 'Original payment intent ID',
      pattern: '^pi_[a-zA-Z0-9]+$',
      maxLength: 64,
    },
    amount: { 
      type: 'integer', 
      description: 'Refund amount in cents',
      minimum: 1,
      maximum: 100000000,
    },
    status: { 
      type: 'string',
      description: 'Refund status',
      enum: ['pending', 'succeeded', 'failed', 'canceled', 'requires_action'],
    },
    reason: { 
      type: 'string',
      description: 'Reason for refund',
      enum: ['duplicate', 'fraudulent', 'requested_by_customer', 'other'],
    },
    createdAt: { 
      type: 'string', 
      format: 'date-time',
      description: 'When the refund was created',
    },
    currency: {
      type: 'string',
      description: 'Currency code',
      pattern: '^[A-Z]{3}$',
      maxLength: 3,
    },
  },
};

/**
 * Refund list response DTO schema
 */
const refundListResponseSchema = {
  type: 'object',
  required: ['refunds', 'total', 'limit', 'offset'],
  properties: {
    refunds: {
      type: 'array',
      items: refundResponseSchema,
    },
    total: { 
      type: 'integer',
      description: 'Total count of matching refunds',
      minimum: 0,
    },
    limit: { 
      type: 'integer',
      description: 'Page size',
      minimum: 1,
      maximum: 100,
    },
    offset: { 
      type: 'integer',
      description: 'Offset into results',
      minimum: 0,
    },
    hasMore: {
      type: 'boolean',
      description: 'Whether there are more results',
    },
  },
};

/**
 * Create refund response DTO schema
 */
const createRefundResponseSchema = {
  type: 'object',
  required: ['refundId', 'status', 'amount'],
  properties: {
    refundId: { 
      type: 'string',
      description: 'Created refund ID',
      pattern: '^re_[a-zA-Z0-9]+$',
      maxLength: 64,
    },
    status: { 
      type: 'string',
      description: 'Refund status',
      enum: ['pending', 'succeeded', 'failed', 'canceled', 'requires_action'],
    },
    amount: { 
      type: 'integer',
      description: 'Refunded amount in cents',
      minimum: 1,
    },
  },
};

/**
 * SD-6: Metadata schema with strict typing (not Record<string, any>)
 */
const metadataSchema = {
  type: 'object',
  description: 'Additional metadata for the refund',
  maxProperties: 50,
  additionalProperties: {
    type: 'string',
    maxLength: 500, // RD-8: bounded string length
  },
  propertyNames: {
    type: 'string',
    pattern: '^[a-zA-Z_][a-zA-Z0-9_]{0,39}$', // Valid key pattern
    maxLength: 40, // RD-8: bounded key length
  },
};

// =============================================================================
// ROUTES
// =============================================================================

export default async function refundRoutes(fastify: FastifyInstance) {
  const idempotency = idempotencyMiddleware({
    ttlMs: 30 * 60 * 1000 // 30 minutes
  });

  /**
   * Create a new refund
   * 
   * @route POST /refunds/create
   * @security BearerAuth
   * @body {paymentIntentId, amount, reason?}
   */
  fastify.post(
    '/create',
    {
      preHandler: [authenticate, requireTenant, validateCreateRefund, idempotency],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute'
        }
      },
      schema: {
        description: 'Create a refund for a payment',
        tags: ['refunds'],
        body: {
          type: 'object',
          required: ['paymentIntentId', 'amount'],
          properties: {
            paymentIntentId: { 
              type: 'string', 
              pattern: '^pi_[a-zA-Z0-9]+$',
              maxLength: 64, // RD-8: bounded length
              description: 'Stripe payment intent ID',
            },
            amount: { 
              type: 'integer', 
              minimum: 1, 
              maximum: 100000000,
              description: 'Refund amount in cents',
            },
            reason: { 
              type: 'string', 
              enum: ['duplicate', 'fraudulent', 'requested_by_customer', 'other'],
              description: 'Reason for the refund',
            },
            // SD-6: Strictly typed metadata
            metadata: metadataSchema,
            // RD-8: Bounded notes field
            notes: {
              type: 'string',
              maxLength: 1000,
              description: 'Internal notes about the refund',
            },
          },
          additionalProperties: false, // Reject unknown properties
        },
        response: {
          200: createRefundResponseSchema, // RD-5: Complete response DTO
          400: { $ref: '#/definitions/ProblemDetails' },
          401: { $ref: '#/definitions/ProblemDetails' },
          403: { $ref: '#/definitions/ProblemDetails' },
          422: { $ref: '#/definitions/ProblemDetails' },
          429: { $ref: '#/definitions/ProblemDetails' },
          500: { $ref: '#/definitions/ProblemDetails' },
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return refundController.createRefund(request, reply);
    }
  );

  /**
   * Create partial refund for specific tickets
   * 
   * @route POST /refunds/tickets
   * @security BearerAuth
   */
  fastify.post(
    '/tickets',
    {
      preHandler: [authenticate, requireTenant, idempotency],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute'
        }
      },
      schema: {
        description: 'Create a partial refund for specific tickets',
        tags: ['refunds'],
        body: {
          type: 'object',
          required: ['paymentIntentId', 'ticketIds'],
          properties: {
            paymentIntentId: { 
              type: 'string', 
              pattern: '^pi_[a-zA-Z0-9]+$',
              maxLength: 64, // RD-8
            },
            ticketIds: {
              type: 'array',
              items: { 
                type: 'string',
                format: 'uuid',
                maxLength: 36, // RD-8
              },
              minItems: 1,
              maxItems: 100,
              uniqueItems: true,
            },
            reason: { 
              type: 'string', 
              enum: ['duplicate', 'fraudulent', 'requested_by_customer', 'other'] 
            },
            currency: {
              type: 'string',
              pattern: '^[A-Z]{3}$',
              maxLength: 3, // RD-8
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            required: ['refundId', 'status', 'amount', 'ticketIds'],
            properties: {
              refundId: { type: 'string', maxLength: 64 },
              status: { type: 'string', enum: ['pending', 'succeeded', 'failed'] },
              amount: { type: 'integer' },
              ticketIds: { type: 'array', items: { type: 'string' } },
              ticketDetails: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    ticketId: { type: 'string', maxLength: 36 },
                    amount: { type: 'integer' },
                  }
                }
              },
              remainingTickets: { type: 'integer' },
            }
          },
          400: { $ref: '#/definitions/ProblemDetails' },
          422: { $ref: '#/definitions/ProblemDetails' },
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return refundController.createTicketRefund(request, reply);
    }
  );

  /**
   * Get refund by ID
   * 
   * @route GET /refunds/:refundId
   * @security BearerAuth
   */
  fastify.get(
    '/:refundId',
    {
      preHandler: [authenticate, requireTenant, validateGetRefund],
      schema: {
        description: 'Get refund details by ID',
        tags: ['refunds'],
        params: {
          type: 'object',
          required: ['refundId'],
          properties: {
            refundId: { 
              type: 'string', 
              pattern: '^re_[a-zA-Z0-9]+$',
              maxLength: 64, // RD-8
            }
          }
        },
        response: {
          200: refundResponseSchema, // RD-5: Complete response DTO
          404: { $ref: '#/definitions/ProblemDetails' },
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return refundController.getRefund(request, reply);
    }
  );

  /**
   * List refunds with filtering and pagination
   * RD-4: Uses validateListRefunds for query params
   * 
   * @route GET /refunds
   * @security BearerAuth
   */
  fastify.get(
    '/',
    {
      preHandler: [authenticate, requireTenant, validateListRefunds], // RD-4: validateQueryParams
      schema: {
        description: 'List refunds with optional filters',
        tags: ['refunds'],
        querystring: {
          type: 'object',
          properties: {
            paymentIntentId: { 
              type: 'string', 
              pattern: '^pi_[a-zA-Z0-9]+$',
              maxLength: 64, // RD-8
            },
            status: { 
              type: 'string', 
              enum: ['pending', 'succeeded', 'failed', 'canceled'] 
            },
            limit: { 
              type: 'integer', 
              minimum: 1, 
              maximum: 100, 
              default: 20 
            },
            offset: { 
              type: 'integer', 
              minimum: 0, 
              default: 0 
            },
            createdAfter: { 
              type: 'string', 
              format: 'date-time',
              maxLength: 30, // RD-8
            },
            createdBefore: { 
              type: 'string', 
              format: 'date-time',
              maxLength: 30, // RD-8
            },
            // RD-8: Search with bounded length
            search: {
              type: 'string',
              maxLength: 100,
            },
          },
          additionalProperties: false, // Reject unknown query params
        },
        response: {
          200: refundListResponseSchema, // RD-5: Complete response DTO
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return refundController.listRefunds(request, reply);
    }
  );

  /**
   * Get refundable information for a payment
   * 
   * @route GET /refunds/info/:paymentIntentId
   * @security BearerAuth
   */
  fastify.get(
    '/info/:paymentIntentId',
    {
      preHandler: [authenticate, requireTenant],
      schema: {
        description: 'Get refundable amount information for a payment',
        tags: ['refunds'],
        params: {
          type: 'object',
          required: ['paymentIntentId'],
          properties: {
            paymentIntentId: { 
              type: 'string', 
              pattern: '^pi_[a-zA-Z0-9]+$',
              maxLength: 64, // RD-8
            }
          }
        },
        response: {
          200: {
            type: 'object',
            required: ['paymentIntentId', 'originalAmount', 'totalRefunded', 'maxRefundable'],
            properties: {
              paymentIntentId: { type: 'string', maxLength: 64 },
              originalAmount: { type: 'integer', description: 'Original payment amount' },
              totalRefunded: { type: 'integer', description: 'Total already refunded' },
              maxRefundable: { type: 'integer', description: 'Maximum refundable amount' },
              stripeFee: { type: 'integer', description: 'Stripe fee on original' },
              platformFee: { type: 'integer', description: 'Platform fee on original' },
              ticketCount: { type: 'integer', description: 'Number of tickets' },
              ticketsRefunded: { type: 'integer', description: 'Tickets already refunded' },
              currency: { type: 'string', pattern: '^[A-Z]{3}$', maxLength: 3 },
              promoDiscount: {
                type: 'object',
                nullable: true,
                properties: {
                  promoCode: { type: 'string', maxLength: 50 },
                  discountAmount: { type: 'integer' },
                  discountPercent: { type: 'number' },
                  applicableAmount: { type: 'integer' },
                }
              },
              isFullyRefunded: { type: 'boolean' },
            }
          },
          404: { $ref: '#/definitions/ProblemDetails' },
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return refundController.getRefundableInfo(request, reply);
    }
  );

  /**
   * Get promo code adjustment for refund
   * 
   * @route GET /refunds/promo-adjustment/:paymentIntentId
   * @security BearerAuth
   */
  fastify.get(
    '/promo-adjustment/:paymentIntentId',
    {
      preHandler: [authenticate, requireTenant],
      schema: {
        description: 'Calculate promo code adjustment for a refund',
        tags: ['refunds'],
        params: {
          type: 'object',
          required: ['paymentIntentId'],
          properties: {
            paymentIntentId: { 
              type: 'string', 
              pattern: '^pi_[a-zA-Z0-9]+$',
              maxLength: 64, // RD-8
            }
          }
        },
        querystring: {
          type: 'object',
          properties: {
            refundAmount: { type: 'integer', minimum: 1 }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              paymentIntentId: { type: 'string', maxLength: 64 },
              hasPromoCode: { type: 'boolean' },
              promoCode: { type: 'string', maxLength: 50 },
              originalDiscount: { type: 'integer' },
              promoAdjustment: { type: 'integer' },
              refundRatio: { type: 'number' },
              note: { type: 'string', maxLength: 500 },
            }
          },
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return refundController.getPromoCodeAdjustment(request, reply);
    }
  );
}

// =============================================================================
// RFC 7807 Problem Details schema definition for Fastify
// =============================================================================

export const problemDetailsSchema = {
  ProblemDetails: {
    type: 'object',
    required: ['type', 'title', 'status'],
    properties: {
      type: { 
        type: 'string', 
        format: 'uri',
        description: 'A URI reference that identifies the problem type',
      },
      title: { 
        type: 'string',
        maxLength: 200,
        description: 'A short, human-readable summary of the problem type',
      },
      status: { 
        type: 'integer',
        minimum: 100,
        maximum: 599,
        description: 'The HTTP status code',
      },
      detail: { 
        type: 'string',
        maxLength: 2000,
        description: 'A human-readable explanation specific to this occurrence',
      },
      instance: { 
        type: 'string', 
        format: 'uri',
        description: 'A URI reference that identifies the specific occurrence',
      },
      code: { 
        type: 'string',
        maxLength: 50,
        description: 'Application-specific error code',
      },
      correlationId: {
        type: 'string',
        maxLength: 64,
        description: 'Request correlation ID for tracking',
      },
      errors: {
        type: 'array',
        description: 'Validation errors',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', maxLength: 100 },
            message: { type: 'string', maxLength: 500 },
            code: { type: 'string', maxLength: 50 },
          }
        }
      },
      timestamp: { 
        type: 'string', 
        format: 'date-time',
        description: 'When the error occurred',
      },
      documentation: {
        type: 'string',
        format: 'uri',
        description: 'Link to error documentation',
      },
    }
  }
};

// Export schemas for use in other routes
export { refundResponseSchema, refundListResponseSchema, createRefundResponseSchema, metadataSchema };
