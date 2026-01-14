/**
 * Comprehensive Input Validation Schemas for Marketplace Service
 * 
 * Issues Fixed:
 * - INP-H1: No schema on route X → Complete route schemas
 * - INP-H2: Price validation missing → Min/max price constraints
 * - INP-H3: UUID validation missing → UUID format checks
 * - INP-H4: Pagination validation missing → Limit/offset bounds
 * - INP-H5: Date validation missing → Date format and range
 * - INP-H6: Wallet address validation missing → Solana format
 * 
 * Uses Joi for validation with detailed error messages
 */

import Joi from 'joi';
// FIX #22: Import BASE58_REGEX from wallet.schema.ts to avoid duplication
import { solanaAddressSchema, validateSolanaAddress, BASE58_REGEX, SOLANA_MIN_LENGTH, SOLANA_MAX_LENGTH } from './wallet.schema';

// Price constraints (in cents)
const MIN_PRICE_CENTS = 100; // $1.00
const MAX_PRICE_CENTS = 1000000000; // $10,000,000

// Pagination limits
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MIN_PAGE = 1;

/**
 * Common field validators
 */
const CommonFields = {
  // UUID validation
  uuid: Joi.string().uuid({ version: 'uuidv4' }).messages({
    'string.guid': '{{#label}} must be a valid UUID'
  }),
  
  // Solana address validation
  solanaAddress: Joi.string()
    .min(32)
    .max(44)
    .pattern(BASE58_REGEX)
    .custom((value, helpers) => {
      const result = validateSolanaAddress(value);
      if (!result.valid) {
        return helpers.error('any.custom', { message: result.error });
      }
      return result.address;
    })
    .messages({
      'string.pattern.base': '{{#label}} must be a valid Solana address',
      'string.min': '{{#label}} must be at least 32 characters',
      'string.max': '{{#label}} must be at most 44 characters'
    }),
  
  // Price validation (in cents)
  price: Joi.number()
    .integer()
    .min(MIN_PRICE_CENTS)
    .max(MAX_PRICE_CENTS)
    .messages({
      'number.min': '{{#label}} must be at least $1.00',
      'number.max': '{{#label}} cannot exceed $10,000,000',
      'number.integer': '{{#label}} must be in cents (whole number)'
    }),
  
  // Pagination
  page: Joi.number().integer().min(MIN_PAGE).default(1),
  limit: Joi.number().integer().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: Joi.number().integer().min(0),
  
  // Timestamps
  timestamp: Joi.date().iso().messages({
    'date.format': '{{#label}} must be a valid ISO 8601 date'
  }),
  
  // Future timestamp (for events)
  futureTimestamp: Joi.date().iso().min('now').messages({
    'date.min': '{{#label}} must be in the future'
  }),
  
  // Sort fields
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  
  // Status enums
  listingStatus: Joi.string().valid('active', 'sold', 'cancelled', 'expired'),
  transferStatus: Joi.string().valid('pending', 'processing', 'completed', 'failed', 'refunded'),
  disputeStatus: Joi.string().valid('open', 'under_review', 'resolved', 'dismissed'),
  
  // Text fields
  shortText: Joi.string().max(255).trim(),
  longText: Joi.string().max(5000).trim(),
  
  // Tenant ID
  tenantId: Joi.string().uuid({ version: 'uuidv4' })
};

/**
 * AUDIT FIX INP-H1: Listing schemas
 */
export const ListingSchemas = {
  // Create listing
  create: Joi.object({
    ticketId: CommonFields.uuid.required(),
    eventId: CommonFields.uuid.required(),
    price: CommonFields.price.required(),
    description: CommonFields.longText,
    allowOffers: Joi.boolean().default(false),
    minOfferPrice: CommonFields.price.when('allowOffers', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.forbidden()
    }),
    expiresAt: CommonFields.futureTimestamp,
    sellerWalletAddress: CommonFields.solanaAddress
  }),
  
  // Update listing
  update: Joi.object({
    price: CommonFields.price,
    description: CommonFields.longText,
    allowOffers: Joi.boolean(),
    minOfferPrice: CommonFields.price,
    expiresAt: CommonFields.futureTimestamp
  }).min(1),
  
  // Get listing params
  getById: Joi.object({
    id: CommonFields.uuid.required()
  }),
  
  // List listings query
  list: Joi.object({
    eventId: CommonFields.uuid,
    sellerId: CommonFields.uuid,
    status: CommonFields.listingStatus,
    minPrice: CommonFields.price,
    maxPrice: CommonFields.price,
    sortBy: Joi.string().valid('price', 'created_at', 'event_start_time'),
    sortOrder: CommonFields.sortOrder,
    page: CommonFields.page,
    limit: CommonFields.limit
  }),
  
  // Search listings
  search: Joi.object({
    query: Joi.string().min(2).max(100).trim(),
    eventId: CommonFields.uuid,
    venueId: CommonFields.uuid,
    minPrice: CommonFields.price,
    maxPrice: CommonFields.price,
    startDate: CommonFields.timestamp,
    endDate: CommonFields.timestamp.min(Joi.ref('startDate')),
    page: CommonFields.page,
    limit: CommonFields.limit
  })
};

/**
 * AUDIT FIX INP-H1: Purchase/Transfer schemas
 */
export const PurchaseSchemas = {
  // Create purchase
  create: Joi.object({
    listingId: CommonFields.uuid.required(),
    buyerWalletAddress: CommonFields.solanaAddress.required(),
    paymentMethodId: Joi.string().required(),
    idempotencyKey: Joi.string().max(64)
  }),
  
  // Get transfer
  getById: Joi.object({
    id: CommonFields.uuid.required()
  }),
  
  // List transfers query
  list: Joi.object({
    buyerId: CommonFields.uuid,
    sellerId: CommonFields.uuid,
    listingId: CommonFields.uuid,
    status: CommonFields.transferStatus,
    startDate: CommonFields.timestamp,
    endDate: CommonFields.timestamp,
    page: CommonFields.page,
    limit: CommonFields.limit
  })
};

/**
 * AUDIT FIX INP-H1: Dispute schemas
 */
export const DisputeSchemas = {
  // Create dispute
  create: Joi.object({
    transferId: CommonFields.uuid.required(),
    reason: Joi.string().valid(
      'item_not_received',
      'item_not_as_described',
      'unauthorized_charge',
      'duplicate_charge',
      'other'
    ).required(),
    description: CommonFields.longText.required().min(10),
    evidence: Joi.array().items(
      Joi.object({
        type: Joi.string().valid('image', 'document', 'text'),
        url: Joi.string().uri().when('type', {
          is: Joi.valid('image', 'document'),
          then: Joi.required()
        }),
        content: Joi.string().when('type', {
          is: 'text',
          then: Joi.required()
        })
      })
    ).max(10)
  }),
  
  // Update dispute (admin)
  update: Joi.object({
    status: CommonFields.disputeStatus,
    resolution: Joi.string().valid('refund_buyer', 'release_to_seller', 'partial_refund', 'no_action'),
    resolutionNotes: CommonFields.longText,
    refundAmount: CommonFields.price.when('resolution', {
      is: 'partial_refund',
      then: Joi.required()
    })
  }),
  
  // List disputes
  list: Joi.object({
    status: CommonFields.disputeStatus,
    filedById: CommonFields.uuid,
    againstId: CommonFields.uuid,
    page: CommonFields.page,
    limit: CommonFields.limit
  })
};

/**
 * AUDIT FIX INP-H1: Refund schemas
 */
export const RefundSchemas = {
  // Create refund
  create: Joi.object({
    transferId: CommonFields.uuid.required(),
    reason: Joi.string().valid(
      'event_cancelled',
      'buyer_request',
      'seller_request',
      'dispute_resolution',
      'duplicate_charge',
      'fraud',
      'admin_action',
      'other'
    ).required(),
    reasonDetails: CommonFields.longText,
    amount: CommonFields.price // For partial refunds
  }),
  
  // Event cancellation bulk refund
  eventCancellation: Joi.object({
    eventId: CommonFields.uuid.required(),
    reasonDetails: CommonFields.longText
  })
};

/**
 * AUDIT FIX INP-H1: Webhook schemas
 */
export const WebhookSchemas = {
  // Stripe webhook
  stripe: Joi.object({
    id: Joi.string().required(),
    type: Joi.string().required(),
    data: Joi.object().required(),
    created: Joi.number().integer().required()
  }),
  
  // Internal webhook
  internal: Joi.object({
    event: Joi.string().required(),
    payload: Joi.object().required(),
    timestamp: CommonFields.timestamp.required(),
    source: Joi.string().required()
  })
};

/**
 * AUDIT FIX INP-H1: Admin schemas
 */
export const AdminSchemas = {
  // List users
  listUsers: Joi.object({
    tenantId: CommonFields.tenantId,
    role: Joi.string().valid('user', 'seller', 'admin'),
    status: Joi.string().valid('active', 'suspended', 'banned'),
    page: CommonFields.page,
    limit: CommonFields.limit
  }),
  
  // Update user
  updateUser: Joi.object({
    role: Joi.string().valid('user', 'seller', 'admin'),
    status: Joi.string().valid('active', 'suspended', 'banned'),
    suspensionReason: CommonFields.longText.when('status', {
      is: 'suspended',
      then: Joi.required()
    })
  }),
  
  // Bulk operations
  bulkAction: Joi.object({
    action: Joi.string().valid('suspend', 'unsuspend', 'delete').required(),
    ids: Joi.array().items(CommonFields.uuid).min(1).max(100).required(),
    reason: CommonFields.longText
  })
};

/**
 * Validation middleware factory
 */
export function validateSchema(schema: Joi.Schema, source: 'body' | 'query' | 'params' = 'body') {
  return async (request: any, reply: any) => {
    const data = source === 'body' ? request.body 
      : source === 'query' ? request.query 
      : request.params;
    
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });
    
    if (error) {
      const errors = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: errors
      });
    }
    
    // Replace with validated and sanitized data
    if (source === 'body') request.body = value;
    else if (source === 'query') request.query = value;
    else request.params = value;
  };
}

/**
 * Fastify schema converter (for Fastify's built-in validation)
 */
export function toFastifySchema(joiSchema: Joi.Schema): any {
  // Convert Joi schema to JSON Schema for Fastify
  // This is a simplified version - use joi-to-json for full conversion
  return {
    type: 'object'
    // Additional conversion would go here
  };
}

// Export common fields for reuse
export { CommonFields };

// Export constants
export const ValidationConstants = {
  MIN_PRICE_CENTS,
  MAX_PRICE_CENTS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE
};
