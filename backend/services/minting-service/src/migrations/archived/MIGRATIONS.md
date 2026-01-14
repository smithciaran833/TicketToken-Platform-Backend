# Minting Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 1
> **Tables Created:** 5

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_minting.ts | Create NFT minting tables with RLS |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled |
|-------|-------------|---------------|-------------|
| collections | uuid | ✅ | ✅ |
| nft_mints | uuid | ✅ | ✅ |
| nfts | uuid | ✅ | ✅ |
| ticket_mints | uuid | ✅ | ✅ |
| minting_reconciliation_reports | uuid | ✅ | ✅ |

**Note:** All tenant_id defaults to `'00000000-0000-0000-0000-000000000000'`

---

## Table Details

### collections
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO | '00000000-...' |
| name | varchar(255) | NO | |
| symbol | varchar(50) | NO | |
| contract_address | varchar(255) | NO | UNIQUE |
| blockchain | varchar(50) | NO | |
| max_supply | integer | YES | |
| current_supply | integer | YES | 0 |
| metadata | jsonb | YES | '{}' |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | now() |

### nft_mints
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO | '00000000-...' |
| ticket_id | uuid | NO | |
| nft_id | uuid | YES | |
| status | varchar(50) | NO | 'pending' |
| transaction_hash | varchar(255) | YES | |
| blockchain | varchar(50) | NO | |
| error | text | YES | |
| retry_count | integer | YES | 0 |
| created_at | timestamp | YES | now() |
| completed_at | timestamp | YES | |

### nfts
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO | '00000000-...' |
| token_id | varchar(255) | NO | |
| contract_address | varchar(255) | NO | |
| owner_address | varchar(255) | NO | |
| metadata_uri | text | YES | |
| metadata | jsonb | YES | '{}' |
| blockchain | varchar(50) | NO | |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | now() |

### ticket_mints
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO | '00000000-...' |
| ticket_id | uuid | NO | |
| venue_id | uuid | NO | |
| status | varchar(50) | NO | 'pending' |
| transaction_signature | varchar(255) | YES | |
| mint_duration | integer | YES | |
| created_at | timestamp | YES | now() |
| updated_at | timestamp | YES | now() |

### minting_reconciliation_reports
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO | '00000000-...' |
| venue_id | uuid | NO | |
| report_date | timestamptz | NO | |
| total_checked | integer | YES | 0 |
| confirmed | integer | YES | 0 |
| not_found | integer | YES | 0 |
| pending | integer | YES | 0 |
| errors | integer | YES | 0 |
| discrepancy_count | integer | YES | 0 |
| discrepancy_rate | decimal(5,2) | YES | 0 |
| report_data | jsonb | YES | |
| created_at | timestamptz | YES | now() |

---

## RLS Policies
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

Applied to all 5 tables.

---

## Unique Indexes

| Table | Columns |
|-------|---------|
| collections | contract_address |
| nft_mints | (ticket_id, tenant_id) |
| nfts | (token_id, contract_address) |

---

## Cross-Service Dependencies

| External Table | Service | Referenced By |
|----------------|---------|---------------|
| tickets | ticket-service | nft_mints.ticket_id, ticket_mints.ticket_id |
| venues | venue-service | ticket_mints.venue_id, minting_reconciliation_reports.venue_id |

**Note:** No explicit FK constraints defined - soft references only.

---

## ⚠️ Known Issues

### 1. No FK Constraints
Tables reference tickets and venues but have no FK constraints defined.

### 2. Different Default Tenant
Uses `'00000000-0000-0000-0000-000000000000'` (all zeros) unlike other services that use `'00000000-0000-0000-0000-000000000001'`.

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant | TEXT | RLS tenant isolation |
