import { Request, Response, NextFunction } from 'express';

/**
 * Simple tenant middleware that sets PostgreSQL session context
 */
export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Get tenant_id from JWT (set by authMiddleware)
    const user = (req as any).user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Default tenant if user doesn't have one
    const tenantId = user.tenant_id || '00000000-0000-0000-0000-000000000001';
    
    // Store in request for later use
    (req as any).tenantId = tenantId;
    
    // Set tenant context for this request
    // This should be done at the beginning of each database transaction
    (req as any).setTenantContext = async (client: any) => {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
    };
    
return     next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Webhook tenant middleware - uses default tenant
 */
export async function webhookTenantMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = '00000000-0000-0000-0000-000000000001';
    
    (req as any).tenantId = tenantId;
    (req as any).setTenantContext = async (client: any) => {
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
    };
    
return     next();
  } catch (error) {
    console.error('Webhook tenant middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
