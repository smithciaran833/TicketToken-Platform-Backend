import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

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
