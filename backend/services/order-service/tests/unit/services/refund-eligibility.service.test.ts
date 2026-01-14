/**
 * Unit Tests: Refund Eligibility Service
 * Tests refund validation including transfer checks, dispute handling, and policy enforcement
 */

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({
    query: jest.fn(),
    connect: jest.fn(),
  })),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/ticket.client');
jest.mock('../../../src/services/payment.client');
jest.mock('../../../src/services/event.client');
jest.mock('../../../src/services/dispute.service', () => ({
  disputeService: { hasActiveDispute: jest.fn() },
}));

import { RefundEligibilityService } from '../../../src/services/refund-eligibility.service';
import { getDatabase } from '../../../src/config/database';
import { disputeService } from '../../../src/services/dispute.service';
import { TicketClient } from '../../../src/services/ticket.client';
import { PaymentClient } from '../../../src/services/payment.client';
import { EventClient } from '../../../src/services/event.client';

describe('RefundEligibilityService', () => {
  let service: RefundEligibilityService;
  let mockDb: any;
  let mockTicketClient: jest.Mocked<TicketClient>;
  let mockPaymentClient: jest.Mocked<PaymentClient>;
  let mockEventClient: jest.Mocked<EventClient>;

  const sampleOrder = {
    id: 'order-123',
    user_id: 'user-456',
    tenant_id: 'tenant-789',
    status: 'CONFIRMED',
    total_amount_cents: 10000,
    refunded_amount_cents: 0,
    currency: 'USD',
    event_id: 'event-001',
    stripe_payment_intent_id: 'pi_123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn() };
    (getDatabase as jest.Mock).mockReturnValue(mockDb);
    
    mockTicketClient = new TicketClient() as jest.Mocked<TicketClient>;
    mockPaymentClient = new PaymentClient() as jest.Mocked<PaymentClient>;
    mockEventClient = new EventClient() as jest.Mocked<EventClient>;
    
    service = new RefundEligibilityService();
    (service as any).ticketClient = mockTicketClient;
    (service as any).paymentClient = mockPaymentClient;
    (service as any).eventClient = mockEventClient;

    // Default mocks for happy path
    mockDb.query.mockResolvedValue({ rows: [sampleOrder] });
    (disputeService.hasActiveDispute as jest.Mock).mockResolvedValue(false);
    mockTicketClient.checkOrderTicketsNotTransferred = jest.fn().mockResolvedValue({ allValid: true, transferredTickets: [] });
    mockPaymentClient.getPaymentStatus = jest.fn().mockResolvedValue({ refundable: true, hasDispute: false, status: 'succeeded' });
    mockEventClient.getEventStatus = jest.fn().mockResolvedValue({ status: 'active', isCancelled: false, isPostponed: false, isRescheduled: false });
  });

  describe('checkEligibility', () => {
    it('should return eligible for valid refund request', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [sampleOrder] }) // getOrder
        .mockResolvedValueOnce({ rows: [{ payout_completed: false }] }) // checkPayoutStatus
        .mockResolvedValueOnce({ rows: [] }) // checkEventDate
        .mockResolvedValueOnce({ rows: [] }); // applyRefundPolicy

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(true);
      expect(result.maxRefundAmountCents).toBeDefined();
    });

    it('should reject when order not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Order not found');
      expect(result.blockers).toContain('ORDER_NOT_FOUND');
    });

    it('should reject when user does not own order', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ ...sampleOrder, user_id: 'different-user' }] });

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Order does not belong to this user');
      expect(result.blockers).toContain('NOT_ORDER_OWNER');
    });

    it('should reject when order status is not refundable', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ ...sampleOrder, status: 'PENDING' }] });

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain('INVALID_ORDER_STATUS');
    });

    it('should reject when order has active dispute', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sampleOrder] });
      (disputeService.hasActiveDispute as jest.Mock).mockResolvedValue(true);

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain('ACTIVE_DISPUTE');
    });

    it('should reject when tickets have been transferred', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sampleOrder] });
      mockTicketClient.checkOrderTicketsNotTransferred = jest.fn().mockResolvedValue({
        allValid: false,
        transferredTickets: ['ticket-1', 'ticket-2'],
      });

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain('TICKETS_TRANSFERRED');
    });

    it('should reject when payment is not refundable', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: [{ payout_completed: false }] });
      mockPaymentClient.getPaymentStatus = jest.fn().mockResolvedValue({ refundable: false, hasDispute: false, status: 'canceled' });

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain('PAYMENT_NOT_REFUNDABLE');
    });

    it('should reject when payment has dispute in Stripe', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: [{ payout_completed: false }] });
      mockPaymentClient.getPaymentStatus = jest.fn().mockResolvedValue({ refundable: true, hasDispute: true, status: 'disputed' });

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain('PAYMENT_HAS_DISPUTE');
    });

    it('should auto-approve when event is cancelled', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: [{ payout_completed: false }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      mockEventClient.getEventStatus = jest.fn().mockResolvedValue({ status: 'cancelled', isCancelled: true, isPostponed: false, isRescheduled: false });

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(true);
      expect(result.autoApprove).toBe(true);
    });

    it('should bypass policy when event is postponed', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: [{ payout_completed: false }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      mockEventClient.getEventStatus = jest.fn().mockResolvedValue({ status: 'postponed', isCancelled: false, isPostponed: true, isRescheduled: false });

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(true);
      expect(result.warnings).toContain('Policy bypassed: Event has been postponed');
    });

    it('should require manual review when payout completed', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: [{ payout_completed: true, payout_amount_cents: 8000 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(true);
      expect(result.requiresManualReview).toBe(true);
      expect(result.manualReviewReason).toContain('payout already completed');
    });

    it('should reject unsupported currency', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ ...sampleOrder, currency: 'XYZ' }] });

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain('CURRENCY_MISMATCH');
    });

    it('should reject mismatched requested currency', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sampleOrder] });

      const result = await service.checkEligibility('order-123', 'user-456', undefined, 'EUR');

      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain('CURRENCY_MISMATCH');
    });

    it('should include policy version in result', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: [{ payout_completed: false }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ policy_id: 'policy-1', policy_name: 'Standard', rule_id: 'rule-1', condition_type: 'ALWAYS', refund_percentage: 100 }] });

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.policyVersion).toBeDefined();
      expect(result.policyVersion?.policyId).toBe('policy-1');
    });

    it('should fail closed when ticket check fails', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [sampleOrder] });
      mockTicketClient.checkOrderTicketsNotTransferred = jest.fn().mockRejectedValue(new Error('Service down'));

      const result = await service.checkEligibility('order-123', 'user-456');

      expect(result.eligible).toBe(false);
      expect(result.blockers).toContain('TICKETS_TRANSFERRED');
    });
  });

  describe('validatePartialRefund', () => {
    it('should validate partial refund for specific items', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: [{ payout_completed: false }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_cents: 5000 }] });

      const result = await service.validatePartialRefund('order-123', 'user-456', ['item-1']);

      expect(result.eligible).toBe(true);
      expect(result.maxRefundAmountCents).toBeLessThanOrEqual(5000);
    });
  });
});
