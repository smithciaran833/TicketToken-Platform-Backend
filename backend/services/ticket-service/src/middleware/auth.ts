import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'AuthMiddleware' });

const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH ||
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-public.pem');

let publicKey: string;
try {
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  log.info('JWT public key loaded for verification');
} catch (error) {
  log.error('Failed to load JWT public key', { error, path: publicKeyPath });
  throw new Error('JWT public key not found at ' + publicKeyPath);
}

export interface AuthRequest extends FastifyRequest {
  user?: any;
  userId?: string;
  tenantId?: string;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: process.env.JWT_ISSUER || 'tickettoken-auth',
      audience: process.env.JWT_ISSUER || 'tickettoken-auth'
    }) as any;

    // Attach user info to request
    (request as any).user = decoded;
    (request as any).userId = decoded.userId || decoded.id || decoded.sub;
    (request as any).tenantId = decoded.tenantId || decoded.tenant_id;

    // Continue to next handler
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return reply.status(401).send({ error: 'Invalid token' });
    }
    log.error('Auth error', { error });
    return reply.status(500).send({ error: 'Authentication error' });
  }
}

export const authMiddleware = authenticate;

// Role-based authorization for Fastify
export const requireRole = (roles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    
    if (!user) {
      // MEDIUM Fix: Log AuthZ failures
      log.warn('Authorization failure: No user context', {
        security: {
          event: 'authz_failure',
          reason: 'no_user_context',
          severity: 'medium',
          url: request.url,
          method: request.method,
          ip: request.ip,
          timestamp: new Date().toISOString(),
        }
      });
      throw new UnauthorizedError('Unauthorized');
    }

    if (user.role && roles.includes(user.role)) {
      return;
    }

    if (user.permissions?.includes('admin:all')) {
      return;
    }

    if (roles.includes('venue_manager') && user.permissions?.some((p: string) => p.startsWith('venue:'))) {
      return;
    }

    // MEDIUM Fix: Log AuthZ failures with full context
    log.warn('Authorization failure: Insufficient permissions', {
      security: {
        event: 'authz_failure',
        reason: 'insufficient_permissions',
        severity: 'medium',
        userId: user.id || user.sub,
        userRole: user.role,
        requiredRoles: roles,
        userPermissions: user.permissions,
        url: request.url,
        method: request.method,
        ip: request.ip,
        timestamp: new Date().toISOString(),
      }
    });

    return reply.status(403).send({ error: 'Insufficient permissions' });
  };
};
