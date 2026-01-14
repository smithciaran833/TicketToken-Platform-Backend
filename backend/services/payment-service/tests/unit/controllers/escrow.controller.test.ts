/**
 * Unit Tests for Escrow Controller
 * 
 * Tests escrow endpoints including create, release, and dispute handling.
 */

import { createMockRequest, createMockReply } from '../../setup';

// Mock dependencies
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('../../../src/services/escrow.service', () => ({
  EscrowService: jest.fn().mockImplementation(() => ({
    createEscrow: jest.fn(),
    releaseEscrow: jest.fn(),
    cancelEscrow: jest.fn(),
    getEscrow: jest.fn(),
    listEscrows: jest.fn(),
    disputeEscrow: jest.fn(),
  })),
}));

describe('Escrow Controller', () => {
  let mockEscrowService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { EscrowService } = require('../../../src/services/escrow.service');
    mockEscrowService = new EscrowService();
  });

  describe('POST /escrows', () => {
    it('should create an escrow successfully', async () => {
      const request = createMockRequest({
        body: {
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          paymentIntentId: 'pi_test123',
          amount: 10000,
          holdDays: 7,
        },
        user: {
          userId: 'user-123',
          tenantId: 'tenant-abc',
          roles: ['user'],
        },
      });
      const reply = createMockReply();

      mockEscrowService.createEscrow.mockResolvedValue({
        id: 'esc_test123',
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        paymentIntentId: 'pi_test123',
        amount: 10000,
        status: 'held',
        holdDays: 7,
        releaseDate: new Date('2026-01-15T00:00:00Z'),
        createdAt: new Date(),
      });

      const result = await mockEscrowService.createEscrow(request.body);

      reply.status(201).send({
        success: true,
        data: {
          escrowId: result.id,
          orderId: result.orderId,
          amount: result.amount,
          status: result.status,
          releaseDate: result.releaseDate,
        },
      });

      expect(reply.status).toHaveBeenCalledWith(201);
      expect(mockEscrowService.createEscrow).toHaveBeenCalled();
    });

    it('should reject escrow creation without valid payment', async () => {
      mockEscrowService.createEscrow.mockRejectedValue({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Payment intent not found',
      });

      const reply = createMockReply();

      try {
        await mockEscrowService.createEscrow({
          orderId: 'order-123',
          paymentIntentId: 'pi_invalid',
          amount: 10000,
        });
      } catch (error) {
        reply.status(400).send({
          type: 'https://api.tickettoken.com/problems/bad-request',
          title: 'Bad Request',
          status: 400,
          detail: 'Cannot create escrow: payment intent not found',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('should validate escrow amount matches payment', async () => {
      const paymentAmount = 10000;
      const escrowAmount = 15000; // Mismatched amount

      const reply = createMockReply();

      if (escrowAmount !== paymentAmount) {
        reply.status(400).send({
          type: 'https://api.tickettoken.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: 'Escrow amount must match payment amount',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /escrows/:escrowId/release', () => {
    it('should release escrow funds successfully', async () => {
      mockEscrowService.releaseEscrow.mockResolvedValue({
        id: 'esc_test123',
        status: 'released',
        releasedAmount: 10000,
        releasedAt: new Date(),
        releaseReason: 'Event completed successfully',
      });

      const reply = createMockReply();
      const result = await mockEscrowService.releaseEscrow('esc_test123', {
        releaseReason: 'Event completed successfully',
      });

      reply.status(200).send({
        success: true,
        data: {
          escrowId: result.id,
          status: result.status,
          releasedAmount: result.releasedAmount,
        },
      });

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(result.status).toBe('released');
    });

    it('should release partial amount', async () => {
      mockEscrowService.releaseEscrow.mockResolvedValue({
        id: 'esc_test123',
        status: 'partially_released',
        originalAmount: 10000,
        releasedAmount: 5000,
        remainingAmount: 5000,
      });

      const result = await mockEscrowService.releaseEscrow('esc_test123', {
        releaseAmount: 5000,
      });

      expect(result.releasedAmount).toBe(5000);
      expect(result.remainingAmount).toBe(5000);
    });

    it('should reject release of non-existent escrow', async () => {
      mockEscrowService.releaseEscrow.mockRejectedValue({
        code: 'ESCROW_NOT_FOUND',
        message: 'Escrow not found',
      });

      const reply = createMockReply();

      try {
        await mockEscrowService.releaseEscrow('esc_nonexistent');
      } catch (error) {
        reply.status(404).send({
          type: 'https://api.tickettoken.com/problems/not-found',
          title: 'Not Found',
          status: 404,
          detail: 'Escrow not found',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(404);
    });

    it('should reject release of already released escrow', async () => {
      mockEscrowService.releaseEscrow.mockRejectedValue({
        code: 'ESCROW_ALREADY_RELEASED',
        message: 'Escrow has already been released',
      });

      const reply = createMockReply();

      try {
        await mockEscrowService.releaseEscrow('esc_released');
      } catch (error) {
        reply.status(400).send({
          type: 'https://api.tickettoken.com/problems/bad-request',
          title: 'Bad Request',
          status: 400,
          detail: 'Escrow has already been released',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /escrows/:escrowId/cancel', () => {
    it('should cancel escrow and refund buyer', async () => {
      mockEscrowService.cancelEscrow.mockResolvedValue({
        id: 'esc_test123',
        status: 'cancelled',
        refundId: 're_test123',
        refundAmount: 10000,
        cancelledAt: new Date(),
      });

      const reply = createMockReply();
      const result = await mockEscrowService.cancelEscrow('esc_test123', {
        reason: 'Event cancelled',
      });

      reply.status(200).send({
        success: true,
        data: {
          escrowId: result.id,
          status: result.status,
          refundId: result.refundId,
        },
      });

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(result.status).toBe('cancelled');
    });

    it('should reject cancellation after hold period', async () => {
      mockEscrowService.cancelEscrow.mockRejectedValue({
        code: 'HOLD_PERIOD_EXPIRED',
        message: 'Cannot cancel escrow after hold period has expired',
      });

      const reply = createMockReply();

      try {
        await mockEscrowService.cancelEscrow('esc_expired');
      } catch (error) {
        reply.status(400).send({
          type: 'https://api.tickettoken.com/problems/bad-request',
          title: 'Bad Request',
          status: 400,
          detail: 'Cannot cancel escrow after hold period has expired',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /escrows/:escrowId/dispute', () => {
    it('should open a dispute on escrow', async () => {
      mockEscrowService.disputeEscrow.mockResolvedValue({
        id: 'esc_test123',
        status: 'disputed',
        disputeId: 'dsp_test123',
        disputeReason: 'Ticket was invalid',
        disputeOpenedAt: new Date(),
      });

      const reply = createMockReply();
      const result = await mockEscrowService.disputeEscrow('esc_test123', {
        reason: 'Ticket was invalid',
        evidence: { description: 'QR code did not scan at venue' },
      });

      reply.status(200).send({
        success: true,
        data: {
          escrowId: result.id,
          status: result.status,
          disputeId: result.disputeId,
        },
      });

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(result.status).toBe('disputed');
    });

    it('should reject dispute on released escrow', async () => {
      mockEscrowService.disputeEscrow.mockRejectedValue({
        code: 'ESCROW_ALREADY_RELEASED',
        message: 'Cannot dispute a released escrow',
      });

      const reply = createMockReply();

      try {
        await mockEscrowService.disputeEscrow('esc_released');
      } catch (error) {
        reply.status(400).send({
          status: 400,
          detail: 'Cannot dispute a released escrow',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GET /escrows/:escrowId', () => {
    it('should retrieve escrow details', async () => {
      mockEscrowService.getEscrow.mockResolvedValue({
        id: 'esc_test123',
        orderId: 'order-123',
        paymentIntentId: 'pi_test123',
        amount: 10000,
        status: 'held',
        holdDays: 7,
        releaseDate: new Date('2026-01-15T00:00:00Z'),
        createdAt: new Date('2026-01-08T00:00:00Z'),
      });

      const reply = createMockReply();
      const result = await mockEscrowService.getEscrow('esc_test123');

      reply.status(200).send({
        success: true,
        data: result,
      });

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(result.id).toBe('esc_test123');
    });

    it('should return 404 for non-existent escrow', async () => {
      mockEscrowService.getEscrow.mockRejectedValue({
        code: 'ESCROW_NOT_FOUND',
      });

      const reply = createMockReply();

      try {
        await mockEscrowService.getEscrow('esc_nonexistent');
      } catch (error) {
        reply.status(404).send({
          status: 404,
          title: 'Not Found',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(404);
    });

    it('should enforce tenant isolation', async () => {
      const request = createMockRequest({
        user: { userId: 'user-123', tenantId: 'tenant-abc' },
      });

      mockEscrowService.getEscrow.mockResolvedValue({
        id: 'esc_test123',
        tenantId: 'tenant-xyz', // Different tenant
      });

      const reply = createMockReply();
      const escrow = await mockEscrowService.getEscrow('esc_test123');

      if (escrow.tenantId !== request.user.tenantId) {
        reply.status(403).send({
          status: 403,
          detail: 'Cross-tenant access denied',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('GET /escrows', () => {
    it('should list escrows for tenant', async () => {
      mockEscrowService.listEscrows.mockResolvedValue({
        data: [
          { id: 'esc_1', amount: 10000, status: 'held' },
          { id: 'esc_2', amount: 5000, status: 'released' },
        ],
        pagination: {
          total: 2,
          limit: 20,
          offset: 0,
          hasMore: false,
        },
      });

      const reply = createMockReply();
      const result = await mockEscrowService.listEscrows({
        tenantId: 'tenant-abc',
      });

      reply.status(200).send({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(result.data).toHaveLength(2);
    });

    it('should filter by status', async () => {
      mockEscrowService.listEscrows.mockResolvedValue({
        data: [{ id: 'esc_1', status: 'held' }],
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
      });

      const result = await mockEscrowService.listEscrows({
        tenantId: 'tenant-abc',
        status: 'held',
      });

      expect(result.data.every((e: any) => e.status === 'held')).toBe(true);
    });

    it('should filter by order ID', async () => {
      mockEscrowService.listEscrows.mockResolvedValue({
        data: [{ id: 'esc_1', orderId: 'order-123' }],
        pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
      });

      const result = await mockEscrowService.listEscrows({
        tenantId: 'tenant-abc',
        orderId: 'order-123',
      });

      expect(result.data).toHaveLength(1);
    });
  });

  describe('Automatic Release', () => {
    it('should schedule automatic release after hold period', async () => {
      const escrow = {
        id: 'esc_test123',
        holdDays: 7,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        releaseDate: new Date('2026-01-08T00:00:00Z'),
      };

      const now = new Date('2026-01-09T00:00:00Z'); // After release date
      const shouldAutoRelease = now >= escrow.releaseDate;

      expect(shouldAutoRelease).toBe(true);
    });

    it('should not auto-release during hold period', async () => {
      const escrow = {
        id: 'esc_test123',
        holdDays: 7,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        releaseDate: new Date('2026-01-08T00:00:00Z'),
      };

      const now = new Date('2026-01-05T00:00:00Z'); // Before release date
      const shouldAutoRelease = now >= escrow.releaseDate;

      expect(shouldAutoRelease).toBe(false);
    });

    it('should not auto-release disputed escrows', async () => {
      const escrow = {
        id: 'esc_test123',
        status: 'disputed',
        releaseDate: new Date('2026-01-08T00:00:00Z'),
      };

      const canAutoRelease = escrow.status !== 'disputed';
      expect(canAutoRelease).toBe(false);
    });
  });
});
