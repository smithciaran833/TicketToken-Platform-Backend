/**
 * Unit Tests for errors/index.ts
 * 
 * Tests all error classes, error codes, factory methods, and type guards.
 */

import {
  ErrorCode,
  BaseError,
  MintingError,
  SolanaError,
  ValidationError,
  TenantError,
  IPFSError,
  AuthenticationError,
  RateLimitError,
  isBaseError,
  isOperationalError,
  isMintingError,
  isSolanaError,
  isValidationError,
  isTenantError,
  isIPFSError,
  isAuthenticationError,
  isRateLimitError,
} from '../../../src/errors';

// =============================================================================
// ErrorCode Enum Tests
// =============================================================================

describe('ErrorCode Enum', () => {
  describe('uniqueness', () => {
    it('should have unique values for all error codes', () => {
      const values = Object.values(ErrorCode);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  describe('minting error codes', () => {
    it('should include MINT_FAILED', () => {
      expect(ErrorCode.MINT_FAILED).toBe('MINT_FAILED');
    });

    it('should include MINT_DUPLICATE', () => {
      expect(ErrorCode.MINT_DUPLICATE).toBe('MINT_DUPLICATE');
    });

    it('should include MINT_IN_PROGRESS', () => {
      expect(ErrorCode.MINT_IN_PROGRESS).toBe('MINT_IN_PROGRESS');
    });

    it('should include MINT_NOT_FOUND', () => {
      expect(ErrorCode.MINT_NOT_FOUND).toBe('MINT_NOT_FOUND');
    });

    it('should include MINT_ALREADY_COMPLETED', () => {
      expect(ErrorCode.MINT_ALREADY_COMPLETED).toBe('MINT_ALREADY_COMPLETED');
    });
  });

  describe('solana error codes', () => {
    it('should include SOLANA_RPC_ERROR', () => {
      expect(ErrorCode.SOLANA_RPC_ERROR).toBe('SOLANA_RPC_ERROR');
    });

    it('should include SOLANA_TIMEOUT', () => {
      expect(ErrorCode.SOLANA_TIMEOUT).toBe('SOLANA_TIMEOUT');
    });

    it('should include SOLANA_INSUFFICIENT_FUNDS', () => {
      expect(ErrorCode.SOLANA_INSUFFICIENT_FUNDS).toBe('SOLANA_INSUFFICIENT_FUNDS');
    });

    it('should include SOLANA_BLOCKHASH_EXPIRED', () => {
      expect(ErrorCode.SOLANA_BLOCKHASH_EXPIRED).toBe('SOLANA_BLOCKHASH_EXPIRED');
    });
  });

  describe('ipfs error codes', () => {
    it('should include IPFS_UPLOAD_FAILED', () => {
      expect(ErrorCode.IPFS_UPLOAD_FAILED).toBe('IPFS_UPLOAD_FAILED');
    });

    it('should include IPFS_TIMEOUT', () => {
      expect(ErrorCode.IPFS_TIMEOUT).toBe('IPFS_TIMEOUT');
    });

    it('should include IPFS_CID_VERIFICATION_FAILED', () => {
      expect(ErrorCode.IPFS_CID_VERIFICATION_FAILED).toBe('IPFS_CID_VERIFICATION_FAILED');
    });
  });

  describe('tenant error codes', () => {
    it('should include TENANT_NOT_FOUND', () => {
      expect(ErrorCode.TENANT_NOT_FOUND).toBe('TENANT_NOT_FOUND');
    });

    it('should include TENANT_MISMATCH', () => {
      expect(ErrorCode.TENANT_MISMATCH).toBe('TENANT_MISMATCH');
    });

    it('should include TENANT_CONTEXT_MISSING', () => {
      expect(ErrorCode.TENANT_CONTEXT_MISSING).toBe('TENANT_CONTEXT_MISSING');
    });
  });

  describe('rate limit error codes', () => {
    it('should include RATE_LIMITED', () => {
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    });

    it('should include RATE_LIMIT_TENANT', () => {
      expect(ErrorCode.RATE_LIMIT_TENANT).toBe('RATE_LIMIT_TENANT');
    });

    it('should include RATE_LIMIT_GLOBAL', () => {
      expect(ErrorCode.RATE_LIMIT_GLOBAL).toBe('RATE_LIMIT_GLOBAL');
    });
  });

  describe('validation error codes', () => {
    it('should include VALIDATION_FAILED', () => {
      expect(ErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    });

    it('should include VALIDATION_MISSING_FIELD', () => {
      expect(ErrorCode.VALIDATION_MISSING_FIELD).toBe('VALIDATION_MISSING_FIELD');
    });
  });

  describe('authentication error codes', () => {
    it('should include UNAUTHORIZED', () => {
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
    });

    it('should include FORBIDDEN', () => {
      expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
    });

    it('should include TOKEN_INVALID', () => {
      expect(ErrorCode.TOKEN_INVALID).toBe('TOKEN_INVALID');
    });

    it('should include TOKEN_EXPIRED', () => {
      expect(ErrorCode.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
    });
  });
});

// =============================================================================
// BaseError Tests
// =============================================================================

describe('BaseError', () => {
  describe('constructor', () => {
    it('should set name property to class name', () => {
      const error = new BaseError('Test error', ErrorCode.INTERNAL_ERROR);
      expect(error.name).toBe('BaseError');
    });

    it('should set message property', () => {
      const message = 'Test error message';
      const error = new BaseError(message, ErrorCode.INTERNAL_ERROR);
      expect(error.message).toBe(message);
    });

    it('should set statusCode property', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR, 503);
      expect(error.statusCode).toBe(503);
    });

    it('should default statusCode to 500', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
    });

    it('should set code property', () => {
      const error = new BaseError('Test', ErrorCode.MINT_FAILED);
      expect(error.code).toBe(ErrorCode.MINT_FAILED);
    });

    it('should set isOperational property (default true)', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
      expect(error.isOperational).toBe(true);
    });

    it('should allow setting isOperational to false', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR, 500, undefined, false);
      expect(error.isOperational).toBe(false);
    });

    it('should capture stack trace', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('BaseError');
    });

    it('should accept context object', () => {
      const context = { ticketId: '123', tenantId: '456' };
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR, 500, context);
      expect(error.context).toEqual(context);
    });

    it('should set timestamp', () => {
      const before = new Date();
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
      const after = new Date();
      
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('toJSON', () => {
    it('should serialize all properties', () => {
      const context = { key: 'value' };
      const error = new BaseError('Test message', ErrorCode.INTERNAL_ERROR, 503, context);
      const json = error.toJSON();

      expect(json.name).toBe('BaseError');
      expect(json.message).toBe('Test message');
      expect(json.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(json.statusCode).toBe(503);
      expect(json.context).toEqual(context);
    });

    it('should include stack trace', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
      const json = error.toJSON();
      expect(json.stack).toBeDefined();
    });

    it('should include timestamp as ISO string', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
      const json = error.toJSON();
      expect(typeof json.timestamp).toBe('string');
      expect(new Date(json.timestamp as string).toISOString()).toBe(json.timestamp);
    });
  });

  describe('inheritance', () => {
    it('should be instance of Error', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
      expect(error).toBeInstanceOf(Error);
    });

    it('should be instance of BaseError', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
      expect(error).toBeInstanceOf(BaseError);
    });
  });
});

// =============================================================================
// MintingError Tests
// =============================================================================

describe('MintingError', () => {
  describe('constructor', () => {
    it('should extend BaseError', () => {
      const error = new MintingError('Test');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(MintingError);
    });

    it('should set name to MintingError', () => {
      const error = new MintingError('Test');
      expect(error.name).toBe('MintingError');
    });

    it('should have default statusCode 500', () => {
      const error = new MintingError('Test');
      expect(error.statusCode).toBe(500);
    });

    it('should have default code MINT_FAILED', () => {
      const error = new MintingError('Test');
      expect(error.code).toBe(ErrorCode.MINT_FAILED);
    });

    it('should accept custom code', () => {
      const error = new MintingError('Test', ErrorCode.MINT_BATCH_FAILED);
      expect(error.code).toBe(ErrorCode.MINT_BATCH_FAILED);
    });

    it('should accept custom statusCode', () => {
      const error = new MintingError('Test', ErrorCode.MINT_FAILED, 409);
      expect(error.statusCode).toBe(409);
    });

    it('should accept context', () => {
      const context = { ticketId: '123' };
      const error = new MintingError('Test', ErrorCode.MINT_FAILED, 500, context);
      expect(error.context).toEqual(context);
    });
  });

  describe('static duplicate()', () => {
    it('should create error with MINT_DUPLICATE code', () => {
      const error = MintingError.duplicate('ticket-123', 'tenant-456');
      expect(error.code).toBe(ErrorCode.MINT_DUPLICATE);
    });

    it('should have statusCode 409', () => {
      const error = MintingError.duplicate('ticket-123', 'tenant-456');
      expect(error.statusCode).toBe(409);
    });

    it('should include ticketId in context', () => {
      const error = MintingError.duplicate('ticket-123', 'tenant-456');
      expect(error.context?.ticketId).toBe('ticket-123');
    });

    it('should include tenantId in context', () => {
      const error = MintingError.duplicate('ticket-123', 'tenant-456');
      expect(error.context?.tenantId).toBe('tenant-456');
    });

    it('should include ticketId in message', () => {
      const error = MintingError.duplicate('ticket-123', 'tenant-456');
      expect(error.message).toContain('ticket-123');
    });
  });

  describe('static inProgress()', () => {
    it('should create error with MINT_IN_PROGRESS code', () => {
      const error = MintingError.inProgress('ticket-123', 'tenant-456');
      expect(error.code).toBe(ErrorCode.MINT_IN_PROGRESS);
    });

    it('should have statusCode 409', () => {
      const error = MintingError.inProgress('ticket-123', 'tenant-456');
      expect(error.statusCode).toBe(409);
    });

    it('should include ticketId in context', () => {
      const error = MintingError.inProgress('ticket-123', 'tenant-456');
      expect(error.context?.ticketId).toBe('ticket-123');
    });

    it('should include tenantId in context', () => {
      const error = MintingError.inProgress('ticket-123', 'tenant-456');
      expect(error.context?.tenantId).toBe('tenant-456');
    });
  });

  describe('static notFound()', () => {
    it('should create error with MINT_NOT_FOUND code', () => {
      const error = MintingError.notFound('mint-123');
      expect(error.code).toBe(ErrorCode.MINT_NOT_FOUND);
    });

    it('should have statusCode 404', () => {
      const error = MintingError.notFound('mint-123');
      expect(error.statusCode).toBe(404);
    });

    it('should include mintId in context', () => {
      const error = MintingError.notFound('mint-123');
      expect(error.context?.mintId).toBe('mint-123');
    });
  });
});

// =============================================================================
// SolanaError Tests
// =============================================================================

describe('SolanaError', () => {
  describe('constructor', () => {
    it('should extend BaseError', () => {
      const error = new SolanaError('Test');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(SolanaError);
    });

    it('should set name to SolanaError', () => {
      const error = new SolanaError('Test');
      expect(error.name).toBe('SolanaError');
    });

    it('should have default statusCode 503', () => {
      const error = new SolanaError('Test');
      expect(error.statusCode).toBe(503);
    });

    it('should have default code SOLANA_RPC_ERROR', () => {
      const error = new SolanaError('Test');
      expect(error.code).toBe(ErrorCode.SOLANA_RPC_ERROR);
    });
  });

  describe('static timeout()', () => {
    it('should create error with SOLANA_TIMEOUT code', () => {
      const error = SolanaError.timeout('mintNFT', 30000);
      expect(error.code).toBe(ErrorCode.SOLANA_TIMEOUT);
    });

    it('should have statusCode 504', () => {
      const error = SolanaError.timeout('mintNFT', 30000);
      expect(error.statusCode).toBe(504);
    });

    it('should include operation in context', () => {
      const error = SolanaError.timeout('mintNFT', 30000);
      expect(error.context?.operation).toBe('mintNFT');
    });

    it('should include duration in context', () => {
      const error = SolanaError.timeout('mintNFT', 30000);
      expect(error.context?.durationMs).toBe(30000);
    });
  });

  describe('static unavailable()', () => {
    it('should create error with SOLANA_RPC_UNAVAILABLE code', () => {
      const error = SolanaError.unavailable('https://api.devnet.solana.com');
      expect(error.code).toBe(ErrorCode.SOLANA_RPC_UNAVAILABLE);
    });

    it('should have statusCode 503', () => {
      const error = SolanaError.unavailable('https://api.devnet.solana.com');
      expect(error.statusCode).toBe(503);
    });

    it('should include endpoint in context', () => {
      const endpoint = 'https://api.devnet.solana.com';
      const error = SolanaError.unavailable(endpoint);
      expect(error.context?.endpoint).toBe(endpoint);
    });
  });

  describe('static insufficientFunds()', () => {
    it('should create error with SOLANA_INSUFFICIENT_FUNDS code', () => {
      const error = SolanaError.insufficientFunds(0.1, 0.05);
      expect(error.code).toBe(ErrorCode.SOLANA_INSUFFICIENT_FUNDS);
    });

    it('should have statusCode 400', () => {
      const error = SolanaError.insufficientFunds(0.1, 0.05);
      expect(error.statusCode).toBe(400);
    });

    it('should include required amount in context', () => {
      const error = SolanaError.insufficientFunds(0.1, 0.05);
      expect(error.context?.required).toBe(0.1);
    });

    it('should include available amount in context', () => {
      const error = SolanaError.insufficientFunds(0.1, 0.05);
      expect(error.context?.available).toBe(0.05);
    });
  });

  describe('static blockhashExpired()', () => {
    it('should create error with SOLANA_BLOCKHASH_EXPIRED code', () => {
      const error = SolanaError.blockhashExpired();
      expect(error.code).toBe(ErrorCode.SOLANA_BLOCKHASH_EXPIRED);
    });

    it('should have statusCode 409', () => {
      const error = SolanaError.blockhashExpired();
      expect(error.statusCode).toBe(409);
    });
  });
});

// =============================================================================
// ValidationError Tests
// =============================================================================

describe('ValidationError', () => {
  describe('constructor', () => {
    it('should extend BaseError', () => {
      const error = new ValidationError('Test');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should set name to ValidationError', () => {
      const error = new ValidationError('Test');
      expect(error.name).toBe('ValidationError');
    });

    it('should have default statusCode 400', () => {
      const error = new ValidationError('Test');
      expect(error.statusCode).toBe(400);
    });

    it('should have default code VALIDATION_FAILED', () => {
      const error = new ValidationError('Test');
      expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('should accept validationErrors array', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'name', message: 'Required' },
      ];
      const error = new ValidationError('Test', ErrorCode.VALIDATION_FAILED, 400, undefined, validationErrors);
      expect(error.validationErrors).toEqual(validationErrors);
    });
  });

  describe('static fromZodError()', () => {
    it('should format Zod errors correctly', () => {
      const zodError = {
        errors: [
          { path: ['email'], message: 'Invalid email format' },
          { path: ['nested', 'field'], message: 'Required' },
        ],
      };
      const error = ValidationError.fromZodError(zodError);
      
      expect(error.validationErrors).toHaveLength(2);
    });

    it('should map paths to field names with dots', () => {
      const zodError = {
        errors: [
          { path: ['user', 'profile', 'email'], message: 'Invalid' },
        ],
      };
      const error = ValidationError.fromZodError(zodError);
      
      expect(error.validationErrors?.[0].field).toBe('user.profile.email');
    });

    it('should preserve error messages', () => {
      const zodError = {
        errors: [
          { path: ['email'], message: 'Invalid email format' },
        ],
      };
      const error = ValidationError.fromZodError(zodError);
      
      expect(error.validationErrors?.[0].message).toBe('Invalid email format');
    });

    it('should include errorCount in context', () => {
      const zodError = {
        errors: [
          { path: ['field1'], message: 'Error 1' },
          { path: ['field2'], message: 'Error 2' },
        ],
      };
      const error = ValidationError.fromZodError(zodError);
      
      expect(error.context?.errorCount).toBe(2);
    });
  });

  describe('static missingField()', () => {
    it('should create error with VALIDATION_MISSING_FIELD code', () => {
      const error = ValidationError.missingField('tenantId');
      expect(error.code).toBe(ErrorCode.VALIDATION_MISSING_FIELD);
    });

    it('should have statusCode 400', () => {
      const error = ValidationError.missingField('tenantId');
      expect(error.statusCode).toBe(400);
    });

    it('should include field in context', () => {
      const error = ValidationError.missingField('tenantId');
      expect(error.context?.field).toBe('tenantId');
    });

    it('should include field name in message', () => {
      const error = ValidationError.missingField('tenantId');
      expect(error.message).toContain('tenantId');
    });
  });

  describe('toJSON()', () => {
    it('should include validationErrors in JSON output', () => {
      const validationErrors = [{ field: 'email', message: 'Invalid' }];
      const error = new ValidationError('Test', ErrorCode.VALIDATION_FAILED, 400, undefined, validationErrors);
      const json = error.toJSON();
      
      expect(json.validationErrors).toEqual(validationErrors);
    });
  });
});

// =============================================================================
// TenantError Tests
// =============================================================================

describe('TenantError', () => {
  describe('constructor', () => {
    it('should extend BaseError', () => {
      const error = new TenantError('Test');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(TenantError);
    });

    it('should set name to TenantError', () => {
      const error = new TenantError('Test');
      expect(error.name).toBe('TenantError');
    });

    it('should have default statusCode 403', () => {
      const error = new TenantError('Test');
      expect(error.statusCode).toBe(403);
    });

    it('should have default code TENANT_INVALID', () => {
      const error = new TenantError('Test');
      expect(error.code).toBe(ErrorCode.TENANT_INVALID);
    });
  });

  describe('static missingContext()', () => {
    it('should create error with TENANT_CONTEXT_MISSING code', () => {
      const error = TenantError.missingContext();
      expect(error.code).toBe(ErrorCode.TENANT_CONTEXT_MISSING);
    });

    it('should have statusCode 400', () => {
      const error = TenantError.missingContext();
      expect(error.statusCode).toBe(400);
    });
  });

  describe('static mismatch()', () => {
    it('should create error with TENANT_MISMATCH code', () => {
      const error = TenantError.mismatch('tenant-1', 'tenant-2');
      expect(error.code).toBe(ErrorCode.TENANT_MISMATCH);
    });

    it('should have statusCode 403', () => {
      const error = TenantError.mismatch('tenant-1', 'tenant-2');
      expect(error.statusCode).toBe(403);
    });

    it('should include requestTenantId in context', () => {
      const error = TenantError.mismatch('tenant-1', 'tenant-2');
      expect(error.context?.requestTenantId).toBe('tenant-1');
    });

    it('should include resourceTenantId in context', () => {
      const error = TenantError.mismatch('tenant-1', 'tenant-2');
      expect(error.context?.resourceTenantId).toBe('tenant-2');
    });
  });

  describe('static invalid()', () => {
    it('should create error with TENANT_INVALID code', () => {
      const error = TenantError.invalid('invalid-tenant');
      expect(error.code).toBe(ErrorCode.TENANT_INVALID);
    });

    it('should have statusCode 400', () => {
      const error = TenantError.invalid('invalid-tenant');
      expect(error.statusCode).toBe(400);
    });

    it('should include tenantId in context', () => {
      const error = TenantError.invalid('invalid-tenant');
      expect(error.context?.tenantId).toBe('invalid-tenant');
    });
  });
});

// =============================================================================
// IPFSError Tests
// =============================================================================

describe('IPFSError', () => {
  describe('constructor', () => {
    it('should extend BaseError', () => {
      const error = new IPFSError('Test');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(IPFSError);
    });

    it('should set name to IPFSError', () => {
      const error = new IPFSError('Test');
      expect(error.name).toBe('IPFSError');
    });

    it('should have default statusCode 502', () => {
      const error = new IPFSError('Test');
      expect(error.statusCode).toBe(502);
    });

    it('should have default code IPFS_UPLOAD_FAILED', () => {
      const error = new IPFSError('Test');
      expect(error.code).toBe(ErrorCode.IPFS_UPLOAD_FAILED);
    });
  });

  describe('static timeout()', () => {
    it('should create error with IPFS_TIMEOUT code', () => {
      const error = IPFSError.timeout(30000);
      expect(error.code).toBe(ErrorCode.IPFS_TIMEOUT);
    });

    it('should have statusCode 504', () => {
      const error = IPFSError.timeout(30000);
      expect(error.statusCode).toBe(504);
    });

    it('should include durationMs in context', () => {
      const error = IPFSError.timeout(30000);
      expect(error.context?.durationMs).toBe(30000);
    });
  });

  describe('static pinFailed()', () => {
    it('should create error with IPFS_PIN_FAILED code', () => {
      const error = IPFSError.pinFailed('QmTestCid123');
      expect(error.code).toBe(ErrorCode.IPFS_PIN_FAILED);
    });

    it('should have statusCode 502', () => {
      const error = IPFSError.pinFailed('QmTestCid123');
      expect(error.statusCode).toBe(502);
    });

    it('should include CID in context', () => {
      const error = IPFSError.pinFailed('QmTestCid123');
      expect(error.context?.cid).toBe('QmTestCid123');
    });
  });

  describe('static cidVerificationFailed()', () => {
    it('should create error with IPFS_CID_VERIFICATION_FAILED code', () => {
      const error = IPFSError.cidVerificationFailed('expected-cid', 'actual-cid');
      expect(error.code).toBe(ErrorCode.IPFS_CID_VERIFICATION_FAILED);
    });

    it('should have statusCode 500', () => {
      const error = IPFSError.cidVerificationFailed('expected-cid', 'actual-cid');
      expect(error.statusCode).toBe(500);
    });

    it('should include expectedCid in context', () => {
      const error = IPFSError.cidVerificationFailed('expected-cid', 'actual-cid');
      expect(error.context?.expectedCid).toBe('expected-cid');
    });

    it('should include actualCid in context', () => {
      const error = IPFSError.cidVerificationFailed('expected-cid', 'actual-cid');
      expect(error.context?.actualCid).toBe('actual-cid');
    });
  });
});

// =============================================================================
// AuthenticationError Tests
// =============================================================================

describe('AuthenticationError', () => {
  describe('constructor', () => {
    it('should extend BaseError', () => {
      const error = new AuthenticationError('Test');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(AuthenticationError);
    });

    it('should set name to AuthenticationError', () => {
      const error = new AuthenticationError('Test');
      expect(error.name).toBe('AuthenticationError');
    });

    it('should have default statusCode 401', () => {
      const error = new AuthenticationError('Test');
      expect(error.statusCode).toBe(401);
    });

    it('should have default code UNAUTHORIZED', () => {
      const error = new AuthenticationError('Test');
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('static invalidToken()', () => {
    it('should create error with TOKEN_INVALID code', () => {
      const error = AuthenticationError.invalidToken();
      expect(error.code).toBe(ErrorCode.TOKEN_INVALID);
    });

    it('should have statusCode 401', () => {
      const error = AuthenticationError.invalidToken();
      expect(error.statusCode).toBe(401);
    });
  });

  describe('static expiredToken()', () => {
    it('should create error with TOKEN_EXPIRED code', () => {
      const error = AuthenticationError.expiredToken();
      expect(error.code).toBe(ErrorCode.TOKEN_EXPIRED);
    });

    it('should have statusCode 401', () => {
      const error = AuthenticationError.expiredToken();
      expect(error.statusCode).toBe(401);
    });
  });

  describe('static invalidSignature()', () => {
    it('should create error with SIGNATURE_INVALID code', () => {
      const error = AuthenticationError.invalidSignature();
      expect(error.code).toBe(ErrorCode.SIGNATURE_INVALID);
    });

    it('should have statusCode 401', () => {
      const error = AuthenticationError.invalidSignature();
      expect(error.statusCode).toBe(401);
    });
  });

  describe('static forbidden()', () => {
    it('should create error with FORBIDDEN code', () => {
      const error = AuthenticationError.forbidden();
      expect(error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('should have statusCode 403', () => {
      const error = AuthenticationError.forbidden();
      expect(error.statusCode).toBe(403);
    });

    it('should include requiredRole in context when provided', () => {
      const error = AuthenticationError.forbidden('admin');
      expect(error.context?.requiredRole).toBe('admin');
    });

    it('should include role in message when provided', () => {
      const error = AuthenticationError.forbidden('admin');
      expect(error.message).toContain('admin');
    });
  });

  describe('static insufficientRole()', () => {
    it('should create error with ROLE_INSUFFICIENT code', () => {
      const error = AuthenticationError.insufficientRole('user', 'admin');
      expect(error.code).toBe(ErrorCode.ROLE_INSUFFICIENT);
    });

    it('should have statusCode 403', () => {
      const error = AuthenticationError.insufficientRole('user', 'admin');
      expect(error.statusCode).toBe(403);
    });

    it('should include userRole in context', () => {
      const error = AuthenticationError.insufficientRole('user', 'admin');
      expect(error.context?.userRole).toBe('user');
    });

    it('should include requiredRole in context', () => {
      const error = AuthenticationError.insufficientRole('user', 'admin');
      expect(error.context?.requiredRole).toBe('admin');
    });

    it('should include both roles in message', () => {
      const error = AuthenticationError.insufficientRole('user', 'admin');
      expect(error.message).toContain('user');
      expect(error.message).toContain('admin');
    });
  });
});

// =============================================================================
// RateLimitError Tests
// =============================================================================

describe('RateLimitError', () => {
  describe('constructor', () => {
    it('should extend BaseError', () => {
      const error = new RateLimitError('Test');
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(RateLimitError);
    });

    it('should set name to RateLimitError', () => {
      const error = new RateLimitError('Test');
      expect(error.name).toBe('RateLimitError');
    });

    it('should have statusCode 429', () => {
      const error = new RateLimitError('Test');
      expect(error.statusCode).toBe(429);
    });

    it('should have default code RATE_LIMITED', () => {
      const error = new RateLimitError('Test');
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
    });

    it('should include retryAfter property', () => {
      const error = new RateLimitError('Test', ErrorCode.RATE_LIMITED, 120);
      expect(error.retryAfter).toBe(120);
    });

    it('should default retryAfter to 60', () => {
      const error = new RateLimitError('Test');
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('static forTenant()', () => {
    it('should create error with RATE_LIMIT_TENANT code', () => {
      const error = RateLimitError.forTenant('tenant-123', 60);
      expect(error.code).toBe(ErrorCode.RATE_LIMIT_TENANT);
    });

    it('should have statusCode 429', () => {
      const error = RateLimitError.forTenant('tenant-123', 60);
      expect(error.statusCode).toBe(429);
    });

    it('should include tenantId in context', () => {
      const error = RateLimitError.forTenant('tenant-123', 60);
      expect(error.context?.tenantId).toBe('tenant-123');
    });

    it('should set retryAfter', () => {
      const error = RateLimitError.forTenant('tenant-123', 120);
      expect(error.retryAfter).toBe(120);
    });
  });

  describe('static global()', () => {
    it('should create error with RATE_LIMIT_GLOBAL code', () => {
      const error = RateLimitError.global(300);
      expect(error.code).toBe(ErrorCode.RATE_LIMIT_GLOBAL);
    });

    it('should have statusCode 429', () => {
      const error = RateLimitError.global(300);
      expect(error.statusCode).toBe(429);
    });

    it('should set retryAfter', () => {
      const error = RateLimitError.global(300);
      expect(error.retryAfter).toBe(300);
    });
  });

  describe('toJSON()', () => {
    it('should include retryAfter in JSON output', () => {
      const error = new RateLimitError('Test', ErrorCode.RATE_LIMITED, 120);
      const json = error.toJSON();
      expect(json.retryAfter).toBe(120);
    });
  });
});

// =============================================================================
// Type Guard Tests
// =============================================================================

describe('Type Guards', () => {
  describe('isBaseError()', () => {
    it('should return true for BaseError instances', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
      expect(isBaseError(error)).toBe(true);
    });

    it('should return true for subclass instances', () => {
      const error = new MintingError('Test');
      expect(isBaseError(error)).toBe(true);
    });

    it('should return false for plain Error', () => {
      const error = new Error('Test');
      expect(isBaseError(error)).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isBaseError('string')).toBe(false);
      expect(isBaseError(null)).toBe(false);
      expect(isBaseError(undefined)).toBe(false);
      expect(isBaseError({})).toBe(false);
      expect(isBaseError(123)).toBe(false);
    });
  });

  describe('isOperationalError()', () => {
    it('should return true for operational errors', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR, 500, undefined, true);
      expect(isOperationalError(error)).toBe(true);
    });

    it('should return false for non-operational errors', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR, 500, undefined, false);
      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for plain Error', () => {
      const error = new Error('Test');
      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isOperationalError('string')).toBe(false);
      expect(isOperationalError(null)).toBe(false);
    });
  });

  describe('isMintingError()', () => {
    it('should return true for MintingError instances', () => {
      const error = new MintingError('Test');
      expect(isMintingError(error)).toBe(true);
    });

    it('should return false for other error types', () => {
      const error = new SolanaError('Test');
      expect(isMintingError(error)).toBe(false);
    });

    it('should return false for BaseError', () => {
      const error = new BaseError('Test', ErrorCode.INTERNAL_ERROR);
      expect(isMintingError(error)).toBe(false);
    });
  });

  describe('isSolanaError()', () => {
    it('should return true for SolanaError instances', () => {
      const error = new SolanaError('Test');
      expect(isSolanaError(error)).toBe(true);
    });

    it('should return false for other error types', () => {
      const error = new MintingError('Test');
      expect(isSolanaError(error)).toBe(false);
    });
  });

  describe('isValidationError()', () => {
    it('should return true for ValidationError instances', () => {
      const error = new ValidationError('Test');
      expect(isValidationError(error)).toBe(true);
    });

    it('should return false for other error types', () => {
      const error = new MintingError('Test');
      expect(isValidationError(error)).toBe(false);
    });
  });

  describe('isTenantError()', () => {
    it('should return true for TenantError instances', () => {
      const error = new TenantError('Test');
      expect(isTenantError(error)).toBe(true);
    });

    it('should return false for other error types', () => {
      const error = new MintingError('Test');
      expect(isTenantError(error)).toBe(false);
    });
  });

  describe('isIPFSError()', () => {
    it('should return true for IPFSError instances', () => {
      const error = new IPFSError('Test');
      expect(isIPFSError(error)).toBe(true);
    });

    it('should return false for other error types', () => {
      const error = new MintingError('Test');
      expect(isIPFSError(error)).toBe(false);
    });
  });

  describe('isAuthenticationError()', () => {
    it('should return true for AuthenticationError instances', () => {
      const error = new AuthenticationError('Test');
      expect(isAuthenticationError(error)).toBe(true);
    });

    it('should return false for other error types', () => {
      const error = new MintingError('Test');
      expect(isAuthenticationError(error)).toBe(false);
    });
  });

  describe('isRateLimitError()', () => {
    it('should return true for RateLimitError instances', () => {
      const error = new RateLimitError('Test');
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should return false for other error types', () => {
      const error = new MintingError('Test');
      expect(isRateLimitError(error)).toBe(false);
    });
  });
});
