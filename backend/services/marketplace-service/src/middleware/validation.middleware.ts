import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { BadRequestError } from '../utils/errors';

export const validate = (schema: Joi.ObjectSchema) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { error, value } = schema.validate(request.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors,
        },
      });
    }

    request.body = value;
  };
};

export const validateQuery = (schema: Joi.ObjectSchema) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { error, value } = schema.validate(request.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query validation failed',
          details: errors,
        },
      });
    }

    request.query = value;
  };
};

export const validateParams = (schema: Joi.ObjectSchema) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { error, value } = schema.validate(request.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Parameter validation failed',
          details: errors,
        },
      });
    }

    request.params = value;
  };
};
