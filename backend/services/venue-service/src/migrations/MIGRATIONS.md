# Venue Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 9 (skipping 002)
> **Tables Created:** 25+
> **Functions Created:** 3+

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_venue.ts | Core venue tables, white-label support, RLS |
| 3 | 003_add_external_verification_tables.ts | Verification, notifications, compliance |
| 4 | 004_add_webhook_events_table.ts | Webhook deduplication |
| 5 | 005_add_api_key_hash_column.ts | API key SHA-256 hashing |
| 6 | 006_add_rls_with_check.ts | RLS WITH CHECK, lock_timeout |
| 7 | 007_add_version_column.ts | Optimistic locking |
| 8 | 008_add_check_constraints.ts | Business rule validation |
| 9 | 009_enhance_webhook_events.ts | Webhook processing lifecycle |
| 10 | 010_add_venue_operations_resale_tables.ts | Operations, resale policies |

---

## Tables by Migration

### 001_baseline_venue.ts (12 tables)
- venues (main table, 60+ columns)
- venue_staff
- venue_settings
- venue_integrations
- venue_layouts
- venue_branding
- custom_domains
- white_label_pricing (seeded with 3 tiers)
- venue_tier_history
- venue_audit_log
- api_keys
- user_venue_roles (conditional - if not exists)

### 003_add_external_verification_tables.ts (8 tables)
- external_verifications
- manual_review_queue
- notifications
- email_queue
- venue_compliance_reviews
- venue_compliance (conditional)
- venue_compliance_reports (conditional)
- venue_documents

### 004_add_webhook_events_table.ts (1 table)
- webhook_events

### 010_add_venue_operations_resale_tables.ts (4 tables)
- venue_operations
- transfer_history
- resale_policies
- seller_verifications

---

## Key Tables

### venues
Comprehensive venue management (60+ columns):
- **Core**: id, name, slug (unique), description
- **Contact**: email, phone, website
- **Address**: address_line1/2, city, state_province, postal_code, country_code, latitude, longitude, timezone
- **Classification**: venue_type
- **Capacity**: max_capacity, standing_capacity, seated_capacity, vip_capacity
- **Media**: logo_url, cover_image_url, image_gallery (text[]), virtual_tour_url
- **Business**: business_name, business_registration, tax_id, business_type
- **Blockchain**: wallet_address, collection_address, royalty_percentage
- **Status**: status, is_verified, verified_at, verification_level
- **Features**: features (text[]), amenities (jsonb), accessibility_features (text[])
- **Policies**: age_restriction, dress_code, prohibited_items, cancellation_policy, refund_policy
- **White-Label**: pricing_tier, hide_platform_branding, custom_domain
- **Stats**: average_rating, total_reviews, total_events, total_tickets_sold
- **Audit**: created_by, updated_by, created_at, updated_at, deleted_at, tenant_id, version

### venue_settings
Per-venue configuration:
- **Ticketing**: max_tickets_per_order, ticket_resale_allowed, allow_print_at_home, allow_mobile_tickets, require_id_verification, ticket_transfer_allowed
- **Fees**: service_fee_percentage, facility_fee_amount, processing_fee_percentage
- **Payment**: payment_methods (text[]), accepted_currencies (text[]), payout_frequency, minimum_payout_amount
- **Resale** (migration 010): max_resale_price_multiplier, max_resale_price_fixed, max_transfers_per_ticket, require_seller_verification, anti_scalping_enabled, etc.

### venue_branding
White-label customization:
- Colors: primary_color, secondary_color, accent_color, text_color, background_color
- Typography: font_family, heading_font
- Logos: logo_url, logo_dark_url, favicon_url
- Custom: custom_css, email branding, ticket branding, OG image

### custom_domains
Custom domain management:
- domain (unique), verification_token, verification_method
- SSL: ssl_status, ssl_provider, ssl_issued_at, ssl_expires_at
- DNS: required_dns_records (jsonb), current_dns_records (jsonb)

### white_label_pricing
Tier definitions (seeded):
```
standard: $0/mo, 10% fee, $2/ticket, no white-label
white_label: $499/mo, 5% fee, $1/ticket, full white-label
enterprise: $1999/mo, 3% fee, $0.50/ticket, unlimited
```

### venue_operations
Long-running operation tracking:
- operation_type, status, current_step, total_steps
- steps (jsonb), checkpoint_data (jsonb)
- Supports: pause/resume, rollback, correlation tracking

### resale_policies
Per-venue/event resale rules:
- resale_allowed, max_price_multiplier, max_transfers
- jurisdiction, jurisdiction_overrides (jsonb)
- anti_scalping_enabled, anti_scalping_rules (jsonb)
- artist_approval_required, artist_approval_status

### seller_verifications
Seller identity verification:
- verification_type: identity, address, bank, tax_id
- provider: stripe_identity, manual
- status: pending, in_review, verified, rejected, expired

---

## RLS Implementation

### Session Variables Used
- `app.current_user_id` (UUID)
- `app.current_user_role` (admin, superadmin)
- `app.current_tenant_id` (UUID)
- `app.is_system_user` (boolean - migration 006)

### venues Table Policies (001)
1. `venues_view_own` - Owners see their venues
2. `venues_update_own` - Owners update their venues
3. `venues_delete_own` - Owners delete their venues
4. `venues_insert_own` - Owners insert venues
5. `venues_public_view` - Public sees active venues
6. `venues_admin_all` - Admin full access
7. `venues_tenant_isolation` - Tenant boundary

### Enhanced RLS (migration 006)
Separate policies per operation with WITH CHECK:
```sql
-- SELECT
CREATE POLICY tenant_isolation_select ON {table}
  FOR SELECT
  USING (tenant_id = ... OR is_system_user);

-- INSERT  
CREATE POLICY tenant_isolation_insert ON {table}
  FOR INSERT
  WITH CHECK (tenant_id = ... OR is_system_user);

-- UPDATE
CREATE POLICY tenant_isolation_update ON {table}
  FOR UPDATE
  USING (...) WITH CHECK (...);

-- DELETE
CREATE POLICY tenant_isolation_delete ON {table}
  FOR DELETE
  USING (...);
```

---

## Stored Functions

- `update_updated_at_column()` - Auto-update timestamps (trigger)

---

## Security Features

### API Key Hashing (migration 005)
- Added `key_hash` column (SHA-256, 64 chars)
- Existing keys migrated to hashed storage
- Index on key_hash WHERE is_active = TRUE

### Optimistic Locking (migration 007)
- `version` column added to: venues, venue_settings, venue_integrations

### Lock Timeout (migration 006)
- `ALTER DATABASE CURRENT SET lock_timeout = 10000` (10 seconds)

### CHECK Constraints (migration 008)
- `chk_royalty_percentage_range` - 0-100%
- `chk_max_capacity_positive` - > 0
- `chk_venue_status_valid` - IN ('active', 'inactive', 'pending', 'suspended')
- `chk_integration_status_valid`
- `chk_integration_provider_valid`

---

## Webhook Processing (migrations 004, 009)

### webhook_events Table
- event_id (unique), event_type
- **Status tracking**: pending, processing, completed, failed, retrying
- **Timing**: processing_started_at, processing_completed_at
- **Payload**: payload (jsonb)
- **Retry**: error_message, retry_count, last_retry_at
- **Locking**: lock_key, lock_expires_at

---

## Indexes

### Full-Text Search
```sql
CREATE INDEX idx_venues_search ON venues USING gin(
  to_tsvector('english', COALESCE(name, '') || ' ' || ...)
);
```

### GIN Indexes (JSONB)
- idx_venues_metadata_gin
- idx_venues_amenities_gin
- idx_venues_social_media_gin

### Geolocation
- idx_venues_location (latitude, longitude)

### Partial Indexes
- idx_venues_custom_domain WHERE custom_domain IS NOT NULL
- idx_api_keys_key WHERE is_active = TRUE

---

## Cross-Service Dependencies

| External Table | Service | Referenced By |
|----------------|---------|---------------|
| tenants | auth | webhook_events.tenant_id |
| users | auth | venues.created_by, venue_staff.user_id, etc. |

---

## Seed Data

### white_label_pricing (3 tiers)
```javascript
[
  { tier_name: 'standard', monthly_fee: 0, service_fee_percentage: 10.00, ... },
  { tier_name: 'white_label', monthly_fee: 499.00, service_fee_percentage: 5.00, ... },
  { tier_name: 'enterprise', monthly_fee: 1999.00, service_fee_percentage: 3.00, ... }
]
```

---

## ⚠️ Known Issues

### 1. Conditional Table Creation
- user_venue_roles: Only created if not exists (auth-service may create)
- venue_staff: Created in both 001 and 003 (conditional in 003)

### 2. Generated Columns
venues table has computed columns that may cause issues:
```sql
capacity INTEGER GENERATED ALWAYS AS (max_capacity) STORED
type VARCHAR(50) GENERATED ALWAYS AS (venue_type) STORED
```

### 3. Migration 002 Missing
Migrations jump from 001 to 003 - no 002 file exists.

### 4. Session Variable Mix
- Most use `app.current_tenant_id` (UUID)
- Migration 006 adds `app.is_system_user` (boolean)
