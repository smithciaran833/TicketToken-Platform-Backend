import { RefundController } from '../../../src/controllers/refundController';

// Mock dependencies
const mockStripe = {
  refunds: {
    create: jest.fn()
  }
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripe);
});

const mockDbPool = {
  query: jest.fn(),
  connect: jest.fn()
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: () => mockDbPool
  }
}));

jest.mock('@tickettoken/shared', () => ({
  auditService: {
    logAction: jest.fn()
  }
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid')
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {}
}));

import { auditService } from '@tickettoken/shared';

describe('RefundController', () => {
  let controller: RefundController;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RefundController();

    mockDbPool.connect.mockResolvedValue(mockClient);

    mockReq = {
      body: {},
      user: {
        id: 'user_1',
        role: 'customer'
      },
      tenantId: 'tenant_1',
      ip: '192.168.1.1',
      headers: {
        'user-agent': 'test-agent'
      },
      idempotencyKey: 'idem_123'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('createRefund', () => {
    beforeEach(() => {
      mockReq.body = {
        paymentIntentId: 'pi_123',
        amount: 10000,
        reason: 'requested_by_customer'
      };

      // Setup successful payment check
      mockDbPool.query.mockResolvedValue({
        rows: [{
          stripe_intent_id: 'pi_123',
          amount: 10000,
          status: 'succeeded',
          order_id: 'order_1',
          tenant_id: 'tenant_1'
        }]
      });

      // Setup successful Stripe refund
      mockStripe.refunds.create.mockResolvedValue({
        id: 'ref_123',
        status: 'succeeded',
        amount: 10000
      });

      // Setup successful database operations
      mockClient.query.mockResolvedValue({});
    });

    it('should require authentication', async () => {
      mockReq.user = null;

      await controller.createRefund(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should require tenant context', async () => {
      mockReq.tenantId = null;

      await controller.createRefund(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Tenant context required'
      });
    });

    it('should validate request body', async () => {
      mockReq.body = { paymentIntentId: 'pi_123' }; // Missing amount

      await controller.createRefund(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation failed' })
      );
    });

    it('should reject negative amounts', async () => {
      mockReq.body.amount = -100;

      await controller.createRefund(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should check payment intent belongs to tenant', async () => {
      mockDbPool.query.mockResolvedValue({ rows: [] });

      await controller.createRefund(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Payment intent not found or unauthorized'
      });
    });

    it('should reject refund amount exceeding original', async () => {
      mockReq.body.amount = 20000; // Original is 10000

      await controller.createRefund(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Refund amount exceeds original payment'
      });
    });

    it('should reject already refunded payments', async () => {
      mockDbPool.query.mockResolvedValue({
        rows: [{
          status: 'refunded',
          amount: 10000
        }]
      });

      await controller.createRefund(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Payment already refunded'
      });
    });

    it('should create Stripe refund with idempotency', async () => {
      await controller.createRefund(mockReq, mockRes);

      expect(mockStripe.refunds.create).toHaveBeenCalledWith(
        {
          payment_intent: 'pi_123',
          amount: 10000,
          reason: 'requested_by_customer'
        },
        { idempotencyKey: 'idem_123' }
      );
    });

    it('should handle different refund reasons', async () => {
      const reasons = ['duplicate', 'fraudulent', 'requested_by_customer'];

      for (const reason of reasons) {
        jest.clearAllMocks();
        mockReq.body.reason = reason;
        mockStripe.refunds.create.mockResolvedValue({
          id: 'ref_123',
          status: 'succeeded'
        });
        mockClient.query.mockResolvedValue({});

        await controller.createRefund(mockReq, mockRes);

        expect(mockStripe.refunds.create).toHaveBeenCalledWith(
          expect.objectContaining({ reason }),
          expect.any(Object)
        );
      }
    });

    it('should convert "other" reason to "requested_by_customer"', async () => {
      mockReq.body.reason = 'other';

      await controller.createRefund(mockReq, mockRes);

      expect(mockStripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'requested_by_customer' }),
        expect.any(Object)
      );
    });

    it('should retry failed refund attempts', async () => {
      mockStripe.refunds.create
        .mockRejectedValueOnce({ statusCode: 500, message: 'Server error' })
        .mockResolvedValueOnce({
          id: 'ref_123',
          status: 'succeeded'
        });

      mockClient.query.mockResolvedValue({});

      await controller.createRefund(mockReq, mockRes);

      expect(mockStripe.refunds.create).toHaveBeenCalledTimes(2);
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should not retry 4xx client errors', async () => {
      mockStripe.refunds.create.mockRejectedValue({
        statusCode: 400,
        message: 'Invalid request'
      });

      await controller.createRefund(mockReq, mockRes);

      expect(mockStripe.refunds.create).toHaveBeenCalledTimes(1);
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should store refund in database', async () => {
      await controller.createRefund(mockReq, mockRes);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refunds'),
        expect.arrayContaining(['ref_123', 'pi_123', 10000])
      );
    });

    it('should update payment intent status', async () => {
      await controller.createRefund(mockReq, mockRes);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payment_intents'),
        ['pi_123']
      );
    });

    it('should publish refund event to outbox', async () => {
      await controller.createRefund(mockReq, mockRes);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbox'),
        expect.arrayContaining([
          'mock-uuid',
          'refund',
          'refund.completed'
        ])
      );
    });

    it('should rollback on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // set_config
        .mockRejectedValueOnce(new Error('Database error')); // INSERT refund

      await controller.createRefund(mockReq, mockRes);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should log audit trail on success', async () => {
      await controller.createRefund(mockReq, mockRes);

      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create_refund',
          success: true,
          userId: 'user_1'
        })
      );
    });

    it('should log audit trail on failure', async () => {
      mockStripe.refunds.create.mockRejectedValue(new Error('Stripe error'));

      await controller.createRefund(mockReq, mockRes);

      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create_refund',
          success: false
        })
      );
    });

    it('should return refund details on success', async () => {
      await controller.createRefund(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        refundId: 'ref_123',
        status: 'succeeded',
        amount: 10000
      });
    });

    it('should handle partial refunds', async () => {
      mockReq.body.amount = 5000; // Partial refund

      await controller.createRefund(mockReq, mockRes);

      expect(mockStripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5000 }),
        expect.any(Object)
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should set tenant context in database', async () => {
      await controller.createRefund(mockReq, mockRes);

      expect(mockClient.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, false)",
        ['tenant_1']
      );
    });

    it('should include refund metadata in audit log', async () => {
      await controller.createRefund(mockReq, mockRes);

      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            refundPercentage: 100,
            tenantId: 'tenant_1'
          })
        })
      );
    });

    it('should handle missing user role gracefully', async () => {
      mockReq.user.role = undefined;

      await controller.createRefund(mockReq, mockRes);

      expect(auditService.logAction).toHaveBeenCalled();
    });

    it('should release database client on success', async () => {
      await controller.createRefund(mockReq, mockRes);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release database client on error', async () => {
      mockClient.query.mockRejectedValue(new Error('DB error'));

      await controller.createRefund(mockReq, mockRes);

      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
