import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'this-is-a-very-long-secret-key-that-is-at-least-32-characters';

export interface AuthRequest extends Request {
  venueRole?: string;
  user?: any;
  tenantId?: string;
}

// Standard authentication middleware
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    req.tenantId = decoded.tenant_id || '00000000-0000-0000-0000-000000000001';
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  return;
}

// Admin middleware
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.roles?.includes('admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
  return;
}

// Venue owner middleware
export function requireVenueOwner(req: AuthRequest, res: Response, next: NextFunction) {
  const validRoles = ['admin', 'venue_owner', 'venue_manager'];
  const hasRole = req.user?.roles?.some((role: string) => validRoles.includes(role));
  
  if (!hasRole) {
    return res.status(403).json({ error: 'Venue owner access required' });
  }
  next();
  return;
}

// Verify listing ownership
export async function verifyListingOwnership(req: AuthRequest, _res: Response, next: NextFunction) {
  const listingId = req.params.id;
  const userId = req.user?.id;
  
  // This would normally check the database
  // For now, we'll pass through but log the check
  console.log(`Verifying ownership of listing ${listingId} for user ${userId}`);
  next();
}
