# Venue Service Migration Audit

## Migration File Summary

### 001_baseline_venue.ts
**Tables Created:**
- `venues` - Main venue table with 60+ columns
- `venue_staff` - Staff members linked to venues
- `venue_settings` - Per-venue configuration
- `venue_integrations` - Third-party integrations
- `venue_layouts` - Seating/floor layouts
- `venue_branding` - White-label branding
- `custom_domains` - Custom domain configuration
- `white_label_pricing` - Pricing tiers
- `venue_tier_history` - Tier change audit
- `venue_audit_log` - General audit log
- `api_keys` - API key management
- `user_venue_roles` - User-venue role mapping

**Columns (venues table):**
- Core: id, name, slug, description, email, phone, website
- Address: address_line1/2, city, state_province, postal_code, country_code, latitude, longitude, timezone
- Classification: venue_type, max_capacity, standing_capacity, seated_capacity, vip_capacity
- Media: logo_url, cover_image_url, image_gallery, virtual_tour_url
- Business: business_name, business_registration, tax_id, business_type
- Blockchain: wallet_address, collection_address, royalty_percentage
- Status: status, is_verified, verified_at, verification_level
- Features: features, amenities, accessibility_features
- Policies: age_restriction, dress_code, prohibited_items, cancellation_policy, refund_policy, transfer_deadline_hours
- Social: social_media, average_rating, total_reviews, total_events, total_tickets_sold
- White-label: pricing_tier, hide_platform_branding, custom_domain
- Metadata: metadata, tags
- Audit: created_by, updated_by, created_at, updated_at, deleted_at, tenant_id
- Generated: capacity (from max_capacity), type (from venue_type)

**RLS Policies:**
- `venues_view_own` - SELECT for owners
- `venues_update_own` - UPDATE for owners
- `venues_delete_own` - DELETE for owners
- `venues_insert_own` - INSERT for owners
- `venues_public_view` - SELECT for active venues
- `venues_admin_all` - ALL for admins
- `venues_tenant_isolation` - ALL for tenant isolation

**Triggers:**
- `trigger_update_venues_timestamp`
- `trigger_update_venue_staff_timestamp`
- `trigger_update_venue_settings_timestamp`
- `trigger_update_venue_integrations_timestamp`
- `trigger_update_venue_layouts_timestamp`
- `trigger_update_venue_branding_timestamp`
- `trigger_update_custom_domains_timestamp`
- `trigger_update_white_label_pricing_timestamp`
- `trigger_update_api_keys_timestamp`
- `trigger_update_user_venue_roles_timestamp`
- `audit_venues_changes` (if audit_trigger_function exists)

**Functions:**
- `update_updated_at_column()` - Auto-update updated_at

**Indexes:**
- 30+ indexes including GIN indexes for JSONB and full-text search

---

### 003_add_external_verification_tables.ts
**Tables Created:**
- `external_verifications` - External service verification tracking
- `manual_review_queue` - Manual review workflow
- `notifications` - User/venue notifications
- `email_queue` - Email sending queue
- `venue_compliance_reviews` - Scheduled compliance reviews
- `venue_compliance` - Venue compliance settings (if not exists)
- `venue_compliance_reports` - Compliance reports (if not exists)
- `venue_staff` - Staff table (if not exists - duplicate check)
- `venue_documents` - Document storage (if not exists)

**Triggers:**
- `audit_venue_compliance_changes`

---

### 004_add_webhook_events_table.ts
**Tables Created:**
- `webhook_events` - Webhook deduplication tracking
  - id, event_id (unique), event_type, processed_at, tenant_id, source, metadata

**Indexes:**
- idx on event_id, (event_type, processed_at), tenant_id

---

### 005_add_api_key_hash_column.ts
**Columns Added:**
- `api_keys.key_hash` - SHA-256 hash of API key

**Indexes:**
- `idx_api_keys_key_hash` on key_hash WHERE is_active = TRUE

**Data Migration:**
- Hashes existing plaintext keys

---

### 006_add_rls_with_check.ts
**RLS Policies Updated (with WITH CHECK):**
- Tables: venues, venue_settings, venue_integrations, venue_audit_log
- Creates separate policies: tenant_isolation_select, tenant_isolation_insert, tenant_isolation_update, tenant_isolation_delete

**Database Settings:**
- Sets lock_timeout = 10000ms

---

### 007_add_version_column.ts
**Columns Added:**
- `venues.version` - Optimistic locking
- `venue_settings.version` - Optimistic locking
- `venue_integrations.version` - Optimistic locking

---

### 008_add_check_constraints.ts
**CHECK Constraints:**
- `venue_settings.chk_royalty_percentage_range` - 0-100
- `venues.chk_max_capacity_positive` - > 0
- `venues.chk_venue_status_valid` - IN ('active', 'inactive', 'pending', 'suspended')
- `venue_integrations.chk_integration_status_valid` - IN ('active', 'inactive', 'pending', 'error')
- `venue_integrations.chk_integration_provider_valid` - IN ('stripe', 'square', 'toast', 'mailchimp', 'twilio')

---

### 009_enhance_webhook_events.ts
**Columns Added to webhook_events:**
- status, processing_started_at, processing_completed_at
- payload (JSONB), error_message, retry_count, last_retry_at
- source_ip, headers_hash, lock_key, lock_expires_at

**Indexes:**
- idx_webhook_events_status
- idx_webhook_events_status_created
- idx_webhook_events_retry
- idx_webhook_events_lock

**CHECK Constraints:**
- `webhook_events_status_check` - IN ('pending', 'processing', 'completed', 'failed', 'retrying')

---

### 010_add_venue_operations_resale_tables.ts
**Tables Created:**
- `venue_operations` - Multi-step operations with checkpoints
- `transfer_history` - Ticket transfer/resale tracking
- `resale_policies` - Per-venue/event resale rules
- `seller_verifications` - Seller identity verification

**Columns Added to venue_settings:**
- max_resale_price_multiplier, max_resale_price_fixed, use_face_value_cap
- max_transfers_per_ticket, require_seller_verification
- default_jurisdiction, jurisdiction_rules
- resale_cutoff_hours, listing_cutoff_hours
- anti_scalping_enabled, purchase_cooldown_minutes, max_tickets_per_buyer
- require_artist_approval, approved_resale_platforms

**CHECK Constraints:**
- `venue_operations_status_check` - IN ('pending', 'in_progress', 'checkpoint', 'completed', 'failed', 'rolled_back')
- `transfer_history_type_check` - IN ('purchase', 'transfer', 'resale', 'gift', 'refund')
- `seller_verifications_status_check` - IN ('pending', 'in_review', 'verified', 'rejected', 'expired')

**RLS Policies:**
- venue_operations_tenant_isolation
- transfer_history_tenant_isolation
- resale_policies_tenant_isolation
- seller_verifications_tenant_isolation

---

### 011_add_orphan_tables.ts
**Tables Created:**
- `resale_blocks` - Block users from resale (anti-scalping)
- `fraud_logs` - Fraud detection logging

**CHECK Constraints:**
- `fraud_logs.ck_fraud_logs_risk_score_valid` - 0-100

**RLS Policies:**
- resale_blocks_tenant_isolation
- fraud_logs_tenant_isolation

---

## Consolidated Schema Summary

### Total Tables: 27
1. venues
2. venue_staff
3. venue_settings
4. venue_integrations
5. venue_layouts
6. venue_branding
7. custom_domains
8. white_label_pricing
9. venue_tier_history
10. venue_audit_log
11. api_keys
12. user_venue_roles
13. external_verifications
14. manual_review_queue
15. notifications
16. email_queue
17. venue_compliance_reviews
18. venue_compliance
19. venue_compliance_reports
20. venue_documents
21. webhook_events
22. venue_operations
23. transfer_history
24. resale_policies
25. seller_verifications
26. resale_blocks
27. fraud_logs

### Total RLS-Enabled Tables: 16
- venues (with 7 policies)
- venue_settings (with 4 policies)
- venue_integrations (with 4 policies)
- venue_audit_log (with 4 policies)
- venue_operations
- transfer_history
- resale_policies
- seller_verifications
- resale_blocks
- fraud_logs

### Total Triggers: 11+
- 10 updated_at triggers
- 1-2 audit triggers

### Total Functions: 1
- `update_updated_at_column()`

### ENUMs: 0
- Uses CHECK constraints instead of ENUMs

### CHECK Constraints: 8
- chk_royalty_percentage_range
- chk_max_capacity_positive
- chk_venue_status_valid
- chk_integration_status_valid
- chk_integration_provider_valid
- webhook_events_status_check
- venue_operations_status_check
- transfer_history_type_check
- seller_verifications_status_check
- ck_fraud_logs_risk_score_valid

---

## Recommendations for Consolidated Migration

### Required Components:
1. **Extensions:** uuid-ossp

2. **Functions:** 
   - `update_updated_at_column()`

3. **All 27 tables** with their full schemas including:
   - All columns from baseline + alterations
   - Generated columns (capacity, type on venues; provider, config on venue_integrations)
   - version columns on venues, venue_settings, venue_integrations
   - key_hash on api_keys
   - Enhanced webhook_events columns
   - Resale columns on venue_settings

4. **All indexes** (~50+ indexes)

5. **All CHECK constraints** (10)

6. **RLS enabled** on 16 tables with proper policies including WITH CHECK

7. **All triggers** (11+)

8. **Foreign keys** between tables

9. **Seed data:** white_label_pricing tiers (standard, white_label, enterprise)

### Consolidation Notes:
- Merge venue_staff creation (exists in both 001 and 003)
- Combine webhook_events base table (004) with enhancements (009)
- Include all venue_settings columns in one place
- Use consistent RLS policy pattern with WITH CHECK
