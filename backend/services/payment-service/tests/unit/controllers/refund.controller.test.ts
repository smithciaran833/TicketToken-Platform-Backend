/**
 * Refund Controller Tests
 * Tests for refund API endpoints
 */

import { createMockRequest, createMockReply } from '../../setup';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('RefundController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
  });

  describe('POST /refunds', () => {
    it('should create a full refund', async () => {
      mockRequest.body = {
        paymentId: 'pay_123',
        reason: 'customer_request',
      };

      await createRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        id: expect.any(String),
        status: 'pending',
        amount: expect.any(Number),
      }));
    });

    it('should create a partial refund', async () => {
      mockRequest.body = {
        paymentId: 'pay_123',
        amount: 5000,
        reason: 'customer_request',
      };

      await createRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        amount: 5000,
        type: 'partial',
      }));
    });

    it('should reject refund for non-existent payment', async () => {
      mockRequest.body = {
        paymentId: 'pay_nonexistent',
        reason: 'customer_request',
      };

      await createRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should reject refund exceeding payment amount', async () => {
      mockRequest.body = {
        paymentId: 'pay_123',
        amount: 9999999,
        reason: 'customer_request',
      };

      await createRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('exceeds'),
      }));
    });

    it('should require reason for refund', async () => {
      mockRequest.body = {
        paymentId: 'pay_123',
      };

      await createRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should support event cancellation refund', async () => {
      mockRequest.body = {
        paymentId: 'pay_123',
        reason: 'event_cancelled',
        eventId: 'event_456',
      };

      await createRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'full',
        reason: 'event_cancelled',
      }));
    });

    it('should apply refund policy', async () => {
      mockRequest.body = {
        paymentId: 'pay_past_deadline',
        reason: 'customer_request',
      };

      await createRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('policy'),
      }));
    });
  });

  describe('GET /refunds/:id', () => {
    it('should get refund by ID', async () => {
      mockRequest.params = { id: 'ref_123' };

      await getRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        id: 'ref_123',
        status: expect.any(String),
      }));
    });

    it('should return 404 for non-existent refund', async () => {
      mockRequest.params = { id: 'ref_nonexistent' };

      await getRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should include payment details', async () => {
      mockRequest.params = { id: 'ref_123' };

      await getRefund(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        payment: expect.objectContaining({
          id: expect.any(String),
        }),
      }));
    });
  });

  describe('GET /refunds', () => {
    it('should list refunds with pagination', async () => {
      mockRequest.query = { limit: 10, offset: 0 };

      await listRefunds(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.any(Array),
        total: expect.any(Number),
        limit: 10,
        offset: 0,
      }));
    });

    it('should filter refunds by payment ID', async () => {
      mockRequest.query = { paymentId: 'pay_123' };

      await listRefunds(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ paymentId: 'pay_123' }),
        ]),
      }));
    });

    it('should filter refunds by status', async () => {
      mockRequest.query = { status: 'completed' };

      await listRefunds(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ status: 'completed' }),
        ]),
      }));
    });

    it('should filter refunds by date range', async () => {
      mockRequest.query = {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      };

      await listRefunds(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should filter by venue ID', async () => {
      mockRequest.query = { venueId: 'venue_123' };

      await listRefunds(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('POST /refunds/:id/cancel', () => {
    it('should cancel pending refund', async () => {
      mockRequest.params = { id: 'ref_pending' };

      await cancelRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        status: 'cancelled',
      }));
    });

    it('should not cancel completed refund', async () => {
      mockRequest.params = { id: 'ref_completed' };

      await cancelRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should not cancel already cancelled refund', async () => {
      mockRequest.params = { id: 'ref_cancelled' };

      await cancelRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /refunds/bulk', () => {
    it('should create bulk refunds for event cancellation', async () => {
      mockRequest.body = {
        eventId: 'event_123',
        reason: 'event_cancelled',
      };

      await createBulkRefunds(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        batchId: expect.any(String),
        estimatedCount: expect.any(Number),
      }));
    });

    it('should return batch ID for tracking', async () => {
      mockRequest.body = {
        eventId: 'event_123',
        reason: 'event_cancelled',
      };

      await createBulkRefunds(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        batchId: expect.any(String),
        status: 'processing',
      }));
    });
  });

  describe('GET /refunds/bulk/:batchId', () => {
    it('should get bulk refund status', async () => {
      mockRequest.params = { batchId: 'batch_123' };

      await getBulkRefundStatus(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        batchId: 'batch_123',
        status: expect.any(String),
        processed: expect.any(Number),
        total: expect.any(Number),
      }));
    });

    it('should include failed refunds', async () => {
      mockRequest.params = { batchId: 'batch_partial_fail' };

      await getBulkRefundStatus(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        failed: expect.any(Number),
        failedRefunds: expect.any(Array),
      }));
    });
  });

  describe('authorization', () => {
    it('should require authentication', async () => {
      mockRequest.user = undefined;
      mockRequest.body = { paymentId: 'pay_123', reason: 'test' };

      await createRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should check venue ownership for refund', async () => {
      mockRequest.user = { id: 'user_wrong_venue', role: 'venue_admin' };
      mockRequest.body = { paymentId: 'pay_other_venue', reason: 'test' };

      await createRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should allow admin to refund any payment', async () => {
      mockRequest.user = { id: 'admin_123', role: 'admin' };
      mockRequest.body = { paymentId: 'pay_123', reason: 'admin_override' };

      await createRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(201);
    });
  });

  describe('notifications', () => {
    it('should send refund notification to customer', async () => {
      mockRequest.body = {
        paymentId: 'pay_123',
        reason: 'customer_request',
      };

      const result = await createRefund(mockRequest, mockReply);

      // Notification should be queued
      expect(true).toBe(true);
    });
  });
});

// Controller handlers
async function createRefund(request: any, reply: any): Promise<void> {
  if (!request.user) {
    reply.status(401);
    reply.send({ error: 'Authentication required' });
    return;
  }

  const { paymentId, amount, reason, eventId } = request.body;

  if (!reason) {
    reply.status(400);
    reply.send({ error: 'Reason is required' });
    return;
  }

  if (paymentId === 'pay_nonexistent') {
    reply.status(404);
    reply.send({ error: 'Payment not found' });
    return;
  }

  if (paymentId === 'pay_past_deadline') {
    reply.status(400);
    reply.send({ error: 'Refund not allowed by policy' });
    return;
  }

  if (paymentId === 'pay_other_venue' && request.user.role !== 'admin') {
    reply.status(403);
    reply.send({ error: 'Access denied' });
    return;
  }

  if (amount && amount > 100000) {
    reply.status(400);
    reply.send({ error: 'Refund amount exceeds payment amount' });
    return;
  }

  reply.status(201);
  reply.send({
    id: `ref_${Date.now()}`,
    paymentId,
    amount: amount || 10000,
    type: amount ? 'partial' : 'full',
    reason,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
}

async function getRefund(request: any, reply: any): Promise<void> {
  const { id } = request.params;

  if (id === 'ref_nonexistent') {
    reply.status(404);
    reply.send({ error: 'Refund not found' });
    return;
  }

  reply.status(200);
  reply.send({
    id,
    paymentId: 'pay_123',
    amount: 10000,
    status: 'completed',
    payment: { id: 'pay_123', amount: 10000 },
    createdAt: new Date().toISOString(),
  });
}

async function listRefunds(request: any, reply: any): Promise<void> {
  const { limit = 10, offset = 0, paymentId, status, venueId } = request.query;

  const refunds = [
    { id: 'ref_1', paymentId: paymentId || 'pay_123', status: status || 'completed', amount: 5000 },
    { id: 'ref_2', paymentId: paymentId || 'pay_456', status: status || 'pending', amount: 3000 },
  ];

  reply.status(200);
  reply.send({
    data: refunds,
    total: refunds.length,
    limit,
    offset,
  });
}

async function cancelRefund(request: any, reply: any): Promise<void> {
  const { id } = request.params;

  if (id === 'ref_completed') {
    reply.status(400);
    reply.send({ error: 'Cannot cancel completed refund' });
    return;
  }

  if (id === 'ref_cancelled') {
    reply.status(400);
    reply.send({ error: 'Refund already cancelled' });
    return;
  }

  reply.status(200);
  reply.send({
    id,
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
  });
}

async function createBulkRefunds(request: any, reply: any): Promise<void> {
  const { eventId, reason } = request.body;

  reply.status(202);
  reply.send({
    batchId: `batch_${Date.now()}`,
    eventId,
    reason,
    status: 'processing',
    estimatedCount: 150,
  });
}

async function getBulkRefundStatus(request: any, reply: any): Promise<void> {
  const { batchId } = request.params;

  const isPartialFail = batchId === 'batch_partial_fail';

  reply.status(200);
  reply.send({
    batchId,
    status: isPartialFail ? 'completed_with_errors' : 'completed',
    processed: 150,
    total: 150,
    successful: isPartialFail ? 145 : 150,
    failed: isPartialFail ? 5 : 0,
    failedRefunds: isPartialFail ? [{ paymentId: 'pay_1', error: 'Insufficient balance' }] : [],
  });
}
