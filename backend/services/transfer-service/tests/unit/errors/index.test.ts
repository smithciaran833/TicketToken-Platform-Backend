/**
 * Real Unit Tests for Error Classes
 * Tests all error types, RFC 7807 format, and error utilities
 */

import { describe, it, expect } from '@jest/globals';
import {
  BaseError,
  ValidationError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  TransferNotFoundError,
  TicketNotFoundError,
  ConflictError,
  TransferAlreadyExistsError,
  TransferAlreadyAcceptedError,
  RateLimitError,
  BlockchainError,
  BlockchainErrorCategory,
  BlockchainErrors,
  DatabaseError,
  DatabaseConnectionError,
  InternalError,
  ServiceUnavailableError,
  TransferError,
  InvalidAcceptanceCodeError,
  TransferExpiredError,
  TransferCancelledError,
  TicketNotTransferableError,
  isOperationalError,
  isErrorType,
  toBaseError,
  categorizeBlockchainError
} from '../../../src/errors';

describe('Error Classes', () => {
  describe('ValidationError', () => {
    it('should create validation error with correct properties', () => {
      const error = new ValidationError({
        message: 'Invalid input',
        validationErrors: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'age', message: 'Must be 18 or older' }
        ],
        requestId: 'req-123',
        tenantId: 'tenant-456'
      });

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.validationErrors).toHaveLength(2);
      expect(error.requestId).toBe('req-123');
      expect(error.tenantId).toBe('tenant-456');
      expect(error.isOperational).toBe(true);
    });

    it('should include validation errors in RFC 7807 format', () => {
      const error = new ValidationError({
        message: 'Invalid input',
        validationErrors: [{ field: 'email', message: 'Required' }]
      });

      const rfc7807 = error.toRFC7807();

      expect(rfc7807).toMatchObject({
        type: expect.stringContaining('validation_error'),
        status: 400,
        title: 'Validation Error',
        detail: 'Invalid input',
        code: 'VALIDATION_ERROR',
        validationErrors: [{ field: 'email', message: 'Required' }]
      });
      expect(rfc7807.timestamp).toBeDefined();
    });
  });

  describe('BadRequestError', () => {
    it('should create bad request error', () => {
      const error = new BadRequestError('Invalid request format', 'req-789');

      expect(error.code).toBe('BAD_REQUEST');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid request format');
      expect(error.requestId).toBe('req-789');
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with default message', () => {
      const error = new UnauthorizedError();

      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Authentication required');
    });

    it('should create unauthorized error with custom message', () => {
      const error = new UnauthorizedError('Invalid token', 'req-abc');

      expect(error.message).toBe('Invalid token');
      expect(error.requestId).toBe('req-abc');
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error', () => {
      const error = new ForbiddenError('Insufficient permissions', 'req-1', 'tenant-1');

      expect(error.code).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Insufficient permissions');
      expect(error.requestId).toBe('req-1');
      expect(error.tenantId).toBe('tenant-1');
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with resource ID', () => {
      const error = new NotFoundError('Transfer', 'transfer-123', 'req-1');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Transfer with ID transfer-123 not found');
      expect(error.resource).toBe('Transfer');
      expect(error.resourceId).toBe('transfer-123');
    });

    it('should create not found error without resource ID', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
      expect(error.resource).toBe('User');
      expect(error.resourceId).toBeUndefined();
    });

    it('should include resource details in RFC 7807', () => {
      const error = new NotFoundError('Ticket', 'ticket-456');
      const rfc7807 = error.toRFC7807();

      expect(rfc7807.resource).toBe('Ticket');
      expect(rfc7807.resourceId).toBe('ticket-456');
    });
  });

  describe('TransferNotFoundError', () => {
    it('should create transfer not found error', () => {
      const error = new TransferNotFoundError('transfer-789');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.resource).toBe('Transfer');
      expect(error.resourceId).toBe('transfer-789');
      expect(error.message).toContain('transfer-789');
    });
  });

  describe('TicketNotFoundError', () => {
    it('should create ticket not found error', () => {
      const error = new TicketNotFoundError('ticket-101');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.resource).toBe('Ticket');
      expect(error.resourceId).toBe('ticket-101');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists', 'req-1');

      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Resource already exists');
    });
  });

  describe('TransferAlreadyExistsError', () => {
    it('should create transfer already exists error', () => {
      const error = new TransferAlreadyExistsError('ticket-202');

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toContain('ticket-202');
    });
  });

  describe('TransferAlreadyAcceptedError', () => {
    it('should create transfer already accepted error', () => {
      const error = new TransferAlreadyAcceptedError('transfer-303');

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toContain('transfer-303');
      expect(error.message).toContain('already been accepted');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry after', () => {
      const error = new RateLimitError(60, 'req-1');

      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
    });

    it('should include retryAfter in RFC 7807', () => {
      const error = new RateLimitError(120);
      const rfc7807 = error.toRFC7807();

      expect(rfc7807.retryAfter).toBe(120);
    });
  });

  describe('BlockchainError', () => {
    it('should create blockchain network error', () => {
      const error = new BlockchainError({
        message: 'RPC connection failed',
        category: BlockchainErrorCategory.NETWORK,
        retryable: true,
        requestId: 'req-1'
      });

      expect(error.code).toBe('BLOCKCHAIN_NETWORK');
      expect(error.statusCode).toBe(502);
      expect(error.category).toBe(BlockchainErrorCategory.NETWORK);
      expect(error.retryable).toBe(true);
    });

    it('should create blockchain transaction error', () => {
      const error = new BlockchainError({
        message: 'Transaction failed',
        category: BlockchainErrorCategory.TRANSACTION,
        signature: 'sig123',
        transactionId: 'tx456'
      });

      expect(error.category).toBe(BlockchainErrorCategory.TRANSACTION);
      expect(error.signature).toBe('sig123');
      expect(error.transactionId).toBe('tx456');
      expect(error.retryable).toBe(false);
    });

    it('should mark rate limit errors with 429 status', () => {
      const error = new BlockchainError({
        message: 'Rate limited',
        category: BlockchainErrorCategory.RATE_LIMIT
      });

      expect(error.statusCode).toBe(429);
      expect(error.retryable).toBe(true);
    });

    it('should auto-determine retryable based on category', () => {
      const networkError = new BlockchainError({
        message: 'Network error',
        category: BlockchainErrorCategory.NETWORK
      });
      expect(networkError.retryable).toBe(true);

      const timeoutError = new BlockchainError({
        message: 'Timeout',
        category: BlockchainErrorCategory.TIMEOUT
      });
      expect(timeoutError.retryable).toBe(true);

      const signatureError = new BlockchainError({
        message: 'Invalid signature',
        category: BlockchainErrorCategory.SIGNATURE
      });
      expect(signatureError.retryable).toBe(false);
    });

    it('should include blockchain details in RFC 7807', () => {
      const error = new BlockchainError({
        message: 'Transaction timeout',
        category: BlockchainErrorCategory.TIMEOUT,
        signature: 'sig789'
      });

      const rfc7807 = error.toRFC7807();

      expect(rfc7807.category).toBe(BlockchainErrorCategory.TIMEOUT);
      expect(rfc7807.signature).toBe('sig789');
      expect(rfc7807.retryable).toBe(true);
    });
  });

  describe('BlockchainErrors factory', () => {
    it('should create network error', () => {
      const cause = new Error('Connection refused');
      const error = BlockchainErrors.networkError('RPC unavailable', cause, 'req-1');

      expect(error.category).toBe(BlockchainErrorCategory.NETWORK);
      expect(error.retryable).toBe(true);
      expect(error.originalError).toBe(cause);
    });

    it('should create transaction error', () => {
      const error = BlockchainErrors.transactionError('TX failed', 'sig123');

      expect(error.category).toBe(BlockchainErrorCategory.TRANSACTION);
      expect(error.signature).toBe('sig123');
      expect(error.retryable).toBe(false);
    });

    it('should create signature error', () => {
      const error = BlockchainErrors.signatureError('Invalid signature');

      expect(error.category).toBe(BlockchainErrorCategory.SIGNATURE);
      expect(error.retryable).toBe(false);
    });

    it('should create balance error', () => {
      const error = BlockchainErrors.balanceError('Insufficient funds');

      expect(error.category).toBe(BlockchainErrorCategory.BALANCE);
      expect(error.retryable).toBe(false);
    });

    it('should create timeout error', () => {
      const error = BlockchainErrors.timeoutError('sig456', 'req-1');

      expect(error.category).toBe(BlockchainErrorCategory.TIMEOUT);
      expect(error.signature).toBe('sig456');
      expect(error.retryable).toBe(true);
    });

    it('should create confirmation error', () => {
      const error = BlockchainErrors.confirmationError('sig789');

      expect(error.category).toBe(BlockchainErrorCategory.CONFIRMATION);
      expect(error.message).toContain('sig789');
      expect(error.retryable).toBe(true);
    });

    it('should create simulation error', () => {
      const error = BlockchainErrors.simulationError('Simulation failed');

      expect(error.category).toBe(BlockchainErrorCategory.SIMULATION);
      expect(error.retryable).toBe(false);
    });

    it('should create rate limit error', () => {
      const error = BlockchainErrors.rateLimitError('req-1');

      expect(error.category).toBe(BlockchainErrorCategory.RATE_LIMIT);
      expect(error.statusCode).toBe(429);
      expect(error.retryable).toBe(true);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error with query', () => {
      const error = new DatabaseError({
        message: 'Query failed',
        query: 'SELECT * FROM users',
        requestId: 'req-1'
      });

      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.query).toBe('SELECT * FROM users');
      expect(error.isOperational).toBe(true);
    });

    it('should create database error with constraint', () => {
      const error = new DatabaseError({
        message: 'Constraint violation',
        constraint: 'unique_email',
        tenantId: 'tenant-1'
      });

      expect(error.constraint).toBe('unique_email');
      expect(error.tenantId).toBe('tenant-1');
    });
  });

  describe('DatabaseConnectionError', () => {
    it('should create database connection error', () => {
      const error = new DatabaseConnectionError('Pool exhausted', 'req-1');

      expect(error.code).toBe('DATABASE_CONNECTION_ERROR');
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Pool exhausted');
      expect(error.isOperational).toBe(true);
    });

    it('should use default message', () => {
      const error = new DatabaseConnectionError();

      expect(error.message).toBe('Database connection failed');
    });
  });

  describe('InternalError', () => {
    it('should create internal error', () => {
      const error = new InternalError('Unexpected error', 'req-1');

      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });

    it('should use default message', () => {
      const error = new InternalError();

      expect(error.message).toBe('An unexpected error occurred');
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error', () => {
      const error = new ServiceUnavailableError('Redis', 'req-1');

      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.statusCode).toBe(503);
      expect(error.message).toContain('Redis');
      expect(error.message).toContain('unavailable');
    });
  });

  describe('TransferError', () => {
    it('should create transfer error with transfer ID', () => {
      const error = new TransferError({
        code: 'CUSTOM_TRANSFER_ERROR',
        message: 'Transfer failed',
        statusCode: 400,
        transferId: 'transfer-555',
        ticketId: 'ticket-666',
        requestId: 'req-1',
        tenantId: 'tenant-1'
      });

      expect(error.code).toBe('CUSTOM_TRANSFER_ERROR');
      expect(error.transferId).toBe('transfer-555');
      expect(error.ticketId).toBe('ticket-666');
    });

    it('should include transfer details in RFC 7807', () => {
      const error = new TransferError({
        code: 'TEST_ERROR',
        message: 'Test',
        transferId: 'transfer-777'
      });

      const rfc7807 = error.toRFC7807();

      expect(rfc7807.transferId).toBe('transfer-777');
    });
  });

  describe('InvalidAcceptanceCodeError', () => {
    it('should create invalid acceptance code error', () => {
      const error = new InvalidAcceptanceCodeError('transfer-888');

      expect(error).toBeInstanceOf(TransferError);
      expect(error.code).toBe('INVALID_ACCEPTANCE_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.transferId).toBe('transfer-888');
    });
  });

  describe('TransferExpiredError', () => {
    it('should create transfer expired error', () => {
      const error = new TransferExpiredError('transfer-999');

      expect(error).toBeInstanceOf(TransferError);
      expect(error.code).toBe('TRANSFER_EXPIRED');
      expect(error.statusCode).toBe(410);
    });
  });

  describe('TransferCancelledError', () => {
    it('should create transfer cancelled error', () => {
      const error = new TransferCancelledError('transfer-111');

      expect(error).toBeInstanceOf(TransferError);
      expect(error.code).toBe('TRANSFER_CANCELLED');
      expect(error.statusCode).toBe(410);
    });
  });

  describe('TicketNotTransferableError', () => {
    it('should create ticket not transferable error with reason', () => {
      const error = new TicketNotTransferableError(
        'ticket-222',
        'event has already occurred'
      );

      expect(error).toBeInstanceOf(TransferError);
      expect(error.code).toBe('TICKET_NOT_TRANSFERABLE');
      expect(error.message).toContain('event has already occurred');
      expect(error.ticketId).toBe('ticket-222');
    });
  });

  describe('isOperationalError', () => {
    it('should return true for operational errors', () => {
      const error = new ValidationError({ message: 'Test' });
      expect(isOperationalError(error)).toBe(true);
    });

    it('should return false for non-operational errors', () => {
      const error = new InternalError();
      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for non-BaseError types', () => {
      const error = new Error('Regular error');
      expect(isOperationalError(error)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isOperationalError(null)).toBe(false);
      expect(isOperationalError(undefined)).toBe(false);
    });
  });

  describe('isErrorType', () => {
    it('should correctly identify error type', () => {
      const error = new ValidationError({ message: 'Test' });
      
      expect(isErrorType(error, ValidationError)).toBe(true);
      expect(isErrorType(error, BaseError)).toBe(true);
      expect(isErrorType(error, NotFoundError)).toBe(false);
    });

    it('should return false for non-matching types', () => {
      const error = new Error('Regular error');
      expect(isErrorType(error, ValidationError)).toBe(false);
    });
  });

  describe('toBaseError', () => {
    it('should return BaseError as-is', () => {
      const error = new ValidationError({ message: 'Test' });
      const result = toBaseError(error);

      expect(result).toBe(error);
    });

    it('should convert Error to InternalError', () => {
      const error = new Error('Something went wrong');
      const result = toBaseError(error, 'req-1');

      expect(result).toBeInstanceOf(InternalError);
      expect(result.message).toBe('Something went wrong');
      expect(result.requestId).toBe('req-1');
    });

    it('should convert string to InternalError', () => {
      const result = toBaseError('Error string');

      expect(result).toBeInstanceOf(InternalError);
      expect(result.message).toBe('Error string');
    });

    it('should handle unknown types', () => {
      const result = toBaseError({ custom: 'object' });

      expect(result).toBeInstanceOf(InternalError);
      expect(result.message).toContain('object');
    });
  });

  describe('categorizeBlockchainError', () => {
    it('should categorize timeout errors', () => {
      const error = new Error('Request timed out');
      const result = categorizeBlockchainError(error, 'req-1');

      expect(result.category).toBe(BlockchainErrorCategory.TIMEOUT);
      expect(result.retryable).toBe(true);
    });

    it('should categorize rate limit errors', () => {
      const error = new Error('Rate limit exceeded (429)');
      const result = categorizeBlockchainError(error);

      expect(result.category).toBe(BlockchainErrorCategory.RATE_LIMIT);
      expect(result.statusCode).toBe(429);
    });

    it('should categorize balance errors', () => {
      const error = new Error('Insufficient balance');
      const result = categorizeBlockchainError(error);

      expect(result.category).toBe(BlockchainErrorCategory.BALANCE);
      expect(result.retryable).toBe(false);
    });

    it('should categorize signature errors', () => {
      const error = new Error('Invalid signature provided');
      const result = categorizeBlockchainError(error);

      expect(result.category).toBe(BlockchainErrorCategory.SIGNATURE);
    });

    it('should categorize network errors', () => {
      const error = new Error('Network connection failed');
      const result = categorizeBlockchainError(error);

      expect(result.category).toBe(BlockchainErrorCategory.NETWORK);
      expect(result.retryable).toBe(true);
    });

    it('should categorize simulation errors', () => {
      const error = new Error('Transaction simulation failed');
      const result = categorizeBlockchainError(error);

      expect(result.category).toBe(BlockchainErrorCategory.SIMULATION);
    });

    it('should default to internal error for unknown types', () => {
      const error = new Error('Unknown blockchain error');
      const result = categorizeBlockchainError(error);

      expect(result.category).toBe(BlockchainErrorCategory.INTERNAL);
      expect(result.retryable).toBe(false);
    });
  });

  describe('RFC 7807 Format', () => {
    it('should format all required RFC 7807 fields', () => {
      const error = new ValidationError({
        message: 'Invalid data',
        requestId: 'req-123',
        tenantId: 'tenant-456'
      });

      const rfc7807 = error.toRFC7807('instance-789');

      expect(rfc7807).toMatchObject({
        type: expect.any(String),
        title: expect.any(String),
        status: 400,
        detail: expect.any(String),
        instance: 'instance-789',
        code: 'VALIDATION_ERROR',
        timestamp: expect.any(String),
        tenantId: 'tenant-456'
      });
    });

    it('should use requestId as instance if not provided', () => {
      const error = new ValidationError({
        message: 'Test',
        requestId: 'req-999'
      });

      const rfc7807 = error.toRFC7807();

      expect(rfc7807.instance).toBe('req-999');
    });

    it('should omit tenantId if not set', () => {
      const error = new ValidationError({ message: 'Test' });
      const rfc7807 = error.toRFC7807();

      expect(rfc7807.tenantId).toBeUndefined();
    });
  });

  describe('Error Inheritance', () => {
    it('should maintain proper prototype chain', () => {
      const error = new TransferNotFoundError('transfer-1');

      expect(error instanceof TransferNotFoundError).toBe(true);
      expect(error instanceof NotFoundError).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should work with instanceof checks', () => {
      const errors = [
        new ValidationError({ message: 'test' }),
        new NotFoundError('Resource'),
        new BlockchainError({ message: 'test', category: BlockchainErrorCategory.NETWORK })
      ];

      errors.forEach(error => {
        expect(error instanceof BaseError).toBe(true);
        expect(error instanceof Error).toBe(true);
      });
    });
  });
});
