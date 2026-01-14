import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import logger from '../utils/logger';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
  venueId?: string;
  permissions: string[];
  iss?: string;  // Issuer
  aud?: string | string[];  // Audience
  iat?: number;
  exp?: number;
  jti?: string;  // JWT ID for tracking
}

// Extend Fastify request to include user context
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
    tenantId?: string;
    correlationId?: string;
  }
}

// Configuration for JWT validation
const JWT_CONFIG = {
  // Expected issuer - should match token issuer
  issuer: process.env.JWT_ISSUER || 'tickettoken-auth-service',
  // Expected audience - this service should be in the audience
  audience: process.env.JWT_AUDIENCE || 'scanning-service',
  // Algorithms allowed (prefer RS256 for production)
  algorithms: (process.env.JWT_ALGORITHMS?.split(',') || ['RS256', 'HS256']) as jwt.Algorithm[],
  // Clock tolerance for time-based checks (seconds)
  clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE || '30', 10),
  // Minimum key length for HS256 (256 bits = 32 bytes)
  minKeyLength: 32,
};

/**
 * Validate JWT secret meets minimum security requirements
 * Fixes S2S-4: Validates key strength for symmetric signing
 */
function validateJWTSecret(secret: string): boolean {
  if (!secret) return false;
  // For HS256, require at least 256 bits (32 bytes)
  if (secret.length < JWT_CONFIG.minKeyLength) {
    logger.warn('JWT_SECRET is too short. Minimum 32 characters required for security.', {
      currentLength: secret.length,
      requiredLength: JWT_CONFIG.minKeyLength
    });
    return false;
  }
  return true;
}

/**
 * Get JWT verification options with issuer and audience validation
 * Fixes S2S-2, S2S-3: Adds issuer and audience validation
 */
function getVerifyOptions(): jwt.VerifyOptions {
  return {
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
    algorithms: JWT_CONFIG.algorithms,
    clockTolerance: JWT_CONFIG.clockTolerance,
    complete: false,
  };
}

/**
 * Get the JWT secret or public key for verification
 * Supports both symmetric (HS256) and asymmetric (RS256) keys
 */
function getJWTSecret(): string | Buffer {
  // First check for RSA public key (preferred for production)
  const publicKey = process.env.JWT_PUBLIC_KEY;
  if (publicKey) {
    // Handle base64 encoded key
    if (publicKey.startsWith('-----BEGIN')) {
      return publicKey;
    }
    return Buffer.from(publicKey, 'base64');
  }

  // Fall back to symmetric secret
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET or JWT_PUBLIC_KEY not configured');
  }

  if (!validateJWTSecret(secret)) {
    logger.error('JWT_SECRET does not meet minimum security requirements');
  }

  return secret;
}

/**
 * Middleware to authenticate requests using JWT tokens
 * SECURITY: All scanning endpoints must use this middleware
 * 
 * Fixes:
 * - S2S-2: JWT issuer validation
 * - S2S-3: JWT audience validation
 * - S2S-4: Key strength validation
 */
export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      return reply.status(401).send({
        type: 'https://api.tickettoken.com/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'No authorization token provided',
        instance: request.url,
        timestamp: new Date().toISOString()
      });
    }

    // Validate Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        type: 'https://api.tickettoken.com/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid authorization header format. Expected: Bearer <token>',
        instance: request.url,
        timestamp: new Date().toISOString()
      });
    }

    const token = authHeader.substring(7); // More efficient than replace

    // Get JWT secret/key
    let jwtKey: string | Buffer;
    try {
      jwtKey = getJWTSecret();
    } catch (error) {
      logger.error('JWT configuration error', { error });
      return reply.status(500).send({
        type: 'https://api.tickettoken.com/errors/configuration-error',
        title: 'Configuration Error',
        status: 500,
        detail: 'Authentication system not properly configured',
        instance: request.url,
        timestamp: new Date().toISOString()
      });
    }

    // Verify and decode JWT token with full validation
    const verifyOptions = getVerifyOptions();
    const payload = jwt.verify(token, jwtKey, verifyOptions) as JWTPayload;

    // Validate required payload fields
    if (!payload.userId || !payload.tenantId || !payload.role) {
      logger.warn('JWT missing required claims', {
        hasUserId: !!payload.userId,
        hasTenantId: !!payload.tenantId,
        hasRole: !!payload.role,
        correlationId: request.correlationId
      });
      
      return reply.status(401).send({
        type: 'https://api.tickettoken.com/errors/invalid-token',
        title: 'Invalid Token',
        status: 401,
        detail: 'Token payload missing required claims',
        instance: request.url,
        timestamp: new Date().toISOString()
      });
    }

    // Validate tenant ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(payload.tenantId)) {
      logger.warn('Invalid tenant ID format in JWT', {
        tenantId: payload.tenantId,
        correlationId: request.correlationId
      });
      
      return reply.status(401).send({
        type: 'https://api.tickettoken.com/errors/invalid-token',
        title: 'Invalid Token',
        status: 401,
        detail: 'Invalid tenant ID format',
        instance: request.url,
        timestamp: new Date().toISOString()
      });
    }

    // Attach user context to request for downstream handlers
    request.user = payload;
    request.tenantId = payload.tenantId;

    const duration = Date.now() - startTime;
    logger.debug('Request authenticated', {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      path: request.url,
      durationMs: duration,
      correlationId: request.correlationId
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof jwt.TokenExpiredError) {
      logger.info('Token expired', {
        path: request.url,
        expiredAt: error.expiredAt,
        correlationId: request.correlationId
      });
      
      return reply.status(401).send({
        type: 'https://api.tickettoken.com/errors/token-expired',
        title: 'Token Expired',
        status: 401,
        detail: 'Token has expired',
        instance: request.url,
        expiredAt: error.expiredAt?.toISOString(),
        timestamp: new Date().toISOString()
      });
    }

    if (error instanceof jwt.NotBeforeError) {
      logger.warn('Token not yet valid', {
        path: request.url,
        notBefore: error.date,
        correlationId: request.correlationId
      });
      
      return reply.status(401).send({
        type: 'https://api.tickettoken.com/errors/token-not-valid-yet',
        title: 'Token Not Valid Yet',
        status: 401,
        detail: 'Token is not yet valid',
        instance: request.url,
        notBefore: error.date?.toISOString(),
        timestamp: new Date().toISOString()
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      // Don't log the full error message as it might contain sensitive info
      logger.warn('Invalid token', {
        path: request.url,
        errorType: error.name,
        correlationId: request.correlationId
      });
      
      return reply.status(401).send({
        type: 'https://api.tickettoken.com/errors/invalid-token',
        title: 'Invalid Token',
        status: 401,
        detail: 'Token validation failed',
        instance: request.url,
        timestamp: new Date().toISOString()
      });
    }

    logger.error('Authentication error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: request.url,
      durationMs: duration,
      correlationId: request.correlationId
    });
    
    return reply.status(401).send({
      type: 'https://api.tickettoken.com/errors/authentication-failed',
      title: 'Authentication Failed',
      status: 401,
      detail: 'Authentication failed',
      instance: request.url,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Middleware factory to require specific roles
 * Examples: requireRole('VENUE_STAFF', 'ADMIN')
 */
export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        type: 'https://api.tickettoken.com/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Not authenticated',
        instance: request.url,
        timestamp: new Date().toISOString()
      });
    }

    // Check if user's role is in the allowed roles list
    if (!allowedRoles.includes(request.user.role)) {
      logger.warn('Insufficient permissions', {
        userId: request.user.userId,
        userRole: request.user.role,
        requiredRoles: allowedRoles,
        path: request.url,
        correlationId: request.correlationId
      });

      return reply.status(403).send({
        type: 'https://api.tickettoken.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Insufficient permissions for this operation',
        instance: request.url,
        required: allowedRoles,
        current: request.user.role,
        timestamp: new Date().toISOString()
      });
    }

    logger.debug('Role check passed', {
      userId: request.user.userId,
      role: request.user.role,
      path: request.url,
      correlationId: request.correlationId
    });
  };
}

/**
 * Middleware to require specific permissions
 * More granular than role-based checks
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        type: 'https://api.tickettoken.com/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Not authenticated',
        instance: request.url,
        timestamp: new Date().toISOString()
      });
    }

    const userPermissions = request.user.permissions || [];

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every(perm => 
      userPermissions.includes(perm)
    );

    if (!hasAllPermissions) {
      const missingPermissions = requiredPermissions.filter(
        perm => !userPermissions.includes(perm)
      );
      
      logger.warn('Missing required permissions', {
        userId: request.user.userId,
        userPermissions,
        requiredPermissions,
        missingPermissions,
        path: request.url,
        correlationId: request.correlationId
      });

      return reply.status(403).send({
        type: 'https://api.tickettoken.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Missing required permissions',
        instance: request.url,
        required: requiredPermissions,
        missing: missingPermissions,
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Optional authentication - sets user if token present but doesn't require it
 * Useful for endpoints that behave differently for authenticated vs anonymous users
 */
export async function optionalAuthentication(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided - continue without user context
    return;
  }

  try {
    const token = authHeader.substring(7);
    
    let jwtKey: string | Buffer;
    try {
      jwtKey = getJWTSecret();
    } catch (error) {
      logger.warn('JWT not configured for optional auth', { correlationId: request.correlationId });
      return;
    }

    const verifyOptions = getVerifyOptions();
    const payload = jwt.verify(token, jwtKey, verifyOptions) as JWTPayload;
    
    // Validate tenant ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (payload.tenantId && uuidRegex.test(payload.tenantId)) {
      request.user = payload;
      request.tenantId = payload.tenantId;
    }

  } catch (error) {
    // Token is invalid but auth is optional - log and continue
    logger.debug('Optional auth failed', { 
      error: error instanceof Error ? error.message : 'Unknown',
      correlationId: request.correlationId
    });
  }
}

/**
 * Internal service-to-service authentication
 * Used for trusted internal service calls
 */
export async function authenticateInternalService(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serviceKey = request.headers['x-service-key'] as string;
  const serviceName = request.headers['x-service-name'] as string;
  
  if (!serviceKey || !serviceName) {
    return reply.status(401).send({
      type: 'https://api.tickettoken.com/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Missing service credentials',
      instance: request.url,
      timestamp: new Date().toISOString()
    });
  }

  const expectedKey = process.env.INTERNAL_SERVICE_KEY;
  const allowedServices = (process.env.ALLOWED_INTERNAL_SERVICES || '').split(',');
  
  if (!expectedKey) {
    logger.error('INTERNAL_SERVICE_KEY not configured');
    return reply.status(500).send({
      type: 'https://api.tickettoken.com/errors/configuration-error',
      title: 'Configuration Error',
      status: 500,
      detail: 'Internal authentication not configured',
      instance: request.url,
      timestamp: new Date().toISOString()
    });
  }

  // Use timing-safe comparison to prevent timing attacks
  const keyBuffer = Buffer.from(serviceKey);
  const expectedBuffer = Buffer.from(expectedKey);
  
  if (keyBuffer.length !== expectedBuffer.length || 
      !crypto.timingSafeEqual(keyBuffer, expectedBuffer)) {
    logger.warn('Invalid service key', {
      serviceName,
      correlationId: request.correlationId
    });
    
    return reply.status(401).send({
      type: 'https://api.tickettoken.com/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Invalid service credentials',
      instance: request.url,
      timestamp: new Date().toISOString()
    });
  }

  if (!allowedServices.includes(serviceName)) {
    logger.warn('Service not in allowed list', {
      serviceName,
      correlationId: request.correlationId
    });
    
    return reply.status(403).send({
      type: 'https://api.tickettoken.com/errors/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Service not authorized',
      instance: request.url,
      timestamp: new Date().toISOString()
    });
  }

  logger.debug('Internal service authenticated', {
    serviceName,
    correlationId: request.correlationId
  });
}
