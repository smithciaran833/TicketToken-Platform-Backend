/**
 * Authentication Middleware
 * 
 * AUDIT FIX: SEC-4 - JWT algorithm whitelist
 * AUDIT FIX: S2S-4 - Issuer (iss) claim validation
 * AUDIT FIX: S2S-5 - Audience (aud) claim validation
 * AUDIT FIX: LOG-4 - Security event logging
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { AuthenticationError, toProblemDetails } from '../errors';

// =============================================================================
// CONFIGURATION
// =============================================================================

// AUDIT FIX: SEC-4 - Only allow secure algorithms (no 'none', no weak algorithms)
const ALLOWED_ALGORITHMS: jwt.Algorithm[] = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512'];

// AUDIT FIX: S2S-4 - Expected issuer
const EXPECTED_ISSUER = process.env.JWT_ISSUER || 'tickettoken-auth-service';

// AUDIT FIX: S2S-5 - Expected audience  
const EXPECTED_AUDIENCE = process.env.JWT_AUDIENCE || 'blockchain-indexer';

// =============================================================================
// TYPES
// =============================================================================

interface JWTPayload {
  userId: string;
  tenant_id?: string;
  serviceId?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  [key: string]: any;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

// =============================================================================
// SECURITY EVENT LOGGING
// =============================================================================

/**
 * AUDIT FIX: LOG-4 - Log security-relevant auth events
 */
function logSecurityEvent(
  event: string,
  request: FastifyRequest,
  details: Record<string, any> = {}
): void {
  logger.warn({
    event,
    security: true,
    ip: request.ip,
    method: request.method,
    path: request.url,
    userAgent: request.headers['user-agent'],
    requestId: request.id,
    ...details
  }, `Security event: ${event}`);
}

// =============================================================================
// JWT VERIFICATION MIDDLEWARE
// =============================================================================

/**
 * Verify JWT token with security best practices
 */
export async function verifyJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      logSecurityEvent('AUTH_MISSING_HEADER', request);
      const error = AuthenticationError.missingToken();
      return reply.code(error.statusCode).send(
        toProblemDetails(error, request.id, request.url)
      );
    }
    
    const [bearer, token] = authHeader.split(' ');
    
    if (bearer !== 'Bearer' || !token) {
      logSecurityEvent('AUTH_INVALID_FORMAT', request);
      const error = AuthenticationError.invalidToken('Invalid authorization format');
      return reply.code(error.statusCode).send(
        toProblemDetails(error, request.id, request.url)
      );
    }
    
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      const error = AuthenticationError.invalidToken('Server configuration error');
      return reply.code(500).send(
        toProblemDetails(error, request.id, request.url)
      );
    }

    // Detect weak secrets in development
    if (process.env.NODE_ENV !== 'test') {
      if (jwtSecret.length < 32 || /^(secret|password|jwt)/i.test(jwtSecret)) {
        logger.warn({ event: 'WEAK_JWT_SECRET' }, 'JWT_SECRET appears to be weak - use a strong random value in production');
      }
    }
    
    // AUDIT FIX: SEC-4 - Verify with algorithm whitelist
    // AUDIT FIX: S2S-4, S2S-5 - Verify issuer and audience
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ALLOWED_ALGORITHMS,
      issuer: EXPECTED_ISSUER,
      audience: EXPECTED_AUDIENCE,
      complete: false
    }) as JWTPayload;

    // Additional validation
    if (!decoded.userId && !decoded.serviceId) {
      logSecurityEvent('AUTH_MISSING_IDENTITY', request, {
        hasUserId: !!decoded.userId,
        hasServiceId: !!decoded.serviceId
      });
      const error = AuthenticationError.invalidToken('Token missing required identity claims');
      return reply.code(error.statusCode).send(
        toProblemDetails(error, request.id, request.url)
      );
    }

    // Attach decoded payload to request
    request.user = decoded;
    
    // Log successful auth for audit trail (debug level to avoid noise)
    logger.debug({
      userId: decoded.userId,
      serviceId: decoded.serviceId,
      tenant_id: decoded.tenant_id,
      requestId: request.id
    }, 'JWT verified successfully');
    
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logSecurityEvent('AUTH_TOKEN_EXPIRED', request);
      const authError = AuthenticationError.tokenExpired();
      return reply.code(authError.statusCode).send(
        toProblemDetails(authError, request.id, request.url)
      );
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      logSecurityEvent('AUTH_INVALID_TOKEN', request, {
        errorMessage: error.message
      });
      const authError = AuthenticationError.invalidToken(error.message);
      return reply.code(authError.statusCode).send(
        toProblemDetails(authError, request.id, request.url)
      );
    }

    if (error instanceof jwt.NotBeforeError) {
      logSecurityEvent('AUTH_TOKEN_NOT_ACTIVE', request);
      const authError = AuthenticationError.invalidToken('Token not yet active');
      return reply.code(authError.statusCode).send(
        toProblemDetails(authError, request.id, request.url)
      );
    }
    
    logSecurityEvent('AUTH_UNKNOWN_ERROR', request, {
      errorMessage: (error as Error).message
    });
    logger.error({ error }, 'JWT verification error');
    const authError = AuthenticationError.invalidToken('Authentication failed');
    return reply.code(authError.statusCode).send(
      toProblemDetails(authError, request.id, request.url)
    );
  }
}

/**
 * Optional JWT verification - doesn't fail if no token provided
 */
export async function optionalJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  
  // Skip if no auth header
  if (!authHeader) {
    return;
  }
  
  // If header present, validate it
  return verifyJWT(request, reply);
}

/**
 * Verify JWT for internal service-to-service calls
 * More permissive - only requires serviceId
 */
export async function verifyServiceJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      const error = AuthenticationError.missingToken();
      return reply.code(error.statusCode).send(
        toProblemDetails(error, request.id, request.url)
      );
    }
    
    const [bearer, token] = authHeader.split(' ');
    
    if (bearer !== 'Bearer' || !token) {
      const error = AuthenticationError.invalidToken('Invalid authorization format');
      return reply.code(error.statusCode).send(
        toProblemDetails(error, request.id, request.url)
      );
    }
    
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return reply.code(500).send({
        type: 'https://api.tickettoken.com/errors/SERVER_ERROR',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Server configuration error'
      });
    }
    
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ALLOWED_ALGORITHMS,
      complete: false
    }) as JWTPayload;

    // Service tokens must have serviceId
    if (!decoded.serviceId) {
      logSecurityEvent('AUTH_NOT_SERVICE_TOKEN', request);
      const error = AuthenticationError.insufficientPermissions('Not a service token');
      return reply.code(error.statusCode).send(
        toProblemDetails(error, request.id, request.url)
      );
    }

    request.user = decoded;
    (request as any).internalService = decoded.serviceId;
    
    logger.debug({
      serviceId: decoded.serviceId,
      requestId: request.id
    }, 'Service JWT verified');
    
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      const authError = AuthenticationError.tokenExpired();
      return reply.code(authError.statusCode).send(
        toProblemDetails(authError, request.id, request.url)
      );
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      const authError = AuthenticationError.invalidToken(error.message);
      return reply.code(authError.statusCode).send(
        toProblemDetails(authError, request.id, request.url)
      );
    }
    
    logger.error({ error }, 'Service JWT verification error');
    const authError = AuthenticationError.invalidToken('Authentication failed');
    return reply.code(authError.statusCode).send(
      toProblemDetails(authError, request.id, request.url)
    );
  }
}
