/**
 * STAFF SERIALIZER - Single Source of Truth for Safe Staff Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning staff data.
 *
 * NEVER ADD TO SAFE_STAFF_FIELDS:
 * - pin_code, access_code, password_hash
 * - hourly_rate, salary, commission_percentage
 * - emergency_contact, personal_phone, personal_email
 * - ssn, tax_id, bank_account info
 *
 * Pattern for controllers:
 * 1. Import { serializeStaff, SAFE_STAFF_SELECT } from '../serializers/staff.serializer'
 * 2. Use SAFE_STAFF_SELECT in SQL queries: db('venue_staff').select(db.raw(SAFE_STAFF_SELECT))
 * 3. Use serializeStaff() before returning: reply.send({ staff: serializeStaff(staff) })
 */

/**
 * SAFE_STAFF_FIELDS - The canonical list of fields safe to return to clients.
 *
 * These fields are carefully selected to:
 * - Provide necessary staff information for scheduling and management UI
 * - NOT expose authentication credentials (PIN codes)
 * - NOT expose compensation data (hourly rate, salary)
 * - NOT expose personal contact information
 */
export const SAFE_STAFF_FIELDS = [
  'id',
  'venue_id',
  'tenant_id',
  'user_id',
  'first_name',
  'last_name',
  'display_name',
  'email', // Work email only
  'phone', // Work phone only
  'role',
  'department',
  'title',
  'status',
  'is_active',
  'hire_date',
  'permissions',
  'schedule_preferences',
  'avatar_url',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_STAFF_SELECT - SQL-ready comma-separated field list.
 * Use in Knex queries: db('venue_staff').select(db.raw(SAFE_STAFF_SELECT))
 */
export const SAFE_STAFF_SELECT = SAFE_STAFF_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in responses.
 * Used for testing and documentation purposes.
 */
export const FORBIDDEN_STAFF_FIELDS = [
  // CRITICAL - Authentication/Access
  'pin_code',
  'access_code',
  'password_hash',
  'temporary_pin',
  'pin_expires_at',
  'nfc_card_id',
  'biometric_hash',

  // CRITICAL - Compensation (HR/Payroll data)
  'hourly_rate',
  'salary',
  'commission_percentage',
  'commission_rate',
  'bonus_structure',
  'pay_frequency',
  'overtime_rate',
  'tips_percentage',

  // HIGH RISK - Personal/Emergency contact
  'emergency_contact',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'personal_email',
  'personal_phone',
  'home_address',
  'home_address_line1',
  'home_address_city',
  'home_address_state',
  'home_address_postal',

  // HIGH RISK - Tax/Financial
  'ssn',
  'ssn_last4',
  'tax_id',
  'tax_withholding',
  'bank_account_number',
  'bank_routing_number',
  'direct_deposit_enabled',

  // MEDIUM RISK - Internal tracking
  'failed_pin_attempts',
  'locked_until',
  'last_login_at',
  'last_clock_in',
  'total_hours_worked',
  'total_overtime_hours',
  'performance_score',
  'disciplinary_notes',
  'internal_notes',

  // System fields
  'deleted_at',
  'deleted_by',
  'terminated_at',
  'termination_reason',
] as const;

/**
 * Type for a safely serialized staff object.
 */
export type SafeStaff = {
  id: string;
  venueId: string;
  tenantId: string;
  userId?: string | null;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  role: string;
  department?: string | null;
  title?: string | null;
  status: string;
  isActive: boolean;
  hireDate?: Date | string | null;
  permissions?: string[] | null;
  schedulePreferences?: Record<string, any> | null;
  avatarUrl?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Serializes a staff object to include ONLY safe fields.
 * This is the LAST LINE OF DEFENSE against data leakage.
 *
 * Even if a SQL query returns extra fields, this function
 * ensures only safe fields are included in the response.
 *
 * @param staff - Raw staff object from database
 * @returns SafeStaff with only allowed fields (camelCase keys)
 *
 * @example
 * const staff = await db('venue_staff').where('id', staffId).first();
 * return reply.send({ staff: serializeStaff(staff) });
 */
export function serializeStaff(staff: Record<string, any>): SafeStaff {
  if (!staff) {
    throw new Error('Cannot serialize null or undefined staff');
  }

  return {
    id: staff.id,
    venueId: staff.venue_id,
    tenantId: staff.tenant_id,
    userId: staff.user_id ?? null,
    firstName: staff.first_name,
    lastName: staff.last_name,
    displayName: staff.display_name ?? `${staff.first_name} ${staff.last_name}`,
    email: staff.email ?? null,
    phone: staff.phone ?? null,
    role: staff.role || 'staff',
    department: staff.department ?? null,
    title: staff.title ?? null,
    status: staff.status || 'active',
    isActive: staff.is_active ?? true,
    hireDate: staff.hire_date ?? null,
    permissions: staff.permissions ?? null,
    schedulePreferences: staff.schedule_preferences ?? null,
    avatarUrl: staff.avatar_url ?? null,
    createdAt: staff.created_at,
    updatedAt: staff.updated_at,
  };
}

/**
 * Serializes an array of staff members.
 *
 * @param staffList - Array of raw staff objects from database
 * @returns Array of SafeStaff objects
 */
export function serializeStaffList(staffList: Record<string, any>[]): SafeStaff[] {
  if (!staffList) {
    return [];
  }
  return staffList.map(serializeStaff);
}

/**
 * Serializes staff for list/summary views with fewer fields.
 * Use this for schedule views and quick lookups.
 */
export function serializeStaffSummary(staff: Record<string, any>): Pick<
  SafeStaff,
  'id' | 'venueId' | 'firstName' | 'lastName' | 'displayName' | 'role' | 'status' | 'isActive' | 'avatarUrl'
> {
  if (!staff) {
    throw new Error('Cannot serialize null or undefined staff');
  }

  return {
    id: staff.id,
    venueId: staff.venue_id,
    firstName: staff.first_name,
    lastName: staff.last_name,
    displayName: staff.display_name ?? `${staff.first_name} ${staff.last_name}`,
    role: staff.role || 'staff',
    status: staff.status || 'active',
    isActive: staff.is_active ?? true,
    avatarUrl: staff.avatar_url ?? null,
  };
}

/**
 * Validates that a response object contains no forbidden fields.
 * Use in tests to verify serialization is working correctly.
 *
 * @param obj - Object to check
 * @returns Array of forbidden fields found (empty if safe)
 */
export function findForbiddenStaffFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  // Check snake_case versions (from DB)
  for (const field of FORBIDDEN_STAFF_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  // Also check camelCase versions (from transformed response)
  const camelCaseForbidden = [
    'pinCode', 'accessCode', 'passwordHash', 'temporaryPin', 'pinExpiresAt',
    'nfcCardId', 'biometricHash', 'hourlyRate', 'salary', 'commissionPercentage',
    'commissionRate', 'bonusStructure', 'payFrequency', 'overtimeRate',
    'tipsPercentage', 'emergencyContact', 'emergencyContactName',
    'emergencyContactPhone', 'emergencyContactRelationship', 'personalEmail',
    'personalPhone', 'homeAddress', 'homeAddressLine1', 'homeAddressCity',
    'homeAddressState', 'homeAddressPostal', 'ssn', 'ssnLast4', 'taxId',
    'taxWithholding', 'bankAccountNumber', 'bankRoutingNumber',
    'directDepositEnabled', 'failedPinAttempts', 'lockedUntil', 'lastLoginAt',
    'lastClockIn', 'totalHoursWorked', 'totalOvertimeHours', 'performanceScore',
    'disciplinaryNotes', 'internalNotes', 'deletedAt', 'deletedBy',
    'terminatedAt', 'terminationReason',
  ];

  for (const field of camelCaseForbidden) {
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
export function findMissingSafeStaffFields(obj: Record<string, any>): string[] {
  const required = ['id', 'venueId', 'tenantId', 'firstName', 'lastName', 'role', 'status', 'isActive'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
