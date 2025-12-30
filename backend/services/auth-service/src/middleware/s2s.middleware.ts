/**
 * Service-to-Service (S2S) Authentication Middleware
 * 
 * Verifies that requests from internal services are authenticated.
 * Services must include an x-service-token header with a valid JWT.
 */

import jwt from 'jsonwebtoken';
import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface ServiceTokenPayload {
  sub: string;        // Service name (e.g., 'ticket-service', 'payment-service')
  type: 'service';
  iat: number;
  exp: number;
}

// Allowlist of services and their permitted endpoints
const serviceAllowlist: Record<string, string[]> = {
  'ticket-service': [
    '/auth/verify',
    '/auth/internal/validate-permissions',
  ],
  'payment-service': [
    '/auth/verify',
    '/auth/internal/validate-permissions',
  ],
  'event-service': [
    '/auth/verify',
    '/auth/internal/validate-permissions',
  ],
  'notification-service': [
    '/auth/verify',
  ],
  'api-gateway': [
    '/auth/verify',
    '/auth/internal/*',  // Gateway can access all internal endpoints
  ],
};

/**
 * Get the service public key for verifying S2S tokens
 * In production, this would come from secrets manager or JWKS endpoint
 */
function getServicePublicKey(): string {
  // Use same key as user JWTs for simplicity, or configure separate key
  const key = process.env.S2S_PUBLIC_KEY || process.env.JWT_PUBLIC_KEY;
  
  if (!key) {
    throw new Error('S2S_PUBLIC_KEY or JWT_PUBLIC_KEY not configured');
  }
  
  // Decode if base64
  if (!key.includes('-----BEGIN')) {
    return Buffer.from(key, 'base64').toString('utf8');
  }
  return key;
}

/**
 * Check if a service is allowed to access an endpoint
 */
function isServiceAllowed(serviceName: string, endpoint: string): boolean {
  const allowedEndpoints = serviceAllowlist[serviceName];
  
  if (!allowedEndpoints) {
    return false;
  }
  
  return allowedEndpoints.some(pattern => {
    if (pattern.endsWith('/*')) {
      // Wildcard match
      const prefix = pattern.slice(0, -2);
      return endpoint.startsWith(prefix);
    }
    return endpoint === pattern;
  });
}

/**
 * Middleware to verify S2S tokens for internal endpoints
 */
export async function verifyServiceToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serviceToken = request.headers['x-service-token'] as string;
  
  if (!serviceToken) {
    logger.warn('S2S request missing service token', {
      path: request.url,
      ip: request.ip,
    });
    
    return reply.status(401).send({
      error: 'Service authentication required',
      code: 'MISSING_SERVICE_TOKEN',
    });
  }
  
  try {
    const publicKey = getServicePublicKey();
    
    const decoded = jwt.verify(serviceToken, publicKey, {
      algorithms: ['RS256'],
    }) as ServiceTokenPayload;
    
    // Verify token type
    if (decoded.type !== 'service') {
      throw new Error('Invalid token type');
    }
    
    // Check allowlist
    const endpoint = request.url.split('?')[0]; // Remove query string
    if (!isServiceAllowed(decoded.sub, endpoint)) {
      logger.warn('Service not allowed to access endpoint', {
        service: decoded.sub,
        endpoint,
      });
      
      return reply.status(403).send({
        error: 'Service not authorized for this endpoint',
        code: 'SERVICE_NOT_ALLOWED',
      });
    }
    
    // Attach service info to request
    (request as any).service = {
      name: decoded.sub,
      authenticated: true,
    };
    
    logger.debug('S2S authentication successful', {
      service: decoded.sub,
      endpoint,
    });
    
  } catch (error: any) {
    logger.warn('S2S token verification failed', {
      error: error.message,
      path: request.url,
    });
    
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({
        error: 'Service token expired',
        code: 'SERVICE_TOKEN_EXPIRED',
      });
    }
    
    return reply.status(401).send({
      error: 'Invalid service token',
      code: 'INVALID_SERVICE_TOKEN',
    });
  }
}

/**
 * Middleware that allows EITHER user auth OR service auth
 * Useful for endpoints that can be called by users or internal services
 */
export function allowUserOrService(
  userAuthMiddleware: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const hasServiceToken = !!request.headers['x-service-token'];
    const hasUserToken = !!request.headers.authorization;
    
    if (hasServiceToken) {
      // Try S2S auth
      await verifyServiceToken(request, reply);
    } else if (hasUserToken) {
      // Try user auth
      await userAuthMiddleware(request, reply);
    } else {
      return reply.status(401).send({
        error: 'Authentication required',
        code: 'NO_AUTH_TOKEN',
      });
    }
  };
}

/**
 * Generate a service token (for use by internal services)
 * This would typically be called during service startup
 */
export async function generateServiceToken(serviceName: string): Promise<string> {
  const privateKey = process.env.S2S_PRIVATE_KEY || process.env.JWT_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('S2S_PRIVATE_KEY or JWT_PRIVATE_KEY not configured');
  }
  
  // Decode if base64
  const key = !privateKey.includes('-----BEGIN')
    ? Buffer.from(privateKey, 'base64').toString('utf8')
    : privateKey;
  
  const token = jwt.sign(
    {
      sub: serviceName,
      type: 'service',
    },
    key,
    {
      algorithm: 'RS256',
      expiresIn: '24h',
    }
  );
  
  return token;
}

/**
 * Get the list of allowed services (for documentation/debugging)
 */
export function getAllowedServices(): Record<string, string[]> {
  return { ...serviceAllowlist };
}
