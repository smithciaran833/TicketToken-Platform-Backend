import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError, ZodSchema } from 'zod';
import logger from '../utils/logger';

/**
 * VALIDATION MIDDLEWARE
 * 
 * Provides validation middleware for request bodies, query params, and URL params
 * Phase 1: Input Validation
 */

/**
 * Format Zod validation errors into user-friendly format
 */
export function formatZodError(error: ZodError): any {
  return {
    statusCode: 400,
    error: 'Validation Error',
    message: 'Request validation failed',
    details: error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    })),
  };
}

/**
 * Validate request body middleware factory
 * 
 * Usage:
 * app.post('/endpoint', {
 *   preHandler: validateBody(mySchema)
 * }, handler)
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate and parse the request body
      const validated = schema.parse(request.body);
      
      // Replace request body with validated data
      request.body = validated;
      
      logger.debug('Request body validation passed', {
        route: request.url,
        method: request.method,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Request body validation failed', {
          route: request.url,
          method: request.method,
          errors: error.errors,
        });
        
        return reply.code(400).send(formatZodError(error));
      }
      throw error;
    }
  };
}

/**
 * Validate query parameters middleware factory
 * 
 * Usage:
 * app.get('/endpoint', {
 *   preHandler: validateQuery(mySchema)
 * }, handler)
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate and parse query parameters
      const validated = schema.parse(request.query);
      
      // Replace request query with validated data
      request.query = validated;
      
      logger.debug('Query parameters validation passed', {
        route: request.url,
        method: request.method,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Query parameters validation failed', {
          route: request.url,
          method: request.method,
          errors: error.errors,
        });
        
        return reply.code(400).send(formatZodError(error));
      }
      throw error;
    }
  };
}

/**
 * Validate URL parameters middleware factory
 * 
 * Usage:
 * app.get('/endpoint/:id', {
 *   preHandler: validateParams(mySchema)
 * }, handler)
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate and parse URL parameters
      const validated = schema.parse(request.params);
      
      // Replace request params with validated data
      request.params = validated;
      
      logger.debug('URL parameters validation passed', {
        route: request.url,
        method: request.method,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('URL parameters validation failed', {
          route: request.url,
          method: request.method,
          errors: error.errors,
        });
        
        return reply.code(400).send(formatZodError(error));
      }
      throw error;
    }
  };
}

/**
 * Combined validation middleware
 * Validates body, query, and params all at once
 * 
 * Usage:
 * app.post('/endpoint/:id', {
 *   preHandler: validate({
 *     body: bodySchema,
 *     query: querySchema,
 *     params: paramsSchema,
 *   })
 * }, handler)
 */
export function validate(schemas: {
  body?: ZodSchema<any>;
  query?: ZodSchema<any>;
  params?: ZodSchema<any>;
}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate body if schema provided
      if (schemas.body) {
        request.body = schemas.body.parse(request.body);
      }

      // Validate query if schema provided
      if (schemas.query) {
        request.query = schemas.query.parse(request.query);
      }

      // Validate params if schema provided
      if (schemas.params) {
        request.params = schemas.params.parse(request.params);
      }

      logger.debug('Combined validation passed', {
        route: request.url,
        method: request.method,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Combined validation failed', {
          route: request.url,
          method: request.method,
          errors: error.errors,
        });
        
        return reply.code(400).send(formatZodError(error));
      }
      throw error;
    }
  };
}

/**
 * Global error handler for validation errors
 * Register this with Fastify to catch all validation errors
 */
export function setupValidationErrorHandler(app: any) {
  app.setErrorHandler((error: any, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      logger.error('Unhandled validation error', {
        route: request.url,
        method: request.method,
        errors: error.errors,
      });
      
      return reply.code(400).send(formatZodError(error));
    }

    // Pass to default error handler
    throw error;
  });
}
