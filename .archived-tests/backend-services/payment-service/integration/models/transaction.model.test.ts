/**
 * Transaction Model Integration Tests
 * Tests actual database operations
 */

import { TransactionModel } from '../../../src/models/transaction.model';
import { TransactionStatus, TransactionType } from '../../../src/types/payment.types';
import { query } from '../../../src/config/database';
import { v4 as uuidv4 } from 'uuid';

// Existing test data from database
const TEST_USER_ID = '8f111508-77ad-4d4b-9d39-0010274386ab';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';
const TEST_EVENT_ID = '00000000-0000-0000-0000-000000000066';

describe('TransactionModel', () => {
  const createdTransactionIds: string[] = [];

  afterAll(async () => {
    // Clean up all test transactions
    for (const id of createdTransactionIds) {
      await query('DELETE FROM payment_transactions WHERE id = $1', [id]);
    }
  });

  describe('create()', () => {
    it('should create a transaction with required fields', async () => {
      const transaction = await TransactionModel.create({
        venueId: TEST_VENUE_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        type: TransactionType.TICKET_PURCHASE,
        amount: 10000,
        currency: 'USD',
        platformFee: 500,
        venuePayout: 9500,
      });

      createdTransactionIds.push(transaction.id);

      expect(transaction).toBeDefined();
      expect(transaction.id).toBeDefined();
      expect(transaction.venueId).toBe(TEST_VENUE_ID);
      expect(transaction.userId).toBe(TEST_USER_ID);
      expect(transaction.eventId).toBe(TEST_EVENT_ID);
      expect(transaction.type).toBe(TransactionType.TICKET_PURCHASE);
      expect(transaction.amount).toBe(10000);
      expect(transaction.currency).toBe('USD');
      expect(transaction.status).toBe(TransactionStatus.PENDING);
    });

    it('should create a transaction with all fields', async () => {
      const transaction = await TransactionModel.create({
        venueId: TEST_VENUE_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        type: TransactionType.TICKET_PURCHASE,
        amount: 15000,
        currency: 'USD',
        status: TransactionStatus.COMPLETED,
        platformFee: 750,
        venuePayout: 14250,
        gasFeePaid: 100,
        taxAmount: 800,
        totalAmount: 15900,
        stripePaymentIntentId: 'pi_test_' + uuidv4().slice(0, 8),
        metadata: { ticketCount: 3, seatNumbers: ['A1', 'A2', 'A3'] },
        idempotencyKey: uuidv4(),
        tenantId: uuidv4(),
      });

      createdTransactionIds.push(transaction.id);

      expect(transaction.status).toBe(TransactionStatus.COMPLETED);
      expect(transaction.gasFeePaid).toBe(100);
      expect(transaction.taxAmount).toBe(800);
      expect(transaction.totalAmount).toBe(15900);
      expect(transaction.stripePaymentIntentId).toContain('pi_test_');
      expect(transaction.metadata.ticketCount).toBe(3);
    });

    it('should default status to PENDING', async () => {
      const transaction = await TransactionModel.create({
        venueId: TEST_VENUE_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        type: TransactionType.TICKET_PURCHASE,
        amount: 5000,
        platformFee: 250,
        venuePayout: 4750,
      });

      createdTransactionIds.push(transaction.id);

      expect(transaction.status).toBe(TransactionStatus.PENDING);
    });

    it('should default currency to USD', async () => {
      const transaction = await TransactionModel.create({
        venueId: TEST_VENUE_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        type: TransactionType.TICKET_PURCHASE,
        amount: 5000,
        platformFee: 250,
        venuePayout: 4750,
      });

      createdTransactionIds.push(transaction.id);

      expect(transaction.currency).toBe('USD');
    });

    it('should default type to TICKET_PURCHASE', async () => {
      const transaction = await TransactionModel.create({
        venueId: TEST_VENUE_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        amount: 5000,
        platformFee: 250,
        venuePayout: 4750,
      });

      createdTransactionIds.push(transaction.id);

      expect(transaction.type).toBe(TransactionType.TICKET_PURCHASE);
    });

    it('should create transaction with different types', async () => {
      const types = [
        TransactionType.REFUND,
        TransactionType.FEE,
        TransactionType.PAYOUT,
      ];

      for (const type of types) {
        const transaction = await TransactionModel.create({
          venueId: TEST_VENUE_ID,
          userId: TEST_USER_ID,
          eventId: TEST_EVENT_ID,
          type,
          amount: 1000,
          platformFee: 50,
          venuePayout: 950,
        });

        createdTransactionIds.push(transaction.id);
        expect(transaction.type).toBe(type);
      }
    });

    it('should throw on duplicate idempotency key with same tenant', async () => {
      const idempotencyKey = uuidv4();
      const tenantId = uuidv4();

      const first = await TransactionModel.create({
        venueId: TEST_VENUE_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        type: TransactionType.TICKET_PURCHASE,
        amount: 5000,
        platformFee: 250,
        venuePayout: 4750,
        idempotencyKey,
        tenantId,
      });

      createdTransactionIds.push(first.id);

      // The model catches constraint violation and throws custom error
      // But the constraint name is uq_payment_transactions_idempotency
      await expect(
        TransactionModel.create({
          venueId: TEST_VENUE_ID,
          userId: TEST_USER_ID,
          eventId: TEST_EVENT_ID,
          type: TransactionType.TICKET_PURCHASE,
          amount: 5000,
          platformFee: 250,
          venuePayout: 4750,
          idempotencyKey,
          tenantId,
        })
      ).rejects.toThrow();
    });

    it('should store metadata as JSON', async () => {
      const metadata = {
        source: 'mobile_app',
        version: '2.0.1',
        features: ['express_checkout'],
      };

      const transaction = await TransactionModel.create({
        venueId: TEST_VENUE_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        type: TransactionType.TICKET_PURCHASE,
        amount: 5000,
        platformFee: 250,
        venuePayout: 4750,
        metadata,
      });

      createdTransactionIds.push(transaction.id);

      expect(transaction.metadata.source).toBe('mobile_app');
      expect(transaction.metadata.features).toContain('express_checkout');
    });
  });

  describe('findById()', () => {
    let existingTransactionId: string;

    beforeAll(async () => {
      const transaction = await TransactionModel.create({
        venueId: TEST_VENUE_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        type: TransactionType.TICKET_PURCHASE,
        amount: 7500,
        platformFee: 375,
        venuePayout: 7125,
      });
      existingTransactionId = transaction.id;
      createdTransactionIds.push(existingTransactionId);
    });

    it('should find transaction by ID', async () => {
      const found = await TransactionModel.findById(existingTransactionId);

      expect(found).toBeDefined();
      expect(found!.id).toBe(existingTransactionId);
      expect(found!.amount).toBe(7500);
    });

    it('should return null for non-existent ID', async () => {
      const found = await TransactionModel.findById(uuidv4());
      expect(found).toBeNull();
    });
  });

  describe('findByPaymentIntentId()', () => {
    let testPaymentIntentId: string;

    beforeAll(async () => {
      testPaymentIntentId = 'pi_findtest_' + uuidv4().slice(0, 8);
      const transaction = await TransactionModel.create({
        venueId: TEST_VENUE_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        type: TransactionType.TICKET_PURCHASE,
        amount: 8000,
        platformFee: 400,
        venuePayout: 7600,
        stripePaymentIntentId: testPaymentIntentId,
      });
      createdTransactionIds.push(transaction.id);
    });

    it('should find transaction by payment intent ID', async () => {
      const found = await TransactionModel.findByPaymentIntentId(testPaymentIntentId);

      expect(found).toBeDefined();
      expect(found!.stripePaymentIntentId).toBe(testPaymentIntentId);
      expect(found!.amount).toBe(8000);
    });

    it('should return null for non-existent payment intent ID', async () => {
      const found = await TransactionModel.findByPaymentIntentId('pi_nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('updateStatus()', () => {
    let transactionId: string;

    beforeEach(async () => {
      const transaction = await TransactionModel.create({
        venueId: TEST_VENUE_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        type: TransactionType.TICKET_PURCHASE,
        amount: 6000,
        platformFee: 300,
        venuePayout: 5700,
      });
      transactionId = transaction.id;
      createdTransactionIds.push(transactionId);
    });

    it('should update status to PROCESSING', async () => {
      const updated = await TransactionModel.updateStatus(transactionId, TransactionStatus.PROCESSING);
      expect(updated.status).toBe(TransactionStatus.PROCESSING);
    });

    it('should update status to COMPLETED', async () => {
      const updated = await TransactionModel.updateStatus(transactionId, TransactionStatus.COMPLETED);
      expect(updated.status).toBe(TransactionStatus.COMPLETED);
    });

    it('should update status to FAILED', async () => {
      const updated = await TransactionModel.updateStatus(transactionId, TransactionStatus.FAILED);
      expect(updated.status).toBe(TransactionStatus.FAILED);
    });

    it('should update status to REFUNDED', async () => {
      const updated = await TransactionModel.updateStatus(transactionId, TransactionStatus.REFUNDED);
      expect(updated.status).toBe(TransactionStatus.REFUNDED);
    });

    it('should throw for non-existent transaction', async () => {
      const fakeId = uuidv4();
      await expect(
        TransactionModel.updateStatus(fakeId, TransactionStatus.COMPLETED)
      ).rejects.toThrow(`Transaction not found: ${fakeId}`);
    });
  });

  describe('update()', () => {
    let transactionId: string;

    beforeEach(async () => {
      const transaction = await TransactionModel.create({
        venueId: TEST_VENUE_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        type: TransactionType.TICKET_PURCHASE,
        amount: 5000,
        platformFee: 250,
        venuePayout: 4750,
        metadata: { original: true },
      });
      transactionId = transaction.id;
      createdTransactionIds.push(transactionId);
    });

    it('should update status field', async () => {
      const updated = await TransactionModel.update(transactionId, {
        status: TransactionStatus.COMPLETED,
      });
      expect(updated.status).toBe(TransactionStatus.COMPLETED);
    });

    it('should update amount field', async () => {
      const updated = await TransactionModel.update(transactionId, {
        amount: 6000,
      });
      expect(updated.amount).toBe(6000);
    });

    it('should update platformFee field', async () => {
      const updated = await TransactionModel.update(transactionId, {
        platformFee: 300,
      });
      expect(updated.platformFee).toBe(300);
    });

    it('should update venuePayout field', async () => {
      const updated = await TransactionModel.update(transactionId, {
        venuePayout: 5700,
      });
      expect(updated.venuePayout).toBe(5700);
    });

    it('should update gasFeePaid field', async () => {
      const updated = await TransactionModel.update(transactionId, {
        gasFeePaid: 50,
      });
      expect(updated.gasFeePaid).toBe(50);
    });

    it('should update metadata field', async () => {
      const updated = await TransactionModel.update(transactionId, {
        metadata: { updated: true, newField: 'value' },
      });
      expect(updated.metadata.updated).toBe(true);
      expect(updated.metadata.newField).toBe('value');
    });

    it('should update multiple fields at once', async () => {
      const updated = await TransactionModel.update(transactionId, {
        status: TransactionStatus.COMPLETED,
        amount: 7000,
        platformFee: 350,
      });
      expect(updated.status).toBe(TransactionStatus.COMPLETED);
      expect(updated.amount).toBe(7000);
      expect(updated.platformFee).toBe(350);
    });

    it('should throw when no fields to update', async () => {
      await expect(
        TransactionModel.update(transactionId, {})
      ).rejects.toThrow('No fields to update');
    });

    it('should throw for non-existent transaction', async () => {
      const fakeId = uuidv4();
      await expect(
        TransactionModel.update(fakeId, { status: TransactionStatus.COMPLETED })
      ).rejects.toThrow(`Transaction not found: ${fakeId}`);
    });
  });

  describe('findByUserId()', () => {
    beforeAll(async () => {
      // Create multiple transactions for the test user
      for (let i = 0; i < 3; i++) {
        const transaction = await TransactionModel.create({
          venueId: TEST_VENUE_ID,
          userId: TEST_USER_ID,
          eventId: TEST_EVENT_ID,
          type: TransactionType.TICKET_PURCHASE,
          amount: 1000 * (i + 1),
          platformFee: 50 * (i + 1),
          venuePayout: 950 * (i + 1),
        });
        createdTransactionIds.push(transaction.id);
      }
    });

    it('should find transactions by user ID', async () => {
      const transactions = await TransactionModel.findByUserId(TEST_USER_ID);

      expect(transactions).toBeDefined();
      expect(transactions.length).toBeGreaterThanOrEqual(3);
      transactions.forEach(t => {
        expect(t.userId).toBe(TEST_USER_ID);
      });
    });

    it('should respect limit parameter', async () => {
      const transactions = await TransactionModel.findByUserId(TEST_USER_ID, 2);
      expect(transactions.length).toBeLessThanOrEqual(2);
    });

    it('should respect offset parameter', async () => {
      const all = await TransactionModel.findByUserId(TEST_USER_ID, 50, 0);
      const offset = await TransactionModel.findByUserId(TEST_USER_ID, 50, 1);

      if (all.length > 1) {
        expect(offset.length).toBe(all.length - 1);
      }
    });

    it('should return empty array for non-existent user', async () => {
      const transactions = await TransactionModel.findByUserId(uuidv4());
      expect(transactions).toEqual([]);
    });

    it('should order by created_at DESC', async () => {
      const transactions = await TransactionModel.findByUserId(TEST_USER_ID);

      for (let i = 1; i < transactions.length; i++) {
        expect(new Date(transactions[i - 1].createdAt).getTime())
          .toBeGreaterThanOrEqual(new Date(transactions[i].createdAt).getTime());
      }
    });
  });

  describe('findByVenueId()', () => {
    it('should find transactions by venue ID', async () => {
      const transactions = await TransactionModel.findByVenueId(TEST_VENUE_ID);

      expect(transactions).toBeDefined();
      expect(transactions.length).toBeGreaterThan(0);
      transactions.forEach(t => {
        expect(t.venueId).toBe(TEST_VENUE_ID);
      });
    });

    it('should respect limit parameter', async () => {
      const transactions = await TransactionModel.findByVenueId(TEST_VENUE_ID, 2);
      expect(transactions.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array for non-existent venue', async () => {
      const transactions = await TransactionModel.findByVenueId(uuidv4());
      expect(transactions).toEqual([]);
    });
  });
});
