/**
 * Unit Tests for Error Classes
 * 
 * AUDIT FIX: TEST-1 - Add test framework
 * Tests the RFC 7807 error handling implementation
 */

import {
  BaseError,
  IndexerError,
  SolanaError,
  DatabaseError,
  ValidationError,
  TenantError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ErrorCode,
  isBaseError,
  isOperationalError,
  toProblemDetails
} from '../../src/errors';

describe('Error Classes', () => {
  describe('BaseError', () => {
    it('should create error with all properties', () => {
      const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR, 500, { extra: 'data' });
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.context).toEqual({ extra: 'data' });
      expect(error.isOperational).toBe(true);
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should convert to RFC 7807 Problem Details', () => {
      const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR, 500);
      const problemDetails = error.toProblemDetails('req-123', '/test');
      
      expect(problemDetails.type).toContain('INTERNAL_ERROR');
      expect(problemDetails.title).toBe('BaseError');
      expect(problemDetails.status).toBe(500);
      expect(problemDetails.detail).toBe('Test error');
      expect(problemDetails.traceId).toBe('req-123');
      expect(problemDetails.instance).toBe('/test');
    });
  });

  describe('IndexerError', () => {
    it('should create sync failed error', () => {
      const error = IndexerError.syncFailed('RPC timeout', 12345);
      
      expect(error.code).toBe(ErrorCode.INDEXER_SYNC_FAILED);
      expect(error.statusCode).toBe(503);
      expect(error.context?.slot).toBe(12345);
    });

    it('should create processing failed error', () => {
      const error = IndexerError.processingFailed('sig123', 'Invalid instruction');
      
      expect(error.code).toBe(ErrorCode.INDEXER_PROCESSING_FAILED);
      expect(error.context?.signature).toBe('sig123');
    });

    it('should create not running error', () => {
      const error = IndexerError.notRunning();
      
      expect(error.code).toBe(ErrorCode.INDEXER_NOT_RUNNING);
      expect(error.statusCode).toBe(503);
    });
  });

  describe('SolanaError', () => {
    it('should create timeout error', () => {
      const error = SolanaError.timeout('getTransaction', 5000);
      
      expect(error.code).toBe(ErrorCode.SOLANA_TIMEOUT);
      expect(error.statusCode).toBe(504);
      expect(error.context?.durationMs).toBe(5000);
    });

    it('should create unavailable error', () => {
      const error = SolanaError.unavailable('https://rpc.example.com');
      
      expect(error.code).toBe(ErrorCode.SOLANA_RPC_UNAVAILABLE);
      expect(error.statusCode).toBe(503);
    });
  });

  describe('ValidationError', () => {
    it('should create missing field error', () => {
      const error = ValidationError.missingField('signature');
      
      expect(error.code).toBe(ErrorCode.VALIDATION_MISSING_FIELD);
      expect(error.statusCode).toBe(400);
    });

    it('should include validation errors in problem details', () => {
      const error = new ValidationError(
        'Validation failed',
        ErrorCode.VALIDATION_FAILED,
        400,
        {},
        [{ field: 'email', message: 'Invalid format' }]
      );
      
      const problemDetails = error.toProblemDetails();
      expect(problemDetails.validationErrors).toHaveLength(1);
      expect(problemDetails.validationErrors?.[0].field).toBe('email');
    });
  });

  describe('TenantError', () => {
    it('should create missing context error', () => {
      const error = TenantError.missingContext();
      
      expect(error.code).toBe(ErrorCode.TENANT_CONTEXT_MISSING);
      expect(error.statusCode).toBe(401);
    });

    it('should truncate tenant ID in context', () => {
      const error = TenantError.invalid('550e8400-e29b-41d4-a716-446655440000');
      
      expect(error.context?.tenantId).not.toContain('446655440000');
      expect(error.context?.tenantId).toContain('...');
    });
  });

  describe('RateLimitError', () => {
    it('should include retry after in problem details', () => {
      const error = RateLimitError.forTenant('tenant-123', 120);
      
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(120);
      
      const problemDetails = error.toProblemDetails();
      expect(problemDetails.retryAfter).toBe(120);
    });
  });

  describe('NotFoundError', () => {
    it('should create with resource and identifier', () => {
      const error = new NotFoundError('Transaction', 'sig123');
      
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('Transaction');
      expect(error.message).toContain('sig123');
    });
  });

  describe('Type Guards', () => {
    it('should identify BaseError instances', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
      const regularError = new Error('Test');
      
      expect(isBaseError(error)).toBe(true);
      expect(isBaseError(regularError)).toBe(false);
    });

    it('should identify operational errors', () => {
      const opError = new BaseError('Test', ErrorCode.INTERNAL_ERROR, 500, {}, true);
      const nonOpError = new BaseError('Test', ErrorCode.INTERNAL_ERROR, 500, {}, false);
      
      expect(isOperationalError(opError)).toBe(true);
      expect(isOperationalError(nonOpError)).toBe(false);
    });
  });

  describe('toProblemDetails', () => {
    it('should handle BaseError instances', () => {
      const error = new ValidationError('Bad input', ErrorCode.VALIDATION_FAILED);
      const details = toProblemDetails(error, 'req-123', '/api/test');
      
      expect(details.status).toBe(400);
      expect(details.traceId).toBe('req-123');
    });

    it('should handle standard Error instances', () => {
      const error = new Error('Something went wrong');
      const details = toProblemDetails(error, 'req-123');
      
      expect(details.status).toBe(500);
      expect(details.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('should handle unknown error types', () => {
      const details = toProblemDetails('string error', 'req-123');
      
      expect(details.status).toBe(500);
    });
  });
});
