/**
 * Test Helpers for Integration Tests
 *
 * Provides utility functions for creating test data, clearing tables, and setting context.
 */

import { Pool, PoolClient } from 'pg';
import { TEST_DATA } from './testcontainers';

/**
 * Clear all event-service tables (preserves stub tables)
 */
export async function clearDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Use system context to bypass RLS
    await client.query(`SELECT set_config('app.is_system_user', 'true', false)`);

    // Clear in dependency order
    await client.query('TRUNCATE event_status_history CASCADE');
    await client.query('TRUNCATE event_metadata CASCADE');
    await client.query('TRUNCATE event_pricing CASCADE');
    await client.query('TRUNCATE event_capacity CASCADE');
    await client.query('TRUNCATE event_schedules CASCADE');
    await client.query('TRUNCATE events CASCADE');

    await client.query(`SELECT set_config('app.is_system_user', 'false', false)`);
  } finally {
    client.release();
  }
}

/**
 * Set tenant context for RLS
 */
export async function setTenantContext(pool: Pool, tenantId: string): Promise<void> {
  await pool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId]);
}

/**
 * Set system user context to bypass RLS
 */
export async function setSystemContext(pool: Pool, isSystem: boolean = true): Promise<void> {
  await pool.query(`SELECT set_config('app.is_system_user', $1, false)`, [isSystem ? 'true' : 'false']);
}

/**
 * Execute a function with a specific tenant context
 */
export async function withTenantContext<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId]);
    return await fn(client);
  } finally {
    await client.query(`SELECT set_config('app.current_tenant_id', '', false)`);
    client.release();
  }
}

/**
 * Execute a function with system context (bypasses RLS)
 */
export async function withSystemContext<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.is_system_user', 'true', false)`);
    return await fn(client);
  } finally {
    await client.query(`SELECT set_config('app.is_system_user', 'false', false)`);
    client.release();
  }
}

/**
 * Create a mock event with sensible defaults
 */
export function createMockEvent(overrides: Partial<MockEvent> = {}): MockEvent {
  const timestamp = Date.now();
  return {
    tenant_id: TEST_DATA.TENANT_1_ID,
    venue_id: TEST_DATA.VENUE_1_ID,
    name: `Test Event ${timestamp}`,
    slug: `test-event-${timestamp}`,
    description: 'A test event for integration testing',
    short_description: 'Test event',
    event_type: 'single',
    status: 'DRAFT',
    visibility: 'PUBLIC',
    is_featured: false,
    priority_score: 0,
    is_virtual: false,
    is_hybrid: false,
    age_restriction: 0,
    view_count: 0,
    interest_count: 0,
    share_count: 0,
    allow_transfers: true,
    require_identity_verification: false,
    cancellation_deadline_hours: 24,
    created_by: TEST_DATA.USER_1_ID,
    ...overrides,
  };
}

export interface MockEvent {
  id?: string;
  tenant_id: string;
  venue_id: string;
  venue_layout_id?: string;
  name: string;
  slug: string;
  description?: string;
  short_description?: string;
  event_type: string;
  status: string;
  visibility: string;
  is_featured: boolean;
  priority_score: number;
  is_virtual: boolean;
  is_hybrid: boolean;
  age_restriction: number;
  view_count: number;
  interest_count: number;
  share_count: number;
  allow_transfers: boolean;
  require_identity_verification: boolean;
  cancellation_deadline_hours: number;
  created_by?: string;
  updated_by?: string;
  start_date?: string | Date;
  metadata?: Record<string, any>;
}

/**
 * Create a mock capacity section
 */
export function createMockCapacity(eventId: string, overrides: Partial<MockCapacity> = {}): MockCapacity {
  return {
    tenant_id: TEST_DATA.TENANT_1_ID,
    event_id: eventId,
    section_name: 'General Admission',
    section_code: 'GA',
    tier: 'standard',
    total_capacity: 100,
    available_capacity: 100,
    reserved_capacity: 0,
    buffer_capacity: 0,
    sold_count: 0,
    pending_count: 0,
    is_active: true,
    is_visible: true,
    minimum_purchase: 1,
    maximum_purchase: 10,
    ...overrides,
  };
}

export interface MockCapacity {
  id?: string;
  tenant_id: string;
  event_id: string;
  schedule_id?: string;
  section_name: string;
  section_code?: string;
  tier?: string;
  total_capacity: number;
  available_capacity: number;
  reserved_capacity: number;
  buffer_capacity: number;
  sold_count: number;
  pending_count: number;
  reserved_at?: Date;
  reserved_expires_at?: Date;
  locked_price_data?: any;
  is_active: boolean;
  is_visible: boolean;
  minimum_purchase: number;
  maximum_purchase?: number;
}

/**
 * Create a mock pricing tier
 */
export function createMockPricing(eventId: string, capacityId?: string, overrides: Partial<MockPricing> = {}): MockPricing {
  return {
    tenant_id: TEST_DATA.TENANT_1_ID,
    event_id: eventId,
    capacity_id: capacityId,
    name: 'Standard Ticket',
    description: 'Standard admission ticket',
    tier: 'standard',
    base_price: 50.00,
    service_fee: 5.00,
    facility_fee: 2.50,
    tax_rate: 0.0875,
    is_dynamic: false,
    currency: 'USD',
    is_active: true,
    is_visible: true,
    display_order: 0,
    ...overrides,
  };
}

export interface MockPricing {
  id?: string;
  tenant_id: string;
  event_id: string;
  schedule_id?: string;
  capacity_id?: string;
  name: string;
  description?: string;
  tier?: string;
  base_price: number;
  service_fee: number;
  facility_fee: number;
  tax_rate: number;
  is_dynamic: boolean;
  min_price?: number;
  max_price?: number;
  current_price?: number;
  currency: string;
  sales_start_at?: Date;
  sales_end_at?: Date;
  max_per_order?: number;
  max_per_customer?: number;
  is_active: boolean;
  is_visible: boolean;
  display_order: number;
}

/**
 * Create a mock schedule
 */
export function createMockSchedule(eventId: string, overrides: Partial<MockSchedule> = {}): MockSchedule {
  const startsAt = new Date('2026-06-01T20:00:00Z');
  const endsAt = new Date('2026-06-01T23:00:00Z');
  const doorsOpenAt = new Date('2026-06-01T19:00:00Z');

  return {
    tenant_id: TEST_DATA.TENANT_1_ID,
    event_id: eventId,
    starts_at: startsAt,
    ends_at: endsAt,
    doors_open_at: doorsOpenAt,
    is_recurring: false,
    timezone: 'America/New_York',
    status: 'SCHEDULED',
    ...overrides,
  };
}

export interface MockSchedule {
  id?: string;
  tenant_id: string;
  event_id: string;
  starts_at: Date;
  ends_at: Date;
  doors_open_at?: Date;
  is_recurring: boolean;
  recurrence_rule?: string;
  recurrence_end_date?: Date;
  occurrence_number?: number;
  timezone: string;
  utc_offset?: number;
  status: string;
  capacity_override?: number;
  notes?: string;
}

/**
 * Insert an event directly into the database
 */
export async function insertEvent(pool: Pool, event: MockEvent): Promise<any> {
  return withTenantContext(pool, event.tenant_id, async (client) => {
    const result = await client.query(
      `INSERT INTO events (
        tenant_id, venue_id, name, slug, description, short_description,
        event_type, status, visibility, is_featured, priority_score,
        is_virtual, is_hybrid, age_restriction, view_count, interest_count,
        share_count, allow_transfers, require_identity_verification,
        cancellation_deadline_hours, created_by, start_date, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *`,
      [
        event.tenant_id, event.venue_id, event.name, event.slug, event.description,
        event.short_description, event.event_type, event.status, event.visibility,
        event.is_featured, event.priority_score, event.is_virtual, event.is_hybrid,
        event.age_restriction, event.view_count, event.interest_count, event.share_count,
        event.allow_transfers, event.require_identity_verification,
        event.cancellation_deadline_hours, event.created_by, event.start_date,
        JSON.stringify(event.metadata || {}),
      ]
    );
    return result.rows[0];
  });
}

/**
 * Insert a capacity section directly into the database
 */
export async function insertCapacity(pool: Pool, capacity: MockCapacity): Promise<any> {
  return withTenantContext(pool, capacity.tenant_id, async (client) => {
    const result = await client.query(
      `INSERT INTO event_capacity (
        tenant_id, event_id, schedule_id, section_name, section_code, tier,
        total_capacity, available_capacity, reserved_capacity, buffer_capacity,
        sold_count, pending_count, reserved_at, reserved_expires_at, locked_price_data,
        is_active, is_visible, minimum_purchase, maximum_purchase
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        capacity.tenant_id, capacity.event_id, capacity.schedule_id, capacity.section_name,
        capacity.section_code, capacity.tier, capacity.total_capacity, capacity.available_capacity,
        capacity.reserved_capacity, capacity.buffer_capacity, capacity.sold_count,
        capacity.pending_count, capacity.reserved_at, capacity.reserved_expires_at,
        capacity.locked_price_data ? JSON.stringify(capacity.locked_price_data) : null,
        capacity.is_active, capacity.is_visible, capacity.minimum_purchase, capacity.maximum_purchase,
      ]
    );
    return result.rows[0];
  });
}

/**
 * Insert a pricing tier directly into the database
 */
export async function insertPricing(pool: Pool, pricing: MockPricing): Promise<any> {
  return withTenantContext(pool, pricing.tenant_id, async (client) => {
    const result = await client.query(
      `INSERT INTO event_pricing (
        tenant_id, event_id, schedule_id, capacity_id, name, description, tier,
        base_price, service_fee, facility_fee, tax_rate, is_dynamic,
        min_price, max_price, current_price, currency, sales_start_at, sales_end_at,
        max_per_order, max_per_customer, is_active, is_visible, display_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *`,
      [
        pricing.tenant_id, pricing.event_id, pricing.schedule_id, pricing.capacity_id,
        pricing.name, pricing.description, pricing.tier, pricing.base_price,
        pricing.service_fee, pricing.facility_fee, pricing.tax_rate, pricing.is_dynamic,
        pricing.min_price, pricing.max_price, pricing.current_price, pricing.currency,
        pricing.sales_start_at, pricing.sales_end_at, pricing.max_per_order,
        pricing.max_per_customer, pricing.is_active, pricing.is_visible, pricing.display_order,
      ]
    );
    return result.rows[0];
  });
}

/**
 * Insert a schedule directly into the database
 */
export async function insertSchedule(pool: Pool, schedule: MockSchedule): Promise<any> {
  return withTenantContext(pool, schedule.tenant_id, async (client) => {
    const result = await client.query(
      `INSERT INTO event_schedules (
        tenant_id, event_id, starts_at, ends_at, doors_open_at,
        is_recurring, recurrence_rule, recurrence_end_date, occurrence_number,
        timezone, utc_offset, status, capacity_override, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        schedule.tenant_id, schedule.event_id, schedule.starts_at, schedule.ends_at,
        schedule.doors_open_at, schedule.is_recurring, schedule.recurrence_rule,
        schedule.recurrence_end_date, schedule.occurrence_number, schedule.timezone,
        schedule.utc_offset, schedule.status, schedule.capacity_override, schedule.notes,
      ]
    );
    return result.rows[0];
  });
}

/**
 * Get an event by ID with tenant context
 */
export async function getEventById(pool: Pool, eventId: string, tenantId: string): Promise<any> {
  return withTenantContext(pool, tenantId, async (client) => {
    const result = await client.query('SELECT * FROM events WHERE id = $1', [eventId]);
    return result.rows[0];
  });
}

/**
 * Get all events for a tenant
 */
export async function getEventsByTenant(pool: Pool, tenantId: string): Promise<any[]> {
  return withTenantContext(pool, tenantId, async (client) => {
    const result = await client.query('SELECT * FROM events ORDER BY created_at DESC');
    return result.rows;
  });
}

/**
 * Update event status directly
 */
export async function updateEventStatus(
  pool: Pool,
  eventId: string,
  tenantId: string,
  status: string,
  reason?: string
): Promise<any> {
  return withTenantContext(pool, tenantId, async (client) => {
    const result = await client.query(
      `UPDATE events SET status = $1, status_reason = $2, status_changed_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, reason, eventId]
    );
    return result.rows[0];
  });
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
