/**
 * Unit Tests for Validation Utilities
 * 
 * Tests payment amount, ticket count, venue ID, and currency validation.
 */

import {
  ValidationError,
  validatePaymentAmount,
  validateTicketCount,
  validateVenueId,
  validateCurrencyCode,
  validatePaymentRequest,
  formatValidationError,
} from '../../../src/utils/validation.util';

describe('Validation Utilities', () => {
  describe('ValidationError', () => {
    it('should create error with message, code, and field', () => {
      const error = new ValidationError('Test message', 'TEST_CODE', 'testField');
      
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.field).toBe('testField');
      expect(error.name).toBe('ValidationError');
    });

    it('should create error without field', () => {
      const error = new ValidationError('Test message', 'TEST_CODE');
      
      expect(error.field).toBeUndefined();
    });

    it('should be instanceof Error', () => {
      const error = new ValidationError('Test', 'CODE');
      
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('validatePaymentAmount', () => {
    it('should accept valid amount (100 cents)', () => {
      expect(() => validatePaymentAmount(100)).not.toThrow();
    });

    it('should accept valid amount (1000 cents)', () => {
      expect(() => validatePaymentAmount(1000)).not.toThrow();
    });

    it('should accept maximum allowed amount', () => {
      expect(() => validatePaymentAmount(100000000)).not.toThrow(); // $1,000,000
    });

    it('should reject non-number values', () => {
      expect(() => validatePaymentAmount('100' as any)).toThrow(ValidationError);
      expect(() => validatePaymentAmount('100' as any)).toThrow('Payment amount must be a valid number');
    });

    it('should reject NaN', () => {
      expect(() => validatePaymentAmount(NaN)).toThrow(ValidationError);
    });

    it('should reject decimal amounts', () => {
      expect(() => validatePaymentAmount(100.5)).toThrow(ValidationError);
      expect(() => validatePaymentAmount(100.5)).toThrow('integer cents');
    });

    it('should reject amounts below $1.00', () => {
      expect(() => validatePaymentAmount(99)).toThrow(ValidationError);
      expect(() => validatePaymentAmount(50)).toThrow('at least $1.00');
    });

    it('should reject amounts above $1,000,000', () => {
      expect(() => validatePaymentAmount(100000001)).toThrow(ValidationError);
      expect(() => validatePaymentAmount(100000001)).toThrow('cannot exceed $1,000,000');
    });

    it('should reject negative amounts', () => {
      expect(() => validatePaymentAmount(-100)).toThrow(ValidationError);
      expect(() => validatePaymentAmount(-100)).toThrow('cannot be negative');
    });

    it('should reject zero amount', () => {
      expect(() => validatePaymentAmount(0)).toThrow(ValidationError);
      expect(() => validatePaymentAmount(0)).toThrow('cannot be zero');
    });

    it('should set correct error code for minimum payment', () => {
      try {
        validatePaymentAmount(50);
      } catch (error) {
        expect((error as ValidationError).code).toBe('MINIMUM_PAYMENT_$1');
      }
    });

    it('should set correct error code for maximum payment', () => {
      try {
        validatePaymentAmount(200000000);
      } catch (error) {
        expect((error as ValidationError).code).toBe('MAXIMUM_PAYMENT_$1M');
      }
    });
  });

  describe('validateTicketCount', () => {
    it('should accept valid ticket count (1)', () => {
      expect(() => validateTicketCount(1)).not.toThrow();
    });

    it('should accept valid ticket count (50)', () => {
      expect(() => validateTicketCount(50)).not.toThrow();
    });

    it('should accept maximum ticket count (100)', () => {
      expect(() => validateTicketCount(100)).not.toThrow();
    });

    it('should reject non-number values', () => {
      expect(() => validateTicketCount('5' as any)).toThrow(ValidationError);
    });

    it('should reject NaN', () => {
      expect(() => validateTicketCount(NaN)).toThrow(ValidationError);
    });

    it('should reject decimal values', () => {
      expect(() => validateTicketCount(2.5)).toThrow(ValidationError);
      expect(() => validateTicketCount(2.5)).toThrow('must be an integer');
    });

    it('should reject zero', () => {
      expect(() => validateTicketCount(0)).toThrow(ValidationError);
      expect(() => validateTicketCount(0)).toThrow('at least 1');
    });

    it('should reject negative numbers', () => {
      expect(() => validateTicketCount(-1)).toThrow(ValidationError);
    });

    it('should reject more than 100 tickets', () => {
      expect(() => validateTicketCount(101)).toThrow(ValidationError);
      expect(() => validateTicketCount(101)).toThrow('more than 100 tickets');
    });

    it('should set correct error code for maximum exceeded', () => {
      try {
        validateTicketCount(200);
      } catch (error) {
        expect((error as ValidationError).code).toBe('MAXIMUM_TICKET_COUNT_EXCEEDED');
      }
    });
  });

  describe('validateVenueId', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';

    it('should accept valid UUID v4', () => {
      expect(() => validateVenueId(validUuid)).not.toThrow();
    });

    it('should accept uppercase UUID', () => {
      expect(() => validateVenueId('550E8400-E29B-41D4-A716-446655440000')).not.toThrow();
    });

    it('should reject empty string', () => {
      expect(() => validateVenueId('')).toThrow(ValidationError);
    });

    it('should reject null/undefined', () => {
      expect(() => validateVenueId(null as any)).toThrow(ValidationError);
      expect(() => validateVenueId(undefined as any)).toThrow(ValidationError);
    });

    it('should reject non-string values', () => {
      expect(() => validateVenueId(123 as any)).toThrow(ValidationError);
    });

    it('should reject invalid UUID format', () => {
      expect(() => validateVenueId('not-a-uuid')).toThrow(ValidationError);
      expect(() => validateVenueId('not-a-uuid')).toThrow('valid UUID v4');
    });

    it('should reject UUID without correct version', () => {
      // UUID v1 format (first digit of third group should be 4 for v4)
      expect(() => validateVenueId('550e8400-e29b-11d4-a716-446655440000')).toThrow(ValidationError);
    });

    it('should reject UUID with wrong variant', () => {
      // Variant should be 8, 9, a, or b in fourth group
      expect(() => validateVenueId('550e8400-e29b-41d4-0716-446655440000')).toThrow(ValidationError);
    });

    it('should set correct error code for invalid format', () => {
      try {
        validateVenueId('invalid');
      } catch (error) {
        expect((error as ValidationError).code).toBe('INVALID_VENUE_ID_FORMAT');
      }
    });
  });

  describe('validateCurrencyCode', () => {
    it('should accept USD', () => {
      expect(() => validateCurrencyCode('USD')).not.toThrow();
    });

    it('should reject empty string', () => {
      expect(() => validateCurrencyCode('')).toThrow(ValidationError);
    });

    it('should reject null/undefined', () => {
      expect(() => validateCurrencyCode(null as any)).toThrow(ValidationError);
      expect(() => validateCurrencyCode(undefined as any)).toThrow(ValidationError);
    });

    it('should reject lowercase', () => {
      expect(() => validateCurrencyCode('usd')).toThrow(ValidationError);
    });

    it('should reject mixed case', () => {
      expect(() => validateCurrencyCode('Usd')).toThrow(ValidationError);
    });

    it('should reject 2-letter codes', () => {
      expect(() => validateCurrencyCode('US')).toThrow(ValidationError);
    });

    it('should reject 4-letter codes', () => {
      expect(() => validateCurrencyCode('USDD')).toThrow(ValidationError);
    });

    it('should reject codes with numbers', () => {
      expect(() => validateCurrencyCode('US1')).toThrow(ValidationError);
    });

    it('should reject unsupported currencies', () => {
      expect(() => validateCurrencyCode('EUR')).toThrow(ValidationError);
      expect(() => validateCurrencyCode('EUR')).toThrow('not currently supported');
    });

    it('should list supported currencies in error', () => {
      try {
        validateCurrencyCode('GBP');
      } catch (error) {
        expect((error as ValidationError).message).toContain('USD');
      }
    });

    it('should set correct error code for unsupported currency', () => {
      try {
        validateCurrencyCode('CAD');
      } catch (error) {
        expect((error as ValidationError).code).toBe('UNSUPPORTED_CURRENCY');
      }
    });
  });

  describe('validatePaymentRequest', () => {
    const validRequest = {
      amountCents: 5000, // $50
      ticketCount: 2,
      venueId: '550e8400-e29b-41d4-a716-446655440000',
    };

    it('should accept valid request', () => {
      expect(() => validatePaymentRequest(validRequest)).not.toThrow();
    });

    it('should accept valid request with currency', () => {
      expect(() => validatePaymentRequest({ ...validRequest, currency: 'USD' })).not.toThrow();
    });

    it('should validate amount', () => {
      expect(() => validatePaymentRequest({
        ...validRequest,
        amountCents: 50, // Below minimum
      })).toThrow(ValidationError);
    });

    it('should validate ticket count', () => {
      expect(() => validatePaymentRequest({
        ...validRequest,
        ticketCount: 0,
      })).toThrow(ValidationError);
    });

    it('should validate venue ID', () => {
      expect(() => validatePaymentRequest({
        ...validRequest,
        venueId: 'invalid',
      })).toThrow(ValidationError);
    });

    it('should validate currency if provided', () => {
      expect(() => validatePaymentRequest({
        ...validRequest,
        currency: 'invalid',
      })).toThrow(ValidationError);
    });

    it('should reject average price below $5 per ticket', () => {
      expect(() => validatePaymentRequest({
        amountCents: 800, // $8 total
        ticketCount: 2,   // $4 per ticket
        venueId: '550e8400-e29b-41d4-a716-446655440000',
      })).toThrow(ValidationError);
      
      expect(() => validatePaymentRequest({
        amountCents: 800,
        ticketCount: 2,
        venueId: '550e8400-e29b-41d4-a716-446655440000',
      })).toThrow('less than $5.00');
    });

    it('should reject average price above $10,000 per ticket', () => {
      expect(() => validatePaymentRequest({
        amountCents: 2500000, // $25,000 total
        ticketCount: 2,       // $12,500 per ticket
        venueId: '550e8400-e29b-41d4-a716-446655440000',
      })).toThrow(ValidationError);
      
      expect(() => validatePaymentRequest({
        amountCents: 2500000,
        ticketCount: 2,
        venueId: '550e8400-e29b-41d4-a716-446655440000',
      })).toThrow('exceed $10,000');
    });

    it('should accept exactly $5 per ticket', () => {
      expect(() => validatePaymentRequest({
        amountCents: 1000, // $10 total
        ticketCount: 2,    // $5 per ticket
        venueId: '550e8400-e29b-41d4-a716-446655440000',
      })).not.toThrow();
    });

    it('should accept exactly $10,000 per ticket', () => {
      expect(() => validatePaymentRequest({
        amountCents: 2000000, // $20,000 total
        ticketCount: 2,       // $10,000 per ticket
        venueId: '550e8400-e29b-41d4-a716-446655440000',
      })).not.toThrow();
    });
  });

  describe('formatValidationError', () => {
    it('should format error with all fields', () => {
      const error = new ValidationError('Test message', 'TEST_CODE', 'testField');
      const formatted = formatValidationError(error);

      expect(formatted).toEqual({
        error: {
          code: 'TEST_CODE',
          message: 'Test message',
          field: 'testField',
          type: 'validation_error',
        },
      });
    });

    it('should format error without field', () => {
      const error = new ValidationError('Test message', 'TEST_CODE');
      const formatted = formatValidationError(error);

      expect(formatted.error.field).toBeUndefined();
    });

    it('should always set type to validation_error', () => {
      const error = new ValidationError('Test', 'CODE');
      const formatted = formatValidationError(error);

      expect(formatted.error.type).toBe('validation_error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle Infinity', () => {
      expect(() => validatePaymentAmount(Infinity)).toThrow(ValidationError);
    });

    it('should handle -Infinity', () => {
      expect(() => validatePaymentAmount(-Infinity)).toThrow(ValidationError);
    });

    it('should handle very large valid amounts', () => {
      expect(() => validatePaymentAmount(99999999)).not.toThrow(); // Just under $1M
    });

    it('should handle large ticket counts at boundary', () => {
      expect(() => validateTicketCount(100)).not.toThrow();
    });

    it('should handle UUID with all zeros', () => {
      // This is technically a valid UUID format but version 4 specific
      expect(() => validateVenueId('00000000-0000-4000-8000-000000000000')).not.toThrow();
    });
  });
});
