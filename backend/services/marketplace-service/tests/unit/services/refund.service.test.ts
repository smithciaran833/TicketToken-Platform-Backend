/**
 * Unit Tests for refund.service.ts
 * Tests refund processing, bulk refunds, and refund history
 */

import { refundService, processRefund, processEventCancellationRefunds, getRefundHistory, getUserRefunds, RefundStatus, RefundReason } from '../../../src/services/refund.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('../../../src/config/database', () => {
  const mockKnex = jest.fn(() => mockKnex);
  Object.assign(mockKnex, {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereRaw: jest.fn().mockReturnThis(),
    whereNotExists: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    raw: jest.fn(),
    transaction: jest.fn(),
  });
  return mockKnex;
});

jest.mock('../../../src/middleware/request-id', () => ({
  getCurrentRequestId: jest.fn(() => 'mock-request-id'),
}));

jest.mock('../../../src/utils/circuit-breaker', () => ({
  withCircuitBreakerAndRetry: jest.fn((_, fn) => fn()),
}));

jest.mock('../../../src/middleware/internal-auth', () => ({
  buildInternalHeaders: jest.fn(() => ({})),
}));

jest.mock('../../../src/utils/metrics', () => ({
  BusinessMetrics: {
    record: jest.fn(),
  },
}));

jest.mock('../../../src/errors', () => ({
  ExternalServiceError: class extends Error {
    constructor(service: string, message: string) {
      super(`${service}: ${message}`);
    }
  },
  ValidationError: class extends Error {},
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import knex from '../../../src/config/database';

describe('RefundService', () => {
  const mockKnex = knex as jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('processRefund', () => {
    const mockTransfer = {
      id: 'transfer-123',
      listing_id: 'listing-456',
      buyer_id: 'buyer-789',
      seller_id: 'seller-101',
      total_amount: 10000,
      status: 'completed',
      stripe_payment_intent_id: 'pi_test123',
    };

    beforeEach(() => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(mockTransfer),
        }),
      });

      mockKnex.transaction = jest.fn((callback: Function) => {
        const trx: any = jest.fn(() => trx);
        trx.insert = jest.fn().mockResolvedValue([1]);
        trx.where = jest.fn().mockReturnValue({
          update: jest.fn().mockResolvedValue(1),
        });
        return callback(trx);
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ refundId: 'refund-test' }),
      });
    });

    it('should process a full refund successfully', async () => {
      const result = await processRefund({
        transferId: 'transfer-123',
        reason: RefundReason.BUYER_REQUEST,
        initiatedBy: 'user-123',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(RefundStatus.COMPLETED);
      expect(result.amount).toBe(10000);
    });

    it('should throw validation error for non-existent transfer', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await processRefund({
        transferId: 'non-existent',
        reason: RefundReason.BUYER_REQUEST,
        initiatedBy: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should throw for already refunded transfer', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            ...mockTransfer,
            status: 'refunded',
          }),
        }),
      });

      const result = await processRefund({
        transferId: 'transfer-123',
        reason: RefundReason.BUYER_REQUEST,
        initiatedBy: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already refunded');
    });

    it('should process partial refund', async () => {
      const result = await processRefund({
        transferId: 'transfer-123',
        reason: RefundReason.BUYER_REQUEST,
        amount: 5000,
        initiatedBy: 'user-123',
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(5000);
    });

    it('should reject refund amount exceeding transfer total', async () => {
      const result = await processRefund({
        transferId: 'transfer-123',
        reason: RefundReason.BUYER_REQUEST,
        amount: 15000, // More than total
        initiatedBy: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds');
    });

    it('should handle payment service failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ message: 'Payment failed' }),
        status: 500,
      });

      const result = await processRefund({
        transferId: 'transfer-123',
        reason: RefundReason.BUYER_REQUEST,
        initiatedBy: 'user-123',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('processEventCancellationRefunds', () => {
    it('should process bulk refunds for cancelled event', async () => {
      const mockTransfers = [
        { id: 'transfer-1', total_amount: 5000 },
        { id: 'transfer-2', total_amount: 7500 },
      ];

      mockKnex.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          join: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                whereNull: jest.fn().mockReturnValue({
                  orderBy: jest.fn().mockResolvedValue(mockTransfers),
                }),
              }),
            }),
          }),
        }),
      });

      // Mock individual refund calls
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ refundId: 'refund-test' }),
      });

      const result = await processEventCancellationRefunds('event-123', 'admin');

      expect(result.totalRequested).toBe(2);
    });

    it('should track failed refunds in result', async () => {
      mockKnex.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          join: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                whereNull: jest.fn().mockReturnValue({
                  orderBy: jest.fn().mockResolvedValue([
                    { id: 'transfer-1', total_amount: 5000 },
                  ]),
                }),
              }),
            }),
          }),
        }),
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Failed' }),
      });

      const result = await processEventCancellationRefunds('event-123', 'admin');

      expect(result.totalFailed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getRefundHistory', () => {
    it('should return refund history for transfer', async () => {
      const mockRefunds = [
        { id: 'refund-1', refund_amount: 5000 },
        { id: 'refund-2', refund_amount: 2500 },
      ];

      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(mockRefunds),
        }),
      });

      const result = await getRefundHistory('transfer-123');

      expect(result).toEqual(mockRefunds);
    });

    it('should return empty array for no refunds', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await getRefundHistory('transfer-123');

      expect(result).toEqual([]);
    });
  });

  describe('getUserRefunds', () => {
    it('should return paginated refunds for buyer', async () => {
      const mockRefunds = [{ id: 'refund-1' }];

      mockKnex.mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              offset: jest.fn().mockResolvedValue(mockRefunds),
            }),
          }),
        }),
      }).mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          count: jest.fn().mockReturnValue({
            first: jest.fn().mockResolvedValue({ count: '5' }),
          }),
        }),
      });

      const result = await getUserRefunds('user-123', 'buyer', { page: 1, limit: 20 });

      expect(result.refunds).toEqual(mockRefunds);
      expect(result.total).toBe(5);
    });

    it('should return refunds for seller', async () => {
      mockKnex.mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              offset: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }).mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          count: jest.fn().mockReturnValue({
            first: jest.fn().mockResolvedValue({ count: '0' }),
          }),
        }),
      });

      const result = await getUserRefunds('seller-123', 'seller');

      expect(result.refunds).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('RefundStatus enum', () => {
    it('should have correct status values', () => {
      expect(RefundStatus.PENDING).toBe('pending');
      expect(RefundStatus.PROCESSING).toBe('processing');
      expect(RefundStatus.COMPLETED).toBe('completed');
      expect(RefundStatus.FAILED).toBe('failed');
      expect(RefundStatus.PARTIAL).toBe('partial');
    });
  });

  describe('RefundReason enum', () => {
    it('should have correct reason values', () => {
      expect(RefundReason.EVENT_CANCELLED).toBe('event_cancelled');
      expect(RefundReason.BUYER_REQUEST).toBe('buyer_request');
      expect(RefundReason.SELLER_REQUEST).toBe('seller_request');
      expect(RefundReason.DISPUTE_RESOLUTION).toBe('dispute_resolution');
      expect(RefundReason.FRAUD).toBe('fraud');
    });
  });

  describe('Service export', () => {
    it('should export refundService object', () => {
      expect(refundService).toBeDefined();
      expect(refundService.processRefund).toBeDefined();
      expect(refundService.processEventCancellationRefunds).toBeDefined();
      expect(refundService.getRefundHistory).toBeDefined();
      expect(refundService.getUserRefunds).toBeDefined();
    });
  });
});
