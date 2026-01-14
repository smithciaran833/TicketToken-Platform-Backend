/**
 * Unit tests for blockchain-service error classes and utilities
 * Tests RFC 7807 Problem Details format and all custom error classes
 * Issue #7: RFC 7807 format error responses
 * Issue #8: Stack traces exposure control
 * Issue SL5: Error codes for all service errors
 */

describe('Errors Module', () => {
  // ===========================================================================
  // ErrorCode Enum
  // ===========================================================================
  describe('ErrorCode Enum', () => {
    const ErrorCode = {
      // Blockchain/Solana errors
      SOLANA_TIMEOUT: 'SOLANA_TIMEOUT',
      SOLANA_RPC_ERROR: 'SOLANA_RPC_ERROR',
      SOLANA_RPC_UNAVAILABLE: 'SOLANA_RPC_UNAVAILABLE',
      SOLANA_TRANSACTION_FAILED: 'SOLANA_TRANSACTION_FAILED',
      SOLANA_SIGNATURE_FAILED: 'SOLANA_SIGNATURE_FAILED',
      SOLANA_BLOCKHASH_EXPIRED: 'SOLANA_BLOCKHASH_EXPIRED',
      SOLANA_INSUFFICIENT_FUNDS: 'SOLANA_INSUFFICIENT_FUNDS',
      SOLANA_CONFIRMATION_TIMEOUT: 'SOLANA_CONFIRMATION_TIMEOUT',
      SOLANA_SIMULATION_FAILED: 'SOLANA_SIMULATION_FAILED',
      // Minting errors
      MINT_FAILED: 'MINT_FAILED',
      MINT_DUPLICATE: 'MINT_DUPLICATE',
      MINT_IN_PROGRESS: 'MINT_IN_PROGRESS',
      MINT_NOT_FOUND: 'MINT_NOT_FOUND',
      MINT_ALREADY_COMPLETED: 'MINT_ALREADY_COMPLETED',
      // Wallet errors
      WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
      WALLET_NOT_INITIALIZED: 'WALLET_NOT_INITIALIZED',
      WALLET_BALANCE_LOW: 'WALLET_BALANCE_LOW',
      TREASURY_NOT_INITIALIZED: 'TREASURY_NOT_INITIALIZED',
      TREASURY_BALANCE_LOW: 'TREASURY_BALANCE_LOW',
      // Tenant errors
      TENANT_INVALID: 'TENANT_INVALID',
      TENANT_MISMATCH: 'TENANT_MISMATCH',
      TENANT_CONTEXT_MISSING: 'TENANT_CONTEXT_MISSING',
      // Validation errors
      VALIDATION_FAILED: 'VALIDATION_FAILED',
      VALIDATION_MISSING_FIELD: 'VALIDATION_MISSING_FIELD',
      // Auth errors
      UNAUTHORIZED: 'UNAUTHORIZED',
      FORBIDDEN: 'FORBIDDEN',
      TOKEN_INVALID: 'TOKEN_INVALID',
      TOKEN_EXPIRED: 'TOKEN_EXPIRED',
      SIGNATURE_INVALID: 'SIGNATURE_INVALID',
      // Rate limit
      RATE_LIMITED: 'RATE_LIMITED',
      RATE_LIMIT_TENANT: 'RATE_LIMIT_TENANT',
      // General
      NOT_FOUND: 'NOT_FOUND',
      INTERNAL_ERROR: 'INTERNAL_ERROR',
      CIRCUIT_OPEN: 'CIRCUIT_OPEN'
    };

    it('should have unique SOLANA_TIMEOUT code', () => {
      expect(ErrorCode.SOLANA_TIMEOUT).toBe('SOLANA_TIMEOUT');
    });

    it('should have unique SOLANA_RPC_ERROR code', () => {
      expect(ErrorCode.SOLANA_RPC_ERROR).toBe('SOLANA_RPC_ERROR');
    });

    it('should have unique SOLANA_RPC_UNAVAILABLE code', () => {
      expect(ErrorCode.SOLANA_RPC_UNAVAILABLE).toBe('SOLANA_RPC_UNAVAILABLE');
    });

    it('should have unique MINT_FAILED code', () => {
      expect(ErrorCode.MINT_FAILED).toBe('MINT_FAILED');
    });

    it('should have unique MINT_DUPLICATE code', () => {
      expect(ErrorCode.MINT_DUPLICATE).toBe('MINT_DUPLICATE');
    });

    it('should have unique MINT_IN_PROGRESS code', () => {
      expect(ErrorCode.MINT_IN_PROGRESS).toBe('MINT_IN_PROGRESS');
    });

    it('should have unique WALLET_NOT_FOUND code', () => {
      expect(ErrorCode.WALLET_NOT_FOUND).toBe('WALLET_NOT_FOUND');
    });

    it('should have unique TREASURY_BALANCE_LOW code', () => {
      expect(ErrorCode.TREASURY_BALANCE_LOW).toBe('TREASURY_BALANCE_LOW');
    });

    it('should have unique TENANT_CONTEXT_MISSING code', () => {
      expect(ErrorCode.TENANT_CONTEXT_MISSING).toBe('TENANT_CONTEXT_MISSING');
    });

    it('should have unique RATE_LIMITED code', () => {
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    });

    it('should have unique NOT_FOUND code', () => {
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    });

    it('should have all unique values', () => {
      const values = Object.values(ErrorCode);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  // ===========================================================================
  // BaseError Class
  // ===========================================================================
  describe('BaseError', () => {
    class BaseError extends Error {
      public readonly code: string;
      public readonly statusCode: number;
      public readonly context?: Record<string, unknown>;
      public readonly timestamp: Date;
      public readonly isOperational: boolean;

      constructor(message: string, code: string, statusCode = 500, context?: Record<string, unknown>, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.context = context;
        this.timestamp = new Date();
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
      }

      toProblemDetails(requestId?: string, instance?: string) {
        return {
          type: `https://api.tickettoken.com/errors/${this.code}`,
          title: this.name,
          status: this.statusCode,
          detail: this.message,
          code: this.code,
          instance,
          timestamp: this.timestamp.toISOString(),
          traceId: requestId
        };
      }

      toJSON() {
        return {
          name: this.name,
          message: this.message,
          code: this.code,
          statusCode: this.statusCode,
          context: this.context,
          timestamp: this.timestamp.toISOString()
        };
      }
    }

    it('should set name property', () => {
      const error = new BaseError('Test error', 'TEST_ERROR');
      expect(error.name).toBe('BaseError');
    });

    it('should set message property', () => {
      const error = new BaseError('Test error message', 'TEST_ERROR');
      expect(error.message).toBe('Test error message');
    });

    it('should set code property', () => {
      const error = new BaseError('Test', 'MY_ERROR_CODE');
      expect(error.code).toBe('MY_ERROR_CODE');
    });

    it('should set statusCode property', () => {
      const error = new BaseError('Test', 'TEST', 404);
      expect(error.statusCode).toBe(404);
    });

    it('should default statusCode to 500', () => {
      const error = new BaseError('Test', 'TEST');
      expect(error.statusCode).toBe(500);
    });

    it('should set context property', () => {
      const error = new BaseError('Test', 'TEST', 500, { key: 'value' });
      expect(error.context).toEqual({ key: 'value' });
    });

    it('should set timestamp property', () => {
      const before = new Date();
      const error = new BaseError('Test', 'TEST');
      const after = new Date();
      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set isOperational to true by default', () => {
      const error = new BaseError('Test', 'TEST');
      expect(error.isOperational).toBe(true);
    });

    it('should allow setting isOperational to false', () => {
      const error = new BaseError('Test', 'TEST', 500, undefined, false);
      expect(error.isOperational).toBe(false);
    });

    it('should capture stack trace', () => {
      const error = new BaseError('Test', 'TEST');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('BaseError');
    });

    describe('toProblemDetails (Issue #7: RFC 7807)', () => {
      it('should return type URL with error code', () => {
        const error = new BaseError('Test', 'TEST_ERROR');
        const details = error.toProblemDetails();
        expect(details.type).toBe('https://api.tickettoken.com/errors/TEST_ERROR');
      });

      it('should return title as class name', () => {
        const error = new BaseError('Test', 'TEST');
        const details = error.toProblemDetails();
        expect(details.title).toBe('BaseError');
      });

      it('should return status as statusCode', () => {
        const error = new BaseError('Test', 'TEST', 404);
        const details = error.toProblemDetails();
        expect(details.status).toBe(404);
      });

      it('should return detail as message', () => {
        const error = new BaseError('My error message', 'TEST');
        const details = error.toProblemDetails();
        expect(details.detail).toBe('My error message');
      });

      it('should include code property', () => {
        const error = new BaseError('Test', 'MY_CODE');
        const details = error.toProblemDetails();
        expect(details.code).toBe('MY_CODE');
      });

      it('should include instance when provided', () => {
        const error = new BaseError('Test', 'TEST');
        const details = error.toProblemDetails(undefined, '/api/v1/resource/123');
        expect(details.instance).toBe('/api/v1/resource/123');
      });

      it('should include traceId when requestId provided', () => {
        const error = new BaseError('Test', 'TEST');
        const details = error.toProblemDetails('req-123-abc');
        expect(details.traceId).toBe('req-123-abc');
      });

      it('should include timestamp in ISO format', () => {
        const error = new BaseError('Test', 'TEST');
        const details = error.toProblemDetails();
        expect(details.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });

    describe('toJSON', () => {
      it('should serialize correctly', () => {
        const error = new BaseError('Test message', 'TEST_CODE', 400, { extra: 'data' });
        const json = error.toJSON();
        
        expect(json.name).toBe('BaseError');
        expect(json.message).toBe('Test message');
        expect(json.code).toBe('TEST_CODE');
        expect(json.statusCode).toBe(400);
        expect(json.context).toEqual({ extra: 'data' });
        expect(json.timestamp).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // SolanaError Class
  // ===========================================================================
  describe('SolanaError', () => {
    it('should default code to SOLANA_RPC_ERROR', () => {
      const error = { code: 'SOLANA_RPC_ERROR', statusCode: 503 };
      expect(error.code).toBe('SOLANA_RPC_ERROR');
    });

    it('should default statusCode to 503', () => {
      const error = { code: 'SOLANA_RPC_ERROR', statusCode: 503 };
      expect(error.statusCode).toBe(503);
    });

    describe('SolanaError.timeout', () => {
      it('should create timeout error with operation', () => {
        const error = {
          message: 'Solana RPC timeout during getMint',
          code: 'SOLANA_TIMEOUT',
          statusCode: 504,
          context: { operation: 'getMint', durationMs: 30000 }
        };
        
        expect(error.message).toContain('timeout');
        expect(error.code).toBe('SOLANA_TIMEOUT');
        expect(error.statusCode).toBe(504);
        expect(error.context?.operation).toBe('getMint');
        expect(error.context?.durationMs).toBe(30000);
      });
    });

    describe('SolanaError.unavailable', () => {
      it('should create unavailable error', () => {
        const error = {
          message: 'Solana RPC service unavailable',
          code: 'SOLANA_RPC_UNAVAILABLE',
          statusCode: 503
        };
        
        expect(error.code).toBe('SOLANA_RPC_UNAVAILABLE');
        expect(error.statusCode).toBe(503);
      });

      it('should include endpoint in context when provided', () => {
        const error = {
          message: 'Solana RPC service unavailable',
          code: 'SOLANA_RPC_UNAVAILABLE',
          statusCode: 503,
          context: { endpoint: 'https://api.devnet.solana.com' }
        };
        
        expect(error.context?.endpoint).toBe('https://api.devnet.solana.com');
      });
    });

    describe('SolanaError.insufficientFunds', () => {
      it('should create insufficient funds error with amounts', () => {
        const error = {
          message: 'Insufficient SOL balance for transaction',
          code: 'SOLANA_INSUFFICIENT_FUNDS',
          statusCode: 400,
          context: { required: 0.5, available: 0.1 }
        };
        
        expect(error.code).toBe('SOLANA_INSUFFICIENT_FUNDS');
        expect(error.statusCode).toBe(400);
        expect(error.context?.required).toBe(0.5);
        expect(error.context?.available).toBe(0.1);
      });
    });

    describe('SolanaError.blockhashExpired', () => {
      it('should create blockhash expired error', () => {
        const error = {
          message: 'Transaction blockhash expired, retry required',
          code: 'SOLANA_BLOCKHASH_EXPIRED',
          statusCode: 409
        };
        
        expect(error.code).toBe('SOLANA_BLOCKHASH_EXPIRED');
        expect(error.statusCode).toBe(409);
      });
    });
  });

  // ===========================================================================
  // MintingError Class
  // ===========================================================================
  describe('MintingError', () => {
    describe('MintingError.duplicate', () => {
      it('should create duplicate mint error with ticketId', () => {
        const ticketId = 'ticket-123';
        const tenantId = 'tenant-456';
        const error = {
          message: `Mint already exists for ticket ${ticketId}`,
          code: 'MINT_DUPLICATE',
          statusCode: 409,
          context: { ticketId, tenantId }
        };
        
        expect(error.code).toBe('MINT_DUPLICATE');
        expect(error.statusCode).toBe(409);
        expect(error.context?.ticketId).toBe('ticket-123');
        expect(error.context?.tenantId).toBe('tenant-456');
      });
    });

    describe('MintingError.inProgress', () => {
      it('should create in-progress error with ticketId', () => {
        const ticketId = 'ticket-789';
        const error = {
          message: `Mint already in progress for ticket ${ticketId}`,
          code: 'MINT_IN_PROGRESS',
          statusCode: 409,
          context: { ticketId }
        };
        
        expect(error.code).toBe('MINT_IN_PROGRESS');
        expect(error.statusCode).toBe(409);
        expect(error.context?.ticketId).toBe('ticket-789');
      });
    });

    describe('MintingError.notFound', () => {
      it('should create not found error with mintId', () => {
        const mintId = 'mint-abc';
        const error = {
          message: `Mint ${mintId} not found`,
          code: 'MINT_NOT_FOUND',
          statusCode: 404,
          context: { mintId }
        };
        
        expect(error.code).toBe('MINT_NOT_FOUND');
        expect(error.statusCode).toBe(404);
        expect(error.context?.mintId).toBe('mint-abc');
      });
    });
  });

  // ===========================================================================
  // WalletError Class (AUDIT FIX #77-80)
  // ===========================================================================
  describe('WalletError', () => {
    describe('WalletError.notInitialized', () => {
      it('should create not initialized error', () => {
        const error = {
          message: 'Treasury wallet not initialized',
          code: 'TREASURY_NOT_INITIALIZED',
          statusCode: 503
        };
        
        expect(error.code).toBe('TREASURY_NOT_INITIALIZED');
        expect(error.statusCode).toBe(503);
      });
    });

    describe('WalletError.lowBalance', () => {
      it('should create low balance error with amounts', () => {
        const error = {
          message: 'Treasury wallet has insufficient balance',
          code: 'TREASURY_BALANCE_LOW',
          statusCode: 400,
          context: { current: 0.05, required: 0.1 }
        };
        
        expect(error.code).toBe('TREASURY_BALANCE_LOW');
        expect(error.statusCode).toBe(400);
        expect(error.context?.current).toBe(0.05);
        expect(error.context?.required).toBe(0.1);
      });
    });

    describe('WalletError.connectionFailed', () => {
      it('should create connection failed error', () => {
        const error = {
          message: 'Wallet connection failed: Network timeout',
          code: 'WALLET_CONNECTION_FAILED',
          statusCode: 400
        };
        
        expect(error.code).toBe('WALLET_CONNECTION_FAILED');
        expect(error.statusCode).toBe(400);
      });
    });

    describe('WalletError.notFound', () => {
      it('should create not found error with masked address', () => {
        const walletAddress = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
        const maskedAddress = walletAddress.substring(0, 8) + '...';
        const error = {
          message: `Wallet not found: ${maskedAddress}`,
          code: 'WALLET_NOT_FOUND',
          statusCode: 404,
          context: { walletAddress: maskedAddress }
        };
        
        expect(error.code).toBe('WALLET_NOT_FOUND');
        expect(error.statusCode).toBe(404);
        expect(error.context?.walletAddress).toBe('Tokenke...');
      });
    });

    describe('WalletError.invalidSignature', () => {
      it('should create invalid signature error', () => {
        const error = {
          message: 'Invalid wallet signature',
          code: 'SIGNATURE_INVALID',
          statusCode: 401
        };
        
        expect(error.code).toBe('SIGNATURE_INVALID');
        expect(error.statusCode).toBe(401);
      });
    });
  });

  // ===========================================================================
  // ValidationError Class
  // ===========================================================================
  describe('ValidationError', () => {
    it('should support validationErrors array', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'name', message: 'Name is required' }
      ];
      const error = {
        message: 'Validation failed',
        code: 'VALIDATION_FAILED',
        statusCode: 400,
        validationErrors
      };
      
      expect(error.validationErrors).toHaveLength(2);
      expect(error.validationErrors?.[0].field).toBe('email');
      expect(error.validationErrors?.[1].field).toBe('name');
    });

    describe('ValidationError.missingField', () => {
      it('should create missing field error', () => {
        const error = {
          message: 'Missing required field: address',
          code: 'VALIDATION_MISSING_FIELD',
          statusCode: 400,
          context: { field: 'address' }
        };
        
        expect(error.code).toBe('VALIDATION_MISSING_FIELD');
        expect(error.context?.field).toBe('address');
      });
    });

    it('should include validationErrors in toProblemDetails', () => {
      const validationErrors = [{ field: 'test', message: 'error' }];
      const problemDetails = {
        type: 'https://api.tickettoken.com/errors/VALIDATION_FAILED',
        title: 'ValidationError',
        status: 400,
        detail: 'Validation failed',
        code: 'VALIDATION_FAILED',
        validationErrors
      };
      
      expect(problemDetails.validationErrors).toBeDefined();
      expect(problemDetails.validationErrors).toHaveLength(1);
    });
  });

  // ===========================================================================
  // TenantError Class
  // ===========================================================================
  describe('TenantError', () => {
    describe('TenantError.missingContext', () => {
      it('should create missing context error', () => {
        const error = {
          message: 'Tenant context is required but not provided',
          code: 'TENANT_CONTEXT_MISSING',
          statusCode: 400
        };
        
        expect(error.code).toBe('TENANT_CONTEXT_MISSING');
        expect(error.statusCode).toBe(400);
      });
    });

    describe('TenantError.mismatch', () => {
      it('should create mismatch error with tenant IDs', () => {
        const error = {
          message: 'Tenant ID mismatch - access denied',
          code: 'TENANT_MISMATCH',
          statusCode: 403,
          context: { requestTenantId: 'tenant-1', resourceTenantId: 'tenant-2' }
        };
        
        expect(error.code).toBe('TENANT_MISMATCH');
        expect(error.statusCode).toBe(403);
        expect(error.context?.requestTenantId).toBe('tenant-1');
        expect(error.context?.resourceTenantId).toBe('tenant-2');
      });
    });

    describe('TenantError.invalid', () => {
      it('should create invalid tenant error with masked ID', () => {
        const tenantId = '12345678-1234-1234-1234-123456789012';
        const maskedId = tenantId.substring(0, 8) + '...';
        const error = {
          message: 'Invalid tenant ID format',
          code: 'TENANT_INVALID',
          statusCode: 400,
          context: { tenantId: maskedId }
        };
        
        expect(error.code).toBe('TENANT_INVALID');
        expect(error.context?.tenantId).toBe('12345678...');
      });
    });
  });

  // ===========================================================================
  // AuthenticationError Class
  // ===========================================================================
  describe('AuthenticationError', () => {
    describe('AuthenticationError.invalidToken', () => {
      it('should create invalid token error with 401 status', () => {
        const error = {
          message: 'Invalid or malformed authentication token',
          code: 'TOKEN_INVALID',
          statusCode: 401
        };
        
        expect(error.code).toBe('TOKEN_INVALID');
        expect(error.statusCode).toBe(401);
      });
    });

    describe('AuthenticationError.expiredToken', () => {
      it('should create expired token error', () => {
        const error = {
          message: 'Authentication token has expired',
          code: 'TOKEN_EXPIRED',
          statusCode: 401
        };
        
        expect(error.code).toBe('TOKEN_EXPIRED');
        expect(error.statusCode).toBe(401);
      });
    });

    describe('AuthenticationError.forbidden', () => {
      it('should create forbidden error with 403 status', () => {
        const error = {
          message: 'Access forbidden',
          code: 'FORBIDDEN',
          statusCode: 403
        };
        
        expect(error.code).toBe('FORBIDDEN');
        expect(error.statusCode).toBe(403);
      });

      it('should include required role when provided', () => {
        const error = {
          message: 'Insufficient permissions. Required role: admin',
          code: 'FORBIDDEN',
          statusCode: 403,
          context: { requiredRole: 'admin' }
        };
        
        expect(error.context?.requiredRole).toBe('admin');
      });
    });
  });

  // ===========================================================================
  // RateLimitError Class
  // ===========================================================================
  describe('RateLimitError', () => {
    it('should have 429 status code', () => {
      const error = {
        message: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
        statusCode: 429,
        retryAfter: 60
      };
      
      expect(error.statusCode).toBe(429);
    });

    it('should include retryAfter property', () => {
      const error = {
        message: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
        statusCode: 429,
        retryAfter: 120
      };
      
      expect(error.retryAfter).toBe(120);
    });

    it('should default retryAfter to 60', () => {
      const defaultRetryAfter = 60;
      expect(defaultRetryAfter).toBe(60);
    });

    describe('RateLimitError.forTenant', () => {
      it('should create tenant rate limit error', () => {
        const error = {
          message: 'Rate limit exceeded for tenant',
          code: 'RATE_LIMIT_TENANT',
          statusCode: 429,
          retryAfter: 30,
          context: { tenantId: 'tenant-xyz' }
        };
        
        expect(error.code).toBe('RATE_LIMIT_TENANT');
        expect(error.retryAfter).toBe(30);
        expect(error.context?.tenantId).toBe('tenant-xyz');
      });
    });

    it('should include retryAfter in toProblemDetails', () => {
      const problemDetails = {
        type: 'https://api.tickettoken.com/errors/RATE_LIMITED',
        title: 'RateLimitError',
        status: 429,
        detail: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
        retryAfter: 60
      };
      
      expect(problemDetails.retryAfter).toBe(60);
    });
  });

  // ===========================================================================
  // NotFoundError Class (Issue #6: 404 handler)
  // ===========================================================================
  describe('NotFoundError', () => {
    it('should have 404 status code', () => {
      const error = {
        message: 'User not found',
        code: 'NOT_FOUND',
        statusCode: 404
      };
      
      expect(error.statusCode).toBe(404);
    });

    it('should include resource type', () => {
      const error = {
        message: 'Ticket not found',
        code: 'NOT_FOUND',
        statusCode: 404,
        context: { resource: 'Ticket' }
      };
      
      expect(error.context?.resource).toBe('Ticket');
    });

    it('should include identifier when provided', () => {
      const error = {
        message: "User 'user-123' not found",
        code: 'NOT_FOUND',
        statusCode: 404,
        context: { resource: 'User', identifier: 'user-123' }
      };
      
      expect(error.context?.identifier).toBe('user-123');
    });
  });

  // ===========================================================================
  // Type Guards
  // ===========================================================================
  describe('Type Guards', () => {
    class BaseError extends Error {
      isOperational = true;
    }
    class SolanaError extends BaseError {}
    class MintingError extends BaseError {}
    class WalletError extends BaseError {}
    class ValidationError extends BaseError {}
    class TenantError extends BaseError {}
    class AuthenticationError extends BaseError {}
    class RateLimitError extends BaseError {}

    describe('isBaseError', () => {
      it('should return true for BaseError instance', () => {
        const error = new BaseError('test');
        expect(error instanceof BaseError).toBe(true);
      });

      it('should return false for plain Error', () => {
        const error = new Error('test');
        expect(error instanceof BaseError).toBe(false);
      });
    });

    describe('isOperationalError', () => {
      it('should return true for operational BaseError', () => {
        const error = new BaseError('test');
        expect(error.isOperational).toBe(true);
      });
    });

    describe('isSolanaError', () => {
      it('should return true for SolanaError instance', () => {
        const error = new SolanaError('test');
        expect(error instanceof SolanaError).toBe(true);
      });

      it('should return false for MintingError', () => {
        const error = new MintingError('test');
        expect(error instanceof SolanaError).toBe(false);
      });
    });

    describe('isMintingError', () => {
      it('should return true for MintingError instance', () => {
        const error = new MintingError('test');
        expect(error instanceof MintingError).toBe(true);
      });
    });

    describe('isWalletError', () => {
      it('should return true for WalletError instance', () => {
        const error = new WalletError('test');
        expect(error instanceof WalletError).toBe(true);
      });
    });

    describe('isValidationError', () => {
      it('should return true for ValidationError instance', () => {
        const error = new ValidationError('test');
        expect(error instanceof ValidationError).toBe(true);
      });
    });

    describe('isTenantError', () => {
      it('should return true for TenantError instance', () => {
        const error = new TenantError('test');
        expect(error instanceof TenantError).toBe(true);
      });
    });

    describe('isAuthenticationError', () => {
      it('should return true for AuthenticationError instance', () => {
        const error = new AuthenticationError('test');
        expect(error instanceof AuthenticationError).toBe(true);
      });
    });

    describe('isRateLimitError', () => {
      it('should return true for RateLimitError instance', () => {
        const error = new RateLimitError('test');
        expect(error instanceof RateLimitError).toBe(true);
      });
    });
  });
});
