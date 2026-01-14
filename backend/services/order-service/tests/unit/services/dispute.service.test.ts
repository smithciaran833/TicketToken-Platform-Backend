/**
 * Unit Tests: Dispute Service
 * Tests dispute/chargeback handling
 */

const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockClient = { query: jest.fn(), release: jest.fn() };

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: mockQuery, connect: mockConnect })),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/rabbitmq', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import { DisputeService, DisputeData, DisputeOutcome } from '../../../src/services/dispute.service';
import { publishEvent } from '../../../src/config/rabbitmq';

describe('DisputeService', () => {
  let service: DisputeService;

  const sampleDispute: DisputeData = {
    disputeId: 'dp_123',
    paymentIntentId: 'pi_456',
    amount: 5000,
    currency: 'USD',
    reason: 'fraudulent',
    status: 'needs_response',
    evidenceDueBy: new Date('2024-02-01'),
  };

  const sampleOrder = {
    id: 'order-123',
    user_id: 'user-456',
    tenant_id: 'tenant-789',
    status: 'CONFIRMED',
    total_amount_cents: 5000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
    service = new DisputeService();
  });

  describe('handleDisputeCreated', () => {
    it('should link dispute to order and lock refunds', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [sampleOrder] }) // Find order
        .mockResolvedValueOnce({ rows: [] }) // Update order
        .mockResolvedValueOnce({ rows: [] }) // Record event
        .mockResolvedValueOnce({ rows: [] }) // Create dispute record
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await service.handleDisputeCreated(sampleDispute);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(publishEvent).toHaveBeenCalledWith('order.dispute.created', expect.any(Object));
      expect(publishEvent).toHaveBeenCalledWith('alert.critical', expect.objectContaining({ type: 'DISPUTE_CREATED' }));
    });

    it('should rollback if order not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // No order found

      await service.handleDisputeCreated(sampleDispute);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error'));

      await expect(service.handleDisputeCreated(sampleDispute)).rejects.toThrow('DB error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should always release client', async () => {
      mockClient.query.mockRejectedValue(new Error('Error'));

      await expect(service.handleDisputeCreated(sampleDispute)).rejects.toThrow();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('handleDisputeUpdated', () => {
    it('should update dispute status', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Update order
        .mockResolvedValueOnce({ rows: [] }) // Update dispute
        .mockResolvedValueOnce({ rows: [sampleOrder] }) // Get order
        .mockResolvedValueOnce({ rows: [] }) // Record event
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await service.handleDisputeUpdated({ ...sampleDispute, status: 'under_review' });

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('handleDisputeClosed', () => {
    const wonOutcome: DisputeOutcome = { status: 'won' };
    const lostOutcome: DisputeOutcome = { status: 'lost' };

    it('should unlock refunds when dispute won', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [sampleOrder] }) // Get order
        .mockResolvedValueOnce({ rows: [] }) // Update order
        .mockResolvedValueOnce({ rows: [] }) // Update dispute
        .mockResolvedValueOnce({ rows: [] }) // Record event
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await service.handleDisputeClosed(sampleDispute, wonOutcome);

      expect(publishEvent).toHaveBeenCalledWith('order.dispute.closed', expect.objectContaining({ won: true }));
    });

    it('should keep refunds locked when dispute lost', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [sampleOrder] }) // Get order
        .mockResolvedValueOnce({ rows: [] }) // Update order
        .mockResolvedValueOnce({ rows: [] }) // Update dispute
        .mockResolvedValueOnce({ rows: [] }) // Record event
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await service.handleDisputeClosed(sampleDispute, lostOutcome);

      expect(publishEvent).toHaveBeenCalledWith('order.dispute.closed', expect.objectContaining({ won: false }));
      expect(publishEvent).toHaveBeenCalledWith('order.dispute.lost', expect.any(Object));
      expect(publishEvent).toHaveBeenCalledWith('alert.critical', expect.objectContaining({ type: 'DISPUTE_LOST' }));
    });

    it('should handle withdrawn dispute as won', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.handleDisputeClosed(sampleDispute, { status: 'withdrawn' });

      expect(publishEvent).toHaveBeenCalledWith('order.dispute.closed', expect.objectContaining({ won: true }));
    });
  });

  describe('hasActiveDispute', () => {
    it('should return true when order has active dispute', async () => {
      mockQuery.mockResolvedValue({ rows: [{ has_dispute: true, refund_locked: true }] });

      const result = await service.hasActiveDispute('order-123');

      expect(result).toBe(true);
    });

    it('should return false when no dispute', async () => {
      mockQuery.mockResolvedValue({ rows: [{ has_dispute: false, refund_locked: false }] });

      const result = await service.hasActiveDispute('order-123');

      expect(result).toBe(false);
    });

    it('should return false when order not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.hasActiveDispute('order-123');

      expect(result).toBe(false);
    });
  });

  describe('getDisputeInfo', () => {
    it('should return dispute info', async () => {
      const disputeInfo = { dispute_id: 'dp_123', status: 'needs_response', order_status: 'CONFIRMED' };
      mockQuery.mockResolvedValue({ rows: [disputeInfo] });

      const result = await service.getDisputeInfo('order-123');

      expect(result).toEqual(disputeInfo);
    });

    it('should return null when no dispute', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.getDisputeInfo('order-123');

      expect(result).toBeNull();
    });
  });
});
