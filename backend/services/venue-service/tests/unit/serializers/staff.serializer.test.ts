/**
 * Staff Serializer Security Tests
 *
 * These tests verify that the staff serializer:
 * 1. Includes all safe fields
 * 2. Excludes all forbidden fields (data leakage prevention)
 * 3. Handles edge cases correctly
 */

import {
  serializeStaff,
  serializeStaffList,
  serializeStaffSummary,
  findForbiddenStaffFields,
  findMissingSafeStaffFields,
  SAFE_STAFF_FIELDS,
  FORBIDDEN_STAFF_FIELDS,
} from '../../../src/serializers/staff.serializer';

describe('Staff Serializer', () => {
  // Mock staff with ALL fields (safe and forbidden)
  const mockStaffWithAllFields = {
    // Safe fields
    id: 'staff-123',
    venue_id: 'venue-456',
    tenant_id: 'tenant-789',
    user_id: 'user-101',
    first_name: 'John',
    last_name: 'Doe',
    display_name: 'John D.',
    email: 'john@venue.com',
    phone: '+1234567890',
    role: 'manager',
    department: 'Operations',
    title: 'Venue Manager',
    status: 'active',
    is_active: true,
    hire_date: new Date('2023-01-15'),
    permissions: ['venue:read', 'events:create'],
    schedule_preferences: { preferred_shifts: ['morning'] },
    avatar_url: 'https://example.com/avatar.jpg',
    created_at: new Date('2023-01-01'),
    updated_at: new Date('2024-01-15'),

    // FORBIDDEN fields - should NEVER appear in serialized output
    pin_code: '1234',
    access_code: 'ABC123',
    password_hash: '$2b$10$hashedpassword',
    temporary_pin: '5678',
    pin_expires_at: new Date('2024-02-01'),
    nfc_card_id: 'NFC12345',
    biometric_hash: 'biometric-hash-string',

    // Compensation - CRITICAL
    hourly_rate: 25.5,
    salary: 52000,
    commission_percentage: 5.0,
    commission_rate: 0.05,
    bonus_structure: { quarterly: 1000 },
    pay_frequency: 'biweekly',
    overtime_rate: 38.25,
    tips_percentage: 10,

    // Emergency/Personal contact - HIGH RISK
    emergency_contact: { name: 'Jane Doe', phone: '+1987654321' },
    emergency_contact_name: 'Jane Doe',
    emergency_contact_phone: '+1987654321',
    emergency_contact_relationship: 'spouse',
    personal_email: 'john.personal@gmail.com',
    personal_phone: '+1555555555',
    home_address: '456 Home St, Apt 2',
    home_address_line1: '456 Home St',
    home_address_city: 'Brooklyn',
    home_address_state: 'NY',
    home_address_postal: '11201',

    // Tax/Financial - HIGH RISK
    ssn: '123-45-6789',
    ssn_last4: '6789',
    tax_id: '12-3456789',
    tax_withholding: 2,
    bank_account_number: '123456789012',
    bank_routing_number: '021000021',
    direct_deposit_enabled: true,

    // Internal tracking - MEDIUM RISK
    failed_pin_attempts: 3,
    locked_until: null,
    last_login_at: new Date('2024-01-14'),
    last_clock_in: new Date('2024-01-15T08:00:00'),
    total_hours_worked: 1560,
    total_overtime_hours: 120,
    performance_score: 4.5,
    disciplinary_notes: 'None',
    internal_notes: 'Good employee',

    // System fields
    deleted_at: null,
    deleted_by: null,
    terminated_at: null,
    termination_reason: null,
  };

  describe('serializeStaff', () => {
    it('should include all safe fields', () => {
      const result = serializeStaff(mockStaffWithAllFields);

      expect(result.id).toBe('staff-123');
      expect(result.venueId).toBe('venue-456');
      expect(result.tenantId).toBe('tenant-789');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.displayName).toBe('John D.');
      expect(result.email).toBe('john@venue.com');
      expect(result.phone).toBe('+1234567890');
      expect(result.role).toBe('manager');
      expect(result.department).toBe('Operations');
      expect(result.title).toBe('Venue Manager');
      expect(result.status).toBe('active');
      expect(result.isActive).toBe(true);
      expect(result.permissions).toEqual(['venue:read', 'events:create']);
    });

    it('should EXCLUDE all forbidden fields', () => {
      const result = serializeStaff(mockStaffWithAllFields);
      const forbiddenFound = findForbiddenStaffFields(result);

      expect(forbiddenFound).toHaveLength(0);

      // Explicit checks for CRITICAL fields
      expect(result).not.toHaveProperty('pinCode');
      expect(result).not.toHaveProperty('pin_code');
      expect(result).not.toHaveProperty('accessCode');
      expect(result).not.toHaveProperty('access_code');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('password_hash');

      // Compensation fields
      expect(result).not.toHaveProperty('hourlyRate');
      expect(result).not.toHaveProperty('hourly_rate');
      expect(result).not.toHaveProperty('salary');
      expect(result).not.toHaveProperty('commissionPercentage');
      expect(result).not.toHaveProperty('commission_percentage');

      // Personal info
      expect(result).not.toHaveProperty('emergencyContact');
      expect(result).not.toHaveProperty('emergency_contact');
      expect(result).not.toHaveProperty('personalEmail');
      expect(result).not.toHaveProperty('personal_email');
      expect(result).not.toHaveProperty('homeAddress');
      expect(result).not.toHaveProperty('home_address');

      // Financial
      expect(result).not.toHaveProperty('ssn');
      expect(result).not.toHaveProperty('bankAccountNumber');
      expect(result).not.toHaveProperty('bank_account_number');
    });

    it('should throw error for null input', () => {
      expect(() => serializeStaff(null as any)).toThrow('Cannot serialize null or undefined staff');
    });

    it('should throw error for undefined input', () => {
      expect(() => serializeStaff(undefined as any)).toThrow('Cannot serialize null or undefined staff');
    });

    it('should handle missing optional fields with defaults', () => {
      const minimalStaff = {
        id: 'staff-minimal',
        venue_id: 'venue-1',
        tenant_id: 'tenant-1',
        first_name: 'Jane',
        last_name: 'Smith',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = serializeStaff(minimalStaff);

      expect(result.id).toBe('staff-minimal');
      expect(result.role).toBe('staff'); // default value
      expect(result.status).toBe('active'); // default value
      expect(result.isActive).toBe(true); // default value
      expect(result.displayName).toBe('Jane Smith'); // generated from name
      expect(result.department).toBeNull();
      expect(result.title).toBeNull();
    });
  });

  describe('serializeStaffList', () => {
    it('should serialize array of staff', () => {
      const staffList = [
        { ...mockStaffWithAllFields, id: 'staff-1', first_name: 'Alice' },
        { ...mockStaffWithAllFields, id: 'staff-2', first_name: 'Bob' },
      ];

      const result = serializeStaffList(staffList);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('staff-1');
      expect(result[0].firstName).toBe('Alice');
      expect(result[1].id).toBe('staff-2');
      expect(result[1].firstName).toBe('Bob');

      // Verify no forbidden fields in any staff member
      result.forEach((staff) => {
        const forbiddenFound = findForbiddenStaffFields(staff);
        expect(forbiddenFound).toHaveLength(0);
      });
    });

    it('should handle empty array', () => {
      expect(serializeStaffList([])).toEqual([]);
    });

    it('should handle null/undefined', () => {
      expect(serializeStaffList(null as any)).toEqual([]);
      expect(serializeStaffList(undefined as any)).toEqual([]);
    });
  });

  describe('serializeStaffSummary', () => {
    it('should return minimal safe fields', () => {
      const result = serializeStaffSummary(mockStaffWithAllFields);

      expect(result.id).toBe('staff-123');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.role).toBe('manager');
      expect(result.isActive).toBe(true);

      // Should not have detailed fields
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('phone');
      expect(result).not.toHaveProperty('permissions');
      expect(result).not.toHaveProperty('hireDate');

      // Should not have forbidden fields
      expect(result).not.toHaveProperty('pin_code');
      expect(result).not.toHaveProperty('hourly_rate');
    });
  });

  describe('findForbiddenStaffFields', () => {
    it('should detect forbidden fields in raw DB object', () => {
      const rawDbResult = {
        id: 'staff-1',
        first_name: 'John',
        pin_code: '1234', // FORBIDDEN
        hourly_rate: 25.0, // FORBIDDEN
        emergency_contact: { name: 'Jane' }, // FORBIDDEN
      };

      const forbidden = findForbiddenStaffFields(rawDbResult);

      expect(forbidden).toContain('pin_code');
      expect(forbidden).toContain('hourly_rate');
      expect(forbidden).toContain('emergency_contact');
      expect(forbidden).toHaveLength(3);
    });

    it('should return empty array for safe object', () => {
      const safeStaff = serializeStaff(mockStaffWithAllFields);
      const forbidden = findForbiddenStaffFields(safeStaff);

      expect(forbidden).toHaveLength(0);
    });
  });

  describe('findMissingSafeStaffFields', () => {
    it('should detect missing required fields', () => {
      const incompleteStaff = {
        id: 'staff-1',
        // missing: venueId, tenantId, firstName, lastName, role, status, isActive
      };

      const missing = findMissingSafeStaffFields(incompleteStaff);

      expect(missing).toContain('venueId');
      expect(missing).toContain('tenantId');
      expect(missing).toContain('firstName');
      expect(missing).toContain('lastName');
      expect(missing).toContain('role');
      expect(missing).toContain('status');
      expect(missing).toContain('isActive');
    });

    it('should return empty array when all required fields present', () => {
      const completeStaff = serializeStaff(mockStaffWithAllFields);
      const missing = findMissingSafeStaffFields(completeStaff);

      expect(missing).toHaveLength(0);
    });
  });

  describe('SAFE_STAFF_FIELDS constant', () => {
    it('should not contain any forbidden fields', () => {
      const forbiddenSet = new Set(FORBIDDEN_STAFF_FIELDS);

      SAFE_STAFF_FIELDS.forEach((field) => {
        expect(forbiddenSet.has(field as any)).toBe(false);
      });
    });

    it('should contain essential staff fields', () => {
      expect(SAFE_STAFF_FIELDS).toContain('id');
      expect(SAFE_STAFF_FIELDS).toContain('venue_id');
      expect(SAFE_STAFF_FIELDS).toContain('tenant_id');
      expect(SAFE_STAFF_FIELDS).toContain('role');
      expect(SAFE_STAFF_FIELDS).toContain('is_active');
    });

    it('should NOT contain sensitive fields', () => {
      expect(SAFE_STAFF_FIELDS).not.toContain('pin_code');
      expect(SAFE_STAFF_FIELDS).not.toContain('hourly_rate');
      expect(SAFE_STAFF_FIELDS).not.toContain('salary');
      expect(SAFE_STAFF_FIELDS).not.toContain('emergency_contact');
      expect(SAFE_STAFF_FIELDS).not.toContain('ssn');
    });
  });

  describe('FORBIDDEN_STAFF_FIELDS constant', () => {
    it('should contain all sensitive HR/Payroll fields', () => {
      expect(FORBIDDEN_STAFF_FIELDS).toContain('pin_code');
      expect(FORBIDDEN_STAFF_FIELDS).toContain('hourly_rate');
      expect(FORBIDDEN_STAFF_FIELDS).toContain('salary');
      expect(FORBIDDEN_STAFF_FIELDS).toContain('commission_percentage');
      expect(FORBIDDEN_STAFF_FIELDS).toContain('emergency_contact');
      expect(FORBIDDEN_STAFF_FIELDS).toContain('ssn');
      expect(FORBIDDEN_STAFF_FIELDS).toContain('bank_account_number');
    });
  });
});
