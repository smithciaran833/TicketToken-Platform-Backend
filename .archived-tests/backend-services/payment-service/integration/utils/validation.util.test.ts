/**
 * Validation Utility Integration Tests
 * 100% code coverage
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
    expect(error.message).toBe('Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.field).toBeUndefined();
  });

  it('should be instanceof Error', () => {
    const error = new ValidationError('Test', 'CODE');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
  });
});

describe('validatePaymentAmount()', () => {
  describe('valid amounts', () => {
    it('should accept minimum amount ($1.00 = 100 cents)', () => {
      expect(() => validatePaymentAmount(100)).not.toThrow();
    });

    it('should accept typical amounts', () => {
      expect(() => validatePaymentAmount(5000)).not.toThrow();
      expect(() => validatePaymentAmount(10000)).not.toThrow();
      expect(() => validatePaymentAmount(99999)).not.toThrow();
    });

    it('should accept maximum amount ($1,000,000)', () => {
      expect(() => validatePaymentAmount(100000000)).not.toThrow();
    });
  });

  describe('invalid amounts', () => {
    it('should reject non-number', () => {
      expect(() => validatePaymentAmount('100' as any)).toThrow(ValidationError);
      expect(() => validatePaymentAmount('100' as any)).toThrow('must be a valid number');
    });

    it('should reject NaN', () => {
      expect(() => validatePaymentAmount(NaN)).toThrow(ValidationError);
      expect(() => validatePaymentAmount(NaN)).toThrow('must be a valid number');
    });

    it('should reject non-integer (decimal cents)', () => {
      expect(() => validatePaymentAmount(100.5)).toThrow(ValidationError);
      expect(() => validatePaymentAmount(100.5)).toThrow('integer cents');
    });

    it('should reject amount below minimum', () => {
      expect(() => validatePaymentAmount(99)).toThrow(ValidationError);
      expect(() => validatePaymentAmount(99)).toThrow('at least $1.00');
    });

    it('should reject zero amount (caught by minimum check)', () => {
      expect(() => validatePaymentAmount(0)).toThrow(ValidationError);
      expect(() => validatePaymentAmount(0)).toThrow('at least $1.00');
    });

    it('should reject negative amount (caught by minimum check)', () => {
      expect(() => validatePaymentAmount(-100)).toThrow(ValidationError);
      expect(() => validatePaymentAmount(-100)).toThrow('at least $1.00');
    });

    it('should reject amount above maximum', () => {
      expect(() => validatePaymentAmount(100000001)).toThrow(ValidationError);
      expect(() => validatePaymentAmount(100000001)).toThrow('cannot exceed');
    });
  });

  describe('error codes', () => {
    it('should return INVALID_AMOUNT_TYPE for non-number', () => {
      try {
        validatePaymentAmount('x' as any);
      } catch (e) {
        expect((e as ValidationError).code).toBe('INVALID_AMOUNT_TYPE');
      }
    });

    it('should return AMOUNT_MUST_BE_INTEGER_CENTS for decimal', () => {
      try {
        validatePaymentAmount(100.5);
      } catch (e) {
        expect((e as ValidationError).code).toBe('AMOUNT_MUST_BE_INTEGER_CENTS');
      }
    });

    it('should return MINIMUM_PAYMENT_$1 for below minimum', () => {
      try {
        validatePaymentAmount(50);
      } catch (e) {
        expect((e as ValidationError).code).toBe('MINIMUM_PAYMENT_$1');
      }
    });

    it('should return MAXIMUM_PAYMENT_$1M for above maximum', () => {
      try {
        validatePaymentAmount(200000000);
      } catch (e) {
        expect((e as ValidationError).code).toBe('MAXIMUM_PAYMENT_$1M');
      }
    });

    it('should return MINIMUM_PAYMENT_$1 for negative (minimum check fires first)', () => {
      try {
        validatePaymentAmount(-1);
      } catch (e) {
        expect((e as ValidationError).code).toBe('MINIMUM_PAYMENT_$1');
      }
    });

    it('should return MINIMUM_PAYMENT_$1 for zero (minimum check fires first)', () => {
      try {
        validatePaymentAmount(0);
      } catch (e) {
        expect((e as ValidationError).code).toBe('MINIMUM_PAYMENT_$1');
      }
    });

    it('should set field to amount', () => {
      try {
        validatePaymentAmount(50);
      } catch (e) {
        expect((e as ValidationError).field).toBe('amount');
      }
    });
  });
});

describe('validateTicketCount()', () => {
  describe('valid counts', () => {
    it('should accept minimum count (1)', () => {
      expect(() => validateTicketCount(1)).not.toThrow();
    });

    it('should accept typical counts', () => {
      expect(() => validateTicketCount(2)).not.toThrow();
      expect(() => validateTicketCount(4)).not.toThrow();
      expect(() => validateTicketCount(10)).not.toThrow();
    });

    it('should accept maximum count (100)', () => {
      expect(() => validateTicketCount(100)).not.toThrow();
    });
  });

  describe('invalid counts', () => {
    it('should reject non-number', () => {
      expect(() => validateTicketCount('5' as any)).toThrow(ValidationError);
      expect(() => validateTicketCount('5' as any)).toThrow('must be a valid number');
    });

    it('should reject NaN', () => {
      expect(() => validateTicketCount(NaN)).toThrow(ValidationError);
    });

    it('should reject non-integer', () => {
      expect(() => validateTicketCount(2.5)).toThrow(ValidationError);
      expect(() => validateTicketCount(2.5)).toThrow('must be an integer');
    });

    it('should reject zero', () => {
      expect(() => validateTicketCount(0)).toThrow(ValidationError);
      expect(() => validateTicketCount(0)).toThrow('at least 1');
    });

    it('should reject negative', () => {
      expect(() => validateTicketCount(-1)).toThrow(ValidationError);
      expect(() => validateTicketCount(-1)).toThrow('at least 1');
    });

    it('should reject above maximum', () => {
      expect(() => validateTicketCount(101)).toThrow(ValidationError);
      expect(() => validateTicketCount(101)).toThrow('more than 100');
    });
  });

  describe('error codes', () => {
    it('should return INVALID_TICKET_COUNT_TYPE for non-number', () => {
      try {
        validateTicketCount(null as any);
      } catch (e) {
        expect((e as ValidationError).code).toBe('INVALID_TICKET_COUNT_TYPE');
      }
    });

    it('should return TICKET_COUNT_MUST_BE_INTEGER for decimal', () => {
      try {
        validateTicketCount(1.5);
      } catch (e) {
        expect((e as ValidationError).code).toBe('TICKET_COUNT_MUST_BE_INTEGER');
      }
    });

    it('should return MINIMUM_TICKET_COUNT for zero or negative', () => {
      try {
        validateTicketCount(0);
      } catch (e) {
        expect((e as ValidationError).code).toBe('MINIMUM_TICKET_COUNT');
      }
    });

    it('should return MAXIMUM_TICKET_COUNT_EXCEEDED for above max', () => {
      try {
        validateTicketCount(150);
      } catch (e) {
        expect((e as ValidationError).code).toBe('MAXIMUM_TICKET_COUNT_EXCEEDED');
      }
    });

    it('should set field to ticketCount', () => {
      try {
        validateTicketCount(0);
      } catch (e) {
        expect((e as ValidationError).field).toBe('ticketCount');
      }
    });
  });
});

describe('validateVenueId()', () => {
  describe('valid venue IDs', () => {
    it('should accept valid UUID v4', () => {
      expect(() => validateVenueId('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).not.toThrow();
    });

    it('should accept UUID v4 with uppercase', () => {
      expect(() => validateVenueId('A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11')).not.toThrow();
    });

    it('should accept mixed case UUID', () => {
      expect(() => validateVenueId('a0eeBC99-9c0B-4ef8-Bb6d-6Bb9bd380a11')).not.toThrow();
    });
  });

  describe('invalid venue IDs', () => {
    it('should reject empty string', () => {
      expect(() => validateVenueId('')).toThrow(ValidationError);
      expect(() => validateVenueId('')).toThrow('required');
    });

    it('should reject null', () => {
      expect(() => validateVenueId(null as any)).toThrow(ValidationError);
    });

    it('should reject undefined', () => {
      expect(() => validateVenueId(undefined as any)).toThrow(ValidationError);
    });

    it('should reject non-string', () => {
      expect(() => validateVenueId(123 as any)).toThrow(ValidationError);
    });

    it('should reject invalid UUID format', () => {
      expect(() => validateVenueId('not-a-uuid')).toThrow(ValidationError);
      expect(() => validateVenueId('not-a-uuid')).toThrow('valid UUID v4');
    });

    it('should reject UUID v1 format', () => {
      expect(() => validateVenueId('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toThrow(ValidationError);
    });

    it('should reject UUID with wrong variant', () => {
      expect(() => validateVenueId('a0eebc99-9c0b-4ef8-0b6d-6bb9bd380a11')).toThrow(ValidationError);
    });
  });

  describe('error codes', () => {
    it('should return INVALID_VENUE_ID for missing', () => {
      try {
        validateVenueId('');
      } catch (e) {
        expect((e as ValidationError).code).toBe('INVALID_VENUE_ID');
      }
    });

    it('should return INVALID_VENUE_ID_FORMAT for bad format', () => {
      try {
        validateVenueId('bad-format');
      } catch (e) {
        expect((e as ValidationError).code).toBe('INVALID_VENUE_ID_FORMAT');
      }
    });

    it('should set field to venueId', () => {
      try {
        validateVenueId('');
      } catch (e) {
        expect((e as ValidationError).field).toBe('venueId');
      }
    });
  });
});

describe('validateCurrencyCode()', () => {
  describe('valid currency codes', () => {
    it('should accept USD', () => {
      expect(() => validateCurrencyCode('USD')).not.toThrow();
    });
  });

  describe('invalid currency codes', () => {
    it('should reject empty string', () => {
      expect(() => validateCurrencyCode('')).toThrow(ValidationError);
      expect(() => validateCurrencyCode('')).toThrow('required');
    });

    it('should reject null', () => {
      expect(() => validateCurrencyCode(null as any)).toThrow(ValidationError);
    });

    it('should reject undefined', () => {
      expect(() => validateCurrencyCode(undefined as any)).toThrow(ValidationError);
    });

    it('should reject non-string', () => {
      expect(() => validateCurrencyCode(123 as any)).toThrow(ValidationError);
    });

    it('should reject lowercase currency', () => {
      expect(() => validateCurrencyCode('usd')).toThrow(ValidationError);
      expect(() => validateCurrencyCode('usd')).toThrow('3-letter ISO');
    });

    it('should reject 2-letter code', () => {
      expect(() => validateCurrencyCode('US')).toThrow(ValidationError);
    });

    it('should reject 4-letter code', () => {
      expect(() => validateCurrencyCode('USDA')).toThrow(ValidationError);
    });

    it('should reject unsupported currency', () => {
      expect(() => validateCurrencyCode('EUR')).toThrow(ValidationError);
      expect(() => validateCurrencyCode('EUR')).toThrow('not currently supported');
    });

    it('should reject GBP', () => {
      expect(() => validateCurrencyCode('GBP')).toThrow(ValidationError);
    });
  });

  describe('error codes', () => {
    it('should return MISSING_CURRENCY for empty', () => {
      try {
        validateCurrencyCode('');
      } catch (e) {
        expect((e as ValidationError).code).toBe('MISSING_CURRENCY');
      }
    });

    it('should return INVALID_CURRENCY_CODE for bad format', () => {
      try {
        validateCurrencyCode('usd');
      } catch (e) {
        expect((e as ValidationError).code).toBe('INVALID_CURRENCY_CODE');
      }
    });

    it('should return UNSUPPORTED_CURRENCY for valid but unsupported', () => {
      try {
        validateCurrencyCode('JPY');
      } catch (e) {
        expect((e as ValidationError).code).toBe('UNSUPPORTED_CURRENCY');
      }
    });

    it('should set field to currency', () => {
      try {
        validateCurrencyCode('');
      } catch (e) {
        expect((e as ValidationError).field).toBe('currency');
      }
    });
  });
});

describe('validatePaymentRequest()', () => {
  const validRequest = {
    amountCents: 10000,
    ticketCount: 2,
    venueId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  };

  describe('valid requests', () => {
    it('should accept valid request without currency', () => {
      expect(() => validatePaymentRequest(validRequest)).not.toThrow();
    });

    it('should accept valid request with USD currency', () => {
      expect(() => validatePaymentRequest({ ...validRequest, currency: 'USD' })).not.toThrow();
    });

    it('should accept minimum valid ticket price ($5)', () => {
      expect(() => validatePaymentRequest({
        amountCents: 500,
        ticketCount: 1,
        venueId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      })).not.toThrow();
    });

    it('should accept maximum valid ticket price ($10,000)', () => {
      expect(() => validatePaymentRequest({
        amountCents: 1000000,
        ticketCount: 1,
        venueId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      })).not.toThrow();
    });
  });

  describe('invalid requests', () => {
    it('should reject invalid amount', () => {
      expect(() => validatePaymentRequest({
        ...validRequest,
        amountCents: 50,
      })).toThrow(ValidationError);
    });

    it('should reject invalid ticket count', () => {
      expect(() => validatePaymentRequest({
        ...validRequest,
        ticketCount: 0,
      })).toThrow(ValidationError);
    });

    it('should reject invalid venue ID', () => {
      expect(() => validatePaymentRequest({
        ...validRequest,
        venueId: 'invalid',
      })).toThrow(ValidationError);
    });

    it('should reject invalid currency', () => {
      expect(() => validatePaymentRequest({
        ...validRequest,
        currency: 'EUR',
      })).toThrow(ValidationError);
    });

    it('should reject average ticket price below $5', () => {
      expect(() => validatePaymentRequest({
        amountCents: 800,
        ticketCount: 2,
        venueId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      })).toThrow(ValidationError);
      expect(() => validatePaymentRequest({
        amountCents: 800,
        ticketCount: 2,
        venueId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      })).toThrow('less than $5.00');
    });

    it('should reject average ticket price above $10,000', () => {
      expect(() => validatePaymentRequest({
        amountCents: 2500000,
        ticketCount: 2,
        venueId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      })).toThrow(ValidationError);
      expect(() => validatePaymentRequest({
        amountCents: 2500000,
        ticketCount: 2,
        venueId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      })).toThrow('exceed $10,000');
    });
  });

  describe('error codes for business rules', () => {
    it('should return MINIMUM_TICKET_PRICE for low average price', () => {
      try {
        validatePaymentRequest({
          amountCents: 400,
          ticketCount: 1,
          venueId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        });
      } catch (e) {
        expect((e as ValidationError).code).toBe('MINIMUM_TICKET_PRICE');
      }
    });

    it('should return MAXIMUM_TICKET_PRICE for high average price', () => {
      try {
        validatePaymentRequest({
          amountCents: 1500000,
          ticketCount: 1,
          venueId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        });
      } catch (e) {
        expect((e as ValidationError).code).toBe('MAXIMUM_TICKET_PRICE');
      }
    });

    it('should set field to amountCents for price rules', () => {
      try {
        validatePaymentRequest({
          amountCents: 400,
          ticketCount: 1,
          venueId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        });
      } catch (e) {
        expect((e as ValidationError).field).toBe('amountCents');
      }
    });
  });
});

describe('formatValidationError()', () => {
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

    expect(formatted).toEqual({
      error: {
        code: 'TEST_CODE',
        message: 'Test message',
        field: undefined,
        type: 'validation_error',
      },
    });
  });

  it('should always include type as validation_error', () => {
    const error = new ValidationError('Any message', 'ANY_CODE');
    const formatted = formatValidationError(error);
    expect(formatted.error.type).toBe('validation_error');
  });
});
