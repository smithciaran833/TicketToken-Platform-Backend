/**
 * COMPONENT TEST: PaymentController
 *
 * Tests payment processing operations
 */

import { v4 as uuidv4 } from 'uuid';
import { FastifyRequest, FastifyReply } from 'fastify';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

// Mock services
const mockProcessPayment = jest.fn();
const mockCalculateDynamicFees = jest.fn();
const mockQueueMinting = jest.fn();
const mockGetJobStatus = jest.fn();
const mockGetBestBlockchain = jest.fn();
const mockDetectScalper = jest.fn();
const mockCheckVelocity = jest.fn();
const mockRecordPurchase = jest.fn();
const mockGetQueueStats = jest.fn();
const mockValidateAccessToken = jest.fn();
const mockDetectBot = jest.fn();

// Mock pool query
const mockPoolQuery = jest.fn();

jest.mock('../../../src/services/core', () => ({
  PaymentProcessorService: jest.fn().mockImplementation(() => ({
    processPayment: mockProcessPayment,
  })),
  FeeCalculatorService: jest.fn().mockImplementation(() => ({
    calculateDynamicFees: mockCalculateDynamicFees,
  })),
}));

jest.mock('../../../src/services/blockchain', () => ({
  NFTQueueService: jest.fn().mockImplementation(() => ({
    queueMinting: mockQueueMinting,
    getJobStatus: mockGetJobStatus,
  })),
  GasEstimatorService: jest.fn().mockImplementation(() => ({
    getBestBlockchain: mockGetBestBlockchain,
  })),
}));

jest.mock('../../../src/services/fraud', () => ({
  ScalperDetectorService: jest.fn().mockImplementation(() => ({
    detectScalper: mockDetectScalper,
  })),
  VelocityCheckerService: jest.fn().mockImplementation(() => ({
    checkVelocity: mockCheckVelocity,
    recordPurchase: mockRecordPurchase,
  })),
}));

jest.mock('../../../src/services/high-demand', () => ({
  WaitingRoomService: jest.fn().mockImplementation(() => ({
    getQueueStats: mockGetQueueStats,
    validateAccessToken: mockValidateAccessToken,
  })),
  BotDetectorService: jest.fn().mockImplementation(() => ({
    detectBot: mockDetectBot,
  })),
}));

jest.mock('../../../src/config/database', () => ({
  db: {},
  pool: { query: mockPoolQuery },
}));

jest.mock('../../../src/config', () => ({
  config: { stripe: { secretKey: 'sk_test_fake' } },
}));

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../../../src/serializers', () => ({
  serializeTransaction: jest.fn((t) => ({ id: t.id, status: t.status, amount: t.amount })),
  serializeTransactionSummary: jest.fn((t) => ({ id: t.transactionId, status: t.status })),
  serializeRefund: jest.fn((r) => ({ id: r.id, amount: r.amount })),
  SAFE_TRANSACTION_SELECT: 'id, status, amount',
  SAFE_REFUND_SELECT: 'id, amount, status',
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
    child: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
  },
}));

import { PaymentController } from '../../../src/controllers/payment.controller';

// Helpers
function createMockRequest(overrides: any = {}): FastifyRequest {
  return {
    body: {}, headers: {}, params: {}, query: {},
    id: uuidv4(), ip: '127.0.0.1',
    ...overrides,
  } as unknown as FastifyRequest;
}

function createMockReply(): { reply: FastifyReply; getResponse: () => any; getStatus: () => number } {
  let response: any = null;
  let status = 200;
  const reply = {
    send: jest.fn().mockImplementation((data) => { response = data; return reply; }),
    status: jest.fn().mockImplementation((code) => { status = code; return reply; }),
  } as unknown as FastifyReply;
  return { reply, getResponse: () => response, getStatus: () => status };
}

describe('PaymentController Component Tests', () => {
  let controller: PaymentController;
  let userId: string;
  let tenantId: string;
  let eventId: string;
  let venueId: string;

  beforeEach(() => {
    userId = uuidv4();
    tenantId = uuidv4();
    eventId = uuidv4();
    venueId = uuidv4();

    // Reset all mocks
    mockProcessPayment.mockReset();
    mockCalculateDynamicFees.mockReset();
    mockQueueMinting.mockReset();
    mockGetBestBlockchain.mockReset();
    mockDetectScalper.mockReset();
    mockCheckVelocity.mockReset();
    mockRecordPurchase.mockReset();
    mockGetQueueStats.mockReset();
    mockValidateAccessToken.mockReset();
    mockDetectBot.mockReset();
    mockPoolQuery.mockReset();

    // Default successful responses
    mockGetQueueStats.mockResolvedValue({ totalInQueue: 0, activeUsers: 0 });
    mockDetectBot.mockResolvedValue({ isBot: false });
    mockDetectScalper.mockResolvedValue({ decision: 'ALLOW' });
    mockCheckVelocity.mockResolvedValue({ allowed: true });
    mockCalculateDynamicFees.mockResolvedValue({
      breakdown: { platform: 250, processing: 150 },
      total: 400,
    });
    mockProcessPayment.mockResolvedValue({
      transactionId: uuidv4(),
      status: 'completed',
    });
    mockQueueMinting.mockResolvedValue('mint_job_123');
    mockRecordPurchase.mockResolvedValue(undefined);

    controller = new PaymentController();
  });

  // ===========================================================================
  // PROCESS PAYMENT
  // ===========================================================================
  describe('processPayment()', () => {
    it('should process payment successfully', async () => {
      const request = createMockRequest({
        body: {
          eventId,
          venueId,
          tickets: [{ ticketTypeId: uuidv4(), price: 50, quantity: 2 }],
          paymentMethod: { token: 'tok_test' },
        },
        user: { id: userId, tenantId },
        headers: {},
      });
      const { reply, getResponse, getStatus } = createMockReply();

      await controller.processPayment(request, reply);

      expect(mockProcessPayment).toHaveBeenCalled();
      expect(getStatus()).toBe(200);
      expect(getResponse().success).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({
        body: { eventId, tickets: [] },
      });
      const { reply, getStatus } = createMockReply();

      await controller.processPayment(request, reply);

      expect(getStatus()).toBe(401);
    });

    it('should require queue token for high-demand events', async () => {
      mockGetQueueStats.mockResolvedValueOnce({ totalInQueue: 100, activeUsers: 50 });

      const request = createMockRequest({
        body: { eventId, tickets: [], paymentMethod: {} },
        user: { id: userId },
        headers: {}, // No x-access-token
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.processPayment(request, reply);

      expect(getStatus()).toBe(403);
      expect(getResponse().code).toBe('QUEUE_TOKEN_REQUIRED');
    });

    it('should validate queue token for high-demand events', async () => {
      mockGetQueueStats.mockResolvedValueOnce({ totalInQueue: 100, activeUsers: 50 });
      mockValidateAccessToken.mockResolvedValueOnce({ valid: true, eventId });

      const request = createMockRequest({
        body: { eventId, venueId, tickets: [{ price: 50, quantity: 1 }], paymentMethod: {} },
        user: { id: userId, tenantId },
        headers: { 'x-access-token': 'valid_token' },
      });
      const { reply, getResponse } = createMockReply();

      await controller.processPayment(request, reply);

      expect(mockValidateAccessToken).toHaveBeenCalledWith('valid_token');
      expect(getResponse().success).toBe(true);
    });

    it('should reject invalid queue token', async () => {
      mockGetQueueStats.mockResolvedValueOnce({ totalInQueue: 100, activeUsers: 50 });
      mockValidateAccessToken.mockResolvedValueOnce({ valid: false });

      const request = createMockRequest({
        body: { eventId, tickets: [], paymentMethod: {} },
        user: { id: userId },
        headers: { 'x-access-token': 'invalid_token' },
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.processPayment(request, reply);

      expect(getStatus()).toBe(403);
      expect(getResponse().code).toBe('INVALID_ACCESS_TOKEN');
    });

    it('should detect and reject bots', async () => {
      mockDetectBot.mockResolvedValueOnce({ isBot: true, recommendation: 'block' });

      const request = createMockRequest({
        body: { eventId, tickets: [], paymentMethod: {} },
        user: { id: userId },
        headers: {},
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.processPayment(request, reply);

      expect(getStatus()).toBe(403);
      expect(getResponse().code).toBe('BOT_DETECTED');
    });

    it('should detect and reject scalpers', async () => {
      mockDetectScalper.mockResolvedValueOnce({ decision: 'decline' });

      const request = createMockRequest({
        body: { eventId, tickets: [], paymentMethod: {} },
        user: { id: userId },
        headers: {},
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.processPayment(request, reply);

      expect(getStatus()).toBe(403);
      expect(getResponse().code).toBe('FRAUD_DETECTED');
    });

    it('should enforce velocity limits', async () => {
      mockCheckVelocity.mockResolvedValueOnce({
        allowed: false,
        reason: 'Too many purchases',
        limits: { hourly: 5 },
      });

      const request = createMockRequest({
        body: { eventId, tickets: [], paymentMethod: {} },
        user: { id: userId },
        headers: {},
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.processPayment(request, reply);

      expect(getStatus()).toBe(429);
      expect(getResponse().code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should queue NFT minting on successful payment', async () => {
      const request = createMockRequest({
        body: {
          eventId, venueId,
          tickets: [{ ticketTypeId: uuidv4(), price: 50, quantity: 1 }],
          paymentMethod: {},
        },
        user: { id: userId, tenantId },
        headers: {},
      });
      const { reply, getResponse } = createMockReply();

      await controller.processPayment(request, reply);

      expect(mockQueueMinting).toHaveBeenCalled();
      expect(getResponse().nftStatus).toBe('queued');
    });
  });

  // ===========================================================================
  // CALCULATE FEES
  // ===========================================================================
  describe('calculateFees()', () => {
    it('should return fee breakdown', async () => {
      mockGetBestBlockchain.mockResolvedValueOnce({
        estimates: { solana: 0.001 },
        recommended: 'solana',
      });

      const request = createMockRequest({
        body: { venueId, amount: 100, ticketCount: 2 },
      });
      const { reply, getResponse } = createMockReply();

      await controller.calculateFees(request, reply);

      expect(mockCalculateDynamicFees).toHaveBeenCalledWith(venueId, 100, 2);
      expect(getResponse().fees).toBeDefined();
      expect(getResponse().gasEstimates).toBeDefined();
    });
  });

  // ===========================================================================
  // GET TRANSACTION STATUS
  // ===========================================================================
  describe('getTransactionStatus()', () => {
    it('should return transaction for owner', async () => {
      const transactionId = uuidv4();
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: transactionId,
          user_id: userId,
          status: 'completed',
          amount: 5000,
        }],
      });

      const request = createMockRequest({
        params: { transactionId },
        user: { id: userId },
      });
      const { reply, getResponse } = createMockReply();

      await controller.getTransactionStatus(request, reply);

      expect(getResponse().transaction.id).toBe(transactionId);
    });

    it('should allow admin access to any transaction', async () => {
      const transactionId = uuidv4();
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: transactionId,
          user_id: uuidv4(), // Different user
          status: 'completed',
        }],
      });

      const request = createMockRequest({
        params: { transactionId },
        user: { id: userId, isAdmin: true },
      });
      const { reply, getResponse } = createMockReply();

      await controller.getTransactionStatus(request, reply);

      expect(getResponse().transaction).toBeDefined();
    });

    it('should reject unauthorized access', async () => {
      const transactionId = uuidv4();
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: transactionId,
          user_id: uuidv4(), // Different user
          status: 'completed',
        }],
      });

      const request = createMockRequest({
        params: { transactionId },
        user: { id: userId, isAdmin: false },
      });
      const { reply, getStatus } = createMockReply();

      await controller.getTransactionStatus(request, reply);

      expect(getStatus()).toBe(403);
    });

    it('should return 404 for non-existent transaction', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const request = createMockRequest({
        params: { transactionId: uuidv4() },
        user: { id: userId },
      });
      const { reply, getStatus } = createMockReply();

      await controller.getTransactionStatus(request, reply);

      expect(getStatus()).toBe(404);
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({
        params: { transactionId: uuidv4() },
      });
      const { reply, getStatus } = createMockReply();

      await controller.getTransactionStatus(request, reply);

      expect(getStatus()).toBe(401);
    });
  });

  // ===========================================================================
  // REFUND TRANSACTION
  // ===========================================================================
  describe('refundTransaction()', () => {
    it('should process refund for owner', async () => {
      const transactionId = uuidv4();
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [{ id: transactionId, user_id: userId, tenant_id: tenantId, amount: 5000 }],
        })
        .mockResolvedValueOnce({ rows: [] }) // INSERT refund
        .mockResolvedValueOnce({ rows: [] }) // UPDATE transaction
        .mockResolvedValueOnce({
          rows: [{ id: uuidv4(), amount: 5000, status: 'pending' }],
        });

      const request = createMockRequest({
        params: { transactionId },
        body: { reason: 'Customer request' },
        user: { id: userId },
      });
      const { reply, getResponse } = createMockReply();

      await controller.refundTransaction(request, reply);

      expect(getResponse().success).toBe(true);
      expect(getResponse().refund).toBeDefined();
    });

    it('should reject refund exceeding transaction amount', async () => {
      const transactionId = uuidv4();
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: transactionId, user_id: userId, amount: 5000 }],
      });

      const request = createMockRequest({
        params: { transactionId },
        body: { amount: 10000 },
        user: { id: userId },
      });
      const { reply, getStatus } = createMockReply();

      await controller.refundTransaction(request, reply);

      expect(getStatus()).toBe(400);
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({
        params: { transactionId: uuidv4() },
        body: {},
      });
      const { reply, getStatus } = createMockReply();

      await controller.refundTransaction(request, reply);

      expect(getStatus()).toBe(401);
    });
  });
});
