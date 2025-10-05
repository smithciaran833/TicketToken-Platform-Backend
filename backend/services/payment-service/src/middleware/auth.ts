import { Request, Response, NextFunction } from 'express';

// Import RS256 auth from shared package
export { authenticate, AuthRequest } from '@tickettoken/shared';

// Re-export as authMiddleware for backward compatibility
import { authenticate } from '@tickettoken/shared';
export const authMiddleware = authenticate;

// Keep service-specific authorization logic
export const requireRole = (roles: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
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
  req: any,
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
  if (req.user.isAdmin || req.user.role === 'admin') {
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
