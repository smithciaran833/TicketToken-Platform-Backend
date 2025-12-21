import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { RateLimiterService } from '../services/rate-limiter.service';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth.middleware';

export class RateLimitController {
  private rateLimiter: RateLimiterService;

  constructor() {
    this.rateLimiter = RateLimiterService.getInstance();
  }

  async getStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const status = this.rateLimiter.getStatus();
      return reply.send(status);
    } catch (error) {
      logger.error('Failed to get rate limit status:', error);
      return reply.code(500).send({ error: 'Failed to get rate limit status' });
    }
  }

  async checkLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { service } = request.params as { service: string };

      const isLimited = await this.rateLimiter.isRateLimited(service);
      const waitTime = await this.rateLimiter.getWaitTime(service);

      return reply.send({
        service,
        rateLimited: isLimited,
        waitTimeMs: waitTime,
        waitTimeSeconds: Math.ceil(waitTime / 1000)
      });
    } catch (error) {
      logger.error('Failed to check rate limit:', error);
      return reply.code(500).send({ error: 'Failed to check rate limit' });
    }
  }

  async resetLimit(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      const { service } = request.params as { service: string };

      this.rateLimiter.reset(service);

      logger.warn(`Rate limiter reset for ${service} by user ${request.user?.userId}`);

      return reply.send({
        service,
        status: 'reset',
        message: `Rate limiter for ${service} has been reset`
      });
    } catch (error) {
      logger.error('Failed to reset rate limit:', error);
      return reply.code(500).send({ error: 'Failed to reset rate limit' });
    }
  }

  async emergencyStop(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      this.rateLimiter.emergencyStop();

      logger.error(`EMERGENCY STOP activated by user ${request.user?.userId}`);

      return reply.send({
        status: 'stopped',
        message: 'All rate limiters have been paused'
      });
    } catch (error) {
      logger.error('Failed to emergency stop:', error);
      return reply.code(500).send({ error: 'Failed to emergency stop' });
    }
  }

  async resume(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      this.rateLimiter.resume();

      logger.info(`Rate limiters resumed by user ${request.user?.userId}`);

      return reply.send({
        status: 'resumed',
        message: 'All rate limiters have been resumed'
      });
    } catch (error) {
      logger.error('Failed to resume rate limiters:', error);
      return reply.code(500).send({ error: 'Failed to resume rate limiters' });
    }
  }
}
