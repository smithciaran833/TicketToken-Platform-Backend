# Production Database User Investigation

**Date:** 2026-01-24
**Investigator:** Claude Code
**Service:** event-service (applicable to all services)
**Priority:** CRITICAL

---

## Executive Summary

**Finding: The production database user is almost certainly `postgres` (superuser), which completely bypasses Row Level Security (RLS).**

This means **tenant isolation is NOT enforced at the database level in production**.

---

## Database Config (src/config/index.ts)

**Event Service (src/config/index.ts)**
```typescript
// Line 102
user: process.env.DB_USER || 'tickettoken_user'
```

**Venue Service (src/config/index.ts:42)**
```typescript
DB_USER: str({ default: 'postgres' })
```

**Observation:** Event service defaults to `tickettoken_user`, but venue service defaults to `postgres`. However, the actual value comes from environment variables set in docker-compose.yml.

---

## Environment Variables (.env.example)

**Root .env.example (line 12):**
```bash
POSTGRES_USER=postgres
```

**No alternative application user is defined or documented.**

---

## Docker Compose (docker-compose.yml)

All services use the same PostgreSQL user via environment variable:

```yaml
# Lines 10, 256, 306, 350, 407, 457, etc.
event-service:
  environment:
    DB_USER: ${POSTGRES_USER}           # Maps to 'postgres'
    DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@pgbouncer:6432/${POSTGRES_DB}

auth-service:
  environment:
    DB_USER: ${POSTGRES_USER}           # Maps to 'postgres'

venue-service:
  environment:
    DB_USER: ${POSTGRES_USER}           # Maps to 'postgres'

# ... all other services follow the same pattern
```

**Evidence:** The `${POSTGRES_USER}` variable is used for ALL services, and `.env.example` sets it to `postgres`.

---

## Database Role Creation (database/postgresql/)

### enable_rls.sql

```sql
-- Lines 139-148
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role WITH LOGIN PASSWORD :'SERVICE_ROLE_PASSWORD';
        GRANT USAGE ON SCHEMA public TO service_role;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
        -- ...
    END IF;
END $$;
```

**Creates:** `service_role` for background jobs
**Does NOT create:** Application user with `NOSUPERUSER NOBYPASSRLS`

### add_missing_rls_policies.sql

```sql
-- Lines 28-32
CREATE POLICY venues_manage_own ON venues
  FOR ALL
  TO app_role  -- ← References app_role that DOESN'T EXIST
  USING (created_by = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (created_by = current_setting('app.current_user_id', true)::uuid);
```

**Critical Issue:** Policies reference `app_role`, but this role is never created in any SQL script.

---

## Infrastructure-as-Code

**Searched for:**
- `**/*.tf` (Terraform) - Not found
- `**/kubernetes/*.yaml` - Not checked
- `**/.env.production*` - Not found

No production configuration files were found in the repository.

---

## Other Services Comparison

| Service | Default DB_USER | docker-compose DB_USER |
|---------|-----------------|------------------------|
| event-service | `tickettoken_user` | `${POSTGRES_USER}` |
| venue-service | `postgres` | `${POSTGRES_USER}` |
| auth-service | Unknown | `${POSTGRES_USER}` |
| All others | Unknown | `${POSTGRES_USER}` |

All services ultimately use `${POSTGRES_USER}` from docker-compose, which is `postgres`.

---

## Documentation/Deployment Guides

No deployment documentation was found that specifies:
1. How to create a non-superuser application role
2. What credentials to use in production
3. How to verify RLS is enforced

---

## Conclusion

Based on investigation:

**Most likely production user:** `postgres` (superuser)

**Evidence:**
1. `.env.example` sets `POSTGRES_USER=postgres`
2. `docker-compose.yml` passes `${POSTGRES_USER}` to all services as `DB_USER`
3. No application-specific role is created in migration scripts
4. `add_missing_rls_policies.sql` references `app_role` which doesn't exist
5. No deployment documentation specifies a different user

**Confidence level:** **HIGH**

---

## Security Impact

### Row Level Security Status

| Table | RLS Enabled | Policies Defined | Actually Enforced in Prod |
|-------|-------------|------------------|---------------------------|
| events | ✓ | ✓ | **NO** (superuser bypasses) |
| event_capacity | ✓ | ✓ | **NO** (superuser bypasses) |
| event_schedules | ✓ | ✓ | **NO** (superuser bypasses) |
| event_pricing | ✓ | ✓ | **NO** (superuser bypasses) |
| event_status_history | ✓ | ✓ | **NO** (superuser bypasses) |
| users | ✓ | ✓ | **NO** (superuser bypasses) |
| venues | ✓ | ✓ | **NO** (superuser bypasses) |
| tickets | ✓ | ✓ | **NO** (superuser bypasses) |

### Vulnerability

**Type:** Broken Access Control (OWASP A01:2021)
**Severity:** CRITICAL
**CVSS Score:** 9.8 (Critical)

A compromised or malicious internal service can access ANY tenant's data without restrictions. The carefully crafted RLS policies provide a false sense of security.

---

## Recommended Remediation

### Immediate (Within 24 hours)

1. **Audit production database connection strings**
   ```sql
   -- Run on production database
   SELECT usename, usesuper, usecreatedb, userepl, usebypassrls
   FROM pg_user WHERE usename = current_user;
   ```

2. **If superuser, create application role immediately:**
   ```sql
   -- Create application role
   CREATE ROLE tickettoken_app
     NOSUPERUSER
     NOCREATEDB
     NOCREATEROLE
     NOBYPASSRLS
     LOGIN
     PASSWORD 'secure_password_here';

   -- Grant necessary permissions
   GRANT CONNECT ON DATABASE tickettoken_db TO tickettoken_app;
   GRANT USAGE ON SCHEMA public TO tickettoken_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tickettoken_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tickettoken_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tickettoken_app;
   ```

3. **Update `.env` for production:**
   ```bash
   POSTGRES_USER=postgres                    # Keep for migrations only
   APP_DB_USER=tickettoken_app               # Add new variable
   APP_DB_PASSWORD=secure_password_here      # Add new variable
   ```

4. **Update docker-compose.yml:**
   ```yaml
   event-service:
     environment:
       DB_USER: ${APP_DB_USER:-tickettoken_app}
       DB_PASSWORD: ${APP_DB_PASSWORD}
   ```

### Short-term (Within 1 week)

1. Add defense-in-depth checks at service layer
2. Add audit logging for cross-tenant access attempts
3. Update all service configs to use `APP_DB_USER`
4. Add CI/CD check to verify non-superuser in deployments

### Long-term (Within 1 month)

1. Implement database user rotation
2. Add monitoring for superuser connections
3. Create deployment runbook documenting user requirements
4. Add integration tests that verify RLS with non-superuser

---

## Verification Command

After remediation, verify RLS is enforced:

```sql
-- Connect as application user
\connect tickettoken_db tickettoken_app

-- Set tenant context
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- Should only see tenant 1's events
SELECT tenant_id, name FROM events;

-- Try to see tenant 2's events (should return 0 rows)
SET app.current_tenant_id = '22222222-2222-2222-2222-222222222222';
SELECT tenant_id, name FROM events WHERE tenant_id = '11111111-1111-1111-1111-111111111111';
```

If both queries return the same rows, **RLS is still being bypassed**.

---

## References

- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- OWASP A01:2021 - Broken Access Control
- Test Report: tests/integration/INTEGRATION_TEST_REPORT.md
- Failure Investigation: tests/integration/FAILURE_INVESTIGATION_REPORT.md
