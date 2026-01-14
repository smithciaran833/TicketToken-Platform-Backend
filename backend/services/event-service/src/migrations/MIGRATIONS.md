# Event Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 6
> **Tables Created:** 7
> **Functions Created:** 2
> **Triggers Created:** 7

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_baseline_event.ts | Create 6 core tables, triggers, cross-service FKs |
| 2 | 002_add_rls_policies.ts | Enable RLS with FORCE on all tables |
| 3 | 003_add_version_column.ts | Add optimistic locking version columns |
| 4 | 004_add_idempotency_keys.ts | Create idempotency_keys table |
| 5 | 005_add_price_percentage_constraints.ts | Add CHECK constraints for prices |
| 6 | 006_add_status_reason.ts | Add status tracking columns to events |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled | From Migration |
|-------|-------------|---------------|-------------|----------------|
| event_categories | uuid | ❌ | ❌ | 001 |
| events | uuid | ✅ | ✅ FORCE | 001 |
| event_schedules | uuid | ✅ | ✅ FORCE | 001 |
| event_capacity | uuid | ✅ | ✅ FORCE | 001 |
| event_pricing | uuid | ✅ | ✅ FORCE | 001 |
| event_metadata | uuid | ✅ | ❌ | 001 |
| idempotency_keys | uuid | ✅ | ❌ | 004 |

---

## Table Details

### event_categories
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| parent_id | uuid | YES | FK → event_categories.id |
| name | varchar(100) | NO | |
| slug | varchar(100) | NO | UNIQUE |
| description | text | YES | |
| icon | varchar(50) | YES | |
| color | varchar(7) | YES | |
| display_order | integer | YES | 0 |
| is_active | boolean | YES | true |
| is_featured | boolean | YES | false |
| meta_title | varchar(70) | YES | |
| meta_description | varchar(160) | YES | |
| event_count | integer | YES | 0 |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

### events
| Column | Type | Nullable | Default | Added In |
|--------|------|----------|---------|----------|
| id | uuid | NO | uuid_generate_v4() | 001 |
| tenant_id | uuid | NO | '00000000-...-000001' | 001 |
| venue_id | uuid | NO | FK → venues.id | 001 |
| venue_layout_id | uuid | YES | FK → venue_layouts.id | 001 |
| name | varchar(300) | NO | | 001 |
| slug | varchar(300) | NO | | 001 |
| description | text | YES | | 001 |
| short_description | varchar(500) | YES | | 001 |
| event_type | varchar(50) | NO | 'single' | 001 |
| primary_category_id | uuid | YES | FK → event_categories.id | 001 |
| secondary_category_ids | uuid[] | YES | | 001 |
| tags | text[] | YES | | 001 |
| status | varchar(50) | YES | 'DRAFT' | 001 |
| visibility | varchar(50) | YES | 'PUBLIC' | 001 |
| is_featured | boolean | YES | false | 001 |
| priority_score | integer | YES | 0 | 001 |
| banner_image_url | text | YES | | 001 |
| thumbnail_image_url | text | YES | | 001 |
| image_gallery | jsonb | YES | | 001 |
| video_url | text | YES | | 001 |
| virtual_event_url | text | YES | | 001 |
| age_restriction | integer | YES | 0 | 001 |
| dress_code | varchar(100) | YES | | 001 |
| special_requirements | text[] | YES | | 001 |
| accessibility_info | jsonb | YES | | 001 |
| collection_address | varchar(44) | YES | | 001 |
| mint_authority | varchar(44) | YES | | 001 |
| royalty_percentage | decimal(5,2) | YES | | 001 |
| is_virtual | boolean | YES | false | 001 |
| is_hybrid | boolean | YES | false | 001 |
| streaming_platform | varchar(50) | YES | | 001 |
| streaming_config | jsonb | YES | | 001 |
| cancellation_policy | text | YES | | 001 |
| refund_policy | text | YES | | 001 |
| cancellation_deadline_hours | integer | YES | 24 | 001 |
| start_date | timestamptz | YES | | 001 |
| allow_transfers | boolean | YES | true | 001 |
| max_transfers_per_ticket | integer | YES | | 001 |
| transfer_blackout_start | timestamptz | YES | | 001 |
| transfer_blackout_end | timestamptz | YES | | 001 |
| require_identity_verification | boolean | YES | false | 001 |
| meta_title | varchar(70) | YES | | 001 |
| meta_description | varchar(160) | YES | | 001 |
| meta_keywords | text[] | YES | | 001 |
| view_count | integer | YES | 0 | 001 |
| interest_count | integer | YES | 0 | 001 |
| share_count | integer | YES | 0 | 001 |
| external_id | varchar(100) | YES | | 001 |
| metadata | jsonb | YES | '{}' | 001 |
| created_by | uuid | YES | FK → users.id | 001 |
| updated_by | uuid | YES | FK → users.id | 001 |
| created_at | timestamptz | YES | now() | 001 |
| updated_at | timestamptz | YES | now() | 001 |
| deleted_at | timestamptz | YES | | 001 |
| version | integer | NO | 1 | 003 |
| status_reason | varchar(500) | YES | | 006 |
| status_changed_by | varchar(100) | YES | | 006 |
| status_changed_at | timestamptz | YES | | 006 |

### event_schedules
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| tenant_id | uuid | NO | '00000000-...-000001' |
| event_id | uuid | NO | FK → events.id (CASCADE) |
| starts_at | timestamptz | NO | |
| ends_at | timestamptz | NO | |
| doors_open_at | timestamptz | YES | |
| is_recurring | boolean | YES | false |
| recurrence_rule | text | YES | |
| recurrence_end_date | date | YES | |
| occurrence_number | integer | YES | |
| timezone | varchar(50) | YES | 'UTC' |
| utc_offset | integer | YES | |
| status | varchar(50) | YES | 'SCHEDULED' |
| status_reason | text | YES | |
| capacity_override | integer | YES | |
| check_in_opens_at | timestamptz | YES | |
| check_in_closes_at | timestamptz | YES | |
| notes | text | YES | |
| metadata | jsonb | YES | '{}' |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| deleted_at | timestamptz | YES | |
| version | integer | NO | 1 |

### event_capacity
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| tenant_id | uuid | NO | '00000000-...-000001' |
| event_id | uuid | NO | FK → events.id (CASCADE) |
| schedule_id | uuid | YES | FK → event_schedules.id (SET NULL) |
| section_name | varchar(100) | NO | |
| section_code | varchar(20) | YES | |
| tier | varchar(50) | YES | |
| total_capacity | integer | NO | |
| available_capacity | integer | NO | |
| reserved_capacity | integer | YES | 0 |
| buffer_capacity | integer | YES | 0 |
| sold_count | integer | YES | 0 |
| pending_count | integer | YES | 0 |
| reserved_at | timestamptz | YES | |
| reserved_expires_at | timestamptz | YES | |
| locked_price_data | jsonb | YES | |
| row_config | jsonb | YES | |
| seat_map | jsonb | YES | |
| is_active | boolean | YES | true |
| is_visible | boolean | YES | true |
| minimum_purchase | integer | YES | 1 |
| maximum_purchase | integer | YES | |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| deleted_at | timestamptz | YES | |
| version | integer | NO | 1 |

### event_pricing
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| tenant_id | uuid | NO | '00000000-...-000001' |
| event_id | uuid | NO | FK → events.id (CASCADE) |
| schedule_id | uuid | YES | FK → event_schedules.id (SET NULL) |
| capacity_id | uuid | YES | FK → event_capacity.id (SET NULL) |
| name | varchar(100) | NO | |
| description | text | YES | |
| tier | varchar(50) | YES | |
| base_price | decimal(10,2) | NO | |
| service_fee | decimal(10,2) | YES | 0 |
| facility_fee | decimal(10,2) | YES | 0 |
| tax_rate | decimal(5,4) | YES | 0 |
| is_dynamic | boolean | YES | false |
| min_price | decimal(10,2) | YES | |
| max_price | decimal(10,2) | YES | |
| price_adjustment_rules | jsonb | YES | |
| current_price | decimal(10,2) | YES | |
| early_bird_price | decimal(10,2) | YES | |
| early_bird_ends_at | timestamptz | YES | |
| last_minute_price | decimal(10,2) | YES | |
| last_minute_starts_at | timestamptz | YES | |
| group_size_min | integer | YES | |
| group_discount_percentage | decimal(5,2) | YES | |
| currency | varchar(3) | YES | 'USD' |
| sales_start_at | timestamptz | YES | |
| sales_end_at | timestamptz | YES | |
| max_per_order | integer | YES | |
| max_per_customer | integer | YES | |
| is_active | boolean | YES | true |
| is_visible | boolean | YES | true |
| display_order | integer | YES | 0 |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| deleted_at | timestamptz | YES | |
| version | integer | NO | 1 |

### idempotency_keys (from 004)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | NO | |
| idempotency_key | varchar(255) | NO | |
| method | varchar(10) | NO | |
| path | varchar(512) | NO | |
| request_hash | varchar(64) | YES | |
| response_status_code | integer | NO | |
| response_body | jsonb | YES | |
| response_headers | jsonb | YES | |
| state | enum | NO | 'processing' |
| created_at | timestamp | NO | now() |
| completed_at | timestamp | YES | |
| expires_at | timestamp | NO | |
| user_id | uuid | YES | |

---

## Foreign Keys

### Internal FKs
| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| event_categories | parent_id | event_categories.id | SET NULL |
| events | primary_category_id | event_categories.id | (none) |
| events | tenant_id | tenants.id | RESTRICT |
| event_schedules | event_id | events.id | CASCADE |
| event_schedules | tenant_id | tenants.id | RESTRICT |
| event_capacity | event_id | events.id | CASCADE |
| event_capacity | schedule_id | event_schedules.id | SET NULL |
| event_capacity | tenant_id | tenants.id | RESTRICT |
| event_pricing | event_id | events.id | CASCADE |
| event_pricing | schedule_id | event_schedules.id | SET NULL |
| event_pricing | capacity_id | event_capacity.id | SET NULL |
| event_pricing | tenant_id | tenants.id | RESTRICT |
| event_metadata | event_id | events.id | CASCADE |
| event_metadata | tenant_id | tenants.id | RESTRICT |

### Cross-Service FKs
| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| events | venue_id | venues.id | RESTRICT |
| events | venue_layout_id | venue_layouts.id | SET NULL |
| events | created_by | users.id | SET NULL |
| events | updated_by | users.id | SET NULL |

---

## CHECK Constraints

### events
| Constraint | Expression |
|------------|------------|
| events_status_check | status IN ('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE', 'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED') |
| events_visibility_check | visibility IN ('PUBLIC', 'PRIVATE', 'UNLISTED') |
| events_event_type_check | event_type IN ('single', 'recurring', 'series') |
| events_royalty_percentage_check | royalty_percentage IS NULL OR (0-100) |
| events_age_restriction_check | age_restriction >= 0 |
| events_priority_score_check | priority_score >= 0 |
| events_view_count_check | view_count >= 0 |
| events_interest_count_check | interest_count >= 0 |
| events_share_count_check | share_count >= 0 |

### event_schedules
| Constraint | Expression |
|------------|------------|
| event_schedules_status_check | status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED', 'RESCHEDULED') |

### event_pricing
| Constraint | Expression |
|------------|------------|
| event_pricing_base_price_check | base_price >= 0 |
| event_pricing_service_fee_check | service_fee >= 0 |
| event_pricing_facility_fee_check | facility_fee >= 0 |
| event_pricing_tax_rate_check | tax_rate >= 0 AND tax_rate <= 1 |
| event_pricing_min_price_check | min_price IS NULL OR >= 0 |
| event_pricing_max_price_check | max_price IS NULL OR >= 0 |
| event_pricing_current_price_check | current_price IS NULL OR >= 0 |
| event_pricing_early_bird_price_check | early_bird_price IS NULL OR >= 0 |
| event_pricing_last_minute_price_check | last_minute_price IS NULL OR >= 0 |
| event_pricing_group_discount_check | group_discount_percentage IS NULL OR (0-100) |

### event_capacity
| Constraint | Expression |
|------------|------------|
| event_capacity_total_check | total_capacity > 0 |
| event_capacity_available_check | available_capacity >= 0 |
| event_capacity_reserved_check | reserved_capacity >= 0 |
| event_capacity_sold_check | sold_count >= 0 |
| event_capacity_min_purchase_check | minimum_purchase >= 1 |

---

## RLS Policies (from 002)

All tenant tables have 4 policies each:

| Policy | Operation | Condition |
|--------|-----------|-----------|
| {table}_tenant_select | SELECT | tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', true), '')::uuid, tenant_id) |
| {table}_tenant_insert | INSERT | tenant_id = current_setting('app.current_tenant_id', true)::uuid |
| {table}_tenant_update | UPDATE | tenant_id = current_setting('app.current_tenant_id', true)::uuid (USING + WITH CHECK) |
| {table}_tenant_delete | DELETE | tenant_id = current_setting('app.current_tenant_id', true)::uuid |

Applied to: events, event_schedules, event_capacity, event_pricing, event_metadata

---

## Functions Created

| Function | Migration | Purpose |
|----------|-----------|---------|
| update_updated_at_column() | 001 | Auto-update updated_at on UPDATE |
| increment_version() | 003 | Auto-increment version on UPDATE |

---

## Triggers

### From 001 (updated_at)
| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| trigger_update_events_timestamp | events | BEFORE UPDATE | update_updated_at_column() |
| trigger_update_event_schedules_timestamp | event_schedules | BEFORE UPDATE | update_updated_at_column() |
| trigger_update_event_capacity_timestamp | event_capacity | BEFORE UPDATE | update_updated_at_column() |
| trigger_update_event_pricing_timestamp | event_pricing | BEFORE UPDATE | update_updated_at_column() |
| trigger_update_event_metadata_timestamp | event_metadata | BEFORE UPDATE | update_updated_at_column() |
| trigger_update_event_categories_timestamp | event_categories | BEFORE UPDATE | update_updated_at_column() |
| audit_events_changes | events | AFTER INSERT/UPDATE/DELETE | audit_trigger_function() |

### From 003 (version)
| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| events_version_trigger | events | BEFORE UPDATE | increment_version() |
| event_schedules_version_trigger | event_schedules | BEFORE UPDATE | increment_version() |
| event_capacity_version_trigger | event_capacity | BEFORE UPDATE | increment_version() |
| event_pricing_version_trigger | event_pricing | BEFORE UPDATE | increment_version() |

---

## Seed Data (from 001)

### event_categories
| Name | Slug | Icon | Color |
|------|------|------|-------|
| Music | music | music | #FF6B6B |
| Sports | sports | sports | #4ECDC4 |
| Theater | theater | theater | #95E1D3 |
| Comedy | comedy | comedy | #F38181 |
| Arts | arts | arts | #AA96DA |
| Conference | conference | conference | #FCBAD3 |
| Workshop | workshop | workshop | #A8D8EA |
| Festival | festival | festival | #FFD93D |
| Family | family | family | #6BCB77 |
| Nightlife | nightlife | nightlife | #C780FA |

---

## Cross-Service Dependencies

| External Table | Service | Referenced By |
|----------------|---------|---------------|
| tenants | auth-service | All tenant tables (FK) |
| users | auth-service | events.created_by, events.updated_by |
| venues | venue-service | events.venue_id |
| venue_layouts | venue-service | events.venue_layout_id |

---

## Database Roles Created

| Role | Purpose |
|------|---------|
| event_service_admin | Bypass RLS for admin operations |

---

## ⚠️ Known Issues

### 1. event_categories Has No tenant_id
- Not multi-tenant isolated
- Categories are shared across all tenants
- May need tenant-specific categories later

### 2. event_metadata Has No RLS
- Table has tenant_id but no RLS policies
- Missing from 002 migration

### 3. idempotency_keys Has No RLS
- Table has tenant_id but no RLS policies

### 4. Duplicate updated_at Triggers
- Both update_updated_at_column() and increment_version() update updated_at
- May cause double-update on some tables

### 5. Session Variable
- Uses `app.current_tenant_id` (consistent with some services)
- Different from services using `app.current_tenant`

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_tenant_id | UUID | RLS tenant isolation |

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

## Unique Indexes

| Table | Index | Columns | Condition |
|-------|-------|---------|-----------|
| events | idx_events_venue_slug | (venue_id, slug) | WHERE deleted_at IS NULL |
| event_capacity | idx_event_capacity_unique | (event_id, section_name, COALESCE(schedule_id, '00000000-...'::uuid)) | |
| idempotency_keys | (unnamed) | (tenant_id, idempotency_key) | |
