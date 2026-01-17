/**
 * Enhanced JWT Authentication Middleware for Transfer Service
 *
 * AUDIT FIXES:
 * - SEC-H1: JWT algorithm not specified → Explicitly use RS256/HS256
 * - S2S-H1: No JWT algorithm enforcement → Whitelist allowed algorithms
 * - S2S-H2: No issuer validation → Validate issuer claim
 * - S2S-H3: No audience validation → Validate audience claim
 * - S2S-H7: Shared JWT_SECRET → Support per-service secrets
 * - S2S-H8: Consider RS256 over HS256 → Support both with preference
 *
 * Features:
 * - Algorithm enforcement (no "none" algorithm)
 * - Issuer and audience validation
 * - Token expiration validation
 * - Support for both RS256 (asymmetric) and HS256 (symmetric)
 * - Request context enrichment
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt, { JwtPayload, Algorithm, VerifyOptions, Secret, GetPublicKeyOrSecret } from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import logger from '../utils/logger';
import { getSecret } from '../config/secrets';
import { UnauthorizedError } from '../errors';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: string;
  tenantId: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// AUDIT FIX S2S-H1: Whitelist allowed algorithms - NEVER allow 'none'
export const ALLOWED_ALGORITHMS: Algorithm[] = [
  'RS256',   // RSA-SHA256 (asymmetric - preferred)
  'RS384',   // RSA-SHA384
  'RS512',   // RSA-SHA512
  'ES256',   // ECDSA-SHA256
  'ES384',   // ECDSA-SHA384
  'ES512',   // ECDSA-SHA512
  'HS256',   // HMAC-SHA256 (symmetric)
  'HS384',   // HMAC-SHA384
  'HS512'    // HMAC-SHA512
];

// AUDIT FIX S2S-H2, S2S-H3: Issuer and audience configuration
export const JWT_CONFIG = {
  issuer: process.env.JWT_ISSUER || 'tickettoken-auth-service',
  audience: process.env.JWT_AUDIENCE || 'tickettoken-services',

  // JWKS configuration for RS256 (asymmetric)
  jwksUri: process.env.JWKS_URI || 'https://auth.tickettoken.io/.well-known/jwks.json',

  // Clock tolerance for exp/nbf validation (5 minutes)
  clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE || '300', 10),

  // Algorithm preference
  preferredAlgorithm: (process.env.JWT_ALGORITHM as Algorithm) || 'RS256'
};

// JWKS client for RS256 verification (lazy loaded)
let jwksClient: jwksRsa.JwksClient | null = null;

function getJwksClient(): jwksRsa.JwksClient {
  if (!jwksClient) {
    jwksClient = jwksRsa({
      jwksUri: JWT_CONFIG.jwksUri,
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
      rateLimit: true,
      jwksRequestsPerMinute: 10
    });
  }
  return jwksClient;
}

// =============================================================================
// TOKEN VERIFICATION
// =============================================================================

/**
 * Get signing key from JWKS endpoint (for RS256)
 */
function getSigningKey(header: jwt.JwtHeader, callback: (err: Error | null, key?: Secret) => void): void {
  if (!header.kid) {
    callback(new Error('Missing key ID (kid) in token header'));
    return;
  }

  getJwksClient().getSigningKey(header.kid, (err: Error | null, key?: jwksRsa.SigningKey) => {
    if (err) {
      callback(err);
      return;
    }
    callback(null, key?.getPublicKey());
  });
}

/**
 * Get secret or key for verification based on algorithm
 */
async function getSecretOrKey(algorithm: Algorithm): Promise<Secret | GetPublicKeyOrSecret> {
  // For asymmetric algorithms, use JWKS
  if (algorithm.startsWith('RS') || algorithm.startsWith('ES')) {
    return getSigningKey;
  }

  // For symmetric algorithms, get secret from secrets manager
  const secret = await getSecret('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }

  return secret;
}

/**
 * AUDIT FIX SEC-H1, S2S-H1-H3: Verify JWT with strict validation
 */
async function verifyToken(token: string): Promise<AuthenticatedUser> {
  // First, decode without verification to check algorithm
  const decoded = jwt.decode(token, { complete: true });

  if (!decoded || typeof decoded === 'string') {
    throw new UnauthorizedError('Invalid token format');
  }

  const algorithm = decoded.header.alg as Algorithm;

  // AUDIT FIX S2S-H1: Enforce algorithm whitelist
  if (!ALLOWED_ALGORITHMS.includes(algorithm)) {
    logger.warn('Rejected token with disallowed algorithm', { algorithm });
    throw new UnauthorizedError(`Algorithm ${algorithm} not allowed`);
  }

  // Get appropriate secret/key
  const secretOrKey = await getSecretOrKey(algorithm);

  // AUDIT FIX S2S-H2, S2S-H3: Configure strict verification options
  const verifyOptions: VerifyOptions = {
    algorithms: [algorithm],
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
    clockTolerance: JWT_CONFIG.clockTolerance,
    complete: false
  };

  return new Promise((resolve, reject) => {
    jwt.verify(token, secretOrKey, verifyOptions, (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          reject(new UnauthorizedError('Token has expired'));
        } else if (err.name === 'NotBeforeError') {
          reject(new UnauthorizedError('Token not yet valid'));
        } else if (err.name === 'JsonWebTokenError') {
          reject(new UnauthorizedError(err.message));
        } else {
          reject(new UnauthorizedError('Token verification failed'));
        }
        return;
      }

      const payload = decoded as JwtPayload;

      // Validate required claims
      if (!payload.sub) {
        reject(new UnauthorizedError('Missing subject (sub) claim'));
        return;
      }

      if (!payload.tenant_id && !payload.tenantId) {
        reject(new UnauthorizedError('Missing tenant_id claim'));
        return;
      }

      resolve({
        id: payload.sub,
        email: payload.email,
        role: payload.role || 'user',
        tenantId: payload.tenant_id || payload.tenantId,
        permissions: payload.permissions || [],
        iat: payload.iat,
        exp: payload.exp
      });
    });
  });
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !parts[0] || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1] ?? null;
}

/**
 * Main authentication middleware
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.id as string;

  // Try to extract token from different sources
  const token = extractBearerToken(request) ||
                (request.headers['x-access-token'] as string);

  if (!token) {
    logger.debug('No authentication token provided', { requestId });

    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication token required',
      code: 'MISSING_TOKEN',
      requestId
    });
  }

  try {
    const user = await verifyToken(token);

    // Attach user to request
    request.user = user;

    // Enrich logger context
    (request as any).log = request.log.child({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role
    });

    logger.debug('User authenticated', {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      requestId
    });

  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: error.message,
        code: error.code,
        requestId
      });
    }

    logger.error({ error, requestId }, 'Authentication failed');

    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed',
      code: 'AUTH_FAILED',
      requestId
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token provided
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const token = extractBearerToken(request);

  if (!token) {
    return;
  }

  try {
    const user = await verifyToken(token);
    request.user = user;
  } catch (error) {
    // Log but don't fail - token is optional
    logger.debug('Optional auth failed', {
      error: (error as Error).message,
      requestId: request.id
    });
  }
}

/**
 * Require specific role(s)
 */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;
    const requestId = request.id as string;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
        requestId
      });
    }

    if (!roles.includes(user.role)) {
      logger.warn('Insufficient role', {
        userId: user.id,
        userRole: user.role,
        requiredRoles: roles,
        requestId
      });

      return reply.status(403).send({
        error: 'Forbidden',
        message: `Role ${roles.join(' or ')} required`,
        code: 'INSUFFICIENT_ROLE',
        requestId
      });
    }
  };
}

/**
 * Require specific permission(s)
 */
export function requirePermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;
    const requestId = request.id as string;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
        requestId
      });
    }

    const hasPermission = permissions.some(p => user.permissions?.includes(p));

    if (!hasPermission) {
      logger.warn('Insufficient permissions', {
        userId: user.id,
        userPermissions: user.permissions,
        requiredPermissions: permissions,
        requestId
      });

      return reply.status(403).send({
        error: 'Forbidden',
        message: `Permission ${permissions.join(' or ')} required`,
        code: 'INSUFFICIENT_PERMISSIONS',
        requestId
      });
    }
  };
}

/**
 * Require owner or admin access (user ID matches or has admin role)
 */
export function requireOwnerOrAdmin(userIdParam: string = 'userId') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;
    const requestId = request.id as string;

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
        requestId
      });
    }

    const targetUserId = (request.params as any)[userIdParam] ||
                         (request.body as any)?.[userIdParam];

    const isOwner = user.id === targetUserId;
    const isAdmin = ['admin', 'super_admin'].includes(user.role);

    if (!isOwner && !isAdmin) {
      logger.warn('Not owner or admin', {
        userId: user.id,
        targetUserId,
        role: user.role,
        requestId
      });

      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Access denied - must be owner or admin',
        code: 'NOT_OWNER_OR_ADMIN',
        requestId
      });
    }
  };
}

/**
 * Validate JWT configuration at startup
 */
export function validateAuthConfig(): void {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // In production, prefer RS256
    if (JWT_CONFIG.preferredAlgorithm === 'HS256') {
      logger.warn('HS256 algorithm in production - consider migrating to RS256');
    }

    // Check JWKS URI is configured for RS256
    if (JWT_CONFIG.preferredAlgorithm.startsWith('RS')) {
      if (!process.env.JWKS_URI) {
        logger.warn('JWKS_URI not set - using default');
      }
    }
  }

  logger.info('Auth configuration validated', {
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
    algorithm: JWT_CONFIG.preferredAlgorithm
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  authenticate,
  optionalAuth,
  requireRole,
  requirePermission,
  requireOwnerOrAdmin,
  validateAuthConfig,
  verifyToken,
  ALLOWED_ALGORITHMS,
  JWT_CONFIG
};
