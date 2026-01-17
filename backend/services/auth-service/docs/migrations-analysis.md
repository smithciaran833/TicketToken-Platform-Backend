# Auth Service Database Schema Analysis
## Purpose: Integration Testing Documentation
## Source: src/migrations/001_auth_baseline.ts
## Generated: January 15, 2026

---

## EXTENSIONS

| Extension | Purpose |
|-----------|---------|
| `uuid-ossp` | UUID generation functions |

---

## CUSTOM FUNCTIONS

| Function Name | Purpose |
|---------------|---------|
| `update_updated_at_column()` | Trigger function to auto-update `updated_at` on row changes |
| `generate_user_referral_code()` | Trigger function to auto-generate referral code on user insert |
| `increment_referral_count()` | Trigger function to increment referrer's count when referee verifies email |
| `audit_trigger_function()` | Comprehensive audit logging for INSERT/UPDATE/DELETE |
| `backfill_user_aggregates()` | Utility to recalculate user statistics (total_spent, lifetime_value, events_attended) |
| `mask_email(TEXT)` | PII masking - masks email except first 2 chars and domain |
| `mask_phone(TEXT)` | PII masking - masks middle digits of phone |
| `mask_tax_id(TEXT)` | PII masking - shows only last 4 digits |
| `mask_card_number(TEXT)` | PII masking - shows only last 4 digits |
| `cleanup_expired_data()` | Data retention - cleans expired sessions, old audit logs, anonymizes deleted users |

---

## TABLE 1: `tenants`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | ✅ PK |
| `name` | VARCHAR(255) | NOT NULL | - | |
| `slug` | VARCHAR(255) | NOT NULL | - | |
| `status` | VARCHAR(255) | NULL | `'active'` | |
| `settings` | JSONB | NULL | `'{}'` | |
| `created_at` | TIMESTAMPTZ | NULL | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | NULL | `NOW()` | |

### Constraints

| Type | Name/Definition |
|------|-----------------|
| UNIQUE | `slug` column |

### Indexes

*None explicitly created beyond PK and UNIQUE constraint*

### Soft Delete

*None - no deleted_at column*

### Seed Data

- Default tenant inserted: `id='00000000-0000-0000-0000-000000000001'`, `name='Default Tenant'`, `slug='default'`

---

## TABLE 2: `users`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `id` | UUID | NOT NULL | `uuid_generate_v1()` | ✅ PK |
| `tenant_id` | UUID | NOT NULL | - | FK→tenants |
| `email` | VARCHAR(255) | NOT NULL | - | |
| `password_hash` | VARCHAR(255) | NOT NULL | - | |
| `email_verified` | BOOLEAN | NOT NULL | `false` | |
| `email_verification_token` | VARCHAR(64) | NULL | - | |
| `email_verification_expires` | TIMESTAMPTZ | NULL | - | |
| `email_verified_at` | TIMESTAMPTZ | NULL | - | |
| `username` | VARCHAR(30) | NULL | - | UNIQUE |
| `display_name` | VARCHAR(100) | NULL | - | |
| `bio` | TEXT | NULL | - | |
| `avatar_url` | TEXT | NULL | - | |
| `cover_image_url` | TEXT | NULL | - | |
| `first_name` | VARCHAR(50) | NULL | - | |
| `last_name` | VARCHAR(50) | NULL | - | |
| `date_of_birth` | DATE | NULL | - | |
| `phone` | VARCHAR(20) | NULL | - | |
| `phone_verified` | BOOLEAN | NULL | `false` | |
| `country_code` | VARCHAR(2) | NULL | - | |
| `city` | VARCHAR(100) | NULL | - | |
| `state_province` | VARCHAR(100) | NULL | - | |
| `postal_code` | VARCHAR(20) | NULL | - | |
| `timezone` | VARCHAR(50) | NOT NULL | `'UTC'` | |
| `preferred_language` | VARCHAR(10) | NOT NULL | `'en'` | |
| `status` | TEXT | NOT NULL | `'PENDING'` | |
| `role` | VARCHAR(20) | NOT NULL | `'user'` | |
| `permissions` | JSONB | NULL | `'[]'` | |
| `two_factor_enabled` | BOOLEAN | NOT NULL | `false` | |
| `two_factor_secret` | VARCHAR(32) | NULL | - | |
| `backup_codes` | TEXT[] | NULL | - | |
| `mfa_enabled` | BOOLEAN | NOT NULL | `false` | |
| `mfa_secret` | TEXT | NULL | - | |
| `last_password_change` | TIMESTAMPTZ | NULL | `NOW()` | |
| `password_reset_token` | VARCHAR(64) | NULL | - | |
| `password_reset_expires` | TIMESTAMPTZ | NULL | - | |
| `password_changed_at` | TIMESTAMPTZ | NULL | - | |
| `last_login_at` | TIMESTAMPTZ | NULL | - | |
| `last_active_at` | TIMESTAMPTZ | NULL | - | |
| `last_login_ip` | INET | NULL | - | |
| `last_login_device` | VARCHAR(255) | NULL | - | |
| `login_count` | INTEGER | NULL | `0` | |
| `failed_login_attempts` | INTEGER | NULL | `0` | |
| `locked_until` | TIMESTAMPTZ | NULL | - | |
| `preferences` | JSONB | NULL | `'{}'` | |
| `notification_preferences` | JSONB | NULL | `'{"push":...,"email":...}'` | |
| `privacy_settings` | JSONB | NULL | `'{}'` | |
| `profile_data` | JSONB | NULL | `'{}'` | |
| `terms_accepted_at` | TIMESTAMPTZ | NULL | - | |
| `terms_version` | VARCHAR(20) | NULL | - | |
| `privacy_accepted_at` | TIMESTAMPTZ | NULL | - | |
| `privacy_version` | VARCHAR(20) | NULL | - | |
| `marketing_consent` | BOOLEAN | NULL | `false` | |
| `marketing_consent_date` | TIMESTAMPTZ | NULL | - | |
| `referral_code` | VARCHAR(20) | NULL | - | UNIQUE |
| `referred_by` | UUID | NULL | - | FK→users |
| `referral_count` | INTEGER | NULL | `0` | |
| `lifetime_value` | DECIMAL(10,2) | NULL | `0` | |
| `total_spent` | DECIMAL(10,2) | NULL | `0` | |
| `events_attended` | INTEGER | NULL | `0` | |
| `ticket_purchase_count` | INTEGER | NULL | `0` | |
| `loyalty_points` | INTEGER | NULL | `0` | |
| `can_receive_transfers` | BOOLEAN | NULL | `true` | |
| `identity_verified` | BOOLEAN | NULL | `false` | |
| `provider` | VARCHAR(50) | NULL | - | |
| `provider_user_id` | VARCHAR(255) | NULL | - | |
| `wallet_address` | VARCHAR(255) | NULL | - | |
| `network` | VARCHAR(50) | NULL | - | |
| `verified` | BOOLEAN | NULL | `false` | |
| `stripe_connect_account_id` | VARCHAR(255) | NULL | - | |
| `stripe_connect_status` | VARCHAR(50) | NULL | `'not_started'` | |
| `stripe_connect_charges_enabled` | BOOLEAN | NULL | `false` | |
| `stripe_connect_payouts_enabled` | BOOLEAN | NULL | `false` | |
| `stripe_connect_details_submitted` | BOOLEAN | NULL | `false` | |
| `stripe_connect_onboarded_at` | TIMESTAMPTZ | NULL | - | |
| `stripe_connect_capabilities` | JSONB | NULL | `'{}'` | |
| `stripe_connect_country` | VARCHAR(2) | NULL | - | |
| `metadata` | JSONB | NULL | `'{}'` | |
| `tags` | TEXT[] | NULL | - | |
| `verification_token` | VARCHAR(255) | NULL | - | |
| `is_active` | BOOLEAN | NULL | `true` | |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | |
| `deleted_at` | TIMESTAMPTZ | NULL | - | ⚠️ SOFT DELETE |

### Constraints

| Type | Name | Definition |
|------|------|------------|
| UNIQUE | `username` | On username column |
| UNIQUE | `referral_code` | On referral_code column |
| FK | `tenant_id` | →tenants(id) ON DELETE RESTRICT |
| FK | `referred_by` | →users(id) (no cascade) |
| CHECK | `check_email_lowercase` | `email = LOWER(email)` |
| CHECK | `check_username_format` | `username ~ '^[a-zA-Z0-9_]{3,30}$'` |
| CHECK | `check_referral_not_self` | `referred_by IS NULL OR referred_by <> id` |
| CHECK | `check_age_minimum` | `date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE - INTERVAL '13 years'` |
| CHECK | `users_status_check` | `status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED')` |
| CHECK | `chk_users_stripe_connect_status` | `stripe_connect_status IN ('not_started', 'pending', 'enabled', 'disabled', 'rejected', 'restricted')` |

### Indexes

| Index Name | Columns | Unique | Type | Notes |
|------------|---------|--------|------|-------|
| `idx_users_email_active` | `email` | ✅ UNIQUE | BTREE | `WHERE deleted_at IS NULL` (partial) |
| `idx_users_tenant_id` | `tenant_id` | No | BTREE | |
| `idx_users_username` | `username` | No | BTREE | |
| `idx_users_phone` | `phone` | No | BTREE | |
| `idx_users_role` | `role` | No | BTREE | |
| `idx_users_status` | `status` | No | BTREE | |
| `idx_users_deleted_at` | `deleted_at` | No | BTREE | |
| `idx_users_referral_code` | `referral_code` | No | BTREE | |
| `idx_users_referred_by` | `referred_by` | No | BTREE | |
| `idx_users_stripe_connect_account_id` | `stripe_connect_account_id` | No | BTREE | |
| `idx_users_metadata_gin` | `metadata` | No | GIN | |
| `idx_users_permissions_gin` | `permissions` | No | GIN | |
| `idx_users_search` | Full-text vector | No | GIN | `to_tsvector('english', username || display_name || first_name || last_name || email)` |

### Soft Delete Indicators

| Column | Type | Purpose |
|--------|------|---------|
| `deleted_at` | TIMESTAMPTZ | Primary soft delete marker |
| `is_active` | BOOLEAN (default true) | Secondary active flag |
| `status` | TEXT | Can be `'DELETED'` |

### Triggers

| Trigger Name | Event | Function |
|--------------|-------|----------|
| `trigger_generate_referral_code` | BEFORE INSERT | `generate_user_referral_code()` |
| `trigger_increment_referral_count` | AFTER UPDATE (email_verified) | `increment_referral_count()` |
| `trigger_update_users_timestamp` | BEFORE UPDATE | `update_updated_at_column()` |
| `audit_users_changes` | AFTER INSERT/UPDATE/DELETE | `audit_trigger_function()` |

### RLS Policy

| Policy Name | Operation | Using/With Check |
|-------------|-----------|------------------|
| `users_tenant_isolation` | ALL | `tenant_id = current_setting('app.current_tenant_id')::UUID` |

---

## TABLE 3: `user_sessions`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | ✅ PK |
| `tenant_id` | UUID | NOT NULL | - | FK→tenants |
| `user_id` | UUID | NOT NULL | - | FK→users |
| `started_at` | TIMESTAMPTZ | NULL | `NOW()` | |
| `ended_at` | TIMESTAMPTZ | NULL | - | |
| `ip_address` | VARCHAR(45) | NULL | - | |
| `user_agent` | TEXT | NULL | - | |
| `revoked_at` | TIMESTAMPTZ | NULL | - | |
| `metadata` | JSONB | NULL | `'{}'` | |

### Constraints

| Type | Name | Definition |
|------|------|------------|
| FK | `tenant_id` | →tenants(id) ON DELETE RESTRICT |
| FK | `user_id` | →users(id) ON DELETE CASCADE |

### Indexes

| Index Name | Columns | Unique |
|------------|---------|--------|
| `idx_user_sessions_tenant_id` | `tenant_id` | No |
| `idx_user_sessions_user_id` | `user_id` | No |
| `idx_user_sessions_ended_at` | `ended_at` | No |

### Soft Delete Indicators

| Column | Type | Purpose |
|--------|------|---------|
| `ended_at` | TIMESTAMPTZ | Session end marker |
| `revoked_at` | TIMESTAMPTZ | Session revocation marker |

---

## TABLE 4: `user_venue_roles`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | ✅ PK |
| `tenant_id` | UUID | NOT NULL | - | FK→tenants |
| `user_id` | UUID | NOT NULL | - | FK→users |
| `venue_id` | UUID | NOT NULL | - | |
| `role` | VARCHAR(50) | NOT NULL | - | |
| `granted_by` | UUID | NULL | - | FK→users |
| `is_active` | BOOLEAN | NULL | `true` | |
| `expires_at` | TIMESTAMPTZ | NULL | - | |
| `created_at` | TIMESTAMPTZ | NULL | `NOW()` | |
| `granted_at` | TIMESTAMPTZ | NULL | - | |
| `revoked_at` | TIMESTAMPTZ | NULL | - | |
| `revoked_by` | UUID | NULL | - | FK→users |

### Constraints

| Type | Name | Definition |
|------|------|------------|
| FK | `tenant_id` | →tenants(id) ON DELETE RESTRICT |
| FK | `user_id` | →users(id) ON DELETE CASCADE |
| FK | `granted_by` | →users(id) |
| FK | `revoked_by` | →users(id) |

### Indexes

| Index Name | Columns | Unique |
|------------|---------|--------|
| `idx_user_venue_roles_tenant_id` | `tenant_id` | No |
| `idx_user_venue_roles_user_id` | `user_id` | No |
| `idx_user_venue_roles_venue_id` | `venue_id` | No |

### Soft Delete Indicators

| Column | Type | Purpose |
|--------|------|---------|
| `is_active` | BOOLEAN (default true) | Active flag |
| `revoked_at` | TIMESTAMPTZ | Revocation timestamp |
| `expires_at` | TIMESTAMPTZ | Expiration timestamp |

---

## TABLE 5: `audit_logs`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | ✅ PK |
| `tenant_id` | UUID | NULL | - | FK→tenants |
| `service` | VARCHAR(100) | NOT NULL | - | |
| `action` | VARCHAR(200) | NOT NULL | - | |
| `action_type` | VARCHAR(50) | NOT NULL | - | |
| `user_id` | UUID | NULL | - | FK→users |
| `user_role` | VARCHAR(100) | NULL | - | |
| `resource_type` | VARCHAR(100) | NOT NULL | - | |
| `resource_id` | UUID | NULL | - | |
| `table_name` | VARCHAR(100) | NULL | - | |
| `record_id` | UUID | NULL | - | |
| `changed_fields` | TEXT[] | NULL | - | |
| `old_data` | JSONB | NULL | - | |
| `new_data` | JSONB | NULL | - | |
| `previous_value` | JSONB | NULL | - | |
| `new_value` | JSONB | NULL | - | |
| `metadata` | JSONB | NULL | `'{}'` | |
| `ip_address` | VARCHAR(45) | NULL | - | |
| `user_agent` | TEXT | NULL | - | |
| `created_at` | TIMESTAMPTZ | NULL | `NOW()` | |
| `success` | BOOLEAN | NOT NULL | `true` | |
| `error_message` | TEXT | NULL | - | |

### Constraints

| Type | Name | Definition |
|------|------|------------|
| FK | `tenant_id` | →tenants(id) ON DELETE SET NULL |
| FK | `user_id` | →users(id) ON DELETE SET NULL |

### Indexes

| Index Name | Columns | Unique | Notes |
|------------|---------|--------|-------|
| `idx_audit_logs_tenant_id` | `tenant_id` | No | |
| `idx_audit_logs_user_id` | `user_id, created_at DESC` | No | Composite |
| `idx_audit_logs_action` | `action, created_at DESC` | No | Composite |
| `idx_audit_logs_created_at` | `created_at DESC` | No | |
| `idx_audit_logs_resource` | `resource_type, resource_id, created_at DESC` | No | Composite |
| `idx_audit_logs_table_name` | `table_name` | No | |
| `idx_audit_logs_record_id` | `record_id` | No | |
| `idx_audit_logs_changed_fields` | `changed_fields` | No | GIN |

---

## TABLE 6: `invalidated_tokens`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `token` | TEXT | NOT NULL | - | ✅ PK |
| `tenant_id` | UUID | NOT NULL | - | FK→tenants |
| `user_id` | UUID | NOT NULL | - | FK→users |
| `invalidated_at` | TIMESTAMPTZ | NULL | `NOW()` | |
| `expires_at` | TIMESTAMPTZ | NOT NULL | - | |

### Constraints

| Type | Name | Definition |
|------|------|------------|
| FK | `tenant_id` | →tenants(id) ON DELETE RESTRICT |
| FK | `user_id` | →users(id) ON DELETE CASCADE |

### Indexes

| Index Name | Columns | Unique |
|------------|---------|--------|
| `idx_invalidated_tokens_tenant_id` | `tenant_id` | No |
| `idx_invalidated_tokens_user_id` | `user_id` | No |
| `idx_invalidated_tokens_expires_at` | `expires_at` | No |

---

## TABLE 7: `token_refresh_log`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | ✅ PK |
| `tenant_id` | UUID | NOT NULL | - | FK→tenants |
| `user_id` | UUID | NOT NULL | - | FK→users |
| `ip_address` | VARCHAR(45) | NULL | - | |
| `user_agent` | TEXT | NULL | - | |
| `refreshed_at` | TIMESTAMPTZ | NULL | `NOW()` | |
| `metadata` | JSONB | NULL | `'{}'` | |

### Constraints

| Type | Name | Definition |
|------|------|------------|
| FK | `tenant_id` | →tenants(id) ON DELETE RESTRICT |
| FK | `user_id` | →users(id) ON DELETE CASCADE |

### Indexes

| Index Name | Columns | Unique |
|------------|---------|--------|
| `idx_token_refresh_log_tenant_id` | `tenant_id` | No |
| `idx_token_refresh_log_user_id` | `user_id` | No |
| `idx_token_refresh_log_refreshed_at` | `refreshed_at` | No |

---

## TABLE 8: `oauth_connections`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | ✅ PK |
| `tenant_id` | UUID | NOT NULL | - | FK→tenants |
| `user_id` | UUID | NOT NULL | - | FK→users |
| `provider` | VARCHAR(50) | NOT NULL | - | |
| `provider_user_id` | VARCHAR(255) | NOT NULL | - | |
| `profile_data` | JSONB | NULL | `'{}'` | |
| `created_at` | TIMESTAMPTZ | NULL | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | NULL | `NOW()` | |

### Constraints

| Type | Name | Definition |
|------|------|------------|
| FK | `tenant_id` | →tenants(id) ON DELETE RESTRICT |
| FK | `user_id` | →users(id) ON DELETE CASCADE |

### Indexes

| Index Name | Columns | Unique |
|------------|---------|--------|
| `idx_oauth_connections_tenant_id` | `tenant_id` | No |
| `idx_oauth_connections_user_id` | `user_id` | No |
| `idx_oauth_connections_provider_user` | `provider, provider_user_id` | ✅ UNIQUE |

---

## TABLE 9: `wallet_connections`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | ✅ PK |
| `tenant_id` | UUID | NOT NULL | - | FK→tenants |
| `user_id` | UUID | NOT NULL | - | FK→users |
| `wallet_address` | VARCHAR(255) | NOT NULL | - | |
| `network` | VARCHAR(50) | NOT NULL | - | |
| `verified` | BOOLEAN | NULL | `false` | |
| `last_login_at` | TIMESTAMPTZ | NULL | - | |
| `created_at` | TIMESTAMPTZ | NULL | `NOW()` | |

### Constraints

| Type | Name | Definition |
|------|------|------------|
| FK | `tenant_id` | →tenants(id) ON DELETE RESTRICT |
| FK | `user_id` | →users(id) ON DELETE CASCADE |

### Indexes

| Index Name | Columns | Unique |
|------------|---------|--------|
| `idx_wallet_connections_tenant_id` | `tenant_id` | No |
| `idx_wallet_connections_user_id` | `user_id` | No |

---

## TABLE 10: `biometric_credentials`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | ✅ PK |
| `tenant_id` | UUID | NOT NULL | - | FK→tenants |
| `user_id` | UUID | NOT NULL | - | FK→users |
| `device_id` | VARCHAR(255) | NOT NULL | - | |
| `public_key` | TEXT | NOT NULL | - | |
| `credential_type` | VARCHAR(50) | NOT NULL | - | |
| `created_at` | TIMESTAMPTZ | NULL | `NOW()` | |

### Constraints

| Type | Name | Definition |
|------|------|------------|
| FK | `tenant_id` | →tenants(id) ON DELETE RESTRICT |
| FK | `user_id` | →users(id) ON DELETE CASCADE |

### Indexes

| Index Name | Columns | Unique |
|------------|---------|--------|
| `idx_biometric_credentials_tenant_id` | `tenant_id` | No |
| `idx_biometric_credentials_user_id` | `user_id` | No |

---

## TABLE 11: `trusted_devices`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | ✅ PK |
| `tenant_id` | UUID | NOT NULL | - | FK→tenants |
| `user_id` | UUID | NOT NULL | - | FK→users |
| `device_fingerprint` | VARCHAR(255) | NOT NULL | - | |
| `trust_score` | INTEGER | NULL | `0` | |
| `last_seen` | TIMESTAMPTZ | NULL | `NOW()` | |
| `created_at` | TIMESTAMPTZ | NULL | `NOW()` | |

### Constraints

| Type | Name | Definition |
|------|------|------------|
| FK | `tenant_id` | →tenants(id) ON DELETE RESTRICT |
| FK | `user_id` | →users(id) ON DELETE CASCADE |

### Indexes

| Index Name | Columns | Unique |
|------------|---------|--------|
| `idx_trusted_devices_tenant_id` | `tenant_id` | No |
| `idx_trusted_devices_user_id` | `user_id` | No |

---

## TABLE 12: `user_addresses`

### Columns

| Column | Type | Nullable | Default | Primary Key |
|--------|------|----------|---------|-------------|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | ✅ PK |
| `tenant_id` | UUID | NOT NULL | - | FK→tenants |
| `user_id` | UUID | NOT NULL | - | FK→users |
| `address_type` | VARCHAR(20) | NOT NULL | `'billing'` | |
| `address_line1` | VARCHAR(255) | NOT NULL | - | |
| `address_line2` | VARCHAR(255) | NULL | - | |
| `city` | VARCHAR(100) | NOT NULL | - | |
| `state_province` | VARCHAR(100) | NULL | - | |
| `postal_code` | VARCHAR(20) | NOT NULL | - | |
| `country_code` | VARCHAR(2) | NOT NULL | `'US'` | |
| `normalized_address` | VARCHAR(500) | NULL | - | |
| `is_default` | BOOLEAN | NULL | `false` | |
| `created_at` | TIMESTAMPTZ | NULL | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | NULL | `NOW()` | |

### Constraints

| Type | Name | Definition |
|------|------|------------|
| FK | `tenant_id` | →tenants(id) ON DELETE RESTRICT |
| FK | `user_id` | →users(id) ON DELETE CASCADE |
| CHECK | `chk_user_addresses_type` | `address_type IN ('billing', 'shipping')` |

### Indexes

| Index Name | Columns | Unique |
|------------|---------|--------|
| `idx_user_addresses_tenant_id` | `tenant_id` | No |
| `idx_user_addresses_user_id` | `user_id` | No |

---

## ROW LEVEL SECURITY (RLS) Summary

| Table | Policy Name | Enabled | Forced |
|-------|-------------|---------|--------|
| `users` | `users_tenant_isolation` | ✅ | ✅ |
| `user_sessions` | `user_sessions_tenant_isolation` | ✅ | ✅ |
| `user_venue_roles` | `user_venue_roles_tenant_isolation` | ✅ | ✅ |
| `audit_logs` | `audit_logs_tenant_isolation` | ✅ | ✅ |
| `invalidated_tokens` | `invalidated_tokens_tenant_isolation` | ✅ | ✅ |
| `token_refresh_log` | `token_refresh_log_tenant_isolation` | ✅ | ✅ |
| `oauth_connections` | `oauth_connections_tenant_isolation` | ✅ | ✅ |
| `wallet_connections` | `wallet_connections_tenant_isolation` | ✅ | ✅ |
| `biometric_credentials` | `biometric_credentials_tenant_isolation` | ✅ | ✅ |
| `trusted_devices` | `trusted_devices_tenant_isolation` | ✅ | ✅ |
| `user_addresses` | `user_addresses_tenant_isolation` | ✅ | ✅ |

**Note:** `tenants` table has NO RLS (it is the root tenant table)

---

## VIEWS

| View Name | Purpose |
|-----------|---------|
| `users_masked` | PII-masked view of users table for support access |

---

## SUMMARY STATISTICS

| Metric | Count |
|--------|-------|
| Tables Created | 12 |
| Custom Functions | 10 |
| Triggers | 4 (all on users) |
| Unique Indexes | 4 |
| Non-unique Indexes | 30+ |
| GIN Indexes | 4 |
| Partial Indexes | 1 (`idx_users_email_active`) |
| CHECK Constraints | 8 |
| Foreign Keys | 19 |
| RLS Policies | 11 |
| Views | 1 |
