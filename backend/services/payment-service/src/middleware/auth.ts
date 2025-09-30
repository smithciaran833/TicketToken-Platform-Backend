import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    venues?: string[];
    isAdmin?: boolean;
  };
  sessionId?: string;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_AUTH_TOKEN'
      });
    }
    
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        venues: decoded.venues,
        isAdmin: decoded.role === 'admin'
      };
      
      req.sessionId = decoded.sessionId || `session_${decoded.userId}_${Date.now()}`;
      
      return next();
    } catch (error) {
      return res.status(401).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }
  } catch (error) {
    return next(error);
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_AUTH'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }
    
    return next();
  };
};

export const requireVenueAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const venueId = req.params.venueId || req.body.venueId;
  
  if (!venueId) {
    return res.status(400).json({
      error: 'Venue ID required',
      code: 'VENUE_ID_MISSING'
    });
  }
  
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NO_AUTH'
    });
  }
  
  // Admins have access to all venues
  if (req.user.isAdmin) {
    return next();
  }
  
  // Check if user has access to this venue
  if (!req.user.venues?.includes(venueId)) {
    return res.status(403).json({
      error: 'Access denied to this venue',
      code: 'VENUE_ACCESS_DENIED',
      venueId
    });
  }
  
  next();
};
export const authMiddleware = authenticate;
