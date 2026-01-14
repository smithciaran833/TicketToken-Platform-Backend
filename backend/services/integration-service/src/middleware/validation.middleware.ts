import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';

/**
 * Validation Middleware
 * 
 * Validates request data against Joi schemas
 */

interface ValidationSource {
  body?: Joi.Schema;
  query?: Joi.Schema;
  params?: Joi.Schema;
}

// Local types for Express compatibility (if needed)
type ExpressRequest = any;
type ExpressResponse = any;
type ExpressNextFunction = () => void;

/**
 * Generic validation middleware factory for Express (legacy)
 * @deprecated Use validateFastify instead
 */
export function validateExpress(schemas: ValidationSource) {
  return (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
    const errors: string[] = [];

    // Validate body
    if (schemas.body) {
      const { error } = schemas.body.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map((d: any) => `Body: ${d.message}`));
      }
    }

    // Validate query
    if (schemas.query) {
      const { error, value } = schemas.query.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map((d: any) => `Query: ${d.message}`));
      } else {
        req.query = value; // Apply defaults and transformations
      }
    }

    // Validate params
    if (schemas.params) {
      const { error } = schemas.params.validate(req.params, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map((d: any) => `Params: ${d.message}`));
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    next();
  };
}

/**
 * Generic validation middleware factory for Fastify
 */
export function validateFastify(schemas: ValidationSource) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const errors: string[] = [];

    // Validate body
    if (schemas.body) {
      const { error } = schemas.body.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map(d => `Body: ${d.message}`));
      }
    }

    // Validate query
    if (schemas.query) {
      const { error, value } = schemas.query.validate(request.query, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map(d => `Query: ${d.message}`));
      } else {
        request.query = value; // Apply defaults and transformations
      }
    }

    // Validate params
    if (schemas.params) {
      const { error } = schemas.params.validate(request.params, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map(d => `Params: ${d.message}`));
      }
    }

    if (errors.length > 0) {
      return reply.code(400).send({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }
  };
}

/**
 * Validate a single value against a schema
 */
export function validateValue<T>(schema: Joi.Schema, value: any): {
  error?: string[];
  value?: T;
} {
  const { error, value: validatedValue } = schema.validate(value, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return {
      error: error.details.map(d => d.message),
    };
  }

  return { value: validatedValue };
}

/**
 * Async validation wrapper for use in try/catch blocks
 */
export async function validate<T>(
  schema: Joi.Schema,
  data: any
): Promise<T> {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.map(d => d.message).join(', ');
    throw new Error(`Validation failed: ${errors}`);
  }

  return value;
}
