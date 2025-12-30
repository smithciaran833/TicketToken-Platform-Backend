import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { getSchema } from '../schemas';
import { createRequestLogger, createLogger } from '../utils/logger';

const logger = createLogger('validation');

/**
 * Setup validation middleware
 * Configures Fastify's schema compiler and validation options
 */
export async function setupValidationMiddleware(server: FastifyInstance) {
  // Configure schema compiler options for better validation
  server.setValidatorCompiler(({ schema }) => {
    return (data) => {
      // Use Fastify's default Ajv validation
      // This is a pass-through - actual validation happens in route handlers
      return { value: data };
    };
  });

  // Add custom serializer compiler for response validation (optional)
  server.setSerializerCompiler(({ schema }) => {
    return (data) => JSON.stringify(data);
  });

  logger.info('Validation middleware configured');
}

/**
 * Gateway-level request validation middleware
 * Validates requests BEFORE proxying to downstream services
 * This provides defense-in-depth - services validate again
 */
export function validateBody(schemaName: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const reqLogger = createRequestLogger(request.id);
    const schema = getSchema(schemaName);

    if (!schema) {
      reqLogger.warn({ schemaName }, 'Validation schema not found at gateway level, passing through');
      return; // Pass through if no gateway schema - service will validate
    }

    const { error } = schema.validate(request.body, {
      abortEarly: false,
      stripUnknown: false // Don't strip - let service handle that
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      reqLogger.warn({
        schemaName,
        errors,
        ip: request.ip,
        path: request.url
      }, 'Gateway validation failed');

      return reply.status(400).send({
        error: 'Validation failed',
        code: 'GATEWAY_VALIDATION_ERROR',
        message: 'Request failed gateway validation',
        details: errors,
        requestId: request.id,
        timestamp: new Date().toISOString()
      });
    }

    reqLogger.debug({ schemaName }, 'Gateway validation passed');
  };
}

/**
 * Validate query parameters
 */
export function validateQuery(schema: Joi.ObjectSchema) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const reqLogger = createRequestLogger(request.id);

    const { error } = schema.validate(request.query, {
      abortEarly: false,
      stripUnknown: false
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      reqLogger.warn({ errors }, 'Gateway query validation failed');

      return reply.status(400).send({
        error: 'Invalid query parameters',
        code: 'GATEWAY_QUERY_VALIDATION_ERROR',
        details: errors,
        requestId: request.id,
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Validate UUID path parameters
 */
export function validateUuidParam(paramName: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const value = params[paramName];

    if (value && !uuidRegex.test(value)) {
      return reply.status(400).send({
        error: 'Invalid parameter',
        code: 'INVALID_UUID',
        message: `Parameter '${paramName}' must be a valid UUID`,
        requestId: request.id,
        timestamp: new Date().toISOString()
      });
    }
  };
}
