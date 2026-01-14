// =============================================================================
// TEST SUITE - async-handler.ts
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { setupGlobalErrorHandlers, asyncHandler } from '../../../src/utils/async-handler';

describe('async-handler utils', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;
  let originalListeners: {
    uncaughtException: NodeJS.UncaughtExceptionListener[];
    unhandledRejection: NodeJS.UnhandledRejectionListener[];
  };

  beforeEach(() => {
    mockReq = {};
    mockRes = {};
    mockNext = jest.fn();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    
    // Save original listeners
    originalListeners = {
      uncaughtException: process.listeners('uncaughtException') as NodeJS.UncaughtExceptionListener[],
      unhandledRejection: process.listeners('unhandledRejection') as NodeJS.UnhandledRejectionListener[],
    };
    
    // Remove all listeners
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    
    // Remove test listeners
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    
    // Restore original listeners
    originalListeners.uncaughtException.forEach(listener => {
      process.on('uncaughtException', listener);
    });
    originalListeners.unhandledRejection.forEach(listener => {
      process.on('unhandledRejection', listener);
    });
  });

  // =============================================================================
  // setupGlobalErrorHandlers() - 10 test cases
  // =============================================================================

  describe('setupGlobalErrorHandlers()', () => {
    it('should setup uncaughtException handler', () => {
      setupGlobalErrorHandlers();

      expect(process.listenerCount('uncaughtException')).toBeGreaterThan(0);
    });

    it('should setup unhandledRejection handler', () => {
      setupGlobalErrorHandlers();

      expect(process.listenerCount('unhandledRejection')).toBeGreaterThan(0);
    });

    it('should log uncaught exceptions', () => {
      setupGlobalErrorHandlers();

      const error = new Error('Test uncaught exception');
      process.emit('uncaughtException', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('UNCAUGHT EXCEPTION:', error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(error.stack);
    });

    it('should exit process on uncaught exception', () => {
      setupGlobalErrorHandlers();

      const error = new Error('Test error');
      process.emit('uncaughtException', error);

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should log unhandled rejections', () => {
      setupGlobalErrorHandlers();

      const reason = 'Test unhandled rejection';
      const promise = Promise.resolve(); // Use resolved promise to avoid actual rejection
      process.emit('unhandledRejection', reason, promise);

      expect(consoleErrorSpy).toHaveBeenCalledWith('UNHANDLED REJECTION at:', promise);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Reason:', reason);
    });

    it('should exit process on unhandled rejection', () => {
      setupGlobalErrorHandlers();

      const promise = Promise.resolve();
      process.emit('unhandledRejection', 'Test', promise);

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle multiple uncaught exceptions', () => {
      setupGlobalErrorHandlers();

      process.emit('uncaughtException', new Error('Error 1'));
      process.emit('uncaughtException', new Error('Error 2'));

      expect(processExitSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle errors with stack traces', () => {
      setupGlobalErrorHandlers();

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at Test.js:10:5';
      process.emit('uncaughtException', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(error.stack);
    });

    it('should handle unhandled rejections with objects', () => {
      setupGlobalErrorHandlers();

      const reason = { code: 'ERR_001', message: 'Test error' };
      const promise = Promise.resolve();
      process.emit('unhandledRejection', reason, promise);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Reason:', reason);
    });

    it('should not throw when setting up handlers', () => {
      expect(() => setupGlobalErrorHandlers()).not.toThrow();
    });
  });

  // =============================================================================
  // asyncHandler() - 10 test cases
  // =============================================================================

  describe('asyncHandler()', () => {
    it('should wrap async function', () => {
      const asyncFn = jest.fn().mockResolvedValue(undefined);
      const wrapped = asyncHandler(asyncFn);

      expect(typeof wrapped).toBe('function');
    });

    it('should call wrapped function with req, res, next', async () => {
      const asyncFn = jest.fn().mockResolvedValue(undefined);
      const wrapped = asyncHandler(asyncFn);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await new Promise(resolve => setImmediate(resolve));

      expect(asyncFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });

    it('should not call next on success', async () => {
      const asyncFn = jest.fn().mockResolvedValue({ success: true });
      const wrapped = asyncHandler(asyncFn);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next with error on rejection', async () => {
      const error = new Error('Test error');
      const asyncFn = jest.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(asyncFn);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle synchronous errors', async () => {
      const error = new Error('Sync error');
      const asyncFn = jest.fn().mockImplementation(() => {
        throw error;
      });
      const wrapped = asyncHandler(asyncFn);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should preserve error properties', async () => {
      const error: any = new Error('Custom error');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      
      const asyncFn = jest.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(asyncFn);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await new Promise(resolve => setImmediate(resolve));

      const passedError = (mockNext as jest.Mock).mock.calls[0][0];
      expect(passedError.statusCode).toBe(404);
      expect(passedError.code).toBe('NOT_FOUND');
    });

    it('should handle multiple async handlers', async () => {
      const asyncFn1 = jest.fn().mockResolvedValue(undefined);
      const asyncFn2 = jest.fn().mockResolvedValue(undefined);

      const wrapped1 = asyncHandler(asyncFn1);
      const wrapped2 = asyncHandler(asyncFn2);

      wrapped1(mockReq as Request, mockRes as Response, mockNext);
      wrapped2(mockReq as Request, mockRes as Response, mockNext);
      await new Promise(resolve => setImmediate(resolve));

      expect(asyncFn1).toHaveBeenCalled();
      expect(asyncFn2).toHaveBeenCalled();
    });

    it('should work with async/await syntax', async () => {
      const asyncFn = async (req: Request, res: Response, next: NextFunction) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { data: 'test' };
      };

      const wrapped = asyncHandler(asyncFn);
      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle Promise.reject', async () => {
      const error = new Error('Rejected');
      const asyncFn = () => Promise.reject(error);
      const wrapped = asyncHandler(asyncFn);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should pass return value through', async () => {
      const returnValue = { data: 'test', status: 200 };
      const asyncFn = jest.fn().mockResolvedValue(returnValue);
      const wrapped = asyncHandler(asyncFn);

      wrapped(mockReq as Request, mockRes as Response, mockNext);
      await new Promise(resolve => setImmediate(resolve));

      expect(asyncFn).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
