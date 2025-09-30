import { FastifyRequest } from 'fastify';

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    role: string;
    permissions?: string[];
  };
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: string;
  email_verified: boolean;
  mfa_enabled: boolean;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
  last_login_at?: Date;
  password_changed_at?: Date;
}
