# Search Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 1
> **Tables Created:** 3

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_search_consistency_tables.ts | Search index consistency tracking |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled |
|-------|-------------|---------------|-------------|
| index_versions | uuid | ✅ | ✅ |
| index_queue | uuid | ✅ | ✅ |
| read_consistency_tokens | token (string) | ✅ | ✅ |

---

## Table Details

### index_versions
Tracks index versions for eventual consistency.
- entity_type, entity_id, version
- index_status: PENDING, indexed
- retry_count, last_error
- Unique constraint on (entity_type, entity_id)

### index_queue
Pending index operations queue.
- entity_type, entity_id, operation (CREATE/UPDATE/DELETE)
- payload (jsonb), priority, version
- idempotency_key (unique)
- processed_at for tracking

### read_consistency_tokens
Client read tracking for consistency guarantees.
- token (primary key)
- client_id
- required_versions (jsonb): `{"events": {"id1": 2}, "venues": {"id3": 1}}`
- expires_at

---

## RLS Policies
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

Applied to all 3 tables.

---

## Foreign Keys

| Table | Column | References |
|-------|--------|------------|
| All tables | tenant_id | tenants.id (RESTRICT) |

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant | TEXT | RLS tenant isolation |

---

## Design Notes

This service implements eventual consistency tracking for search indexes.
- Write operations update `index_versions` with new version
- Changes queued in `index_queue` for async processing
- Clients can request `read_consistency_tokens` to ensure they see their writes
