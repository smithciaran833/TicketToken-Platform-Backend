import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { RateLimiterService } from '../services/rate-limiter.service';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth.middleware';

export class RateLimitController {
  private rateLimiter: RateLimiterService;
  
  constructor() {
    this.rateLimiter = RateLimiterService.getInstance();
  }
  
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = this.rateLimiter.getStatus();
      res.json(status);
    } catch (error) {
      logger.error('Failed to get rate limit status:', error);
      res.status(500).json({ error: 'Failed to get rate limit status' });
    }
  }
  
  async checkLimit(req: Request, res: Response): Promise<void> {
    try {
      const { service } = req.params;
      const isLimited = await this.rateLimiter.isRateLimited(service);
      const waitTime = this.rateLimiter.getWaitTime(service);
      
      res.json({
        service,
        rateLimited: isLimited,
        waitTimeMs: waitTime,
        waitTimeSeconds: Math.ceil(waitTime / 1000)
      });
    } catch (error) {
      logger.error('Failed to check rate limit:', error);
      res.status(500).json({ error: 'Failed to check rate limit' });
    }
  }
  
  async resetLimit(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { service } = req.params;
      
      this.rateLimiter.reset(service);
      
      logger.warn(`Rate limiter reset for ${service} by user ${req.user?.id}`);
      
      res.json({
        service,
        status: 'reset',
        message: `Rate limiter for ${service} has been reset`
      });
    } catch (error) {
      logger.error('Failed to reset rate limit:', error);
      res.status(500).json({ error: 'Failed to reset rate limit' });
    }
  }
  
  async emergencyStop(req: AuthRequest, res: Response): Promise<void> {
    try {
      this.rateLimiter.emergencyStop();
      
      logger.error(`EMERGENCY STOP activated by user ${req.user?.id}`);
      
      res.json({
        status: 'stopped',
        message: 'All rate limiters have been paused'
      });
    } catch (error) {
      logger.error('Failed to emergency stop:', error);
      res.status(500).json({ error: 'Failed to emergency stop' });
    }
  }
  
  async resume(req: AuthRequest, res: Response): Promise<void> {
    try {
      this.rateLimiter.resume();
      
      logger.info(`Rate limiters resumed by user ${req.user?.id}`);
      
      res.json({
        status: 'resumed',
        message: 'All rate limiters have been resumed'
      });
    } catch (error) {
      logger.error('Failed to resume rate limiters:', error);
      res.status(500).json({ error: 'Failed to resume rate limiters' });
    }
  }
}
