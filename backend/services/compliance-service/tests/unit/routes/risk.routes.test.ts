/**
 * Unit Tests for Risk Routes
 *
 * Tests risk assessment and flag management routes
 * Validates authorization, validation, and permission helpers
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRequest, createMockReply, createMockUser } from '../../setup';
import { TENANT_FIXTURES, VENUE_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS
// =============================================================================

const mockRiskController = {
  calculateRiskScore: jest.fn(),
  flagVenue: jest.fn(),
  resolveFlag: jest.fn()
};
jest.mock('../../../src/controllers/risk.controller', () => ({
  RiskController: jest.fn().mockImplementation(() => mockRiskController)
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger
}));

const mockRequireComplianceOfficer = jest.fn((req: any, reply: any, done: any) => done());
const mockRequireAuth = jest.fn((req: any, reply: any, done: any) => done());
jest.mock('../../../src/middleware/auth.middleware', () => ({
  requireComplianceOfficer: mockRequireComplianceOfficer,
  requireAuth: mockRequireAuth
}));

jest.mock('../../../src/middleware/validation.middleware', () => ({
  validateBody: () => (req: any, reply: any, done: any) => done(),
  validateParams: () => (req: any, reply: any, done: any) => done(),
  validateQuery: () => (req: any, reply: any, done: any) => done()
}));

jest.mock('../../../src/validators/schemas', () => ({
  calculateRiskSchema: {},
  flagVenueSchema: {},
  resolveFlagSchema: {},
  venueIdSchema: {}
}));

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;

// =============================================================================
// MOCK FASTIFY INSTANCE
// =============================================================================

function createMockFastify() {
  const routes: Record<string, { handler: Function; preHandler?: any; onRequest?: any }> = {};
  
  return {
    post: jest.fn((path: string, opts: any, handler?: Function) => {
      const actualHandler = handler || opts;
      const preHandler = handler ? opts.preHandler : undefined;
      const onRequest = handler ? opts.onRequest : undefined;
      routes[`POST:${path}`] = { handler: actualHandler, preHandler, onRequest };
    }),
    get: jest.fn((path: string, opts: any, handler?: Function) => {
      const actualHandler = handler || opts;
      const preHandler = handler ? opts.preHandler : undefined;
      const onRequest = handler ? opts.onRequest : undefined;
      routes[`GET:${path}`] = { handler: actualHandler, preHandler, onRequest };
    }),
    put: jest.fn((path: string, opts: any, handler?: Function) => {
      const actualHandler = handler || opts;
      const preHandler = handler ? opts.preHandler : undefined;
      const onRequest = handler ? opts.onRequest : undefined;
      routes[`PUT:${path}`] = { handler: actualHandler, preHandler, onRequest };
    }),
    routes,
    getHandler: (method: string, path: string) => routes[`${method}:${path}`]?.handler,
    getOnRequest: (method: string, path: string) => routes[`${method}:${path}`]?.onRequest
  };
}

// =============================================================================
// IMPORT AND SETUP
// =============================================================================

import { riskRoutes } from '../../../src/routes/risk.routes';

// =============================================================================
// TESTS
// =============================================================================

describe('Risk Routes', () => {
  let mockFastify: ReturnType<typeof createMockFastify>;
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFastify = createMockFastify();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockRequest.requestId = 'test-request-id';
    mockRequest.tenantId = TEST_TENANT_ID;
    mockRequest.user = createMockUser({ id: 'user-123', roles: ['compliance_officer'] });
    
    mockRiskController.calculateRiskScore.mockImplementation((req: any, reply: any) => {
      reply.send({ success: true });
    });
    mockRiskController.flagVenue.mockImplementation((req: any, reply: any) => {
      reply.send({ success: true });
    });
    mockRiskController.resolveFlag.mockImplementation((req: any, reply: any) => {
      reply.send({ success: true });
    });
    
    // Register routes
    await riskRoutes(mockFastify as any);
  });

  // ===========================================================================
  // Route Registration Tests
  // ===========================================================================

  describe('route registration', () => {
    it('should register POST /risk/assess', async () => {
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/risk/assess',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register GET /risk/:entityId/score', async () => {
      expect(mockFastify.get).toHaveBeenCalledWith(
        '/risk/:entityId/score',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register PUT /risk/:entityId/override', async () => {
      expect(mockFastify.put).toHaveBeenCalledWith(
        '/risk/:entityId/override',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register POST /risk/flag', async () => {
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/risk/flag',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register POST /risk/resolve', async () => {
      expect(mockFastify.post).toHaveBeenCalledWith(
        '/risk/resolve',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register GET /risk/flags', async () => {
      expect(mockFastify.get).toHaveBeenCalledWith(
        '/risk/flags',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register GET /risk/flags/:flagId', async () => {
      expect(mockFastify.get).toHaveBeenCalledWith(
        '/risk/flags/:flagId',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  // ===========================================================================
  // Authorization Tests
  // ===========================================================================

  describe('authorization middleware', () => {
    it('should require compliance_officer for POST /risk/assess', async () => {
      const onRequest = mockFastify.getOnRequest('POST', '/risk/assess');
      expect(onRequest).toBe(mockRequireComplianceOfficer);
    });

    it('should require auth for GET /risk/:entityId/score', async () => {
      const onRequest = mockFastify.getOnRequest('GET', '/risk/:entityId/score');
      expect(onRequest).toBe(mockRequireAuth);
    });

    it('should require compliance_officer for PUT /risk/:entityId/override', async () => {
      const onRequest = mockFastify.getOnRequest('PUT', '/risk/:entityId/override');
      expect(onRequest).toBe(mockRequireComplianceOfficer);
    });

    it('should require compliance_officer for POST /risk/flag', async () => {
      const onRequest = mockFastify.getOnRequest('POST', '/risk/flag');
      expect(onRequest).toBe(mockRequireComplianceOfficer);
    });

    it('should require compliance_officer for POST /risk/resolve', async () => {
      const onRequest = mockFastify.getOnRequest('POST', '/risk/resolve');
      expect(onRequest).toBe(mockRequireComplianceOfficer);
    });

    it('should require compliance_officer for GET /risk/flags', async () => {
      const onRequest = mockFastify.getOnRequest('GET', '/risk/flags');
      expect(onRequest).toBe(mockRequireComplianceOfficer);
    });

    it('should require compliance_officer for GET /risk/flags/:flagId', async () => {
      const onRequest = mockFastify.getOnRequest('GET', '/risk/flags/:flagId');
      expect(onRequest).toBe(mockRequireComplianceOfficer);
    });
  });

  // ===========================================================================
  // POST /risk/assess Tests
  // ===========================================================================

  describe('POST /risk/assess', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('POST', '/risk/assess');
      mockRequest.body = { venueId: TEST_VENUE_ID };
    });

    describe('successful assessment', () => {
      it('should call riskController.calculateRiskScore', async () => {
        await handler(mockRequest, mockReply);

        expect(mockRiskController.calculateRiskScore).toHaveBeenCalledWith(
          mockRequest,
          mockReply
        );
      });

      it('should log risk assessment request', async () => {
        await handler(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            venueId: TEST_VENUE_ID
          }),
          expect.stringContaining('Risk assessment requested')
        );
      });
    });

    describe('error handling', () => {
      it('should return 500 on controller error', async () => {
        mockRiskController.calculateRiskScore.mockImplementation(() => {
          throw new Error('Controller error');
        });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:internal',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to calculate risk score',
          instance: 'test-request-id'
        });
      });

      it('should log error on failure', async () => {
        mockRiskController.calculateRiskScore.mockImplementation(() => {
          throw new Error('Test error');
        });

        await handler(mockRequest, mockReply);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Test error'
          }),
          expect.any(String)
        );
      });
    });
  });

  // ===========================================================================
  // GET /risk/:entityId/score Tests
  // ===========================================================================

  describe('GET /risk/:entityId/score', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('GET', '/risk/:entityId/score');
      mockRequest.params = { entityId: TEST_VENUE_ID };
    });

    describe('successful retrieval', () => {
      it('should call riskController.calculateRiskScore', async () => {
        await handler(mockRequest, mockReply);

        expect(mockRiskController.calculateRiskScore).toHaveBeenCalledWith(
          mockRequest,
          mockReply
        );
      });

      it('should log risk score lookup', async () => {
        await handler(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            entityId: TEST_VENUE_ID
          }),
          expect.stringContaining('Risk score lookup')
        );
      });
    });

    describe('error handling', () => {
      it('should return 500 on controller error', async () => {
        mockRiskController.calculateRiskScore.mockImplementation(() => {
          throw new Error('Controller error');
        });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:internal',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to retrieve risk score',
          instance: 'test-request-id'
        });
      });
    });
  });

  // ===========================================================================
  // PUT /risk/:entityId/override Tests
  // ===========================================================================

  describe('PUT /risk/:entityId/override', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('PUT', '/risk/:entityId/override');
      mockRequest.params = { entityId: TEST_VENUE_ID };
      mockRequest.body = { score: 75, reason: 'Manual override due to investigation' };
    });

    describe('successful override', () => {
      it('should call riskController.flagVenue', async () => {
        await handler(mockRequest, mockReply);

        expect(mockRiskController.flagVenue).toHaveBeenCalledWith(
          mockRequest,
          mockReply
        );
      });

      it('should log override request with score', async () => {
        await handler(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            entityId: TEST_VENUE_ID,
            newScore: 75
          }),
          expect.stringContaining('Risk score override requested')
        );
      });
    });

    describe('error handling', () => {
      it('should return 500 on controller error', async () => {
        mockRiskController.flagVenue.mockImplementation(() => {
          throw new Error('Controller error');
        });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:internal',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to override risk score',
          instance: 'test-request-id'
        });
      });
    });
  });

  // ===========================================================================
  // POST /risk/flag Tests
  // ===========================================================================

  describe('POST /risk/flag', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('POST', '/risk/flag');
      mockRequest.body = {
        venueId: TEST_VENUE_ID,
        reason: 'Suspicious activity detected',
        severity: 'high',
        category: 'fraud'
      };
    });

    describe('successful flagging', () => {
      it('should call riskController.flagVenue', async () => {
        await handler(mockRequest, mockReply);

        expect(mockRiskController.flagVenue).toHaveBeenCalledWith(
          mockRequest,
          mockReply
        );
      });

      it('should log venue flagging with details', async () => {
        await handler(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            venueId: TEST_VENUE_ID,
            severity: 'high',
            category: 'fraud'
          }),
          expect.stringContaining('Venue flagged for risk review')
        );
      });
    });

    describe('error handling', () => {
      it('should return 500 on controller error', async () => {
        mockRiskController.flagVenue.mockImplementation(() => {
          throw new Error('Controller error');
        });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:internal',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to flag venue for review',
          instance: 'test-request-id'
        });
      });
    });
  });

  // ===========================================================================
  // POST /risk/resolve Tests
  // ===========================================================================

  describe('POST /risk/resolve', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('POST', '/risk/resolve');
      mockRequest.body = {
        flagId: 123,
        resolution: 'Investigated and found to be false positive'
      };
    });

    describe('successful resolution', () => {
      it('should call riskController.resolveFlag', async () => {
        await handler(mockRequest, mockReply);

        expect(mockRiskController.resolveFlag).toHaveBeenCalledWith(
          mockRequest,
          mockReply
        );
      });

      it('should log flag resolution request', async () => {
        await handler(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            flagId: 123
          }),
          expect.stringContaining('Risk flag resolution requested')
        );
      });
    });

    describe('error handling', () => {
      it('should return 500 on controller error', async () => {
        mockRiskController.resolveFlag.mockImplementation(() => {
          throw new Error('Controller error');
        });

        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:internal',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to resolve risk flag',
          instance: 'test-request-id'
        });
      });
    });
  });

  // ===========================================================================
  // GET /risk/flags Tests
  // ===========================================================================

  describe('GET /risk/flags', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('GET', '/risk/flags');
      mockRequest.query = { status: 'active', limit: '20', offset: '0' };
    });

    describe('successful listing', () => {
      it('should return empty data array (placeholder)', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: true,
          data: [],
          pagination: {
            limit: '20',
            offset: '0',
            total: 0
          }
        });
      });

      it('should log listing request', async () => {
        await handler(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'active',
            limit: '20',
            offset: '0'
          }),
          expect.stringContaining('Risk flags listing requested')
        );
      });
    });
  });

  // ===========================================================================
  // GET /risk/flags/:flagId Tests
  // ===========================================================================

  describe('GET /risk/flags/:flagId', () => {
    let handler: Function;

    beforeEach(() => {
      handler = mockFastify.getHandler('GET', '/risk/flags/:flagId');
      mockRequest.params = { flagId: 123 };
    });

    describe('placeholder response', () => {
      it('should return 404 not found (placeholder)', async () => {
        await handler(mockRequest, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          type: 'urn:error:compliance-service:not-found',
          title: 'Not Found',
          status: 404,
          detail: 'Risk flag 123 not found',
          instance: 'test-request-id'
        });
      });

      it('should log flag details request', async () => {
        await handler(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            flagId: 123
          }),
          expect.stringContaining('Risk flag details requested')
        );
      });
    });
  });
});
