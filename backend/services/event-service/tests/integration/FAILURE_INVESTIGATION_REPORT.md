# Integration Test Failure Investigation Report

**Date:** 2026-01-24
**Investigator:** Claude Code
**Service:** event-service

---

## Failure 1: RLS Tenant Isolation Tests (5 failures)

### Failed Tests
1. `should only see events for own tenant`
2. `should not allow tenant to update another tenant events`
3. `should not allow tenant to delete another tenant events`
4. `should only see capacity for own tenant`
5. `should enforce tenant isolation on history`

### Root Cause

**PostgreSQL superusers bypass Row Level Security (RLS), even with `FORCE ROW LEVEL SECURITY` enabled.**

The test container creates a PostgreSQL user `test` which is automatically a superuser. From PostgreSQL documentation:

> "Superusers and roles with the BYPASSRLS attribute always bypass the row security system when accessing a table."

The `FORCE ROW LEVEL SECURITY` command (used in the migration at line 648) only forces RLS on the **table owner**, not on superusers.

### Evidence

**Migration (src/migrations/001_consolidated_baseline.ts:646-688):**
```typescript
const setupTableRLS = async (tableName: string) => {
  await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
  await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);  // Only affects table owner

  await knex.raw(`
    CREATE POLICY ${tableName}_tenant_isolation_select ON ${tableName}
      FOR SELECT
      USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR current_setting('app.is_system_user', true) = 'true'
      )
  `);
  // ... other policies
};
```

**Test Container Setup (tests/integration/setup/testcontainers.ts:31-39):**
```typescript
postgresContainer = await new GenericContainer('postgres:15-alpine')
  .withEnvironment({
    POSTGRES_DB: 'event_service_test',
    POSTGRES_USER: 'test',      // This user is a superuser
    POSTGRES_PASSWORD: 'test',
  })
  // ...
```

**Tenant Middleware (src/middleware/tenant.ts:124):**
```typescript
// Correctly uses SET LOCAL for transaction-scoped RLS context
await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
```

The middleware correctly sets the tenant context, but it has no effect when the connection uses a superuser role.

### Is This a Bug?

- [x] **Configuration issue (fix config)**
- [ ] Test is wrong
- [ ] Source code is wrong
- [ ] Expected behavior

**The RLS policies are correctly defined.** The issue is the test environment uses a superuser, and production may also use a superuser.

### Production Impact

| Aspect | Assessment |
|--------|------------|
| **Severity** | **CRITICAL** |
| **Affects** | All tenant-isolated data access |
| **Risk** | Complete tenant data leakage if production uses superuser |

**Database Configuration Check (src/config/database.ts:145-152):**
```typescript
_db = knex({
  client: 'postgresql',
  connection: {
    host,
    port: config.database.port,
    user: config.database.user,       // ← Need to verify this is NOT a superuser
    password: config.database.password,
    database: config.database.database,
    // ...
  },
```

**Production database credentials come from `config.database.user`.** If this is a superuser (common in development), **RLS is NOT enforced in production**.

### Recommended Fix

**Option 1: Create a dedicated application role (RECOMMENDED)**

```sql
-- Run once during database setup
CREATE ROLE event_service_app NOINHERIT LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE tickettoken TO event_service_app;
GRANT USAGE ON SCHEMA public TO event_service_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO event_service_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO event_service_app;

-- The app role does NOT have SUPERUSER or BYPASSRLS
```

Then update `.env` to use this role:
```
DATABASE_USER=event_service_app
DATABASE_PASSWORD=secure_password
```

**Option 2: Add defense-in-depth at service layer**

In `src/services/event.service.ts`, add explicit tenant checks:

```typescript
async getEvent(eventId: string, tenantId: string): Promise<any> {
  const event = await this.db('events')
    .where({ id: eventId, tenant_id: tenantId })  // Already filters by tenant
    .whereNull('deleted_at')
    .first();

  // Defense-in-depth: Verify tenant even if RLS is bypassed
  if (event && event.tenant_id !== tenantId) {
    throw new ForbiddenError('Access denied to this event');
  }
  // ...
}
```

**Option 3: Fix test containers to use non-superuser**

```typescript
// tests/integration/setup/testcontainers.ts
postgresContainer = await new GenericContainer('postgres:15-alpine')
  .withEnvironment({
    POSTGRES_DB: 'event_service_test',
    POSTGRES_USER: 'postgres',  // Keep postgres as superuser for migrations
    POSTGRES_PASSWORD: 'postgres',
  })
  // ...

// After container starts, create app user
await client.query(`
  CREATE ROLE app_user LOGIN PASSWORD 'test' NOSUPERUSER;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
`);

// Use app_user for test connections
dbPool = new Pool({
  host: postgresContainer.getHost(),
  port: postgresContainer.getMappedPort(5432),
  database: 'event_service_test',
  user: 'app_user',  // Non-superuser
  password: 'test',
});
```

### Alternative Solutions

| Solution | Pros | Cons |
|----------|------|------|
| Non-superuser role | RLS enforced automatically | Requires role management |
| Service-layer checks | Works regardless of DB role | Duplicates RLS logic |
| `SET ROLE app_user` per request | Works with existing superuser | Performance overhead |

---

## Failure 2: Optimistic Locking Race Condition

### Failed Test
`should handle concurrent transition attempts with optimistic locking`

### Root Cause

**The test assumes both concurrent operations read the same version, but with `Promise.all`, timing is non-deterministic.**

The race condition timeline:
1. Transaction A: SELECT version = 1
2. Transaction A: UPDATE WHERE version = 1 → succeeds, commits, version = 2
3. Transaction B: SELECT version = 2 (reads AFTER A commits)
4. Transaction B: UPDATE WHERE version = 2 → succeeds

This is **correct behavior** for optimistic locking - it prevents updating stale data. But the test expected both to read version 1 before either updates.

### Evidence

**Test Code (tests/integration/services/event-state-machine.integration.test.ts:545-565):**
```typescript
const results = await Promise.all([
  withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
    // Get current version
    const current = await client.query('SELECT version FROM events WHERE id = $1', [event.id]);
    const version = current.rows[0].version;

    // Attempt update with version check
    const result = await client.query(
      `UPDATE events
       SET status = 'PAUSED', version = version + 1
       WHERE id = $1 AND version = $2
       RETURNING *`,
      [event.id, version]
    );
    return result.rows[0];
  }),
  // Second transaction - identical
]);

// Expected: One succeeds, one fails
// Actual: Both succeed
```

**Event Service Update (src/services/event.service.ts:662-679):**
```typescript
let updateQuery = trx('events')
  .where({ id: eventId, tenant_id: tenantId });

if (expectedVersion !== undefined && expectedVersion !== null) {
  updateQuery = updateQuery.where('version', expectedVersion);
}

const updatedRows = await updateQuery
  .update(updateData)
  .returning('*');

if (updatedRows.length === 0) {
  throw new ConflictError(
    `Event ${eventId} was modified by another process. ` +
    `Expected version ${expectedVersion}, but current version has changed. ` +
    `Please refresh and try again.`
  );
}
```

The service layer correctly checks for version conflicts. The issue is only in the test timing.

### Is This a Bug?

- [x] **Test is wrong (fix test)**
- [ ] Source code is wrong
- [ ] Configuration issue
- [ ] Expected behavior

The optimistic locking implementation is correct. The test needs to guarantee both transactions read before either updates.

### Production Impact

| Aspect | Assessment |
|--------|------------|
| **Severity** | **LOW** |
| **Affects** | Test reliability only |
| **Risk** | None - production code is correct |

The event.service.ts correctly throws `ConflictError` when version doesn't match, which returns HTTP 409 Conflict to the client.

### Recommended Fix

**Fix the test to use explicit transaction coordination:**

```typescript
it('should handle concurrent transition attempts with optimistic locking', async () => {
  const event = await insertEvent(pool, createMockEvent({ status: 'ON_SALE' }));

  // Use a barrier to ensure both transactions read before either updates
  let readComplete = 0;
  const barrier = new Promise<void>((resolve) => {
    const check = () => {
      if (readComplete === 2) resolve();
    };
    // Check will be called after each read
    (global as any).barrierCheck = check;
  });

  const results = await Promise.all([
    withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
      await client.query('BEGIN');
      try {
        // Lock row to prevent other transaction from seeing committed value
        const current = await client.query(
          'SELECT version FROM events WHERE id = $1 FOR UPDATE',
          [event.id]
        );
        const version = current.rows[0].version;

        // Signal read complete
        readComplete++;
        await barrier;  // Wait for both to read

        const result = await client.query(
          `UPDATE events SET status = 'PAUSED' WHERE id = $1 AND version = $2 RETURNING *`,
          [event.id, version]
        );
        await client.query('COMMIT');
        return result.rows[0];
      } catch (e) {
        await client.query('ROLLBACK');
        return undefined;
      }
    }),
    // Second transaction - similar with FOR UPDATE
  ]);

  // With FOR UPDATE, one will wait for the other, then fail version check
  const succeeded = results.filter(r => r !== undefined);
  expect(succeeded.length).toBe(1);
});
```

**Alternative: Accept current test behavior**

The current test actually validates that optimistic locking works correctly when a client reads the current version. If B reads after A commits, B's update should succeed - this is expected.

To test version conflict specifically:

```typescript
it('should fail update with stale version', async () => {
  const event = await insertEvent(pool, createMockEvent());

  // Read version
  const originalVersion = event.version;  // 1

  // Update event (version becomes 2)
  await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
    await client.query('UPDATE events SET name = $1 WHERE id = $2', ['Updated', event.id]);
  });

  // Try to update with stale version
  const result = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
    const res = await client.query(
      `UPDATE events SET status = 'PAUSED' WHERE id = $1 AND version = $2 RETURNING *`,
      [event.id, originalVersion]  // Using stale version 1
    );
    return res.rows[0];
  });

  expect(result).toBeUndefined();  // No rows updated
});
```

### Alternative Solutions

| Solution | Pros | Cons |
|----------|------|------|
| FOR UPDATE coordination | True concurrent testing | Complex test setup |
| Sequential test (stale version) | Simple, tests core behavior | Doesn't test true concurrency |
| Remove test | Eliminates flakiness | Reduces coverage |

---

## Failure 3: State Machine Tenant Isolation on History

### Failed Test
`should enforce tenant isolation on history`

### Root Cause

**Same as Failure 1 - RLS bypass due to superuser.**

The `event_status_history` table has RLS enabled (added in testcontainers.ts), but the superuser bypasses it.

### Evidence

**Test Container RLS Setup:**
```typescript
const rlsTables = ['events', 'event_schedules', 'event_capacity',
                   'event_pricing', 'event_metadata', 'event_status_history'];
```

### Is This a Bug?

Same as Failure 1 - configuration issue with superuser role.

### Recommended Fix

Same as Failure 1 - use non-superuser role for connections.

---

## Summary: Source Code vs Test vs Configuration Issues

| Failure | Type | Production Risk | Fix Location |
|---------|------|-----------------|--------------|
| RLS Tests (5) | Configuration | **CRITICAL** | Database role config |
| Optimistic Locking | Test | LOW | Test file |
| Status History RLS | Configuration | **CRITICAL** | Database role config |

## Key Findings

### What Works Correctly in Source Code

1. **Tenant middleware** (`src/middleware/tenant.ts`):
   - Uses `SET LOCAL` for transaction-scoped tenant context ✓
   - Validates tenant UUID format ✓
   - Validates tenant exists and is active ✓

2. **RLS policies** (`src/migrations/001_consolidated_baseline.ts`):
   - Correctly defined for all tenant tables ✓
   - Uses `NULLIF(current_setting('app.current_tenant_id', true), '')::uuid` ✓
   - Supports system user bypass with `is_system_user` ✓

3. **Optimistic locking** (`src/services/event.service.ts`):
   - Version check in WHERE clause ✓
   - ConflictError thrown on mismatch ✓
   - Trigger auto-increments version ✓

4. **Capacity reservation** (`src/services/capacity.service.ts:258-261`):
   - Uses `forUpdate()` for row locking ✓
   - Wrapped in transaction ✓

### What Needs Attention

1. **Production database role must NOT be superuser** - CRITICAL
2. **Add defense-in-depth tenant checks** - RECOMMENDED
3. **Update test containers to use non-superuser** - RECOMMENDED

---

## Immediate Action Items

1. **CRITICAL**: Audit production database credentials
   - Check if `DATABASE_USER` has `SUPERUSER` or `BYPASSRLS` privileges
   - If yes, create and switch to a non-privileged application role

2. **HIGH**: Update test containers
   - Create non-superuser role for test connections
   - Re-run integration tests to validate RLS

3. **MEDIUM**: Add service-layer tenant validation
   - Defense-in-depth for critical operations
   - Log any RLS bypass attempts

4. **LOW**: Fix optimistic locking test
   - Use explicit transaction coordination or test sequential stale version case
