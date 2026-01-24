/**
 * USER SERIALIZER UNIT TESTS
 *
 * These tests verify the user serializer correctly strips sensitive fields
 * and only returns safe fields.
 */

import {
  SAFE_USER_FIELDS,
  SAFE_USER_SELECT,
  FORBIDDEN_USER_FIELDS,
  serializeUser,
  serializeUserWithPhone,
  maskPhone,
  maskEmail,
  findForbiddenFields,
  findMissingSafeFields,
  SafeUser,
} from '../../../src/serializers/user.serializer';

describe('User Serializer', () => {
  // ============================================
  // CONSTANTS TESTS
  // ============================================

  describe('SAFE_USER_FIELDS constant', () => {
    it('should be defined and non-empty', () => {
      expect(SAFE_USER_FIELDS).toBeDefined();
      expect(SAFE_USER_FIELDS.length).toBeGreaterThan(0);
    });

    it('should contain essential fields', () => {
      expect(SAFE_USER_FIELDS).toContain('id');
      expect(SAFE_USER_FIELDS).toContain('email');
      expect(SAFE_USER_FIELDS).toContain('email_verified');
      expect(SAFE_USER_FIELDS).toContain('mfa_enabled');
      expect(SAFE_USER_FIELDS).toContain('role');
      expect(SAFE_USER_FIELDS).toContain('tenant_id');
    });

    it('should NOT contain password_hash', () => {
      expect(SAFE_USER_FIELDS).not.toContain('password_hash');
    });

    it('should NOT contain mfa_secret', () => {
      expect(SAFE_USER_FIELDS).not.toContain('mfa_secret');
    });
  });

  describe('SAFE_USER_SELECT constant', () => {
    it('should be a comma-separated string', () => {
      expect(SAFE_USER_SELECT).toBeDefined();
      expect(typeof SAFE_USER_SELECT).toBe('string');
      expect(SAFE_USER_SELECT).toContain(',');
    });

    it('should contain all SAFE_USER_FIELDS', () => {
      for (const field of SAFE_USER_FIELDS) {
        expect(SAFE_USER_SELECT).toContain(field);
      }
    });
  });

  describe('FORBIDDEN_USER_FIELDS constant', () => {
    it('should contain critical security fields', () => {
      expect(FORBIDDEN_USER_FIELDS).toContain('password_hash');
      expect(FORBIDDEN_USER_FIELDS).toContain('mfa_secret');
      expect(FORBIDDEN_USER_FIELDS).toContain('two_factor_secret');
      expect(FORBIDDEN_USER_FIELDS).toContain('backup_codes');
      expect(FORBIDDEN_USER_FIELDS).toContain('password_reset_token');
      expect(FORBIDDEN_USER_FIELDS).toContain('email_verification_token');
    });

    it('should contain high-risk fields', () => {
      expect(FORBIDDEN_USER_FIELDS).toContain('failed_login_attempts');
      expect(FORBIDDEN_USER_FIELDS).toContain('locked_until');
      expect(FORBIDDEN_USER_FIELDS).toContain('last_login_ip');
      expect(FORBIDDEN_USER_FIELDS).toContain('stripe_connect_account_id');
    });

    it('should contain medium-risk fields', () => {
      expect(FORBIDDEN_USER_FIELDS).toContain('deleted_at');
      expect(FORBIDDEN_USER_FIELDS).toContain('lifetime_value');
      expect(FORBIDDEN_USER_FIELDS).toContain('total_spent');
      expect(FORBIDDEN_USER_FIELDS).toContain('loyalty_points');
    });

    it('should have no overlap with SAFE_USER_FIELDS', () => {
      for (const safeField of SAFE_USER_FIELDS) {
        expect(FORBIDDEN_USER_FIELDS).not.toContain(safeField);
      }
    });
  });

  // ============================================
  // serializeUser FUNCTION TESTS
  // ============================================

  describe('serializeUser function', () => {
    it('should return only safe fields', () => {
      const input = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        email_verified: true,
        mfa_enabled: false,
        role: 'user',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        created_at: new Date(),
        updated_at: new Date(),
        // Sensitive fields that should be stripped
        password_hash: '$2b$10$hash',
        mfa_secret: 'JBSWY3DPEHPK3PXP',
        backup_codes: ['code1', 'code2'],
        failed_login_attempts: 5,
        stripe_connect_account_id: 'acct_123',
      };

      const result = serializeUser(input);

      // Should have safe fields
      expect(result.id).toBe(input.id);
      expect(result.email).toBe(input.email);
      expect(result.email_verified).toBe(true);
      expect(result.mfa_enabled).toBe(false);
      expect(result.role).toBe('user');
      expect(result.tenant_id).toBe(input.tenant_id);

      // Should NOT have sensitive fields
      expect((result as any).password_hash).toBeUndefined();
      expect((result as any).mfa_secret).toBeUndefined();
      expect((result as any).backup_codes).toBeUndefined();
      expect((result as any).failed_login_attempts).toBeUndefined();
      expect((result as any).stripe_connect_account_id).toBeUndefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeUser(null as any)).toThrow('Cannot serialize null');
    });

    it('should throw error for undefined input', () => {
      expect(() => serializeUser(undefined as any)).toThrow('Cannot serialize null');
    });

    it('should set default values for required fields', () => {
      const input = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        tenant_id: '00000000-0000-0000-0000-000000000001',
      };

      const result = serializeUser(input);

      expect(result.email_verified).toBe(false);
      expect(result.mfa_enabled).toBe(false);
      expect(result.role).toBe('user');
    });

    it('should handle null/undefined optional fields', () => {
      const input = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        email_verified: true,
        mfa_enabled: false,
        role: 'user',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        first_name: null,
        last_name: undefined,
        last_login_at: null,
      };

      const result = serializeUser(input);

      expect(result.first_name).toBeNull();
      // undefined fields are included (value is undefined, but key exists)
      expect(result.last_login_at).toBeNull();
    });

    it('should strip ALL forbidden fields', () => {
      // Create input with all forbidden fields set
      const input: Record<string, any> = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        email_verified: true,
        mfa_enabled: false,
        role: 'user',
        tenant_id: '00000000-0000-0000-0000-000000000001',
      };

      // Add all forbidden fields
      for (const field of FORBIDDEN_USER_FIELDS) {
        input[field] = 'sensitive_value';
      }

      const result = serializeUser(input);

      // Verify none of the forbidden fields made it through
      for (const field of FORBIDDEN_USER_FIELDS) {
        expect((result as any)[field]).toBeUndefined();
      }
    });
  });

  // ============================================
  // serializeUserWithPhone FUNCTION TESTS
  // ============================================

  describe('serializeUserWithPhone function', () => {
    it('should mask phone number', () => {
      const input = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        email_verified: true,
        mfa_enabled: false,
        role: 'user',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        phone: '+1234567890',
      };

      const result = serializeUserWithPhone(input);

      expect(result.phone).toBeDefined();
      expect(result.phone).not.toBe(input.phone);
      expect(result.phone).toContain('*');
      expect(result.phone).toMatch(/\*+7890$/); // Should end with last 4 digits
    });

    it('should handle missing phone', () => {
      const input = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        email_verified: true,
        mfa_enabled: false,
        role: 'user',
        tenant_id: '00000000-0000-0000-0000-000000000001',
      };

      const result = serializeUserWithPhone(input);

      expect(result.phone).toBeUndefined();
    });
  });

  // ============================================
  // MASKING FUNCTION TESTS
  // ============================================

  describe('maskPhone function', () => {
    it('should mask all but last 4 digits', () => {
      expect(maskPhone('+1234567890')).toBe('******7890');
      expect(maskPhone('5551234567')).toBe('******4567');
    });

    it('should handle short phone numbers', () => {
      expect(maskPhone('123')).toBe('****');
      expect(maskPhone('12')).toBe('****');
    });

    it('should handle empty string', () => {
      expect(maskPhone('')).toBe('');
    });

    it('should handle phone with formatting', () => {
      // +1 (555) 123-4567 has 11 digits, so 7 asterisks + 4 digits
      expect(maskPhone('+1 (555) 123-4567')).toBe('*******4567');
    });
  });

  describe('maskEmail function', () => {
    it('should mask local part of email', () => {
      expect(maskEmail('john.doe@example.com')).toBe('jo*****@example.com');
    });

    it('should handle short local parts', () => {
      expect(maskEmail('ab@example.com')).toBe('**@example.com');
      expect(maskEmail('a@example.com')).toBe('**@example.com');
    });

    it('should handle empty string', () => {
      expect(maskEmail('')).toBe('');
    });

    it('should handle invalid email', () => {
      expect(maskEmail('notanemail')).toBe('***');
    });
  });

  // ============================================
  // VALIDATION FUNCTION TESTS
  // ============================================

  describe('findForbiddenFields function', () => {
    it('should find password_hash', () => {
      const obj = { id: '123', password_hash: 'hash' };
      expect(findForbiddenFields(obj)).toContain('password_hash');
    });

    it('should find multiple forbidden fields', () => {
      const obj = {
        id: '123',
        password_hash: 'hash',
        mfa_secret: 'secret',
        backup_codes: ['code1'],
      };
      const found = findForbiddenFields(obj);
      expect(found).toContain('password_hash');
      expect(found).toContain('mfa_secret');
      expect(found).toContain('backup_codes');
    });

    it('should return empty array for clean object', () => {
      const obj = { id: '123', email: 'test@example.com', role: 'user' };
      expect(findForbiddenFields(obj)).toHaveLength(0);
    });

    it('should ignore undefined values', () => {
      const obj = { id: '123', password_hash: undefined };
      expect(findForbiddenFields(obj)).toHaveLength(0);
    });
  });

  describe('findMissingSafeFields function', () => {
    it('should find missing required fields', () => {
      const obj = { id: '123' };
      const missing = findMissingSafeFields(obj);
      expect(missing).toContain('email');
      expect(missing).toContain('email_verified');
      expect(missing).toContain('mfa_enabled');
      expect(missing).toContain('role');
      expect(missing).toContain('tenant_id');
    });

    it('should return empty for complete object', () => {
      const obj = {
        id: '123',
        email: 'test@example.com',
        email_verified: true,
        mfa_enabled: false,
        role: 'user',
        tenant_id: '00000000-0000-0000-0000-000000000001',
      };
      expect(findMissingSafeFields(obj)).toHaveLength(0);
    });
  });
});
