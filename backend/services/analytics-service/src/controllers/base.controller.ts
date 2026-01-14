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

  protected notFound(reply: FastifyReply, message: string = 'Not found'): FastifyReply {
    return reply.code(404).send({
      success: false,
      error: {
        message,
        statusCode: 404,
      }
    });
  }

  protected badRequest(reply: FastifyReply, message: string = 'Bad request'): FastifyReply {
    return reply.code(400).send({
      success: false,
      error: {
        message,
        statusCode: 400,
      }
    });
  }

  protected unauthorized(reply: FastifyReply, message: string = 'Unauthorized'): FastifyReply {
    return reply.code(401).send({
      success: false,
      error: {
        message,
        statusCode: 401,
      }
    });
  }

  protected forbidden(reply: FastifyReply, message: string = 'Forbidden'): FastifyReply {
    return reply.code(403).send({
      success: false,
      error: {
        message,
        statusCode: 403,
      }
    });
  }
}
