import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    venueId?: string;
    permissions: string[];
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // In production, this would validate JWT token
    // For now, mock authentication
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    // Mock user - in production, decode and verify JWT
    req.user = {
      id: 'user-123',
      venueId: req.params.venueId || req.body?.venueId,
      permissions: ['analytics.read', 'analytics.write', 'analytics.export']
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (requiredPermissions: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Not authenticated'));
    }

    const hasPermission = requiredPermissions.some(permission =>
      req.user!.permissions.includes(permission)
    );

    if (!hasPermission) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};
