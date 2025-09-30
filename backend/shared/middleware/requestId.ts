import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface RequestWithId extends Request {
  id?: string;
  log?: any;
}

export const requestIdMiddleware = (req: RequestWithId, res: Response, next: NextFunction) => {
  req.id = (req.headers['x-request-id'] as string) || uuidv4();
  res.setHeader('x-request-id', req.id);
  
  // Add to logger context if logger exists
  const app = (req as any).app;
  if (app?.locals?.logger) {
    req.log = app.locals.logger.child({ requestId: req.id });
  }
  
  next();
};
