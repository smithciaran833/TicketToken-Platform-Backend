import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'this-is-a-very-long-secret-key-that-is-at-least-32-characters';

export interface AuthRequest extends Request {
  user?: any;
  tenantId?: string;
}

// Standard authentication middleware
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    req.tenantId = decoded.tenant_id || '00000000-0000-0000-0000-000000000001';
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
}

// Admin only middleware
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user?.roles?.includes('admin')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// Compliance officer middleware
export function requireComplianceOfficer(req: AuthRequest, res: Response, next: NextFunction): void {
  const validRoles = ['admin', 'compliance_officer', 'compliance_manager'];
  const hasRole = req.user?.roles?.some((role: string) => validRoles.includes(role));
  
  if (!hasRole) {
    res.status(403).json({ error: 'Compliance officer access required' });
    return;
  }
  next();
}

// Webhook authentication (different from user auth)
export function webhookAuth(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers['x-webhook-signature'] as string;
    
    if (!signature || signature !== secret) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
    
    // Set default tenant for webhooks
    (req as AuthRequest).tenantId = '00000000-0000-0000-0000-000000000001';
    next();
  };
}
