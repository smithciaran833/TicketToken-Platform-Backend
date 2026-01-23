/**
 * Internal Auth Middleware (New) - compliance-service
 *
 * Uses shared library HMAC validation for service-to-service authentication.
 * This provides standardized HMAC-SHA256 authentication with replay attack prevention.
 *
 * Phase A HMAC Standardization - Week 1
 *
 * Note: This service uses Express, so the middleware follows Express patterns.
 * This replaces the legacy internal-auth.ts middleware when USE_NEW_HMAC=true
 */

import { Request, Response, NextFunction } from 'express';
import {
  createHmacValidator,
  HmacValidationResult,
  HmacError,
  ReplayAttackError,
  SignatureError,
} from '@tickettoken/shared';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'InternalAuth' });

const INTERNAL_HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET || process.env.INTERNAL_SERVICE_SECRET;
const USE_NEW_HMAC = process.env.USE_NEW_HMAC === 'true';

const ALLOWED_SERVICES = new Set(
  (process.env.ALLOWED_INTERNAL_SERVICES || 'api-gateway,auth-service,payment-service,transfer-service,marketplace-service,notification-service,admin-service')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

const hmacValidator = INTERNAL_HMAC_SECRET
  ? createHmacValidator({
      secret: INTERNAL_HMAC_SECRET,
      serviceName: 'compliance-service',
      replayWindowMs: 60000, // 60 seconds
    })
  : null;

export interface InternalServiceClaims {
  serviceName: string;
  isInternal: true;
  authenticatedAt: number;
}

declare global {
  namespace Express {
    interface Request {
      internalServiceNew?: InternalServiceClaims;
    }
  }
}

/**
 * HMAC-based internal authentication using shared library (Express middleware)
 */
export function internalAuthMiddlewareNew(options?: {
  /** Allow specific services only */
  allowedServices?: string[];
  /** Skip validation in development */
  skipInDev?: boolean;
}): (req: Request, res: Response, next: NextFunction) => void {
  const allowedServices = options?.allowedServices
    ? new Set(options.allowedServices.map(s => s.toLowerCase()))
    : ALLOWED_SERVICES;
  const skipInDev = options?.skipInDev ?? false;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Skip in development if configured
      if (skipInDev && process.env.NODE_ENV === 'development') {
        req.internalServiceNew = {
          serviceName: 'dev-mode',
          isInternal: true,
          authenticatedAt: Date.now(),
        };
        return next();
      }

      // Skip HMAC validation if feature flag is disabled
      if (!USE_NEW_HMAC) {
        log.debug('HMAC validation disabled (USE_NEW_HMAC=false)');
        return next();
      }

      if (!hmacValidator) {
        log.error('INTERNAL_HMAC_SECRET not configured');
        res.status(500).json({
          error: 'Internal server error',
          message: 'Service authentication not configured',
        });
        return;
      }

      // Extract HMAC headers
      const headers = {
        'x-internal-service': req.headers['x-internal-service'] as string,
        'x-internal-timestamp': req.headers['x-internal-timestamp'] as string,
        'x-internal-nonce': req.headers['x-internal-nonce'] as string,
        'x-internal-signature': req.headers['x-internal-signature'] as string,
        'x-internal-body-hash': req.headers['x-internal-body-hash'] as string,
      };

      if (!headers['x-internal-service'] || !headers['x-internal-signature']) {
        log.warn({
          path: req.path,
          method: req.method,
          hasService: !!headers['x-internal-service'],
          hasSignature: !!headers['x-internal-signature'],
        }, 'Missing required HMAC headers');

        res.status(401).json({
          error: 'Unauthorized',
          message: 'Missing authentication headers',
        });
        return;
      }

      // Validate using the shared library - correct API
      const result: HmacValidationResult = await hmacValidator.validate(
        req.headers as Record<string, string | string[] | undefined>,
        req.method,
        req.path,
        req.body
      );

      if (!result.valid) {
        log.warn({
          service: headers['x-internal-service'],
          path: req.path,
          error: result.error,
          errorCode: result.errorCode,
        }, 'HMAC validation failed');

        res.status(401).json({
          error: 'Unauthorized',
          message: result.error || 'Invalid signature',
        });
        return;
      }

      const serviceName = headers['x-internal-service'].toLowerCase();
      if (!allowedServices.has(serviceName)) {
        log.warn({ serviceName, path: req.path }, 'Unknown service attempted access');
        res.status(403).json({
          error: 'Forbidden',
          message: 'Service not authorized',
        });
        return;
      }

      req.internalServiceNew = {
        serviceName,
        isInternal: true,
        authenticatedAt: Date.now(),
      };

      // Backward compatibility
      (req as any).internalService = serviceName;

      log.debug({ serviceName, path: req.path }, 'Internal service authenticated');
      next();
    } catch (error) {
      if (error instanceof ReplayAttackError) {
        log.warn({ error: error.message }, 'Replay attack detected');
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Request already processed',
        });
        return;
      }

      if (error instanceof SignatureError) {
        log.warn({ error: error.message }, 'Invalid signature');
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid signature',
        });
        return;
      }

      if (error instanceof HmacError) {
        log.error({ error: error.message }, 'HMAC validation error');
        res.status(401).json({
          error: 'Unauthorized',
          message: error.message,
        });
        return;
      }

      log.error({ error }, 'Unexpected error during internal auth');
      res.status(500).json({
        error: 'Internal server error',
        message: 'Authentication failed',
      });
    }
  };
}

/**
 * Require internal service authentication - fails if not authenticated (Express middleware)
 */
export function requireInternalAuthNew(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!USE_NEW_HMAC) {
    return next(); // Let legacy auth handle it
  }

  if (!req.internalServiceNew?.isInternal) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Internal service authentication required',
    });
    return;
  }

  next();
}

/**
 * Check if request is from internal service (non-blocking)
 * Use this when internal requests have elevated privileges but external requests are still allowed
 */
export async function checkInternalAuthNew(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!USE_NEW_HMAC || !hmacValidator) {
    return next();
  }

  const headers = {
    'x-internal-service': req.headers['x-internal-service'] as string,
    'x-internal-timestamp': req.headers['x-internal-timestamp'] as string,
    'x-internal-nonce': req.headers['x-internal-nonce'] as string,
    'x-internal-signature': req.headers['x-internal-signature'] as string,
    'x-internal-body-hash': req.headers['x-internal-body-hash'] as string,
  };

  if (headers['x-internal-service'] && headers['x-internal-signature']) {
    try {
      // Validate using the shared library - correct API
      const result = await hmacValidator.validate(
        req.headers as Record<string, string | string[] | undefined>,
        req.method,
        req.path,
        req.body
      );

      if (result.valid && ALLOWED_SERVICES.has(headers['x-internal-service'].toLowerCase())) {
        req.internalServiceNew = {
          serviceName: headers['x-internal-service'].toLowerCase(),
          isInternal: true,
          authenticatedAt: Date.now(),
        };
        // Backward compatibility
        (req as any).internalService = headers['x-internal-service'].toLowerCase();
      }
    } catch {
      // Ignore errors - just don't mark as internal
    }
  }

  next();
}

/**
 * Check if request originated from internal service
 */
export function isInternalRequestNew(req: Request): boolean {
  return req.internalServiceNew?.isInternal === true;
}

/**
 * Get the calling service name
 */
export function getCallingServiceNew(req: Request): string | undefined {
  return req.internalServiceNew?.serviceName;
}

export default {
  internalAuthMiddlewareNew,
  requireInternalAuthNew,
  checkInternalAuthNew,
  isInternalRequestNew,
  getCallingServiceNew,
};
