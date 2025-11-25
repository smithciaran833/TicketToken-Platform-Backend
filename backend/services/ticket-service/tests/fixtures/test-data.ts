import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Test Data Fixtures - FIXED VERSION
 * 
 * IMPORTANT: 
 * - Uses EXISTING venue (owned by venue-service)
 * - Creates event with CORRECT schema
 * - Only creates data that ticket-service owns
 */

// Default tenant for all tests
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Test User IDs
export const TEST_USERS = {
  BUYER_1: uuidv4(),
  BUYER_2: uuidv4(),
  ADMIN: uuidv4(),
  VENUE_MANAGER: uuidv4(),
  VALIDATOR: uuidv4(),
};

// Use EXISTING venue (don't create - owned by venue-service)
export const TEST_VENUE = {
  id: '4eb55219-c3e2-4bec-8035-8bec590b4765',
};

// Test Event (we'll create this - owned by event-service but needed for tests)
export const TEST_EVENT = {
  id: uuidv4(),
  tenant_id: DEFAULT_TENANT_ID,
  venue_id: TEST_VENUE.id,
  name: 'Test Concert Event',
  slug: `test-concert-${Date.now()}`,
  event_type: 'single',
  status: 'PUBLISHED',
  visibility: 'PUBLIC',
};

// Test Ticket Types (owned by ticket-service)
export const TEST_TICKET_TYPES = {
  GA: {
    id: uuidv4(),
    tenant_id: DEFAULT_TENANT_ID,
    event_id: TEST_EVENT.id,
    name: 'General Admission',
    description: 'Standard entry ticket',
    price_cents: 5000, // $50.00
    quantity: 100,
    available_quantity: 100,
    reserved_quantity: 0,
    sold_quantity: 0,
    max_per_purchase: 4,
    min_per_purchase: 1,
    sale_start_date: new Date('2025-01-01T00:00:00Z'),
    sale_end_date: new Date('2025-12-31T23:59:59Z'),
    is_active: true,
    display_order: 1,
  },
  VIP: {
    id: uuidv4(),
    tenant_id: DEFAULT_TENANT_ID,
    event_id: TEST_EVENT.id,
    name: 'VIP',
    description: 'VIP access with premium seating',
    price_cents: 15000, // $150.00
    quantity: 50,
    available_quantity: 50,
    reserved_quantity: 0,
    sold_quantity: 0,
    max_per_purchase: 2,
    min_per_purchase: 1,
    sale_start_date: new Date('2025-01-01T00:00:00Z'),
    sale_end_date: new Date('2025-12-31T23:59:59Z'),
    is_active: true,
    display_order: 0,
  },
};

// Test Discount
export const TEST_DISCOUNT = {
  id: uuidv4(),
  tenant_id: DEFAULT_TENANT_ID,
  code: 'TEST10',
  description: '10% off test discount',
  type: 'percentage',
  value_cents: 0,
  value_percentage: 10.0,
  priority: 100,
  stackable: true,
  max_uses: 100,
  current_uses: 0,
  max_uses_per_user: 1,
  min_purchase_cents: 1000,
  max_discount_cents: 5000,
  valid_from: new Date('2025-01-01T00:00:00Z'),
  valid_until: new Date('2025-12-31T23:59:59Z'),
  event_id: TEST_EVENT.id,
  active: true,
};

/**
 * Database Setup Helper
 */
export class TestDataHelper {
  constructor(private pool: Pool) {}

  /**
   * Insert all base test data
   */
  async seedDatabase(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // DON'T insert venue - it already exists!

      // Insert event (minimal required fields based on actual schema)
      await client.query(
        `INSERT INTO events (
          id, tenant_id, venue_id, name, slug, 
          event_type, status, visibility
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING`,
        [
          TEST_EVENT.id,
          TEST_EVENT.tenant_id,
          TEST_EVENT.venue_id,
          TEST_EVENT.name,
          TEST_EVENT.slug,
          TEST_EVENT.event_type,
          TEST_EVENT.status,
          TEST_EVENT.visibility,
        ]
      );

      // Insert ticket types
      for (const ticketType of Object.values(TEST_TICKET_TYPES)) {
        await client.query(
          `INSERT INTO ticket_types (
            id, tenant_id, event_id, name, description,
            price_cents, quantity, available_quantity,
            reserved_quantity, sold_quantity,
            max_per_purchase, min_per_purchase,
            sale_start_date, sale_end_date,
            is_active, display_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO NOTHING`,
          [
            ticketType.id,
            ticketType.tenant_id,
            ticketType.event_id,
            ticketType.name,
            ticketType.description,
            ticketType.price_cents,
            ticketType.quantity,
            ticketType.available_quantity,
            ticketType.reserved_quantity,
            ticketType.sold_quantity,
            ticketType.max_per_purchase,
            ticketType.min_per_purchase,
            ticketType.sale_start_date,
            ticketType.sale_end_date,
            ticketType.is_active,
            ticketType.display_order,
          ]
        );
      }

      // Insert discount
      await client.query(
        `INSERT INTO discounts (
          id, tenant_id, code, description, type,
          value_cents, value_percentage, priority, stackable,
          max_uses, current_uses, max_uses_per_user,
          min_purchase_cents, max_discount_cents,
          valid_from, valid_until, event_id, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (code) DO NOTHING`,
        [
          TEST_DISCOUNT.id,
          TEST_DISCOUNT.tenant_id,
          TEST_DISCOUNT.code,
          TEST_DISCOUNT.description,
          TEST_DISCOUNT.type,
          TEST_DISCOUNT.value_cents,
          TEST_DISCOUNT.value_percentage,
          TEST_DISCOUNT.priority,
          TEST_DISCOUNT.stackable,
          TEST_DISCOUNT.max_uses,
          TEST_DISCOUNT.current_uses,
          TEST_DISCOUNT.max_uses_per_user,
          TEST_DISCOUNT.min_purchase_cents,
          TEST_DISCOUNT.max_discount_cents,
          TEST_DISCOUNT.valid_from,
          TEST_DISCOUNT.valid_until,
          TEST_DISCOUNT.event_id,
          TEST_DISCOUNT.active,
        ]
      );

      await client.query('COMMIT');
      console.log('✅ Test data seeded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to seed test data:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clean up all test data
   */
  async cleanDatabase(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Delete in reverse order of dependencies
      await client.query('DELETE FROM ticket_validations WHERE ticket_id IN (SELECT id FROM tickets WHERE tenant_id = $1)', [DEFAULT_TENANT_ID]);
      await client.query('DELETE FROM ticket_transfers WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
      await client.query('DELETE FROM qr_codes WHERE ticket_id IN (SELECT id FROM tickets WHERE tenant_id = $1)', [DEFAULT_TENANT_ID]);
      await client.query('DELETE FROM tickets WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
      await client.query('DELETE FROM order_discounts WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = $1)', [DEFAULT_TENANT_ID]);
      await client.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = $1)', [DEFAULT_TENANT_ID]);
      await client.query('DELETE FROM orders WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
      await client.query('DELETE FROM reservation_history WHERE reservation_id IN (SELECT id FROM reservations WHERE tenant_id = $1)', [DEFAULT_TENANT_ID]);
      await client.query('DELETE FROM reservations WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
      await client.query('DELETE FROM discounts WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
      await client.query('DELETE FROM ticket_types WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
      await client.query('DELETE FROM events WHERE id = $1', [TEST_EVENT.id]); // Clean our test event
      // DON'T delete venue - we didn't create it!

      await client.query('COMMIT');
      console.log('✅ Test data cleaned successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to clean test data:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a test order
   */
  async createTestOrder(userId: string, customData?: Partial<any>): Promise<any> {
    const orderId = uuidv4();
    const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;

    const orderData = {
      id: orderId,
      tenant_id: DEFAULT_TENANT_ID,
      user_id: userId,
      event_id: TEST_EVENT.id,
      order_number: orderNumber,
      status: 'PENDING',
      subtotal_cents: 5000,
      platform_fee_cents: 375,
      processing_fee_cents: 145,
      tax_cents: 0,
      discount_cents: 0,
      total_cents: 5520,
      ticket_quantity: 1,
      currency: 'USD',
      ...customData,
    };

    await this.pool.query(
      `INSERT INTO orders (
        id, tenant_id, user_id, event_id, order_number,
        status, subtotal_cents, platform_fee_cents,
        processing_fee_cents, tax_cents, discount_cents,
        total_cents, ticket_quantity, currency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        orderData.id,
        orderData.tenant_id,
        orderData.user_id,
        orderData.event_id,
        orderData.order_number,
        orderData.status,
        orderData.subtotal_cents,
        orderData.platform_fee_cents,
        orderData.processing_fee_cents,
        orderData.tax_cents,
        orderData.discount_cents,
        orderData.total_cents,
        orderData.ticket_quantity,
        orderData.currency,
      ]
    );

    return orderData;
  }

  /**
   * Create a test ticket
   */
  async createTestTicket(userId: string, customData?: Partial<any>): Promise<any> {
    const ticketId = uuidv4();

    const ticketData = {
      id: ticketId,
      tenant_id: DEFAULT_TENANT_ID,
      event_id: TEST_EVENT.id,
      ticket_type_id: TEST_TICKET_TYPES.GA.id,
      user_id: userId,
      status: 'SOLD',
      price_cents: 5000,
      is_transferable: true,
      transfer_count: 0,
      ...customData,
    };

    await this.pool.query(
      `INSERT INTO tickets (
        id, tenant_id, event_id, ticket_type_id,
        user_id, status, price_cents,
        is_transferable, transfer_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ticketData.id,
        ticketData.tenant_id,
        ticketData.event_id,
        ticketData.ticket_type_id,
        ticketData.user_id,
        ticketData.status,
        ticketData.price_cents,
        ticketData.is_transferable,
        ticketData.transfer_count,
      ]
    );

    return ticketData;
  }

  /**
   * Create a test reservation
   */
  async createTestReservation(userId: string, customData?: Partial<any>): Promise<any> {
    const reservationId = uuidv4();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const reservationData = {
      id: reservationId,
      tenant_id: DEFAULT_TENANT_ID,
      user_id: userId,
      event_id: TEST_EVENT.id,
      ticket_type_id: TEST_TICKET_TYPES.GA.id,
      total_quantity: 2,
      tickets: JSON.stringify([
        { ticketTypeId: TEST_TICKET_TYPES.GA.id, quantity: 2 }
      ]),
      status: 'ACTIVE',
      expires_at: expiresAt,
      type_name: 'General Admission',
      ...customData,
    };

    await this.pool.query(
      `INSERT INTO reservations (
        id, tenant_id, user_id, event_id,
        ticket_type_id, total_quantity, tickets,
        status, expires_at, type_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        reservationData.id,
        reservationData.tenant_id,
        reservationData.user_id,
        reservationData.event_id,
        reservationData.ticket_type_id,
        reservationData.total_quantity,
        reservationData.tickets,
        reservationData.status,
        reservationData.expires_at,
        reservationData.type_name,
      ]
    );

    return reservationData;
  }

  /**
   * Get current inventory for ticket type
   */
  async getTicketTypeInventory(ticketTypeId: string): Promise<{
    quantity: number;
    available_quantity: number;
    reserved_quantity: number;
    sold_quantity: number;
  }> {
    const result = await this.pool.query(
      `SELECT quantity, available_quantity, reserved_quantity, sold_quantity
       FROM ticket_types WHERE id = $1`,
      [ticketTypeId]
    );

    return result.rows[0];
  }

  /**
   * Reset ticket type inventory
   */
  async resetTicketTypeInventory(ticketTypeId: string): Promise<void> {
    await this.pool.query(
      `UPDATE ticket_types
       SET available_quantity = quantity,
           reserved_quantity = 0,
           sold_quantity = 0
       WHERE id = $1`,
      [ticketTypeId]
    );
  }
}

/**
 * Helper to create JWT tokens for testing
 */
export function createTestJWT(userId: string, role: string = 'user', tenantId: string = DEFAULT_TENANT_ID): string {
  const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH ||
    path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-private.pem');
  
  let privateKey: string;
  try {
    privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  } catch (error) {
    throw new Error('JWT private key not found at ' + privateKeyPath);
  }

  const payload = {
    sub: userId,
    id: userId,
    type: 'access',
    jti: crypto.randomUUID(),
    tenant_id: tenantId,
    permissions: role === 'admin' 
      ? ['admin:all', 'buy:tickets', 'view:events', 'transfer:tickets', 'manage:venue']
      : ['buy:tickets', 'view:events', 'transfer:tickets'],
    role: role,
  };

  const token = jwt.sign(payload, privateKey, {
    expiresIn: '1h',
    issuer: process.env.JWT_ISSUER || 'tickettoken-auth',
    audience: process.env.JWT_ISSUER || 'tickettoken-auth',
    algorithm: 'RS256',
    keyid: '1',
  });

  return token;
}

/**
 * Helper to wait for async operations
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
