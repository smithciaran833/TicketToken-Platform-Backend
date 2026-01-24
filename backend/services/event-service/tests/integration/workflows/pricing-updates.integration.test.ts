/**
 * Pricing Updates Workflow Integration Tests
 *
 * Tests pricing scheduler job workflows with a real PostgreSQL database.
 * Verifies:
 * - Early bird price activation/deactivation based on deadline
 * - Last minute price activation based on start time
 * - Scheduler job simulation without running actual cron
 * - Price transitions at correct timestamps
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
  withTenantContext,
  sleep,
} from '../setup/test-helpers';

// Increase timeout for container startup
jest.setTimeout(120000);

describe('Pricing Updates Workflow Integration Tests', () => {
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

  describe('Early Bird Price Activation', () => {
    it('should create pricing with early_bird_price and early_bird_ends_at', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const earlyBirdEnds = new Date();
      earlyBirdEnds.setDate(earlyBirdEnds.getDate() + 14); // 14 days from now

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price,
            early_bird_price, early_bird_ends_at, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Concert Ticket',
            100.00,
            75.00, // Start at early bird price
            75.00,
            earlyBirdEnds,
            true,
          ]
        );
        return result.rows[0];
      });

      expect(parseFloat(pricing.base_price)).toBe(100.00);
      expect(parseFloat(pricing.current_price)).toBe(75.00);
      expect(parseFloat(pricing.early_bird_price)).toBe(75.00);
      expect(pricing.early_bird_ends_at).toBeDefined();
    });

    it('should identify active early bird pricing (deadline in future)', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const futureDeadline = new Date();
      futureDeadline.setDate(futureDeadline.getDate() + 7);

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price, early_bird_price, early_bird_ends_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Active Early Bird', 100.00, 80.00, 80.00, futureDeadline]
        );
      });

      // Simulate scheduler checking for active early bird
      const now = new Date();
      const activeEarlyBird = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing
           WHERE event_id = $1
           AND early_bird_price IS NOT NULL
           AND early_bird_ends_at IS NOT NULL
           AND early_bird_ends_at > $2`,
          [createdEvent.id, now]
        );
        return result.rows;
      });

      expect(activeEarlyBird.length).toBe(1);
      expect(activeEarlyBird[0].name).toBe('Active Early Bird');
      expect(parseFloat(activeEarlyBird[0].current_price)).toBe(80.00);
    });

    it('should switch current_price from early_bird to base_price at deadline', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      // Create early bird with past deadline (simulating deadline just passed)
      const pastDeadline = new Date();
      pastDeadline.setMinutes(pastDeadline.getMinutes() - 5); // 5 minutes ago

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price,
            early_bird_price, early_bird_ends_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Expired Early Bird',
            100.00,
            75.00, // Still at early bird price (not yet updated by scheduler)
            75.00,
            pastDeadline,
          ]
        );
        return result.rows[0];
      });

      // Verify initial state
      expect(parseFloat(pricing.current_price)).toBe(75.00);
      expect(parseFloat(pricing.early_bird_price)).toBe(75.00);

      // Simulate scheduler job: switch expired early bird to base price
      const now = new Date();
      const updated = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = base_price
           WHERE id = $1
           AND early_bird_ends_at <= $2
           AND current_price = early_bird_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      // Verify price switched
      expect(updated).toBeDefined();
      expect(parseFloat(updated.current_price)).toBe(100.00); // Now at base price
      expect(parseFloat(updated.base_price)).toBe(100.00);
      expect(parseFloat(updated.early_bird_price)).toBe(75.00); // Early bird price preserved
    });

    it('should not switch price if early bird deadline not yet reached', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      // Create early bird with future deadline
      const futureDeadline = new Date();
      futureDeadline.setDate(futureDeadline.getDate() + 7); // 7 days from now

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price,
            early_bird_price, early_bird_ends_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Active Early Bird',
            100.00,
            75.00,
            75.00,
            futureDeadline,
          ]
        );
        return result.rows[0];
      });

      // Try to run scheduler job (should not update)
      const now = new Date();
      const updateResult = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = base_price
           WHERE id = $1
           AND early_bird_ends_at <= $2
           AND current_price = early_bird_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      // No update should have happened
      expect(updateResult).toBeUndefined();

      // Verify price unchanged
      const unchanged = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing WHERE id = $1`,
          [pricing.id]
        );
        return result.rows[0];
      });

      expect(parseFloat(unchanged.current_price)).toBe(75.00); // Still at early bird
    });

    it('should handle batch early bird expiration for multiple pricing tiers', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pastDeadline = new Date();
      pastDeadline.setMinutes(pastDeadline.getMinutes() - 10);

      const futureDeadline = new Date();
      futureDeadline.setDate(futureDeadline.getDate() + 7);

      // Create multiple pricing tiers - 2 expired, 1 active
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_pricing (tenant_id, event_id, name, base_price, current_price, early_bird_price, early_bird_ends_at)
           VALUES
           ($1, $2, 'GA Expired', 50.00, 40.00, 40.00, $3),
           ($1, $2, 'VIP Expired', 150.00, 120.00, 120.00, $3),
           ($1, $2, 'Platinum Active', 300.00, 250.00, 250.00, $4)`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, pastDeadline, futureDeadline]
        );
      });

      // Batch update expired early birds
      const now = new Date();
      const batchUpdate = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = base_price
           WHERE event_id = $1
           AND early_bird_ends_at <= $2
           AND current_price = early_bird_price
           RETURNING *`,
          [createdEvent.id, now]
        );
        return result.rows;
      });

      // Should have updated 2 pricing tiers
      expect(batchUpdate.length).toBe(2);

      // Verify all prices
      const allPricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing WHERE event_id = $1 ORDER BY name`,
          [createdEvent.id]
        );
        return result.rows;
      });

      expect(allPricing.length).toBe(3);

      // GA Expired - should be at base price
      const ga = allPricing.find(p => p.name === 'GA Expired');
      expect(parseFloat(ga.current_price)).toBe(50.00);

      // VIP Expired - should be at base price
      const vip = allPricing.find(p => p.name === 'VIP Expired');
      expect(parseFloat(vip.current_price)).toBe(150.00);

      // Platinum Active - should still be at early bird
      const platinum = allPricing.find(p => p.name === 'Platinum Active');
      expect(parseFloat(platinum.current_price)).toBe(250.00);
    });

    it('should preserve version integrity during batch updates', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pastDeadline = new Date();
      pastDeadline.setMinutes(pastDeadline.getMinutes() - 5);

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price, early_bird_price, early_bird_ends_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Version Test', 100.00, 80.00, 80.00, pastDeadline]
        );
        return result.rows[0];
      });

      expect(pricing.version).toBe(1);

      // Run scheduler update
      const now = new Date();
      const updated = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = base_price
           WHERE id = $1
           AND early_bird_ends_at <= $2
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      expect(updated.version).toBe(2); // Version incremented
    });
  });

  describe('Last Minute Price Activation', () => {
    it('should create pricing with last_minute_price and last_minute_starts_at', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const lastMinuteStarts = new Date();
      lastMinuteStarts.setDate(lastMinuteStarts.getDate() + 7); // Starts 7 days from now

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price,
            last_minute_price, last_minute_starts_at, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Last Minute Deal',
            100.00,
            100.00, // Currently at base price
            60.00,  // Will drop to 60 at last minute
            lastMinuteStarts,
            true,
          ]
        );
        return result.rows[0];
      });

      expect(parseFloat(pricing.base_price)).toBe(100.00);
      expect(parseFloat(pricing.current_price)).toBe(100.00);
      expect(parseFloat(pricing.last_minute_price)).toBe(60.00);
      expect(pricing.last_minute_starts_at).toBeDefined();
    });

    it('should switch current_price to last_minute_price when start time reached', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      // Create last minute pricing that has already started
      const pastStart = new Date();
      pastStart.setMinutes(pastStart.getMinutes() - 10); // 10 minutes ago

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price,
            last_minute_price, last_minute_starts_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Active Last Minute',
            100.00,
            100.00, // Still at base (scheduler hasn't run)
            60.00,
            pastStart,
          ]
        );
        return result.rows[0];
      });

      // Verify initial state
      expect(parseFloat(pricing.current_price)).toBe(100.00);

      // Simulate scheduler job: activate last minute pricing
      const now = new Date();
      const updated = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = last_minute_price
           WHERE id = $1
           AND last_minute_starts_at <= $2
           AND current_price != last_minute_price
           AND last_minute_price IS NOT NULL
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      // Verify price switched to last minute
      expect(updated).toBeDefined();
      expect(parseFloat(updated.current_price)).toBe(60.00); // Now at last minute price
      expect(parseFloat(updated.last_minute_price)).toBe(60.00);
    });

    it('should not activate last minute price if start time not reached', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      // Create last minute pricing that hasn't started yet
      const futureStart = new Date();
      futureStart.setDate(futureStart.getDate() + 7);

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price,
            last_minute_price, last_minute_starts_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Future Last Minute',
            100.00,
            100.00,
            60.00,
            futureStart,
          ]
        );
        return result.rows[0];
      });

      // Try to run scheduler job
      const now = new Date();
      const updateResult = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = last_minute_price
           WHERE id = $1
           AND last_minute_starts_at <= $2
           AND current_price != last_minute_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      // No update should have happened
      expect(updateResult).toBeUndefined();

      // Verify price unchanged
      const unchanged = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing WHERE id = $1`,
          [pricing.id]
        );
        return result.rows[0];
      });

      expect(parseFloat(unchanged.current_price)).toBe(100.00); // Still at base price
    });

    it('should handle batch last minute activation for multiple events', async () => {
      // Create 3 events with different last minute start times
      const timestamp = Date.now();
      const event1 = createMockEvent({ name: 'Event 1', slug: `event-1-${timestamp}` });
      const event2 = createMockEvent({ name: 'Event 2', slug: `event-2-${timestamp}` });
      const event3 = createMockEvent({ name: 'Event 3', slug: `event-3-${timestamp}` });

      const createdEvent1 = await insertEvent(pool, event1);
      const createdEvent2 = await insertEvent(pool, event2);
      const createdEvent3 = await insertEvent(pool, event3);

      const pastStart = new Date();
      pastStart.setMinutes(pastStart.getMinutes() - 30);

      const futureStart = new Date();
      futureStart.setDate(futureStart.getDate() + 3);

      // Event 1 & 2: last minute started, Event 3: not yet started
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_pricing (tenant_id, event_id, name, base_price, current_price, last_minute_price, last_minute_starts_at)
           VALUES
           ($1, $2, 'Event 1 Ticket', 100.00, 100.00, 70.00, $5),
           ($1, $3, 'Event 2 Ticket', 80.00, 80.00, 50.00, $5),
           ($1, $4, 'Event 3 Ticket', 120.00, 120.00, 90.00, $6)`,
          [TEST_DATA.TENANT_1_ID, createdEvent1.id, createdEvent2.id, createdEvent3.id, pastStart, futureStart]
        );
      });

      // Batch update last minute pricing across all events
      const now = new Date();
      const batchUpdate = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = last_minute_price
           WHERE tenant_id = $1
           AND last_minute_starts_at <= $2
           AND current_price != last_minute_price
           AND last_minute_price IS NOT NULL
           RETURNING *`,
          [TEST_DATA.TENANT_1_ID, now]
        );
        return result.rows;
      });

      // Should have updated 2 pricing records
      expect(batchUpdate.length).toBe(2);

      // Verify individual prices
      const verifyPricing = async (eventId: string, expectedPrice: number) => {
        const result = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          const res = await client.query(
            `SELECT * FROM event_pricing WHERE event_id = $1`,
            [eventId]
          );
          return res.rows[0];
        });
        expect(parseFloat(result.current_price)).toBe(expectedPrice);
      };

      await verifyPricing(createdEvent1.id, 70.00);  // Last minute active
      await verifyPricing(createdEvent2.id, 50.00);  // Last minute active
      await verifyPricing(createdEvent3.id, 120.00); // Still at base price
    });

    it('should not reapply last minute price if already applied', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pastStart = new Date();
      pastStart.setMinutes(pastStart.getMinutes() - 60);

      // Create pricing already at last minute price
      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price,
            last_minute_price, last_minute_starts_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Already Applied',
            100.00,
            60.00, // Already at last minute price
            60.00,
            pastStart,
          ]
        );
        return result.rows[0];
      });

      const originalVersion = pricing.version;

      // Try to run scheduler again
      const now = new Date();
      const updateResult = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = last_minute_price
           WHERE id = $1
           AND last_minute_starts_at <= $2
           AND current_price != last_minute_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      // Should not update (already at last minute price)
      expect(updateResult).toBeUndefined();

      // Verify version unchanged
      const unchanged = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing WHERE id = $1`,
          [pricing.id]
        );
        return result.rows[0];
      });

      expect(unchanged.version).toBe(originalVersion);
    });
  });

  describe('Combined Early Bird and Last Minute Workflows', () => {
    it('should handle pricing lifecycle: early bird -> base -> last minute', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const now = new Date();

      // Phase 1: Early bird active
      const earlyBirdEnds = new Date(now);
      earlyBirdEnds.setDate(earlyBirdEnds.getDate() + 7);

      const lastMinuteStarts = new Date(now);
      lastMinuteStarts.setDate(lastMinuteStarts.getDate() + 14);

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price,
            early_bird_price, early_bird_ends_at,
            last_minute_price, last_minute_starts_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Lifecycle Ticket',
            100.00, // Base price
            75.00,  // Current: early bird
            75.00,  // Early bird price
            earlyBirdEnds,
            50.00,  // Last minute price
            lastMinuteStarts,
          ]
        );
        return result.rows[0];
      });

      // Verify Phase 1: Early bird active
      expect(parseFloat(pricing.current_price)).toBe(75.00);

      // Phase 2: Simulate early bird expires (update deadline to past)
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `UPDATE event_pricing SET early_bird_ends_at = $1 WHERE id = $2`,
          [new Date(now.getTime() - 60000), pricing.id] // 1 minute ago
        );
      });

      // Run early bird expiration job
      const afterEarlyBird = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = base_price
           WHERE id = $1
           AND early_bird_ends_at <= $2
           AND current_price = early_bird_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      // Verify Phase 2: Now at base price
      expect(parseFloat(afterEarlyBird.current_price)).toBe(100.00);

      // Phase 3: Simulate last minute starts (update start time to past)
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `UPDATE event_pricing SET last_minute_starts_at = $1 WHERE id = $2`,
          [new Date(now.getTime() - 60000), pricing.id]
        );
      });

      // Run last minute activation job
      const afterLastMinute = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = last_minute_price
           WHERE id = $1
           AND last_minute_starts_at <= $2
           AND current_price != last_minute_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      // Verify Phase 3: Now at last minute price
      expect(parseFloat(afterLastMinute.current_price)).toBe(50.00);
    });

    it('should handle multiple events in different pricing phases', async () => {
      const now = new Date();
      const timestamp = Date.now();

      // Event 1: Currently in early bird phase
      const event1 = createMockEvent({ name: 'Early Bird Event', slug: `early-bird-event-${timestamp}` });
      const createdEvent1 = await insertEvent(pool, event1);

      const futureEarlyBirdEnd = new Date(now);
      futureEarlyBirdEnd.setDate(futureEarlyBirdEnd.getDate() + 7);

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_pricing (tenant_id, event_id, name, base_price, current_price, early_bird_price, early_bird_ends_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [TEST_DATA.TENANT_1_ID, createdEvent1.id, 'EB Ticket', 100.00, 80.00, 80.00, futureEarlyBirdEnd]
        );
      });

      // Event 2: Early bird ended, at base price
      const event2 = createMockEvent({ name: 'Base Price Event', slug: `base-price-event-${timestamp}` });
      const createdEvent2 = await insertEvent(pool, event2);

      const pastEarlyBirdEnd = new Date(now);
      pastEarlyBirdEnd.setDate(pastEarlyBirdEnd.getDate() - 3);

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_pricing (tenant_id, event_id, name, base_price, current_price, early_bird_price, early_bird_ends_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [TEST_DATA.TENANT_1_ID, createdEvent2.id, 'Base Ticket', 100.00, 100.00, 80.00, pastEarlyBirdEnd]
        );
      });

      // Event 3: In last minute phase
      const event3 = createMockEvent({ name: 'Last Minute Event', slug: `last-minute-event-${timestamp}` });
      const createdEvent3 = await insertEvent(pool, event3);

      const pastLastMinuteStart = new Date(now);
      pastLastMinuteStart.setHours(pastLastMinuteStart.getHours() - 12);

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_pricing (tenant_id, event_id, name, base_price, current_price, last_minute_price, last_minute_starts_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [TEST_DATA.TENANT_1_ID, createdEvent3.id, 'LM Ticket', 100.00, 60.00, 60.00, pastLastMinuteStart]
        );
      });

      // Query pricing by phase
      const allPricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT ep.*, e.name as event_name FROM event_pricing ep
           JOIN events e ON e.id = ep.event_id
           ORDER BY ep.current_price ASC`
        );
        return result.rows;
      });

      expect(allPricing.length).toBe(3);

      // Last minute (cheapest)
      expect(allPricing[0].event_name).toBe('Last Minute Event');
      expect(parseFloat(allPricing[0].current_price)).toBe(60.00);

      // Early bird
      expect(allPricing[1].event_name).toBe('Early Bird Event');
      expect(parseFloat(allPricing[1].current_price)).toBe(80.00);

      // Base price (most expensive)
      expect(allPricing[2].event_name).toBe('Base Price Event');
      expect(parseFloat(allPricing[2].current_price)).toBe(100.00);
    });
  });

  describe('Scheduler Job Idempotency', () => {
    it('should be safe to run early bird expiration multiple times', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pastDeadline = new Date();
      pastDeadline.setMinutes(pastDeadline.getMinutes() - 30);

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price, early_bird_price, early_bird_ends_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Idempotent Test', 100.00, 80.00, 80.00, pastDeadline]
        );
        return result.rows[0];
      });

      const now = new Date();

      // First run - should update
      const firstRun = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = base_price
           WHERE id = $1
           AND early_bird_ends_at <= $2
           AND current_price = early_bird_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      expect(firstRun).toBeDefined();
      expect(parseFloat(firstRun.current_price)).toBe(100.00);
      const versionAfterFirst = firstRun.version;

      // Second run - should not update (already at base price)
      const secondRun = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = base_price
           WHERE id = $1
           AND early_bird_ends_at <= $2
           AND current_price = early_bird_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      expect(secondRun).toBeUndefined(); // No rows updated

      // Verify version unchanged after second run
      const finalState = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing WHERE id = $1`,
          [pricing.id]
        );
        return result.rows[0];
      });

      expect(finalState.version).toBe(versionAfterFirst);
    });

    it('should be safe to run last minute activation multiple times', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pastStart = new Date();
      pastStart.setMinutes(pastStart.getMinutes() - 30);

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price, last_minute_price, last_minute_starts_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Idempotent LM', 100.00, 100.00, 70.00, pastStart]
        );
        return result.rows[0];
      });

      const now = new Date();

      // First run
      const firstRun = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = last_minute_price
           WHERE id = $1
           AND last_minute_starts_at <= $2
           AND current_price != last_minute_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      expect(firstRun).toBeDefined();
      const versionAfterFirst = firstRun.version;

      // Second run
      const secondRun = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = last_minute_price
           WHERE id = $1
           AND last_minute_starts_at <= $2
           AND current_price != last_minute_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      expect(secondRun).toBeUndefined();

      // Third run - still no change
      const thirdRun = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = last_minute_price
           WHERE id = $1
           AND last_minute_starts_at <= $2
           AND current_price != last_minute_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      expect(thirdRun).toBeUndefined();

      // Verify final state
      const finalState = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing WHERE id = $1`,
          [pricing.id]
        );
        return result.rows[0];
      });

      expect(parseFloat(finalState.current_price)).toBe(70.00);
      expect(finalState.version).toBe(versionAfterFirst);
    });
  });

  describe('Tenant Isolation in Scheduled Jobs', () => {
    it('should only update pricing for own tenant in batch jobs', async () => {
      // Create events for both tenants
      const event1 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        venue_id: TEST_DATA.VENUE_1_ID,
      });
      const createdEvent1 = await insertEvent(pool, event1);

      const event2 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_2_ID,
        venue_id: TEST_DATA.VENUE_2_ID,
      });
      const createdEvent2 = await insertEvent(pool, event2);

      const pastDeadline = new Date();
      pastDeadline.setMinutes(pastDeadline.getMinutes() - 10);

      // Create pricing for tenant 1
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_pricing (tenant_id, event_id, name, base_price, current_price, early_bird_price, early_bird_ends_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [TEST_DATA.TENANT_1_ID, createdEvent1.id, 'Tenant 1 Ticket', 100.00, 80.00, 80.00, pastDeadline]
        );
      });

      // Create pricing for tenant 2
      await withTenantContext(pool, TEST_DATA.TENANT_2_ID, async (client) => {
        await client.query(
          `INSERT INTO event_pricing (tenant_id, event_id, name, base_price, current_price, early_bird_price, early_bird_ends_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [TEST_DATA.TENANT_2_ID, createdEvent2.id, 'Tenant 2 Ticket', 100.00, 80.00, 80.00, pastDeadline]
        );
      });

      // Run batch update as tenant 1 context
      const now = new Date();
      const tenant1Update = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = base_price
           WHERE tenant_id = $1
           AND early_bird_ends_at <= $2
           AND current_price = early_bird_price
           RETURNING *`,
          [TEST_DATA.TENANT_1_ID, now]
        );
        return result.rows;
      });

      expect(tenant1Update.length).toBe(1);
      expect(tenant1Update[0].name).toBe('Tenant 1 Ticket');

      // Verify tenant 2's pricing is unchanged
      const tenant2Pricing = await withTenantContext(pool, TEST_DATA.TENANT_2_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing WHERE event_id = $1`,
          [createdEvent2.id]
        );
        return result.rows[0];
      });

      expect(parseFloat(tenant2Pricing.current_price)).toBe(80.00); // Still at early bird
    });
  });
});
