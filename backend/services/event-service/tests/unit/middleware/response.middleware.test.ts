/**
 * Unit tests for response middleware
 * 
 * Tests:
 * - X-Request-ID header (addRequestIdHeader)
 * - Cache-Control for mutations (addNoCacheHeader)
 * - Combined response headers hook
 * - Response helper functions
 */

import { createMockRequest, createMockReply } from '../../__mocks__/fastify.mock';
import {
  addRequestIdHeader,
  addNoCacheHeader,
  responseHeadersHook,
  registerResponseMiddleware,
  createSuccessResponse,
  createListResponse,
} from '../../../src/middleware/response.middleware';

describe('Response Middleware', () => {
  describe('addRequestIdHeader', () => {
    it('should add X-Request-ID header to response', async () => {
      const request = createMockRequest({ id: 'req-12345' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(false);

      await addRequestIdHeader(request as any, reply as any, null);

      expect(reply.header).toHaveBeenCalledWith('X-Request-ID', 'req-12345');
    });

    it('should not overwrite existing X-Request-ID header', async () => {
      const request = createMockRequest({ id: 'req-12345' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(true);

      await addRequestIdHeader(request as any, reply as any, null);

      expect(reply.header).not.toHaveBeenCalledWith('X-Request-ID', expect.anything());
    });
  });

  describe('addNoCacheHeader', () => {
    it('should add Cache-Control header for POST requests', async () => {
      const request = createMockRequest({ method: 'POST' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(false);

      await addNoCacheHeader(request as any, reply as any, null);

      expect(reply.header).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate'
      );
    });

    it('should add Cache-Control header for PUT requests', async () => {
      const request = createMockRequest({ method: 'PUT' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(false);

      await addNoCacheHeader(request as any, reply as any, null);

      expect(reply.header).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate'
      );
    });

    it('should add Cache-Control header for PATCH requests', async () => {
      const request = createMockRequest({ method: 'PATCH' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(false);

      await addNoCacheHeader(request as any, reply as any, null);

      expect(reply.header).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate'
      );
    });

    it('should add Cache-Control header for DELETE requests', async () => {
      const request = createMockRequest({ method: 'DELETE' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(false);

      await addNoCacheHeader(request as any, reply as any, null);

      expect(reply.header).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate'
      );
    });

    it('should NOT add Cache-Control header for GET requests', async () => {
      const request = createMockRequest({ method: 'GET' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(false);

      await addNoCacheHeader(request as any, reply as any, null);

      expect(reply.header).not.toHaveBeenCalledWith(
        'Cache-Control',
        expect.anything()
      );
    });

    it('should NOT add Cache-Control header for OPTIONS requests', async () => {
      const request = createMockRequest({ method: 'OPTIONS' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(false);

      await addNoCacheHeader(request as any, reply as any, null);

      expect(reply.header).not.toHaveBeenCalledWith(
        'Cache-Control',
        expect.anything()
      );
    });

    it('should NOT overwrite existing Cache-Control header', async () => {
      const request = createMockRequest({ method: 'POST' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(true);

      await addNoCacheHeader(request as any, reply as any, null);

      expect(reply.header).not.toHaveBeenCalledWith(
        'Cache-Control',
        expect.anything()
      );
    });

    it('should handle lowercase method names', async () => {
      const request = createMockRequest({ method: 'post' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(false);

      await addNoCacheHeader(request as any, reply as any, null);

      expect(reply.header).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate'
      );
    });
  });

  describe('responseHeadersHook', () => {
    it('should add both X-Request-ID and Cache-Control for POST', async () => {
      const request = createMockRequest({ id: 'req-abc', method: 'POST' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(false);
      const payload = { data: 'test' };

      const result = await responseHeadersHook(request as any, reply as any, payload);

      expect(reply.header).toHaveBeenCalledWith('X-Request-ID', 'req-abc');
      expect(reply.header).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate'
      );
      expect(result).toEqual(payload);
    });

    it('should only add X-Request-ID for GET requests', async () => {
      const request = createMockRequest({ id: 'req-xyz', method: 'GET' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(false);
      const payload = { data: 'test' };

      const result = await responseHeadersHook(request as any, reply as any, payload);

      expect(reply.header).toHaveBeenCalledWith('X-Request-ID', 'req-xyz');
      expect(reply.header).not.toHaveBeenCalledWith('Cache-Control', expect.anything());
      expect(result).toEqual(payload);
    });

    it('should return payload unchanged', async () => {
      const request = createMockRequest({ id: 'req-123', method: 'GET' });
      const reply = createMockReply();
      reply.hasHeader = jest.fn().mockReturnValue(false);
      const payload = { complex: { nested: 'data' }, array: [1, 2, 3] };

      const result = await responseHeadersHook(request as any, reply as any, payload);

      expect(result).toBe(payload);
    });
  });

  describe('registerResponseMiddleware', () => {
    it('should register onSend hook on Fastify app', () => {
      const mockApp = {
        addHook: jest.fn(),
      };

      registerResponseMiddleware(mockApp as any);

      expect(mockApp.addHook).toHaveBeenCalledWith('onSend', responseHeadersHook);
    });
  });

  describe('createSuccessResponse', () => {
    it('should create standardized success response', () => {
      const request = createMockRequest({ id: 'req-success' });
      const data = { event: { id: 'evt-123', name: 'Test Event' } };

      const response = createSuccessResponse(request as any, data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.requestId).toBe('req-success');
      expect(response.serverTime).toBeDefined();
      expect(new Date(response.serverTime)).toBeInstanceOf(Date);
    });

    it('should include meta when provided', () => {
      const request = createMockRequest({ id: 'req-meta' });
      const data = { items: [] };
      const meta = { version: '1.0', source: 'api' };

      const response = createSuccessResponse(request as any, data, meta);

      expect(response.meta).toEqual(meta);
    });

    it('should not include meta field when not provided', () => {
      const request = createMockRequest({ id: 'req-nometa' });
      const data = { value: 123 };

      const response = createSuccessResponse(request as any, data);

      expect(response).not.toHaveProperty('meta');
    });
  });

  describe('createListResponse', () => {
    it('should create standardized list response', () => {
      const request = createMockRequest({ id: 'req-list' });
      const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const pagination = { total: 10, limit: 3, offset: 0 };

      const response = createListResponse(request as any, items, pagination);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(items);
      expect(response.requestId).toBe('req-list');
      expect(response.serverTime).toBeDefined();
      expect(response.pagination).toEqual({
        total: 10,
        limit: 3,
        offset: 0,
        hasMore: true,
      });
    });

    it('should calculate hasMore correctly when more items exist', () => {
      const request = createMockRequest({ id: 'req-hasmore' });
      const items = [{ id: '1' }, { id: '2' }];
      const pagination = { total: 5, limit: 2, offset: 0 };

      const response = createListResponse(request as any, items, pagination);

      expect(response.pagination.hasMore).toBe(true);
    });

    it('should calculate hasMore false when no more items', () => {
      const request = createMockRequest({ id: 'req-nomore' });
      const items = [{ id: '1' }, { id: '2' }];
      const pagination = { total: 2, limit: 10, offset: 0 };

      const response = createListResponse(request as any, items, pagination);

      expect(response.pagination.hasMore).toBe(false);
    });

    it('should calculate hasMore correctly with offset', () => {
      const request = createMockRequest({ id: 'req-offset' });
      const items = [{ id: '3' }, { id: '4' }];
      const pagination = { total: 5, limit: 2, offset: 2 };

      const response = createListResponse(request as any, items, pagination);

      // offset (2) + items.length (2) = 4, which is < total (5)
      expect(response.pagination.hasMore).toBe(true);
    });

    it('should calculate hasMore false at end with offset', () => {
      const request = createMockRequest({ id: 'req-end' });
      const items = [{ id: '5' }];
      const pagination = { total: 5, limit: 2, offset: 4 };

      const response = createListResponse(request as any, items, pagination);

      // offset (4) + items.length (1) = 5, which is not < total (5)
      expect(response.pagination.hasMore).toBe(false);
    });

    it('should handle empty list', () => {
      const request = createMockRequest({ id: 'req-empty' });
      const items: any[] = [];
      const pagination = { total: 0, limit: 10, offset: 0 };

      const response = createListResponse(request as any, items, pagination);

      expect(response.data).toEqual([]);
      expect(response.pagination.hasMore).toBe(false);
    });
  });
});
