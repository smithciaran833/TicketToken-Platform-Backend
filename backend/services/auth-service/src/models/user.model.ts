export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email_verified: boolean;
  phone_verified: boolean;
  kyc_status: 'pending' | 'verified' | 'rejected';
  kyc_level: number;
  mfa_enabled: boolean;
  mfa_secret?: string;
  backup_codes?: string[];
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  last_login_ip?: string;
  failed_login_attempts: number;
  locked_until?: Date;
  password_reset_token?: string;
  password_reset_expires?: Date;
  email_verification_token?: string;
  email_verification_expires?: Date;
  deleted_at?: Date;
  deleted_by?: string;
  deletion_reason?: string;
  version: number; // For optimistic locking
}

export interface UserVenueRole {
  id: string;
  user_id: string;
  venue_id: string;
  role: 'venue-owner' | 'venue-manager' | 'box-office' | 'door-staff';
  granted_by: string;
  granted_at: Date;
  expires_at?: Date;
  is_active: boolean;
}

export interface UserSession {
  id: string;
  user_id: string;
  session_token: string;
  ip_address: string;
  user_agent: string;
  created_at: Date;
  expires_at: Date;
  revoked_at?: Date;
}

export interface LoginAttempt {
  id: string;
  email: string;
  ip_address: string;
  success: boolean;
  attempted_at: Date;
  failure_reason?: string;
}
