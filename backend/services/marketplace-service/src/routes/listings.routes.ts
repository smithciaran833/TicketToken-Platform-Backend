import { FastifyInstance } from 'fastify';
import { listingController } from '../controllers/listing.controller';
import { authMiddleware, verifyListingOwnership } from '../middleware/auth.middleware';
import { walletMiddleware } from '../middleware/wallet.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

/**
 * Listings Routes for Marketplace Service
 * 
 * Issues Fixed:
 * - INP-2: Enhanced validation with Fastify JSON schemas
 * - INP-H1: Added parameter validation for listing IDs
 * - INP-H2: Added price limits to prevent abuse
 */

// AUDIT FIX INP-2: Price limits to prevent accidental/malicious high prices
const MAX_PRICE_CENTS = 10000000; // $100,000 max
const MIN_PRICE_CENTS = 100;      // $1.00 min

// Validation schemas (Joi for complex validation)
const createListingSchema = Joi.object({
  ticketId: Joi.string().uuid().required(),
  eventId: Joi.string().uuid().required(),
  venueId: Joi.string().uuid().required(),
  price: Joi.number().integer().min(MIN_PRICE_CENTS).max(MAX_PRICE_CENTS).required(),
  originalFaceValue: Joi.number().integer().min(0).max(MAX_PRICE_CENTS).required(),
  eventStartTime: Joi.date().iso().required(),
});

const updatePriceSchema = Joi.object({
  price: Joi.number().integer().min(MIN_PRICE_CENTS).max(MAX_PRICE_CENTS).required(),
});

// AUDIT FIX INP-2: Fastify native JSON schemas for better performance
const listingIdParamSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' }
    }
  }
};

const getListingSchema = {
  ...listingIdParamSchema,
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        ticketId: { type: 'string', format: 'uuid' },
        eventId: { type: 'string', format: 'uuid' },
        venueId: { type: 'string', format: 'uuid' },
        sellerId: { type: 'string', format: 'uuid' },
        price: { type: 'integer' },
        originalFaceValue: { type: 'integer' },
        status: { type: 'string', enum: ['active', 'sold', 'cancelled', 'expired'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    },
    404: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        code: { type: 'string' }
      }
    }
  }
};

const myListingsQuerySchema = {
  querystring: {
    type: 'object',
    properties: {
      status: { 
        type: 'string', 
        enum: ['active', 'sold', 'cancelled', 'expired'] 
      },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      sortBy: { type: 'string', enum: ['createdAt', 'price', 'eventStartTime'] },
      sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
    },
    additionalProperties: false
  },
  response: {
    200: {
      type: 'object',
      properties: {
        listings: { type: 'array' },
        pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' }
          }
        }
      }
    }
  }
};

const updatePriceJsonSchema = {
  ...listingIdParamSchema,
  body: {
    type: 'object',
    required: ['price'],
    properties: {
      price: { 
        type: 'integer', 
        minimum: MIN_PRICE_CENTS, 
        maximum: MAX_PRICE_CENTS,
        description: 'Price in cents (USD)'
      }
    },
    additionalProperties: false
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        price: { type: 'integer' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    }
  }
};

export default async function listingsRoutes(fastify: FastifyInstance) {
  // Public routes - AUDIT FIX INP-2: Added param validation
  fastify.get('/:id', {
    schema: getListingSchema
  }, listingController.getListing.bind(listingController));

  // Get user's own listings - requires auth
  fastify.get('/my-listings', {
    preHandler: [authMiddleware],
    schema: myListingsQuerySchema
  }, listingController.getMyListings.bind(listingController));

  // Create listing - requires auth + wallet
  fastify.post('/', {
    preHandler: [authMiddleware, walletMiddleware, validate(createListingSchema)]
  }, listingController.createListing.bind(listingController));

  // Update listing price - requires auth + wallet + ownership
  // AUDIT FIX INP-2: Added JSON schema validation in addition to Joi
  fastify.put('/:id/price', {
    preHandler: [authMiddleware, walletMiddleware, verifyListingOwnership, validate(updatePriceSchema)],
    schema: updatePriceJsonSchema
  }, listingController.updateListingPrice.bind(listingController));

  // Cancel listing - requires auth + wallet + ownership
  fastify.delete('/:id', {
    preHandler: [authMiddleware, walletMiddleware, verifyListingOwnership],
    schema: listingIdParamSchema
  }, listingController.cancelListing.bind(listingController));
}
