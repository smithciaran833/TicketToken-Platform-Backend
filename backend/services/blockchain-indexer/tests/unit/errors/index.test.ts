/**
 * Comprehensive Unit Tests for src/errors/index.ts
 * 
 * Tests all error classes, factory methods, type guards, and RFC 7807 compliance
 */

import {
  ErrorCode,
  BaseError,
  IndexerError,
  SolanaError,
  DatabaseError,
  ValidationError,
  TenantError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ProblemDetails,
  isBaseError,
  isOperationalError,
  isIndexerError,
  isSolanaError,
  isDatabaseError,
  isValidationError,
  isTenantError,
  isAuthenticationError,
  isRateLimitError,
  toProblemDetails,
} from '../../../src/errors';

describe('src/errors/index.ts - Comprehensive Unit Tests', () => {
  
  // =============================================================================
  // ERROR CODE ENUM
  // =============================================================================
  
  describe('ErrorCode Enum', () => {
    it('should have all indexer error codes', () => {
      expect(ErrorCode.INDEXER_ERROR).toBe('INDEXER_ERROR');
      expect(ErrorCode.INDEXER_SYNC_FAILED).toBe('INDEXER_SYNC_FAILED');
      expect(ErrorCode.INDEXER_PROCESSING_FAILED).toBe('INDEXER_PROCESSING_FAILED');
      expect(ErrorCode.INDEXER_NOT_RUNNING).toBe('INDEXER_NOT_RUNNING');
    });

    it('should have all Solana error codes', () => {
      expect(ErrorCode.SOLANA_TIMEOUT).toBe('SOLANA_TIMEOUT');
      expect(ErrorCode.SOLANA_RPC_ERROR).toBe('SOLANA_RPC_ERROR');
      expect(ErrorCode.SOLANA_RPC_UNAVAILABLE).toBe('SOLANA_RPC_UNAVAILABLE');
      expect(ErrorCode.SOLANA_TRANSACTION_NOT_FOUND).toBe('SOLANA_TRANSACTION_NOT_FOUND');
    });

    it('should have all database error codes', () => {
      expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(ErrorCode.DATABASE_TIMEOUT).toBe('DATABASE_TIMEOUT');
      expect(ErrorCode.DATABASE_CONNECTION_FAILED).toBe('DATABASE_CONNECTION_FAILED');
      expect(ErrorCode.MONGODB_ERROR).toBe('MONGODB_ERROR');
      expect(ErrorCode.MONGODB_WRITE_FAILED).toBe('MONGODB_WRITE_FAILED');
    });

    it('should have all tenant error codes', () => {
      expect(ErrorCode.TENANT_INVALID).toBe('TENANT_INVALID');
      expect(ErrorCode.TENANT_MISMATCH).toBe('TENANT_MISMATCH');
      expect(ErrorCode.TENANT_CONTEXT_MISSING).toBe('TENANT_CONTEXT_MISSING');
    });

    it('should have all validation error codes', () => {
      expect(ErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
      expect(ErrorCode.VALIDATION_MISSING_FIELD).toBe('VALIDATION_MISSING_FIELD');
      expect(ErrorCode.VALIDATION_INVALID_FORMAT).toBe('VALIDATION_INVALID_FORMAT');
    });

    it('should have all authentication error codes', () => {
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCode.TOKEN_INVALID).toBe('TOKEN_INVALID');
      expect(ErrorCode.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
      expect(ErrorCode.TOKEN_MISSING).toBe('TOKEN_MISSING');
    });

    it('should have all rate limit error codes', () => {
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCode.RATE_LIMIT_TENANT).toBe('RATE_LIMIT_TENANT');
    });

    it('should have all general error codes', () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.BAD_REQUEST).toBe('BAD_REQUEST');
      expect(ErrorCode.CONFLICT).toBe('CONFLICT');
      expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    });
  });

  // =============================================================================
  // BASE ERROR CLASS
  // =============================================================================
  
  describe('BaseError', () => {
    it('should create error with all required properties', () => {
      const error = new BaseError(
        'Test error',
        ErrorCode.INTERNAL_ERROR,
        500,
        { key: 'value' }
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.context).toEqual({ key: 'value' });
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('BaseError');
    });

    it('should default to statusCode 500 if not provided', () => {
      const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
    });

    it('should default isOperational to true if not provided', () => {
      const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR);
      expect(error.isOperational).toBe(true);
    });

    it('should allow setting isOperational to false', () => {
      const error = new BaseError(
        'Test error',
        ErrorCode.INTERNAL_ERROR,
        500,
        undefined,
        false
      );
      expect(error.isOperational).toBe(false);
    });

    it('should capture stack trace', () => {
      const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR);
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('BaseError');
    });

    it('should handle undefined context', () => {
      const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR);
      expect(error.context).toBeUndefined();
    });

    describe('toProblemDetails()', () => {
      it('should return RFC 7807 compliant problem details', () => {
        const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR, 500);
        const problemDetails = error.toProblemDetails();

        expect(problemDetails).toHaveProperty('type');
        expect(problemDetails).toHaveProperty('title');
        expect(problemDetails).toHaveProperty('status');
        expect(problemDetails).toHaveProperty('detail');
        expect(problemDetails).toHaveProperty('code');
        expect(problemDetails).toHaveProperty('timestamp');
      });

      it('should include correct type URI', () => {
        const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR, 500);
        const problemDetails = error.toProblemDetails();

        expect(problemDetails.type).toBe('https://api.tickettoken.com/errors/INTERNAL_ERROR');
      });

      it('should include error name as title', () => {
        const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR, 500);
        const problemDetails = error.toProblemDetails();

        expect(problemDetails.title).toBe('BaseError');
      });

      it('should include status code', () => {
        const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR, 503);
        const problemDetails = error.toProblemDetails();

        expect(problemDetails.status).toBe(503);
      });

      it('should include error message as detail', () => {
        const error = new BaseError('Test error message', ErrorCode.INTERNAL_ERROR);
        const problemDetails = error.toProblemDetails();

        expect(problemDetails.detail).toBe('Test error message');
      });

      it('should include error code', () => {
        const error = new BaseError('Test error', ErrorCode.DATABASE_ERROR);
        const problemDetails = error.toProblemDetails();

        expect(problemDetails.code).toBe(ErrorCode.DATABASE_ERROR);
      });

      it('should include timestamp in ISO format', () => {
        const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR);
        const problemDetails = error.toProblemDetails();

        expect(problemDetails.timestamp).toBeDefined();
        expect(() => new Date(problemDetails.timestamp!)).not.toThrow();
      });

      it('should include requestId when provided', () => {
        const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR);
        const problemDetails = error.toProblemDetails('req-123');

        expect(problemDetails.traceId).toBe('req-123');
      });

      it('should include instance when provided', () => {
        const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR);
        const problemDetails = error.toProblemDetails(undefined, '/api/v1/test');

        expect(problemDetails.instance).toBe('/api/v1/test');
      });

      it('should include both requestId and instance when provided', () => {
        const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR);
        const problemDetails = error.toProblemDetails('req-123', '/api/v1/test');

        expect(problemDetails.traceId).toBe('req-123');
        expect(problemDetails.instance).toBe('/api/v1/test');
      });
    });

    describe('toJSON()', () => {
      it('should serialize to JSON with all properties', () => {
        const error = new BaseError(
          'Test error',
          ErrorCode.INTERNAL_ERROR,
          500,
          { key: 'value' }
        );
        const json = error.toJSON();

        expect(json.name).toBe('BaseError');
        expect(json.message).toBe('Test error');
        expect(json.code).toBe(ErrorCode.INTERNAL_ERROR);
        expect(json.statusCode).toBe(500);
        expect(json.context).toEqual({ key: 'value' });
        expect(json.timestamp).toBeDefined();
      });

      it('should include timestamp in ISO format', () => {
        const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR);
        const json = error.toJSON();

        expect(typeof json.timestamp).toBe('string');
        expect(() => new Date(json.timestamp as string)).not.toThrow();
      });

      it('should handle undefined context', () => {
        const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR);
        const json = error.toJSON();

        expect(json.context).toBeUndefined();
      });
    });
  });

  // =============================================================================
  // INDEXER ERROR
  // =============================================================================
  
  describe('IndexerError', () => {
    it('should extend BaseError', () => {
      const error = new IndexerError('Test error');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(IndexerError);
    });

    it('should have correct default values', () => {
      const error = new IndexerError('Test error');
      expect(error.code).toBe(ErrorCode.INDEXER_ERROR);
      expect(error.statusCode).toBe(503);
      expect(error.name).toBe('IndexerError');
    });

    it('should allow custom code and statusCode', () => {
      const error = new IndexerError(
        'Test error',
        ErrorCode.INDEXER_SYNC_FAILED,
        500
      );
      expect(error.code).toBe(ErrorCode.INDEXER_SYNC_FAILED);
      expect(error.statusCode).toBe(500);
    });

    describe('syncFailed()', () => {
      it('should create error with correct properties', () => {
        const error = IndexerError.syncFailed('Network timeout');

        expect(error.message).toBe('Indexer sync failed: Network timeout');
        expect(error.code).toBe(ErrorCode.INDEXER_SYNC_FAILED);
        expect(error.statusCode).toBe(503);
        expect(error.context).toEqual({ reason: 'Network timeout' });
      });

      it('should include slot in context when provided', () => {
        const error = IndexerError.syncFailed('Network timeout', 12345);

        expect(error.context).toEqual({
          reason: 'Network timeout',
          slot: 12345
        });
      });

      it('should work without slot', () => {
        const error = IndexerError.syncFailed('Network timeout');

        expect(error.context).toEqual({ reason: 'Network timeout' });
      });
    });

    describe('processingFailed()', () => {
      it('should create error with correct properties', () => {
        const signature = 'abc123def456';
        const error = IndexerError.processingFailed(signature, 'Invalid format');

        expect(error.message).toBe('Failed to process transaction: Invalid format');
        expect(error.code).toBe(ErrorCode.INDEXER_PROCESSING_FAILED);
        expect(error.statusCode).toBe(500);
        expect(error.context).toEqual({
          signature: 'abc123def456',
          reason: 'Invalid format'
        });
      });
    });

    describe('notRunning()', () => {
      it('should create error with correct properties', () => {
        const error = IndexerError.notRunning();

        expect(error.message).toBe('Indexer is not running');
        expect(error.code).toBe(ErrorCode.INDEXER_NOT_RUNNING);
        expect(error.statusCode).toBe(503);
        expect(error.context).toBeUndefined();
      });
    });
  });

  // =============================================================================
  // SOLANA ERROR
  // =============================================================================
  
  describe('SolanaError', () => {
    it('should extend BaseError', () => {
      const error = new SolanaError('Test error');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(SolanaError);
    });

    it('should have correct default values', () => {
      const error = new SolanaError('Test error');
      expect(error.code).toBe(ErrorCode.SOLANA_RPC_ERROR);
      expect(error.statusCode).toBe(503);
      expect(error.name).toBe('SolanaError');
    });

    describe('timeout()', () => {
      it('should create error with correct properties', () => {
        const error = SolanaError.timeout('getBlock', 5000);

        expect(error.message).toBe('Solana RPC timeout during getBlock');
        expect(error.code).toBe(ErrorCode.SOLANA_TIMEOUT);
        expect(error.statusCode).toBe(504);
        expect(error.context).toEqual({
          operation: 'getBlock',
          durationMs: 5000
        });
      });
    });

    describe('unavailable()', () => {
      it('should create error without endpoint', () => {
        const error = SolanaError.unavailable();

        expect(error.message).toBe('Solana RPC service unavailable');
        expect(error.code).toBe(ErrorCode.SOLANA_RPC_UNAVAILABLE);
        expect(error.statusCode).toBe(503);
        expect(error.context).toBeUndefined();
      });

      it('should create error with endpoint', () => {
        const error = SolanaError.unavailable('https://api.mainnet-beta.solana.com');

        expect(error.message).toBe('Solana RPC service unavailable');
        expect(error.context).toEqual({
          endpoint: 'https://api.mainnet-beta.solana.com'
        });
      });
    });

    describe('transactionNotFound()', () => {
      it('should create error with truncated signature', () => {
        const signature = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
        const error = SolanaError.transactionNotFound(signature);

        expect(error.message).toContain('Transaction not found:');
        expect(error.message).toContain('5VERv8NMvzbJMEkV');
        expect(error.message).toContain('...');
        expect(error.code).toBe(ErrorCode.SOLANA_TRANSACTION_NOT_FOUND);
        expect(error.statusCode).toBe(404);
        expect(error.context).toEqual({
          signature: '5VERv8NMvzbJMEkV'
        });
      });
    });
  });

  // =============================================================================
  // DATABASE ERROR
  // =============================================================================
  
  describe('DatabaseError', () => {
    it('should extend BaseError', () => {
      const error = new DatabaseError('Test error');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(DatabaseError);
    });

    it('should have correct default values', () => {
      const error = new DatabaseError('Test error');
      expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(error.statusCode).toBe(503);
      expect(error.name).toBe('DatabaseError');
    });

    describe('connectionFailed()', () => {
      it('should create error with correct properties', () => {
        const error = DatabaseError.connectionFailed('PostgreSQL');

        expect(error.message).toBe('Database connection failed: PostgreSQL');
        expect(error.code).toBe(ErrorCode.DATABASE_CONNECTION_FAILED);
        expect(error.statusCode).toBe(503);
        expect(error.context).toEqual({ database: 'PostgreSQL' });
      });
    });

    describe('timeout()', () => {
      it('should create error with correct properties', () => {
        const error = DatabaseError.timeout('SELECT query');

        expect(error.message).toBe('Database operation timeout: SELECT query');
        expect(error.code).toBe(ErrorCode.DATABASE_TIMEOUT);
        expect(error.statusCode).toBe(504);
        expect(error.context).toEqual({ operation: 'SELECT query' });
      });
    });

    describe('mongoWriteFailed()', () => {
      it('should create error with correct properties', () => {
        const error = DatabaseError.mongoWriteFailed('transactions', 'Duplicate key');

        expect(error.message).toBe('MongoDB write failed: Duplicate key');
        expect(error.code).toBe(ErrorCode.MONGODB_WRITE_FAILED);
        expect(error.statusCode).toBe(503);
        expect(error.context).toEqual({
          collection: 'transactions',
          reason: 'Duplicate key'
        });
      });
    });
  });

  // =============================================================================
  // VALIDATION ERROR
  // =============================================================================
  
  describe('ValidationError', () => {
    it('should extend BaseError', () => {
      const error = new ValidationError('Test error');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should have correct default values', () => {
      const error = new ValidationError('Test error');
      expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ValidationError');
    });

    it('should store validationErrors property', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'age', message: 'Must be a positive number' }
      ];
      const error = new ValidationError(
        'Validation failed',
        ErrorCode.VALIDATION_FAILED,
        400,
        undefined,
        validationErrors
      );

      expect(error.validationErrors).toEqual(validationErrors);
    });

    it('should handle undefined validationErrors', () => {
      const error = new ValidationError('Test error');
      expect(error.validationErrors).toBeUndefined();
    });

    describe('missingField()', () => {
      it('should create error with correct properties', () => {
        const error = ValidationError.missingField('username');

        expect(error.message).toBe('Missing required field: username');
        expect(error.code).toBe(ErrorCode.VALIDATION_MISSING_FIELD);
        expect(error.statusCode).toBe(400);
        expect(error.context).toEqual({ field: 'username' });
      });
    });

    describe('invalidFormat()', () => {
      it('should create error with correct properties', () => {
        const error = ValidationError.invalidFormat('email', 'valid@email.com');

        expect(error.message).toBe('Invalid format for email: expected valid@email.com');
        expect(error.code).toBe(ErrorCode.VALIDATION_INVALID_FORMAT);
        expect(error.statusCode).toBe(400);
        expect(error.context).toEqual({
          field: 'email',
          expected: 'valid@email.com'
        });
      });
    });

    describe('toProblemDetails()', () => {
      it('should include validationErrors in problem details', () => {
        const validationErrors = [
          { field: 'email', message: 'Invalid email format' }
        ];
        const error = new ValidationError(
          'Validation failed',
          ErrorCode.VALIDATION_FAILED,
          400,
          undefined,
          validationErrors
        );
        const problemDetails = error.toProblemDetails();

        expect(problemDetails.validationErrors).toEqual(validationErrors);
      });

      it('should not include validationErrors when undefined', () => {
        const error = new ValidationError('Test error');
        const problemDetails = error.toProblemDetails();

        expect(problemDetails.validationErrors).toBeUndefined();
      });
    });
  });

  // =============================================================================
  // TENANT ERROR
  // =============================================================================
  
  describe('TenantError', () => {
    it('should extend BaseError', () => {
      const error = new TenantError('Test error');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(TenantError);
    });

    it('should have correct default values', () => {
      const error = new TenantError('Test error');
      expect(error.code).toBe(ErrorCode.TENANT_INVALID);
      expect(error.statusCode).toBe(403);
      expect(error.name).toBe('TenantError');
    });

    describe('missingContext()', () => {
      it('should create error with correct properties', () => {
        const error = TenantError.missingContext();

        expect(error.message).toBe('Tenant context is required but not provided');
        expect(error.code).toBe(ErrorCode.TENANT_CONTEXT_MISSING);
        expect(error.statusCode).toBe(401);
        expect(error.context).toBeUndefined();
      });
    });

    describe('invalid()', () => {
      it('should create error with truncated tenant ID', () => {
        const tenantId = '12345678-1234-1234-1234-123456789012';
        const error = TenantError.invalid(tenantId);

        expect(error.message).toBe('Invalid tenant ID format');
        expect(error.code).toBe(ErrorCode.TENANT_INVALID);
        expect(error.statusCode).toBe(400);
        expect(error.context).toEqual({ tenantId: '12345678...' });
      });
    });
  });

  // =============================================================================
  // AUTHENTICATION ERROR
  // =============================================================================
  
  describe('AuthenticationError', () => {
    it('should extend BaseError', () => {
      const error = new AuthenticationError('Test error');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(AuthenticationError);
    });

    it('should have correct default values', () => {
      const error = new AuthenticationError('Test error');
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('AuthenticationError');
    });

    describe('missingToken()', () => {
      it('should create error with correct properties', () => {
        const error = AuthenticationError.missingToken();

        expect(error.message).toBe('Authentication token is required');
        expect(error.code).toBe(ErrorCode.TOKEN_MISSING);
        expect(error.statusCode).toBe(401);
      });
    });

    describe('invalidToken()', () => {
      it('should create error without reason', () => {
        const error = AuthenticationError.invalidToken();

        expect(error.message).toBe('Invalid or malformed authentication token');
        expect(error.code).toBe(ErrorCode.TOKEN_INVALID);
        expect(error.statusCode).toBe(401);
        expect(error.context).toBeUndefined();
      });

      it('should create error with reason', () => {
        const error = AuthenticationError.invalidToken('Signature verification failed');

        expect(error.message).toBe('Signature verification failed');
        expect(error.code).toBe(ErrorCode.TOKEN_INVALID);
        expect(error.context).toEqual({ reason: 'Signature verification failed' });
      });
    });

    describe('tokenExpired()', () => {
      it('should create error with correct properties', () => {
        const error = AuthenticationError.tokenExpired();

        expect(error.message).toBe('Authentication token has expired');
        expect(error.code).toBe(ErrorCode.TOKEN_EXPIRED);
        expect(error.statusCode).toBe(401);
      });
    });

    describe('expiredToken() - backwards compatibility', () => {
      it('should work the same as tokenExpired()', () => {
        const error = AuthenticationError.expiredToken();

        expect(error.message).toBe('Authentication token has expired');
        expect(error.code).toBe(ErrorCode.TOKEN_EXPIRED);
        expect(error.statusCode).toBe(401);
      });
    });

    describe('insufficientPermissions()', () => {
      it('should create error without reason', () => {
        const error = AuthenticationError.insufficientPermissions();

        expect(error.message).toBe('Insufficient permissions');
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
        expect(error.statusCode).toBe(403);
        expect(error.context).toBeUndefined();
      });

      it('should create error with reason', () => {
        const error = AuthenticationError.insufficientPermissions('Admin role required');

        expect(error.message).toBe('Admin role required');
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
        expect(error.statusCode).toBe(403);
        expect(error.context).toEqual({ reason: 'Admin role required' });
      });
    });

    describe('forbidden()', () => {
      it('should create error without required permission', () => {
        const error = AuthenticationError.forbidden();

        expect(error.message).toBe('Access forbidden');
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
        expect(error.statusCode).toBe(403);
        expect(error.context).toBeUndefined();
      });

      it('should create error with required permission', () => {
        const error = AuthenticationError.forbidden('write:transactions');

        expect(error.message).toBe('Insufficient permissions. Required: write:transactions');
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
        expect(error.statusCode).toBe(403);
        expect(error.context).toEqual({ requiredPermission: 'write:transactions' });
      });
    });
  });

  // =============================================================================
  // RATE LIMIT ERROR
  // =============================================================================
  
  describe('RateLimitError', () => {
    it('should extend BaseError', () => {
      const error = new RateLimitError('Test error');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(RateLimitError);
    });

    it('should have correct default values', () => {
      const error = new RateLimitError('Test error');
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
      expect(error.name).toBe('RateLimitError');
    });

    it('should store retryAfter property', () => {
      const error = new RateLimitError('Test error', ErrorCode.RATE_LIMITED, 120);
      expect(error.retryAfter).toBe(120);
    });

    describe('forTenant()', () => {
      it('should create error with correct properties', () => {
        const error = RateLimitError.forTenant('tenant-123', 90);

        expect(error.message).toBe('Rate limit exceeded for tenant');
        expect(error.code).toBe(ErrorCode.RATE_LIMIT_TENANT);
        expect(error.statusCode).toBe(429);
        expect(error.retryAfter).toBe(90);
        expect(error.context).toEqual({ tenantId: 'tenant-123' });
      });
    });

    describe('toProblemDetails()', () => {
      it('should include retryAfter in problem details', () => {
        const error = new RateLimitError('Test error', ErrorCode.RATE_LIMITED, 120);
        const problemDetails = error.toProblemDetails();

        expect(problemDetails.retryAfter).toBe(120);
      });
    });
  });

  // =============================================================================
  // NOT FOUND ERROR
  // =============================================================================
  
  describe('NotFoundError', () => {
    it('should extend BaseError', () => {
      const error = new NotFoundError('Transaction');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it('should have correct default values', () => {
      const error = new NotFoundError('Transaction');
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('NotFoundError');
    });

    it('should create error without identifier', () => {
      const error = new NotFoundError('Transaction');

      expect(error.message).toBe('Transaction not found');
      expect(error.context).toEqual({
        resource: 'Transaction',
        identifier: undefined
      });
    });

    it('should create error with identifier', () => {
      const error = new NotFoundError('Transaction', 'abc123');

      expect(error.message).toBe("Transaction 'abc123' not found");
      expect(error.context).toEqual({
        resource: 'Transaction',
        identifier: 'abc123'
      });
    });
  });

  // =============================================================================
  // TYPE GUARDS
  // =============================================================================
  
  describe('Type Guards', () => {
    describe('isBaseError()', () => {
      it('should return true for BaseError instance', () => {
        const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
        expect(isBaseError(error)).toBe(true);
      });

      it('should return true for subclass instances', () => {
        expect(isBaseError(new IndexerError('Test'))).toBe(true);
        expect(isBaseError(new SolanaError('Test'))).toBe(true);
        expect(isBaseError(new DatabaseError('Test'))).toBe(true);
        expect(isBaseError(new ValidationError('Test'))).toBe(true);
        expect(isBaseError(new TenantError('Test'))).toBe(true);
        expect(isBaseError(new AuthenticationError('Test'))).toBe(true);
        expect(isBaseError(new RateLimitError('Test'))).toBe(true);
        expect(isBaseError(new NotFoundError('Test'))).toBe(true);
      });

      it('should return false for standard Error', () => {
        const error = new Error('Test');
        expect(isBaseError(error)).toBe(false);
      });

      it('should return false for non-error values', () => {
        expect(isBaseError(null)).toBe(false);
        expect(isBaseError(undefined)).toBe(false);
        expect(isBaseError('error')).toBe(false);
        expect(isBaseError(123)).toBe(false);
        expect(isBaseError({})).toBe(false);
      });
    });

    describe('isOperationalError()', () => {
      it('should return true for operational errors', () => {
        const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
        expect(isOperationalError(error)).toBe(true);
      });

      it('should return false for non-operational errors', () => {
        const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR, 500, undefined, false);
        expect(isOperationalError(error)).toBe(false);
      });

      it('should return false for standard Error', () => {
        const error = new Error('Test');
        expect(isOperationalError(error)).toBe(false);
      });

      it('should return false for non-error values', () => {
        expect(isOperationalError(null)).toBe(false);
        expect(isOperationalError(undefined)).toBe(false);
        expect(isOperationalError('error')).toBe(false);
      });
    });

    describe('isIndexerError()', () => {
      it('should return true for IndexerError instance', () => {
        const error = new IndexerError('Test');
        expect(isIndexerError(error)).toBe(true);
      });

      it('should return false for other error types', () => {
        expect(isIndexerError(new SolanaError('Test'))).toBe(false);
        expect(isIndexerError(new DatabaseError('Test'))).toBe(false);
        expect(isIndexerError(new Error('Test'))).toBe(false);
      });
    });

    describe('isSolanaError()', () => {
      it('should return true for SolanaError instance', () => {
        const error = new SolanaError('Test');
        expect(isSolanaError(error)).toBe(true);
      });

      it('should return false for other error types', () => {
        expect(isSolanaError(new IndexerError('Test'))).toBe(false);
        expect(isSolanaError(new DatabaseError('Test'))).toBe(false);
        expect(isSolanaError(new Error('Test'))).toBe(false);
      });
    });

    describe('isDatabaseError()', () => {
      it('should return true for DatabaseError instance', () => {
        const error = new DatabaseError('Test');
        expect(isDatabaseError(error)).toBe(true);
      });

      it('should return false for other error types', () => {
        expect(isDatabaseError(new IndexerError('Test'))).toBe(false);
        expect(isDatabaseError(new SolanaError('Test'))).toBe(false);
        expect(isDatabaseError(new Error('Test'))).toBe(false);
      });
    });

    describe('isValidationError()', () => {
      it('should return true for ValidationError instance', () => {
        const error = new ValidationError('Test');
        expect(isValidationError(error)).toBe(true);
      });

      it('should return false for other error types', () => {
        expect(isValidationError(new IndexerError('Test'))).toBe(false);
        expect(isValidationError(new Error('Test'))).toBe(false);
      });
    });

    describe('isTenantError()', () => {
      it('should return true for TenantError instance', () => {
        const error = new TenantError('Test');
        expect(isTenantError(error)).toBe(true);
      });

      it('should return false for other error types', () => {
        expect(isTenantError(new IndexerError('Test'))).toBe(false);
        expect(isTenantError(new Error('Test'))).toBe(false);
      });
    });

    describe('isAuthenticationError()', () => {
      it('should return true for AuthenticationError instance', () => {
        const error = new AuthenticationError('Test');
        expect(isAuthenticationError(error)).toBe(true);
      });

      it('should return false for other error types', () => {
        expect(isAuthenticationError(new IndexerError('Test'))).toBe(false);
        expect(isAuthenticationError(new Error('Test'))).toBe(false);
      });
    });

    describe('isRateLimitError()', () => {
      it('should return true for RateLimitError instance', () => {
        const error = new RateLimitError('Test');
        expect(isRateLimitError(error)).toBe(true);
      });

      it('should return false for other error types', () => {
        expect(isRateLimitError(new IndexerError('Test'))).toBe(false);
        expect(isRateLimitError(new Error('Test'))).toBe(false);
      });
    });
  });

  // =============================================================================
  // HELPER FUNCTION
  // =============================================================================
  
  describe('toProblemDetails() helper function', () => {
    it('should convert BaseError to problem details', () => {
      const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR, 500);
      const problemDetails = toProblemDetails(error, 'req-123', '/api/test');

      expect(problemDetails.type).toBe('https://api.tickettoken.com/errors/INTERNAL_ERROR');
      expect(problemDetails.title).toBe('BaseError');
      expect(problemDetails.status).toBe(500);
      expect(problemDetails.detail).toBe('Test error');
      expect(problemDetails.traceId).toBe('req-123');
      expect(problemDetails.instance).toBe('/api/test');
    });

    it('should convert standard Error to problem details in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error message');
      const problemDetails = toProblemDetails(error);

      expect(problemDetails.type).toBe('https://api.tickettoken.com/errors/INTERNAL_ERROR');
      expect(problemDetails.title).toBe('Internal Server Error');
      expect(problemDetails.status).toBe(500);
      expect(problemDetails.detail).toBe('Test error message');
      expect(problemDetails.code).toBe(ErrorCode.INTERNAL_ERROR);

      process.env.NODE_ENV = originalEnv;
    });

    it('should hide error message in production for standard Error', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Sensitive error message');
      const problemDetails = toProblemDetails(error);

      expect(problemDetails.detail).toBe('An unexpected error occurred');
      expect(problemDetails.detail).not.toContain('Sensitive');

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle unknown error types', () => {
      const problemDetails = toProblemDetails('some string error');

      expect(problemDetails.type).toBe('https://api.tickettoken.com/errors/INTERNAL_ERROR');
      expect(problemDetails.title).toBe('Internal Server Error');
      expect(problemDetails.status).toBe(500);
      expect(problemDetails.detail).toBe('An unexpected error occurred');
      expect(problemDetails.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('should include requestId when provided', () => {
      const error = new Error('Test');
      const problemDetails = toProblemDetails(error, 'req-456');

      expect(problemDetails.traceId).toBe('req-456');
    });

    it('should include instance when provided', () => {
      const error = new Error('Test');
      const problemDetails = toProblemDetails(error, undefined, '/api/endpoint');

      expect(problemDetails.instance).toBe('/api/endpoint');
    });

    it('should include timestamp in ISO format', () => {
      const error = new Error('Test');
      const problemDetails = toProblemDetails(error);

      expect(problemDetails.timestamp).toBeDefined();
      expect(() => new Date(problemDetails.timestamp!)).not.toThrow();
    });
  });

});
