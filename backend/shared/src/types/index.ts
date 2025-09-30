import { FastifyRequest } from 'fastify';

export type UserRole = 
  | 'venue-owner'
  | 'event-organizer' 
  | 'customer'
  | 'admin'
  | 'scanner'
  | 'box-office';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenant_id: string;
  permissions: string[];
  venueId?: string;
  metadata?: Record<string, any>;
}

export interface AuthRequest extends FastifyRequest {
  user?: AuthUser;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    rawBody?: boolean;
  }
}

export class BaseError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, code?: string) {
    super(message, 400, code || 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends BaseError {
  constructor(message: string, code?: string) {
    super(message, 404, code || 'NOT_FOUND');
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string, code?: string) {
    super(message, 401, code || 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string, code?: string) {
    super(message, 403, code || 'AUTHORIZATION_ERROR');
  }
}
