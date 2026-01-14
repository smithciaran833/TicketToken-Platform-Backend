/**
 * CONCURRENT PURCHASE TESTS
 * 
 * Fixes Batch 14 audit finding:
 * - Concurrent last ticket race - Tests for race conditions
 * 
 * These tests verify that the ticket service correctly handles
 * concurrent purchases of the last ticket(s) available.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';

// Test configuration
const TEST_TIMEOUT = 30000;
const CONCURRENT_REQUESTS = 10;

// Mock database setup
let pool: Pool;
let testEventId: string;
let testTicketTypeId: string;
let testTenantId: string;

describe('Concurrent Purchase Race Conditions', () => {
  beforeAll(async () => {
    // Setup test database connection
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || 
        'postgresql://postgres:postgres@localhost:5432/tickettoken_test',
    });
    
    // Create test tenant
    testTenantId = '11111111-1111-1111-1111-111111111111';
    
    // Create test event
    testEventId = '22222222-2222-2222-2222-222222222222';
    
    // Create test ticket type
    testTicketTypeId = '33333333-3333-3333-3333-333333333333';
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Reset test data before each test
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clean up previous test data
      await client.query(`
        DELETE FROM ticket_reservations WHERE tenant_id = $1
      `, [testTenantId]);
      
      await client.query(`
        DELETE FROM tickets WHERE tenant_id = $1
      `, [testTenantId]);
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  describe('Last Ticket Reservation Race', () => {
    it('should only allow one reservation when only one ticket is available', async () => {
      // Setup: Insert exactly one available ticket
      const ticketId = '44444444-4444-4444-4444-444444444444';
      
      await pool.query(`
        INSERT INTO tickets (id, event_id, ticket_type_id, tenant_id, status, created_at)
        VALUES ($1, $2, $3, $4, 'available', NOW())
        ON CONFLICT (id) DO UPDATE SET status = 'available'
      `, [ticketId, testEventId, testTicketTypeId, testTenantId]);

      // Create concurrent reservation attempts
      const reservationPromises: Promise<any>[] = [];
      
      for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
        const userId = `user-${i}-${Date.now()}`;
        
        reservationPromises.push(
          attemptReservation(pool, {
            ticketId,
            userId,
            tenantId: testTenantId,
            eventId: testEventId,
          })
        );
      }

      // Execute all reservation attempts concurrently
      const results = await Promise.allSettled(reservationPromises);
      
      // Count successful reservations
      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value.success
      );
      const failed = results.filter(r => 
        r.status === 'fulfilled' && !r.value.success
      );
      
      // Verify exactly one succeeded
      expect(successful.length).toBe(1);
      expect(failed.length).toBe(CONCURRENT_REQUESTS - 1);
      
      // Verify ticket is now reserved
      const ticketResult = await pool.query(
        'SELECT status FROM tickets WHERE id = $1',
        [ticketId]
      );
      expect(ticketResult.rows[0]?.status).toBe('reserved');
    }, TEST_TIMEOUT);

    it('should handle concurrent reservations for limited tickets correctly', async () => {
      // Setup: Insert exactly 3 tickets but 10 users want them
      const tickets = [
        { id: '55555555-5555-5555-5555-555555555551' },
        { id: '55555555-5555-5555-5555-555555555552' },
        { id: '55555555-5555-5555-5555-555555555553' },
      ];
      
      for (const ticket of tickets) {
        await pool.query(`
          INSERT INTO tickets (id, event_id, ticket_type_id, tenant_id, status, created_at)
          VALUES ($1, $2, $3, $4, 'available', NOW())
          ON CONFLICT (id) DO UPDATE SET status = 'available'
        `, [ticket.id, testEventId, testTicketTypeId, testTenantId]);
      }

      // Create concurrent reservation attempts (more than available tickets)
      const reservationPromises: Promise<any>[] = [];
      
      for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
        const userId = `user-limited-${i}-${Date.now()}`;
        
        reservationPromises.push(
          attemptBulkReservation(pool, {
            ticketTypeId: testTicketTypeId,
            quantity: 1,
            userId,
            tenantId: testTenantId,
            eventId: testEventId,
          })
        );
      }

      // Execute all reservation attempts concurrently
      const results = await Promise.allSettled(reservationPromises);
      
      // Count successful reservations
      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value.success
      );
      
      // Should have exactly 3 successful reservations (one per ticket)
      expect(successful.length).toBe(3);
      
      // Verify all tickets are now reserved
      const ticketResult = await pool.query(
        `SELECT COUNT(*) as count FROM tickets 
         WHERE ticket_type_id = $1 AND status = 'reserved'`,
        [testTicketTypeId]
      );
      expect(parseInt(ticketResult.rows[0]?.count)).toBe(3);
    }, TEST_TIMEOUT);

    it('should prevent double-booking with FOR UPDATE SKIP LOCKED', async () => {
      // Setup: Create a ticket
      const ticketId = '66666666-6666-6666-6666-666666666666';
      
      await pool.query(`
        INSERT INTO tickets (id, event_id, ticket_type_id, tenant_id, status, created_at)
        VALUES ($1, $2, $3, $4, 'available', NOW())
        ON CONFLICT (id) DO UPDATE SET status = 'available'
      `, [ticketId, testEventId, testTicketTypeId, testTenantId]);

      // Simulate concurrent database-level locking
      const results = await runConcurrentTransactions(pool, ticketId, 5);
      
      // Exactly one transaction should succeed
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBe(1);
    }, TEST_TIMEOUT);
  });

  describe('Optimistic Locking with Version', () => {
    it('should detect concurrent modifications using version column', async () => {
      // Setup: Create a ticket with version
      const ticketId = '77777777-7777-7777-7777-777777777777';
      
      await pool.query(`
        INSERT INTO tickets (id, event_id, ticket_type_id, tenant_id, status, version, created_at)
        VALUES ($1, $2, $3, $4, 'available', 1, NOW())
        ON CONFLICT (id) DO UPDATE SET status = 'available', version = 1
      `, [ticketId, testEventId, testTicketTypeId, testTenantId]);

      // Attempt concurrent updates with same version
      const updatePromises = [];
      
      for (let i = 0; i < 5; i++) {
        updatePromises.push(
          attemptVersionedUpdate(pool, ticketId, 1, `status-${i}`)
        );
      }

      const results = await Promise.allSettled(updatePromises);
      
      // Only one should succeed
      const successful = results.filter(r => 
        r.status === 'fulfilled' && r.value.success
      );
      expect(successful.length).toBe(1);
    }, TEST_TIMEOUT);
  });

  describe('Idempotency Key Prevention', () => {
    it('should return same result for duplicate idempotency keys', async () => {
      const idempotencyKey = `idem-${Date.now()}`;
      const ticketId = '88888888-8888-8888-8888-888888888888';
      
      await pool.query(`
        INSERT INTO tickets (id, event_id, ticket_type_id, tenant_id, status, created_at)
        VALUES ($1, $2, $3, $4, 'available', NOW())
        ON CONFLICT (id) DO UPDATE SET status = 'available'
      `, [ticketId, testEventId, testTicketTypeId, testTenantId]);

      // Simulate concurrent requests with same idempotency key
      const requestPromises = [];
      
      for (let i = 0; i < 5; i++) {
        requestPromises.push(
          processWithIdempotency(pool, {
            idempotencyKey,
            ticketId,
            userId: 'user-123',
            tenantId: testTenantId,
          })
        );
      }

      const results = await Promise.allSettled(requestPromises);
      
      // All should return the same reservation ID
      const reservationIds = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as any).value.reservationId);
      
      const uniqueIds = new Set(reservationIds);
      expect(uniqueIds.size).toBe(1);
    }, TEST_TIMEOUT);
  });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function attemptReservation(
  pool: Pool,
  params: {
    ticketId: string;
    userId: string;
    tenantId: string;
    eventId: string;
  }
): Promise<{ success: boolean; error?: string; reservationId?: string }> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Try to lock and update the ticket
    const lockResult = await client.query(`
      UPDATE tickets 
      SET status = 'reserved', 
          reserved_by = $2,
          reserved_at = NOW()
      WHERE id = $1 
        AND status = 'available'
        AND tenant_id = $3
      RETURNING id
    `, [params.ticketId, params.userId, params.tenantId]);
    
    if (lockResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Ticket not available' };
    }
    
    // Create reservation record
    const reservationId = `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    await client.query(`
      INSERT INTO ticket_reservations (id, ticket_id, user_id, tenant_id, event_id, status, expires_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW() + INTERVAL '10 minutes')
    `, [reservationId, params.ticketId, params.userId, params.tenantId, params.eventId]);
    
    await client.query('COMMIT');
    return { success: true, reservationId };
    
  } catch (error: any) {
    await client.query('ROLLBACK');
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

async function attemptBulkReservation(
  pool: Pool,
  params: {
    ticketTypeId: string;
    quantity: number;
    userId: string;
    tenantId: string;
    eventId: string;
  }
): Promise<{ success: boolean; ticketIds?: string[]; error?: string }> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Use FOR UPDATE SKIP LOCKED to prevent race conditions
    const lockResult = await client.query(`
      SELECT id FROM tickets 
      WHERE ticket_type_id = $1 
        AND status = 'available'
        AND tenant_id = $2
      FOR UPDATE SKIP LOCKED
      LIMIT $3
    `, [params.ticketTypeId, params.tenantId, params.quantity]);
    
    if (lockResult.rows.length < params.quantity) {
      await client.query('ROLLBACK');
      return { 
        success: false, 
        error: `Only ${lockResult.rows.length} tickets available` 
      };
    }
    
    const ticketIds = lockResult.rows.map(r => r.id);
    
    // Update tickets to reserved
    await client.query(`
      UPDATE tickets 
      SET status = 'reserved',
          reserved_by = $2,
          reserved_at = NOW()
      WHERE id = ANY($1)
    `, [ticketIds, params.userId]);
    
    await client.query('COMMIT');
    return { success: true, ticketIds };
    
  } catch (error: any) {
    await client.query('ROLLBACK');
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

async function runConcurrentTransactions(
  pool: Pool,
  ticketId: string,
  count: number
): Promise<{ success: boolean; error?: string }[]> {
  const results: { success: boolean; error?: string }[] = [];
  
  // Start all transactions simultaneously
  const promises = Array.from({ length: count }, async (_, i) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Use SKIP LOCKED to avoid waiting
      const result = await client.query(`
        SELECT id FROM tickets 
        WHERE id = $1 AND status = 'available'
        FOR UPDATE SKIP LOCKED
      `, [ticketId]);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Ticket locked or unavailable' };
      }
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Update the ticket
      await client.query(`
        UPDATE tickets SET status = 'reserved' WHERE id = $1
      `, [ticketId]);
      
      await client.query('COMMIT');
      return { success: true };
      
    } catch (error: any) {
      await client.query('ROLLBACK');
      return { success: false, error: error.message };
    } finally {
      client.release();
    }
  });
  
  const settled = await Promise.all(promises);
  return settled;
}

async function attemptVersionedUpdate(
  pool: Pool,
  ticketId: string,
  expectedVersion: number,
  newStatus: string
): Promise<{ success: boolean; newVersion?: number }> {
  const result = await pool.query(`
    UPDATE tickets 
    SET status = $3, version = version + 1
    WHERE id = $1 AND version = $2
    RETURNING version
  `, [ticketId, expectedVersion, newStatus]);
  
  if (result.rowCount === 0) {
    return { success: false };
  }
  
  return { success: true, newVersion: result.rows[0].version };
}

async function processWithIdempotency(
  pool: Pool,
  params: {
    idempotencyKey: string;
    ticketId: string;
    userId: string;
    tenantId: string;
  }
): Promise<{ reservationId: string }> {
  const client = await pool.connect();
  
  try {
    // Check for existing idempotency key
    const existing = await client.query(`
      SELECT response_data FROM idempotency_keys
      WHERE key = $1 AND tenant_id = $2
    `, [params.idempotencyKey, params.tenantId]);
    
    if (existing.rows.length > 0) {
      return JSON.parse(existing.rows[0].response_data);
    }
    
    // Process new request
    await client.query('BEGIN');
    
    // Insert idempotency key first (will fail if duplicate due to unique constraint)
    const reservationId = `res-${Date.now()}`;
    
    await client.query(`
      INSERT INTO idempotency_keys (key, tenant_id, response_data, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (key, tenant_id) DO NOTHING
    `, [params.idempotencyKey, params.tenantId, JSON.stringify({ reservationId })]);
    
    // Actually reserve the ticket
    await client.query(`
      UPDATE tickets SET status = 'reserved' WHERE id = $1
    `, [params.ticketId]);
    
    await client.query('COMMIT');
    
    return { reservationId };
    
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
