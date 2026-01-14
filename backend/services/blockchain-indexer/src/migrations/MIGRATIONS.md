# Blockchain Indexer - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 3
> **Tables Created:** 7

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_blockchain_indexer.ts | Create 6 core tables with RLS |
| 2 | 20260102_add_failed_writes_table.ts | Dead letter queue for MongoDB writes |
| 3 | 20260102_add_rls_force.ts | Add FORCE RLS to tables |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled | From Migration |
|-------|-------------|---------------|-------------|----------------|
| indexer_state | integer (singleton) | ✅ | ✅ FORCE | 001 |
| indexed_transactions | uuid | ✅ | ✅ FORCE | 001 |
| marketplace_activity | uuid | ✅ | ✅ | 001 |
| reconciliation_runs | uuid | ✅ | ✅ | 001 |
| ownership_discrepancies | uuid | ✅ | ✅ | 001 |
| reconciliation_log | uuid | ✅ | ✅ | 001 |
| failed_mongodb_writes | string(128) | ❌ | ❌ | 20260102_add_failed |

---

## Table Details

### indexer_state (Singleton Pattern)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NO | (always 1) |
| last_processed_slot | bigint | NO | 0 |
| last_processed_signature | varchar(255) | YES | |
| indexer_version | varchar(20) | NO | '1.0.0' |
| is_running | boolean | YES | false |
| started_at | timestamptz | YES | |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| tenant_id | uuid | NO | '00000000-0000-0000-0000-000000000001' |

### indexed_transactions
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| signature | varchar(255) | NO | UNIQUE |
| slot | bigint | NO | |
| block_time | timestamptz | YES | |
| instruction_type | varchar(50) | NO | MINT_NFT, TRANSFER, BURN, UNKNOWN |
| processed_at | timestamptz | YES | now() |
| tenant_id | uuid | NO | '00000000-0000-0000-0000-000000000001' |

### marketplace_activity
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| token_id | varchar(255) | NO | |
| ticket_id | uuid | YES | FK → tickets.id |
| marketplace | varchar(100) | NO | Magic Eden, Tensor, etc. |
| activity_type | varchar(50) | NO | LIST, SALE, DELIST, BID, etc. |
| price | decimal(20,9) | YES | |
| seller | varchar(255) | YES | |
| buyer | varchar(255) | YES | |
| transaction_signature | varchar(255) | NO | UNIQUE |
| block_time | timestamptz | YES | |
| indexed_at | timestamptz | YES | now() |
| tenant_id | uuid | NO | '00000000-0000-0000-0000-000000000001' |

### reconciliation_runs
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| started_at | timestamptz | YES | now() |
| completed_at | timestamptz | YES | |
| status | varchar(50) | NO | 'RUNNING' |
| tickets_checked | integer | YES | 0 |
| discrepancies_found | integer | YES | 0 |
| discrepancies_resolved | integer | YES | 0 |
| duration_ms | integer | YES | |
| error_message | text | YES | |
| tenant_id | uuid | NO | '00000000-0000-0000-0000-000000000001' |

### ownership_discrepancies
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| ticket_id | uuid | NO | FK → tickets.id |
| discrepancy_type | varchar(100) | NO | |
| database_value | text | YES | |
| blockchain_value | text | YES | |
| resolved | boolean | YES | false |
| detected_at | timestamptz | YES | now() |
| resolved_at | timestamptz | YES | |
| tenant_id | uuid | NO | '00000000-0000-0000-0000-000000000001' |

### reconciliation_log
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| reconciliation_run_id | uuid | NO | FK → reconciliation_runs.id |
| ticket_id | uuid | NO | FK → tickets.id |
| field_name | varchar(100) | NO | |
| old_value | text | YES | |
| new_value | text | YES | |
| source | varchar(50) | NO | 'blockchain' |
| changed_at | timestamptz | YES | now() |
| tenant_id | uuid | NO | '00000000-0000-0000-0000-000000000001' |

### failed_mongodb_writes
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| signature | varchar(128) | NO | PRIMARY KEY |
| slot | bigint | NO | |
| error_message | text | YES | |
| error_code | varchar(50) | YES | |
| last_error | text | YES | |
| retry_count | integer | YES | 0 |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | |
| resolved_at | timestamp | YES | |
| resolution_status | varchar(50) | YES | 'retried', 'manual', 'skipped' |

---

## Foreign Keys

| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| indexer_state | tenant_id | tenants.id | RESTRICT |
| indexed_transactions | tenant_id | tenants.id | RESTRICT |
| marketplace_activity | ticket_id | tickets.id | SET NULL |
| marketplace_activity | tenant_id | tenants.id | RESTRICT |
| reconciliation_runs | tenant_id | tenants.id | RESTRICT |
| ownership_discrepancies | ticket_id | tickets.id | CASCADE |
| ownership_discrepancies | tenant_id | tenants.id | RESTRICT |
| reconciliation_log | reconciliation_run_id | reconciliation_runs.id | CASCADE |
| reconciliation_log | ticket_id | tickets.id | CASCADE |
| reconciliation_log | tenant_id | tenants.id | RESTRICT |

---

## Indexes

### indexer_state
| Index | Columns |
|-------|---------|
| indexer_state_tenant_id_idx | tenant_id |

### indexed_transactions
| Index | Columns |
|-------|---------|
| (implicit unique) | signature |
| indexed_transactions_signature_idx | signature |
| indexed_transactions_slot_idx | slot |
| indexed_transactions_instruction_type_idx | instruction_type |
| indexed_transactions_processed_at_idx | processed_at |
| indexed_transactions_tenant_id_idx | tenant_id |

### marketplace_activity
| Index | Columns |
|-------|---------|
| (implicit unique) | transaction_signature |
| marketplace_activity_token_id_idx | token_id |
| marketplace_activity_ticket_id_idx | ticket_id |
| marketplace_activity_marketplace_idx | marketplace |
| marketplace_activity_activity_type_idx | activity_type |
| marketplace_activity_transaction_signature_idx | transaction_signature |
| marketplace_activity_block_time_idx | block_time |
| marketplace_activity_tenant_id_idx | tenant_id |

### reconciliation_runs
| Index | Columns |
|-------|---------|
| reconciliation_runs_started_at_idx | started_at |
| reconciliation_runs_status_idx | status |
| reconciliation_runs_tenant_id_idx | tenant_id |

### ownership_discrepancies
| Index | Columns |
|-------|---------|
| ownership_discrepancies_ticket_id_idx | ticket_id |
| ownership_discrepancies_discrepancy_type_idx | discrepancy_type |
| ownership_discrepancies_resolved_idx | resolved |
| ownership_discrepancies_detected_at_idx | detected_at |
| ownership_discrepancies_tenant_id_idx | tenant_id |

### reconciliation_log
| Index | Columns |
|-------|---------|
| reconciliation_log_reconciliation_run_id_idx | reconciliation_run_id |
| reconciliation_log_ticket_id_idx | ticket_id |
| reconciliation_log_field_name_idx | field_name |
| reconciliation_log_changed_at_idx | changed_at |
| reconciliation_log_tenant_id_idx | tenant_id |

### failed_mongodb_writes
| Index | Columns |
|-------|---------|
| failed_mongodb_writes_created_at_idx | created_at |
| failed_mongodb_writes_retry_count_idx | retry_count |
| failed_mongodb_writes_resolved_at_idx | resolved_at |

---

## RLS Policies

### From 001_baseline (6 tables)
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

Applied to: indexer_state, indexed_transactions, marketplace_activity, reconciliation_runs, ownership_discrepancies, reconciliation_log

### From 20260102_add_rls_force (additional policies)
```sql
CREATE POLICY {table}_tenant_isolation ON {table}
FOR ALL
USING (
  tenant_id IS NULL OR
  tenant_id = current_setting('app.tenant_id', true)::uuid
)
WITH CHECK (
  tenant_id IS NULL OR
  tenant_id = current_setting('app.tenant_id', true)::uuid
)
```

**Note:** This migration also enables FORCE RLS on tables.

---

## Cross-Service Dependencies

| External Table | Service | Referenced By |
|----------------|---------|---------------|
| tenants | auth-service | All tables (tenant_id FK) |
| tickets | ticket-service | marketplace_activity, ownership_discrepancies, reconciliation_log |

---

## ⚠️ Known Issues

### 1. RLS Setting Name Inconsistency
- 001 uses: `app.current_tenant`
- 20260102_add_rls_force uses: `app.tenant_id`
- **These are different session variables!**

### 2. References Non-Existent Tables in 20260102_add_rls_force
Migration tries to add FORCE RLS to:
- wallet_activity (doesn't exist)
- marketplace_events (doesn't exist)
- nft_ownership (doesn't exist)

### 3. No tenant_id on failed_mongodb_writes
- Table has no multi-tenancy support
- No RLS policy

### 4. Duplicate RLS Policies
- 001 creates `tenant_isolation_policy`
- 20260102 creates `{table}_tenant_isolation`
- Both may exist on same table

---

## Session Variables Required

| Variable | Used By | Type |
|----------|---------|------|
| app.current_tenant | 001 policies | TEXT (UUID cast) |
| app.tenant_id | 20260102 policies | UUID |

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
