import 'fastify';
import { AuthUser, VenueContext, TimeoutBudget, ServiceContainer } from './index';
import { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    services: ServiceContainer;
    authenticate: (request: FastifyRequest) => Promise<void>;
    requirePermission: (permission: string) => (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    user?: AuthUser;
    startTime?: number;
    rateLimitMax?: number;
    venueContext?: VenueContext;
    timeoutBudget?: TimeoutBudget;
    requestLogger?: any;
    routeSchema?: any;
  }

  interface FastifyContextConfig {
    rawBody?: boolean;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      type: 'access' | 'refresh';
      jti?: string;
      family?: string;
      permissions?: string[];
    };
    user: AuthUser;
  }
}

declare module '@fastify/jwt' {
  interface VerifyPayloadType {
    sub: string;
    type: 'access' | 'refresh';
    jti?: string;
    family?: string;
    permissions?: string[];
    [key: string]: any;
  }
}
