import { UserRole } from './index';

export interface AuthServiceUser {
  id: string;
  email: string;
  role: UserRole;
  venueId: string | null;
  tenant_id: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface TokenValidationResult {
  valid: boolean;
  user?: AuthServiceUser;
  error?: string;
}

export interface AuthServiceErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}
