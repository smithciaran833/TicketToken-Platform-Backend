import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import Joi from 'joi';

const log = logger.child({ component: 'ValidationMiddleware' });

const schemas = {
  processPayment: Joi.object({
    venueId: Joi.string().uuid().required(),
    eventId: Joi.string().uuid().required(),
    tickets: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).max(10).required(),
        price: Joi.number().positive().required(),
        seatNumbers: Joi.array().items(Joi.string()).optional()
      })
    ).min(1).required(),
    paymentMethod: Joi.object({
      type: Joi.string().valid('card', 'ach', 'paypal', 'crypto').required(),
      token: Joi.string().optional(),
      paymentMethodId: Joi.string().optional()
    }).required(),
    metadata: Joi.object().optional(),
    deviceFingerprint: Joi.string().required(),
    sessionData: Joi.object({
      actions: Joi.array().items(
        Joi.object({
          type: Joi.string().required(),
          timestamp: Joi.number().required(),
          x: Joi.number().optional(),
          y: Joi.number().optional()
        })
      ).optional(),
      browserFeatures: Joi.object().optional()
    }).optional()
  }),

  calculateFees: Joi.object({
    venueId: Joi.string().uuid().required(),
    amount: Joi.number().positive().required(),
    ticketCount: Joi.number().integer().min(1).required()
  }),

  refundTransaction: Joi.object({
    amount: Joi.number().positive().optional(),
    reason: Joi.string().max(500).required()
  }),

  createListing: Joi.object({
    ticketId: Joi.string().uuid().required(),
    price: Joi.number().positive().required(),
    venueId: Joi.string().uuid().required()
  }),

  purchaseResale: Joi.object({
    listingId: Joi.string().required(),
    paymentMethodId: Joi.string().required()
  }),

  createGroup: Joi.object({
    eventId: Joi.string().uuid().required(),
    ticketSelections: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).required(),
        price: Joi.number().positive().required()
      })
    ).min(1).required(),
    members: Joi.array().items(
      Joi.object({
        email: Joi.string().email().required(),
        name: Joi.string().required(),
        ticketCount: Joi.number().integer().min(1).required()
      })
    ).min(1).max(20).required()
  })
};

export const validateRequest = (schemaName: keyof typeof schemas) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    log.info('Validating request schema', { schema: schemaName });
    const schema = schemas[schemaName];

    if (!schema) {
      log.error('Validation schema not found', { schema: schemaName });
      return reply.status(500).send({
        error: `Validation schema '${schemaName}' not found`
      });
    }

    const { error, value } = schema.validate(request.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      log.warn('Validation failed', { schema: schemaName, errors });

      return reply.status(400).send({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors
      });
    }

    // Replace request body with validated and sanitized data
    request.body = value;
    // Continue to next handler
  };
};

export const validateQueryParams = (schema: Joi.Schema) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    log.info('Validating query parameters');
    const { error, value } = schema.validate(request.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      log.warn('Query validation failed', { errors });

      return reply.status(400).send({
        error: 'Invalid query parameters',
        code: 'QUERY_VALIDATION_ERROR',
        errors
      });
    }

    request.query = value as any;
    // Continue to next handler
  };
};
