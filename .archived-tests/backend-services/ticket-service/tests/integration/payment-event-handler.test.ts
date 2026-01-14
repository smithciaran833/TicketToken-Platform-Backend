import { PaymentEventHandler } from '../../src/services/paymentEventHandler';
import { DatabaseService } from '../../src/services/databaseService';
import { QueueService } from '../../src/services/queueService';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR PAYMENT EVENT HANDLER
 * Tests handling of payment success/failure events
 */

describe('PaymentEventHandler Integration Tests', () => {
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let testTicketTypeId: string;
  let testOrderId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testVenueId = uuidv4();
    testEventId = uuidv4();
    testTicketTypeId = uuidv4();
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
      [testVenueId, testTenantId, 'Test Venue', `venue-${testVenueId.substring(0, 8)}`, 'venue@test.com', '123 Test St', 'Test City', 'CA', 'US', 'theater', 1000, testUserId]
    );

    // 4. Create event
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `event-${testEventId.substring(0, 8)}`, 'PUBLISHED', testUserId]
    );

    // 5. Create ticket type
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
      [testTicketTypeId, testTenantId, testEventId, 'GA', 50.00, 100, 100]
    );

    // 6. Create order
    await DatabaseService.query(
      `INSERT INTO orders (id, tenant_id, user_id, event_id, order_number, subtotal_cents, platform_fee_cents, processing_fee_cents, total_cents, ticket_quantity, status, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [testOrderId, testTenantId, testUserId, testEventId, `ORD-${Date.now()}`, 5000, 375, 145, 5520, 2, 'PENDING', 'USD']
    );
  });

  afterEach(async () => {
    await DatabaseService.query('DELETE FROM outbox WHERE aggregate_id = $1', [testOrderId]);
    await DatabaseService.query('DELETE FROM orders WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM ticket_types WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM events WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM venues WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  });

  afterAll(async () => {
    await DatabaseService.close();
  });

  describe('handlePaymentSucceeded', () => {
    it('should update order status to PAID', async () => {
      await PaymentEventHandler.handlePaymentSucceeded(testOrderId, 'pi_test123');

      const result = await DatabaseService.query(
        'SELECT status FROM orders WHERE id = $1',
        [testOrderId]
      );

      expect(result.rows[0].status).toBe('PAID');
    });

    it('should set payment intent ID', async () => {
      const paymentId = 'pi_abc123';

      await PaymentEventHandler.handlePaymentSucceeded(testOrderId, paymentId);

      const result = await DatabaseService.query(
        'SELECT payment_intent_id FROM orders WHERE id = $1',
        [testOrderId]
      );

      expect(result.rows[0].payment_intent_id).toBe(paymentId);
    });

    it('should update timestamp', async () => {
      const before = new Date();

      await PaymentEventHandler.handlePaymentSucceeded(testOrderId, 'pi_test123');

      const result = await DatabaseService.query(
        'SELECT updated_at FROM orders WHERE id = $1',
        [testOrderId]
      );

      const updatedAt = new Date(result.rows[0].updated_at);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should queue NFT minting job', async () => {
      const publishSpy = jest.spyOn(QueueService, 'publish').mockResolvedValue(undefined);

      await PaymentEventHandler.handlePaymentSucceeded(testOrderId, 'pi_test123');

      expect(publishSpy).toHaveBeenCalledWith(
        'ticket.mint',
        expect.objectContaining({
          orderId: testOrderId,
          eventId: testEventId
        })
      );

      publishSpy.mockRestore();
    });

    it('should include quantity in mint job', async () => {
      const publishSpy = jest.spyOn(QueueService, 'publish').mockResolvedValue(undefined);

      await PaymentEventHandler.handlePaymentSucceeded(testOrderId, 'pi_test123');

      const call = publishSpy.mock.calls[0];
      expect(call[1]).toHaveProperty('quantity', 2);

      publishSpy.mockRestore();
    });

    it('should write event to outbox', async () => {
      const publishSpy = jest.spyOn(QueueService, 'publish').mockResolvedValue(undefined);

      await PaymentEventHandler.handlePaymentSucceeded(testOrderId, 'pi_test123');

      const result = await DatabaseService.query(
        'SELECT * FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].aggregate_type).toBe('order');
      expect(result.rows[0].event_type).toBe('order.paid');

      publishSpy.mockRestore();
    });

    it('should include payload in outbox', async () => {
      const publishSpy = jest.spyOn(QueueService, 'publish').mockResolvedValue(undefined);

      await PaymentEventHandler.handlePaymentSucceeded(testOrderId, 'pi_test123');

      const result = await DatabaseService.query(
        'SELECT payload FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      const payload = typeof result.rows[0].payload === 'string'
        ? JSON.parse(result.rows[0].payload)
        : result.rows[0].payload;

      expect(payload).toHaveProperty('orderId', testOrderId);
      expect(payload).toHaveProperty('eventId', testEventId);

      publishSpy.mockRestore();
    });

    it('should throw error if order not found', async () => {
      await expect(
        PaymentEventHandler.handlePaymentSucceeded(uuidv4(), 'pi_test123')
      ).rejects.toThrow('not found');
    });

    it('should handle transaction atomically', async () => {
      const publishSpy = jest.spyOn(QueueService, 'publish').mockResolvedValue(undefined);

      await PaymentEventHandler.handlePaymentSucceeded(testOrderId, 'pi_test123');

      const orderResult = await DatabaseService.query(
        'SELECT status FROM orders WHERE id = $1',
        [testOrderId]
      );
      const outboxResult = await DatabaseService.query(
        'SELECT * FROM outbox WHERE aggregate_id = $1',
        [testOrderId]
      );

      expect(orderResult.rows[0].status).toBe('PAID');
      expect(outboxResult.rows.length).toBe(1);

      publishSpy.mockRestore();
    });

    it('should include timestamp in mint job', async () => {
      const before = new Date();
      const publishSpy = jest.spyOn(QueueService, 'publish').mockResolvedValue(undefined);

      await PaymentEventHandler.handlePaymentSucceeded(testOrderId, 'pi_test123');

      const call = publishSpy.mock.calls[0];
      const timestamp = new Date(call[1].timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());

      publishSpy.mockRestore();
    });

    it('should handle order with different quantities', async () => {
      await DatabaseService.query(
        'UPDATE orders SET ticket_quantity = $1 WHERE id = $2',
        [5, testOrderId]
      );

      const publishSpy = jest.spyOn(QueueService, 'publish').mockResolvedValue(undefined);

      await PaymentEventHandler.handlePaymentSucceeded(testOrderId, 'pi_test123');

      const call = publishSpy.mock.calls[0];
      expect(call[1].quantity).toBe(5);

      publishSpy.mockRestore();
    });

    it('should handle payment with special characters in ID', async () => {
      const specialId = 'pi_1A2B3C_test-payment_123';
      const publishSpy = jest.spyOn(QueueService, 'publish').mockResolvedValue(undefined);

      await PaymentEventHandler.handlePaymentSucceeded(testOrderId, specialId);

      const result = await DatabaseService.query(
        'SELECT payment_intent_id FROM orders WHERE id = $1',
        [testOrderId]
      );

      expect(result.rows[0].payment_intent_id).toBe(specialId);

      publishSpy.mockRestore();
    });
  });

  describe('handlePaymentFailed', () => {
    it('should update order status to PAYMENT_FAILED', async () => {
      await PaymentEventHandler.handlePaymentFailed(testOrderId, 'Insufficient funds');

      const result = await DatabaseService.query(
        'SELECT status FROM orders WHERE id = $1',
        [testOrderId]
      );

      expect(result.rows[0].status).toBe('PAYMENT_FAILED');
    });

    it('should update timestamp on failure', async () => {
      const before = new Date();

      await PaymentEventHandler.handlePaymentFailed(testOrderId, 'Card declined');

      const result = await DatabaseService.query(
        'SELECT updated_at FROM orders WHERE id = $1',
        [testOrderId]
      );

      const updatedAt = new Date(result.rows[0].updated_at);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should handle various failure reasons', async () => {
      const reasons = [
        'Insufficient funds',
        'Card declined',
        'Expired card',
        'Invalid CVV',
        'Processing error'
      ];

      for (const reason of reasons) {
        // Reset order status
        await DatabaseService.query(
          'UPDATE orders SET status = $1 WHERE id = $2',
          ['PENDING', testOrderId]
        );

        await PaymentEventHandler.handlePaymentFailed(testOrderId, reason);

        const result = await DatabaseService.query(
          'SELECT status FROM orders WHERE id = $1',
          [testOrderId]
        );

        expect(result.rows[0].status).toBe('PAYMENT_FAILED');
      }
    });

    it('should handle empty reason', async () => {
      await expect(
        PaymentEventHandler.handlePaymentFailed(testOrderId, '')
      ).resolves.not.toThrow();
    });

    it('should preserve other order fields on failure', async () => {
      const originalTotal = await DatabaseService.query(
        'SELECT total_cents, ticket_quantity FROM orders WHERE id = $1',
        [testOrderId]
      );

      await PaymentEventHandler.handlePaymentFailed(testOrderId, 'Test');

      const afterFailure = await DatabaseService.query(
        'SELECT total_cents, ticket_quantity FROM orders WHERE id = $1',
        [testOrderId]
      );

      expect(afterFailure.rows[0].total_cents).toBe(originalTotal.rows[0].total_cents);
      expect(afterFailure.rows[0].ticket_quantity).toBe(originalTotal.rows[0].ticket_quantity);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined order ID', async () => {
      await expect(
        PaymentEventHandler.handlePaymentSucceeded(undefined as any, 'pi_test123')
      ).rejects.toThrow();
    });

    it('should handle malformed order ID', async () => {
      await expect(
        PaymentEventHandler.handlePaymentSucceeded('invalid-uuid', 'pi_test123')
      ).rejects.toThrow();
    });
  });
});
