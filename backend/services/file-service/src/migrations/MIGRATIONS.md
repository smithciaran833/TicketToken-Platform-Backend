# File Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 6
> **Tables Created:** 13
> **Functions Created:** 6

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_files.ts | Create 4 core file tables |
| 2 | 002_add_missing_tables.ts | Add AV scanning, shares, metadata tables |
| 3 | 003_add_storage_quotas.ts | Add quota and usage tracking tables |
| 4 | 20260104_add_idempotency_and_rls_force.ts | Add idempotency_keys, FORCE RLS |
| 5 | 20260104_add_rls_policies.ts | Enable RLS with policies on files |
| 6 | 20260104_database_hardening.ts | Add constraints, indexes, functions |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled | From Migration |
|-------|-------------|---------------|-------------|----------------|
| files | uuid | ✅ (003, 005) | ✅ FORCE | 001 |
| file_access_logs | uuid | ✅ (005) | ✅ FORCE | 001 |
| file_versions | uuid | ✅ (005) | ✅ FORCE | 001 |
| upload_sessions | uuid | ❌ | ❌ | 001 |
| av_scans | uuid | ❌ | ❌ | 002 |
| quarantined_files | uuid | ❌ | ❌ | 002 |
| file_uploads | uuid | ❌ | ❌ | 002 |
| file_shares | uuid | ✅ | ✅ | 002 |
| image_metadata | uuid | ✅ | ✅ | 002 |
| video_metadata | uuid | ✅ | ✅ | 002 |
| storage_quotas | uuid | ✅ | ❌ | 003 |
| storage_usage | uuid | ✅ | ❌ | 003 |
| quota_alerts | uuid | ❌ | ❌ | 003 |
| idempotency_keys | uuid | ✅ | ✅ FORCE | 20260104_idempotency |

---

## Table Details

### files
| Column | Type | Nullable | Default | Added In |
|--------|------|----------|---------|----------|
| id | uuid | NO | gen_random_uuid() | 001 |
| filename | varchar(255) | NO | | 001 |
| original_filename | varchar(255) | NO | | 001 |
| mime_type | varchar(100) | NO | | 001 |
| extension | varchar(20) | YES | | 001 |
| storage_provider | varchar(50) | NO | 'local' | 001 |
| bucket_name | varchar(255) | YES | | 001 |
| storage_path | text | NO | | 001 |
| cdn_url | text | YES | | 001 |
| size_bytes | bigint | NO | | 001 |
| hash_sha256 | varchar(64) | YES | | 001 |
| uploaded_by | uuid | YES | | 001 |
| entity_type | varchar(100) | YES | | 001 |
| entity_id | uuid | YES | | 001 |
| is_public | boolean | YES | false | 001 |
| access_level | varchar(50) | YES | 'private' | 001 |
| status | varchar(50) | NO | 'uploading' | 001 |
| processing_error | text | YES | | 001 |
| metadata | jsonb | YES | '{}' | 001 |
| tags | text[] | YES | '{}' | 001 |
| created_at | timestamp | YES | now() | 001 |
| updated_at | timestamp | YES | now() | 001 |
| deleted_at | timestamp | YES | | 001 |
| tenant_id | uuid | NO | | 003, 005 |
| venue_id | uuid | YES | | 003 |

### idempotency_keys (from 20260104_add_idempotency)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO | |
| idempotency_key | varchar(128) | NO | |
| request_hash | varchar(64) | YES | |
| endpoint | varchar(512) | NO | |
| method | varchar(10) | NO | |
| status | enum | YES | 'processing' |
| response | jsonb | YES | |
| file_id | uuid | YES | |
| file_hash | varchar(64) | YES | |
| recovery_point | varchar(64) | YES | |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | now() |
| expires_at | timestamp | NO | |

### storage_quotas (from 003)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES | |
| tenant_id | uuid | YES | |
| venue_id | uuid | YES | |
| max_storage_bytes | bigint | NO | |
| max_files | integer | YES | |
| max_file_size_bytes | bigint | YES | |
| limits_by_type | jsonb | YES | '{}' |
| soft_limit_percentage | integer | YES | 80 |
| send_warnings | boolean | YES | true |
| is_active | boolean | YES | true |
| notes | text | YES | |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | now() |

---

## Foreign Keys

| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| file_access_logs | file_id | files.id | CASCADE |
| file_versions | file_id | files.id | CASCADE |
| file_shares | file_id | files.id | CASCADE |
| file_shares | tenant_id | tenants.id | RESTRICT |
| image_metadata | file_id | files.id | CASCADE |
| image_metadata | tenant_id | tenants.id | RESTRICT |
| video_metadata | file_id | files.id | CASCADE |
| video_metadata | tenant_id | tenants.id | RESTRICT |
| quota_alerts | quota_id | storage_quotas.id | CASCADE |

---

## CHECK Constraints

### storage_quotas
| Constraint | Expression |
|------------|------------|
| chk_at_least_one_entity | user_id IS NOT NULL OR tenant_id IS NOT NULL OR venue_id IS NOT NULL |
| chk_positive_limits | max_storage_bytes > 0 |

### storage_usage
| Constraint | Expression |
|------------|------------|
| chk_at_least_one_entity_usage | user_id IS NOT NULL OR tenant_id IS NOT NULL OR venue_id IS NOT NULL |

### files (from 20260104_database_hardening)
| Constraint | Expression |
|------------|------------|
| check_files_status | status IN ('pending', 'uploading', 'processing', 'ready', 'failed', 'deleted') |
| check_files_size_positive | file_size IS NULL OR file_size >= 0 |

---

## RLS Policies

### files (from 20260104_add_rls_policies)
| Policy | Operation | Condition |
|--------|-----------|-----------|
| files_tenant_isolation_select | SELECT | tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR is_system_admin |
| files_tenant_isolation_insert | INSERT | tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR is_system_admin |
| files_tenant_isolation_update | UPDATE | same as above (USING + WITH CHECK) |
| files_tenant_isolation_delete | DELETE | same as above |

### file_shares, image_metadata, video_metadata (from 002)
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

### idempotency_keys (from 20260104_add_idempotency)
```sql
CREATE POLICY idempotency_keys_tenant_isolation ON idempotency_keys
FOR ALL
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
```

---

## Functions Created

### From 20260104_add_idempotency
| Function | Purpose |
|----------|---------|
| update_idempotency_updated_at() | Auto-update updated_at on idempotency_keys |
| cleanup_expired_idempotency_keys() | Delete expired idempotency keys |

### From 20260104_add_rls_policies
| Function | Purpose |
|----------|---------|
| set_tenant_context(uuid, boolean) | Set app.tenant_id and app.is_system_admin |
| set_tenant_id_on_insert() | Auto-set tenant_id from session on INSERT |

### From 20260104_database_hardening
| Function | Purpose |
|----------|---------|
| acquire_file_lock(uuid) | Advisory lock for concurrent file access |
| release_file_lock(uuid) | Release advisory lock |
| transition_file_status(uuid, uuid, text, text) | Atomic status transition |
| update_updated_at_column() | Auto-update updated_at trigger function |

---

## Triggers

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| idempotency_keys_updated_at | idempotency_keys | BEFORE UPDATE | update_idempotency_updated_at() |
| files_set_tenant_id | files | BEFORE INSERT | set_tenant_id_on_insert() |
| trigger_files_updated_at | files | BEFORE UPDATE | update_updated_at_column() |

---

## Indexes

### files
| Index | Type | Columns | Condition |
|-------|------|---------|-----------|
| idx_files_uploaded_by | BTREE | uploaded_by | |
| idx_files_entity | BTREE | (entity_type, entity_id) | |
| idx_files_status | BTREE | status | |
| idx_files_hash_sha256 | BTREE | hash_sha256 | |
| idx_files_created_at | BTREE | created_at | |
| idx_files_tenant_id | BTREE | tenant_id | |
| idx_files_venue_id | BTREE | venue_id | |
| idx_files_tenant_storage | BTREE | (tenant_id, size_bytes) | WHERE deleted_at IS NULL |
| idx_files_user_storage | BTREE | (uploaded_by, size_bytes) | WHERE deleted_at IS NULL |
| idx_files_venue_storage | BTREE | (venue_id, size_bytes) | WHERE deleted_at IS NULL |
| idx_files_tenant_id_created_at | BTREE | (tenant_id, created_at DESC) | |
| idx_files_hash_tenant_unique | UNIQUE | (file_hash, tenant_id) | WHERE deleted_at IS NULL AND file_hash IS NOT NULL |
| idx_files_s3_key_unique | UNIQUE | s3_key | WHERE deleted_at IS NULL |
| idx_files_tenant_status | BTREE | (tenant_id, status) | WHERE deleted_at IS NULL |
| idx_files_pending_created | BTREE | created_at | WHERE status = 'pending' AND deleted_at IS NULL |

### idempotency_keys
| Index | Type | Columns |
|-------|------|---------|
| (unnamed unique) | UNIQUE | (tenant_id, idempotency_key) |
| idx_idempotency_expires | BTREE | expires_at |
| idx_idempotency_file_hash | BTREE | (tenant_id, file_hash) |
| idx_idempotency_file_id | BTREE | file_id |

---

## Database Settings (from 20260104_database_hardening)
```sql
ALTER DATABASE CURRENT SET statement_timeout = '30s';
ALTER DATABASE CURRENT SET lock_timeout = '10s';
```

---

## Cross-Service Dependencies

| External Table | Service | Referenced By |
|----------------|---------|---------------|
| tenants | auth-service | file_shares, image_metadata, video_metadata |
| users | auth-service | uploaded_by (soft reference) |

---

## ⚠️ Known Issues

### 1. Inconsistent RLS Session Variables
Different migrations use different variables:
- 002: `app.current_tenant`
- 20260104_idempotency: `app.tenant_id`
- 20260104_rls_policies: `app.tenant_id` and `app.is_system_admin`

### 2. Missing tenant_id on Several Tables
These tables have no tenant isolation:
- upload_sessions
- av_scans
- quarantined_files
- file_uploads
- quota_alerts

### 3. files.tenant_id Added Twice
- 003 adds tenant_id (nullable)
- 005 may add again (checks first)
- 006 makes it NOT NULL

### 4. Possible Column Name Mismatch
- 006 references `file_hash` and `s3_key` columns
- 001 creates `hash_sha256` and `storage_path` columns
- May need column aliases or renames

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.tenant_id | UUID | RLS tenant isolation |
| app.current_tenant | TEXT | Legacy RLS (some tables) |
| app.is_system_admin | BOOLEAN | Admin bypass for RLS |

---

## Migration Commands
```bash
# Run migrations
npx knex migrate:latest --knexfile src/knexfile.ts

# Rollback
npx knex migrate:rollback --knexfile src/knexfile.ts

# Status
npx knex migrate:status --knexfile src/knexfile.ts
```

---

## Enums Used

### idempotency_keys.status
- processing
- completed
- failed
