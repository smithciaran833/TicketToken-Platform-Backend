import Joi from 'joi';

/**
 * Gateway-level validation schemas
 * These mirror downstream service schemas for defense-in-depth
 * Gateway validates first, services validate again
 */

// =============================================================================
// PAYMENT SCHEMAS
// =============================================================================

export const paymentSchemas = {
  processPayment: Joi.object({
    venueId: Joi.string().uuid().required(),
    eventId: Joi.string().uuid().required(),
    tickets: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).max(10).required(),
        price: Joi.number().positive().required(),
        seatNumbers: Joi.array().items(Joi.string().max(50)).max(10).optional()
      })
    ).min(1).max(50).required(),
    paymentMethod: Joi.object({
      type: Joi.string().valid('card', 'ach', 'paypal', 'crypto').required(),
      token: Joi.string().max(500).optional(),
      paymentMethodId: Joi.string().max(500).optional()
    }).required(),
    metadata: Joi.object().optional(),
    deviceFingerprint: Joi.string().max(1000).required(),
    sessionData: Joi.object({
      actions: Joi.array().items(
        Joi.object({
          type: Joi.string().max(50).required(),
          timestamp: Joi.number().required(),
          x: Joi.number().optional(),
          y: Joi.number().optional()
        })
      ).max(1000).optional(),
      browserFeatures: Joi.object().optional()
    }).optional()
  }),

  calculateFees: Joi.object({
    venueId: Joi.string().uuid().required(),
    amount: Joi.number().positive().max(1000000).required(), // Max $10,000
    ticketCount: Joi.number().integer().min(1).max(100).required()
  }),

  refundTransaction: Joi.object({
    amount: Joi.number().positive().max(1000000).optional(),
    reason: Joi.string().max(500).required()
  })
};

// =============================================================================
// TICKET SCHEMAS
// =============================================================================

export const ticketSchemas = {
  purchaseTickets: Joi.object({
    eventId: Joi.string().uuid().required(),
    tickets: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).max(10).required(),
        seatNumbers: Joi.array().items(Joi.string().max(50)).max(10).optional()
      })
    ).min(1).max(50).required(),
    paymentIntentId: Joi.string().max(500).optional(),
    metadata: Joi.object().optional()
  }),

  createTicketType: Joi.object({
    eventId: Joi.string().uuid().required(),
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).optional(),
    priceCents: Joi.number().integer().min(0).max(100000000).required(), // Max $1,000,000
    quantity: Joi.number().integer().min(1).max(1000000).required(),
    maxPerPurchase: Joi.number().integer().min(1).max(10).required(),
    saleStartDate: Joi.date().iso().required(),
    saleEndDate: Joi.date().iso().required(),
    metadata: Joi.object().optional()
  }),

  transferTicket: Joi.object({
    ticketId: Joi.string().uuid().required(),
    toUserId: Joi.string().uuid().required(),
    reason: Joi.string().max(200).optional()
  }),

  validateQR: Joi.object({
    qrCode: Joi.string().max(5000).required(),
    eventId: Joi.string().uuid().required(),
    entrance: Joi.string().max(100).optional(),
    deviceId: Joi.string().max(100).optional()
  })
};

// =============================================================================
// AUTH SCHEMAS
// =============================================================================

export const authSchemas = {
  login: Joi.object({
    email: Joi.string().email().max(255).required(),
    password: Joi.string().min(8).max(128).required(),
    mfaCode: Joi.string().length(6).optional(),
    deviceFingerprint: Joi.string().max(1000).optional()
  }),

  register: Joi.object({
    email: Joi.string().email().max(255).required(),
    password: Joi.string().min(8).max(128).required(),
    firstName: Joi.string().min(1).max(100).required(),
    lastName: Joi.string().min(1).max(100).required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    acceptTerms: Joi.boolean().valid(true).required()
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().max(2000).required()
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().max(255).required()
  }),

  resetPassword: Joi.object({
    token: Joi.string().max(500).required(),
    password: Joi.string().min(8).max(128).required()
  })
};

// =============================================================================
// MARKETPLACE SCHEMAS
// =============================================================================

export const marketplaceSchemas = {
  createListing: Joi.object({
    ticketId: Joi.string().uuid().required(),
    price: Joi.number().positive().max(1000000).required(),
    venueId: Joi.string().uuid().required()
  }),

  purchaseResale: Joi.object({
    listingId: Joi.string().uuid().required(),
    paymentMethodId: Joi.string().max(500).required()
  })
};

// =============================================================================
// VALIDATION MIDDLEWARE FACTORY
// =============================================================================

export type SchemaName = 
  | keyof typeof paymentSchemas 
  | keyof typeof ticketSchemas 
  | keyof typeof authSchemas
  | keyof typeof marketplaceSchemas;

const allSchemas = {
  ...paymentSchemas,
  ...ticketSchemas,
  ...authSchemas,
  ...marketplaceSchemas
};

export function getSchema(name: string): Joi.ObjectSchema | undefined {
  return (allSchemas as any)[name];
}
