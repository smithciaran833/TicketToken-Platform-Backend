import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { ValidationError } from '../types';

// Common validation schemas
export const commonSchemas = {
  // UUID validation
  uuid: Joi.string().uuid({ version: 'uuidv4' }).required(),
  
  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
  }),

  // Venue ID
  venueId: Joi.string().uuid({ version: 'uuidv4' }).required(),

  // Event ID
  eventId: Joi.string().uuid({ version: 'uuidv4' }).required(),

  // Ticket purchase
  ticketPurchase: Joi.object({
    eventId: Joi.string().uuid().required(),
    items: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().required(),
        quantity: Joi.number().integer().min(1).max(10).required(),
        price: Joi.number().positive().required()
      })
    ).min(1).required()
  }),

  // Date range
  dateRange: Joi.object({
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  }),

  // Price
  price: Joi.number().positive().precision(2).required(),

  // Email
  email: Joi.string().email().lowercase().trim().required(),

  // Phone
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
};

// Validation middleware factory
export function validateRequest(schema: {
  body?: Joi.Schema;
  query?: Joi.Schema;
  params?: Joi.Schema;
  headers?: Joi.Schema;
}) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    // Validate each part of the request
    if (schema.body) {
      try {
        const validated = await (schema.body as any).validateAsync(request.body, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });
        request.body = validated;
      } catch (err) {
        const error = err as any;
        if (error.isJoi) {
          throw new ValidationError('Body validation failed', error.details);
        }
        throw error;
      }
    }

    if (schema.query) {
      try {
        const validated = await schema.query.validateAsync(request.query, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });
        request.query = validated;
      } catch (err) {
        const error = err as any;
        if (error.isJoi) {
          throw new ValidationError('Query validation failed', error.details);
        }
        throw error;
      }
    }

    if (schema.params) {
      try {
        const validated = await schema.params.validateAsync(request.params, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });
        request.params = validated;
      } catch (err) {
        const error = err as any;
        if (error.isJoi) {
          throw new ValidationError('Params validation failed', error.details);
        }
        throw error;
      }
    }

    if (schema.headers) {
      try {
        const validated = await schema.headers.validateAsync(request.headers, {
          abortEarly: false,
          stripUnknown: false, // Don't strip headers
          convert: true,
        });
        Object.assign(request.headers, validated);
      } catch (err) {
        const error = err as any;
        if (error.isJoi) {
          throw new ValidationError('Headers validation failed', error.details);
        }
        throw error;
      }
    }
  };
}

export async function setupValidationMiddleware(server: FastifyInstance) {
  // Add schema compiler for route schemas
  server.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip validation for certain routes
    if (request.url.startsWith('/health') || request.url.startsWith('/metrics')) {
      return;
    }

    // Only validate if routeSchema exists and has Joi schemas
    const schema = request.routeOptions?.schema;
    if (schema && schema.body && schema.body && (schema.body as any).validateAsync && typeof (schema.body as any).validateAsync === 'function') {
      try {
        const validated = await (schema.body as any).validateAsync(request.body, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });
        // Replace request body with validated data
        request.body = validated;
      } catch (err) {
        const error = err as any;
        if (error.isJoi) {
          throw new ValidationError('Validation failed', error.details);
        }
        throw error;
      }
    }
  });

  // Add common validators
  server.decorate('validators', commonSchemas);
}

// Specific validators for TicketToken

export const venueValidators = {
  createVenue: Joi.object({
    name: Joi.string().min(3).max(100).required(),
    address: Joi.object({
      street: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().required(),
      country: Joi.string().required(),
      postalCode: Joi.string().required(),
    }).required(),
    capacity: Joi.number().integer().min(1).required(),
    contactEmail: commonSchemas.email,
    contactPhone: commonSchemas.phone,
    tier: Joi.string().valid('free', 'standard', 'premium').default('free'),
  }),

  updateVenue: Joi.object({
    name: Joi.string().min(3).max(100).optional(),
    address: Joi.object({
      street: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      country: Joi.string().optional(),
      postalCode: Joi.string().optional(),
    }).optional(),
    capacity: Joi.number().integer().min(1).optional(),
    contactEmail: Joi.string().email().optional(),
    contactPhone: commonSchemas.phone,
  }),
};

export const eventValidators = {
  createEvent: Joi.object({
    venueId: commonSchemas.venueId,
    name: Joi.string().min(3).max(200).required(),
    description: Joi.string().max(2000).optional(),
    startDate: Joi.date().iso().min('now').required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
    category: Joi.string().valid('concert', 'sports', 'theater', 'conference', 'other').required(),
    ticketTiers: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        price: commonSchemas.price,
        quantity: Joi.number().integer().min(1).required(),
        description: Joi.string().optional(),
      })
    ).min(1).required(),
    nftEnabled: Joi.boolean().default(true),
    marketplaceEnabled: Joi.boolean().default(true),
  }),

  updateEvent: Joi.object({
    name: Joi.string().min(3).max(200).optional(),
    description: Joi.string().max(2000).optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    status: Joi.string().valid('draft', 'published', 'sold_out', 'cancelled').optional(),
  }),
};

export const ticketValidators = {
  purchaseTickets: commonSchemas.ticketPurchase,

  validateTicket: Joi.object({
    ticketId: Joi.string().uuid().required(),
    scannerDeviceId: Joi.string().optional(),
    entrance: Joi.string().optional(),
  }),
};

export const marketplaceValidators = {
  createListing: Joi.object({
    ticketId: Joi.string().uuid().required(),
    price: commonSchemas.price,
    expiresAt: Joi.date().iso().min('now').optional(),
  }),

  purchaseListing: Joi.object({
    listingId: Joi.string().uuid().required(),
    paymentMethodId: Joi.string().required(),
  }),
};

// Helper to format validation errors
export function formatValidationErrors(errors: any[]): any[] {
  return errors.map(error => ({
    field: error.path.join('.'),
    message: error.message,
    type: error.type,
  }));
}
