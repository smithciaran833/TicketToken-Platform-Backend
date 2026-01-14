import { FastifyRequest, FastifyReply } from 'fastify';

// Phase 2.5: Joi validation middleware
export function validateRequest(schema: any) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const validated = await schema.validateAsync(request.body, {
        abortEarly: false,
        stripUnknown: true
      });
      // Replace request body with validated data
      request.body = validated;
    } catch (error: any) {
      const details = error.details?.map((d: any) => ({
        field: d.path.join('.'),
        message: d.message
      })) || [];
      return reply.status(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details
      });
    }
  };
}

export function validateParams(schema: any) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const validated = await schema.validateAsync(request.params, {
        abortEarly: false,
        stripUnknown: true
      });
      request.params = validated;
    } catch (error: any) {
      const details = error.details?.map((d: any) => ({
        field: d.path.join('.'),
        message: d.message
      })) || [];
      return reply.status(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Parameter validation failed',
        details
      });
    }
  };
}

export function validateQuery(schema: any) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const validated = await schema.validateAsync(request.query, {
        abortEarly: false,
        stripUnknown: true
      });
      request.query = validated;
    } catch (error: any) {
      const details = error.details?.map((d: any) => ({
        field: d.path.join('.'),
        message: d.message
      })) || [];
      return reply.status(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Query validation failed',
        details
      });
    }
  };
}
