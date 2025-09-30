import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { ValidationError } from '../errors';

export function validate(schema: Joi.Schema) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      const validated = await schema.validateAsync(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });
      
      request.body = validated;
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        
        throw new ValidationError(errors);
      }
      throw error;
    }
  };
}
