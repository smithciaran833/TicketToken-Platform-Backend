import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { verifyServiceToken, verifyApiKey, isTrustedService } from '../config/service-auth';

// Load RSA public key for token verification
const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH ||
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-public.pem');

let publicKey: string;

try {
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  console.log('✓ Event Service: JWT public key loaded for token verification');
} catch (error) {
  console.error('✗ Event Service: Failed to load JWT public key:', error);
  throw new Error('JWT public key not found: ' + publicKeyPath);
}

interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
  jti: string;
  tenant_id: string;
  email?: string;
  permissions?: string[];
  role?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

/**
 * IA4: Request context type - differentiates user vs service requests
 */
export type RequestSource = 'user' | 'service' | 'internal';

/**
 * IA4: Extended request context with source information
 */
export interface AuthContext {
  /** User ID (for user requests) or Service ID (for service requests) */
  id: string;
  sub: string;
  /** Tenant ID */
  tenant_id: string;
  /** Request source type */
  source: RequestSource;
  /** Service ID if this is a service request */
  serviceId?: string;
  /** User email (user requests only) */
  email?: string;
  /** User permissions */
  permissions: string[];
  /** User role */
  role: string;
  /** Whether this request bypasses certain checks (for trusted services) */
  isInternalRequest: boolean;
}

// Fastify authentication middleware - verifies JWT locally
export async function authenticateFastify(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, publicKey, {
      issuer: process.env.JWT_ISSUER || 'tickettoken',
      audience: process.env.JWT_AUDIENCE || process.env.JWT_ISSUER || 'tickettoken',
      algorithms: ['RS256'],
    }) as TokenPayload;

    // Validate it's an access token
    if (decoded.type !== 'access') {
      return reply.status(401).send({ error: 'Invalid token type' });
    }

    // Validate tenant_id is present
    if (!decoded.tenant_id) {
      return reply.status(401).send({ error: 'Invalid token - missing tenant context' });
    }

    // Attach user data to request
    (request as any).user = {
      id: decoded.sub,
      sub: decoded.sub,
      tenant_id: decoded.tenant_id,
      email: decoded.email,
      permissions: decoded.permissions || [],
      role: decoded.role || 'user',
    };

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return reply.status(401).send({ error: 'Token expired' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return reply.status(401).send({ error: 'Invalid token' });
    }
    return reply.status(401).send({ error: 'Authentication failed' });
  }
}

// Export as default authenticate function
export const authenticate = authenticateFastify;

/**
 * Middleware to require admin role
 * CRITICAL FIX for audit finding: Missing admin authorization (RO3)
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as any).user;
  
  if (!user) {
    return reply.status(401).send({ 
      error: 'Authentication required',
      code: 'UNAUTHORIZED'
    });
  }
  
  if (user.role !== 'admin') {
    return reply.status(403).send({ 
      error: 'Admin access required',
      code: 'FORBIDDEN',
      message: 'This action requires admin privileges'
    });
  }
}

/**
 * Middleware factory to require specific roles
 * Usage: requireRole(['admin', 'venue_owner'])
 */
export function requireRole(allowedRoles: string[]) {
  return async function(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = (request as any).user;
    
    if (!user) {
      return reply.status(401).send({ 
        error: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }
    
    if (!allowedRoles.includes(user.role)) {
      return reply.status(403).send({ 
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        message: `This action requires one of these roles: ${allowedRoles.join(', ')}`
      });
    }
  };
}

/**
 * Check if user is admin (helper for service layer)
 */
export function isAdmin(user: any): boolean {
  return user?.role === 'admin';
}

/**
 * Check if user has one of the specified roles
 */
export function hasRole(user: any, roles: string[]): boolean {
  return roles.includes(user?.role);
}

/**
 * IA4: Check if request is from another service (not a user)
 */
export function isServiceRequest(request: FastifyRequest): boolean {
  const user = (request as any).user as AuthContext | undefined;
  return user?.source === 'service';
}

/**
 * IA4: Check if request is internal (from trusted service with elevated privileges)
 */
export function isInternalRequest(request: FastifyRequest): boolean {
  const user = (request as any).user as AuthContext | undefined;
  return user?.isInternalRequest === true;
}

/**
 * IA4: Get the request source type
 */
export function getRequestSource(request: FastifyRequest): RequestSource {
  const user = (request as any).user as AuthContext | undefined;
  return user?.source || 'user';
}

/**
 * IA4: Middleware that authenticates both users AND services
 * 
 * This middleware checks in order:
 * 1. X-Service-Token header (for S2S requests)
 * 2. X-API-Key header (for S2S requests)
 * 3. Authorization Bearer token (for user requests)
 * 
 * Sets request.user with source type for downstream code to differentiate.
 */
export async function authenticateUserOrService(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Check for service token first (S2S authentication)
  const serviceToken = request.headers['x-service-token'] as string | undefined;
  const apiKey = request.headers['x-api-key'] as string | undefined;
  const tenantIdHeader = request.headers['x-tenant-id'] as string | undefined;

  // Try service token authentication
  if (serviceToken) {
    const result = verifyServiceToken(serviceToken);
    if (result.valid && result.serviceId) {
      const isTrusted = isTrustedService(result.serviceId);
      
      (request as any).user = {
        id: result.serviceId,
        sub: result.serviceId,
        tenant_id: tenantIdHeader || 'system',
        source: 'service' as RequestSource,
        serviceId: result.serviceId,
        permissions: ['*'], // Services have full permissions
        role: 'service',
        isInternalRequest: isTrusted,
      } as AuthContext;
      
      return;
    }
  }

  // Try API key authentication
  if (apiKey) {
    const result = verifyApiKey(apiKey);
    if (result.valid && result.serviceId) {
      const isTrusted = isTrustedService(result.serviceId);
      
      (request as any).user = {
        id: result.serviceId,
        sub: result.serviceId,
        tenant_id: tenantIdHeader || 'system',
        source: 'service' as RequestSource,
        serviceId: result.serviceId,
        permissions: ['*'],
        role: 'service',
        isInternalRequest: isTrusted,
      } as AuthContext;
      
      return;
    }
  }

  // Fall back to user JWT authentication
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ 
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
      message: 'Provide either Bearer token, X-Service-Token, or X-API-Key'
    });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, publicKey, {
      issuer: process.env.JWT_ISSUER || 'tickettoken',
      audience: process.env.JWT_AUDIENCE || process.env.JWT_ISSUER || 'tickettoken',
      algorithms: ['RS256'],
    }) as TokenPayload;

    if (decoded.type !== 'access') {
      return reply.status(401).send({ error: 'Invalid token type' });
    }

    if (!decoded.tenant_id) {
      return reply.status(401).send({ error: 'Invalid token - missing tenant context' });
    }

    // User authentication - set source as 'user'
    (request as any).user = {
      id: decoded.sub,
      sub: decoded.sub,
      tenant_id: decoded.tenant_id,
      source: 'user' as RequestSource,
      email: decoded.email,
      permissions: decoded.permissions || [],
      role: decoded.role || 'user',
      isInternalRequest: false,
    } as AuthContext;

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return reply.status(401).send({ error: 'Token expired' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return reply.status(401).send({ error: 'Invalid token' });
    }
    return reply.status(401).send({ error: 'Authentication failed' });
  }
}

/**
 * IA4: Middleware to allow ONLY service requests (blocks user requests)
 */
export async function requireServiceAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // First authenticate
  await authenticateUserOrService(request, reply);
  
  // Check if response was already sent (authentication failed)
  if (reply.sent) return;
  
  const user = (request as any).user as AuthContext;
  
  if (user.source !== 'service') {
    return reply.status(403).send({
      error: 'Service authentication required',
      code: 'FORBIDDEN',
      message: 'This endpoint only accepts service-to-service requests'
    });
  }
}

/**
 * IA4: Middleware to allow ONLY trusted internal services
 */
export async function requireInternalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // First authenticate
  await authenticateUserOrService(request, reply);
  
  if (reply.sent) return;
  
  const user = (request as any).user as AuthContext;
  
  if (!user.isInternalRequest) {
    return reply.status(403).send({
      error: 'Internal service authentication required',
      code: 'FORBIDDEN',
      message: 'This endpoint only accepts requests from trusted internal services'
    });
  }
}
