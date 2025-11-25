import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'Auth' });

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
    log.error('Authentication error', { error });
    return reply.status(500).send({ error: 'Authentication error' });
  }
}

// Keep service-specific authorization logic
export const requireRole = (roles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    
    if (!user) {
      return reply.status(401).send({
        error: 'Authentication required',
        code: 'NO_AUTH'
      });
    }

    if (!roles.includes(user.role)) {
      return reply.status(403).send({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles: roles,
        userRole: user.role
      });
    }
  };
};

export const requireVenueAccess = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const venueId = (request.params as any).venueId || (request.body as any)?.venueId;
  
  if (!venueId) {
    return reply.status(400).send({
      error: 'Venue ID required',
      code: 'VENUE_ID_MISSING'
    });
  }

  const user = (request as any).user;
  
  if (!user) {
    return reply.status(401).send({
      error: 'Authentication required',
      code: 'NO_AUTH'
    });
  }

  // Admins have access to all venues
  if (user.isAdmin || user.role === 'admin') {
    return;
  }

  // Check if user has access to this venue
  if (!user.venues?.includes(venueId)) {
    return reply.status(403).send({
      error: 'Access denied to this venue',
      code: 'VENUE_ACCESS_DENIED',
      venueId
    });
  }
};

// Export AuthRequest type for use in other files
