import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  setupTimeoutMiddleware,
  DistributedTimeoutCoordinator,
  monitorTimeouts,
} from '../../../src/middleware/timeout.middleware';
import { ServiceUnavailableError } from '../../../src/types';

jest.mock('../../../src/config', () => ({
  config: {
    timeouts: {
      default: 30000,
      payment: 60000,
      nftMinting: 90000,
    },
  },
  timeoutConfig: {
    services: {
      auth: {
        default: 5000,
        endpoints: {
          'POST /login': 10000,
          'POST /register': 15000,
        },
      },
      venue: {
        default: 8000,
        endpoints: {
          'GET /venues': 5000,
        },
      },
    },
  },
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  createRequestLogger: jest.fn(() => mockLogger),
}));

describe('timeout.middleware', () => {
  let mockServer: any;
  let mockRequest: any;
  let mockReply: any;
  let onRequestHooks: Function[];
  let preHandlerHook: Function;
  let originalDateNow: () => number;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    onRequestHooks = [];
    preHandlerHook = jest.fn();

    mockServer = {
      addHook: jest.fn((event: string, handler: Function) => {
        if (event === 'onRequest') onRequestHooks.push(handler);
        if (event === 'preHandler') preHandlerHook = handler;
      }),
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    };

    mockRequest = {
      id: 'req-123',
      method: 'GET',
      url: '/api/test',
      routeOptions: {},
      headers: {},
      raw: {
        setTimeout: jest.fn(),
      },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      sent: false,
      raw: {
        on: jest.fn(),
      },
    };

    originalDateNow = Date.now;
    Date.now = jest.fn(() => 1000000);
  });

  afterEach(() => {
    Date.now = originalDateNow;
    jest.useRealTimers();
  });

  describe('setupTimeoutMiddleware', () => {
    it('registers onRequest and preHandler hooks', async () => {
      await setupTimeoutMiddleware(mockServer);

      expect(mockServer.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
      expect(mockServer.addHook).toHaveBeenCalledWith('preHandler', expect.any(Function));
    });

    describe('timeout budget initialization', () => {
      it('creates timeout budget with default timeout', async () => {
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);

        expect(mockRequest.timeoutBudget).toEqual({
          total: 30000,
          remaining: 30000,
          deadlineMs: 1030000,
        });
      });

      it('sets request deadline header for downstream services', async () => {
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);

        expect(mockRequest.headers['x-request-deadline']).toBe('1030000');
      });

      it('calculates payment endpoint timeout', async () => {
        mockRequest.url = '/api/payments/create';
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);

        expect(mockRequest.timeoutBudget?.total).toBe(60000);
      });

      it('calculates NFT minting endpoint timeout', async () => {
        mockRequest.url = '/api/nft/mint';
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);

        expect(mockRequest.timeoutBudget?.total).toBe(90000);
      });

      it('uses service-specific endpoint timeout', async () => {
        mockRequest.method = 'POST';
        mockRequest.url = '/api/auth/login';
        mockRequest.routeOptions = { url: '/api/auth/login' };

        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);

        expect(mockRequest.timeoutBudget?.total).toBe(10000);
      });

      it('uses venue service endpoint timeout', async () => {
        mockRequest.method = 'GET';
        mockRequest.url = '/api/venues';
        mockRequest.routeOptions = { url: '/api/venues' };

        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);

        expect(mockRequest.timeoutBudget?.total).toBe(5000);
      });
    });

    describe('timeout budget monitoring', () => {
      it('updates remaining time in preHandler', async () => {
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);

        Date.now = jest.fn(() => 1005000); // 5 seconds elapsed

        await preHandlerHook(mockRequest);

        expect(mockRequest.timeoutBudget?.remaining).toBe(25000);
      });

      it('throws ServiceUnavailableError when timeout exceeded', async () => {
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);

        Date.now = jest.fn(() => 1035000); // 35 seconds elapsed

        await expect(preHandlerHook(mockRequest)).rejects.toThrow(ServiceUnavailableError);
        expect(mockLogger.error).toHaveBeenCalledWith(
          {
            timeout: 30000,
            elapsed: 35000,
            path: '/api/test',
          },
          'Request timeout exceeded'
        );
      });

      it('does not throw when budget is positive', async () => {
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);

        Date.now = jest.fn(() => 1010000); // 10 seconds elapsed

        await expect(preHandlerHook(mockRequest)).resolves.not.toThrow();
      });

      it('sets remaining to 0 when negative', async () => {
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);

        Date.now = jest.fn(() => 1040000); // 40 seconds elapsed

        try {
          await preHandlerHook(mockRequest);
        } catch (error) {
          // Expected error
        }

        expect(mockRequest.timeoutBudget?.remaining).toBe(0);
      });

      it('skips check when timeoutBudget is missing', async () => {
        await setupTimeoutMiddleware(mockServer);
        delete mockRequest.timeoutBudget;

        await expect(preHandlerHook(mockRequest)).resolves.not.toThrow();
      });
    });

    describe('socket timeout and timeout handler', () => {
      it('sets socket timeout with 1s buffer', async () => {
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);
        await onRequestHooks[1](mockRequest, mockReply);

        expect(mockRequest.raw.setTimeout).toHaveBeenCalledWith(31000); // 30000 + 1000
      });

      it('triggers timeout handler when request exceeds timeout', async () => {
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);
        await onRequestHooks[1](mockRequest, mockReply);

        // Fast-forward time to trigger timeout
        jest.advanceTimersByTime(30000);

        expect(mockLogger.error).toHaveBeenCalledWith(
          {
            timeout: 30000,
            path: '/api/test',
            method: 'GET',
          },
          'Request timed out'
        );
        expect(mockReply.code).toHaveBeenCalledWith(504);
        expect(mockReply.send).toHaveBeenCalledWith({
          statusCode: 504,
          error: 'Gateway Timeout',
          message: 'The request took too long to process',
          requestId: 'req-123',
        });
      });

      it('does not send timeout response if reply already sent', async () => {
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);
        await onRequestHooks[1](mockRequest, mockReply);

        mockReply.sent = true;

        jest.advanceTimersByTime(30000);

        expect(mockReply.code).not.toHaveBeenCalled();
        expect(mockReply.send).not.toHaveBeenCalled();
      });

      it('clears timeout on response finish', async () => {
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);
        await onRequestHooks[1](mockRequest, mockReply);

        const finishCallback = mockReply.raw.on.mock.calls.find(
          (call: any) => call[0] === 'finish'
        )?.[1];

        expect(finishCallback).toBeDefined();

        finishCallback();

        jest.advanceTimersByTime(30000);

        expect(mockReply.code).not.toHaveBeenCalled();
      });

      it('uses payment timeout for payment routes', async () => {
        mockRequest.url = '/api/payments/charge';
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);
        await onRequestHooks[1](mockRequest, mockReply);

        expect(mockRequest.raw.setTimeout).toHaveBeenCalledWith(61000); // 60000 + 1000
      });

      it('uses NFT timeout for NFT routes', async () => {
        mockRequest.url = '/api/nft/transfer';
        await setupTimeoutMiddleware(mockServer);
        await onRequestHooks[0](mockRequest);
        await onRequestHooks[1](mockRequest, mockReply);

        expect(mockRequest.raw.setTimeout).toHaveBeenCalledWith(91000); // 90000 + 1000
      });
    });
  });

  describe('DistributedTimeoutCoordinator', () => {
    describe('calculateDownstreamTimeout', () => {
      it('calculates timeout with buffer for downstream service', () => {
        const upstreamBudget = {
          total: 30000,
          remaining: 30000,
          deadlineMs: 1030000,
        };

        Date.now = jest.fn(() => 1000000);

        const timeout = DistributedTimeoutCoordinator.calculateDownstreamTimeout(
          upstreamBudget,
          'auth'
        );

        // 30000 remaining - 1000 buffer = 29000
        expect(timeout).toBe(29000);
      });

      it('respects minimum service timeout', () => {
        const upstreamBudget = {
          total: 30000,
          remaining: 3000,
          deadlineMs: 1003000,
        };

        Date.now = jest.fn(() => 1000000);

        const timeout = DistributedTimeoutCoordinator.calculateDownstreamTimeout(
          upstreamBudget,
          'auth'
        );

        // Remaining is 3000, minus buffer would be 2000, but min is 5000
        expect(timeout).toBe(5000);
      });

      it('throws error when timeout budget exhausted', () => {
        const upstreamBudget = {
          total: 30000,
          remaining: 0,
          deadlineMs: 1000000,
        };

        Date.now = jest.fn(() => 1000000);

        expect(() =>
          DistributedTimeoutCoordinator.calculateDownstreamTimeout(upstreamBudget, 'auth')
        ).toThrow('Timeout budget exhausted');
      });

      it('uses service config minimum when available', () => {
        const upstreamBudget = {
          total: 30000,
          remaining: 4000,
          deadlineMs: 1004000,
        };

        Date.now = jest.fn(() => 1000000);

        const timeout = DistributedTimeoutCoordinator.calculateDownstreamTimeout(
          upstreamBudget,
          'auth'
        );

        expect(timeout).toBe(5000); // Uses auth service's default of 5000
      });

      it('uses default minimum for unknown service', () => {
        const upstreamBudget = {
          total: 30000,
          remaining: 4000,
          deadlineMs: 1004000,
        };

        Date.now = jest.fn(() => 1000000);

        const timeout = DistributedTimeoutCoordinator.calculateDownstreamTimeout(
          upstreamBudget,
          'unknown-service'
        );

        expect(timeout).toBe(5000); // Uses default minimum of 5000
      });
    });

    describe('propagateTimeout', () => {
      it('adds deadline and remaining headers to downstream request', () => {
        mockRequest.timeoutBudget = {
          total: 30000,
          remaining: 25000,
          deadlineMs: 1025000,
        };

        Date.now = jest.fn(() => 1000000);

        const downstreamRequest: any = {
          headers: {},
        };

        DistributedTimeoutCoordinator.propagateTimeout(mockRequest, downstreamRequest);

        expect(downstreamRequest.headers['x-request-deadline']).toBe('1025000');
        expect(downstreamRequest.headers['x-timeout-remaining']).toBe('25000');
      });

      it('sets timeout on downstream request with 100ms buffer', () => {
        mockRequest.timeoutBudget = {
          total: 30000,
          remaining: 25000,
          deadlineMs: 1025000,
        };

        Date.now = jest.fn(() => 1000000);

        const downstreamRequest: any = {
          headers: {},
        };

        DistributedTimeoutCoordinator.propagateTimeout(mockRequest, downstreamRequest);

        expect(downstreamRequest.timeout).toBe(24900); // 25000 - 100
      });

      it('preserves existing headers in downstream request', () => {
        mockRequest.timeoutBudget = {
          total: 30000,
          remaining: 25000,
          deadlineMs: 1025000,
        };

        Date.now = jest.fn(() => 1000000);

        const downstreamRequest: any = {
          headers: {
            'content-type': 'application/json',
          },
        };

        DistributedTimeoutCoordinator.propagateTimeout(mockRequest, downstreamRequest);

        expect(downstreamRequest.headers['content-type']).toBe('application/json');
        expect(downstreamRequest.headers['x-request-deadline']).toBe('1025000');
      });

      it('throws error when request deadline exceeded', () => {
        mockRequest.timeoutBudget = {
          total: 30000,
          remaining: 0,
          deadlineMs: 1000000,
        };

        Date.now = jest.fn(() => 1000000);

        const downstreamRequest: any = {
          headers: {},
        };

        expect(() =>
          DistributedTimeoutCoordinator.propagateTimeout(mockRequest, downstreamRequest)
        ).toThrow('Request deadline exceeded');
      });

      it('does nothing when timeoutBudget is missing', () => {
        delete mockRequest.timeoutBudget;

        const downstreamRequest: any = {
          headers: {},
        };

        expect(() =>
          DistributedTimeoutCoordinator.propagateTimeout(mockRequest, downstreamRequest)
        ).not.toThrow();
      });
    });
  });

  describe('monitorTimeouts', () => {
    it('initializes timeout metrics on server', () => {
      monitorTimeouts(mockServer);

      expect(mockServer.timeoutMetrics).toBeDefined();
      expect(mockServer.timeoutMetrics.activeRequests).toBe(0);
      expect(mockServer.timeoutMetrics.timeoutCount).toBe(0);
    });

    it('logs warning when timeout count exceeds threshold', () => {
      monitorTimeouts(mockServer);

      mockServer.timeoutMetrics.timeoutCount = 100;

      jest.advanceTimersByTime(30000);

      expect(mockServer.log.warn).toHaveBeenCalledWith(
        { metrics: mockServer.timeoutMetrics },
        'High number of timeouts detected'
      );
    });

    it('does not log warning when timeout count is low', () => {
      monitorTimeouts(mockServer);

      mockServer.timeoutMetrics.timeoutCount = 5;

      jest.advanceTimersByTime(30000);

      expect(mockServer.log.warn).not.toHaveBeenCalled();
    });

    it('checks metrics every 30 seconds', () => {
      monitorTimeouts(mockServer);

      jest.advanceTimersByTime(29999);
      expect(mockServer.log.warn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      // Should have checked once
    });

    it('does not reinitialize metrics if already present', () => {
      mockServer.timeoutMetrics = {
        activeRequests: 10,
        timeoutCount: 50,
      };

      monitorTimeouts(mockServer);

      expect(mockServer.timeoutMetrics.timeoutCount).toBe(50);
      expect(mockServer.timeoutMetrics.activeRequests).toBe(10);
    });
  });
});
