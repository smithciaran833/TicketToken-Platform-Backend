# Marketplace Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 1
> **Tables Created:** 11
> **Functions Created:** 3

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_marketplace.ts | Create all marketplace tables, functions, RLS |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled | Notes |
|-------|-------------|---------------|-------------|-------|
| marketplace_listings | uuid | ✅ (NO DEFAULT) | ✅ | Main listings table |
| marketplace_transfers | uuid | ✅ (NO DEFAULT) | ✅ | Transfer records |
| platform_fees | uuid | ✅ (NO DEFAULT) | ✅ | Fee tracking |
| venue_marketplace_settings | venue_id (uuid) | ✅ (NO DEFAULT) | ✅ | Per-venue config |
| marketplace_price_history | uuid | ✅ (NO DEFAULT) | ✅ | Price change audit |
| marketplace_disputes | uuid | ✅ (NO DEFAULT) | ✅ | Dispute tracking |
| dispute_evidence | uuid | ✅ (NO DEFAULT) | ✅ | Evidence for disputes |
| tax_transactions | uuid | ✅ (NO DEFAULT) | ✅ | Tax reporting |
| anti_bot_activities | uuid | ✅ (NO DEFAULT) | ✅ | Bot detection |
| anti_bot_violations | uuid | ✅ (NO DEFAULT) | ✅ | Bot violations |
| marketplace_blacklist | uuid | ✅ (NO DEFAULT) | ✅ | Banned users/wallets |

**IMPORTANT:** All tables have `tenant_id NOT NULL` with NO default value. This is intentional to prevent silent data leakage if tenant context fails.

---

## Table Details

### marketplace_listings
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| ticket_id | uuid | NO | UNIQUE, FK → tickets.id |
| seller_id | uuid | NO | FK → users.id |
| event_id | uuid | NO | FK → events.id |
| venue_id | uuid | NO | FK → venues.id |
| price | integer | NO | (cents) |
| original_face_value | integer | NO | (cents) |
| price_multiplier | decimal(5,2) | YES | |
| status | enum | NO | 'active' |
| listed_at | timestamptz | YES | now() |
| sold_at | timestamptz | YES | |
| expires_at | timestamptz | YES | |
| cancelled_at | timestamptz | YES | |
| listing_signature | varchar(255) | YES | |
| wallet_address | varchar(255) | NO | |
| program_address | varchar(255) | YES | |
| requires_approval | boolean | YES | false |
| approved_at | timestamptz | YES | |
| approved_by | uuid | YES | FK → users.id |
| approval_notes | text | YES | |
| view_count | integer | YES | 0 |
| favorite_count | integer | YES | 0 |
| accepts_fiat_payment | boolean | YES | false |
| accepts_crypto_payment | boolean | YES | true |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| deleted_at | timestamptz | YES | |
| tenant_id | uuid | NO | FK → tenants.id |

### marketplace_transfers
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| listing_id | uuid | NO | FK → marketplace_listings.id |
| buyer_id | uuid | NO | FK → users.id |
| seller_id | uuid | NO | FK → users.id |
| event_id | uuid | NO | FK → events.id |
| venue_id | uuid | NO | FK → venues.id |
| buyer_wallet | varchar(255) | NO | |
| seller_wallet | varchar(255) | NO | |
| transfer_signature | varchar(255) | NO | |
| block_height | integer | YES | |
| payment_currency | enum | NO | USDC, SOL |
| payment_amount | decimal(20,6) | YES | |
| usd_value | integer | NO | (cents) |
| status | enum | NO | 'initiated' |
| initiated_at | timestamptz | YES | now() |
| completed_at | timestamptz | YES | |
| failed_at | timestamptz | YES | |
| failure_reason | text | YES | |
| network_fee | decimal(20,6) | YES | |
| network_fee_usd | integer | YES | (cents) |
| payment_method | varchar(20) | YES | 'crypto' |
| fiat_currency | varchar(3) | YES | |
| stripe_payment_intent_id | varchar(255) | YES | |
| stripe_transfer_id | varchar(255) | YES | |
| stripe_application_fee_amount | integer | YES | (cents) |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| deleted_at | timestamptz | YES | |
| tenant_id | uuid | NO | FK → tenants.id |

### venue_marketplace_settings
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| venue_id | uuid | NO | PRIMARY KEY, FK → venues.id |
| max_resale_multiplier | decimal(5,2) | YES | 3.0 |
| min_price_multiplier | decimal(5,2) | YES | 1.0 |
| allow_below_face | boolean | YES | false |
| transfer_cutoff_hours | integer | YES | 4 |
| listing_advance_hours | integer | YES | 720 |
| auto_expire_on_event_start | boolean | YES | true |
| max_listings_per_user_per_event | integer | YES | 8 |
| max_listings_per_user_total | integer | YES | 50 |
| require_listing_approval | boolean | YES | false |
| auto_approve_verified_sellers | boolean | YES | false |
| royalty_percentage | decimal(5,2) | YES | 5.0 |
| royalty_wallet_address | varchar(255) | NO | |
| minimum_royalty_payout | integer | YES | 1000 (cents) |
| allow_international_sales | boolean | YES | true |
| blocked_countries | text[] | YES | |
| require_kyc_for_high_value | boolean | YES | false |
| high_value_threshold | integer | YES | 100000 (cents) |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| tenant_id | uuid | NO | FK → tenants.id |

---

## Foreign Keys

### Internal FKs
| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| marketplace_transfers | listing_id | marketplace_listings.id | CASCADE |
| platform_fees | transfer_id | marketplace_transfers.id | CASCADE |
| marketplace_price_history | listing_id | marketplace_listings.id | CASCADE |
| marketplace_disputes | transfer_id | marketplace_transfers.id | CASCADE |
| marketplace_disputes | listing_id | marketplace_listings.id | RESTRICT |
| dispute_evidence | dispute_id | marketplace_disputes.id | CASCADE |
| tax_transactions | transfer_id | marketplace_transfers.id | CASCADE |

### Cross-Service FKs (22 total)
| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| marketplace_listings | ticket_id | tickets.id | CASCADE |
| marketplace_listings | seller_id | users.id | RESTRICT |
| marketplace_listings | event_id | events.id | RESTRICT |
| marketplace_listings | venue_id | venues.id | RESTRICT |
| marketplace_listings | approved_by | users.id | SET NULL |
| marketplace_listings | tenant_id | tenants.id | RESTRICT |
| marketplace_transfers | buyer_id | users.id | RESTRICT |
| marketplace_transfers | seller_id | users.id | RESTRICT |
| marketplace_transfers | event_id | events.id | RESTRICT |
| marketplace_transfers | venue_id | venues.id | RESTRICT |
| marketplace_transfers | tenant_id | tenants.id | RESTRICT |
| platform_fees | tenant_id | tenants.id | RESTRICT |
| venue_marketplace_settings | venue_id | venues.id | CASCADE |
| venue_marketplace_settings | tenant_id | tenants.id | RESTRICT |
| marketplace_price_history | event_id | events.id | RESTRICT |
| marketplace_price_history | changed_by | users.id | SET NULL |
| marketplace_price_history | tenant_id | tenants.id | RESTRICT |
| marketplace_disputes | filed_by | users.id | RESTRICT |
| marketplace_disputes | filed_against | users.id | RESTRICT |
| marketplace_disputes | resolved_by | users.id | SET NULL |
| marketplace_disputes | tenant_id | tenants.id | RESTRICT |
| dispute_evidence | submitted_by | users.id | RESTRICT |
| dispute_evidence | tenant_id | tenants.id | RESTRICT |
| tax_transactions | seller_id | users.id | RESTRICT |
| tax_transactions | tenant_id | tenants.id | RESTRICT |
| anti_bot_activities | user_id | users.id | CASCADE |
| anti_bot_activities | tenant_id | tenants.id | RESTRICT |
| anti_bot_violations | user_id | users.id | CASCADE |
| anti_bot_violations | tenant_id | tenants.id | RESTRICT |
| marketplace_blacklist | user_id | users.id | CASCADE |
| marketplace_blacklist | banned_by | users.id | SET NULL |
| marketplace_blacklist | tenant_id | tenants.id | RESTRICT |

---

## CHECK Constraints

| Table | Constraint | Expression |
|-------|------------|------------|
| marketplace_transfers | chk_marketplace_transfers_payment_method | payment_method IN ('crypto', 'fiat') |

---

## Enums

### marketplace_listings.status
- active
- sold
- cancelled
- expired
- pending_approval

### marketplace_transfers.status
- initiated
- pending
- completed
- failed
- disputed

### marketplace_transfers.payment_currency
- USDC
- SOL

### marketplace_disputes.dispute_type
- payment_not_received
- ticket_not_transferred
- fraudulent_listing
- price_dispute
- other

### marketplace_disputes.status
- open
- under_review
- resolved
- closed

### tax_transactions.transaction_type
- short_term
- long_term

### anti_bot_violations.severity
- low
- medium
- high

---

## RLS Policies
```sql
CREATE POLICY tenant_isolation_policy ON {table}
USING (tenant_id::text = current_setting('app.current_tenant', true))
```

Applied to all 11 tables.

---

## Functions Created

| Function | Returns | Purpose |
|----------|---------|---------|
| expire_marketplace_listings() | INTEGER | Auto-expire listings past expires_at |
| calculate_marketplace_fees(sale_price_cents, platform_fee_pct, venue_fee_pct) | TABLE | Calculate fee breakdown |
| get_user_active_listings_count(user_id, event_id?) | INTEGER | Count user's active listings |

---

## Cross-Service Dependencies

| External Table | Service | Referenced By |
|----------------|---------|---------------|
| tenants | auth-service | All tables (FK) |
| users | auth-service | Many tables (seller_id, buyer_id, etc.) |
| tickets | ticket-service | marketplace_listings.ticket_id |
| events | event-service | listings, transfers, price_history |
| venues | venue-service | listings, transfers, settings |

---

## ⚠️ Design Decisions

### 1. No Default tenant_id
All tables require explicit tenant_id. This prevents silent data leakage if tenant context fails - inserts will error instead of routing to a default tenant.

### 2. Integer Cents for Money
All monetary values stored as INTEGER in cents (e.g., 1000 = $10.00) to avoid floating-point precision issues.

### 3. Decimal for Multipliers/Percentages
Multipliers and percentages use DECIMAL(5,2) for calculations.

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant | TEXT | RLS tenant isolation |

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
