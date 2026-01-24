/**
 * USER SERIALIZER - Single Source of Truth for Safe User Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning user data.
 *
 * NEVER ADD TO SAFE_USER_FIELDS:
 * - password_hash, two_factor_secret, mfa_secret, backup_codes
 * - email_verification_token, password_reset_token
 * - failed_login_attempts, locked_until, last_login_ip
 * - stripe_connect_account_id, stripe_customer_id
 * - deleted_at, lifetime_value, total_spent, loyalty_points
 *
 * Pattern for other services:
 * 1. Import { serializeUser, SAFE_USER_SELECT } from '../serializers/user.serializer'
 * 2. Use SAFE_USER_SELECT in SQL queries: db('users').select(db.raw(SAFE_USER_SELECT))
 * 3. Use serializeUser() before returning: reply.send({ user: serializeUser(user) })
 */

/**
 * SAFE_USER_FIELDS - The canonical list of fields safe to return to clients.
 *
 * These fields are carefully selected to:
 * - Provide necessary user information for UI display
 * - NOT expose authentication secrets
 * - NOT expose internal tracking data
 * - NOT expose financial/payment data
 */
export const SAFE_USER_FIELDS = [
  'id',
  'email',
  'username',
  'display_name',
  'first_name',
  'last_name',
  'email_verified',
  'phone_verified',
  'mfa_enabled',
  'role',
  'tenant_id',
  'status',
  'created_at',
  'updated_at',
  'last_login_at',
] as const;

/**
 * SAFE_USER_SELECT - SQL-ready comma-separated field list.
 * Use in Knex queries: db('users').select(db.raw(SAFE_USER_SELECT))
 * Use in raw SQL: `SELECT ${SAFE_USER_SELECT} FROM users WHERE ...`
 */
export const SAFE_USER_SELECT = SAFE_USER_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in responses.
 * Used for testing and documentation purposes.
 */
export const FORBIDDEN_USER_FIELDS = [
  // CRITICAL - Authentication secrets
  'password_hash',
  'two_factor_secret',
  'mfa_secret',
  'backup_codes',
  'email_verification_token',
  'email_verification_expires',
  'password_reset_token',
  'password_reset_expires',

  // HIGH RISK - Security/tracking data
  'failed_login_attempts',
  'locked_until',
  'last_login_ip',
  'last_login_device',
  'stripe_connect_account_id',
  'stripe_customer_id',
  'stripe_connect_status',
  'stripe_connect_charges_enabled',
  'stripe_connect_payouts_enabled',
  'stripe_connect_details_submitted',
  'stripe_connect_onboarded_at',
  'stripe_connect_capabilities',
  'stripe_connect_country',

  // MEDIUM RISK - Internal/financial data
  'deleted_at',
  'lifetime_value',
  'total_spent',
  'loyalty_points',
  'referral_code',
  'referred_by',
  'referral_count',
  'events_attended',
  'ticket_purchase_count',
  'login_count',

  // OTHER - Internal system fields
  'verification_token',
  'provider',
  'provider_user_id',
  'wallet_address',
  'network',
  'verified',
  'permissions',
  'metadata',
  'tags',
  'billing_address',
  'profile_data',
  'preferences',
  'notification_preferences',
  'privacy_settings',
  'last_password_change',
  'password_changed_at',
  'is_active',
  'can_receive_transfers',
  'identity_verified',
  'bio',
  'avatar_url',
  'cover_image_url',
  'date_of_birth',
  'country_code',
  'city',
  'state_province',
  'postal_code',
  'timezone',
  'preferred_language',
  'terms_accepted_at',
  'terms_version',
  'privacy_accepted_at',
  'privacy_version',
  'marketing_consent',
  'marketing_consent_date',
  'last_active_at',
  'name',
  'phone', // Phone should be masked if returned
] as const;

/**
 * Type for a safely serialized user object.
 */
export type SafeUser = {
  id: string;
  email: string;
  username?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email_verified: boolean;
  phone_verified?: boolean | null;
  mfa_enabled: boolean;
  role: string;
  tenant_id: string;
  status?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_login_at?: Date | string | null;
};

/**
 * Serializes a user object to include ONLY safe fields.
 * This is the LAST LINE OF DEFENSE against data leakage.
 *
 * Even if a SQL query returns extra fields, this function
 * ensures only safe fields are included in the response.
 *
 * @param user - Raw user object from database
 * @returns SafeUser with only allowed fields
 *
 * @example
 * const user = await db('users').where('id', userId).first();
 * return reply.send({ user: serializeUser(user) });
 */
export function serializeUser(user: Record<string, any>): SafeUser {
  if (!user) {
    throw new Error('Cannot serialize null or undefined user');
  }

  const safe: Record<string, any> = {};

  for (const field of SAFE_USER_FIELDS) {
    if (field in user) {
      safe[field] = user[field];
    }
  }

  // Ensure required fields have defaults
  if (safe.email_verified === undefined) {
    safe.email_verified = false;
  }
  if (safe.mfa_enabled === undefined) {
    safe.mfa_enabled = false;
  }
  if (safe.role === undefined) {
    safe.role = 'user';
  }

  return safe as SafeUser;
}

/**
 * Serializes a user object and includes a masked phone number.
 * Use this only when phone display is explicitly needed.
 *
 * @param user - Raw user object from database
 * @returns SafeUser with masked phone field added
 */
export function serializeUserWithPhone(user: Record<string, any>): SafeUser & { phone?: string } {
  const safe = serializeUser(user);

  if (user.phone) {
    (safe as any).phone = maskPhone(user.phone);
  }

  return safe as SafeUser & { phone?: string };
}

/**
 * Masks a phone number to show only last 4 digits.
 * Example: "+1234567890" becomes "******7890"
 */
export function maskPhone(phone: string): string {
  if (!phone) return '';

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';

  return '*'.repeat(digits.length - 4) + digits.slice(-4);
}

/**
 * Masks an email address for display.
 * Example: "john.doe@example.com" becomes "jo*****@example.com"
 */
export function maskEmail(email: string): string {
  if (!email) return '';

  const [local, domain] = email.split('@');
  if (!domain) return '***';

  const maskedLocal = local.length > 2
    ? local.substring(0, 2) + '*'.repeat(Math.min(local.length - 2, 5))
    : '**';

  return `${maskedLocal}@${domain}`;
}

/**
 * Validates that a response object contains no forbidden fields.
 * Use in tests to verify serialization is working correctly.
 *
 * @param obj - Object to check
 * @returns Array of forbidden fields found (empty if safe)
 */
export function findForbiddenFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  for (const field of FORBIDDEN_USER_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  return found;
}

/**
 * Validates that a response object contains all required safe fields.
 * Use in tests to verify serialization is working correctly.
 *
 * @param obj - Object to check
 * @returns Array of missing required fields (empty if complete)
 */
export function findMissingSafeFields(obj: Record<string, any>): string[] {
  const required = ['id', 'email', 'email_verified', 'mfa_enabled', 'role', 'tenant_id'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
