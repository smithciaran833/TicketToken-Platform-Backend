// Type declarations for modules without proper types

declare module 'speakeasy' {
  interface GenerateSecretOptions {
    length?: number;
    name?: string;
    issuer?: string;
  }

  interface GeneratedSecret {
    ascii: string;
    hex: string;
    base32: string;
    otpauth_url?: string;
  }

  interface TOTPVerifyOptions {
    secret: string;
    encoding?: 'ascii' | 'hex' | 'base32';
    token: string;
    window?: number;
    step?: number;
  }

  interface TOTPOptions {
    secret: string;
    encoding?: 'ascii' | 'hex' | 'base32';
    step?: number;
    time?: number;
  }

  export function generateSecret(options?: GenerateSecretOptions): GeneratedSecret;
  
  export const totp: {
    (options: TOTPOptions): string;
    verify(options: TOTPVerifyOptions): boolean;
  };
}

// Extend FastifyRequest to include custom properties
import 'fastify';
import { Pool } from 'pg';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email?: string;
      role?: string;
      tenantId?: string;
    };
    tenantId?: string;
    correlationId?: string;
  }

  interface FastifyInstance {
    db?: Pool;
  }
}
