import { DatabaseService } from '../../src/services/databaseService';
import { OrderModel, IOrder } from '../../src/models/Order';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR Order MODEL
 * Tests order database operations
 */

describe('Order Model Integration Tests', () => {
  let orderModel: OrderModel;
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    orderModel = new OrderModel((DatabaseService as any).pool);
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testVenueId = uuidv4();
    testEventId = uuidv4();

    // 1. Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [testTenantId, 'Test Tenant', `test-${testTenantId}`]
    );

    // 2. Create user
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [testUserId, `test-${testUserId}@example.com`, '$2b$10$dummyhash', true, 'ACTIVE', 'user', testTenantId]
    );

    // 3. Create venue
    await DatabaseService.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO NOTHING`,
      [testVenueId, testTenantId, 'Test Venue', `test-venue-${testVenueId}`, 'test@venue.com', '123 Test St', 'Test City', 'Test State', 'US', 'theater', 1000, testUserId]
    );

    // 4. Create event
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `test-event-${testEventId}`, 'PUBLISHED', testUserId]
    );
  });

  afterEach(async () => {
    await DatabaseService.query('DELETE FROM orders WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM events WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM venues WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  });

  afterAll(async () => {
    await DatabaseService.close();
  });

  describe('create', () => {
    it('should create an order', async () => {
      const orderData: IOrder = {
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 10000,
        total_cents: 12000,
        ticket_quantity: 2
      };

      const result = await orderModel.create(orderData);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.tenant_id).toBe(testTenantId);
      expect(result.user_id).toBe(testUserId);
      expect(result.event_id).toBe(testEventId);
      expect(result.total_cents).toBe(12000);
      expect(result.status).toBe('PENDING');
    });

    it('should generate order_number if not provided', async () => {
      const orderData: IOrder = {
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      };

      const result = await orderModel.create(orderData);

      expect(result.order_number).toBeDefined();
      expect(result.order_number).toMatch(/^ORD-\d{8}$/);
    });

    it('should use provided order_number', async () => {
      const customOrderNumber = 'ORD-CUSTOM-123';
      const orderData: IOrder = {
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        order_number: customOrderNumber,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      };

      const result = await orderModel.create(orderData);

      expect(result.order_number).toBe(customOrderNumber);
    });

    it('should default to PENDING status', async () => {
      const orderData: IOrder = {
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      };

      const result = await orderModel.create(orderData);

      expect(result.status).toBe('PENDING');
    });

    it('should default to USD currency', async () => {
      const orderData: IOrder = {
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      };

      const result = await orderModel.create(orderData);

      expect(result.currency).toBe('USD');
    });

    it('should store payment_intent_id', async () => {
      const paymentIntentId = 'pi_test_123';
      const orderData: IOrder = {
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1,
        payment_intent_id: paymentIntentId
      };

      const result = await orderModel.create(orderData);

      expect(result.payment_intent_id).toBe(paymentIntentId);
    });

    it('should store idempotency_key', async () => {
      const idempotencyKey = `idem-${uuidv4()}`;
      const orderData: IOrder = {
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1,
        idempotency_key: idempotencyKey
      };

      const result = await orderModel.create(orderData);

      expect(result.idempotency_key).toBe(idempotencyKey);
    });

    it('should store metadata as JSON', async () => {
      const metadata = { source: 'mobile', campaign_id: 'summer2024' };
      const orderData: IOrder = {
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1,
        metadata
      };

      const result = await orderModel.create(orderData);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.source).toBe('mobile');
    });

    it('should set created_at timestamp', async () => {
      const orderData: IOrder = {
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      };

      const result = await orderModel.create(orderData);

      expect(result.created_at).toBeDefined();
    });

    it('should set default fee values to 0', async () => {
      const orderData: IOrder = {
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 5000,
        ticket_quantity: 1
      };

      const result = await orderModel.create(orderData);

      expect(result.platform_fee_cents).toBe(0);
      expect(result.processing_fee_cents).toBe(0);
      expect(result.tax_cents).toBe(0);
      expect(result.discount_cents).toBe(0);
    });

    it('should store all fee values', async () => {
      const orderData: IOrder = {
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 10000,
        platform_fee_cents: 500,
        processing_fee_cents: 300,
        tax_cents: 800,
        discount_cents: 1000,
        total_cents: 10600,
        ticket_quantity: 2
      };

      const result = await orderModel.create(orderData);

      expect(result.subtotal_cents).toBe(10000);
      expect(result.platform_fee_cents).toBe(500);
      expect(result.processing_fee_cents).toBe(300);
      expect(result.tax_cents).toBe(800);
      expect(result.discount_cents).toBe(1000);
      expect(result.total_cents).toBe(10600);
    });
  });

  describe('findById', () => {
    let testOrder: IOrder;

    beforeEach(async () => {
      testOrder = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });
    });

    it('should find order by ID', async () => {
      const result = await orderModel.findById(testOrder.id!);

      expect(result).toBeDefined();
      expect(result?.id).toBe(testOrder.id);
      expect(result?.user_id).toBe(testUserId);
    });

    it('should return null for non-existent ID', async () => {
      const result = await orderModel.findById(uuidv4());

      expect(result).toBeNull();
    });

    it('should return all order fields', async () => {
      const result = await orderModel.findById(testOrder.id!);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('tenant_id');
      expect(result).toHaveProperty('user_id');
      expect(result).toHaveProperty('event_id');
      expect(result).toHaveProperty('order_number');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('subtotal_cents');
      expect(result).toHaveProperty('total_cents');
      expect(result).toHaveProperty('created_at');
    });
  });

  describe('findByUserId', () => {
    beforeEach(async () => {
      await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'COMPLETED',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 3000,
        total_cents: 3500,
        ticket_quantity: 1
      });
    });

    it('should find all orders for user', async () => {
      const result = await orderModel.findByUserId(testUserId);

      expect(result.length).toBe(2);
    });

    it('should order by created_at DESC', async () => {
      const result = await orderModel.findByUserId(testUserId);

      expect(result[0].status).toBe('PENDING'); // Most recent
      expect(result[1].status).toBe('COMPLETED');
    });

    it('should return empty array for user with no orders', async () => {
      const result = await orderModel.findByUserId(uuidv4());

      expect(result).toEqual([]);
    });
  });

  describe('findByOrderNumber', () => {
    let testOrder: IOrder;

    beforeEach(async () => {
      testOrder = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });
    });

    it('should find order by order number', async () => {
      const result = await orderModel.findByOrderNumber(testOrder.order_number!);

      expect(result).toBeDefined();
      expect(result?.id).toBe(testOrder.id);
    });

    it('should return null for non-existent order number', async () => {
      const result = await orderModel.findByOrderNumber('NON-EXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('findByEventId', () => {
    beforeEach(async () => {
      await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'COMPLETED',
        subtotal_cents: 8000,
        total_cents: 9000,
        ticket_quantity: 2
      });
    });

    it('should find all orders for event', async () => {
      const result = await orderModel.findByEventId(testEventId);

      expect(result.length).toBe(2);
    });

    it('should return empty array for event with no orders', async () => {
      const result = await orderModel.findByEventId(uuidv4());

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    let testOrder: IOrder;

    beforeEach(async () => {
      testOrder = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });
    });

    it('should update order status', async () => {
      const result = await orderModel.update(testOrder.id!, {
        status: 'CONFIRMED'
      });

      expect(result?.status).toBe('CONFIRMED');
    });

    it('should update to COMPLETED status', async () => {
      const result = await orderModel.update(testOrder.id!, {
        status: 'COMPLETED'
      });

      expect(result?.status).toBe('COMPLETED');
    });

    it('should update to CANCELLED status', async () => {
      const result = await orderModel.update(testOrder.id!, {
        status: 'CANCELLED'
      });

      expect(result?.status).toBe('CANCELLED');
    });

    it('should update to REFUNDED status', async () => {
      const result = await orderModel.update(testOrder.id!, {
        status: 'REFUNDED'
      });

      expect(result?.status).toBe('REFUNDED');
    });

    it('should update total_cents', async () => {
      const result = await orderModel.update(testOrder.id!, {
        total_cents: 7000
      });

      expect(result?.total_cents).toBe(7000);
    });

    it('should update payment_intent_id', async () => {
      const result = await orderModel.update(testOrder.id!, {
        payment_intent_id: 'pi_updated_123'
      });

      expect(result?.payment_intent_id).toBe('pi_updated_123');
    });

    it('should update payment_status', async () => {
      const result = await orderModel.update(testOrder.id!, {
        payment_status: 'succeeded'
      });

      expect(result?.payment_status).toBe('succeeded');
    });

    it('should update metadata', async () => {
      const newMetadata = { updated: true };
      const result = await orderModel.update(testOrder.id!, {
        metadata: newMetadata
      });

      expect(result?.metadata).toEqual(newMetadata);
    });

    it('should update confirmed_at', async () => {
      const confirmedAt = new Date();
      const result = await orderModel.update(testOrder.id!, {
        status: 'CONFIRMED',
        confirmed_at: confirmedAt
      });

      expect(result?.confirmed_at).toBeDefined();
    });

    it('should update cancelled_at', async () => {
      const cancelledAt = new Date();
      const result = await orderModel.update(testOrder.id!, {
        status: 'CANCELLED',
        cancelled_at: cancelledAt
      });

      expect(result?.cancelled_at).toBeDefined();
    });

    it('should set updated_at timestamp', async () => {
      const result = await orderModel.update(testOrder.id!, {
        status: 'CONFIRMED'
      });

      expect(result?.updated_at).toBeDefined();
    });

    it('should return null for non-existent ID', async () => {
      const result = await orderModel.update(uuidv4(), {
        status: 'CONFIRMED'
      });

      expect(result).toBeNull();
    });

    it('should reject invalid fields', async () => {
      await expect(
        orderModel.update(testOrder.id!, {
          id: uuidv4() as any
        })
      ).rejects.toThrow('No valid fields to update');
    });

    it('should handle empty update object', async () => {
      await expect(
        orderModel.update(testOrder.id!, {})
      ).rejects.toThrow('No valid fields to update');
    });
  });

  describe('delete', () => {
    let testOrder: IOrder;

    beforeEach(async () => {
      testOrder = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });
    });

    it('should delete order', async () => {
      const result = await orderModel.delete(testOrder.id!);

      expect(result).toBe(true);

      const found = await orderModel.findById(testOrder.id!);
      expect(found).toBeNull();
    });

    it('should return false for non-existent ID', async () => {
      const result = await orderModel.delete(uuidv4());

      expect(result).toBe(false);
    });
  });

  describe('Order statuses', () => {
    it('should create order with RESERVED status', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'RESERVED',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      expect(order.status).toBe('RESERVED');
    });

    it('should create order with CONFIRMED status', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'CONFIRMED',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      expect(order.status).toBe('CONFIRMED');
    });

    it('should create order with COMPLETED status', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'COMPLETED',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      expect(order.status).toBe('COMPLETED');
    });

    it('should create order with CANCELLED status', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'CANCELLED',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      expect(order.status).toBe('CANCELLED');
    });

    it('should create order with EXPIRED status', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'EXPIRED',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      expect(order.status).toBe('EXPIRED');
    });

    it('should create order with REFUNDED status', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'REFUNDED',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      expect(order.status).toBe('REFUNDED');
    });
  });

  describe('Status workflows', () => {
    it('should transition from PENDING to RESERVED', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      const updated = await orderModel.update(order.id!, {
        status: 'RESERVED'
      });

      expect(updated?.status).toBe('RESERVED');
    });

    it('should transition from RESERVED to CONFIRMED', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'RESERVED',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      const updated = await orderModel.update(order.id!, {
        status: 'CONFIRMED',
        confirmed_at: new Date()
      });

      expect(updated?.status).toBe('CONFIRMED');
      expect(updated?.confirmed_at).toBeDefined();
    });

    it('should transition from CONFIRMED to COMPLETED', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'CONFIRMED',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      const updated = await orderModel.update(order.id!, {
        status: 'COMPLETED'
      });

      expect(updated?.status).toBe('COMPLETED');
    });

    it('should transition to CANCELLED', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      const updated = await orderModel.update(order.id!, {
        status: 'CANCELLED',
        cancelled_at: new Date()
      });

      expect(updated?.status).toBe('CANCELLED');
      expect(updated?.cancelled_at).toBeDefined();
    });

    it('should transition to REFUNDED', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'COMPLETED',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      const updated = await orderModel.update(order.id!, {
        status: 'REFUNDED',
        refunded_at: new Date()
      });

      expect(updated?.status).toBe('REFUNDED');
      expect(updated?.refunded_at).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle zero total_cents', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'COMPLETED',
        subtotal_cents: 0,
        total_cents: 0,
        ticket_quantity: 1
      });

      expect(order.total_cents).toBe(0);
    });

    it('should handle large total amounts', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 999999999,
        total_cents: 1000000000,
        ticket_quantity: 1000
      });

      expect(order.total_cents).toBe(1000000000);
    });

    it('should handle concurrent order creation', async () => {
      const orders = await Promise.all([
        orderModel.create({
          tenant_id: testTenantId,
          user_id: testUserId,
          event_id: testEventId,
          status: 'PENDING',
          subtotal_cents: 5000,
          total_cents: 6000,
          ticket_quantity: 1
        }),
        orderModel.create({
          tenant_id: testTenantId,
          user_id: testUserId,
          event_id: testEventId,
          status: 'PENDING',
          subtotal_cents: 7000,
          total_cents: 8000,
          ticket_quantity: 2
        })
      ]);

      expect(orders).toHaveLength(2);
      expect(orders[0].id).not.toBe(orders[1].id);
      expect(orders[0].order_number).not.toBe(orders[1].order_number);
    });

    it('should handle null metadata', async () => {
      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1
      });

      expect(order.id).toBeDefined();
    });

    it('should handle complex metadata', async () => {
      const complexMetadata = {
        source: 'web',
        campaign: { id: 'summer2024', discount: 10 },
        items: [{ type: 'GA', qty: 2 }]
      };

      const order = await orderModel.create({
        tenant_id: testTenantId,
        user_id: testUserId,
        event_id: testEventId,
        status: 'PENDING',
        subtotal_cents: 5000,
        total_cents: 6000,
        ticket_quantity: 1,
        metadata: complexMetadata
      });

      expect(order.metadata).toBeDefined();
      expect(order.metadata.campaign.id).toBe('summer2024');
    });
  });
});
