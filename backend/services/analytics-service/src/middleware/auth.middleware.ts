import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/api-error';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    venueId?: string;
    role: string;
    permissions?: string[];
  };
  venue?: {
    id: string;
    name: string;
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      throw new ApiError(401, 'Authentication required');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    
    req.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };

    // Also set venue info if available
    if (decoded.venueId) {
      req.venue = {
        id: decoded.venueId,
        name: decoded.venueName || 'Venue'
      };
    }

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      next(new ApiError(401, 'Token expired'));
    } else if (error.name === 'JsonWebTokenError') {
      next(new ApiError(401, 'Invalid token'));
    } else {
      next(error);
    }
  }
};

export const authorize = (permissions: string[] | string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError(401, 'Authentication required'));
      return;
    }

    const requiredPerms = Array.isArray(permissions) ? permissions : [permissions];
    const userPerms = req.user.permissions || [];
    
    // Check if user has admin role (bypass permissions)
    if (req.user.role === 'admin') {
      next();
      return;
    }
    
    // Check if user has required permissions
    const hasPermission = requiredPerms.some(perm => 
      userPerms.includes(perm) || userPerms.includes('*')
    );

    if (!hasPermission) {
      next(new ApiError(403, 'Insufficient permissions'));
      return;
    }

    next();
  };
};

// Legacy function name support
export const authenticateVenue = authenticate;
