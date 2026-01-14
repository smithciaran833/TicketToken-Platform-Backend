# Auth Service - Migration Documentation

> **Generated:** January 2025
> **Total Migrations:** 1
> **Tables Created:** 11
> **Functions Created:** 10
> **Views Created:** 1

---

## Migration Sequence

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_auth_baseline.ts | Create all auth tables, functions, triggers, RLS |

---

## Tables Owned

| Table | Primary Key | Has tenant_id | RLS Enabled | Triggers |
|-------|-------------|---------------|-------------|----------|
| tenants | uuid | N/A | ❌ | ❌ |
| users | uuid | ✅ | ✅ FORCE | 4 triggers |
| user_sessions | uuid | ❌ | ❌ | ❌ |
| user_venue_roles | uuid | ❌ | ❌ | ❌ |
| audit_logs | uuid | ✅ | ❌ | ❌ |
| invalidated_tokens | text | ❌ | ❌ | ❌ |
| token_refresh_log | uuid | ❌ | ❌ | ❌ |
| oauth_connections | uuid | ❌ | ❌ | ❌ |
| wallet_connections | uuid | ❌ | ❌ | ❌ |
| biometric_credentials | uuid | ❌ | ❌ | ❌ |
| trusted_devices | uuid | ❌ | ❌ | ❌ |
| user_addresses | uuid | ❌ | ❌ | ❌ |

---

## Seed Data
```sql
-- Default tenant (inserted in migration)
INSERT INTO tenants (id, name, slug) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default');
```

---

## Table Details

### tenants
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| name | varchar(255) | NO | |
| slug | varchar(255) | NO | UNIQUE |
| status | varchar(255) | YES | 'active' |
| settings | jsonb | YES | '{}' |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

### users
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v1() |
| email | varchar(255) | NO | |
| password_hash | varchar(255) | NO | |
| email_verified | boolean | NO | false |
| email_verification_token | varchar(64) | YES | |
| email_verification_expires | timestamptz | YES | |
| email_verified_at | timestamptz | YES | |
| username | varchar(30) | YES | UNIQUE |
| display_name | varchar(100) | YES | |
| bio | text | YES | |
| avatar_url | text | YES | |
| cover_image_url | text | YES | |
| first_name | varchar(50) | YES | |
| last_name | varchar(50) | YES | |
| date_of_birth | date | YES | |
| phone | varchar(20) | YES | |
| phone_verified | boolean | YES | false |
| country_code | varchar(2) | YES | |
| city | varchar(100) | YES | |
| state_province | varchar(100) | YES | |
| postal_code | varchar(20) | YES | |
| timezone | varchar(50) | NO | 'UTC' |
| preferred_language | varchar(10) | NO | 'en' |
| status | text | NO | 'PENDING' |
| role | varchar(20) | NO | 'user' |
| permissions | jsonb | YES | '[]' |
| two_factor_enabled | boolean | NO | false |
| two_factor_secret | varchar(32) | YES | |
| backup_codes | text[] | YES | |
| mfa_enabled | boolean | NO | false |
| mfa_secret | text | YES | |
| last_password_change | timestamptz | YES | now() |
| password_reset_token | varchar(64) | YES | |
| password_reset_expires | timestamptz | YES | |
| password_changed_at | timestamptz | YES | |
| last_login_at | timestamptz | YES | |
| last_active_at | timestamptz | YES | |
| last_login_ip | inet | YES | |
| last_login_device | varchar(255) | YES | |
| login_count | integer | YES | 0 |
| failed_login_attempts | integer | YES | 0 |
| locked_until | timestamptz | YES | |
| preferences | jsonb | YES | '{}' |
| notification_preferences | jsonb | YES | (see default) |
| privacy_settings | jsonb | YES | '{}' |
| profile_data | jsonb | YES | '{}' |
| terms_accepted_at | timestamptz | YES | |
| terms_version | varchar(20) | YES | |
| privacy_accepted_at | timestamptz | YES | |
| privacy_version | varchar(20) | YES | |
| marketing_consent | boolean | YES | false |
| marketing_consent_date | timestamptz | YES | |
| referral_code | varchar(20) | YES | UNIQUE |
| referred_by | uuid | YES | FK → users.id |
| referral_count | integer | YES | 0 |
| lifetime_value | decimal(10,2) | YES | 0 |
| total_spent | decimal(10,2) | YES | 0 |
| events_attended | integer | YES | 0 |
| ticket_purchase_count | integer | YES | 0 |
| loyalty_points | integer | YES | 0 |
| can_receive_transfers | boolean | YES | true |
| identity_verified | boolean | YES | false |
| provider | varchar(50) | YES | |
| provider_user_id | varchar(255) | YES | |
| wallet_address | varchar(255) | YES | |
| network | varchar(50) | YES | |
| verified | boolean | YES | false |
| stripe_connect_account_id | varchar(255) | YES | |
| stripe_connect_status | varchar(50) | YES | 'not_started' |
| stripe_connect_charges_enabled | boolean | YES | false |
| stripe_connect_payouts_enabled | boolean | YES | false |
| stripe_connect_details_submitted | boolean | YES | false |
| stripe_connect_onboarded_at | timestamptz | YES | |
| stripe_connect_capabilities | jsonb | YES | '{}' |
| stripe_connect_country | varchar(2) | YES | |
| metadata | jsonb | YES | '{}' |
| tags | text[] | YES | |
| verification_token | varchar(255) | YES | |
| is_active | boolean | YES | true |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| deleted_at | timestamptz | YES | |
| tenant_id | uuid | NO | '00000000-0000-0000-0000-000000000001' FK → tenants.id |

---

## Foreign Keys

| Table | Column | References | On Delete |
|-------|--------|------------|-----------|
| users | referred_by | users.id | (none specified) |
| users | tenant_id | tenants.id | RESTRICT |
| user_sessions | user_id | users.id | CASCADE |
| user_venue_roles | user_id | users.id | CASCADE |
| user_venue_roles | granted_by | users.id | (none specified) |
| user_venue_roles | revoked_by | users.id | (none specified) |
| audit_logs | user_id | users.id | SET NULL |
| audit_logs | tenant_id | tenants.id | SET NULL |
| invalidated_tokens | user_id | users.id | CASCADE |
| token_refresh_log | user_id | users.id | CASCADE |
| oauth_connections | user_id | users.id | CASCADE |
| wallet_connections | user_id | users.id | CASCADE |
| biometric_credentials | user_id | users.id | CASCADE |
| trusted_devices | user_id | users.id | CASCADE |
| user_addresses | user_id | users.id | CASCADE |

---

## Indexes

### users
| Index | Type | Columns/Expression |
|-------|------|-------------------|
| idx_users_email_active | UNIQUE PARTIAL | email WHERE deleted_at IS NULL |
| idx_users_username | BTREE | username |
| idx_users_phone | BTREE | phone |
| idx_users_role | BTREE | role |
| idx_users_status | BTREE | status |
| idx_users_deleted_at | BTREE | deleted_at |
| idx_users_referral_code | BTREE | referral_code |
| idx_users_referred_by | BTREE | referred_by |
| idx_users_stripe_connect_account_id | BTREE | stripe_connect_account_id |
| idx_users_metadata_gin | GIN | metadata |
| idx_users_permissions_gin | GIN | permissions |
| idx_users_search | GIN | Full-text on username, display_name, first_name, last_name, email |

### user_sessions
| Index | Type | Columns |
|-------|------|---------|
| idx_user_sessions_user_id | BTREE | user_id |
| idx_user_sessions_ended_at | BTREE | ended_at |

### user_venue_roles
| Index | Type | Columns |
|-------|------|---------|
| idx_user_venue_roles_user_id | BTREE | user_id |
| idx_user_venue_roles_venue_id | BTREE | venue_id |

### audit_logs
| Index | Type | Columns |
|-------|------|---------|
| idx_audit_logs_user_id | BTREE | (user_id, created_at DESC) |
| idx_audit_logs_tenant_id | BTREE | (tenant_id, created_at DESC) |
| idx_audit_logs_action | BTREE | (action, created_at DESC) |
| idx_audit_logs_created_at | BTREE | created_at DESC |
| idx_audit_logs_resource | BTREE | (resource_type, resource_id, created_at DESC) |
| idx_audit_logs_table_name | BTREE | table_name |
| idx_audit_logs_record_id | BTREE | record_id |
| idx_audit_logs_changed_fields | GIN | changed_fields |

### Other tables
| Table | Index | Columns |
|-------|-------|---------|
| invalidated_tokens | idx_invalidated_tokens_user_id | user_id |
| invalidated_tokens | idx_invalidated_tokens_expires_at | expires_at |
| token_refresh_log | idx_token_refresh_log_user_id | user_id |
| token_refresh_log | idx_token_refresh_log_refreshed_at | refreshed_at |
| oauth_connections | idx_oauth_connections_user_id | user_id |
| oauth_connections | idx_oauth_connections_provider_user | UNIQUE (provider, provider_user_id) |
| wallet_connections | idx_wallet_connections_user_id | user_id |
| biometric_credentials | idx_biometric_credentials_user_id | user_id |
| trusted_devices | idx_trusted_devices_user_id | user_id |
| user_addresses | idx_user_addresses_user_id | user_id |

---

## CHECK Constraints

### users
| Constraint | Expression |
|------------|------------|
| check_email_lowercase | email = LOWER(email) |
| check_username_format | username ~ '^[a-zA-Z0-9_]{3,30}$' |
| check_referral_not_self | referred_by IS NULL OR referred_by <> id |
| check_age_minimum | date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE - INTERVAL '13 years' |
| users_status_check | status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED') |
| chk_users_stripe_connect_status | stripe_connect_status IN ('not_started', 'pending', 'enabled', 'disabled', 'rejected', 'restricted') |

### user_addresses
| Constraint | Expression |
|------------|------------|
| chk_user_addresses_type | address_type IN ('billing', 'shipping') |

---

## RLS Policies (users table only)

| Policy | Operation | Condition |
|--------|-----------|-----------|
| users_view_own | SELECT | id = current_setting('app.current_user_id', TRUE)::UUID |
| users_update_own | UPDATE | id = current_setting('app.current_user_id', TRUE)::UUID |
| users_admin_all | ALL | current_setting('app.current_user_role', TRUE) IN ('admin', 'superadmin') |
| users_tenant_isolation | ALL | tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID |

**Note:** RLS is ENABLED and FORCED on users table only.

---

## Functions Created

| Function | Type | Purpose |
|----------|------|---------|
| update_updated_at_column() | TRIGGER | Auto-update updated_at timestamp |
| generate_user_referral_code() | TRIGGER | Generate referral code on user insert |
| increment_referral_count() | TRIGGER | Increment referrer's count when referee verifies email |
| audit_trigger_function() | TRIGGER | Log all INSERT/UPDATE/DELETE to audit_logs |
| backfill_user_aggregates() | UTILITY | Backfill total_spent, lifetime_value, events_attended |
| mask_email(TEXT) | IMMUTABLE | PII masking for emails |
| mask_phone(TEXT) | IMMUTABLE | PII masking for phone numbers |
| mask_tax_id(TEXT) | IMMUTABLE | PII masking for SSN/tax IDs |
| mask_card_number(TEXT) | IMMUTABLE | PII masking for card numbers |
| cleanup_expired_data() | UTILITY | Data retention cleanup |

---

## Triggers

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| trigger_generate_referral_code | users | BEFORE INSERT | generate_user_referral_code() |
| trigger_increment_referral_count | users | AFTER UPDATE OF email_verified | increment_referral_count() |
| trigger_update_users_timestamp | users | BEFORE UPDATE | update_updated_at_column() |
| audit_users_changes | users | AFTER INSERT/UPDATE/DELETE | audit_trigger_function() |

---

## Views

| View | Purpose |
|------|---------|
| users_masked | PII-masked view for support access |
```sql
CREATE OR REPLACE VIEW users_masked AS
SELECT id, mask_email(email) as email, username, first_name, last_name, 
       mask_phone(phone) as phone, status, role, created_at, last_login_at, 
       email_verified, phone_verified
FROM users;
```

---

## Extensions Required

| Extension | Purpose |
|-----------|---------|
| uuid-ossp | uuid_generate_v4() and uuid_generate_v1() |

---

## Cross-Service Dependencies

### Tables Referenced by Other Services
| Table | Referenced By |
|-------|---------------|
| tenants | All services with tenant_id |
| users | All services with user_id |
| audit_logs | analytics-service views |

### External Tables Referenced
| Table | Service | Used In |
|-------|---------|---------|
| payment_transactions | payment-service | backfill_user_aggregates() |
| tickets | ticket-service | backfill_user_aggregates() |

### Soft References (no FK constraint)
| Column | Intended Reference |
|--------|-------------------|
| user_venue_roles.venue_id | venues.id |

---

## ⚠️ Known Issues

### 1. Missing RLS on Most Tables
Only `users` table has RLS enabled. These tables have NO RLS:
- user_sessions
- user_venue_roles
- audit_logs
- invalidated_tokens
- token_refresh_log
- oauth_connections
- wallet_connections
- biometric_credentials
- trusted_devices
- user_addresses

### 2. RLS Setting Name Inconsistency
Auth-service uses:
- `app.current_user_id`
- `app.current_user_role`
- `app.current_tenant_id`

Other services use:
- `app.current_tenant`

### 3. user_venue_roles.venue_id Has No FK
References venues table but has no foreign key constraint - can have orphaned records.

### 4. audit_logs Has No RLS
Sensitive audit data has no row-level security.

---

## Session Variables Required

| Variable | Type | Purpose |
|----------|------|---------|
| app.current_user_id | UUID | Current authenticated user |
| app.current_user_role | TEXT | User's role (admin, superadmin, user) |
| app.current_tenant_id | UUID | Current tenant context |
| app.ip_address | TEXT | Client IP (for audit) |
| app.user_agent | TEXT | Client user agent (for audit) |

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

## Data Retention

The `cleanup_expired_data()` function handles:
- Delete sessions older than 30 days
- Delete audit logs older than 7 years
- Anonymize soft-deleted users after 30 days
- Clean up orphaned wallet/oauth connections
