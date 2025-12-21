import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';

export function validate(schema: Joi.Schema, source: 'body' | 'query' | 'params' = 'body') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const dataToValidate = source === 'body' ? request.body :
                             source === 'query' ? request.query :
                             request.params;

      const validated = await schema.validateAsync(dataToValidate, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (source === 'body') {
        request.body = validated;
      } else if (source === 'query') {
        request.query = validated;
      } else {
        request.params = validated;
      }
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        
        // Create a user-friendly error message that includes field names
        const errorMessage = errors.map(e => e.message).join(', ');
        
        // Throw a plain error with statusCode 400 for schema validation
        const validationError: any = new Error(errorMessage);
        validationError.statusCode = 400;
        validationError.errors = errors;
        throw validationError;
      }
      throw error;
    }
  };
}
