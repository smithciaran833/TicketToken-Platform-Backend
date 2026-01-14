# File Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 13, 2026 |
| **Source Migrations** | 6 files |
| **Consolidated To** | 001_baseline_file_service.ts |
| **Total Tables** | 14 (13 tenant-scoped, 1 global) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_files.ts | Initial 4 tables (files, access_logs, versions, sessions) |
| 002_add_missing_tables.ts | 6 additional tables (av_scans, quarantine, uploads, shares, metadata) |
| 003_add_storage_quotas.ts | Storage quota tables, adds tenant_id to files |
| 20260104_add_idempotency_and_rls_force.ts | Idempotency keys table, FORCE RLS |
| 20260104_add_rls_policies.ts | RLS policies (wrong pattern) |
| 20260104_database_hardening.ts | Indexes, constraints (wrong column names) |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Missing tenant_id (5 tables) | Added tenant_id NOT NULL to all tenant tables |
| 2 | Nullable tenant_id (3 quota tables) | Changed to NOT NULL |
| 3 | Wrong RLS setting (`app.tenant_id`) | Changed to `app.current_tenant_id` |
| 4 | Wrong bypass setting (`app.is_system_admin`) | Changed to `app.is_system_user` |
| 5 | No FORCE RLS | Added to all 13 tenant tables |
| 6 | No WITH CHECK clause | Added to all RLS policies |
| 7 | Separate policies per operation | Consolidated to single FOR ALL policy |
| 8 | External FK to tenants | Converted to comments |
| 9 | Zero UUID default | Removed |
| 10 | Wrong column names in hardening | Fixed (`file_hash`→`hash_sha256`, `file_size`→`size_bytes`) |
| 11 | `set_tenant_context()` function | Removed |
| 12 | `set_tenant_id_on_insert()` function | Removed |
| 13 | Custom updated_at trigger functions | Replaced with standard `update_updated_at_column()` |

---

## Tables Summary

### Global Tables (1) — No RLS

| Table | Purpose | Notes |
|-------|---------|-------|
| `av_scans` | Virus scan cache | Lookup by file hash (global dedup) |

### Tenant-Scoped Tables (13) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `files` | Main file storage | filename, storage_path, size_bytes, hash_sha256 |
| `file_access_logs` | Access audit trail | file_id, accessed_by, access_type |
| `file_versions` | Version history | file_id, version_number, storage_path |
| `upload_sessions` | Chunked upload tracking | session_token, total_chunks, uploaded_chunks |
| `quarantined_files` | Infected files | original_path, quarantine_path, threats |
| `file_uploads` | Upload tracking | user_id, file_key, status |
| `file_shares` | Sharing permissions | file_id, shared_with_user_id, permission_level |
| `image_metadata` | Image processing data | file_id, width, height, thumbnails |
| `video_metadata` | Video processing data | file_id, duration, codec, bitrate |
| `storage_quotas` | Quota limits | max_storage_bytes, max_files |
| `storage_usage` | Usage tracking | total_storage_bytes, total_files |
| `quota_alerts` | Quota warnings | quota_id, alert_type, usage_percentage |
| `idempotency_keys` | Request deduplication | idempotency_key, endpoint, status |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `files.uploaded_by` | users(id) | auth-service |
| `files.venue_id` | venues(id) | venue-service |
| `file_access_logs.accessed_by` | users(id) | auth-service |
| `file_versions.created_by` | users(id) | auth-service |
| `upload_sessions.uploaded_by` | users(id) | auth-service |
| `file_uploads.user_id` | users(id) | auth-service |
| `file_shares.shared_with_user_id` | users(id) | auth-service |
| `file_shares.shared_by_user_id` | users(id) | auth-service |
| `storage_quotas.user_id` | users(id) | auth-service |
| `storage_quotas.venue_id` | venues(id) | venue-service |
| `storage_usage.user_id` | users(id) | auth-service |
| `storage_usage.venue_id` | venues(id) | venue-service |
| `quota_alerts.user_id` | users(id) | auth-service |
| `quota_alerts.venue_id` | venues(id) | venue-service |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `file_access_logs.file_id` | files(id) | CASCADE |
| `file_versions.file_id` | files(id) | CASCADE |
| `file_shares.file_id` | files(id) | CASCADE |
| `image_metadata.file_id` | files(id) | CASCADE |
| `video_metadata.file_id` | files(id) | CASCADE |
| `quota_alerts.quota_id` | storage_quotas(id) | CASCADE |

---

## Enums

| Enum | Values |
|------|--------|
| `idempotency_status` | processing, completed, failed |

---

## CHECK Constraints

| Constraint | Table | Rule |
|------------|-------|------|
| `check_files_status` | files | `status IN ('pending', 'uploading', 'processing', 'ready', 'failed', 'deleted')` |
| `check_files_size_positive` | files | `size_bytes >= 0` |
| `chk_positive_limits` | storage_quotas | `max_storage_bytes > 0` |

---

## Functions

| Function | Purpose | Status |
|----------|---------|--------|
| `update_updated_at_column()` | Standard trigger for updated_at | ✅ Kept |
| `cleanup_expired_idempotency_keys()` | Delete expired idempotency keys | ✅ Kept |

---

## Triggers

| Trigger | Table | Function |
|---------|-------|----------|
| `trigger_files_updated_at` | files | `update_updated_at_column()` |

---

## RLS Policy Pattern

Applied to all 13 tenant-scoped tables:
```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;

CREATE POLICY {table}_tenant_isolation ON {table}
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.is_system_user', true) = 'true'
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.is_system_user', true) = 'true'
  );
```

---

## Key Indexes

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_files_hash_tenant_unique` | files | Deduplication (partial, WHERE deleted_at IS NULL) |
| `idx_files_tenant_status` | files | Active files by tenant (partial) |
| `idx_files_tenant_created` | files | Chronological listing |
| `idx_av_scans_file_hash` | av_scans | Fast hash lookup |
| `idx_idempotency_keys_expires` | idempotency_keys | Cleanup queries |

---

## Excluded Items

| Item | Reason |
|------|--------|
| `set_tenant_context()` function | Use inline setting |
| `set_tenant_id_on_insert()` trigger | Not needed with proper app layer |
| `update_idempotency_updated_at()` function | Use standard function |
| `acquire_file_lock()` / `release_file_lock()` | Advisory locks not needed in baseline |
| `transition_file_status()` function | App layer concern |
| Database-level timeouts | Infrastructure concern |
| External FK to tenants table | Cross-service FK |

---

## Quota Table Design

Quota tables support flexible scoping while maintaining RLS:

| Scope | tenant_id | user_id | venue_id |
|-------|-----------|---------|----------|
| Tenant-wide | ✅ Required | NULL | NULL |
| Per-user | ✅ Required | ✅ Set | NULL |
| Per-venue | ✅ Required | NULL | ✅ Set |

`tenant_id` is always required for RLS. Business scope determined by which optional columns are set.

---

## Breaking Changes

1. **tenant_id required** — All 13 tenant tables now require tenant_id
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
3. **External FKs removed** — Cross-service references no longer enforced at DB level
4. **Column names fixed** — Uses `hash_sha256` not `file_hash`, `size_bytes` not `file_size`

---

## Migration Instructions

### For New Environments
Run consolidated baseline only:
```bash
npx knex migrate:latest
```

### For Existing Environments
If original migrations were already applied:
1. Mark them as complete in knex_migrations table
2. OR drop and recreate schema using consolidated baseline

---

## Files
```
backend/services/file-service/src/migrations/
├── 001_baseline_file_service.ts    # Consolidated migration
├── CONSOLIDATION_NOTES.md          # This file
├── MIGRATIONS.md                   # Original documentation
└── archived/                       # Original migration files
    ├── 001_baseline_files.ts
    ├── 002_add_missing_tables.ts
    ├── 003_add_storage_quotas.ts
    ├── 20260104_add_idempotency_and_rls_force.ts
    ├── 20260104_add_rls_policies.ts
    └── 20260104_database_hardening.ts
```
