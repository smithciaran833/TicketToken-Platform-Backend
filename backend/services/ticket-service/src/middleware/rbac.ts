import { Request, Response, NextFunction } from 'express';

/**
 * RBAC middleware - checks user permissions
 */
export function requirePermission(permission: string | string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // For now, just check if user exists
    // TODO: Implement actual permission checking
    const permissions = Array.isArray(permission) ? permission : [permission];
    
    // Mock permission check - in production, check against user.permissions or user.role
    const hasPermission = true; // Replace with actual logic
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: permissions 
      });
    }
    
return     next();
  };
}

/**
 * Common permission constants
 */
export const Permissions = {
  // Ticket permissions
  TICKET_CREATE: 'ticket:create',
  TICKET_READ: 'ticket:read',
  TICKET_UPDATE: 'ticket:update',
  TICKET_DELETE: 'ticket:delete',
  TICKET_TRANSFER: 'ticket:transfer',
  
  // Purchase permissions
  PURCHASE_CREATE: 'purchase:create',
  PURCHASE_REFUND: 'purchase:refund',
  
  // Admin permissions
  ADMIN_FULL: 'admin:*',
};
