/**
 * Unit Tests for Validation Schemas
 *
 * Tests Zod validation schemas for all API endpoints
 */
import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import {
  // Common validators
  einSchema,
  emailSchema,
  phoneSchema,
  currencySchema,
  uuidSchema,
  yearSchema,
  venueIdSchema,
  accountNumberSchema,
  routingNumberSchema,
  addressSchema,
  // Venue verification
  startVerificationSchema,
  uploadW9Schema,
  updateStatusSchema,
  // Tax reporting
  trackSaleSchema,
  taxSummaryQuerySchema,
  calculateTaxSchema,
  generate1099Schema,
  // OFAC
  ofacCheckSchema,
  // Risk
  calculateRiskSchema,
  flagVenueSchema,
  resolveFlagSchema,
  // Bank
  verifyBankAccountSchema,
  createPayoutMethodSchema,
  // Document
  uploadDocumentSchema,
  getDocumentSchema,
  // GDPR
  gdprDeletionSchema,
  gdprExportSchema,
  // Admin
  updateComplianceSettingsSchema,
  // Pagination
  paginationSchema,
  // Params
  flagIdParamSchema,
  // Helpers
  validateBody,
  validateQuery,
  validateParams,
  safeValidate
} from '../../../src/validators/schemas';

// =============================================================================
// COMMON VALIDATORS TESTS
// =============================================================================

describe('Common Validators', () => {
  describe('einSchema', () => {
    it('should accept valid EIN format XX-XXXXXXX', () => {
      expect(einSchema.parse('12-3456789')).toBe('12-3456789');
      expect(einSchema.parse('00-0000000')).toBe('00-0000000');
      expect(einSchema.parse('99-9999999')).toBe('99-9999999');
    });

    it('should reject invalid EIN formats', () => {
      expect(() => einSchema.parse('123456789')).toThrow();
      expect(() => einSchema.parse('12-345678')).toThrow();
      expect(() => einSchema.parse('12-34567890')).toThrow();
      expect(() => einSchema.parse('1-23456789')).toThrow();
      expect(() => einSchema.parse('AB-CDEFGHI')).toThrow();
      expect(() => einSchema.parse('')).toThrow();
    });
  });

  describe('emailSchema', () => {
    it('should accept valid email formats', () => {
      expect(emailSchema.parse('test@example.com')).toBe('test@example.com');
      expect(emailSchema.parse('user.name@domain.co.uk')).toBe('user.name@domain.co.uk');
      expect(emailSchema.parse('user+tag@example.org')).toBe('user+tag@example.org');
    });

    it('should reject invalid email formats', () => {
      expect(() => emailSchema.parse('not-an-email')).toThrow();
      expect(() => emailSchema.parse('@example.com')).toThrow();
      expect(() => emailSchema.parse('user@')).toThrow();
      expect(() => emailSchema.parse('')).toThrow();
    });

    it('should reject emails longer than 255 characters', () => {
      const longEmail = 'a'.repeat(250) + '@test.com';
      expect(() => emailSchema.parse(longEmail)).toThrow();
    });
  });

  describe('phoneSchema', () => {
    it('should accept valid phone numbers', () => {
      expect(phoneSchema.parse('1234567890')).toBe('1234567890');
      expect(phoneSchema.parse('+11234567890')).toBe('+11234567890');
      expect(phoneSchema.parse('15551234567')).toBe('15551234567');
    });

    it('should reject invalid phone numbers', () => {
      expect(() => phoneSchema.parse('123')).toThrow();
      expect(() => phoneSchema.parse('abcdefghij')).toThrow();
    });

    it('should allow undefined (optional)', () => {
      expect(phoneSchema.parse(undefined)).toBeUndefined();
    });
  });

  describe('currencySchema', () => {
    it('should accept valid currency amounts', () => {
      expect(currencySchema.parse(0)).toBe(0);
      expect(currencySchema.parse(100)).toBe(100);
      expect(currencySchema.parse(999999999)).toBe(999999999);
      expect(currencySchema.parse(50.5)).toBe(50.5);
    });

    it('should reject negative amounts', () => {
      expect(() => currencySchema.parse(-1)).toThrow();
      expect(() => currencySchema.parse(-100)).toThrow();
    });

    it('should reject amounts exceeding maximum', () => {
      expect(() => currencySchema.parse(1000000001)).toThrow();
    });
  });

  describe('uuidSchema', () => {
    it('should accept valid UUIDs', () => {
      expect(uuidSchema.parse('550e8400-e29b-41d4-a716-446655440000')).toBeTruthy();
      expect(uuidSchema.parse('00000000-0000-0000-0000-000000000000')).toBeTruthy();
    });

    it('should reject invalid UUIDs', () => {
      expect(() => uuidSchema.parse('not-a-uuid')).toThrow();
      expect(() => uuidSchema.parse('550e8400-e29b-41d4-a716')).toThrow();
      expect(() => uuidSchema.parse('')).toThrow();
    });
  });

  describe('yearSchema', () => {
    it('should accept valid years', () => {
      expect(yearSchema.parse(2024)).toBe(2024);
      expect(yearSchema.parse(1900)).toBe(1900);
      expect(yearSchema.parse(2100)).toBe(2100);
    });

    it('should reject years outside range', () => {
      expect(() => yearSchema.parse(1899)).toThrow();
      expect(() => yearSchema.parse(2101)).toThrow();
    });

    it('should reject non-integer years', () => {
      expect(() => yearSchema.parse(2024.5)).toThrow();
    });
  });

  describe('venueIdSchema', () => {
    it('should accept valid venue IDs', () => {
      expect(venueIdSchema.parse('venue-123')).toBe('venue-123');
      expect(venueIdSchema.parse('a')).toBe('a');
    });

    it('should reject empty venue ID', () => {
      expect(() => venueIdSchema.parse('')).toThrow();
    });

    it('should reject venue ID over 100 characters', () => {
      expect(() => venueIdSchema.parse('a'.repeat(101))).toThrow();
    });
  });

  describe('accountNumberSchema', () => {
    it('should accept valid account numbers (6-17 digits)', () => {
      expect(accountNumberSchema.parse('123456')).toBe('123456');
      expect(accountNumberSchema.parse('12345678901234567')).toBe('12345678901234567');
    });

    it('should reject account numbers with wrong length', () => {
      expect(() => accountNumberSchema.parse('12345')).toThrow();
      expect(() => accountNumberSchema.parse('123456789012345678')).toThrow();
    });

    it('should reject non-numeric account numbers', () => {
      expect(() => accountNumberSchema.parse('12345A')).toThrow();
    });
  });

  describe('routingNumberSchema', () => {
    it('should accept valid 9-digit routing numbers', () => {
      expect(routingNumberSchema.parse('021000021')).toBe('021000021');
      expect(routingNumberSchema.parse('123456789')).toBe('123456789');
    });

    it('should reject routing numbers with wrong length', () => {
      expect(() => routingNumberSchema.parse('12345678')).toThrow();
      expect(() => routingNumberSchema.parse('1234567890')).toThrow();
    });

    it('should reject non-numeric routing numbers', () => {
      expect(() => routingNumberSchema.parse('12345678A')).toThrow();
    });
  });

  describe('addressSchema', () => {
    const validAddress = {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'US'
    };

    it('should accept valid address', () => {
      const result = addressSchema.parse(validAddress);
      expect(result).toEqual(validAddress);
    });

    it('should accept ZIP+4 format', () => {
      const address = { ...validAddress, zipCode: '10001-1234' };
      expect(addressSchema.parse(address).zipCode).toBe('10001-1234');
    });

    it('should default country to US', () => {
      const { country, ...addressWithoutCountry } = validAddress;
      const result = addressSchema.parse(addressWithoutCountry);
      expect(result.country).toBe('US');
    });

    it('should reject invalid state code', () => {
      expect(() => addressSchema.parse({ ...validAddress, state: 'NEW' })).toThrow();
      expect(() => addressSchema.parse({ ...validAddress, state: 'N' })).toThrow();
    });

    it('should reject invalid ZIP code', () => {
      expect(() => addressSchema.parse({ ...validAddress, zipCode: '1234' })).toThrow();
      expect(() => addressSchema.parse({ ...validAddress, zipCode: 'ABCDE' })).toThrow();
    });
  });
});

// =============================================================================
// VENUE VERIFICATION SCHEMAS TESTS
// =============================================================================

describe('Venue Verification Schemas', () => {
  describe('startVerificationSchema', () => {
    const validData = {
      venueId: 'venue-123',
      businessName: 'Test Business LLC',
      ein: '12-3456789',
      businessAddress: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001'
      },
      representativeName: 'John Doe',
      representativeEmail: 'john@example.com'
    };

    it('should accept valid verification data', () => {
      const result = startVerificationSchema.parse(validData);
      expect(result.venueId).toBe('venue-123');
      expect(result.businessName).toBe('Test Business LLC');
    });

    it('should accept optional phone', () => {
      const withPhone = { ...validData, representativePhone: '1234567890' };
      expect(startVerificationSchema.parse(withPhone).representativePhone).toBe('1234567890');
    });

    it('should reject missing required fields', () => {
      expect(() => startVerificationSchema.parse({})).toThrow();
      expect(() => startVerificationSchema.parse({ venueId: 'test' })).toThrow();
    });
  });

  describe('updateStatusSchema', () => {
    it('should accept valid status update', () => {
      const result = updateStatusSchema.parse({
        venueId: 'venue-123',
        status: 'verified'
      });
      expect(result.status).toBe('verified');
    });

    it('should accept rejection reason', () => {
      const result = updateStatusSchema.parse({
        venueId: 'venue-123',
        status: 'rejected',
        rejectionReason: 'Invalid documentation'
      });
      expect(result.rejectionReason).toBe('Invalid documentation');
    });

    it('should only accept valid status values', () => {
      expect(() => updateStatusSchema.parse({
        venueId: 'venue-123',
        status: 'invalid-status'
      })).toThrow();
    });
  });
});

// =============================================================================
// TAX REPORTING SCHEMAS TESTS
// =============================================================================

describe('Tax Reporting Schemas', () => {
  describe('trackSaleSchema', () => {
    it('should accept valid sale data', () => {
      const result = trackSaleSchema.parse({
        venueId: 'venue-123',
        amount: 5000,
        ticketId: 'ticket-456'
      });
      expect(result.amount).toBe(5000);
    });

    it('should reject negative amounts', () => {
      expect(() => trackSaleSchema.parse({
        venueId: 'venue-123',
        amount: -100,
        ticketId: 'ticket-456'
      })).toThrow();
    });
  });

  describe('calculateTaxSchema', () => {
    it('should accept valid tax calculation request', () => {
      const result = calculateTaxSchema.parse({
        amount: 10000,
        venueId: 'venue-123'
      });
      expect(result.amount).toBe(10000);
    });

    it('should accept optional taxRate', () => {
      const result = calculateTaxSchema.parse({
        amount: 10000,
        venueId: 'venue-123',
        taxRate: 0.08
      });
      expect(result.taxRate).toBe(0.08);
    });

    it('should reject taxRate outside 0-1 range', () => {
      expect(() => calculateTaxSchema.parse({
        amount: 10000,
        venueId: 'venue-123',
        taxRate: 1.5
      })).toThrow();
    });
  });
});

// =============================================================================
// RISK SCHEMAS TESTS
// =============================================================================

describe('Risk Schemas', () => {
  describe('flagVenueSchema', () => {
    it('should accept valid flag request', () => {
      const result = flagVenueSchema.parse({
        venueId: 'venue-123',
        reason: 'Suspicious activity detected in transaction patterns'
      });
      expect(result.venueId).toBe('venue-123');
    });

    it('should reject reason shorter than 10 characters', () => {
      expect(() => flagVenueSchema.parse({
        venueId: 'venue-123',
        reason: 'Too short'
      })).toThrow();
    });

    it('should reject reason longer than 1000 characters', () => {
      expect(() => flagVenueSchema.parse({
        venueId: 'venue-123',
        reason: 'x'.repeat(1001)
      })).toThrow();
    });
  });

  describe('resolveFlagSchema', () => {
    it('should accept valid resolution', () => {
      const result = resolveFlagSchema.parse({
        resolution: 'Investigated and found to be legitimate activity'
      });
      expect(result.resolution).toContain('Investigated');
    });

    it('should reject resolution shorter than 10 characters', () => {
      expect(() => resolveFlagSchema.parse({
        resolution: 'OK'
      })).toThrow();
    });
  });
});

// =============================================================================
// BANK VERIFICATION SCHEMAS TESTS
// =============================================================================

describe('Bank Verification Schemas', () => {
  describe('verifyBankAccountSchema', () => {
    it('should accept valid bank account data', () => {
      const result = verifyBankAccountSchema.parse({
        venueId: 'venue-123',
        accountNumber: '123456789012',
        routingNumber: '021000021'
      });
      expect(result.accountNumber).toBe('123456789012');
      expect(result.routingNumber).toBe('021000021');
    });

    it('should reject invalid account number', () => {
      expect(() => verifyBankAccountSchema.parse({
        venueId: 'venue-123',
        accountNumber: '12345',
        routingNumber: '021000021'
      })).toThrow();
    });
  });
});

// =============================================================================
// DOCUMENT SCHEMAS TESTS
// =============================================================================

describe('Document Schemas', () => {
  describe('uploadDocumentSchema', () => {
    it('should accept valid document types', () => {
      const types = ['W9', 'ID', 'PROOF_OF_ADDRESS', 'BUSINESS_LICENSE', 'OTHER'];
      types.forEach(type => {
        const result = uploadDocumentSchema.parse({
          venueId: 'venue-123',
          documentType: type
        });
        expect(result.documentType).toBe(type);
      });
    });

    it('should reject invalid document types', () => {
      expect(() => uploadDocumentSchema.parse({
        venueId: 'venue-123',
        documentType: 'INVALID_TYPE'
      })).toThrow();
    });
  });
});

// =============================================================================
// GDPR SCHEMAS TESTS
// =============================================================================

describe('GDPR Schemas', () => {
  describe('gdprExportSchema', () => {
    it('should accept valid export request', () => {
      const result = gdprExportSchema.parse({
        userId: 'user-123'
      });
      expect(result.format).toBe('json'); // default
    });

    it('should accept csv format', () => {
      const result = gdprExportSchema.parse({
        userId: 'user-123',
        format: 'csv'
      });
      expect(result.format).toBe('csv');
    });
  });

  describe('gdprDeletionSchema', () => {
    it('should accept valid deletion request', () => {
      const result = gdprDeletionSchema.parse({
        userId: 'user-123',
        requestedBy: 'admin@example.com'
      });
      expect(result.userId).toBe('user-123');
    });

    it('should accept optional reason', () => {
      const result = gdprDeletionSchema.parse({
        userId: 'user-123',
        requestedBy: 'admin@example.com',
        reason: 'User requested account deletion per GDPR Article 17'
      });
      expect(result.reason).toContain('GDPR');
    });
  });
});

// =============================================================================
// PAGINATION SCHEMA TESTS
// =============================================================================

describe('Pagination Schema', () => {
  it('should use default values', () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('should accept custom pagination', () => {
    const result = paginationSchema.parse({ page: 5, limit: 50 });
    expect(result.page).toBe(5);
    expect(result.limit).toBe(50);
  });

  it('should reject page less than 1', () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow();
  });

  it('should reject limit greater than 100', () => {
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
  });
});

// =============================================================================
// PARAM SCHEMAS TESTS
// =============================================================================

describe('Param Schemas', () => {
  describe('flagIdParamSchema', () => {
    it('should transform string to number', () => {
      const result = flagIdParamSchema.parse({ flagId: '123' });
      expect(result.flagId).toBe(123);
      expect(typeof result.flagId).toBe('number');
    });

    it('should reject non-numeric flag ID', () => {
      expect(() => flagIdParamSchema.parse({ flagId: 'abc' })).toThrow();
    });
  });
});

// =============================================================================
// HELPER FUNCTIONS TESTS
// =============================================================================

describe('Validation Helper Functions', () => {
  describe('validateBody', () => {
    it('should return parsed data for valid input', () => {
      const result = validateBody(einSchema, '12-3456789');
      expect(result).toBe('12-3456789');
    });

    it('should throw for invalid input', () => {
      expect(() => validateBody(einSchema, 'invalid')).toThrow();
    });
  });

  describe('validateQuery', () => {
    it('should return parsed data for valid input', () => {
      const result = validateQuery(yearSchema, 2024);
      expect(result).toBe(2024);
    });
  });

  describe('validateParams', () => {
    it('should return parsed data for valid input', () => {
      const result = validateParams(venueIdSchema, 'venue-123');
      expect(result).toBe('venue-123');
    });
  });

  describe('safeValidate', () => {
    it('should return success=true with data for valid input', () => {
      const result = safeValidate(einSchema, '12-3456789');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('12-3456789');
      }
    });

    it('should return success=false with error for invalid input', () => {
      const result = safeValidate(einSchema, 'invalid');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(z.ZodError);
      }
    });

    it('should not throw for invalid input', () => {
      expect(() => safeValidate(einSchema, 'invalid')).not.toThrow();
    });
  });
});
