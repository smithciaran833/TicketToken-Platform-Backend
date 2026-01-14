# Integration Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 3
> **Tables Created:** 13

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_integration.ts | Create 10 core integration tables |
| 2 | 002_add_missing_tables.ts | Add OAuth tokens, API keys, mapping templates |
| 3 | 20260103_add_rls_policies.ts | Add FORCE RLS with WITH CHECK |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled | From Migration |
|-------|-------------|---------------|-------------|----------------|
| integrations | uuid | ✅ | ✅ FORCE | 001 |
| connections | uuid | ✅ | ✅ FORCE | 001 |
| field_mappings | uuid | ✅ | ✅ FORCE | 001 |
| webhooks | uuid | ✅ | ✅ FORCE | 001 |
| integration_configs | uuid | ✅ | ✅ FORCE | 001 |
| integration_health | uuid | ✅ | ✅ FORCE | 001 |
| integration_webhooks | uuid | ✅ | ✅ FORCE | 001 |
| sync_queue | uuid | ✅ | ✅ FORCE | 001 |
| sync_logs | uuid | ✅ | ✅ FORCE | 001 |
| integration_costs | uuid | ✅ | ✅ FORCE | 001 |
| oauth_tokens | uuid | ✅ | ✅ | 002 |
| venue_api_keys | uuid | ✅ | ✅ | 002 |
| field_mapping_templates | uuid | ✅ | ✅ | 002 |

---

## Table Details

### integrations
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| name | varchar(255) | NO | |
| provider | varchar(100) | NO | |
| category | varchar(100) | NO | |
| status | varchar(50) | NO | 'active' |
| config | jsonb | YES | '{}' |
| credentials_encrypted | text | YES | |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| tenant_id | uuid | NO | '00000000-...-000001' |

### connections
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| integration_id | uuid | NO | FK → integrations.id |
| user_id | uuid | YES | FK → users.id |
| venue_id | uuid | YES | FK → venues.id |
| status | varchar(50) | NO | 'active' |
| access_token_encrypted | text | YES | |
| refresh_token_encrypted | text | YES | |
| token_expires_at | timestamptz | YES | |
| scopes | text[] | YES | '{}' |
| metadata | jsonb | YES | '{}' |
| last_sync_at | timestamptz | YES | |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| tenant_id | uuid | NO | '00000000-...-000001' |

### oauth_tokens (from 002)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| venue_id | uuid | NO | |
| integration_type | varchar(100) | NO | |
| provider | varchar(100) | NO | |
| access_token_encrypted | text | NO | |
| refresh_token_encrypted | text | YES | |
| id_token_encrypted | text | YES | |
| access_token_expires_at | timestamptz | YES | |
| refresh_token_expires_at | timestamptz | YES | |
| scopes | text[] | YES | '{}' |
| token_type | varchar(50) | YES | 'Bearer' |
| oauth_state | varchar(500) | YES | |
| oauth_state_expires_at | timestamptz | YES | |
| kms_key_id | varchar(500) | NO | |
| encryption_context | varchar(500) | YES | |
| token_version | integer | YES | 1 |
| last_rotated_at | timestamptz | YES | |
| last_validated_at | timestamptz | YES | |
| validation_status | varchar(50) | YES | 'valid' |
| provider_metadata | jsonb | YES | '{}' |
| rate_limit_info | jsonb | YES | '{}' |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | now() |
| tenant_id | uuid | NO | '00000000-...-000001' |

### venue_api_keys (from 002)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| venue_id | uuid | NO | |
| integration_type | varchar(100) | NO | |
| provider | varchar(100) | NO | |
| key_name | varchar(255) | NO | |
| api_key_encrypted | text | NO | |
| api_secret_encrypted | text | YES | |
| webhook_secret_encrypted | text | YES | |
| key_type | varchar(50) | NO | |
| environment | varchar(50) | YES | 'production' |
| status | varchar(50) | NO | 'active' |
| kms_key_id | varchar(500) | NO | |
| encryption_context | varchar(500) | YES | |
| key_version | integer | YES | 1 |
| last_rotated_at | timestamptz | YES | |
| last_used_at | timestamptz | YES | |
| last_validated_at | timestamptz | YES | |
| validation_status | varchar(50) | YES | 'valid' |
| allowed_ip_ranges | text[] | YES | '{}' |
| allowed_endpoints | text[] | YES | '{}' |
| expires_at | timestamptz | YES | |
| usage_count_24h | integer | YES | 0 |
| usage_count_30d | integer | YES | 0 |
| error_count_24h | integer | YES | 0 |
| usage_count_reset_at | timestamptz | YES | |
| provider_metadata | jsonb | YES | '{}' |
| rate_limit_info | jsonb | YES | '{}' |
| notes | text | YES | |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | now() |
| tenant_id | uuid | NO | '00000000-...-000001' |

---

## Foreign Keys

### Internal FKs
| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| connections | integration_id | integrations.id | CASCADE |
| field_mappings | connection_id | connections.id | CASCADE |
| webhooks | connection_id | connections.id | CASCADE |

### Cross-Service FKs
| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| integrations | tenant_id | tenants.id | RESTRICT |
| connections | user_id | users.id | SET NULL |
| connections | venue_id | venues.id | SET NULL |
| connections | tenant_id | tenants.id | RESTRICT |
| field_mappings | tenant_id | tenants.id | RESTRICT |
| webhooks | tenant_id | tenants.id | RESTRICT |
| integration_configs | venue_id | venues.id | CASCADE |
| integration_configs | tenant_id | tenants.id | RESTRICT |
| integration_health | venue_id | venues.id | CASCADE |
| integration_health | tenant_id | tenants.id | RESTRICT |
| integration_webhooks | venue_id | venues.id | SET NULL |
| integration_webhooks | tenant_id | tenants.id | RESTRICT |
| sync_queue | venue_id | venues.id | CASCADE |
| sync_queue | tenant_id | tenants.id | RESTRICT |
| sync_logs | venue_id | venues.id | CASCADE |
| sync_logs | tenant_id | tenants.id | RESTRICT |
| integration_costs | venue_id | venues.id | CASCADE |
| integration_costs | tenant_id | tenants.id | RESTRICT |
| oauth_tokens | venue_id | venues.id | CASCADE |
| venue_api_keys | venue_id | venues.id | CASCADE |

---

## RLS Policies

### From 001 (simple)
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

### From 20260103 (with FORCE and WITH CHECK)
```sql
CREATE POLICY tenant_isolation_policy ON {table}
FOR ALL
USING (tenant_id = COALESCE(
  current_setting('app.current_tenant_id', true)::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid
))
WITH CHECK (tenant_id = COALESCE(
  current_setting('app.current_tenant_id', true)::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid
))
```

---

## Unique Indexes

| Table | Index | Columns |
|-------|-------|---------|
| integrations | integrations_name_provider_unique | (name, provider) |
| field_mappings | field_mappings_connection_id_source_field_target_field_unique | (connection_id, source_field, target_field) |
| integration_configs | integration_configs_venue_integration_unique | (venue_id, integration_type) |
| integration_health | integration_health_venue_integration_unique | (venue_id, integration_type) |
| oauth_tokens | oauth_tokens_venue_integration_unique | (venue_id, integration_type) |
| venue_api_keys | venue_api_keys_venue_integration_key_name_unique | (venue_id, integration_type, key_name) |

---

## Database Roles Created

| Role | Purpose |
|------|---------|
| integration_service_admin | BYPASSRLS for background jobs |

---

## Cross-Service Dependencies

| External Table | Service | Referenced By |
|----------------|---------|---------------|
| tenants | auth-service | All tables (FK) |
| users | auth-service | connections.user_id |
| venues | venue-service | Many tables |

---

## ⚠️ Known Issues

### 1. RLS Session Variable Inconsistency
- 001: `app.current_tenant`
- 20260103: `app.current_tenant_id`

### 2. Tables in 20260103 May Not Exist
Migration 20260103 references tables not created in 001 or 002:
- sync_jobs
- webhook_events
- webhook_configs
- provider_credentials
- mapping_templates

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant | TEXT | RLS (001 policies) |
| app.current_tenant_id | UUID | RLS (20260103 policies) |

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
