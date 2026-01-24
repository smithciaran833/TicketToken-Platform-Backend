/**
 * Event Cancellation Service Integration Tests
 *
 * Tests cancellation business logic with a real PostgreSQL database.
 * Verifies:
 * - Basic cancellation (status, timestamps, reason)
 * - Transaction integrity (all-or-nothing)
 * - Validation rules (can't cancel certain statuses)
 * - Capacity updates (deactivation)
 * - Audit log creation
 * - Cancellation report generation
 * - Tenant isolation via RLS
 */

import { Pool } from 'pg';
import {
  setupTestContainers,
  teardownTestContainers,
  getDbPool,
  TEST_DATA,
} from '../setup/testcontainers';
import {
  clearDatabase,
  createMockEvent,
  createMockCapacity,
  createMockPricing,
  insertEvent,
  insertCapacity,
  insertPricing,
  withTenantContext,
  withSystemContext,
} from '../setup/test-helpers';

// Increase timeout for container startup and teardown
jest.setTimeout(240000);

describe('Event Cancellation Service Integration Tests', () => {
  let pool: Pool;

  beforeAll(async () => {
    const containers = await setupTestContainers();
    pool = containers.dbPool;
  });

  afterAll(async () => {
    await teardownTestContainers();
  }, 300000); // 5 minute timeout for teardown

  beforeEach(async () => {
    await clearDatabase(pool);
  });

  describe('Basic Cancellation', () => {
    it('should cancel event and update status to CANCELLED', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      // Cancel the event
      const cancelled = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE events
           SET status = 'CANCELLED',
               cancelled_at = NOW(),
               cancelled_by = $1,
               cancellation_reason = $2
           WHERE id = $3 AND status NOT IN ('CANCELLED', 'COMPLETED')
           RETURNING *`,
          [TEST_DATA.USER_1_ID, 'Venue unavailable', createdEvent.id]
        );
        return result.rows[0];
      });

      expect(cancelled).toBeDefined();
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancelled_at).toBeDefined();
      expect(cancelled.cancelled_by).toBe(TEST_DATA.USER_1_ID);
      expect(cancelled.cancellation_reason).toBe('Venue unavailable');
    });

    it('should set cancelled_at timestamp on cancellation', async () => {
      const event = createMockEvent({ status: 'PUBLISHED' });
      const createdEvent = await insertEvent(pool, event);

      const beforeCancel = new Date();

      const cancelled = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE events
           SET status = 'CANCELLED', cancelled_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      const afterCancel = new Date();
      const cancelledAt = new Date(cancelled.cancelled_at);

      expect(cancelledAt.getTime()).toBeGreaterThanOrEqual(beforeCancel.getTime() - 1000);
      expect(cancelledAt.getTime()).toBeLessThanOrEqual(afterCancel.getTime() + 1000);
    });

    it('should store cancelled_by user ID', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const cancelled = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE events
           SET status = 'CANCELLED', cancelled_at = NOW(), cancelled_by = $1
           WHERE id = $2
           RETURNING *`,
          [TEST_DATA.USER_1_ID, createdEvent.id]
        );
        return result.rows[0];
      });

      expect(cancelled.cancelled_by).toBe(TEST_DATA.USER_1_ID);
    });

    it('should store cancellation_reason', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const reason = 'Artist illness - event rescheduled';

      const cancelled = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE events
           SET status = 'CANCELLED',
               cancelled_at = NOW(),
               cancellation_reason = $1
           WHERE id = $2
           RETURNING *`,
          [reason, createdEvent.id]
        );
        return result.rows[0];
      });

      expect(cancelled.cancellation_reason).toBe(reason);
    });

    it('should create audit log entry on cancellation', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      // Cancel and create audit log in transaction
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query('BEGIN');

        await client.query(
          `UPDATE events SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
          [createdEvent.id]
        );

        await client.query(
          `INSERT INTO event_audit_log (tenant_id, event_id, action, actor_id, details)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'EVENT_CANCELLED',
            TEST_DATA.USER_1_ID,
            JSON.stringify({ reason: 'Test cancellation', refundPolicy: 'full' }),
          ]
        );

        await client.query('COMMIT');
      });

      // Verify audit log entry
      const auditLog = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_audit_log WHERE event_id = $1 AND action = $2`,
          [createdEvent.id, 'EVENT_CANCELLED']
        );
        return result.rows[0];
      });

      expect(auditLog).toBeDefined();
      expect(auditLog.action).toBe('EVENT_CANCELLED');
      expect(auditLog.actor_id).toBe(TEST_DATA.USER_1_ID);
      // PostgreSQL returns JSONB as a parsed object
      const details = typeof auditLog.details === 'string' ? JSON.parse(auditLog.details) : auditLog.details;
      expect(details.reason).toBe('Test cancellation');
    });
  });

  describe('Transaction Integrity', () => {
    it('should commit all cancellation updates in one transaction', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const capacity = createMockCapacity(createdEvent.id, {
        total_capacity: 100,
        available_capacity: 50,
        sold_count: 50,
      });
      await insertCapacity(pool, capacity);

      // Execute all updates in transaction
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query('BEGIN');

        // Update event status
        await client.query(
          `UPDATE events SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
          [createdEvent.id]
        );

        // Update capacity
        await client.query(
          `UPDATE event_capacity SET available_capacity = 0, is_active = false WHERE event_id = $1`,
          [createdEvent.id]
        );

        // Create audit log
        await client.query(
          `INSERT INTO event_audit_log (tenant_id, event_id, action, actor_id, details)
           VALUES ($1, $2, 'EVENT_CANCELLED', $3, '{}')`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, TEST_DATA.USER_1_ID]
        );

        await client.query('COMMIT');
      });

      // Verify all changes committed
      const finalEvent = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [createdEvent.id]);
        return result.rows[0];
      });

      const finalCapacity = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_capacity WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      const auditLog = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_audit_log WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      expect(finalEvent.status).toBe('CANCELLED');
      expect(finalCapacity.is_active).toBe(false);
      expect(finalCapacity.available_capacity).toBe(0);
      expect(auditLog).toBeDefined();
    });

    it('should rollback all changes if transaction fails', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const capacity = createMockCapacity(createdEvent.id, {
        total_capacity: 100,
        available_capacity: 50,
        sold_count: 50,
      });
      await insertCapacity(pool, capacity);

      // Try to execute transaction with intentional error
      await expect(
        withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          await client.query('BEGIN');

          // Update event status
          await client.query(
            `UPDATE events SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
            [createdEvent.id]
          );

          // Update capacity
          await client.query(
            `UPDATE event_capacity SET available_capacity = 0, is_active = false WHERE event_id = $1`,
            [createdEvent.id]
          );

          // Force an error - reference non-existent table
          await client.query(`INSERT INTO non_existent_table (id) VALUES (1)`);

          await client.query('COMMIT');
        })
      ).rejects.toThrow();

      // Verify nothing changed
      const unchangedEvent = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [createdEvent.id]);
        return result.rows[0];
      });

      const unchangedCapacity = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_capacity WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      expect(unchangedEvent.status).toBe('ON_SALE'); // Still original status
      expect(unchangedCapacity.is_active).toBe(true);
      expect(unchangedCapacity.available_capacity).toBe(50);
    });

    it('should leave event unchanged on rollback', async () => {
      const event = createMockEvent({
        status: 'PUBLISHED',
        name: 'Original Event Name',
      });
      const createdEvent = await insertEvent(pool, event);

      // Get a dedicated client for transaction control
      const client = await pool.connect();
      try {
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TEST_DATA.TENANT_1_ID]);
        await client.query('BEGIN');
        await client.query(
          `UPDATE events SET status = 'CANCELLED', name = 'Changed Name' WHERE id = $1`,
          [createdEvent.id]
        );
        // Force rollback
        await client.query('ROLLBACK');
      } finally {
        await client.query(`SELECT set_config('app.current_tenant_id', '', false)`);
        client.release();
      }

      const unchanged = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [createdEvent.id]);
        return result.rows[0];
      });

      expect(unchanged.status).toBe('PUBLISHED');
      expect(unchanged.name).toBe('Original Event Name');
    });
  });

  describe('Validation Rules', () => {
    it('should not cancel already cancelled event', async () => {
      const event = createMockEvent({ status: 'CANCELLED' });
      const createdEvent = await insertEvent(pool, event);

      const updateResult = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE events
           SET status = 'CANCELLED', cancelled_at = NOW()
           WHERE id = $1 AND status NOT IN ('CANCELLED', 'COMPLETED')
           RETURNING *`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      expect(updateResult).toBeUndefined(); // No rows updated
    });

    it('should not cancel completed event', async () => {
      const event = createMockEvent({ status: 'COMPLETED' });
      const createdEvent = await insertEvent(pool, event);

      const updateResult = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE events
           SET status = 'CANCELLED', cancelled_at = NOW()
           WHERE id = $1 AND status NOT IN ('CANCELLED', 'COMPLETED')
           RETURNING *`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      expect(updateResult).toBeUndefined();
    });

    it('should allow cancellation from valid states', async () => {
      const validStatuses = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE', 'SOLD_OUT', 'PAUSED'];
      const timestamp = Date.now();

      for (let i = 0; i < validStatuses.length; i++) {
        const event = createMockEvent({
          status: validStatuses[i],
          slug: `event-${validStatuses[i].toLowerCase()}-${timestamp}-${i}`,
        });
        const createdEvent = await insertEvent(pool, event);

        const cancelled = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          const result = await client.query(
            `UPDATE events
             SET status = 'CANCELLED', cancelled_at = NOW()
             WHERE id = $1 AND status NOT IN ('CANCELLED', 'COMPLETED')
             RETURNING *`,
            [createdEvent.id]
          );
          return result.rows[0];
        });

        expect(cancelled).toBeDefined();
        expect(cancelled.status).toBe('CANCELLED');
      }
    });

    it('should validate cancellation can proceed using canCancel check', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      // Simulate canCancel check
      const canCancelResult = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT id, status, deleted_at
           FROM events
           WHERE id = $1
           AND deleted_at IS NULL
           AND status NOT IN ('CANCELLED', 'COMPLETED')`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      expect(canCancelResult).toBeDefined();
      expect(canCancelResult.status).toBe('ON_SALE');
    });
  });

  describe('Capacity Updates', () => {
    it('should set event_capacity.is_active = false on cancellation', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const capacity = createMockCapacity(createdEvent.id, { is_active: true });
      await insertCapacity(pool, capacity);

      // Cancel and update capacity
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query('BEGIN');
        await client.query(
          `UPDATE events SET status = 'CANCELLED' WHERE id = $1`,
          [createdEvent.id]
        );
        await client.query(
          `UPDATE event_capacity SET is_active = false WHERE event_id = $1`,
          [createdEvent.id]
        );
        await client.query('COMMIT');
      });

      const updatedCapacity = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_capacity WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      expect(updatedCapacity.is_active).toBe(false);
    });

    it('should set event_capacity.available_capacity = 0 on cancellation', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const capacity = createMockCapacity(createdEvent.id, {
        total_capacity: 100,
        available_capacity: 75,
      });
      await insertCapacity(pool, capacity);

      // Cancel and zero out available capacity
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query('BEGIN');
        await client.query(
          `UPDATE events SET status = 'CANCELLED' WHERE id = $1`,
          [createdEvent.id]
        );
        await client.query(
          `UPDATE event_capacity SET available_capacity = 0 WHERE event_id = $1`,
          [createdEvent.id]
        );
        await client.query('COMMIT');
      });

      const updatedCapacity = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_capacity WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      expect(updatedCapacity.available_capacity).toBe(0);
    });

    it('should preserve sold_count for reporting', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const soldCount = 42;
      const capacity = createMockCapacity(createdEvent.id, {
        total_capacity: 100,
        available_capacity: 58,
        sold_count: soldCount,
      });
      await insertCapacity(pool, capacity);

      // Cancel event
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query('BEGIN');
        await client.query(
          `UPDATE events SET status = 'CANCELLED' WHERE id = $1`,
          [createdEvent.id]
        );
        await client.query(
          `UPDATE event_capacity SET available_capacity = 0, is_active = false WHERE event_id = $1`,
          [createdEvent.id]
        );
        await client.query('COMMIT');
      });

      const updatedCapacity = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_capacity WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      // sold_count should be preserved
      expect(updatedCapacity.sold_count).toBe(soldCount);
      expect(updatedCapacity.is_active).toBe(false);
      expect(updatedCapacity.available_capacity).toBe(0);
    });

    it('should update all capacity sections for event', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      // Create multiple capacity sections
      const sections = [
        { section_name: 'GA', total_capacity: 500, available_capacity: 300, sold_count: 200 },
        { section_name: 'VIP', total_capacity: 100, available_capacity: 50, sold_count: 50 },
        { section_name: 'Platinum', total_capacity: 50, available_capacity: 25, sold_count: 25 },
      ];

      for (const section of sections) {
        const capacity = createMockCapacity(createdEvent.id, section);
        await insertCapacity(pool, capacity);
      }

      // Cancel and update all capacities
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query('BEGIN');
        await client.query(
          `UPDATE events SET status = 'CANCELLED' WHERE id = $1`,
          [createdEvent.id]
        );
        await client.query(
          `UPDATE event_capacity SET available_capacity = 0, is_active = false WHERE event_id = $1`,
          [createdEvent.id]
        );
        await client.query('COMMIT');
      });

      const updatedCapacities = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_capacity WHERE event_id = $1 ORDER BY section_name`,
          [createdEvent.id]
        );
        return result.rows;
      });

      expect(updatedCapacities.length).toBe(3);
      for (const cap of updatedCapacities) {
        expect(cap.is_active).toBe(false);
        expect(cap.available_capacity).toBe(0);
        // sold_count preserved
        expect(cap.sold_count).toBeGreaterThan(0);
      }
    });
  });

  describe('Cancellation Report', () => {
    it('should generate report with event details', async () => {
      const event = createMockEvent({
        status: 'ON_SALE',
        name: 'Summer Festival 2026',
      });
      const createdEvent = await insertEvent(pool, event);

      const capacity = createMockCapacity(createdEvent.id, { sold_count: 100 });
      await insertCapacity(pool, capacity);

      const pricing = createMockPricing(createdEvent.id, undefined, { base_price: 50 });
      await insertPricing(pool, pricing);

      // Cancel and generate report
      const reportId = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query('BEGIN');

        await client.query(
          `UPDATE events SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
          [createdEvent.id]
        );

        // Generate report
        const report = {
          id: crypto.randomUUID(),
          eventId: createdEvent.id,
          eventName: 'Summer Festival 2026',
          cancelledAt: new Date(),
          cancelledBy: TEST_DATA.USER_1_ID,
          reason: 'Weather concerns',
          summary: { totalTicketsSold: 100 },
        };

        await client.query(
          `INSERT INTO event_cancellation_reports (id, tenant_id, event_id, report_data)
           VALUES ($1, $2, $3, $4)`,
          [report.id, TEST_DATA.TENANT_1_ID, createdEvent.id, JSON.stringify(report)]
        );

        await client.query('COMMIT');
        return report.id;
      });

      // Retrieve report
      const storedReport = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_cancellation_reports WHERE id = $1`,
          [reportId]
        );
        return result.rows[0];
      });

      expect(storedReport).toBeDefined();
      // PostgreSQL returns JSONB as a parsed object
      const reportData = typeof storedReport.report_data === 'string'
        ? JSON.parse(storedReport.report_data)
        : storedReport.report_data;
      expect(reportData.eventName).toBe('Summer Festival 2026');
      expect(reportData.summary.totalTicketsSold).toBe(100);
    });

    it('should store ticket breakdown in report', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      // Create pricing tiers
      await insertPricing(pool, createMockPricing(createdEvent.id, undefined, {
        name: 'General Admission',
        base_price: 50,
      }));
      await insertPricing(pool, createMockPricing(createdEvent.id, undefined, {
        name: 'VIP',
        base_price: 150,
      }));

      const reportId = crypto.randomUUID();
      const ticketBreakdown = [
        { tier: 'General Admission', quantity: 80, unitPrice: 50, totalValue: 4000 },
        { tier: 'VIP', quantity: 20, unitPrice: 150, totalValue: 3000 },
      ];

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const report = {
          id: reportId,
          eventId: createdEvent.id,
          ticketBreakdown,
          summary: { totalTicketsSold: 100, totalRevenue: 7000 },
        };

        await client.query(
          `INSERT INTO event_cancellation_reports (id, tenant_id, event_id, report_data)
           VALUES ($1, $2, $3, $4)`,
          [reportId, TEST_DATA.TENANT_1_ID, createdEvent.id, JSON.stringify(report)]
        );
      });

      const storedReport = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_cancellation_reports WHERE id = $1`,
          [reportId]
        );
        return result.rows[0];
      });

      const reportData = typeof storedReport.report_data === 'string'
        ? JSON.parse(storedReport.report_data)
        : storedReport.report_data;
      expect(reportData.ticketBreakdown).toHaveLength(2);
      expect(reportData.ticketBreakdown[0].tier).toBe('General Admission');
      expect(reportData.ticketBreakdown[0].totalValue).toBe(4000);
      expect(reportData.summary.totalRevenue).toBe(7000);
    });

    it('should make report retrievable after cancellation', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const reportId = crypto.randomUUID();

      // Store report
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_cancellation_reports (id, tenant_id, event_id, report_data)
           VALUES ($1, $2, $3, $4)`,
          [
            reportId,
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            JSON.stringify({ id: reportId, reason: 'Test report' }),
          ]
        );
      });

      // Simulate getCancellationReport
      const retrieved = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT report_data FROM event_cancellation_reports
           WHERE id = $1 AND event_id = $2 AND tenant_id = $3`,
          [reportId, createdEvent.id, TEST_DATA.TENANT_1_ID]
        );
        return result.rows[0];
      });

      expect(retrieved).toBeDefined();
      const reportData = typeof retrieved.report_data === 'string'
        ? JSON.parse(retrieved.report_data)
        : retrieved.report_data;
      expect(reportData.id).toBe(reportId);
      expect(reportData.reason).toBe('Test report');
    });

    it('should include pricing information in report', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      // Create pricing tiers
      const pricingTiers = [
        { name: 'Early Bird', base_price: 40, service_fee: 5, tax_rate: 0.08 },
        { name: 'Regular', base_price: 60, service_fee: 7, tax_rate: 0.08 },
      ];

      for (const tier of pricingTiers) {
        await insertPricing(pool, createMockPricing(createdEvent.id, undefined, tier));
      }

      // Query pricing info for report
      const pricingInfo = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT name, base_price, service_fee, tax_rate
           FROM event_pricing
           WHERE event_id = $1
           ORDER BY base_price`,
          [createdEvent.id]
        );
        return result.rows;
      });

      expect(pricingInfo.length).toBe(2);
      expect(pricingInfo[0].name).toBe('Early Bird');
      expect(parseFloat(pricingInfo[0].base_price)).toBe(40);
      expect(pricingInfo[1].name).toBe('Regular');
      expect(parseFloat(pricingInfo[1].base_price)).toBe(60);
    });
  });

  describe('Tenant Isolation (RLS)', () => {
    it('should only allow tenant to cancel own events', async () => {
      // Create event for tenant 1
      const event = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        venue_id: TEST_DATA.VENUE_1_ID,
        status: 'ON_SALE',
      });
      const createdEvent = await insertEvent(pool, event);

      // Try to cancel as tenant 2
      const updateResult = await withTenantContext(pool, TEST_DATA.TENANT_2_ID, async (client) => {
        const result = await client.query(
          `UPDATE events SET status = 'CANCELLED' WHERE id = $1 RETURNING *`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      expect(updateResult).toBeUndefined(); // RLS prevents update

      // Verify event unchanged
      const unchanged = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [createdEvent.id]);
        return result.rows[0];
      });

      expect(unchanged.status).toBe('ON_SALE');
    });

    it('should not allow tenant to see other tenant cancellation reports', async () => {
      const event = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        venue_id: TEST_DATA.VENUE_1_ID,
      });
      const createdEvent = await insertEvent(pool, event);

      const reportId = crypto.randomUUID();

      // Create report for tenant 1
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_cancellation_reports (id, tenant_id, event_id, report_data)
           VALUES ($1, $2, $3, $4)`,
          [reportId, TEST_DATA.TENANT_1_ID, createdEvent.id, '{"secret": "data"}']
        );
      });

      // Try to read as tenant 2
      const tenant2Result = await withTenantContext(pool, TEST_DATA.TENANT_2_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_cancellation_reports WHERE id = $1`,
          [reportId]
        );
        return result.rows;
      });

      expect(tenant2Result.length).toBe(0);

      // Tenant 1 can read
      const tenant1Result = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_cancellation_reports WHERE id = $1`,
          [reportId]
        );
        return result.rows[0];
      });

      expect(tenant1Result).toBeDefined();
    });

    it('should not allow tenant to see other tenant audit logs', async () => {
      const event = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        venue_id: TEST_DATA.VENUE_1_ID,
      });
      const createdEvent = await insertEvent(pool, event);

      // Create audit log for tenant 1
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_audit_log (tenant_id, event_id, action, actor_id, details)
           VALUES ($1, $2, 'EVENT_CANCELLED', $3, '{}')`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, TEST_DATA.USER_1_ID]
        );
      });

      // Try to read as tenant 2
      const tenant2Result = await withTenantContext(pool, TEST_DATA.TENANT_2_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_audit_log WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows;
      });

      expect(tenant2Result.length).toBe(0);
    });
  });

  describe('Audit Log Details', () => {
    it('should store refund policy in audit log', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_audit_log (tenant_id, event_id, action, actor_id, details)
           VALUES ($1, $2, 'EVENT_CANCELLED', $3, $4)`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            TEST_DATA.USER_1_ID,
            JSON.stringify({
              reason: 'Weather',
              refundPolicy: 'full',
              ticketsInvalidated: 50,
              refundsTriggered: 50,
            }),
          ]
        );
      });

      const auditLog = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_audit_log WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      const details = typeof auditLog.details === 'string'
        ? JSON.parse(auditLog.details)
        : auditLog.details;
      expect(details.refundPolicy).toBe('full');
      expect(details.ticketsInvalidated).toBe(50);
      expect(details.refundsTriggered).toBe(50);
    });

    it('should store errors in audit log details', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const errors = [
        'Failed to trigger refunds: payment service timeout',
        'Failed to notify holders: email service unavailable',
      ];

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_audit_log (tenant_id, event_id, action, actor_id, details)
           VALUES ($1, $2, 'EVENT_CANCELLED', $3, $4)`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            TEST_DATA.USER_1_ID,
            JSON.stringify({ reason: 'Cancelled', errors }),
          ]
        );
      });

      const auditLog = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_audit_log WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      const details = typeof auditLog.details === 'string'
        ? JSON.parse(auditLog.details)
        : auditLog.details;
      expect(details.errors).toEqual(errors);
    });

    it('should record timestamp of audit log entry', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const beforeInsert = new Date();

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_audit_log (tenant_id, event_id, action, actor_id, details)
           VALUES ($1, $2, 'EVENT_CANCELLED', $3, '{}')`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, TEST_DATA.USER_1_ID]
        );
      });

      const afterInsert = new Date();

      const auditLog = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_audit_log WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      const createdAt = new Date(auditLog.created_at);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime() - 1000);
      expect(createdAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime() + 1000);
    });
  });
});
