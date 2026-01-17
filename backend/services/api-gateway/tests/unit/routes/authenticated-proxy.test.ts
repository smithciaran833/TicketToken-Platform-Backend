import { FastifyInstance } from 'fastify';
import { createAuthenticatedProxy } from '../../../src/routes/authenticated-proxy';

// Mock axios as a callable function
jest.mock('axios', () => jest.fn());
import axios from 'axios';
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

jest.mock('../../../src/utils/internal-auth', () => ({
  generateInternalAuthHeaders: jest.fn(() => ({
    'x-internal-auth': 'internal-token',
    'x-internal-signature': 'signature-value',
  })),
}));

import { generateInternalAuthHeaders } from '../../../src/utils/internal-auth';

describe('authenticated-proxy', () => {
  let mockServer: any;
  let allHandler: jest.Mock;
  let routes: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    routes = new Map();

    allHandler = jest.fn((path: string, ...args: any[]) => {
      const handler = args[args.length - 1];
      const options = args.length > 1 ? args[0] : {};
      routes.set(`ALL:${path}`, { handler, options });
    });

    mockServer = {
      all: allHandler,
      authenticate: jest.fn(),
      log: {
        error: jest.fn(),
      },
    };

    mockedAxios.mockResolvedValue({
      status: 200,
      data: { success: true },
      headers: { 'content-type': 'application/json' },
    } as any);
  });

  describe('header filtering', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      const setupRoutes = createAuthenticatedProxy(mockServer, {
        serviceUrl: 'http://backend:3000',
        serviceName: 'test-service',
        publicPaths: ['/*'],
      });

      await setupRoutes(mockServer);
      handler = routes.get('ALL:/*')!.handler;

      mockRequest = {
        id: 'req-123',
        method: 'GET',
        url: '/test',
        ip: '10.0.0.1',
        headers: {},
        params: { '*': 'test' },
        body: {},
        query: {},
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        headers: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
    });

    it('blocks x-gateway-internal header', async () => {
      mockRequest.headers['x-gateway-internal'] = 'spoofed';

      await handler(mockRequest, mockReply);

      const axiosCall = mockedAxios.mock.calls[0][0] as any;
      expect(axiosCall.headers).not.toHaveProperty('x-gateway-internal');
    });

    it('blocks x-tenant-id header from external source', async () => {
      mockRequest.headers['x-tenant-id'] = 'spoofed-tenant';

      await handler(mockRequest, mockReply);

      const axiosCall = mockedAxios.mock.calls[0][0] as any;
      expect(axiosCall.headers['x-tenant-id']).toBeUndefined();
    });

    it('allows authorization header', async () => {
      mockRequest.headers['authorization'] = 'Bearer token-123';

      await handler(mockRequest, mockReply);

      const axiosCall = mockedAxios.mock.calls[0][0] as any;
      expect(axiosCall.headers['authorization']).toBe('Bearer token-123');
    });

    it('adds gateway headers', async () => {
      await handler(mockRequest, mockReply);

      const axiosCall = mockedAxios.mock.calls[0][0] as any;
      expect(axiosCall.headers['x-request-id']).toBe('req-123');
      expect(axiosCall.headers['x-correlation-id']).toBe('req-123');
      expect(axiosCall.headers['x-gateway-forwarded']).toBe('true');
      expect(axiosCall.headers['x-original-ip']).toBe('10.0.0.1');
    });
  });

  describe('error handling', () => {
    let handler: Function;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      const setupRoutes = createAuthenticatedProxy(mockServer, {
        serviceUrl: 'http://backend:3000',
        serviceName: 'user-service',
        publicPaths: ['/*'],
        timeout: 5000,
      });

      await setupRoutes(mockServer);
      handler = routes.get('ALL:/*')!.handler;

      mockRequest = {
        id: 'req-error',
        method: 'GET',
        url: '/error',
        ip: '10.0.0.20',
        headers: {},
        params: { '*': 'error' },
        body: {},
        query: {},
      };

      mockReply = {
        code: jest.fn().mockReturnThis(),
        headers: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
    });

    it('returns 504 on timeout', async () => {
      mockedAxios.mockRejectedValue({
        message: 'Timeout exceeded',
        code: 'ETIMEDOUT',
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(504);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Gateway Timeout',
        message: 'user-service service timeout after 5000ms',
        correlationId: 'req-error',
      });
    });

    it('returns 503 on connection refused', async () => {
      mockedAxios.mockRejectedValue({
        message: 'Connection refused',
        code: 'ECONNREFUSED',
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Service Unavailable',
        message: 'user-service service is down',
        correlationId: 'req-error',
      });
    });

    it('returns 502 on generic error', async () => {
      mockedAxios.mockRejectedValue({
        message: 'Network error',
        code: 'ENETWORK',
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(502);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Bad Gateway',
        message: 'user-service service error: Network error',
        correlationId: 'req-error',
      });
    });
  });
});
