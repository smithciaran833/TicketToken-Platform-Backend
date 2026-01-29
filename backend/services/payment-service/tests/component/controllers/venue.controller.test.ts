/**
 * COMPONENT TEST: VenueController
 *
 * Tests venue balance and payout operations
 */

import { v4 as uuidv4 } from 'uuid';
import { FastifyRequest, FastifyReply } from 'fastify';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock VenueBalanceService
const mockGetBalance = jest.fn();
const mockCalculatePayoutAmount = jest.fn();
const mockProcessPayout = jest.fn();
const mockGetPayoutHistory = jest.fn();

jest.mock('../../../src/services/core', () => ({
  VenueBalanceService: jest.fn().mockImplementation(() => ({
    getBalance: mockGetBalance,
    calculatePayoutAmount: mockCalculatePayoutAmount,
    processPayout: mockProcessPayout,
    getPayoutHistory: mockGetPayoutHistory,
  })),
}));

// Mock cache
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { VenueController } from '../../../src/controllers/venue.controller';

// Helper to create mock request
function createMockRequest(overrides: any = {}): FastifyRequest {
  return {
    body: {},
    headers: {},
    params: {},
    query: {},
    ...overrides,
  } as unknown as FastifyRequest;
}

// Helper to create mock reply
function createMockReply(): { reply: FastifyReply; getResponse: () => any; getStatus: () => number } {
  let response: any = null;
  let status = 200;

  const reply = {
    send: jest.fn().mockImplementation((data) => {
      response = data;
      return reply;
    }),
    status: jest.fn().mockImplementation((code) => {
      status = code;
      return reply;
    }),
  } as unknown as FastifyReply;

  return {
    reply,
    getResponse: () => response,
    getStatus: () => status,
  };
}

describe('VenueController Component Tests', () => {
  let controller: VenueController;
  let venueId: string;
  let tenantId: string;

  beforeEach(() => {
    venueId = uuidv4();
    tenantId = uuidv4();
    
    mockGetBalance.mockReset();
    mockCalculatePayoutAmount.mockReset();
    mockProcessPayout.mockReset();
    mockGetPayoutHistory.mockReset();

    // Default responses
    mockGetBalance.mockResolvedValue({
      available: 50000,
      pending: 10000,
      reserved: 5000,
    });
    mockCalculatePayoutAmount.mockResolvedValue({
      available: 50000,
      minimumPayout: 1000,
      instantAvailable: 25000,
    });
    mockProcessPayout.mockResolvedValue({ success: true });
    mockGetPayoutHistory.mockResolvedValue({
      payouts: [],
      total: 0,
    });

    controller = new VenueController();
  });

  // ===========================================================================
  // GET BALANCE
  // ===========================================================================
  describe('getBalance()', () => {
    it('should return balance for authorized user', async () => {
      const request = createMockRequest({
        params: { venueId },
        user: { id: uuidv4(), venues: [venueId] },
        tenantId,
      });
      const { reply, getResponse } = createMockReply();

      await controller.getBalance(request, reply);

      expect(mockGetBalance).toHaveBeenCalledWith(venueId);
      expect(mockCalculatePayoutAmount).toHaveBeenCalledWith(venueId, tenantId);

      const response = getResponse();
      expect(response.balance.available).toBe(50000);
      expect(response.payoutInfo.available).toBe(50000);
    });

    it('should allow admin access to any venue', async () => {
      const request = createMockRequest({
        params: { venueId },
        user: { id: uuidv4(), isAdmin: true, venues: [] },
        tenantId,
      });
      const { reply, getResponse } = createMockReply();

      await controller.getBalance(request, reply);

      expect(getResponse().balance).toBeDefined();
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({
        params: { venueId },
        tenantId,
        // No user
      });
      const { reply, getResponse, getStatus } = createMockReply();

      await controller.getBalance(request, reply);

      expect(getStatus()).toBe(401);
      expect(getResponse().error).toContain('Authentication required');
    });

    it('should reject unauthorized venue access', async () => {
      const request = createMockRequest({
        params: { venueId },
        user: { id: uuidv4(), venues: [uuidv4()] }, // Different venue
        tenantId,
      });
      const { reply, getResponse, getStatus } = createMockReply();

      await controller.getBalance(request, reply);

      expect(getStatus()).toBe(403);
      expect(getResponse().error).toContain('Access denied');
    });

    it('should require tenant context', async () => {
      const request = createMockRequest({
        params: { venueId },
        user: { id: uuidv4(), venues: [venueId] },
        // No tenantId
      });
      const { reply, getResponse, getStatus } = createMockReply();

      await controller.getBalance(request, reply);

      expect(getStatus()).toBe(400);
      expect(getResponse().error).toContain('Tenant context required');
    });
  });

  // ===========================================================================
  // REQUEST PAYOUT
  // ===========================================================================
  describe('requestPayout()', () => {
    it('should process standard payout', async () => {
      const request = createMockRequest({
        params: { venueId },
        body: { amount: 10000, instant: false },
        user: { id: uuidv4(), venues: [venueId] },
        tenantId,
      });
      const { reply, getResponse } = createMockReply();

      await controller.requestPayout(request, reply);

      expect(mockProcessPayout).toHaveBeenCalledWith(venueId, tenantId, 10000);

      const response = getResponse();
      expect(response.success).toBe(true);
      expect(response.type).toBe('standard');
      expect(response.estimatedArrival).toContain('business days');
    });

    it('should process instant payout', async () => {
      const request = createMockRequest({
        params: { venueId },
        body: { amount: 5000, instant: true },
        user: { id: uuidv4(), venues: [venueId] },
        tenantId,
      });
      const { reply, getResponse } = createMockReply();

      await controller.requestPayout(request, reply);

      const response = getResponse();
      expect(response.type).toBe('instant');
      expect(response.estimatedArrival).toContain('30 minutes');
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({
        params: { venueId },
        body: { amount: 10000 },
        tenantId,
      });
      const { reply, getStatus } = createMockReply();

      await controller.requestPayout(request, reply);

      expect(getStatus()).toBe(401);
    });

    it('should reject unauthorized venue access', async () => {
      const request = createMockRequest({
        params: { venueId },
        body: { amount: 10000 },
        user: { id: uuidv4(), venues: [] },
        tenantId,
      });
      const { reply, getStatus } = createMockReply();

      await controller.requestPayout(request, reply);

      expect(getStatus()).toBe(403);
    });

    it('should require tenant context', async () => {
      const request = createMockRequest({
        params: { venueId },
        body: { amount: 10000 },
        user: { id: uuidv4(), venues: [venueId] },
        // No tenantId
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.requestPayout(request, reply);

      expect(getStatus()).toBe(400);
      expect(getResponse().error).toContain('Tenant context required');
    });
  });

  // ===========================================================================
  // GET PAYOUT HISTORY
  // ===========================================================================
  describe('getPayoutHistory()', () => {
    it('should return payout history', async () => {
      mockGetPayoutHistory.mockResolvedValueOnce({
        payouts: [
          { id: uuidv4(), amount: 10000, status: 'completed' },
        ],
        total: 1,
      });

      const request = createMockRequest({
        params: { venueId },
        query: { limit: '10', offset: '0' },
        user: { id: uuidv4(), venues: [venueId] },
        tenantId,
      });
      const { reply, getResponse } = createMockReply();

      await controller.getPayoutHistory(request, reply);

      expect(mockGetPayoutHistory).toHaveBeenCalledWith(venueId, tenantId, 10, 0);

      const response = getResponse();
      expect(response.venueId).toBe(venueId);
    });

    it('should use default pagination', async () => {
      const request = createMockRequest({
        params: { venueId },
        query: {},
        user: { id: uuidv4(), venues: [venueId] },
        tenantId,
      });
      const { reply } = createMockReply();

      await controller.getPayoutHistory(request, reply);

      expect(mockGetPayoutHistory).toHaveBeenCalledWith(venueId, tenantId, 50, 0);
    });

    it('should require tenant context', async () => {
      const request = createMockRequest({
        params: { venueId },
        query: {},
        user: { id: uuidv4(), venues: [venueId] },
        // No tenantId
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.getPayoutHistory(request, reply);

      expect(getStatus()).toBe(400);
      expect(getResponse().error).toContain('Tenant context required');
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({
        params: { venueId },
        query: {},
        tenantId,
      });
      const { reply, getStatus } = createMockReply();

      await controller.getPayoutHistory(request, reply);

      expect(getStatus()).toBe(401);
    });
  });
});
