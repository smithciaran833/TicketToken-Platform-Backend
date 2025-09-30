import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'TenantMiddleware' });

export const tenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!tenantId) {
      log.warn('Request missing tenant ID');
      return res.status(400).json({ error: 'Tenant ID required' });
    }
    
    (req as any).tenantId = tenantId;
    return next();
  } catch (error) {
    log.error('Tenant middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const webhookTenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
  (req as any).tenantId = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
  return next();
};
