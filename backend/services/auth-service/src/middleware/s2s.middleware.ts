/**
 * Service-to-Service (S2S) Authentication Middleware
 *
 * Verifies that requests from internal services are authenticated.
 * Services must include an x-service-token header with a valid JWT.
 * 
 * SECURITY: Uses SEPARATE keys from user JWTs to limit blast radius
 * if one key is compromised.
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
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

// S2S Key Manager - keeps keys separate from user JWT keys
class S2SKeyManager {
  private privateKey: string | null = null;
  private publicKey: string | null = null;
  private initialized = false;
  private usingFallback = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (env.isProduction) {
      await this.loadFromEnvironment();
    } else {
      await this.loadForDevelopment();
    }

    this.initialized = true;
  }

  private async loadFromEnvironment(): Promise<void> {
    // In production, S2S keys MUST be separate from JWT keys
    if (!env.S2S_PRIVATE_KEY || !env.S2S_PUBLIC_KEY) {
      throw new Error('S2S_PRIVATE_KEY and S2S_PUBLIC_KEY are required in production');
    }

    this.privateKey = this.decodeKey(env.S2S_PRIVATE_KEY);
    this.publicKey = this.decodeKey(env.S2S_PUBLIC_KEY);

    logger.info('S2S keys loaded from environment (separate from JWT keys)');
  }

  private async loadForDevelopment(): Promise<void> {
    // Try to load dedicated S2S keys first
    if (env.S2S_PRIVATE_KEY && env.S2S_PUBLIC_KEY) {
      this.privateKey = this.decodeKey(env.S2S_PRIVATE_KEY);
      this.publicKey = this.decodeKey(env.S2S_PUBLIC_KEY);
      logger.info('S2S keys loaded from environment');
      return;
    }

    // Try filesystem
    try {
      this.privateKey = fs.readFileSync(env.S2S_PRIVATE_KEY_PATH, 'utf8');
      this.publicKey = fs.readFileSync(env.S2S_PUBLIC_KEY_PATH, 'utf8');
      logger.info('S2S keys loaded from filesystem');
      return;
    } catch {
      // Filesystem keys not found
    }

    // Development fallback: use JWT keys (with warning)
    logger.warn('⚠️  S2S keys not configured - falling back to JWT keys. Generate separate S2S keys for production!');
    this.usingFallback = true;

    if (env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEY) {
      this.privateKey = this.decodeKey(env.JWT_PRIVATE_KEY);
      this.publicKey = this.decodeKey(env.JWT_PUBLIC_KEY);
      return;
    }

    // Try JWT key files
    try {
      this.privateKey = fs.readFileSync(env.JWT_PRIVATE_KEY_PATH, 'utf8');
      this.publicKey = fs.readFileSync(env.JWT_PUBLIC_KEY_PATH, 'utf8');
    } catch {
      throw new Error(
        'No S2S or JWT keys found. Generate keys with:\n' +
        'openssl genrsa -out ~/tickettoken-secrets/s2s-private.pem 4096\n' +
        'openssl rsa -in ~/tickettoken-secrets/s2s-private.pem -pubout -out ~/tickettoken-secrets/s2s-public.pem'
      );
    }
  }

  private decodeKey(key: string): string {
    if (!key.includes('-----BEGIN')) {
      return Buffer.from(key, 'base64').toString('utf8');
    }
    return key;
  }

  getPrivateKey(): string {
    if (!this.privateKey) {
      throw new Error('S2S keys not initialized');
    }
    return this.privateKey;
  }

  getPublicKey(): string {
    if (!this.publicKey) {
      throw new Error('S2S keys not initialized');
    }
    return this.publicKey;
  }

  isUsingFallback(): boolean {
    return this.usingFallback;
  }
}

const s2sKeyManager = new S2SKeyManager();

/**
 * Initialize S2S key manager (call during app startup)
 */
export async function initS2SKeys(): Promise<void> {
  await s2sKeyManager.initialize();
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
    // Ensure keys are loaded
    await s2sKeyManager.initialize();

    const decoded = jwt.verify(serviceToken, s2sKeyManager.getPublicKey(), {
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
  await s2sKeyManager.initialize();

  const token = jwt.sign(
    {
      sub: serviceName,
      type: 'service',
    },
    s2sKeyManager.getPrivateKey(),
    {
      algorithm: 'RS256',
      expiresIn: env.S2S_TOKEN_EXPIRES_IN as any,
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

/**
 * Check if S2S is using fallback JWT keys (for monitoring/alerting)
 */
export function isUsingFallbackKeys(): boolean {
  return s2sKeyManager.isUsingFallback();
}
