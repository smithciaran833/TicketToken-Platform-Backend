/**
 * Event Service Integration Tests
 *
 * Tests event CRUD operations with a real PostgreSQL database.
 * Verifies:
 * - Create event with all fields
 * - Optimistic locking (concurrent updates)
 * - Tenant isolation via RLS
 * - Soft delete (deleted_at set)
 * - Slug uniqueness per tenant
 * - Version auto-increment on update
 * - Blockchain status updates
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
  insertEvent,
  getEventById,
  getEventsByTenant,
  withTenantContext,
  withSystemContext,
} from '../setup/test-helpers';

// Increase timeout for container startup
jest.setTimeout(120000);

describe('EventService Integration Tests', () => {
  let pool: Pool;

  beforeAll(async () => {
    const containers = await setupTestContainers();
    pool = containers.dbPool;
  });

  afterAll(async () => {
    await teardownTestContainers();
  });

  beforeEach(async () => {
    await clearDatabase(pool);
  });

  describe('Create Event', () => {
    it('should create an event with all required fields', async () => {
      const mockEvent = createMockEvent({
        name: 'Integration Test Concert',
        description: 'A concert for testing purposes',
      });

      const created = await insertEvent(pool, mockEvent);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.name).toBe('Integration Test Concert');
      expect(created.tenant_id).toBe(TEST_DATA.TENANT_1_ID);
      expect(created.venue_id).toBe(TEST_DATA.VENUE_1_ID);
      expect(created.status).toBe('DRAFT');
      expect(created.version).toBe(1);
      expect(created.created_at).toBeDefined();
      expect(created.updated_at).toBeDefined();
      expect(created.deleted_at).toBeNull();
    });

    it('should auto-generate UUID for event id', async () => {
      const mockEvent = createMockEvent();
      const created = await insertEvent(pool, mockEvent);

      expect(created.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should set default values correctly', async () => {
      const mockEvent = createMockEvent();
      const created = await insertEvent(pool, mockEvent);

      expect(created.status).toBe('DRAFT');
      expect(created.visibility).toBe('PUBLIC');
      expect(created.is_featured).toBe(false);
      expect(created.priority_score).toBe(0);
      expect(created.view_count).toBe(0);
      expect(created.interest_count).toBe(0);
      expect(created.share_count).toBe(0);
      expect(created.version).toBe(1);
    });

    it('should store metadata as JSONB', async () => {
      const mockEvent = createMockEvent({
        metadata: {
          custom_field: 'custom_value',
          nested: { key: 'value' },
        },
      });

      const created = await insertEvent(pool, mockEvent);

      expect(created.metadata).toEqual({
        custom_field: 'custom_value',
        nested: { key: 'value' },
      });
    });
  });

  describe('Optimistic Locking', () => {
    it('should auto-increment version on update', async () => {
      const mockEvent = createMockEvent();
      const created = await insertEvent(pool, mockEvent);

      expect(created.version).toBe(1);

      // Update the event
      const updated = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE events SET name = $1 WHERE id = $2 RETURNING *`,
          ['Updated Name', created.id]
        );
        return result.rows[0];
      });

      expect(updated.version).toBe(2);
      expect(updated.name).toBe('Updated Name');
    });

    it('should increment version on each update', async () => {
      const mockEvent = createMockEvent();
      const created = await insertEvent(pool, mockEvent);

      // Multiple updates
      for (let i = 2; i <= 5; i++) {
        const updated = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          const result = await client.query(
            `UPDATE events SET name = $1 WHERE id = $2 RETURNING *`,
            [`Update ${i}`, created.id]
          );
          return result.rows[0];
        });

        expect(updated.version).toBe(i);
      }
    });

    it('should fail update when version does not match (simulated optimistic lock)', async () => {
      const mockEvent = createMockEvent();
      const created = await insertEvent(pool, mockEvent);

      // Update with correct version
      const result = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const res = await client.query(
          `UPDATE events SET name = $1 WHERE id = $2 AND version = $3 RETURNING *`,
          ['Valid Update', created.id, 1]
        );
        return res.rows[0];
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Valid Update');

      // Try update with stale version (should not match any rows)
      const staleResult = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const res = await client.query(
          `UPDATE events SET name = $1 WHERE id = $2 AND version = $3 RETURNING *`,
          ['Stale Update', created.id, 1] // Version is now 2, not 1
        );
        return res.rows[0];
      });

      expect(staleResult).toBeUndefined(); // No rows matched

      // Verify original update is preserved
      const finalEvent = await getEventById(pool, created.id, TEST_DATA.TENANT_1_ID);
      expect(finalEvent.name).toBe('Valid Update');
      expect(finalEvent.version).toBe(2);
    });
  });

  describe('Tenant Isolation (RLS)', () => {
    it('should only see events for own tenant', async () => {
      // Create event for tenant 1
      const event1 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        venue_id: TEST_DATA.VENUE_1_ID,
        name: 'Tenant 1 Event',
      });
      await insertEvent(pool, event1);

      // Create event for tenant 2
      const event2 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_2_ID,
        venue_id: TEST_DATA.VENUE_2_ID,
        name: 'Tenant 2 Event',
      });
      await insertEvent(pool, event2);

      // Query as tenant 1
      const tenant1Events = await getEventsByTenant(pool, TEST_DATA.TENANT_1_ID);
      expect(tenant1Events.length).toBe(1);
      expect(tenant1Events[0].name).toBe('Tenant 1 Event');

      // Query as tenant 2
      const tenant2Events = await getEventsByTenant(pool, TEST_DATA.TENANT_2_ID);
      expect(tenant2Events.length).toBe(1);
      expect(tenant2Events[0].name).toBe('Tenant 2 Event');
    });

    it('should not allow tenant to update another tenant events', async () => {
      // Create event for tenant 1
      const event = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        name: 'Tenant 1 Event',
      });
      const created = await insertEvent(pool, event);

      // Try to update as tenant 2 (should fail due to RLS)
      const updateResult = await withTenantContext(pool, TEST_DATA.TENANT_2_ID, async (client) => {
        const result = await client.query(
          `UPDATE events SET name = $1 WHERE id = $2 RETURNING *`,
          ['Hacked Name', created.id]
        );
        return result.rows[0];
      });

      expect(updateResult).toBeUndefined(); // RLS should prevent update

      // Verify event is unchanged
      const originalEvent = await getEventById(pool, created.id, TEST_DATA.TENANT_1_ID);
      expect(originalEvent.name).toBe('Tenant 1 Event');
    });

    it('should not allow tenant to delete another tenant events', async () => {
      // Create event for tenant 1
      const event = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        name: 'Protected Event',
      });
      const created = await insertEvent(pool, event);

      // Try to delete as tenant 2 (should fail due to RLS)
      const deleteResult = await withTenantContext(pool, TEST_DATA.TENANT_2_ID, async (client) => {
        const result = await client.query(
          `DELETE FROM events WHERE id = $1 RETURNING *`,
          [created.id]
        );
        return result.rowCount;
      });

      expect(deleteResult).toBe(0); // No rows deleted

      // Verify event still exists
      const existingEvent = await getEventById(pool, created.id, TEST_DATA.TENANT_1_ID);
      expect(existingEvent).toBeDefined();
      expect(existingEvent.name).toBe('Protected Event');
    });

    it('should allow system user to see all events', async () => {
      // Create events for both tenants
      await insertEvent(pool, createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        name: 'Tenant 1 Event',
      }));
      await insertEvent(pool, createMockEvent({
        tenant_id: TEST_DATA.TENANT_2_ID,
        venue_id: TEST_DATA.VENUE_2_ID,
        name: 'Tenant 2 Event',
      }));

      // Query as system user
      const allEvents = await withSystemContext(pool, async (client) => {
        const result = await client.query('SELECT * FROM events ORDER BY name');
        return result.rows;
      });

      expect(allEvents.length).toBe(2);
      expect(allEvents.map(e => e.name)).toContain('Tenant 1 Event');
      expect(allEvents.map(e => e.name)).toContain('Tenant 2 Event');
    });
  });

  describe('Soft Delete', () => {
    it('should set deleted_at timestamp instead of hard delete', async () => {
      const mockEvent = createMockEvent({ name: 'To Be Deleted' });
      const created = await insertEvent(pool, mockEvent);

      expect(created.deleted_at).toBeNull();

      // Soft delete
      const deleted = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE events SET deleted_at = NOW(), status = 'CANCELLED' WHERE id = $1 RETURNING *`,
          [created.id]
        );
        return result.rows[0];
      });

      expect(deleted.deleted_at).toBeDefined();
      expect(deleted.deleted_at).not.toBeNull();
      expect(deleted.status).toBe('CANCELLED');

      // Event still exists in database
      const stillExists = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM events WHERE id = $1`,
          [created.id]
        );
        return result.rows[0];
      });

      expect(stillExists).toBeDefined();
      expect(stillExists.deleted_at).not.toBeNull();
    });

    it('should preserve event data after soft delete', async () => {
      const mockEvent = createMockEvent({
        name: 'Important Event',
        description: 'Critical data that should not be lost',
      });
      const created = await insertEvent(pool, mockEvent);

      // Soft delete
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `UPDATE events SET deleted_at = NOW() WHERE id = $1`,
          [created.id]
        );
      });

      // Verify all data is preserved
      const softDeleted = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [created.id]);
        return result.rows[0];
      });

      expect(softDeleted.name).toBe('Important Event');
      expect(softDeleted.description).toBe('Critical data that should not be lost');
      expect(softDeleted.deleted_at).not.toBeNull();
    });
  });

  describe('Slug Uniqueness', () => {
    it('should enforce unique slug per tenant', async () => {
      const event1 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        slug: 'unique-event',
      });
      await insertEvent(pool, event1);

      // Try to create another event with same slug for same tenant
      const event2 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        slug: 'unique-event', // Same slug
      });

      await expect(insertEvent(pool, event2)).rejects.toThrow();
    });

    it('should allow same slug for different tenants', async () => {
      const event1 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        venue_id: TEST_DATA.VENUE_1_ID,
        slug: 'popular-event',
      });
      const created1 = await insertEvent(pool, event1);

      const event2 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_2_ID,
        venue_id: TEST_DATA.VENUE_2_ID,
        slug: 'popular-event', // Same slug, different tenant
      });
      const created2 = await insertEvent(pool, event2);

      expect(created1.slug).toBe('popular-event');
      expect(created2.slug).toBe('popular-event');
      expect(created1.tenant_id).not.toBe(created2.tenant_id);
    });

    it('should allow reusing slug after soft delete', async () => {
      const event1 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        slug: 'reusable-slug',
      });
      const created1 = await insertEvent(pool, event1);

      // Soft delete first event
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `UPDATE events SET deleted_at = NOW() WHERE id = $1`,
          [created1.id]
        );
      });

      // Should be able to create new event with same slug (due to WHERE deleted_at IS NULL in unique index)
      const event2 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        slug: 'reusable-slug',
      });
      const created2 = await insertEvent(pool, event2);

      expect(created2.slug).toBe('reusable-slug');
      expect(created2.deleted_at).toBeNull();
    });
  });

  describe('Timestamps', () => {
    it('should auto-set created_at on insert', async () => {
      const beforeInsert = new Date();
      const mockEvent = createMockEvent();
      const created = await insertEvent(pool, mockEvent);
      const afterInsert = new Date();

      const createdAt = new Date(created.created_at);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime() - 1000);
      expect(createdAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime() + 1000);
    });

    it('should auto-update updated_at on update', async () => {
      const mockEvent = createMockEvent();
      const created = await insertEvent(pool, mockEvent);
      const originalUpdatedAt = new Date(created.updated_at);

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      const updated = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE events SET name = $1 WHERE id = $2 RETURNING *`,
          ['Updated Name', created.id]
        );
        return result.rows[0];
      });

      const newUpdatedAt = new Date(updated.updated_at);
      expect(newUpdatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('Status Constraints', () => {
    it('should accept valid status values', async () => {
      const validStatuses = [
        'DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE',
        'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED'
      ];

      for (const status of validStatuses) {
        const event = createMockEvent({ status, slug: `event-${status.toLowerCase()}` });
        const created = await insertEvent(pool, event);
        expect(created.status).toBe(status);
      }
    });

    it('should reject invalid status values', async () => {
      const event = createMockEvent({ status: 'INVALID_STATUS' });
      await expect(insertEvent(pool, event)).rejects.toThrow();
    });
  });

  describe('Blockchain Status Updates', () => {
    it('should store blockchain-related fields', async () => {
      const mockEvent = createMockEvent();
      const created = await insertEvent(pool, mockEvent);

      // Update with blockchain data
      const updated = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE events SET
            collection_address = $1,
            mint_authority = $2,
            royalty_percentage = $3
          WHERE id = $4 RETURNING *`,
          [
            'DRtxGNq5VRG8nkK9WFRk8FUvJhPtWxcvkY1ZGFQZR123',
            'MiNtaUtHoRiTy123456789012345678901234567890',
            5.5,
            created.id,
          ]
        );
        return result.rows[0];
      });

      expect(updated.collection_address).toBe('DRtxGNq5VRG8nkK9WFRk8FUvJhPtWxcvkY1ZGFQZR123');
      expect(updated.mint_authority).toBe('MiNtaUtHoRiTy123456789012345678901234567890');
      expect(parseFloat(updated.royalty_percentage)).toBeCloseTo(5.5);
    });

    it('should validate royalty_percentage range', async () => {
      const mockEvent = createMockEvent();
      const created = await insertEvent(pool, mockEvent);

      // Try to set invalid royalty percentage (> 100)
      await expect(
        withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          await client.query(
            `UPDATE events SET royalty_percentage = $1 WHERE id = $2`,
            [150, created.id]
          );
        })
      ).rejects.toThrow();
    });
  });
});
