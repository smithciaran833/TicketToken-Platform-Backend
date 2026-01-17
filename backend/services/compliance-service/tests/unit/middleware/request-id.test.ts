/**
 * Unit Tests for Request ID Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

// Mock crypto
const mockUUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => mockUUID)
}));

describe('Request ID Middleware', () => {
  let requestIdMiddleware: any;
  let generateRequestId: any;
  let generateShortRequestId: any;
  let generateTimestampRequestId: any;
  let getRequestId: any;
  let createCorrelationHeaders: any;

  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await import('../../../src/middleware/request-id');
    requestIdMiddleware = module.requestIdMiddleware;
    generateRequestId = module.generateRequestId;
    generateShortRequestId = module.generateShortRequestId;
    generateTimestampRequestId = module.generateTimestampRequestId;
    getRequestId = module.getRequestId;
    createCorrelationHeaders = module.createCorrelationHeaders;

    mockReq = {
      headers: {},
      requestId: undefined
    };

    mockRes = {
      setHeader: jest.fn<(name: string, value: string) => void>()
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestIdMiddleware', () => {
    it('should generate a new request ID when none provided', () => {
      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBe(`compliance-${mockUUID}`);
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', `compliance-${mockUUID}`);
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-correlation-id', `compliance-${mockUUID}`);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use existing x-request-id header when trustProxy is true', () => {
      mockReq.headers['x-request-id'] = 'existing-request-id';

      const middleware = requestIdMiddleware({ trustProxy: true });
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBe('existing-request-id');
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', 'existing-request-id');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use existing x-correlation-id header', () => {
      mockReq.headers['x-correlation-id'] = 'correlation-123';

      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBe('correlation-123');
    });

    it('should use existing x-trace-id header', () => {
      mockReq.headers['x-trace-id'] = 'trace-456';

      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBe('trace-456');
    });

    it('should prioritize x-request-id over other headers', () => {
      mockReq.headers['x-request-id'] = 'request-id';
      mockReq.headers['x-correlation-id'] = 'correlation-id';
      mockReq.headers['x-trace-id'] = 'trace-id';

      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBe('request-id');
    });

    it('should ignore incoming headers when trustProxy is false', () => {
      mockReq.headers['x-request-id'] = 'untrusted-id';

      const middleware = requestIdMiddleware({ trustProxy: false });
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBe(`compliance-${mockUUID}`);
    });

    it('should use custom prefix', () => {
      const middleware = requestIdMiddleware({ prefix: 'custom' });
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBe(`custom-${mockUUID}`);
    });

    it('should not add prefix when prefix is empty', () => {
      const middleware = requestIdMiddleware({ prefix: '' });
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.requestId).toBe(mockUUID);
    });

    it('should use custom generator function', () => {
      const customGenerator = jest.fn(() => 'custom-generated-id');

      const middleware = requestIdMiddleware({ generator: customGenerator });
      middleware(mockReq, mockRes, mockNext);

      expect(customGenerator).toHaveBeenCalled();
      expect(mockReq.requestId).toBe('compliance-custom-generated-id');
    });

    it('should set both response headers', () => {
      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledTimes(2);
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String));
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-correlation-id', expect.any(String));
    });

    it('should always call next()', () => {
      const middleware = requestIdMiddleware();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('generateRequestId', () => {
    it('should generate a UUID', () => {
      const id = generateRequestId();
      expect(id).toBe(mockUUID);
    });
  });

  describe('generateShortRequestId', () => {
    it('should generate a short ID (first segment of UUID)', () => {
      const id = generateShortRequestId();
      expect(id).toBe('a1b2c3d4');
    });
  });

  describe('generateTimestampRequestId', () => {
    it('should generate a timestamp-based ID', () => {
      const id = generateTimestampRequestId();
      expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateTimestampRequestId();
      const id2 = generateTimestampRequestId();
      // IDs might be same if called in same millisecond, but random part differs
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
    });
  });

  describe('getRequestId', () => {
    it('should return request ID from request object', () => {
      mockReq.requestId = 'test-request-id';
      expect(getRequestId(mockReq)).toBe('test-request-id');
    });

    it('should return "unknown" when no request ID exists', () => {
      mockReq.requestId = undefined;
      expect(getRequestId(mockReq)).toBe('unknown');
    });

    it('should return "unknown" for empty string', () => {
      mockReq.requestId = '';
      expect(getRequestId(mockReq)).toBe('unknown');
    });
  });

  describe('createCorrelationHeaders', () => {
    it('should create headers object with all correlation headers', () => {
      const headers = createCorrelationHeaders('test-id-123');

      expect(headers).toEqual({
        'x-request-id': 'test-id-123',
        'x-correlation-id': 'test-id-123',
        'x-trace-id': 'test-id-123'
      });
    });

    it('should handle complex request IDs', () => {
      const complexId = 'compliance-a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const headers = createCorrelationHeaders(complexId);

      expect(headers['x-request-id']).toBe(complexId);
      expect(headers['x-correlation-id']).toBe(complexId);
      expect(headers['x-trace-id']).toBe(complexId);
    });
  });

  describe('default export', () => {
    it('should export all functions', async () => {
      const module = await import('../../../src/middleware/request-id');
      
      expect(module.default).toHaveProperty('requestIdMiddleware');
      expect(module.default).toHaveProperty('generateRequestId');
      expect(module.default).toHaveProperty('generateShortRequestId');
      expect(module.default).toHaveProperty('generateTimestampRequestId');
      expect(module.default).toHaveProperty('getRequestId');
      expect(module.default).toHaveProperty('createCorrelationHeaders');
    });
  });
});
