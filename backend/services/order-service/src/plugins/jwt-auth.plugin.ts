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

async function jwtAuthPlugin(fastify: FastifyInstance) {
  // Register JWT plugin
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    sign: {
      expiresIn: '24h',
    },
  });

  // Decorate request with user extraction helper
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();

      // Extract payload from JWT
      const payload = request.user as unknown as JWTPayload;

      // Attach typed user to request
      const authenticatedUser: AuthenticatedUser = {
        id: payload.sub,
        tenantId: payload.tenantId,
        tenantName: payload.tenantName,
        email: payload.email,
        role: payload.role,
        permissions: payload.permissions || [],
      };

      request.user = authenticatedUser;
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });
}

export default fp(jwtAuthPlugin, {
  name: 'jwt-auth-plugin',
});
