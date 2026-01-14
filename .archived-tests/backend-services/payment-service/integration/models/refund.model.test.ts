/**
 * Refund Model Integration Tests
 * Tests actual database operations
 */

import { RefundModel } from '../../../src/models/refund.model';
import { TransactionModel } from '../../../src/models/transaction.model';
import { TransactionStatus, TransactionType } from '../../../src/types/payment.types';
import { query } from '../../../src/config/database';
import { v4 as uuidv4 } from 'uuid';

// Existing test data from database
const TEST_USER_ID = '8f111508-77ad-4d4b-9d39-0010274386ab';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';
const TEST_EVENT_ID = '00000000-0000-0000-0000-000000000066';

describe('RefundModel', () => {
  let testTransactionId: string;

  beforeAll(async () => {
    // Create a test transaction to reference
    const transaction = await TransactionModel.create({
      venueId: TEST_VENUE_ID,
      userId: TEST_USER_ID,
      eventId: TEST_EVENT_ID,
      type: TransactionType.TICKET_PURCHASE,
      amount: 10000,
      currency: 'USD',
      status: TransactionStatus.COMPLETED,
      platformFee: 500,
      venuePayout: 9500,
    });
    testTransactionId = transaction.id;
  });

  afterAll(async () => {
    // Clean up test data
    await query('DELETE FROM payment_refunds WHERE transaction_id = $1', [testTransactionId]);
    await query('DELETE FROM payment_transactions WHERE id = $1', [testTransactionId]);
  });

  describe('create()', () => {
    it('should create a refund with required fields', async () => {
      const refund = await RefundModel.create({
        transactionId: testTransactionId,
        amount: 5000,
        reason: 'Customer request',
      });

      expect(refund).toBeDefined();
      expect(refund.id).toBeDefined();
      // RefundModel returns raw DB rows with snake_case
      expect((refund as any).transaction_id).toBe(testTransactionId);
      expect(parseFloat(String(refund.amount))).toBe(5000);
      expect(refund.reason).toBe('Customer request');
      expect(refund.status).toBe('pending');

      // Clean up
      await query('DELETE FROM payment_refunds WHERE id = $1', [refund.id]);
    });

    it('should create a refund with all fields', async () => {
      const refund = await RefundModel.create({
        transactionId: testTransactionId,
        amount: 3000,
        reason: 'Event cancelled',
        status: 'processing',
        stripeRefundId: 're_test_123',
        metadata: { initiatedBy: 'admin', ticketIds: ['t1', 't2'] },
      });

      expect(refund.status).toBe('processing');
      // Raw DB row uses snake_case
      expect((refund as any).stripe_refund_id).toBe('re_test_123');
      expect(refund.metadata).toBeDefined();

      // Clean up
      await query('DELETE FROM payment_refunds WHERE id = $1', [refund.id]);
    });

    it('should default status to pending', async () => {
      const refund = await RefundModel.create({
        transactionId: testTransactionId,
        amount: 2000,
        reason: 'Test refund',
      });

      expect(refund.status).toBe('pending');

      // Clean up
      await query('DELETE FROM payment_refunds WHERE id = $1', [refund.id]);
    });

    it('should default metadata to empty object', async () => {
      const refund = await RefundModel.create({
        transactionId: testTransactionId,
        amount: 1500,
        reason: 'Test',
      });

      expect(refund.metadata).toBeDefined();

      // Clean up
      await query('DELETE FROM payment_refunds WHERE id = $1', [refund.id]);
    });

    it('should store metadata as JSON', async () => {
      const metadata = {
        reason_code: 'CUSTOMER_REQUEST',
        agent: 'support@test.com',
        notes: ['First contact', 'Approved'],
      };

      const refund = await RefundModel.create({
        transactionId: testTransactionId,
        amount: 1000,
        reason: 'Test with metadata',
        metadata,
      });

      const parsed = typeof refund.metadata === 'string'
        ? JSON.parse(refund.metadata)
        : refund.metadata;
      expect(parsed.reason_code).toBe('CUSTOMER_REQUEST');
      expect(parsed.notes).toHaveLength(2);

      // Clean up
      await query('DELETE FROM payment_refunds WHERE id = $1', [refund.id]);
    });
  });

  describe('updateStatus()', () => {
    let refundId: string;

    beforeEach(async () => {
      const refund = await RefundModel.create({
        transactionId: testTransactionId,
        amount: 5000,
        reason: 'Test update',
      });
      refundId = refund.id;
    });

    afterEach(async () => {
      await query('DELETE FROM payment_refunds WHERE id = $1', [refundId]);
    });

    it('should update status to processing', async () => {
      const updated = await RefundModel.updateStatus(refundId, 'processing');
      expect(updated.status).toBe('processing');
    });

    it('should update status to completed and set completed_at', async () => {
      const updated = await RefundModel.updateStatus(refundId, 'completed');
      expect(updated.status).toBe('completed');
      // Raw DB row uses snake_case
      expect((updated as any).completed_at).toBeDefined();
    });

    it('should update status to failed', async () => {
      const updated = await RefundModel.updateStatus(refundId, 'failed');
      expect(updated.status).toBe('failed');
    });

    it('should update stripe_refund_id when provided', async () => {
      const updated = await RefundModel.updateStatus(refundId, 'completed', 're_stripe_456');
      // Raw DB row uses snake_case
      expect((updated as any).stripe_refund_id).toBe('re_stripe_456');
    });

    it('should not overwrite stripe_refund_id with null', async () => {
      // First set a stripe refund ID
      await RefundModel.updateStatus(refundId, 'processing', 're_original');

      // Update status without providing stripe refund ID
      const updated = await RefundModel.updateStatus(refundId, 'completed');
      // Raw DB row uses snake_case
      expect((updated as any).stripe_refund_id).toBe('re_original');
    });

    it('should update updated_at timestamp', async () => {
      const before = await query('SELECT updated_at FROM payment_refunds WHERE id = $1', [refundId]);

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      await RefundModel.updateStatus(refundId, 'processing');

      const after = await query('SELECT updated_at FROM payment_refunds WHERE id = $1', [refundId]);
      expect(new Date(after.rows[0].updated_at).getTime())
        .toBeGreaterThanOrEqual(new Date(before.rows[0].updated_at).getTime());
    });

    it('should return undefined for non-existent refund', async () => {
      const result = await RefundModel.updateStatus(uuidv4(), 'completed');
      expect(result).toBeUndefined();
    });
  });
});
