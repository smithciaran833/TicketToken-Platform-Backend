import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

export interface JWTPayload {
  sub: string;
  tenantId: string;
  tenantName?: string;
  email: string;
  role: string;
  permissions?: string[];
  iat: number;
  exp: number;
}

interface AuthenticatedUser {
  id: string;
  tenantId: string;
  tenantName?: string;
  email: string;
  role: string;
  permissions: string[];
}

// Extend FastifyInstance to include authenticate decorator
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Extend @fastify/jwt to use our user type
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: AuthenticatedUser;
  }
}

async function jwtAuthPlugin(fastify: FastifyInstance) {
  // CRITICAL: Require JWT_SECRET from environment - no fallback
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  // Register JWT plugin with strict algorithm whitelist
  await fastify.register(jwt, {
    secret,
    sign: {
      algorithm: 'HS256',
      expiresIn: '24h',
    },
    verify: {
      algorithms: ['HS256'], // SEC-R3: Algorithm whitelist
    },
  });

  // Decorate request with user extraction helper
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();

      // Extract payload from JWT
      const payload = request.user as unknown as JWTPayload;

      // SEC-R5: Validate token expiration (handled by @fastify/jwt)
      // SEC-R4: Token expiration is checked automatically by jwtVerify

      // Attach typed user to request
      const authenticatedUser: AuthenticatedUser = {
        id: payload.sub,
        tenantId: payload.tenantId,
        tenantName: payload.tenantName,
        email: payload.email,
        role: payload.role,
        permissions: payload.permissions || [],
      };

      (request as any).user = authenticatedUser;
    } catch (err: any) {
      // Provide specific error messages for different JWT errors
      if (err.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
        reply.status(401).send({ error: 'Unauthorized', message: 'No authorization token provided' });
      } else if (err.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
        reply.status(401).send({ error: 'Unauthorized', message: 'Token has expired' });
      } else if (err.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
        reply.status(401).send({ error: 'Unauthorized', message: 'Invalid token' });
      } else {
        reply.status(401).send({ error: 'Unauthorized', message: 'Authentication failed' });
      }
    }
  });
}

export default fp(jwtAuthPlugin, {
  name: 'jwt-auth-plugin',
});
