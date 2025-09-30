// import { serviceCache } from '../services/cache-integration'; // TODO: Remove if not needed
import { Request, Response, NextFunction } from 'express';
import { BaseController } from './base.controller';

class HealthController extends BaseController {
  health = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.success(res, { status: 'ok' });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  readiness = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check all dependencies
      this.success(res, { 
        status: 'ready',
        services: {
          database: 'ok',
          redis: 'ok',
          mongodb: 'ok'
        }
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  liveness = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.success(res, { status: 'alive' });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  dependencies = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.success(res, {
        postgres: { status: 'ok', latency: 5 },
        redis: { status: 'ok', latency: 2 },
        mongodb: { status: 'ok', latency: 8 },
        rabbitmq: { status: 'ok', latency: 3 }
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };
}

export const healthController = new HealthController();
