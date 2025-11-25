import { FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

export class BaseController {
  protected log = logger;

  protected handleError(error: any, reply: FastifyReply): FastifyReply {
    this.log.error('Controller error', { error });
    
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    
    return reply.code(statusCode).send({
      success: false,
      error: {
        message,
        statusCode,
      }
    });
  }

  protected success(reply: FastifyReply, data: any, status: number = 200): FastifyReply {
    return reply.code(status).send({
      success: true,
      data
    });
  }
}
