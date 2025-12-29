## File Service - Database Migrations Audit Report

**Audit Date:** December 28, 2025  
**Service:** file-service  
**Standard:** Docs/research/21-database-migrations.md

---

## Migration Files

| Migration | Purpose | Down Function |
|-----------|---------|---------------|
| 001_baseline_files.ts | Core tables | ✅ YES |
| 002_add_missing_tables.ts | Additional tables, RLS | ✅ YES |
| 003_add_storage_quotas.ts | Quota management | ✅ YES |

---

## Schema Quality

| Check | Severity | Status | Evidence |
|-------|----------|--------|----------|
| All migrations have down() | HIGH | ✅ PASS | All 3 have rollback |
| Primary keys defined | CRITICAL | ✅ PASS | UUID PKs on all tables |
| Foreign keys defined | CRITICAL | ⚠️ PARTIAL | Some missing (see below) |
| Indexes on query columns | HIGH | ✅ PASS | Comprehensive indexes |
| NOT NULL on required | HIGH | ⚠️ PARTIAL | Some nullable |
| CHECK constraints | MEDIUM | ✅ PASS | On storage_quotas |

---

## Missing Foreign Keys

| Table | Column | Should Reference |
|-------|--------|------------------|
| files | uploaded_by | users.id |
| files | tenant_id | tenants.id |
| files | venue_id | venues.id |
| file_uploads | user_id | users.id |
| file_access_logs | accessed_by | users.id |

---

## RLS Implementation

| Table | RLS Enabled | Policy |
|-------|-------------|--------|
| files | ❌ NO | N/A |
| file_shares | ✅ YES | tenant_isolation_policy |
| image_metadata | ✅ YES | tenant_isolation_policy |
| video_metadata | ✅ YES | tenant_isolation_policy |

**Critical Gap:** Main files table has NO RLS despite having tenant_id column.

---

## Knex Configuration

| Check | Severity | Status | Evidence |
|-------|----------|--------|----------|
| Pool min/max configured | HIGH | ✅ PASS | min: 2, max: 10 |
| Statement timeout | HIGH | ❌ MISSING | No afterCreate hook |
| SSL in production | CRITICAL | ⚠️ PARTIAL | rejectUnauthorized: false |
| Migration table name | MEDIUM | ✅ PASS | Custom table name |

---

## Migration Safety

| Check | Severity | Status |
|-------|----------|--------|
| Indexes created CONCURRENTLY | HIGH | ❌ MISSING |
| Lock timeout configured | HIGH | ❌ MISSING |
| Large table migrations batched | MEDIUM | ❌ MISSING |
| Backward compatible | HIGH | ✅ PASS |

---

## Summary

### Critical Issues (3)

| Issue | Recommendation |
|-------|----------------|
| No RLS on files table | Enable RLS with tenant policy |
| Missing foreign keys on files | Add FK constraints |
| SSL cert verification disabled | Set rejectUnauthorized: true |

### High Severity Issues (4)

| Issue | Recommendation |
|-------|----------------|
| No statement timeout | Add afterCreate hook |
| Indexes not CONCURRENTLY | Use CREATE INDEX CONCURRENTLY |
| No lock_timeout | Set in migrations |
| No pool acquire timeout | Configure acquireTimeoutMillis |

### Passed Checks

✅ All migrations have down functions  
✅ UUID primary keys on all tables  
✅ RLS on file_shares, image_metadata, video_metadata  
✅ Comprehensive indexes  
✅ CHECK constraints on quotas  
✅ Connection pool configured  

---

### Overall Database Migrations Score: **55/100**

**Risk Level:** HIGH
