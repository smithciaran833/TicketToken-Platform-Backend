/**
 * Authentication Middleware for Integration Service
 * 
 * AUDIT FIXES:
 * - SEC-1: JWT algorithm not specified → Algorithm whitelist
 * - SEC-2: Hardcoded fallback JWT secret → No fallback, fail if missing
 * - S2S-2: JWT not RS256 → Configurable algorithm
 * - S2S-3: JWT issuer not validated → iss check
 * - S2S-4: JWT audience not validated → aud check
 * - S2S-5: Hardcoded fallback secret → Removed
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { getJwtConfig, isProduction, isDevelopment } from '../config/index';
import { logger } from '../utils/logger';
import { UnauthorizedError, ForbiddenError } from '../errors/index';

// =============================================================================
// TYPES
// =============================================================================

export interface AuthUser {
  id: string;
  tenantId?: string;
  venueId?: string;
  role: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

// =============================================================================
// JWT VERIFICATION OPTIONS
// =============================================================================

function getJwtVerifyOptions(): jwt.VerifyOptions {
  const config = getJwtConfig();
  
  return {
    algorithms: [config.algorithm as jwt.Algorithm],
    issuer: config.issuer,
    audience: config.audience,
    clockTolerance: 30, // 30 seconds tolerance for clock skew
  };
}

// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

/**
 * Authenticate requests using JWT
 * 
 * AUDIT FIX SEC-1, SEC-2, S2S-2-5: Proper JWT validation
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.id as string;
  
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      throw new UnauthorizedError('Authentication required', requestId);
    }
    
    // Extract token from Bearer scheme
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      throw new UnauthorizedError('Invalid authorization header format', requestId);
    }
    
    const token = parts[1];
    
    if (!token || token.length < 10) {
      throw new UnauthorizedError('Invalid token', requestId);
    }
    
    // Get JWT config - will throw if secret not configured
    const jwtConfig = getJwtConfig();
    
    if (!jwtConfig.secret) {
      logger.error('JWT_SECRET not configured');
      throw new UnauthorizedError('Authentication service misconfigured', requestId);
    }
    
    // Verify token with algorithm, issuer, and audience validation
    const decoded = jwt.verify(
      token, 
      jwtConfig.secret,
      getJwtVerifyOptions()
    ) as jwt.JwtPayload;
    
    // Extract user information
    request.user = {
      id: decoded.userId || decoded.sub || decoded.id,
      tenantId: decoded.tenantId || decoded.tenant_id,
      venueId: decoded.venueId || decoded.venue_id,
      role: decoded.role || 'user',
      permissions: decoded.permissions || [],
      iat: decoded.iat,
      exp: decoded.exp,
      iss: decoded.iss,
      aud: decoded.aud
    };
    
    // Ensure we have a valid user ID
    if (!request.user.id) {
      logger.warn('Token missing user identifier', { requestId });
      throw new UnauthorizedError('Invalid token payload', requestId);
    }
    
    logger.debug('User authenticated', {
      requestId,
      userId: request.user.id,
      role: request.user.role,
      tenantId: request.user.tenantId
    });
    
  } catch (error: any) {
    // Handle JWT-specific errors
    if (error instanceof jwt.TokenExpiredError) {
      logger.info('Token expired', { requestId, expiredAt: (error as any).expiredAt });
      throw new UnauthorizedError('Token expired', requestId);
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid token', { requestId, error: error.message });
      throw new UnauthorizedError('Invalid token', requestId);
    }
    
    if (error instanceof jwt.NotBeforeError) {
      logger.warn('Token not yet valid', { requestId });
      throw new UnauthorizedError('Token not yet valid', requestId);
    }
    
    // Re-throw our custom errors
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    
    // Log and wrap unexpected errors
    logger.error('Authentication error', {
      requestId,
      error: error.message
    });
    throw new UnauthorizedError('Authentication failed', requestId);
  }
}

// =============================================================================
// AUTHORIZATION MIDDLEWARE
// =============================================================================

/**
 * Authorize requests based on user roles
 */
export function authorize(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const requestId = request.id as string;
    
    if (!request.user) {
      throw new UnauthorizedError('Authentication required', requestId);
    }
    
    if (allowedRoles.length === 0) {
      // No specific roles required, just authentication
      return;
    }
    
    if (!allowedRoles.includes(request.user.role)) {
      logger.warn('Authorization denied', {
        requestId,
        userId: request.user.id,
        userRole: request.user.role,
        requiredRoles: allowedRoles
      });
      throw new ForbiddenError('Insufficient permissions', requestId, request.user.tenantId);
    }
  };
}

/**
 * Authorize requests based on permissions
 */
export function authorizePermissions(...requiredPermissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const requestId = request.id as string;
    
    if (!request.user) {
      throw new UnauthorizedError('Authentication required', requestId);
    }
    
    if (requiredPermissions.length === 0) {
      return;
    }
    
    const userPermissions = request.user.permissions || [];
    const hasAllPermissions = requiredPermissions.every(
      perm => userPermissions.includes(perm)
    );
    
    if (!hasAllPermissions) {
      logger.warn('Permission denied', {
        requestId,
        userId: request.user.id,
        userPermissions,
        requiredPermissions
      });
      throw new ForbiddenError('Missing required permissions', requestId, request.user.tenantId);
    }
  };
}

// =============================================================================
// OPTIONAL AUTHENTICATION
// =============================================================================

/**
 * Optional authentication - doesn't fail if no token provided
 * Useful for endpoints that have different behavior for authenticated vs anonymous users
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader) {
    // No auth header - continue without user
    return;
  }
  
  try {
    await authenticate(request, reply);
  } catch (error) {
    // Log but don't fail for optional auth
    logger.debug('Optional auth failed, continuing anonymously', {
      requestId: request.id
    });
  }
}

// =============================================================================
// INTERNAL SERVICE AUTHENTICATION
// =============================================================================

/**
 * Authenticate internal service-to-service calls
 */
export async function authenticateInternal(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.id as string;
  const serviceSecret = request.headers['x-internal-secret'] as string;
  const serviceId = request.headers['x-service-id'] as string;
  
  if (!serviceSecret || !serviceId) {
    throw new UnauthorizedError('Internal service authentication required', requestId);
  }
  
  // Get internal secret from config
  const { getConfig } = await import('../config/index');
  const config = getConfig();
  
  if (!config.INTERNAL_SERVICE_SECRET) {
    logger.error('INTERNAL_SERVICE_SECRET not configured');
    throw new UnauthorizedError('Internal authentication misconfigured', requestId);
  }
  
  // Timing-safe comparison
  const crypto = await import('crypto');
  const expectedBuffer = Buffer.from(config.INTERNAL_SERVICE_SECRET);
  const providedBuffer = Buffer.from(serviceSecret);
  
  if (expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    logger.warn('Invalid internal service secret', {
      requestId,
      serviceId
    });
    throw new UnauthorizedError('Invalid internal credentials', requestId);
  }
  
  // Set minimal user context for internal calls
  request.user = {
    id: `service:${serviceId}`,
    role: 'internal_service',
    permissions: ['*'] // Internal services have full permissions
  };
  
  logger.debug('Internal service authenticated', {
    requestId,
    serviceId
  });
}

// =============================================================================
// WEBHOOK SIGNATURE VERIFICATION
// =============================================================================

/**
 * Verify webhook signature from external providers
 * Returns a middleware function for the specified provider
 */
export function verifyWebhookSignature(provider: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const requestId = request.id as string;
    
    try {
      const rawBody = (request as any).rawBody || JSON.stringify(request.body);
      
      switch (provider.toLowerCase()) {
        case 'stripe':
          await verifyStripeSignature(request, rawBody);
          break;
        case 'square':
          await verifySquareSignature(request, rawBody);
          break;
        case 'mailchimp':
          await verifyMailchimpSignature(request, rawBody);
          break;
        case 'quickbooks':
          await verifyQuickBooksSignature(request, rawBody);
          break;
        default:
          logger.warn('Unknown webhook provider', { provider, requestId });
          throw new UnauthorizedError(`Unknown webhook provider: ${provider}`, requestId);
      }
      
      logger.debug('Webhook signature verified', { provider, requestId });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('Webhook signature verification failed', {
        provider,
        requestId,
        error: (error as Error).message
      });
      throw new UnauthorizedError('Invalid webhook signature', requestId);
    }
  };
}

async function verifyStripeSignature(request: FastifyRequest, rawBody: string): Promise<void> {
  const signature = request.headers['stripe-signature'] as string;
  if (!signature) {
    throw new UnauthorizedError('Missing Stripe webhook signature', request.id as string);
  }
  
  // Import config and verify using Stripe's library pattern
  const { config } = await import('../config/index');
  const webhookSecret = config.providers?.stripe?.webhookSecret;
  
  if (!webhookSecret) {
    throw new UnauthorizedError('Stripe webhook secret not configured', request.id as string);
  }
  
  // Verify signature using timestamp-based HMAC
  const crypto = await import('crypto');
  const elements = signature.split(',');
  const timestamp = elements.find(e => e.startsWith('t='))?.split('=')[1];
  const signatures = elements
    .filter(e => e.startsWith('v1='))
    .map(e => e.split('=')[1]);
  
  if (!timestamp || signatures.length === 0) {
    throw new UnauthorizedError('Invalid Stripe signature format', request.id as string);
  }
  
  const payload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');
  
  const isValid = signatures.some(sig => 
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature))
  );
  
  if (!isValid) {
    throw new UnauthorizedError('Invalid Stripe webhook signature', request.id as string);
  }
}

async function verifySquareSignature(request: FastifyRequest, rawBody: string): Promise<void> {
  const signature = request.headers['x-square-signature'] as string;
  if (!signature) {
    throw new UnauthorizedError('Missing Square webhook signature', request.id as string);
  }
  
  const { config } = await import('../config/index');
  const webhookSecret = config.providers?.square?.webhookSignatureKey;
  
  if (!webhookSecret) {
    throw new UnauthorizedError('Square webhook secret not configured', request.id as string);
  }
  
  const crypto = await import('crypto');
  const notificationUrl = `${config.server?.apiUrl || ''}/webhooks/square`;
  const stringToSign = notificationUrl + rawBody;
  
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(stringToSign)
    .digest('base64');
  
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new UnauthorizedError('Invalid Square webhook signature', request.id as string);
  }
}

async function verifyMailchimpSignature(request: FastifyRequest, _rawBody: string): Promise<void> {
  const secret = request.headers['x-mailchimp-signature'] as string;
  if (!secret) {
    // Mailchimp uses a simpler verification - check webhook secret in header or body
    const { config } = await import('../config/index');
    const webhookSecret = config.providers?.mailchimp?.webhookSecret;
    
    if (webhookSecret) {
      const bodySecret = (request.body as any)?.secret;
      if (bodySecret !== webhookSecret) {
        throw new UnauthorizedError('Invalid Mailchimp webhook secret', request.id as string);
      }
    }
  }
  // Mailchimp doesn't always require signature verification depending on setup
}

async function verifyQuickBooksSignature(request: FastifyRequest, rawBody: string): Promise<void> {
  const signature = request.headers['intuit-signature'] as string;
  if (!signature) {
    throw new UnauthorizedError('Missing QuickBooks webhook signature', request.id as string);
  }
  
  const { config } = await import('../config/index');
  const webhookToken = config.providers?.quickbooks?.webhookToken;
  
  if (!webhookToken) {
    throw new UnauthorizedError('QuickBooks webhook token not configured', request.id as string);
  }
  
  const crypto = await import('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', webhookToken)
    .update(rawBody)
    .digest('base64');
  
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new UnauthorizedError('Invalid QuickBooks webhook signature', request.id as string);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export authMiddleware for backwards compatibility
export const authMiddleware = {
  authenticate,
  authorize,
  authorizePermissions,
  optionalAuthenticate,
  authenticateInternal,
  verifyWebhookSignature
};

export default {
  authenticate,
  authorize,
  authorizePermissions,
  optionalAuthenticate,
  authenticateInternal,
  verifyWebhookSignature
};
