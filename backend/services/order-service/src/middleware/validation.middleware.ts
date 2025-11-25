import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';

/**
 * Validation Middleware Factory
 * Creates a middleware function that validates request data against a Joi schema
 */
export interface ValidationOptions {
  body?: Joi.Schema;
  params?: Joi.Schema;
  query?: Joi.Schema;
  abortEarly?: boolean;
} export function validate(options: ValidationOptions) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { body, params, query, abortEarly = false } = options;

    try {
      // Validate request body
      if (body && request.body) {
        const { error, value } = body.validate(request.body, { abortEarly });
        if (error) {
          return reply.status(400).send({
            error: 'Validation Error',
            message: 'Request body validation failed',
            details: error.details.map((detail) => ({
              field: detail.path.join('.'),
              message: detail.message,
              type: detail.type,
            })),
          });
        }
        // Replace request body with validated/sanitized value
        request.body = value;
      }

      // Validate path parameters
      if (params && request.params) {
        const { error, value } = params.validate(request.params, { abortEarly });
        if (error) {
          return reply.status(400).send({
            error: 'Validation Error',
            message: 'Path parameters validation failed',
            details: error.details.map((detail) => ({
              field: detail.path.join('.'),
              message: detail.message,
              type: detail.type,
            })),
          });
        }
        request.params = value;
      }

      // Validate query parameters
      if (query && request.query) {
        const { error, value } = query.validate(request.query, { abortEarly });
        if (error) {
          return reply.status(400).send({
            error: 'Validation Error',
            message: 'Query parameters validation failed',
            details: error.details.map((detail) => ({
              field: detail.path.join('.'),
              message: detail.message,
              type: detail.type,
            })),
          });
        }
        request.query = value;
      }
    } catch (err) {
      request.log.error({ err }, 'Validation middleware error');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An error occurred during validation',
      });
    }
  };
}

/**
 * Async validation wrapper for use in route handlers
 * Alternative to middleware-based validation
 */
export async function validateData<T>(
  data: unknown,
  schema: Joi.Schema,
  abortEarly = false
): Promise<{ value: T; error: null } | { value: null; error: Joi.ValidationError }> {
  try {
    const { error, value } = schema.validate(data, { abortEarly });
    if (error) {
      return { value: null, error };
    }
    return { value, error: null };
  } catch (err) {
    throw new Error(`Unexpected validation error: ${err}`);
  }
}
