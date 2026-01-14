# Integration Service - Migration Consolidation Notes

## Overview

| Item | Value |
|------|-------|
| **Consolidation Date** | January 13, 2026 |
| **Source Migrations** | 3 files |
| **Consolidated To** | 001_baseline_integration_service.ts |
| **Total Tables** | 13 (all tenant-scoped) |

---

## Source Migrations Archived

| File | Original Purpose |
|------|------------------|
| 001_baseline_integration.ts | Initial 10 tables with external FKs |
| 002_add_missing_tables.ts | 3 additional tables (oauth_tokens, api_keys, templates) |
| 20260103_add_rls_policies.ts | RLS policies (wrong pattern, wrong table names) |

---

## Issues Fixed During Consolidation

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Zero UUID default on tenant_id | Removed default |
| 2 | External FK to tenants table | Removed (10 tables) |
| 3 | External FKs to users/venues | Converted to comments |
| 4 | Wrong RLS setting (`app.current_tenant`) | Changed to `app.current_tenant_id` |
| 5 | Zero UUID fallback in RLS | Removed COALESCE pattern |
| 6 | No FORCE RLS | Added to all 13 tables |
| 7 | No WITH CHECK clause | Added to all RLS policies |
| 8 | No system bypass | Added `app.is_system_user` check |
| 9 | Wrong table names in RLS migration | Fixed (sync_jobs→sync_queue, etc.) |
| 10 | `integration_service_admin` role | Excluded (infra concern) |
| 11 | uuid-ossp extension | Removed |

---

## Tables Summary

### All Tables Are Tenant-Scoped (13) — With RLS

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `integrations` | Master catalog of integrations | name, provider, category, status |
| `connections` | User/venue connections to integrations | integration_id, user_id, venue_id, tokens |
| `field_mappings` | Field transformation rules | connection_id, source_field, target_field |
| `webhooks` | Webhook event queue | connection_id, event_type, payload, status |
| `integration_configs` | Venue-specific configuration | venue_id, integration_type, tokens, config |
| `integration_health` | Health monitoring metrics | venue_id, integration_type, success_rate, uptime |
| `integration_webhooks` | Webhook event storage | venue_id, integration_type, event_type, payload |
| `sync_queue` | Sync job queue | venue_id, integration_type, sync_type, status |
| `sync_logs` | Sync history | venue_id, integration_type, started_at, counts |
| `integration_costs` | API usage and cost tracking | venue_id, integration_type, period, costs |
| `oauth_tokens` | OAuth token storage (KMS encrypted) | venue_id, integration_type, encrypted tokens |
| `venue_api_keys` | API key storage (KMS encrypted) | venue_id, integration_type, encrypted keys |
| `field_mapping_templates` | Reusable mapping templates | name, integration_type, mappings |

---

## External FK References (Comments Only)

| Table.Column | References | Service |
|--------------|------------|---------|
| `connections.user_id` | users(id) | auth-service |
| `connections.venue_id` | venues(id) | venue-service |
| `integration_configs.venue_id` | venues(id) | venue-service |
| `integration_health.venue_id` | venues(id) | venue-service |
| `integration_webhooks.venue_id` | venues(id) | venue-service |
| `sync_queue.venue_id` | venues(id) | venue-service |
| `sync_logs.venue_id` | venues(id) | venue-service |
| `integration_costs.venue_id` | venues(id) | venue-service |
| `oauth_tokens.venue_id` | venues(id) | venue-service |
| `venue_api_keys.venue_id` | venues(id) | venue-service |

---

## Internal FK References (Enforced)

| Table.Column | References | On Delete |
|--------------|------------|-----------|
| `connections.integration_id` | integrations(id) | CASCADE |
| `field_mappings.connection_id` | connections(id) | CASCADE |
| `webhooks.connection_id` | connections(id) | CASCADE |

---

## Unique Constraints

| Table | Columns |
|-------|---------|
| `integrations` | (tenant_id, name, provider) |
| `field_mappings` | (connection_id, source_field, target_field) |
| `integration_configs` | (venue_id, integration_type) |
| `integration_health` | (venue_id, integration_type) |
| `oauth_tokens` | (venue_id, integration_type) |
| `venue_api_keys` | (venue_id, integration_type, key_name) |

---

## RLS Policy Pattern

Applied to all 13 tables:
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

## Excluded Items

| Item | Reason |
|------|--------|
| `integration_service_admin` role | Infra concern |
| `uuid-ossp` extension | Not needed (use gen_random_uuid) |
| External FK to tenants table | Cross-service FK |
| External FKs to users/venues | Cross-service FKs |

---

## Security Notes

### Encrypted Fields
Several tables store KMS-encrypted sensitive data:
- `oauth_tokens`: access_token_encrypted, refresh_token_encrypted, id_token_encrypted
- `venue_api_keys`: api_key_encrypted, api_secret_encrypted, webhook_secret_encrypted
- `integration_configs`: access_token_encrypted, refresh_token_encrypted, api_key_encrypted
- `connections`: access_token_encrypted, refresh_token_encrypted

### KMS Integration
Tables with KMS encryption include:
- `kms_key_id` - Reference to the KMS key used
- `encryption_context` - Additional encryption context
- `token_version` / `key_version` - For key rotation tracking

---

## Breaking Changes

1. **tenant_id required** — No default value, must be explicitly provided
2. **RLS enforced** — All queries must set `app.current_tenant_id` or `app.is_system_user`
3. **External FKs removed** — Cross-service references no longer enforced at DB level

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
backend/services/integration-service/src/migrations/
├── 001_baseline_integration_service.ts  # Consolidated migration
├── CONSOLIDATION_NOTES.md               # This file
├── MIGRATIONS.md                        # Original documentation
└── archived/                            # Original migration files
    ├── 001_baseline_integration.ts
    ├── 002_add_missing_tables.ts
    └── 20260103_add_rls_policies.ts
```
