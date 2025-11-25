import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { logger } from '../utils/logger';

export function validateBody(schema: Joi.Schema) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const validated = await schema.validateAsync(request.body, {
        abortEarly: false,
        stripUnknown: true
      });
      request.body = validated;
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));

        logger.warn('Validation error:', errors);

        return reply.code(400).send({
          error: 'Validation failed',
          details: errors
        });
      }
      throw error;
    }
  };
}

export function validateQuery(schema: Joi.Schema) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const validated = await schema.validateAsync(request.query, {
        abortEarly: false
      });
      request.query = validated;
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        return reply.code(400).send({
          error: 'Invalid query parameters',
          details: error.details
        });
      }
      throw error;
    }
  };
}

export function validateParams(schema: Joi.Schema) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const validated = await schema.validateAsync(request.params);
      request.params = validated;
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        return reply.code(400).send({
          error: 'Invalid parameters',
          details: error.details
        });
      }
      throw error;
    }
  };
}
