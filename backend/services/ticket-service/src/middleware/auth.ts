import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/errors';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
    tenantId?: string;
    venueId?: string;
    permissions?: string[];
  };
}

export const authMiddleware = (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('Auth header:', authHeader); // DEBUG

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);
    console.log('Token length:', token.length); // DEBUG
    console.log('JWT_ACCESS_SECRET:', process.env.JWT_ACCESS_SECRET?.substring(0, 10) + '...'); // DEBUG

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || "your-access-secret-change-this-in-production-12345") as any;
    console.log('Decoded token:', decoded); // DEBUG

    // Validate tenant_id is present in token
    if (!decoded.tenant_id) {
      console.error('Token missing tenant_id:', decoded);
      throw new UnauthorizedError('Invalid token - missing tenant context');
    }

    req.user = {
      id: decoded.sub,
      tenantId: decoded.tenant_id,  // Extract from JWT, not from headers
      permissions: decoded.permissions || [],
      email: decoded.email,
      role: decoded.role,
      venueId: decoded.venueId
    };

    next();
  } catch (error) {
    console.error('Auth error:', error); // DEBUG
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else {
      next(new UnauthorizedError('Invalid token'));
    }
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Unauthorized'));
    }

    if (req.user.role && roles.includes(req.user.role)) {
      return next();
    }

    if (req.user.permissions?.includes('admin:all')) {
      return next();
    }

    if (roles.includes('venue_manager') && req.user.permissions?.some(p => p.startsWith('venue:'))) {
      return next();
    }

    return next(new UnauthorizedError('Insufficient permissions'));
  };
};
