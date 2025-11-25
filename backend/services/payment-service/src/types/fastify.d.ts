import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      role: string;
      venues?: string[];
      isAdmin?: boolean;
    };
    sessionId?: string;
  }
}

export {};
