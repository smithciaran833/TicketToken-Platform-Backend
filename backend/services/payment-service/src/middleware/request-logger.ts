import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RequestLogger' });

export interface RequestWithId extends FastifyRequest {
  id: string;
  startTime: number;
}

export const requestLogger = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const reqId = request.headers['x-request-id'] as string || uuidv4();
  (request as any).id = reqId;
  (request as any).startTime = Date.now();

  reply.header('X-Request-ID', reqId);

  log.info({
    id: reqId,
    method: request.method,
    path: request.url,
    query: request.query,
    ip: request.ip,
    userAgent: request.headers['user-agent']
  }, 'Incoming request');

  reply.raw.on('finish', () => {
    const duration = Date.now() - (request as any).startTime;
    log.info({
      id: reqId,
      statusCode: reply.statusCode,
      duration
    }, 'Outgoing response');

    reply.header('X-Response-Time', `${duration}ms`);
  });
};

export const performanceMonitor = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const checkpoints: { [key: string]: number } = {
    start: Date.now()
  };

  (request as any).checkpoint = (name: string) => {
    checkpoints[name] = Date.now();
  };

  reply.raw.on('finish', () => {
    const total = Date.now() - checkpoints.start;
    const reqId = (request as any).id;

    if (total > 1000) {
      log.warn({
        id: reqId,
        path: request.url,
        totalTime: total,
        checkpoints: Object.entries(checkpoints).map(([name, time]) => ({
          name,
          elapsed: time - checkpoints.start
        }))
      }, 'Slow request detected');
    }
  });
};
