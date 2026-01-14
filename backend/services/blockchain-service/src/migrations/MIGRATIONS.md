# Blockchain Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 8
> **Tables Created:** 8
> **Functions Created:** 2

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_blockchain_service.ts | Create 6 core tables |
| 2 | 002_add_rls_force_and_fix_tenant_defaults.ts | FORCE RLS, helper functions, audit table |
| 3 | 003_add_check_constraints.ts | Add validation constraints |
| 4 | 004_add_migration_safety.ts | Create migration_config table |
| 5 | 005_add_wallet_soft_delete_columns.ts | Add soft delete columns |
| 6 | 006_add_partial_unique_indexes.ts | Add tenant-aware partial unique indexes |
| 7 | 007_fix_foreign_key_actions.ts | Change CASCADE to RESTRICT |
| 8 | 008_ensure_extensions.ts | Ensure uuid-ossp, pgcrypto extensions |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled | From Migration |
|-------|-------------|---------------|-------------|----------------|
| wallet_addresses | uuid | ✅ | ✅ FORCE | 001 |
| user_wallet_connections | uuid | ✅ | ✅ FORCE | 001 |
| treasury_wallets | uuid | ✅ | ✅ FORCE | 001 |
| blockchain_events | uuid | ✅ | ✅ FORCE | 001 |
| blockchain_transactions | uuid | ✅ | ✅ FORCE | 001 |
| mint_jobs | uuid | ✅ | ✅ FORCE | 001 |
| blockchain_tenant_audit | serial | ❌ | ❌ | 002 |
| migration_config | serial | ❌ | ❌ | 004 |

---

## Table Details

### wallet_addresses
| Column | Type | Nullable | Default | Added In |
|--------|------|----------|---------|----------|
| id | uuid | NO | uuid_generate_v4() | 001 |
| user_id | uuid | NO | FK → users.id | 001 |
| wallet_address | varchar(255) | NO | | 001 |
| blockchain_type | varchar(50) | NO | 'SOLANA' | 001 |
| is_primary | boolean | YES | false | 001 |
| balance | decimal(20,8) | YES | 0 | 001 |
| last_sync_at | timestamptz | YES | | 001 |
| verified_at | timestamptz | YES | | 001 |
| created_at | timestamptz | YES | now() | 001 |
| updated_at | timestamptz | YES | now() | 001 |
| deleted_at | timestamptz | YES | | 001, 005 |
| deleted_by | uuid | YES | | 005 |
| disconnection_reason | varchar(500) | YES | | 005 |
| tenant_id | uuid | NO | (no default after 002) | 001 |

### user_wallet_connections
| Column | Type | Nullable | Default | Added In |
|--------|------|----------|---------|----------|
| id | uuid | NO | uuid_generate_v4() | 001 |
| user_id | uuid | NO | FK → users.id | 001 |
| wallet_address | varchar(255) | NO | | 001 |
| signature_proof | text | YES | | 001 |
| connected_at | timestamptz | YES | now() | 001 |
| is_primary | boolean | YES | false | 001 |
| disconnected_at | timestamptz | YES | | 001 |
| connection_ip | varchar(45) | YES | | 005 |
| connection_type | varchar(20) | YES | 'CONNECT' | 005 |
| disconnection_reason | varchar(500) | YES | | 005 |
| tenant_id | uuid | NO | (no default after 002) | 001 |

### treasury_wallets
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| wallet_address | varchar(255) | NO | UNIQUE |
| blockchain_type | varchar(50) | NO | 'SOLANA' |
| purpose | varchar(100) | NO | TREASURY, FEE_COLLECTION, ROYALTY |
| is_active | boolean | YES | true |
| balance | decimal(20,9) | YES | 0 |
| last_balance_update | timestamptz | YES | |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| tenant_id | uuid | NO | (no default after 002) |

### blockchain_events
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| event_type | varchar(100) | NO | MINT, TRANSFER, BURN, ERROR, RAW_LOGS |
| program_id | varchar(255) | NO | |
| transaction_signature | varchar(255) | YES | |
| slot | bigint | YES | |
| event_data | jsonb | YES | '{}' |
| processed | boolean | YES | false |
| processed_at | timestamptz | YES | |
| created_at | timestamptz | YES | now() |
| tenant_id | uuid | NO | (no default after 002) |

### blockchain_transactions
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| ticket_id | uuid | YES | FK → tickets.id |
| type | varchar(50) | NO | MINT, TRANSFER, BURN |
| status | varchar(50) | NO | PENDING, CONFIRMED, FAILED |
| transaction_signature | varchar(255) | YES | |
| slot_number | bigint | YES | |
| metadata | jsonb | YES | '{}' |
| error_message | text | YES | |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| tenant_id | uuid | NO | (no default after 002) |

### mint_jobs
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| order_id | uuid | YES | FK → orders.id |
| ticket_id | uuid | YES | FK → tickets.id |
| status | varchar(50) | NO | 'pending' |
| nft_address | varchar(255) | YES | |
| error | text | YES | |
| metadata | jsonb | YES | '{}' |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| completed_at | timestamptz | YES | |
| tenant_id | uuid | NO | (no default after 002) |

### blockchain_tenant_audit
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | serial | NO | PRIMARY KEY |
| table_name | varchar(100) | NO | |
| operation | varchar(10) | NO | |
| record_id | uuid | YES | |
| tenant_id | uuid | YES | |
| old_tenant_id | uuid | YES | |
| new_tenant_id | uuid | YES | |
| changed_by | text | YES | current_user |
| session_tenant | text | YES | current_setting('app.current_tenant_id', TRUE) |
| changed_at | timestamptz | YES | now() |

### migration_config
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | serial | NO | PRIMARY KEY |
| key | varchar(100) | NO | UNIQUE |
| value | text | NO | |
| description | text | YES | |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | now() |

---

## Foreign Keys

| Table | Column | References | On Delete | Changed In |
|-------|--------|------------|-----------|------------|
| wallet_addresses | user_id | users.id | RESTRICT | 001→007 |
| wallet_addresses | tenant_id | tenants.id | RESTRICT | 001 |
| user_wallet_connections | user_id | users.id | RESTRICT | 001→007 |
| user_wallet_connections | tenant_id | tenants.id | RESTRICT | 001 |
| treasury_wallets | tenant_id | tenants.id | RESTRICT | 001 |
| blockchain_events | tenant_id | tenants.id | RESTRICT | 001 |
| blockchain_transactions | ticket_id | tickets.id | SET NULL | 001 |
| blockchain_transactions | tenant_id | tenants.id | RESTRICT | 001 |
| mint_jobs | order_id | orders.id | CASCADE | 001 |
| mint_jobs | ticket_id | tickets.id | CASCADE | 001 |
| mint_jobs | tenant_id | tenants.id | RESTRICT | 001 |

---

## Indexes

### wallet_addresses
| Index | Type | Columns | Condition |
|-------|------|---------|-----------|
| (from 001) | BTREE | user_id | |
| (from 001) | BTREE | wallet_address | |
| (from 001) | BTREE | blockchain_type | |
| (from 001) | BTREE | deleted_at | |
| (from 001) | BTREE | tenant_id | |
| (from 001) | UNIQUE | (user_id, wallet_address) | |
| idx_wallet_addresses_active | BTREE | (user_id, is_primary) | WHERE deleted_at IS NULL |
| idx_wallet_addresses_tenant_user_active | UNIQUE | (tenant_id, user_id, wallet_address) | WHERE deleted_at IS NULL |
| idx_wallet_addresses_deleted | BTREE | deleted_at | WHERE deleted_at IS NOT NULL |
| idx_wallet_addresses_tenant_active | BTREE | tenant_id | WHERE deleted_at IS NULL |

### user_wallet_connections
| Index | Type | Columns | Condition |
|-------|------|---------|-----------|
| (from 001) | BTREE | user_id | |
| (from 001) | BTREE | wallet_address | |
| (from 001) | BTREE | connected_at | |
| (from 001) | BTREE | tenant_id | |
| idx_user_wallet_connections_tenant_user_active | UNIQUE | (tenant_id, user_id, wallet_address) | WHERE deleted_at IS NULL |
| idx_user_wallet_connections_deleted | BTREE | deleted_at | WHERE deleted_at IS NOT NULL |
| idx_user_wallet_connections_tenant_active | BTREE | tenant_id | WHERE deleted_at IS NULL |

### treasury_wallets
| Index | Type | Columns |
|-------|------|---------|
| (from 001) | BTREE | blockchain_type |
| (from 001) | BTREE | purpose |
| (from 001) | BTREE | is_active |
| (from 001) | BTREE | tenant_id |
| (implicit) | UNIQUE | wallet_address |

### blockchain_events
| Index | Type | Columns |
|-------|------|---------|
| (from 001) | BTREE | event_type |
| (from 001) | BTREE | program_id |
| (from 001) | BTREE | transaction_signature |
| (from 001) | BTREE | processed |
| (from 001) | BTREE | created_at |
| (from 001) | BTREE | (event_type, processed) |
| (from 001) | BTREE | tenant_id |

### blockchain_transactions
| Index | Type | Columns |
|-------|------|---------|
| (from 001) | BTREE | ticket_id |
| (from 001) | BTREE | type |
| (from 001) | BTREE | status |
| (from 001) | BTREE | transaction_signature |
| (from 001) | BTREE | created_at |
| (from 001) | BTREE | tenant_id |

### mint_jobs
| Index | Type | Columns |
|-------|------|---------|
| (from 001) | BTREE | order_id |
| (from 001) | BTREE | ticket_id |
| (from 001) | BTREE | status |
| (from 001) | BTREE | created_at |
| (from 001) | BTREE | (status, created_at) |
| (from 001) | BTREE | tenant_id |

### blockchain_tenant_audit
| Index | Type | Columns |
|-------|------|---------|
| idx_blockchain_tenant_audit_tenant | BTREE | tenant_id |
| idx_blockchain_tenant_audit_changed_at | BTREE | changed_at |

---

## CHECK Constraints (from 003)

### blockchain_transactions
| Constraint | Expression |
|------------|------------|
| chk_blockchain_transactions_type | type IN ('MINT', 'TRANSFER', 'BURN', 'METADATA_UPDATE', 'VERIFY_COLLECTION') |
| chk_blockchain_transactions_status | status IN ('PENDING', 'MINTING', 'PROCESSING', 'CONFIRMED', 'FINALIZED', 'FAILED', 'EXPIRED') |
| chk_blockchain_transactions_slot_non_negative | slot_number IS NULL OR slot_number >= 0 |
| chk_blockchain_transactions_signature_length | transaction_signature length 64-128 |
| chk_blockchain_transactions_mint_address_length | mint_address length 32-44 |

### All tables with tenant_id
| Constraint | Expression |
|------------|------------|
| chk_{table}_tenant_id_format | tenant_id IS NOT NULL AND tenant_id != '00000000-0000-0000-0000-000000000000' |

---

## RLS Policies

### From 001 (simple)
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

### From 002 (granular with FORCE)
```sql
-- SELECT
CREATE POLICY tenant_isolation_select ON {table}
FOR SELECT USING (
  tenant_id::text = current_tenant_id()
  OR is_admin_user()
  OR current_tenant_id() IS NULL
);

-- INSERT
CREATE POLICY tenant_isolation_insert ON {table}
FOR INSERT WITH CHECK (
  tenant_id::text = current_tenant_id()
  OR is_admin_user()
  OR current_tenant_id() IS NULL
);

-- UPDATE
CREATE POLICY tenant_isolation_update ON {table}
FOR UPDATE USING (...) WITH CHECK (...);

-- DELETE
CREATE POLICY tenant_isolation_delete ON {table}
FOR DELETE USING (...);
```

Applied to: wallet_addresses, user_wallet_connections, treasury_wallets, blockchain_events, blockchain_transactions, mint_jobs

---

## Functions Created

### From 002
| Function | Type | Purpose |
|----------|------|---------|
| current_tenant_id() | SECURITY DEFINER STABLE | Get app.current_tenant_id from session |
| is_admin_user() | SECURITY DEFINER STABLE | Get app.is_admin from session |

### Exported Helpers (from 004)
| Function | Purpose |
|----------|---------|
| applyMigrationSafetySettings(knex) | Set lock_timeout=10s, statement_timeout=60s |
| removeMigrationSafetySettings(knex) | Reset to defaults |
| safeAlterTable(knex, tableName, alterFn, options) | Safe ALTER with timeouts |
| createIndexConcurrently(knex, tableName, indexName, columns, options) | Non-blocking index creation |
| dropIndexConcurrently(knex, indexName) | Non-blocking index drop |

---

## Extensions Required (from 008)

| Extension | Purpose |
|-----------|---------|
| uuid-ossp | uuid_generate_v4() |
| pgcrypto | gen_random_uuid() |
| btree_gin | GIN indexes on standard types (optional) |

---

## Cross-Service Dependencies

| External Table | Service | Referenced By |
|----------------|---------|---------------|
| tenants | auth-service | All 6 core tables |
| users | auth-service | wallet_addresses, user_wallet_connections |
| tickets | ticket-service | blockchain_transactions, mint_jobs |
| orders | order-service | mint_jobs |

---

## ⚠️ Known Issues

### 1. RLS Setting Name Inconsistency
- 001 uses: `app.current_tenant`
- 002 uses: `app.current_tenant_id`
- **These are different session variables!**

### 2. Missing deleted_at on user_wallet_connections
- 006 creates partial index on `user_wallet_connections.deleted_at`
- But this column doesn't exist (only `disconnected_at`)

### 3. Cross-Service Table Modifications
Migration 003 adds constraints to tables owned by other services:
- tickets (ticket-service)
- events (event-service)
- wallets (not found)
- nft_mints (minting-service?)

### 4. References Non-Existent Tables
Migration 007 references:
- nft_mints
- mint_requests
- idempotency_keys
These don't exist in blockchain-service migrations.

### 5. Duplicate Extension Creation
008 creates uuid-ossp but auth-service also creates it.

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant | TEXT | Used by 001 policies |
| app.current_tenant_id | TEXT | Used by 002 policies, helper functions |
| app.is_admin | BOOLEAN | Admin bypass for RLS |

---

## Database Roles Created

| Role | Purpose |
|------|---------|
| blockchain_app | Application role with limited permissions |

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

## Seed Data (from 004)
```sql
INSERT INTO migration_config (key, value, description) VALUES
('lock_timeout', '10s', 'Maximum time to wait for database locks during migrations'),
('statement_timeout', '60s', 'Maximum execution time for a single migration statement'),
('one_change_per_migration', 'true', 'Best practice: Each migration should do one logical change'),
('concurrent_index_threshold', '1000000', 'Row count above which indexes should be created CONCURRENTLY');
```
