import { FastifyRequest, FastifyReply } from 'fastify';
import * as Joi from 'joi';
import { ErrorResponseBuilder } from '../utils/error-response';

// SECURITY FIX: Sanitize field paths to prevent information leakage
function sanitizeFieldPath(path: string): string {
  // Remove internal prefixes and simplify paths
  return path
    .replace(/^(data|body|query|params)\./, '')
    .replace(/\[\d+\]/g, '[index]'); // Replace array indices with generic
}

// SECURITY FIX: Sanitize error messages to prevent information leakage
function sanitizeErrorMessage(message: string): string {
  // Replace quoted values with generic "value"
  return message.replace(/"[^"]*"/g, '"value"');
}

export function validate(schema: any) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // FIX: Build validation context from request for Joi.ref() support
      const validationContext = {
        params: request.params,
        query: request.query,
        headers: request.headers
      };

      // Validate each part if schema exists
      if (schema.body) {
        const { error, value } = schema.body.validate(request.body, { 
          abortEarly: false,
          context: validationContext  // FIX: Pass context for conditional validation
        });
        if (error) {
          return ErrorResponseBuilder.validation(reply, error.details.map((d: any) => ({
            field: sanitizeFieldPath(d.path.join('.')),
            message: sanitizeErrorMessage(d.message)
          })));
        }
        request.body = value;
      }

      // SECURITY FIX: Add abortEarly: false to querystring validation
      if (schema.querystring) {
        const { error, value } = schema.querystring.validate(request.query, { 
          abortEarly: false,
          context: validationContext
        });
        if (error) {
          return ErrorResponseBuilder.validation(reply, error.details.map((d: any) => ({
            field: sanitizeFieldPath(d.path.join('.')),
            message: sanitizeErrorMessage(d.message)
          })));
        }
        request.query = value;
      }

      // SECURITY FIX: Add abortEarly: false to params validation
      if (schema.params) {
        const { error, value } = schema.params.validate(request.params, { 
          abortEarly: false,
          context: validationContext
        });
        if (error) {
          return ErrorResponseBuilder.validation(reply, error.details.map((d: any) => ({
            field: sanitizeFieldPath(d.path.join('.')),
            message: sanitizeErrorMessage(d.message)
          })));
        }
        request.params = value;
      }
    } catch (error) {
      return ErrorResponseBuilder.internal(reply, 'Validation error');
    }
  };
}
