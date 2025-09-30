import { FastifyRequest, FastifyReply } from 'fastify';
import * as Joi from 'joi';
import { ErrorResponseBuilder } from '../utils/error-response';

export function validate(schema: any) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate each part if schema exists
      if (schema.body) {
        const { error, value } = schema.body.validate(request.body, { abortEarly: false });
        if (error) {
          return ErrorResponseBuilder.validation(reply, error.details.map((d: any) => ({
            field: d.path.join('.'),
            message: d.message
          })));
        }
        request.body = value;
      }

      if (schema.querystring) {
        const { error, value } = schema.querystring.validate(request.query);
        if (error) {
          return ErrorResponseBuilder.validation(reply, error.details.map((d: any) => ({
            field: d.path.join('.'),
            message: d.message
          })));
        }
        request.query = value;
      }

      if (schema.params) {
        const { error, value } = schema.params.validate(request.params);
        if (error) {
          return ErrorResponseBuilder.validation(reply, error.details.map((d: any) => ({
            field: d.path.join('.'),
            message: d.message
          })));
        }
        request.params = value;
      }
    } catch (error) {
      return ErrorResponseBuilder.internal(reply, 'Validation error');
    }
  };
}
