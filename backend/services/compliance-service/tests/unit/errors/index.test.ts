/**
 * Unit Tests for Error Classes
 */
import { describe, it, expect } from '@jest/globals';
import {
  BaseError,
  ValidationError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  VenueNotFoundError,
  DocumentNotFoundError,
  TaxRecordNotFoundError,
  ConflictError,
  DuplicateResourceError,
  Duplicate1099Error,
  RateLimitError,
  OFACError,
  OFACMatchError,
  OFACServiceUnavailableError,
  TaxError,
  TaxThresholdNotMetError,
  InvalidEINError,
  VerificationError,
  VenueNotVerifiedError,
  W9NotFoundError,
  RiskError,
  HighRiskVenueError,
  GDPRError,
  GDPRExportNotReadyError,
  GDPRRetentionPeriodError,
  DatabaseError,
  DatabaseConnectionError,
  ExternalServiceError,
  PlaidServiceError,
  SendGridServiceError,
  InternalError,
  ServiceUnavailableError,
  IdempotencyError,
  isOperationalError,
  isErrorType,
  toBaseError,
  toErrorResponse
} from '../../../src/errors';

describe('Error Classes', () => {
  describe('ValidationError', () => {
    it('should create with correct properties', () => {
      const error = new ValidationError({ message: 'Invalid input' });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.title).toBe('Validation Error');
      expect(error.isOperational).toBe(true);
    });

    it('should include validation errors in RFC7807', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'name', message: 'Required' }
      ];
      const error = new ValidationError({ message: 'Validation failed', validationErrors });

      const rfc = error.toRFC7807();

      expect(rfc.validationErrors).toEqual(validationErrors);
      expect(rfc.status).toBe(400);
    });
  });

  describe('BadRequestError', () => {
    it('should create with correct properties', () => {
      const error = new BadRequestError('Bad request', 'req-123', 'tenant-1');

      expect(error.code).toBe('BAD_REQUEST');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Bad request');
      expect(error.requestId).toBe('req-123');
      expect(error.tenantId).toBe('tenant-1');
    });
  });

  describe('UnauthorizedError', () => {
    it('should create with default message', () => {
      const error = new UnauthorizedError();

      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Authentication required');
    });

    it('should create with custom message', () => {
      const error = new UnauthorizedError('Token expired', 'req-123');

      expect(error.message).toBe('Token expired');
      expect(error.requestId).toBe('req-123');
    });
  });

  describe('ForbiddenError', () => {
    it('should create with default message', () => {
      const error = new ForbiddenError();

      expect(error.code).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access denied');
    });

    it('should create with custom message and tenant', () => {
      const error = new ForbiddenError('No permission', 'req-123', 'tenant-1');

      expect(error.message).toBe('No permission');
      expect(error.tenantId).toBe('tenant-1');
    });
  });

  describe('NotFoundError', () => {
    it('should create with resource name only', () => {
      const error = new NotFoundError('User');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('User not found');
      expect(error.resource).toBe('User');
      expect(error.resourceId).toBeUndefined();
    });

    it('should create with resource name and ID', () => {
      const error = new NotFoundError('User', 'user-123', 'req-123');

      expect(error.message).toBe('User with ID user-123 not found');
      expect(error.resource).toBe('User');
      expect(error.resourceId).toBe('user-123');
    });

    it('should include resource info in RFC7807', () => {
      const error = new NotFoundError('User', 'user-123');
      const rfc = error.toRFC7807();

      expect(rfc.resource).toBe('User');
      expect(rfc.resourceId).toBe('user-123');
    });
  });

  describe('VenueNotFoundError', () => {
    it('should create with venue ID', () => {
      const error = new VenueNotFoundError('venue-123');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.resource).toBe('Venue');
      expect(error.resourceId).toBe('venue-123');
      expect(error.message).toBe('Venue with ID venue-123 not found');
    });
  });

  describe('DocumentNotFoundError', () => {
    it('should create with document ID', () => {
      const error = new DocumentNotFoundError('doc-123');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.resource).toBe('Document');
      expect(error.resourceId).toBe('doc-123');
    });
  });

  describe('TaxRecordNotFoundError', () => {
    it('should create with record ID', () => {
      const error = new TaxRecordNotFoundError('tax-123');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.resource).toBe('TaxRecord');
      expect(error.resourceId).toBe('tax-123');
    });
  });

  describe('ConflictError', () => {
    it('should create with correct properties', () => {
      const error = new ConflictError('Resource conflict', 'req-123', 'tenant-1');

      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Resource conflict');
    });
  });

  describe('DuplicateResourceError', () => {
    it('should create with resource and identifier', () => {
      const error = new DuplicateResourceError('User', 'email@test.com');

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toBe('User with identifier email@test.com already exists');
      expect(error.resource).toBe('User');
      expect(error.identifier).toBe('email@test.com');
    });

    it('should create without identifier', () => {
      const error = new DuplicateResourceError('User');

      expect(error.message).toBe('User already exists');
    });
  });

  describe('Duplicate1099Error', () => {
    it('should create with venue and year', () => {
      const error = new Duplicate1099Error('venue-123', 2024);

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toBe('1099 form already exists for venue venue-123 for year 2024');
    });
  });

  describe('RateLimitError', () => {
    it('should create with retry after', () => {
      const error = new RateLimitError(60, 'req-123');

      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
    });

    it('should include retryAfter in RFC7807', () => {
      const error = new RateLimitError(30);
      const rfc = error.toRFC7807();

      expect(rfc.retryAfter).toBe(30);
    });
  });

  describe('OFACError', () => {
    it('should create with correct properties', () => {
      const error = new OFACError({
        message: 'OFAC check failed',
        screeningId: 'screen-123',
        matchScore: 85
      });

      expect(error.code).toBe('OFAC_ERROR');
      expect(error.statusCode).toBe(422);
      expect(error.screeningId).toBe('screen-123');
      expect(error.matchScore).toBe(85);
    });

    it('should include OFAC details in RFC7807', () => {
      const error = new OFACError({
        message: 'Match found',
        screeningId: 'screen-123',
        matchScore: 90
      });
      const rfc = error.toRFC7807();

      expect(rfc.screeningId).toBe('screen-123');
      expect(rfc.matchScore).toBe(90);
    });
  });

  describe('OFACMatchError', () => {
    it('should create with name and score', () => {
      const error = new OFACMatchError('John Doe', 95);

      expect(error).toBeInstanceOf(OFACError);
      expect(error.code).toBe('OFAC_MATCH');
      expect(error.matchScore).toBe(95);
      expect(error.message).toContain('John Doe');
      expect(error.message).toContain('95');
    });
  });

  describe('OFACServiceUnavailableError', () => {
    it('should create with correct message', () => {
      const error = new OFACServiceUnavailableError('req-123');

      expect(error).toBeInstanceOf(OFACError);
      expect(error.code).toBe('OFAC_SERVICE_UNAVAILABLE');
      expect(error.message).toContain('temporarily unavailable');
    });
  });

  describe('TaxError', () => {
    it('should create with correct properties', () => {
      const error = new TaxError({
        message: 'Tax calculation failed',
        venueId: 'venue-123',
        taxYear: 2024
      });

      expect(error.code).toBe('TAX_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.venueId).toBe('venue-123');
      expect(error.taxYear).toBe(2024);
    });
  });

  describe('TaxThresholdNotMetError', () => {
    it('should create with threshold details', () => {
      const error = new TaxThresholdNotMetError('venue-123', 2024, 600, 450);

      expect(error).toBeInstanceOf(TaxError);
      expect(error.code).toBe('TAX_THRESHOLD_NOT_MET');
      expect(error.threshold).toBe(600);
      expect(error.currentAmount).toBe(450);
      expect(error.message).toContain('450.00');
      expect(error.message).toContain('600.00');
    });
  });

  describe('InvalidEINError', () => {
    it('should create with EIN message', () => {
      const error = new InvalidEINError('123456789');

      expect(error).toBeInstanceOf(TaxError);
      expect(error.code).toBe('INVALID_EIN');
      expect(error.message).toContain('XX-XXXXXXX');
    });
  });

  describe('VerificationError', () => {
    it('should create with verification details', () => {
      const error = new VerificationError({
        message: 'Verification failed',
        venueId: 'venue-123',
        verificationType: 'identity'
      });

      expect(error.code).toBe('VERIFICATION_ERROR');
      expect(error.statusCode).toBe(422);
      expect(error.venueId).toBe('venue-123');
      expect(error.verificationType).toBe('identity');
    });
  });

  describe('VenueNotVerifiedError', () => {
    it('should create with venue ID', () => {
      const error = new VenueNotVerifiedError('venue-123');

      expect(error).toBeInstanceOf(VerificationError);
      expect(error.code).toBe('VENUE_NOT_VERIFIED');
      expect(error.venueId).toBe('venue-123');
    });
  });

  describe('W9NotFoundError', () => {
    it('should create with venue ID', () => {
      const error = new W9NotFoundError('venue-123');

      expect(error).toBeInstanceOf(VerificationError);
      expect(error.code).toBe('W9_NOT_FOUND');
      expect(error.verificationType).toBe('W9');
    });
  });

  describe('RiskError', () => {
    it('should create with risk details', () => {
      const error = new RiskError({
        message: 'Risk assessment failed',
        venueId: 'venue-123',
        riskScore: 85
      });

      expect(error.code).toBe('RISK_ERROR');
      expect(error.statusCode).toBe(422);
      expect(error.riskScore).toBe(85);
    });
  });

  describe('HighRiskVenueError', () => {
    it('should create with venue and score', () => {
      const error = new HighRiskVenueError('venue-123', 90);

      expect(error).toBeInstanceOf(RiskError);
      expect(error.code).toBe('HIGH_RISK_VENUE');
      expect(error.venueId).toBe('venue-123');
      expect(error.riskScore).toBe(90);
    });
  });

  describe('GDPRError', () => {
    it('should create with GDPR details', () => {
      const error = new GDPRError({
        message: 'GDPR request failed',
        userId: 'user-123',
        requestType: 'export'
      });

      expect(error.code).toBe('GDPR_ERROR');
      expect(error.userId).toBe('user-123');
      expect(error.requestType).toBe('export');
    });
  });

  describe('GDPRExportNotReadyError', () => {
    it('should create with user ID', () => {
      const error = new GDPRExportNotReadyError('user-123');

      expect(error).toBeInstanceOf(GDPRError);
      expect(error.code).toBe('GDPR_EXPORT_NOT_READY');
      expect(error.statusCode).toBe(202);
      expect(error.requestType).toBe('export');
    });
  });

  describe('GDPRRetentionPeriodError', () => {
    it('should create with user and reason', () => {
      const error = new GDPRRetentionPeriodError('user-123', 'Tax records must be retained');

      expect(error).toBeInstanceOf(GDPRError);
      expect(error.code).toBe('GDPR_RETENTION_REQUIRED');
      expect(error.statusCode).toBe(409);
      expect(error.requestType).toBe('delete');
      expect(error.message).toContain('Tax records must be retained');
    });
  });

  describe('DatabaseError', () => {
    it('should create with query details', () => {
      const cause = new Error('Connection timeout');
      const error = new DatabaseError({
        message: 'Query failed',
        query: 'SELECT * FROM users',
        constraint: 'users_email_unique',
        cause
      });

      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.query).toBe('SELECT * FROM users');
      expect(error.constraint).toBe('users_email_unique');
      expect(error.cause).toBe(cause);
    });
  });

  describe('DatabaseConnectionError', () => {
    it('should create with default message', () => {
      const error = new DatabaseConnectionError();

      expect(error.code).toBe('DATABASE_CONNECTION_ERROR');
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Database connection failed');
    });
  });

  describe('ExternalServiceError', () => {
    it('should create with service details', () => {
      const error = new ExternalServiceError({
        service: 'PaymentGateway',
        message: 'Service timeout',
        retryable: true
      });

      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.service).toBe('PaymentGateway');
      expect(error.retryable).toBe(true);
    });

    it('should default retryable to false', () => {
      const error = new ExternalServiceError({
        service: 'API',
        message: 'Failed'
      });

      expect(error.retryable).toBe(false);
    });
  });

  describe('PlaidServiceError', () => {
    it('should create with Plaid service', () => {
      const error = new PlaidServiceError('Plaid API error');

      expect(error).toBeInstanceOf(ExternalServiceError);
      expect(error.service).toBe('Plaid');
      expect(error.retryable).toBe(true);
    });
  });

  describe('SendGridServiceError', () => {
    it('should create with SendGrid service', () => {
      const error = new SendGridServiceError('Email failed');

      expect(error).toBeInstanceOf(ExternalServiceError);
      expect(error.service).toBe('SendGrid');
      expect(error.retryable).toBe(true);
    });
  });

  describe('InternalError', () => {
    it('should create with default message', () => {
      const error = new InternalError();

      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('An unexpected error occurred');
      expect(error.isOperational).toBe(false);
    });

    it('should create with custom message', () => {
      const error = new InternalError('Something broke', 'req-123');

      expect(error.message).toBe('Something broke');
      expect(error.requestId).toBe('req-123');
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create with service name', () => {
      const error = new ServiceUnavailableError('Auth Service');

      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Auth Service is temporarily unavailable');
    });

    it('should create with default service name', () => {
      const error = new ServiceUnavailableError();

      expect(error.message).toBe('Service is temporarily unavailable');
    });
  });

  describe('IdempotencyError', () => {
    it('should create with idempotency key', () => {
      const error = new IdempotencyError('idem-123', 'req-123');

      expect(error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(error.statusCode).toBe(409);
      expect(error.idempotencyKey).toBe('idem-123');
    });

    it('should include key in RFC7807', () => {
      const error = new IdempotencyError('idem-123');
      const rfc = error.toRFC7807();

      expect(rfc.idempotencyKey).toBe('idem-123');
    });
  });

  describe('RFC7807 Format', () => {
    it('should generate correct RFC7807 structure', () => {
      const error = new ValidationError({
        message: 'Invalid input',
        requestId: 'req-123',
        tenantId: 'tenant-1'
      });

      const rfc = error.toRFC7807('instance-123');

      expect(rfc.type).toContain('urn:error:compliance-service:');
      expect(rfc.title).toBe('Validation Error');
      expect(rfc.status).toBe(400);
      expect(rfc.detail).toBe('Invalid input');
      expect(rfc.instance).toBe('instance-123');
      expect(rfc.code).toBe('VALIDATION_ERROR');
      expect(rfc.timestamp).toBeDefined();
      expect(rfc.tenantId).toBe('tenant-1');
    });

    it('should use requestId as instance when no instance provided', () => {
      const error = new BadRequestError('Bad', 'req-123');
      const rfc = error.toRFC7807();

      expect(rfc.instance).toBe('req-123');
    });
  });

  describe('Utility Functions', () => {
    describe('isOperationalError', () => {
      it('should return true for operational errors', () => {
        const error = new ValidationError({ message: 'Invalid' });
        expect(isOperationalError(error)).toBe(true);
      });

      it('should return false for non-operational errors', () => {
        const error = new InternalError('Crash');
        expect(isOperationalError(error)).toBe(false);
      });

      it('should return false for non-BaseError', () => {
        expect(isOperationalError(new Error('Regular error'))).toBe(false);
        expect(isOperationalError('string error')).toBe(false);
        expect(isOperationalError(null)).toBe(false);
      });
    });

    describe('isErrorType', () => {
      it('should correctly identify error types', () => {
        const error = new VenueNotFoundError('venue-123');

        expect(isErrorType(error, VenueNotFoundError)).toBe(true);
        expect(isErrorType(error, NotFoundError)).toBe(true);
        // BaseError is abstract, skip
        expect(isErrorType(error, ValidationError)).toBe(false);
      });
    });

    describe('toBaseError', () => {
      it('should return BaseError as-is', () => {
        const original = new ValidationError({ message: 'Invalid' });
        const result = toBaseError(original);

        expect(result).toBe(original);
      });

      it('should convert Error to InternalError', () => {
        const original = new Error('Regular error');
        const result = toBaseError(original, 'req-123');

        expect(result).toBeInstanceOf(InternalError);
        expect(result.message).toBe('Regular error');
        expect(result.requestId).toBe('req-123');
      });

      it('should convert string to InternalError', () => {
        const result = toBaseError('string error');

        expect(result).toBeInstanceOf(InternalError);
        expect(result.message).toBe('string error');
      });
    });

    describe('toErrorResponse', () => {
      it('should convert BaseError to RFC7807', () => {
        const error = new ValidationError({ message: 'Invalid' });
        const response = toErrorResponse(error, 'req-123');

        expect(response.status).toBe(400);
        expect(response.instance).toBe('req-123');
      });

      it('should convert regular Error to RFC7807', () => {
        const response = toErrorResponse(new Error('Oops'), 'req-123');

        expect(response.status).toBe(500);
        expect(response.code).toBe('INTERNAL_ERROR');
      });
    });
  });

  describe('Error Inheritance', () => {
    it('should maintain proper prototype chain', () => {
      const error = new VenueNotFoundError('venue-123');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof NotFoundError).toBe(true);
      expect(error instanceof VenueNotFoundError).toBe(true);
    });

    it('should have stack trace', () => {
      const error = new ValidationError({ message: 'Invalid' });

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });

    it('should capture cause when provided', () => {
      const cause = new Error('Original error');
      const error = new DatabaseError({
        message: 'Query failed',
        cause
      });

      expect(error.cause).toBe(cause);
    });
  });
});
