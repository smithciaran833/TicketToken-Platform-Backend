import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors';

// Import RS256 auth from shared package
export { authenticate, AuthRequest } from '@tickettoken/shared';

// Re-export as authMiddleware for backward compatibility
import { authenticate } from '@tickettoken/shared';
export const authMiddleware = authenticate;

// Keep service-specific authorization logic
export const requireRole = (roles: string[]) => {
  return (req: any, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Unauthorized'));
    }
    
    if (req.user.role && roles.includes(req.user.role)) {
      return next();
    }
    
    if (req.user.permissions?.includes('admin:all')) {
      return next();
    }
    
    if (roles.includes('venue_manager') && req.user.permissions?.some((p: string) => p.startsWith('venue:'))) {
      return next();
    }
    
    return next(new UnauthorizedError('Insufficient permissions'));
  };
};
