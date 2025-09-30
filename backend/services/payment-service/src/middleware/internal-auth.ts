import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'InternalAuth' });
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-change-in-production';

// ISSUE #25 FIX: Consistent internal service authentication
export function internalAuth(req: Request, res: Response, next: NextFunction) {
  const serviceName = req.headers['x-internal-service'] as string;
  const timestamp = req.headers['x-internal-timestamp'] as string;
  const signature = req.headers['x-internal-signature'] as string;

  // Check all required headers
  if (!serviceName || !timestamp || !signature) {
    log.warn('Internal request missing required headers', {
      path: req.path,
      hasService: !!serviceName,
      hasTimestamp: !!timestamp,
      hasSignature: !!signature
    });
    return res.status(401).json({ error: 'Missing authentication headers' });
  }

  // Verify timestamp is within 5 minutes
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);

  if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
    log.warn('Internal request with invalid timestamp', {
      service: serviceName,
      timeDiff: timeDiff / 1000
    });
    return res.status(401).json({ error: 'Request expired' });
  }

  // For development, accept temp-signature
  if (signature === 'temp-signature' && process.env.NODE_ENV !== 'production') {
    log.debug('Accepted temp signature in development', { service: serviceName });
    (req as any).internalService = serviceName;
    return next();
  }

  // Verify HMAC signature
  const payload = `${serviceName}:${timestamp}:${req.method}:${req.path}:${JSON.stringify(req.body)}`;
  const expectedSignature = crypto
    .createHmac('sha256', INTERNAL_SECRET)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    log.warn('Invalid internal service signature', {
      service: serviceName,
      path: req.path
    });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Add service info to request
  (req as any).internalService = serviceName;
  log.debug('Internal request authenticated', {
    service: serviceName,
    path: req.path
  });

  next();
}
