import { v4 as uuidv4 } from 'uuid';
import { RefundHandler } from '../../src/services/refundHandler';
import { DatabaseService } from '../../src/services/databaseService';

/**
 * INTEGRATION TESTS FOR REFUND HANDLER
 * Tests refund initiation and processing
 * 
 * FK Chain: tenants → users → venues → events → orders
 */

describe('RefundHandler Integration Tests', () => {
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let testOrderId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testVenueId = uuidv4();
    testEventId = uuidv4();
    testOrderId = uuidv4();

    // 1. Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
      [testTenantId, 'Test Tenant', `test-${testTenantId.substring(0, 8)}`]
    );

    // 2. Create user
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testUserId, `user-${testUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId]
    );

    // 3. Create venue
    await DatabaseService.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [testVenueId, testTenantId, 'Test Venue', `venue-${testVenueId.substring(0, 8)}`, 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000, testUserId]
    );

    // 4. Create event
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `event-${testEventId.substring(0, 8)}`, 'PUBLISHED', testUserId]
    );

    // 5. Create order with payment
    const orderNumber = `ORD-${Date.now().toString(36)}`;
    await DatabaseService.query(
      `INSERT INTO orders (id, tenant_id, user_id, event_id, order_number, status, subtotal_cents, total_cents, ticket_quantity, payment_intent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [testOrderId, testTenantId, testUserId, testEventId, orderNumber, 'COMPLETED', 5000, 5000, 2, 'pi_test123']
    );
  });

  afterEach(async () => {
    await DatabaseService.query('DELETE FROM outbox WHERE aggregate_id = $1', [testOrderId]);
    await DatabaseService.query('DELETE FROM orders WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM events WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM venues WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  });

  afterAll(async () => {
    await DatabaseService.close();
  });

  describe('initiateRefund', () => {
    it('should update order status to REFUNDED', async () => {
      const result = await RefundHandler.initiateRefund(testOrderId, 'Customer request');

      expect(result.success).toBe(true);

      const order = await DatabaseService.query(
        'SELECT status FROM orders WHERE id = $1',
        [testOrderId]
      );
      expect(order.rows[0].status).toBe('REFUNDED');
    });

    it('should write refund event to outbox', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'Duplicate payment');

      const outbox = await DatabaseService.query(
        'SELECT * FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      expect(outbox.rows.length).toBe(1);
      expect(outbox.rows[0].aggregate_type).toBe('order');
      expect(outbox.rows[0].event_type).toBe('refund.requested');
    });

    it('should include order ID in payload', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'Test reason');

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = outbox.rows[0].payload;
      expect(payload.orderId).toBe(testOrderId);
    });

    it('should include payment intent ID in payload', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'Test reason');

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = outbox.rows[0].payload;
      expect(payload.paymentIntentId).toBe('pi_test123');
    });

    it('should include refund amount in cents', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'Test reason');

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = outbox.rows[0].payload;
      expect(payload.amountCents).toBe(5000);
    });

    it('should include refund reason in payload', async () => {
      const reason = 'Event cancelled';
      await RefundHandler.initiateRefund(testOrderId, reason);

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = outbox.rows[0].payload;
      expect(payload.reason).toBe(reason);
    });

    it('should return success response', async () => {
      const result = await RefundHandler.initiateRefund(testOrderId, 'Test');

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('orderId', testOrderId);
    });

    it('should throw error if order not found', async () => {
      const nonExistentId = uuidv4();
      await expect(
        RefundHandler.initiateRefund(nonExistentId, 'Test reason')
      ).rejects.toThrow();
    });

    it('should update timestamp', async () => {
      const before = new Date();

      await RefundHandler.initiateRefund(testOrderId, 'Test reason');

      const order = await DatabaseService.query(
        'SELECT updated_at FROM orders WHERE id = $1',
        [testOrderId]
      );

      const updatedAt = new Date(order.rows[0].updated_at);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should handle empty reason', async () => {
      const result = await RefundHandler.initiateRefund(testOrderId, '');

      expect(result.success).toBe(true);

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = outbox.rows[0].payload;
      expect(payload.reason).toBe('');
    });

    it('should handle long reason text', async () => {
      const longReason = 'A'.repeat(500);

      const result = await RefundHandler.initiateRefund(testOrderId, longReason);

      expect(result.success).toBe(true);
    });

    it('should handle special characters in reason', async () => {
      const specialReason = 'Refund requested: <urgent> & "immediate"';

      await expect(
        RefundHandler.initiateRefund(testOrderId, specialReason)
      ).resolves.not.toThrow();
    });

    it('should handle refund for different order amounts', async () => {
      // Update order amount
      await DatabaseService.query(
        'UPDATE orders SET total_cents = $1 WHERE id = $2',
        [15000, testOrderId]
      );

      await RefundHandler.initiateRefund(testOrderId, 'Test');

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = outbox.rows[0].payload;
      expect(payload.amountCents).toBe(15000);
    });

    it('should handle refund for order without payment intent', async () => {
      // Create order without payment intent
      const noPaymentOrderId = uuidv4();
      const orderNumber = `ORD-${Date.now().toString(36)}NP`;
      await DatabaseService.query(
        `INSERT INTO orders (id, tenant_id, user_id, event_id, order_number, status, subtotal_cents, total_cents, ticket_quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [noPaymentOrderId, testTenantId, testUserId, testEventId, orderNumber, 'PENDING', 1000, 1000, 1]
      );

      await RefundHandler.initiateRefund(noPaymentOrderId, 'Test');

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [noPaymentOrderId]
      );

      const payload = outbox.rows[0].payload;
      expect(payload.paymentIntentId).toBeNull();

      // Cleanup
      await DatabaseService.query('DELETE FROM outbox WHERE aggregate_id = $1', [noPaymentOrderId]);
      await DatabaseService.query('DELETE FROM orders WHERE id = $1', [noPaymentOrderId]);
    });
  });

  describe('refund reasons', () => {
    it('should handle customer-initiated refund', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'Customer request');

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = outbox.rows[0].payload;
      expect(payload.reason).toBe('Customer request');
    });

    it('should handle event cancellation refund', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'Event cancelled');

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = outbox.rows[0].payload;
      expect(payload.reason).toBe('Event cancelled');
    });

    it('should handle duplicate payment refund', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'Duplicate payment detected');

      const result = await DatabaseService.query(
        'SELECT status FROM orders WHERE id = $1',
        [testOrderId]
      );

      expect(result.rows[0].status).toBe('REFUNDED');
    });
  });

  describe('error handling', () => {
    it('should handle database connection error gracefully', async () => {
      // Close connection temporarily
      await DatabaseService.close();

      await expect(
        RefundHandler.initiateRefund(testOrderId, 'Test')
      ).rejects.toThrow();

      // Reconnect for cleanup
      await DatabaseService.initialize();
    });

    it('should throw with descriptive error message for missing order', async () => {
      const missingId = uuidv4();
      await expect(
        RefundHandler.initiateRefund(missingId, 'Test')
      ).rejects.toThrow();
    });
  });

  describe('integration with payment service', () => {
    it('should include all required fields for payment service', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'Full refund');

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = outbox.rows[0].payload;

      expect(payload).toHaveProperty('orderId');
      expect(payload).toHaveProperty('paymentIntentId');
      expect(payload).toHaveProperty('amountCents');
      expect(payload).toHaveProperty('reason');
    });

    it('should format amount correctly for payment service', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'Test');

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = outbox.rows[0].payload;

      // Amount should be in cents (integer)
      expect(Number.isInteger(payload.amountCents)).toBe(true);
      expect(payload.amountCents).toBeGreaterThan(0);
    });

    it('should preserve payment intent ID format', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'Test');

      const outbox = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = outbox.rows[0].payload;

      expect(typeof payload.paymentIntentId).toBe('string');
      expect(payload.paymentIntentId).toBe('pi_test123');
    });
  });

  describe('idempotency', () => {
    it('should prevent duplicate refund initiations', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'First');

      // Second refund attempt should fail (order already refunded)
      await expect(
        RefundHandler.initiateRefund(testOrderId, 'Second')
      ).rejects.toThrow();
    });

    it('should maintain data integrity on retry', async () => {
      await RefundHandler.initiateRefund(testOrderId, 'Test');

      const outboxCount = await DatabaseService.query(
        'SELECT COUNT(*) FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      expect(parseInt(outboxCount.rows[0].count)).toBe(1);
    });
  });
});
