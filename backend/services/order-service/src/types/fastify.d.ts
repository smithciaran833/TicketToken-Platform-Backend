import { FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  tenantName?: string;
  email: string;
  role: string;
  permissions?: string[];
}

export interface TenantContext {
  tenantId: string;
  tenantName?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser;
    tenant: TenantContext;
    idempotencyKey?: string;
    idempotencyRedisKey?: string;
  }
}
