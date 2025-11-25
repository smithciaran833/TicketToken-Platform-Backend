import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError, ZodSchema } from 'zod';
import { logger } from '../utils/logger';

/**
 * VALIDATION MIDDLEWARE
 * 
 * Provides validation middleware for request bodies, query params, and URL params
 * Phase 4: Input Validation & API Hardening
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
 * fastify.post('/endpoint', {
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
 * fastify.get('/endpoint', {
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
 * fastify.get('/endpoint/:id', {
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
 * fastify.post('/endpoint/:id', {
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
    const errors: any[] = [];

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
 * Safe validation that doesn't throw error on failure
 * Returns validation result in request context
 * 
 * Usage in controller:
 * const validation = request.validationResult;
 * if (!validation.success) {
 *   return reply.code(400).send(validation.error);
 * }
 */
export function safeValidateBody<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request.body);
    
    if (result.success) {
      request.body = result.data;
      (request as any).validationResult = { success: true, data: result.data };
    } else {
      (request as any).validationResult = { 
        success: false, 
        error: formatZodError(result.error),
      };
      return reply.code(400).send(formatZodError(result.error));
    }
  };
}

/**
 * Sanitize input helper
 * Removes potentially dangerous characters from string inputs
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/[^\w\s@.-]/gi, '') // Remove special characters except common ones
    .trim();
}

/**
 * Validate file upload middleware
 * Checks file type, size, and other constraints
 */
export function validateFileUpload(options: {
  maxSize?: number; // in bytes
  allowedMimeTypes?: string[];
  required?: boolean;
}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();

    if (!data && options.required) {
      logger.warn('File upload required but not provided', {
        route: request.url,
      });
      return reply.code(400).send({
        statusCode: 400,
        error: 'File Required',
        message: 'A file must be uploaded',
      });
    }

    if (data) {
      // Check file size
      if (options.maxSize) {
        const buffer = await data.toBuffer();
        if (buffer.length > options.maxSize) {
          logger.warn('File upload exceeds size limit', {
            route: request.url,
            size: buffer.length,
            maxSize: options.maxSize,
          });
          return reply.code(400).send({
            statusCode: 400,
            error: 'File Too Large',
            message: `File size exceeds maximum of ${options.maxSize} bytes`,
          });
        }
      }

      // Check MIME type
      if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(data.mimetype)) {
        logger.warn('File upload has invalid MIME type', {
          route: request.url,
          mimeType: data.mimetype,
          allowed: options.allowedMimeTypes,
        });
        return reply.code(400).send({
          statusCode: 400,
          error: 'Invalid File Type',
          message: `File type ${data.mimetype} not allowed. Allowed types: ${options.allowedMimeTypes.join(', ')}`,
        });
      }
    }
  };
}

/**
 * Global error handler for validation errors
 * Register this with Fastify to catch all validation errors
 */
export function setupValidationErrorHandler(fastify: any) {
  fastify.setErrorHandler((error: any, request: FastifyRequest, reply: FastifyReply) => {
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
