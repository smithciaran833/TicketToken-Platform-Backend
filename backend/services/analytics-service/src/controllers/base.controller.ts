// import { serviceCache } from '../services/cache-integration'; // TODO: Remove if not needed
import { Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class BaseController {
  protected log = logger;

  protected handleError(error: any, res: Response, next: NextFunction): void {
    this.log.error('Controller error', { error });
    next(error);
  }

  protected success(res: Response, data: any, status: number = 200): void {
    res.status(status).json({
      success: true,
      data
    });
  }
}
