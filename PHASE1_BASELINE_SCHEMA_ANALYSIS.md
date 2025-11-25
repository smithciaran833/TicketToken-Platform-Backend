# Phase 1: Baseline Schema Analysis

**Analysis Date:** November 19, 2025  
**Total Phase 1 Files:** 20 baseline migrations  
**Files Analyzed:** 2 of 20 (analytics-service, auth-service)  
**Status:** IN PROGRESS

---

## Analysis Summary

### Services Analyzed (2/20)

| Service | Tables | Indexes | Foreign Keys | Functions | Triggers | Views | RLS Policies | Data Inserts |
|---------|--------|---------|--------------|-----------|----------|-------|--------------|--------------|
| analytics-service | 11 | 50+ | 1 | 0 | 0 | 0 | 9 | 0 |
| auth-service | 10 | 35+ | 7 | 3 | 3 | 0 | 0 | 1 |
| **SUBTOTAL** | **21** | **85+** | **8** | **3** | **3** | **0** | **9** | **1** |

---

## 1. ANALYTICS-SERVICE (001_analytics_baseline.ts)

### Tables Created (11)

#### 1.1 analytics_metrics
**Purpose:** Store raw analytics metric data points
- **Primary Key:** `id` (UUID, auto-generated)
- **Columns (12):**
  - `id` - UUID, PK
  - `tenant_id` - UUID, NOT NULL, indexed
  - `metric_type` - VARCHAR, NOT NULL
  - `entity_type` - VARCHAR, NOT NULL
  - `entity_id` - UUID, NOT NULL
  - `dimensions` - JSONB, default '{}'
  - `value` - DECIMAL(15,2), NOT NULL
  -

 `unit` - VARCHAR, NOT NULL
  - `metadata` - JSONB, default '{}'
  - `timestamp` - TIMESTAMP, NOT NULL, default NOW()
  - `created_at` - TIMESTAMP (auto)
  - `updated_at` - TIMESTAMP (auto)

**Indexes (5):**
- `(tenant_id)` - btree
- `(tenant_id, metric_type)` - composite
- `(tenant_id, entity_type, entity_id)` - composite
- `(tenant_id, timestamp)` - composite
- `(timestamp)` - btree

**Constraints:**
- tenant_id NOT NULL
- value NOT NULL

#### 1.2 analytics_aggregations
**Purpose:** Store pre-aggregated analytics data
- **Primary Key:** `id` (UUID)
- **Columns (15):**
  - `id` - UUID, PK
  - `tenant_id` - UUID, NOT NULL
  - `aggregation_type` - VARCHAR, NOT NULL
  - `metric_type` - VARCHAR, NOT NULL
  - `entity_type` - VARCHAR, NOT NULL
  - `entity_id` - UUID
  - `dimensions` - JSONB, default '{}'
  - `time_period` - VARCHAR, NOT NULL
  - `period_start` - TIMESTAMP, NOT NULL
  - `period_end` - TIMESTAMP, NOT NULL
  - `value` - DECIMAL(15,2), NOT NULL
  - `unit` - VARCHAR, NOT NULL
  - `sample_count` - INTEGER, default 0
  - `metadata` - JSONB, default '{}'
  - `created_at`, `updated_at` - TIMESTAMP

**Indexes (5):**
- `(tenant_id)` - btree
- `(tenant_id, aggregation_type)` - composite
- `(tenant_id, metric_type)` - composite
- `(tenant_id, entity_type, entity_id)` - composite
- `(tenant_id, time_period, period_start)` - composite
- `(period_start)` - btree

**Unique Constraints:**
- `(tenant_id, aggregation_type, metric_type, entity_type, entity_id, time_period, period_start)` - Prevents duplicate aggregations

#### 1.3 analytics_alerts
**Purpose:** Store analytics-based alerts and notifications
- **Primary Key:** `id` (UUID)
- **Columns (17):**
  - `id` - UUID, PK
  - `tenant_id` - UUID, NOT NULL
  - `alert_type` - VARCHAR, NOT NULL
  - `severity` - VARCHAR, NOT NULL
  - `metric_type` - VARCHAR, NOT NULL
  - `entity_type` - VARCHAR, NOT NULL
  - `entity_id` - UUID
  - `threshold_config` - JSONB, NOT NULL
  - `current_value` - DECIMAL(15,2)
  - `threshold_value` - DECIMAL(15,2)
  - `status` - VARCHAR, NOT NULL, default 'active'
  - `message` - TEXT, NOT NULL
  - `metadata` - JSONB, default '{}'
  - `triggered_at` - TIMESTAMP, NOT NULL, default NOW()
  - `resolved_at` - TIMESTAMP
  - `resolved_by` - UUID
  - `created_at`, `updated_at` - TIMESTAMP

**Indexes (5):**
- `(tenant_id, status)` - composite
- `(tenant_id, alert_type)` - composite
- `(tenant_id, severity)` - composite
- `(tenant_id, entity_type, entity_id)` - composite  
- `(triggered_at)` - btree

#### 1.4 analytics_dashboards
**Purpose:** Store dashboard configurations
- **Primary Key:** `id` (UUID)
- **Columns (10):**
  - `id` - UUID, PK
  - `tenant_id` - UUID, NOT NULL
  - `name` - VARCHAR, NOT NULL
  - `description` - TEXT
  - `type` - VARCHAR, NOT NULL
  - `layout` - JSONB, default '{}'
  - `filters` - JSONB, default '{}'
  - `visibility` - VARCHAR, NOT NULL, default 'private'
  - `created_by` - UUID, NOT NULL
  - `is_default` - BOOLEAN, default false
  - `display_order` - INTEGER, default 0
  - `created_at`, `updated_at` - TIMESTAMP

**Indexes (3):**
- `(tenant_id, type)` - composite
- `(tenant_id, created_by)` - composite
- `(tenant_id, is_default)` - composite

#### 1.5 analytics_widgets
**Purpose:** Store widget configurations for dashboards
- **Primary Key:** `id` (UUID)
- **Foreign Keys:**
  - `dashboard_id` → `analytics_dashboards(id)` ON DELETE CASCADE
- **Columns (11):**
  - `id` - UUID, PK
  - `tenant_id` - UUID, NOT NULL
  - `dashboard_id` - UUID, NOT NULL, FK
  - `widget_type` - VARCHAR, NOT NULL
  - `title` - VARCHAR, NOT NULL
  - `description` - TEXT
  - `configuration` - JSONB, NOT NULL
  - `data_source` - JSONB, NOT NULL
  - `position` - JSONB, NOT NULL
  - `size` - JSONB, NOT NULL
  - `style` - JSONB, default '{}'
  - `refresh_interval` - INTEGER, default 60
  - `created_at`, `updated_at` - TIMESTAMP

**Indexes (2):**
- `(tenant_id, dashboard_id)` - composite
- `(tenant_id, widget_type)` - composite

#### 1.6 analytics_exports
**Purpose:** Store analytics export job metadata
- **Primary Key:** `id` (UUID)
- **Columns (12):**
  - `id` - UUID, PK
  - `tenant_id` - UUID, NOT NULL
  - `export_type` - VARCHAR, NOT NULL
  - `format` - VARCHAR, NOT NULL
  - `status` - VARCHAR, NOT NULL, default 'pending'
  - `parameters` - JSONB, NOT NULL
  - `file_path` - VARCHAR
  - `file_url` - VARCHAR
  - `file_size` - INTEGER
  - `expires_at` - TIMESTAMP
  - `requested_by` - UUID, NOT NULL
  - `error_message` - TEXT
  - `created_at`, `updated_at` - TIMESTAMP

**Indexes (4):**
- `(tenant_id, status)` - composite
- `(tenant_id, requested_by)` - composite
- `(tenant_id, export_type)` - composite
- `(expires_at)` - btree

#### 1.7 customer_rfm_scores
**Purpose:** Store RFM (Recency, Frequency, Monetary) analysis scores
- **Primary Key:** `id` (UUID)
- **Columns (17):**
  - `id` - UUID, PK
  - `customer_id` - UUID, NOT NULL
  - `venue_id` - UUID, NOT NULL
  - `tenant_id` - UUID, NOT NULL
  - `recency_score` - INTEGER, NOT NULL (1-5 scale)
  - `frequency_score` - INTEGER, NOT NULL (1-5 scale)
  - `monetary_score` - INTEGER, NOT NULL (1-5 scale)
  - `total_score` - INTEGER, NOT NULL
  - `days_since_last_purchase` - INTEGER
  - `total_purchases` - INTEGER, default 0
  - `total_spent` - DECIMAL(12,2), default 0
  - `average_order_value` - DECIMAL(10,2)
  - `segment` - VARCHAR(50), NOT NULL
  - `churn_risk` - VARCHAR(20)
  - `calculated_at` - TIMESTAMP, default NOW()
  - `created_at`, `updated_at` - TIMESTAMP

**Unique Constraints:**
- `(customer_id, venue_id)` - ONE RFM score per customer per venue

**Indexes (8):**
- `(tenant_id)` - btree
- `(venue_id)` - btree
- `(segment)` - btree
- `(total_score)` - btree
- `(calculated_at)` - btree
- `(venue_id, segment)` - composite
- `(venue_id, churn_risk)` - composite

#### 1.8 customer_segments
**Purpose:** Store aggregated segment metrics
- **Primary Key:** `id` (UUID)
- **Columns (11):**
  - `id` - UUID, PK
  - `venue_id` - UUID, NOT NULL
  - `tenant_id` - UUID, NOT NULL
  - `segment_name` - VARCHAR(50), NOT NULL
  - `customer_count` - INTEGER, default 0
  - `total_revenue` - DECIMAL(12,2), default 0
  - `avg_order_value` - DECIMAL(10,2)
  - `avg_lifetime_value` - DECIMAL(10,2)
  - `avg_purchase_frequency` - DECIMAL(5,2)
  - `last_calculated_at` - TIMESTAMP
  - `created_at`, `updated_at` - TIMESTAMP

**Unique Constraints:**
- `(venue_id, segment_name)` - ONE entry per segment per venue

**Indexes (2):**
- `(tenant_id)` - btree
- `(last_calculated_at)` - btree

#### 1.9 customer_lifetime_value
**Purpose:** Store CLV calculations and predictions
- **Primary Key:** `id` (UUID)
- **Columns (14):**
  - `id` - UUID, PK
  - `customer_id` - UUID, NOT NULL, UNIQUE
  - `venue_id` - UUID
  - `tenant_id` - UUID, NOT NULL
  - `clv` - DECIMAL(12,2), NOT NULL
  - `avg_order_value` - DECIMAL(10,2)
  - `purchase_frequency` - DECIMAL(8,2)
  - `customer_lifespan_days` - INTEGER
  - `total_purchases` - INTEGER
  - `total_revenue` - DECIMAL(12,2)
  - `predicted_clv_12_months` - DECIMAL(12,2)
  - `predicted_clv_24_months` - DECIMAL(12,2)
  - `churn_probability` - DECIMAL(5,4)
  - `calculated_at`, `created_at`, `updated_at` - TIMESTAMP

**Unique Constraints:**
- `(customer_id)` - ONE CLV record per customer

**Indexes (5):**
- `(tenant_id)` - btree
- `(venue_id)` - btree
- `(clv)` - btree
- `(calculated_at)` - btree
- `(venue_id, clv)` - composite

#### 1.10 price_history
**Purpose:** Track price changes for dynamic pricing
- **Primary Key:** `id` (UUID)
- **Columns (5):**
  - `id` - UUID, PK
  - `event_id` - UUID, NOT NULL
  - `price_cents` - INTEGER, NOT NULL
  - `reason` - TEXT
  - `changed_at` - TIMESTAMP, NOT NULL, default NOW()
  - `changed_by` - UUID

**Indexes (1):**
- `(event_id, changed_at)` - composite

#### 1.11 pending_price_changes
**Purpose:** Store pending price change recommendations
- **Primary Key:** `id` (UUID)
- **Columns (13):**
  - `id` - UUID, PK
  - `event_id` - UUID, NOT NULL, UNIQUE
  - `current_price` - INTEGER, NOT NULL
  - `recommended_price` - INTEGER, NOT NULL
  - `confidence` - DECIMAL(3,2), NOT NULL
  - `reasoning` - JSONB
  - `demand_score` - INTEGER
  - `created_at` - TIMESTAMP, NOT NULL, default NOW()
  - `updated_at` - TIMESTAMP
  - `approved_at` - TIMESTAMP
  - `approved_by` - UUID
  - `approval_reason` - TEXT
  - `rejected_at` - TIMESTAMP
  - `rejected_by` - UUID
  - `rejection_reason` - TEXT

**Unique Constraints:**
- `(event_id)` - ONE pending change per event

**Indexes (2):**
- `(event_id)` - btree
- `(approved_at)` - btree

### Data Modifications

#### ALTER TABLE Operations
- **venue_settings** (if exists):
  - Added: `dynamic_pricing_enabled` BOOLEAN, default false
  - Added: `price_min_multiplier` DECIMAL(3,2), default 0.9
  - Added: `price_max_multiplier` DECIMAL(3,2), default 2.0
  - Added: `price_adjustment_frequency` INTEGER, default 60
  - Added: `price_require_approval` BOOLEAN, default true
  - Added: `price_aggressiveness` DECIMAL(3,2), default 0.5

### RLS Policies (9)

All analytics tables have Row Level Security enabled with tenant isolation:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON <table>
USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

Applied to:
1. analytics_metrics
2. analytics_aggregations
3. analytics_alerts
4. analytics_dashboards
5. analytics_widgets
6. analytics_exports
7. customer_rfm_scores
8. customer_segments
9. customer_lifetime_value

---

## 2. AUTH-SERVICE (001_auth_baseline.ts)

### Extensions Created
- `uuid-ossp` - For UUID generation

### Functions Created (3)

#### 2.1 update_updated_at_column()
**Purpose:** Automatically update updated_at timestamp on row updates
**Returns:** TRIGGER
**Language:** PL/pgSQL
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';
```

#### 2.2 generate_user_referral_code()
**Purpose:** Auto-generate unique referral codes for new users
**Returns:** TRIGGER
**Language:** PL/pgSQL
```sql
CREATE OR REPLACE FUNCTION generate_user_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NEW.id::TEXT) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';
```

#### 2.3 increment_referral_count()
**Purpose:** Increment referrer's count when referral verifies email
**Returns:** TRIGGER
**Language:** PL/pgSQL
```sql
CREATE OR REPLACE FUNCTION increment_referral_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referred_by IS NOT NULL THEN
    UPDATE users 
    SET referral_count = referral_count + 1 
    WHERE id = NEW.referred_by;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';
```

### Tables Created (10)

#### 2.1 tenants
**Purpose:** Multi-tenancy support - root tenant table
- **Primary Key:** `id` (UUID)
- **Columns (6):**
  - `id` - UUID, PK, default uuid_generate_v4()
  - `name` - VARCHAR(255), NOT NULL
  - `slug` - VARCHAR(255), NOT NULL, UNIQUE
  - `status` - VARCHAR(255), default 'active'
  - `settings` - JSONB, default '{}'
  - `created_at`, `updated_at` - TIMESTAMP

**Data Inserts:**
- Default tenant: id='00000000-0000-0000-0000-000000000001', name='Default Tenant', slug='default'

#### 2.2 users
**Purpose:** Core user authentication and profile data
- **Primary Key:** `id` (UUID, v1)
- **Foreign Keys:**
  - `referred_by` → `users(id)` (self-referential)
- **Columns (66):**

**Core Identity (3):**
  - `id` - UUID, PK
  - `email` - VARCHAR(255), NOT NULL, UNIQUE
  - `password_hash` - VARCHAR(255), NOT NULL

**Email Verification (4):**
  - `email_verified` - BOOLEAN, default false
  - `email_verification_token` - VARCHAR(64)
  - `email_verification_expires` - TIMESTAMP
  - `email_verified_at` - TIMESTAMP

**Profile Basic (8):**
  - `username` - VARCHAR(30), UNIQUE
  - `display_name` - VARCHAR(100)
  - `bio` - TEXT
  - `avatar_url` - TEXT
  - `cover_image_url` - TEXT
  - `first_name` - VARCHAR(50)
  - `last_name` - VARCHAR(50)
  - `date_of_birth` - DATE

**Contact (2):**
  - `phone` - VARCHAR(20)
  - `phone_verified` - BOOLEAN, default false

**Location (4):**
  - `country_code` - VARCHAR(2)
  - `city` - VARCHAR(100)
  - `state_province` - VARCHAR(100)
  - `postal_code` - VARCHAR(20)

**Preferences (2):**
  - `timezone` - VARCHAR(50), default 'UTC'
  - `preferred_language` - VARCHAR(10), default 'en'

**Status & Role (3):**
  - `status` - TEXT, default 'PENDING'
  - `role` - VARCHAR(20), default 'user'
  - `permissions` - JSONB, default '[]'

**MFA/2FA (5):**
  - `two_factor_enabled` - BOOLEAN, default false
  - `two_factor_secret` - VARCHAR(32)
  - `backup_codes` - TEXT[]
  - `mfa_enabled` - BOOLEAN, default false
  - `mfa_secret` - TEXT

**Password Management (4):**
  - `last_password_change` - TIMESTAMP, default NOW()
  - `password_reset_token` - VARCHAR(64)
  - `password_reset_expires` - TIMESTAMP
  - `password_changed_at` - TIMESTAMP

**Login Tracking (6):**
  - `last_login_at` - TIMESTAMP
  - `last_login_ip` - INET
  - `last_login_device` - VARCHAR(255)
  - `login_count` - INTEGER, default 0
  - `failed_login_attempts` - INTEGER, default 0
  - `locked_until` - TIMESTAMP

**Settings (3):**
  - `preferences` - JSONB, default '{}'
  - `notification_preferences` - JSONB, with defaults for push/email
  - `profile_data` - JSONB, default '{}'

**Legal & Compliance (6):**
  - `terms_accepted_at` - TIMESTAMP
  - `terms_version` - VARCHAR(20)
  - `privacy_accepted_at` - TIMESTAMP
  - `privacy_version` - VARCHAR(20)
  - `marketing_consent` - BOOLEAN, default false
  - `marketing_consent_date` - TIMESTAMP

**Referrals (3):**
  - `referral_code` - VARCHAR(20), UNIQUE
  - `referred_by` - UUID, FK to users(id)
  - `referral_count` - INTEGER, default 0

**OAuth/External Auth (2):**
  - `provider` - VARCHAR(50)
  - `provider_user_id` - VARCHAR(255)

**Web3/Wallet (3):**
  - `wallet_address` - VARCHAR(255)
  - `network` - VARCHAR(50)
  - `verified` - BOOLEAN, default false

**Metadata (3):**
  - `metadata` - JSONB, default '{}'
  - `tags` - TEXT[]
  - `verification_token` - VARCHAR(255)

**Activity (1):**
  - `is_active` - BOOLEAN, default true

**Timestamps (3):**
  - `created_at` - TIMESTAMP, default NOW()
  - `updated_at` - TIMESTAMP, default NOW()
  - `deleted_at` - TIMESTAMP

**Multi-tenancy (1):**
  - `tenant_id` - UUID

**Indexes (20 total):**
- Standard btree: email, username, phone, role, status, deleted_at, country_code, display_name, email_verification_token, password_reset_token, referral_code, referred_by, timezone
- Composite: (role, status), (status, created_at)
- GIN (JSONB): metadata, permissions, preferences
- Full-text search (GIN): Combined username, display_name, first_name, last_name, email

**Check Constraints (5):**
1. `check_email_lowercase` - Email must be lowercase
2. `check_username_format` - Username must match ^[a-zA-Z0-9_]{3,30}$
3. `check_referral_not_self` - Cannot refer yourself
4. `check_age_minimum` - Must be 13+ years old
5. `users_status_check` - Status must be PENDING, ACTIVE, SUSPENDED, or DELETED

#### 2.3 user_sessions
**Purpose:** Track user login sessions
- **Primary Key:** `id` (UUID)
- **Foreign Keys:**
  - `user_id` → `users(id)` ON DELETE CASCADE
- **Columns (7):**
  - `id` - UUID, PK
  - `user_id` - UUID, NOT NULL, FK
  - `started_at` - TIMESTAMP, default NOW()
  - `ended_at` - TIMESTAMP
  - `ip_address` - VARCHAR(45)
  - `user_agent` - TEXT
  - `revoked_at` - TIMESTAMP
  - `metadata` - JSONB, default '{}'

**Indexes (2):**
- `(user_id)` - btree
- `(ended_at)` - btree

#### 2.4 user_venue_roles
**Purpose:** Venue-specific user roles
- **Primary Key:** `id` (UUID)
- **Foreign Keys:**
  - `user_id` → `users(id)` ON DELETE CASCADE
  - `granted_by` → `users(id)`
  - `revoked_by` → `users(id)`
- **Columns (9):**
  - `id` - UUID, PK
  - `user_id` - UUID, NOT NULL, FK
  - `venue_id` - UUID, NOT NULL
  - `role` - VARCHAR(50), NOT NULL
  - `granted_by` - UUID, FK
  - `is_active` - BOOLEAN, default true
  - `expires_at` - TIMESTAMP
  - `created_at` - TIMESTAMP, default NOW()
  - `granted_at` - TIMESTAMP
  - `revoked_at` - TIMESTAMP
  - `revoked_by` - UUID, FK

**Indexes (2):**
- `(user_id)` - btree
- `(venue_id)` - btree

#### 2.5 audit_logs
**Purpose:** Comprehensive audit trail
- **Primary Key:** `id` (UUID)
- **Foreign Keys:**
  - `user_id` → `users(id)` ON DELETE SET NULL
- **Columns (10):**
  - `id` - UUID, PK
  - `user_id` - UUID, FK (nullable)
  - `action` - VARCHAR(100), NOT NULL
  - `resource_type` - VARCHAR(50)
  - `resource_id` - UUID
  - `ip_address` - VARCHAR(45)
  - `user_agent` - TEXT
  - `metadata` - JSONB, default '{}'
  - `status` - VARCHAR(20), default 'success'
  - `error_message` - TEXT
  - `created_at` - TIMESTAMP, default NOW()

**Indexes (4):**
- `(user_id)` - btree
- `(action)` - btree
- `(created_at)` - btree
- `(resource_type, resource_id)` - composite

#### 2.6 invalidated_tokens
**Purpose:** JWT token blacklist
- **Primary Key:** `token` (TEXT)
- **Foreign Keys:**
  - `user_id` → `users(id)` ON DELETE CASCADE
- **Columns (4):**
  - `token` - TEXT, PK
  - `user_id` - UUID, NOT NULL, FK
  - `invalidated_at` - TIMESTAMP, default NOW()
  - `expires_at` - TIMESTAMP, NOT NULL

**Indexes (2):**
- `(user_id)` - btree
- `(expires_at)` - btree

#### 2.7 oauth_connections
**Purpose:** OAuth provider connections
- **Primary Key:** `id` (UUID)
- **Foreign Keys:**
  - `user_id` → `users(id)` ON DELETE CASCADE
- **Columns (5):**
  - `id` - UUID, PK
  - `user_id` - UUID, NOT NULL, FK
  - `provider` - VARCHAR(50), NOT NULL
  - `provider_user_id` - VARCHAR(255), NOT NULL
  - `created_at`, `updated_at` - TIMESTAMP

**Indexes (1):**
- `(user_id)` - btree

#### 2.8 wallet_connections
**Purpose:** Web3 wallet connections
- **Primary Key:** `id` (UUID)
- **Foreign Keys:**
  - `user_id` → `users(id)` ON DELETE CASCADE
- **Columns (6):**
  - `id` - UUID, PK
  - `user_id` - UUID, NOT NULL, FK
  - `wallet_address` - VARCHAR(255), NOT NULL
  - `network` - VARCHAR(50), NOT NULL
  - `verified` - BOOLEAN, default false
  - `last_login_at` - TIMESTAMP
  - `created_at` - TIMESTAMP, default NOW()

**Indexes (1):**
- `(user_id)` - btree

#### 2.9 biometric_credentials
**Purpose:** Store biometric authentication data
- **Primary Key:** `id` (UUID)
- **Foreign Keys:**
  - `user_id` → `users(id)` ON DELETE CASCADE
- **Columns (5):**
  - `id` - UUID, PK
  - `user_id` - UUID, NOT NULL, FK
  - `device_id` - VARCHAR(255), NOT NULL
  - `public_key` - TEXT, NOT NULL
  - `credential_type` - VARCHAR(50), NOT NULL
  - `created_at` - TIMESTAMP, default NOW()

**Indexes (1):**
- `(user_id)` - btree

#### 2.10 trusted_devices
**Purpose:** Track trusted devices for fraud prevention
- **Primary Key:** `id` (UUID)
- **Foreign Keys:**
  - `user_id` → `users(id)` ON DELETE CASCADE
- **Columns (5):**
  - `id` - UUID, PK
  - `user_id` - UUID, NOT NULL, FK
  - `device_fingerprint` - VARCHAR(255), NOT NULL
  - `trust_score` - INTEGER, default 0
  - `last_seen` - TIMESTAMP, default NOW()
  - `created_at` - TIMESTAMP, default NOW()

**Indexes (1):**
- `(user_id)` - btree

### Triggers Created (3)

#### 3.1 trigger_generate_referral_code
**Table:** users
**Timing:** BEFORE INSERT
**Event:** For each row
**Function:** generate_user_referral_code()
**Purpose:** Auto-generate referral code on user creation

#### 3.2 trigger_increment_referral_count
**Table:** users  
**Timing:** AFTER UPDATE OF email_verified
**Event:** For each row
**Condition:** WHEN (NEW.email_verified = true AND OLD.email_verified = false)
**Function:** increment_referral_count()
**Purpose:** Increment referrer's count when referral verifies email

#### 3.3 trigger_update_users_timestamp
**Table:** users
**Timing:** BEFORE UPDATE
**Event:** For each row
**Function:** update_updated_at_column()
**Purpose:** Auto-update updated_at timestamp

---

## Remaining Services to Analyze (18/20)

1. **blockchain-indexer** - 001_baseline_blockchain_indexer.ts
2. **blockchain-service** - 001_baseline_blockchain_service.ts
3. **compliance-service** - 001_baseline_compliance.ts
4. **event-service** - 001_baseline_event.ts
5. **file-service** - 001_baseline_files.ts
6. **integration-service** - 001_baseline_integration.ts
7. **marketplace-service** - 001_baseline_marketplace.ts
8. **minting-service** - 001_baseline_minting.ts
9. **monitoring-service** - 001_baseline_monitoring_schema.ts
10. **notification-service** - 001_baseline_notification_schema.ts
11. **order-service** - 001_baseline_order.ts
12. **payment-service** - 001_baseline_payment.ts
13. **queue-service** - 001_baseline_queue.ts
