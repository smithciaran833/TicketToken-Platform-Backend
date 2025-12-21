import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: string;
      role: string;
      tenantId?: string;
      tenantName?: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: {
      tenantId: string;
      tenantName?: string;
    };
    idempotencyKey?: string;
    idempotencyRedisKey?: string;
  }
}
