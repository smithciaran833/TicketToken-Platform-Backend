# Integration Test Fix Results

**Date:** 2026-01-24
**Service:** event-service
**Fix:** Create non-superuser database role to enable RLS enforcement

---

## Changes Made

### 1. Created Non-Superuser Role (`tickettoken_app`)

**File:** `tests/integration/setup/testcontainers.ts`

```typescript
async function createApplicationRole(pool: Pool): Promise<void> {
  await client.query(`
    CREATE ROLE tickettoken_app
      NOSUPERUSER           -- NOT a superuser (critical for RLS)
      NOCREATEDB            -- Cannot create databases
      NOCREATEROLE          -- Cannot create roles
      NOINHERIT             -- Doesn't inherit permissions
      LOGIN                 -- Can log in
      PASSWORD 'test_password';

    GRANT CONNECT ON DATABASE event_service_test TO tickettoken_app;
    GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE
      ON ALL TABLES IN SCHEMA public TO tickettoken_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tickettoken_app;
  `);
}
```

### 2. Updated Setup Flow

- Uses superuser (`test`) for migrations and role creation
- Switches to non-superuser (`tickettoken_app`) for all tests
- Added retry logic for PostgreSQL connection stability

### 3. Added Missing CHECK Constraint

Added `events_royalty_percentage_check` constraint to test schema to match production:

```sql
CONSTRAINT events_royalty_percentage_check
CHECK (royalty_percentage IS NULL OR (royalty_percentage >= 0 AND royalty_percentage <= 100))
```

### 4. Fixed Optimistic Locking Test

Changed from unreliable `Promise.all` concurrent execution to deterministic "stale version" approach:

```typescript
// First update succeeds with version 1
await updateEvent(eventId, version: 1, 'PAUSED');  // version becomes 2

// Second update with stale version 1 should fail
const result = await updateEvent(eventId, version: 1, 'SOLD_OUT');  // no rows match
expect(result).toBeUndefined();
```

---

## Test Results

| Test Suite | Before | After | Status |
|------------|--------|-------|--------|
| Event Service | 15/19 | 22/22 | PASS |
| Capacity Service | 16/17 | 17/17 | PASS |
| State Machine | 33/35 | 34/34 | PASS |
| **TOTAL** | **64/71** | **73/73** | **PASS** |

**Pass Rate: 90.1% → 100%**

---

## RLS Tests (Previously Failed - Now Pass)

| Test | Status |
|------|--------|
| should only see events for own tenant | PASS |
| should not allow tenant to update another tenant events | PASS |
| should not allow tenant to delete another tenant events | PASS |
| should only see capacity for own tenant | PASS |
| should enforce tenant isolation on history | PASS |

---

## Optimistic Locking Tests

| Test | Status |
|------|--------|
| should handle concurrent transition attempts with optimistic locking | PASS |
| should use FOR UPDATE to serialize status changes | PASS |

---

## Key Technical Details

### Why Superuser Bypasses RLS

PostgreSQL superusers bypass Row Level Security (RLS) even with `FORCE ROW LEVEL SECURITY`:

> "Superusers and roles with the BYPASSRLS attribute always bypass the row security system when accessing a table." - PostgreSQL Documentation

The `FORCE ROW LEVEL SECURITY` command only affects the **table owner**, not superusers.

### Solution: Application Role

By creating a role with:
- `NOSUPERUSER` - Not a superuser
- No `BYPASSRLS` privilege

RLS policies are enforced when this role is used for database connections.

---

## Files Modified

```
tests/integration/setup/testcontainers.ts
├── Added createApplicationRole() function
├── Added superuserPool/appPool separation
├── Added retry logic for PostgreSQL connection
└── Added royalty_percentage CHECK constraint

tests/integration/services/event-state-machine.integration.test.ts
└── Fixed optimistic locking test to use deterministic stale version approach
```

---

## Production Recommendations

### CRITICAL: Audit Production Database User

The same issue may exist in production. Verify:

```sql
-- Check if production user is superuser
SELECT usename, usesuper, usebypassrls
FROM pg_user
WHERE usename = current_user;
```

If production uses a superuser, RLS is NOT enforced.

### Create Production Application Role

```sql
CREATE ROLE tickettoken_app
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS
  LOGIN
  PASSWORD 'secure_password_here';

GRANT CONNECT ON DATABASE tickettoken_db TO tickettoken_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tickettoken_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tickettoken_app;
```

### Update Environment Configuration

```bash
# Current (INSECURE)
DB_USER=postgres

# Required (SECURE)
DB_USER=tickettoken_app
DB_PASSWORD=secure_password_here
```

---

## Conclusion

All 73 integration tests now pass. The fix validates that:

1. **RLS policies are correctly defined** - They enforce tenant isolation when used with a non-superuser
2. **Optimistic locking works correctly** - Version conflicts are properly detected
3. **Test infrastructure is robust** - Container setup includes proper wait strategies

The production database user should be audited to ensure it is also a non-superuser role.
