/**
 * Internal Authentication Middleware for Compliance Service
 * 
 * AUDIT FIX S2S-1: No service-to-service authentication
 * 
 * Validates internal service-to-service requests using shared secrets
 * or JWT tokens issued by the auth service.
 */

import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { logger } from '../utils/logger';
import { UnauthorizedError, ForbiddenError } from '../errors';

// =============================================================================
// CONFIGURATION
// =============================================================================

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;
const INTERNAL_SERVICE_HEADER = 'x-internal-service';
const INTERNAL_SECRET_HEADER = 'x-internal-secret';

// Known internal services that can call compliance-service
const ALLOWED_INTERNAL_SERVICES = new Set([
  'api-gateway',
  'auth-service',
  'payment-service',
  'transfer-service',
  'marketplace-service',
  'notification-service',
  'admin-service'
]);

// =============================================================================
// TYPES
// =============================================================================

declare global {
  namespace Express {
    interface Request {
      internalService?: string;
      isInternalRequest?: boolean;
    }
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Verify internal service requests
 * Use this for service-to-service endpoints that should not be publicly accessible
 */
export function internalAuth(options?: {
  /** Allow specific services only */
  allowedServices?: string[];
  /** Skip validation in development */
  skipInDev?: boolean;
}): (req: Request, res: Response, next: NextFunction) => void {
  const allowedServices = options?.allowedServices 
    ? new Set(options.allowedServices) 
    : ALLOWED_INTERNAL_SERVICES;
  const skipInDev = options?.skipInDev ?? false;

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Skip in development if configured
      if (skipInDev && process.env.NODE_ENV === 'development') {
        req.isInternalRequest = true;
        req.internalService = 'dev-mode';
        return next();
      }

      // Get service name and secret from headers
      const serviceName = req.headers[INTERNAL_SERVICE_HEADER] as string;
      const providedSecret = req.headers[INTERNAL_SECRET_HEADER] as string;
      const requestId = (req as any).requestId;

      // Validate service name is provided
      if (!serviceName) {
        throw new UnauthorizedError('Internal service name required', requestId);
      }

      // Validate service is allowed
      if (!allowedServices.has(serviceName)) {
        logger.warn({
          requestId,
          serviceName,
          path: req.path
        }, 'Unknown internal service attempted access');
        throw new ForbiddenError(`Service ${serviceName} not authorized`, requestId);
      }

      // Validate secret
      if (!INTERNAL_SECRET) {
        logger.error('INTERNAL_SERVICE_SECRET not configured');
        throw new UnauthorizedError('Internal auth not configured', requestId);
      }

      if (!providedSecret) {
        throw new UnauthorizedError('Internal service secret required', requestId);
      }

      // Timing-safe comparison to prevent timing attacks
      const secretBuffer = Buffer.from(INTERNAL_SECRET);
      const providedBuffer = Buffer.from(providedSecret);

      if (secretBuffer.length !== providedBuffer.length || 
          !timingSafeEqual(secretBuffer, providedBuffer)) {
        logger.warn({
          requestId,
          serviceName,
          path: req.path
        }, 'Invalid internal service secret');
        throw new UnauthorizedError('Invalid internal service secret', requestId);
      }

      // Mark request as internal
      req.isInternalRequest = true;
      req.internalService = serviceName;

      logger.debug({
        requestId,
        serviceName,
        path: req.path
      }, 'Internal service authenticated');

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if request is from internal service (non-blocking)
 * Use this when internal requests have elevated privileges but external requests are still allowed
 */
export function checkInternalAuth(
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  const serviceName = req.headers[INTERNAL_SERVICE_HEADER] as string;
  const providedSecret = req.headers[INTERNAL_SECRET_HEADER] as string;

  if (serviceName && providedSecret && INTERNAL_SECRET) {
    try {
      const secretBuffer = Buffer.from(INTERNAL_SECRET);
      const providedBuffer = Buffer.from(providedSecret);

      if (secretBuffer.length === providedBuffer.length && 
          timingSafeEqual(secretBuffer, providedBuffer) &&
          ALLOWED_INTERNAL_SERVICES.has(serviceName)) {
        req.isInternalRequest = true;
        req.internalService = serviceName;
      }
    } catch (error) {
      // Ignore errors - just don't mark as internal
    }
  }

  next();
}

/**
 * Require internal auth only for non-admin users
 * Admins can access via normal auth, internal services can access via internal auth
 */
export function internalOrAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If already authenticated as admin, allow
  if ((req as any).user?.role === 'admin') {
    return next();
  }

  // Otherwise, require internal auth
  internalAuth()(req, res, next);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create headers for internal service calls
 */
export function createInternalHeaders(serviceName: string = 'compliance-service'): Record<string, string> {
  if (!INTERNAL_SECRET) {
    throw new Error('INTERNAL_SERVICE_SECRET not configured');
  }

  return {
    [INTERNAL_SERVICE_HEADER]: serviceName,
    [INTERNAL_SECRET_HEADER]: INTERNAL_SECRET
  };
}

/**
 * Check if request originated from internal service
 */
export function isInternalRequest(req: Request): boolean {
  return req.isInternalRequest === true;
}

/**
 * Get the calling service name
 */
export function getCallingService(req: Request): string | undefined {
  return req.internalService;
}

export default {
  internalAuth,
  checkInternalAuth,
  internalOrAdmin,
  createInternalHeaders,
  isInternalRequest,
  getCallingService
};
