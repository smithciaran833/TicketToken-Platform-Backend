/**
 * Capacity Service Integration Tests
 *
 * Tests capacity management operations with real PostgreSQL database:
 * - Capacity reservation with atomic operations
 * - Overselling prevention
 * - Row locking for concurrent access
 * - Reservation expiration
 * - Capacity release/confirm flows
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
  withTenantContext,
  withSystemContext,
  createMockEvent,
  createMockCapacity,
  insertEvent,
  insertCapacity,
  sleep,
} from '../setup/test-helpers';

describe('Capacity Service Integration Tests', () => {
  let pool: Pool;

  beforeAll(async () => {
    await setupTestContainers();
    pool = getDbPool();
  }, 120000);

  afterAll(async () => {
    await teardownTestContainers();
  }, 30000);

  beforeEach(async () => {
    await clearDatabase(pool);
  });

  describe('Create Capacity', () => {
    it('should create capacity section with all fields', async () => {
      // Create event first
      const event = await insertEvent(pool, createMockEvent());

      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        section_name: 'VIP Section',
        section_code: 'VIP',
        tier: 'vip',
        total_capacity: 50,
        available_capacity: 50,
        minimum_purchase: 2,
        maximum_purchase: 4,
      }));

      expect(capacity.id).toBeDefined();
      expect(capacity.section_name).toBe('VIP Section');
      expect(capacity.section_code).toBe('VIP');
      expect(capacity.tier).toBe('vip');
      expect(capacity.total_capacity).toBe(50);
      expect(capacity.available_capacity).toBe(50);
      expect(capacity.minimum_purchase).toBe(2);
      expect(capacity.maximum_purchase).toBe(4);
      expect(capacity.is_active).toBe(true);
    });

    it('should enforce tenant_id foreign key', async () => {
      const event = await insertEvent(pool, createMockEvent());

      await expect(
        withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          return client.query(
            `INSERT INTO event_capacity (tenant_id, event_id, section_name, total_capacity, available_capacity, is_active, is_visible, minimum_purchase)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            ['nonexistent-tenant-id', event.id, 'Test', 100, 100, true, true, 1]
          );
        })
      ).rejects.toThrow();
    });
  });

  describe('Reserve Capacity - Atomic Operations', () => {
    it('should atomically decrement available capacity', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));
      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        total_capacity: 100,
        available_capacity: 100,
      }));

      // Reserve 5 tickets
      const reserved = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_capacity
           SET available_capacity = available_capacity - $1,
               reserved_capacity = reserved_capacity + $1,
               pending_count = pending_count + $1
           WHERE id = $2 AND available_capacity >= $1
           RETURNING *`,
          [5, capacity.id]
        );
        return result.rows[0];
      });

      expect(reserved.available_capacity).toBe(95);
      expect(reserved.reserved_capacity).toBe(5);
      expect(reserved.pending_count).toBe(5);
    });

    it('should use FOR UPDATE to lock row during reservation', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));
      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        total_capacity: 10,
        available_capacity: 10,
      }));

      // Simulate concurrent reservations using FOR UPDATE
      const results = await Promise.all([
        withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          await client.query('BEGIN');
          try {
            // Lock row
            const locked = await client.query(
              `SELECT * FROM event_capacity WHERE id = $1 FOR UPDATE`,
              [capacity.id]
            );

            // Small delay to simulate processing
            await sleep(50);

            const available = locked.rows[0].available_capacity;
            if (available >= 3) {
              await client.query(
                `UPDATE event_capacity
                 SET available_capacity = available_capacity - 3,
                     reserved_capacity = reserved_capacity + 3
                 WHERE id = $1`,
                [capacity.id]
              );
              await client.query('COMMIT');
              return { success: true, reserved: 3 };
            }
            await client.query('ROLLBACK');
            return { success: false, reserved: 0 };
          } catch (e) {
            await client.query('ROLLBACK');
            throw e;
          }
        }),
        withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          await client.query('BEGIN');
          try {
            // Lock row (will wait for first transaction)
            const locked = await client.query(
              `SELECT * FROM event_capacity WHERE id = $1 FOR UPDATE`,
              [capacity.id]
            );

            const available = locked.rows[0].available_capacity;
            if (available >= 3) {
              await client.query(
                `UPDATE event_capacity
                 SET available_capacity = available_capacity - 3,
                     reserved_capacity = reserved_capacity + 3
                 WHERE id = $1`,
                [capacity.id]
              );
              await client.query('COMMIT');
              return { success: true, reserved: 3 };
            }
            await client.query('ROLLBACK');
            return { success: false, reserved: 0 };
          } catch (e) {
            await client.query('ROLLBACK');
            throw e;
          }
        }),
      ]);

      // Both should succeed since we have 10 available
      expect(results.filter(r => r.success).length).toBe(2);

      // Verify final state
      const finalCapacity = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query('SELECT * FROM event_capacity WHERE id = $1', [capacity.id]);
        return result.rows[0];
      });

      expect(finalCapacity.available_capacity).toBe(4);
      expect(finalCapacity.reserved_capacity).toBe(6);
    });
  });

  describe('Prevent Overselling', () => {
    it('should reject reservation when available capacity is insufficient', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));
      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        total_capacity: 5,
        available_capacity: 5,
      }));

      // Try to reserve more than available
      const result = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const res = await client.query(
          `UPDATE event_capacity
           SET available_capacity = available_capacity - $1,
               reserved_capacity = reserved_capacity + $1
           WHERE id = $2 AND available_capacity >= $1
           RETURNING *`,
          [10, capacity.id]
        );
        return res.rows[0];
      });

      // Should return undefined (no row updated)
      expect(result).toBeUndefined();

      // Verify capacity unchanged
      const unchanged = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const res = await client.query('SELECT * FROM event_capacity WHERE id = $1', [capacity.id]);
        return res.rows[0];
      });

      expect(unchanged.available_capacity).toBe(5);
      expect(unchanged.reserved_capacity).toBe(0);
    });

    it('should prevent available_capacity from going negative', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));
      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        total_capacity: 10,
        available_capacity: 3,
      }));

      // Try concurrent reservations that would exceed capacity
      const results = await Promise.allSettled([
        withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          const result = await client.query(
            `UPDATE event_capacity
             SET available_capacity = available_capacity - $1,
                 reserved_capacity = reserved_capacity + $1
             WHERE id = $2 AND available_capacity >= $1
             RETURNING *`,
            [2, capacity.id]
          );
          return result.rows[0];
        }),
        withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          const result = await client.query(
            `UPDATE event_capacity
             SET available_capacity = available_capacity - $1,
                 reserved_capacity = reserved_capacity + $1
             WHERE id = $2 AND available_capacity >= $1
             RETURNING *`,
            [2, capacity.id]
          );
          return result.rows[0];
        }),
      ]);

      // At least one should fail (return undefined)
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const successfulUpdates = fulfilled.filter(
        r => (r as PromiseFulfilledResult<any>).value !== undefined
      );

      // Verify final state: available should be >= 0
      const finalCapacity = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query('SELECT * FROM event_capacity WHERE id = $1', [capacity.id]);
        return result.rows[0];
      });

      expect(finalCapacity.available_capacity).toBeGreaterThanOrEqual(0);
      expect(finalCapacity.available_capacity + finalCapacity.reserved_capacity).toBeLessThanOrEqual(
        finalCapacity.total_capacity
      );
    });

    it('should enforce CHECK constraint preventing negative available_capacity', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));
      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        total_capacity: 5,
        available_capacity: 5,
      }));

      // Try direct update to negative value (bypassing conditional WHERE)
      await expect(
        withSystemContext(pool, async (client) => {
          return client.query(
            `UPDATE event_capacity SET available_capacity = -1 WHERE id = $1`,
            [capacity.id]
          );
        })
      ).rejects.toThrow();
    });
  });

  describe('Confirm Reservation', () => {
    it('should move capacity from reserved to sold on confirmation', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));
      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        total_capacity: 100,
        available_capacity: 95,
        reserved_capacity: 5,
        pending_count: 5,
      }));

      // Confirm 3 tickets
      const confirmed = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_capacity
           SET reserved_capacity = reserved_capacity - $1,
               sold_count = sold_count + $1,
               pending_count = pending_count - $1
           WHERE id = $2 AND reserved_capacity >= $1
           RETURNING *`,
          [3, capacity.id]
        );
        return result.rows[0];
      });

      expect(confirmed.reserved_capacity).toBe(2);
      expect(confirmed.sold_count).toBe(3);
      expect(confirmed.pending_count).toBe(2);
      // Available should remain unchanged
      expect(confirmed.available_capacity).toBe(95);
    });

    it('should not confirm more than reserved', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));
      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        total_capacity: 100,
        available_capacity: 95,
        reserved_capacity: 5,
      }));

      // Try to confirm 10 when only 5 reserved
      const result = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const res = await client.query(
          `UPDATE event_capacity
           SET reserved_capacity = reserved_capacity - $1,
               sold_count = sold_count + $1
           WHERE id = $2 AND reserved_capacity >= $1
           RETURNING *`,
          [10, capacity.id]
        );
        return res.rows[0];
      });

      expect(result).toBeUndefined();
    });
  });

  describe('Release Reservation', () => {
    it('should return capacity from reserved to available on release', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));
      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        total_capacity: 100,
        available_capacity: 95,
        reserved_capacity: 5,
        pending_count: 5,
      }));

      // Release 3 tickets
      const released = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_capacity
           SET reserved_capacity = reserved_capacity - $1,
               available_capacity = available_capacity + $1,
               pending_count = GREATEST(pending_count - $1, 0)
           WHERE id = $2 AND reserved_capacity >= $1
           RETURNING *`,
          [3, capacity.id]
        );
        return result.rows[0];
      });

      expect(released.reserved_capacity).toBe(2);
      expect(released.available_capacity).toBe(98);
      expect(released.pending_count).toBe(2);
    });

    it('should handle expired reservations', async () => {
      const expiresAt = new Date(Date.now() - 60000); // Expired 1 minute ago

      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));
      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        total_capacity: 100,
        available_capacity: 90,
        reserved_capacity: 10,
        reserved_at: new Date(Date.now() - 120000), // Reserved 2 minutes ago
        reserved_expires_at: expiresAt,
      }));

      // Cleanup expired reservations
      const cleaned = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_capacity
           SET available_capacity = available_capacity + reserved_capacity,
               reserved_capacity = 0,
               reserved_at = NULL,
               reserved_expires_at = NULL
           WHERE id = $1 AND reserved_expires_at < NOW()
           RETURNING *`,
          [capacity.id]
        );
        return result.rows[0];
      });

      expect(cleaned.available_capacity).toBe(100);
      expect(cleaned.reserved_capacity).toBe(0);
      expect(cleaned.reserved_at).toBeNull();
      expect(cleaned.reserved_expires_at).toBeNull();
    });
  });

  describe('Tenant Isolation (RLS)', () => {
    it('should only see capacity for own tenant', async () => {
      const event1 = await insertEvent(pool, createMockEvent({ tenant_id: TEST_DATA.TENANT_1_ID }));
      const event2 = await insertEvent(pool, createMockEvent({
        tenant_id: TEST_DATA.TENANT_2_ID,
        slug: 'tenant2-event',
      }));

      await insertCapacity(pool, createMockCapacity(event1.id, {
        tenant_id: TEST_DATA.TENANT_1_ID,
        section_name: 'Tenant 1 Section',
      }));
      await insertCapacity(pool, createMockCapacity(event2.id, {
        tenant_id: TEST_DATA.TENANT_2_ID,
        section_name: 'Tenant 2 Section',
      }));

      // Tenant 1 should only see their capacity
      const tenant1Capacity = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query('SELECT * FROM event_capacity');
        return result.rows;
      });

      expect(tenant1Capacity).toHaveLength(1);
      expect(tenant1Capacity[0].section_name).toBe('Tenant 1 Section');

      // Tenant 2 should only see their capacity
      const tenant2Capacity = await withTenantContext(pool, TEST_DATA.TENANT_2_ID, async (client) => {
        const result = await client.query('SELECT * FROM event_capacity');
        return result.rows;
      });

      expect(tenant2Capacity).toHaveLength(1);
      expect(tenant2Capacity[0].section_name).toBe('Tenant 2 Section');
    });
  });

  describe('Buffer Capacity', () => {
    it('should respect buffer capacity in availability calculations', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));
      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        total_capacity: 100,
        available_capacity: 100,
        buffer_capacity: 10, // Hold 10 for emergencies
      }));

      // Effective available = available - buffer = 90
      const effectiveAvailable = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT available_capacity - buffer_capacity as effective_available
           FROM event_capacity WHERE id = $1`,
          [capacity.id]
        );
        return result.rows[0].effective_available;
      });

      expect(effectiveAvailable).toBe(90);
    });

    it('should allow reservations up to effective available capacity', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));
      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        total_capacity: 100,
        available_capacity: 100,
        buffer_capacity: 10,
      }));

      // Reserve 90 (full effective capacity)
      const reserved = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_capacity
           SET available_capacity = available_capacity - $1,
               reserved_capacity = reserved_capacity + $1
           WHERE id = $2 AND (available_capacity - buffer_capacity) >= $1
           RETURNING *`,
          [90, capacity.id]
        );
        return result.rows[0];
      });

      expect(reserved.available_capacity).toBe(10);
      expect(reserved.reserved_capacity).toBe(90);

      // Try to reserve 1 more (should fail - only buffer left)
      const result = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const res = await client.query(
          `UPDATE event_capacity
           SET available_capacity = available_capacity - $1,
               reserved_capacity = reserved_capacity + $1
           WHERE id = $2 AND (available_capacity - buffer_capacity) >= $1
           RETURNING *`,
          [1, capacity.id]
        );
        return res.rows[0];
      });

      expect(result).toBeUndefined();
    });
  });

  describe('Multiple Sections', () => {
    it('should manage capacity independently per section', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));

      const ga = await insertCapacity(pool, createMockCapacity(event.id, {
        section_name: 'General Admission',
        section_code: 'GA',
        total_capacity: 100,
        available_capacity: 100,
      }));

      const vip = await insertCapacity(pool, createMockCapacity(event.id, {
        section_name: 'VIP',
        section_code: 'VIP',
        total_capacity: 20,
        available_capacity: 20,
      }));

      // Reserve from GA
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        return client.query(
          `UPDATE event_capacity
           SET available_capacity = available_capacity - 10
           WHERE id = $1`,
          [ga.id]
        );
      });

      // Verify GA updated, VIP unchanged
      const sections = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          'SELECT * FROM event_capacity WHERE event_id = $1 ORDER BY section_code',
          [event.id]
        );
        return result.rows;
      });

      const gaSection = sections.find(s => s.section_code === 'GA');
      const vipSection = sections.find(s => s.section_code === 'VIP');

      expect(gaSection.available_capacity).toBe(90);
      expect(vipSection.available_capacity).toBe(20);
    });

    it('should sum total capacity across all sections', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));

      await insertCapacity(pool, createMockCapacity(event.id, {
        section_name: 'General Admission',
        total_capacity: 100,
      }));

      await insertCapacity(pool, createMockCapacity(event.id, {
        section_name: 'VIP',
        total_capacity: 20,
      }));

      await insertCapacity(pool, createMockCapacity(event.id, {
        section_name: 'Premium',
        total_capacity: 30,
      }));

      const totalCapacity = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT SUM(total_capacity) as total FROM event_capacity WHERE event_id = $1 AND is_active = true`,
          [event.id]
        );
        return parseInt(result.rows[0].total, 10);
      });

      expect(totalCapacity).toBe(150);
    });
  });

  describe('Locked Price Data', () => {
    it('should store locked price data as JSONB', async () => {
      const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));

      const lockedPriceData = {
        base_price: 50.00,
        service_fee: 5.00,
        tax_rate: 0.0875,
        locked_at: new Date().toISOString(),
      };

      const capacity = await insertCapacity(pool, createMockCapacity(event.id, {
        locked_price_data: lockedPriceData,
      }));

      const retrieved = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query('SELECT locked_price_data FROM event_capacity WHERE id = $1', [capacity.id]);
        return result.rows[0].locked_price_data;
      });

      expect(retrieved.base_price).toBe(50.00);
      expect(retrieved.service_fee).toBe(5.00);
      expect(retrieved.tax_rate).toBe(0.0875);
    });
  });
});
