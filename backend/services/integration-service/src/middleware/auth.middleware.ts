import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    venueId?: string;
    role: string;
    permissions?: string[];
  };
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;

    req.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };

    next();
  } catch (error: any) {
    logger.error('Authentication failed:', error);
    
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ 
        success: false,
        error: 'Token expired' 
      });
      return;
    }
    
    res.status(401).json({ 
      success: false,
      error: 'Invalid token' 
    });
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt by user ${req.user.id} with role ${req.user.role}`);
      res.status(403).json({ 
        success: false,
        error: 'Insufficient permissions' 
      });
      return;
    }

    next();
  };
}

// Webhook signature verification
export function verifyWebhookSignature(provider: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signatures: Record<string, string | undefined> = {
      stripe: req.headers['stripe-signature'] as string,
      square: req.headers['x-square-signature'] as string,
      mailchimp: req.headers['x-mandrill-signature'] as string,
      quickbooks: req.headers['intuit-signature'] as string
    };

    const signature = signatures[provider];
    
    if (!signature) {
      logger.warn(`Missing webhook signature for ${provider}`);
      res.status(401).json({ 
        success: false,
        error: 'Invalid webhook signature' 
      });
      return;
    }

    // TODO: Implement actual signature verification per provider
    logger.info(`Webhook received from ${provider}`);
    next();
  };
}
