# Database Phase 1 - Detailed Schema Reference

**Date:** November 19, 2025  
**Extraction Scope:** Priority core business services  
**Total Tables Extracted:** 88 tables across 6 services

---

## Executive Summary

This document provides detailed schema information for the 6 core business services that form the foundation of the TicketToken platform. These services handle user authentication, orders, payments, venues, events, and tickets - the essential transaction chain.

### Services Documented

| Service | Tables | Priority | Complexity |
|---------|--------|----------|------------|
| auth-service | 10 | ⭐⭐⭐ Critical | Medium |
| order-service | 6 | ⭐⭐⭐ Critical | Medium |
| **payment-service** | **41** | ⭐⭐⭐ Critical | **Very High** |
| venue-service | 9 | ⭐⭐ High | Medium |
| event-service | 7 | ⭐⭐ High | Medium |
| ticket-service | 15 | ⭐⭐⭐ Critical | High |
| **TOTAL** | **88** | | |

---

## 1. AUTH-SERVICE (10 Tables)

**Purpose:** User authentication, multi-tenancy, OAuth, Web3, MFA

### Tables

#### 1.1 `tenants`
Multi-tenancy foundation. Every user belongs to a tenant.

**Key Fields:**
- `id` (uuid, PK)
- `name` (varchar 200, not null)
- `slug` (varchar 200, unique, not null)
- `status` (varchar 20) - ACTIVE, SUSPENDED, CANCELLED
- `type` (varchar 50) - VENUE, ORGANIZER, PLATFORM
- `subscription_plan` (varchar 50)
- `subscription_status` (varchar 50)
- `max_users` (integer)
- `current_user_count` (integer)

**Features:**
- Soft deletes (`deleted_at`)
- Feature flags in JSONB
- Custom settings in JSONB
- Billing information

---

#### 1.2 `users`
Comprehensive user model with **66 columns**!

**Core Identity:**
- `id` (uuid v1, PK) - Sequential for time-based sorting
- `tenant_id` (uuid, not null, indexed)
- `email` (varchar 255, unique per tenant)
- `username` (varchar 50, unique per tenant)
- `phone` (varchar 20)
- `password_hash` (text) - bcrypt
- `password_salt` (text)

**Profile:**
- `first_name`, `last_name`, `display_name`
- `avatar_url`, `bio`, `date_of_birth`
- `gender`, `locale`, `timezone`

**Status & Verification:**
- `status` (varchar 20) - ACTIVE, SUSPENDED, BANNED, PENDING_VERIFICATION
- `email_verified` (boolean, default false)
- `phone_verified` (boolean, default false)
- `is_active` (boolean, default true)

**Security:**
- `two_factor_enabled` (boolean)
- `two_factor_secret` (text, encrypted)
- `mfa_enabled` (boolean)
- `mfa_methods` (text[]) - totp, sms, email
- `recovery_codes` (text[], encrypted)

**Login Tracking:**
- `last_login_at` (timestamptz)
- `last_login_ip` (inet)
- `login_count` (integer)
- `failed_login_attempts` (integer, default 0)
- `lockout_until` (timestamptz)
- `password_changed_at` (timestamptz)

**Web3:**
- `wallet_address` (varchar 255, unique, CS)
- `wallet_provider` (varchar 50) - metamask, phantom, walletconnect
- `ens_name` (varchar 255)
- `network` (varchar 20) - mainnet, testnet

**Social & Referrals:**
- `referral_code` (varchar 20, unique) - Auto-generated on insert
- `referred_by_code` (varchar 20)
- `referral_count` (integer, default 0) - Auto-incremented via trigger

**Compliance:**
- `kyc_status` (varchar 20) - PENDING, VERIFIED, REJECTED
- `kyc_verified_at` (timestamptz)
- `identity_documents` (jsonb)

**Preferences:**
- `preferences` (jsonb) - UI settings, notifications
- `metadata` (jsonb) - Custom fields

**Functions:** 3 custom functions
- `generate_referral_code()` - Random 8-char code
- `update_referral_count()` - Increment on new referrals  
- Standard `update_updated_at_column()`

---

#### 1.3 `user_sessions`
Active session tracking for multi-device support.

**Key Fields:**
- `id` (uuid, PK)
- `user_id` (uuid, not null, indexed)
- `token` (text, unique, not null) - JWT
- `refresh_token` (text, unique)
- `device_info` (jsonb) - Browser, OS, device
- `ip_address` (inet)
- `user_agent` (text)
- `expires_at` (timestamptz, not null)
- `refresh_expires_at` (timestamptz)
- `last_activity_at` (timestamptz)
- `is_active` (boolean, default true)

**Indexes:**
- Token lookup
- User + active sessions
- Expiry cleanup

---

#### 1.4 `user_venue_roles`
Granular role-based access per venue.

**Key Fields:**
- `id` (uuid, PK)
- `user_id` (uuid, not null)
- `venue_id` (uuid, not null)
- `role` (varchar 50, not null) - OWNER, MANAGER, STAFF, SCANNER
- `permissions` (text[]) - Granular permissions array
- `is_active` (boolean, default true)

**Unique Constraint:** `(user_id, venue_id)` - One role per user per venue

---

#### 1.5 `audit_logs`
Security audit trail for all critical actions.

**Key Fields:**
- `id` (uuid, PK)
- `user_id` (uuid, indexed)
- `action` (varchar 100, not null, indexed)
- `resource_type` (varchar 50)
- `resource_id` (uuid)
- `ip_address` (inet)
- `user_agent` (text)
- `metadata` (jsonb)
- `status` (varchar 20) - success, failure
- `error_message` (text)

**Retention:** Partitioned by `created_at` for compliance

---

#### 1.6 `invalidated_tokens`
JWT blocklist for logout/revocation.

**Key Fields:**
- `id` (uuid, PK)
- `token` (text, unique, not null)
- `user_id` (uuid, indexed)
- `reason` (varchar 100)
- `invalidated_at` (timestamptz, default now())
- `expires_at` (timestamptz, indexed) - Token's original expiry

**Cleanup:** Periodic job removes expired entries

---

#### 1.7 `oauth_connections`
Social login integration (Google, Facebook, etc.)

**Key Fields:**
- `id` (uuid, PK)
- `user_id` (uuid, not null)
- `provider` (varchar 50, not null) - google, facebook, twitter
- `provider_user_id` (varchar 255, not null)
- `access_token` (text, encrypted)
- `refresh_token` (text, encrypted)
- `scope` (text[])
- `profile_data` (jsonb)
- `expires_at` (timestamptz)

**Unique Constraint:** `(provider, provider_user_id)`

---

#### 1.8 `wallet_connections`
Web3 wallet authentication.

**Key Fields:**
- `id` (uuid, PK)
- `user_id` (uuid, not null)
- `wallet_address` (varchar 255, not null, CS, indexed)
- `wallet_type` (varchar 50) - metamask, phantom, walletconnect
- `network` (varchar 20) - mainnet, sepolia, devnet
- `signature` (text) - Verification signature
- `nonce` (varchar 64) - Challenge nonce
- `is_primary` (boolean, default false)
- `last_connected_at` (timestamptz)

**Unique Constraint:** `(user_id, wallet_address, network)`

---

#### 1.9 `biometric_credentials`
Face ID / Touch ID support for mobile apps.

**Key Fields:**
- `id` (uuid, PK)
- `user_id` (uuid, not null)
- `device_id` (varchar 255, not null)
- `credential_id` (text, not null)
- `public_key` (text, not null)
- `counter` (integer, default 0) - Replay attack prevention
- `biometric_type` (varchar 20) - fingerprint, face, iris
- `last_used_at` (timestamptz)

**Unique Constraint:** `(user_id, device_id)`

---

#### 1.10 `trusted_devices`
Device fingerprinting for anomaly detection.

**Key Fields:**
- `id` (uuid, PK)
- `user_id` (uuid, not null, indexed)
- `device_fingerprint` (varchar 255, unique, not null)
- `device_name` (varchar 100)
- `device_type` (varchar 50) - desktop, mobile, tablet
- `os` (varchar 50)
- `browser` (varchar 50)
- `ip_address` (inet)
- `trust_score` (integer, default 50) - 0-100
- `is_trusted` (boolean, default false)
- `first_seen_at` (timestamptz)
- `last_seen_at` (timestamptz)

---

## 2. ORDER-SERVICE (6 Tables)

**Purpose:** Purchase order management and lifecycle tracking

### Tables

#### 2.1 `orders`
Main order record with comprehensive tracking.

**Key Fields:**
- `id` (uuid, PK)
- `user_id` (uuid, not null, FK → users)
- `event_id` (uuid, not null, FK → events)
- `order_number` (varchar 20, unique, not null) - Format: ORD-12345678
- `status` (varchar 50, not null, default 'PENDING')

**Status Values:**
- PENDING, RESERVED, CONFIRMED, COMPLETED
- CANCELLED, EXPIRED, REFUNDED

**Pricing (in cents):**
- `subtotal_cents` (bigint, not null)
- `platform_fee_cents` (bigint, default 0)
- `processing_fee_cents` (bigint, default 0)
- `tax_cents` (bigint, default 0)
- `discount_cents` (bigint, default 0)
- `total_cents` (bigint, not null)
- `currency` (varchar 3, default 'USD')

**Payment:**
- `payment_intent_id` (varchar 255, indexed)
- `idempotency_key` (varchar 255, unique)

**Reservation Management:**
- `reservation_expires_at` (timestamptz) - 15-minute timer
- `confirmed_at` (timestamptz)
- `cancelled_at` (timestamptz)
- `refunded_at` (timestamptz)

**Constraints:**
- CHECK: `subtotal_cents >= 0`
- CHECK: `total_cents >= 0`

**Functions:**
- `calculate_order_total()` - Arithmetic helper
- `generate_order_number()` - Random 8-digit generator
- `validate_order_status_transition()` - State machine validation

**Partial Index:** Expiring reservations for cleanup job

---

#### 2.2 `order_items`
Line items with pricing snapshot.

**Key Fields:**
- `id` (uuid, PK)
- `order_id` (uuid, not null, FK → orders CASCADE)
- `ticket_type_id` (uuid, not null, FK → ticket_types)
- `quantity` (integer, not null) - CHECK > 0
- `unit_price_cents` (bigint, not null)
- `total_price_cents` (bigint, not null)

---

#### 2.3 `order_events`
Complete audit trail for status changes.

**Key Fields:**
- `id` (uuid, PK)
- `order_id` (uuid, not null, FK → orders CASCADE)
- `event_type` (varchar 50, not null)
- `user_id` (uuid, FK → users SET NULL)
- `metadata` (jsonb)
- `created_at` (timestamptz, default now(), indexed)

**Event Types:**
- CREATED, RESERVED, CONFIRMED
- CANCELLED, EXPIRED, REFUNDED, MODIFIED

---

#### 2.4 `order_addresses`
Billing/shipping addresses for compliance.

**Key Fields:**
- `id` (uuid, PK)
- `order_id` (uuid, not null, FK → orders CASCADE)
- `address_type` (varchar 20, not null) - BILLING, SHIPPING
- `first_name`, `last_name`, `email`, `phone`
- `line1`, `line2`, `city`, `state`, `postal_code`
- `country` (varchar 2, not null) - ISO 3166-1 alpha-2

---

#### 2.5 `order_discounts`
Promo codes and coupons applied.

**Key Fields:**
- `id` (uuid, PK)
- `order_id` (uuid, not null, FK → orders CASCADE)
- `code` (varchar 50, not null)
- `discount_type` (varchar 20, not null) - PERCENTAGE, FIXED_AMOUNT
- `discount_value` (numeric 10,2, not null)
- `discount_amount_cents` (bigint, not null)

---

#### 2.6 `order_refunds`
Refund tracking with reasons.

**Key Fields:**
- `id` (uuid, PK)
- `order_id` (uuid, not null, FK → orders CASCADE)
- `refund_amount_cents` (bigint, not null) - CHECK > 0
- `refund_reason` (varchar 255, not null)
- `refund_status` (varchar 50, default 'PENDING')
- `stripe_refund_id` (varchar 255)
- `initiated_by` (uuid, FK → users SET NULL)

**Status Values:** PENDING, PROCESSING, COMPLETED, FAILED

---

## 3. PAYMENT-SERVICE (41 Tables) 🚀

**Purpose:** Payment processing, fraud detection, royalties, escrow, tax compliance

**⚠️ LARGEST SERVICE** - Production-grade payment infrastructure

### Core Payment Tables

#### 3.1 `payment_transactions`
Main transactions table.

**Key Fields:**
- `id` (uuid, PK)
- `venue_id` (uuid, not null, indexed)
- `user_id` (uuid, not null, indexed)
- `event_id` (uuid, not null, indexed)
- `amount` (numeric 10,2, not null)
- `currency` (varchar 3, default 'USD')
- `status` (varchar 50, not null, indexed)

**Status Constraints:** pending, processing, completed, failed, refunded, partially_refunded

**Breakdown:**
- `platform_fee` (numeric 10,2, not null)
- `venue_payout` (numeric 10,2, not null)
- `gas_fee_paid` (numeric 10,4)
- `tax_amount` (numeric 10,2)
- `total_amount` (numeric 10,2)

**Payment Integration:**
- `stripe_payment_intent_id` (varchar 255, unique)
- `paypal_order_id` (varchar 255)

**Fraud Detection:**
- `device_fingerprint` (varchar 255, indexed)
- `payment_method_fingerprint` (varchar 255)

**Idempotency:**
- `idempotency_key` (uuid)
- UNIQUE INDEX: `(tenant_id, idempotency_key)`

---

#### 3.2 `venue_balances`
Real-time venue payouts tracking.

**Key Fields:**
- `id` (uuid, PK)
- `venue_id` (uuid, not null, indexed)
- `amount` (numeric 12,2, default 0)
- `balance_type` (varchar 50, not null) - available, pending, reserved
- `currency` (varchar 3, default 'USD')
- `last_payout_at` (timestamptz)

**Unique Constraint:** `(venue_id, balance_type)`

---

#### 3.3 `payment_refunds`
Refund tracking with Stripe integration.

**Key Fields:**
- `id` (uuid, PK)
- `transaction_id` (uuid, not null, FK → payment_transactions)
- `amount` (numeric 10,2, not null)
- `reason` (text)
- `status` (varchar 50, default 'pending', indexed)
- `stripe_refund_id` (varchar 255)
- `completed_at` (timestamptz)

---

#### 3.4 `payment_intents`
Payment intent lifecycle tracking.

**Key Fields:**
- `id` (uuid, PK)
- `order_id` (uuid, not null, indexed)
- `stripe_intent_id` (varchar 255, unique)
- `external_id` (varchar 255, unique, indexed)
- `client_secret` (varchar 500)
- `processor` (varchar 50) - stripe, paypal, square
- `amount` (numeric 10,2, not null)
- `status` (varchar 50, default 'pending', indexed)

**Event Sourcing:**
- `last_sequence_number` (bigint, default 0)
- `last_event_timestamp` (timestamptz)
- `version` (integer, default 1)

---

### Marketplace Tables

#### 3.5 `payment_escrows`
Marketplace transaction escrow.

**Key Fields:**
- `listing_id` (uuid, not null)
- `buyer_id` (uuid, not null, indexed)
- `seller_id` (uuid, not null, indexed)
- `amount` (numeric 10,2, not null)
- `seller_payout` (numeric 10,2, not null)
- `venue_royalty` (numeric 10,2, not null)
- `platform_fee` (numeric 10,2, not null)
- `status` (varchar 50, not null, indexed)

**Status:** created, funded, released, refunded, disputed

**Release Conditions:** JSONB array

---

### Royalty System (11 Tables)

#### 3.6 `venue_royalty_settings`
Per-venue royalty configuration.

**Key Fields:**
- `venue_id` (uuid, unique, not null)
- `default_royalty_percentage` (numeric 5,2, default 10.00)
- `minimum_payout_amount_cents` (integer, default 1000)
- `payout_schedule` (varchar 20, default 'weekly')
- `stripe_account_id` (varchar 255)
- `auto_payout_enabled` (boolean, default true)

**Constraint:** CHECK royalty 0-100%

---

#### 3.7 `event_royalty_settings`  
Event-specific overrides.

**Key Fields:**
- `event_id` (uuid, unique, not null)
- `venue_royalty_percentage` (numeric 5,2)
- `artist_royalty_percentage` (numeric 5,2, default 0)
- `artist_wallet_address` (varchar 255)
- `artist_stripe_account_id` (varchar 255)
- `override_venue_default` (boolean, default false)

---

#### 3.8 `royalty_distributions`
Individual royalty payments.

**Key Fields:**
- `transaction_id` (uuid, not null, indexed)
- `event_id` (uuid, not null, indexed)
- `transaction_type` (varchar 50, not null)
- `recipient_type` (varchar 50, not null) - venue, artist, platform
- `recipient_id` (uuid, not null, indexed)
- `recipient_wallet_address` (varchar 255)
- `amount_cents` (numeric 10,2, not null)
- `percentage` (numeric 5,2, not null)
- `status` (varchar 50, default 'pending', indexed)

**Status:** pending, scheduled, processing, paid, failed, disputed

**Blockchain:**
- `blockchain_tx_hash` (varchar 255)
- `stripe_transfer_id` (varchar 255)

---

#### 3.9 `royalty_payouts`
Batched payouts to recipients.

**Key Fields:**
- `recipient_id` (uuid, not null, indexed)
- `recipient_type` (varchar 50, not null)
- `amount_cents` (numeric 12,2, not null)
- `distribution_count` (integer, not null)
- `period_start`, `period_end` (date, not null)
- `status` (varchar 50, default 'pending', indexed)
- `stripe_payout_id` (varchar 255)
- `failure_reason` (varchar 500)
- `scheduled_at`, `completed_at` (timestamptz)

---

#### 3.10 `royalty_reconciliation_runs`
Automated reconciliation jobs.

**Key Fields:**
- `reconciliation_date` (date, not null, indexed)
- `period_start`, `period_end` (timestamptz, not null)
- `transactions_checked` (integer, default 0)
- `discrepancies_found` (integer, default 0)
- `discrepancies_resolved` (integer, default 0)
- `total_royalties_calculated` (numeric 12,2)
- `total_royalties_paid` (numeric 12,2)
- `variance_amount` (numeric 12,2)
- `status` (varchar 50, default 'running', indexed)
- `duration_ms` (integer)

---

#### 3.11 `royalty_discrepancies`
Identified issues requiring investigation.

**Key Fields:**
- `reconciliation_run_id` (uuid, FK)
- `transaction_id` (uuid, not null, indexed)
- `distribution_id` (uuid, FK)
- `discrepancy_type` (varchar 100, not null)
- `expected_amount`, `actual_amount`, `variance` (numeric 10,2)
- `status` (varchar 50, default 'identified', indexed)

**Types:** missing_distribution, incorrect_amount, duplicate_payment, missing_blockchain_tx, failed_payout, calculation_error

---

### Group Payment Tables

#### 3.12 `group_payments`
Collaborative ticket purchasing.

**Key Fields:**
- `organizer_id` (uuid, not null, indexed)
- `event_id` (uuid, not null, indexed)
- `total_amount` (numeric 10,2, not null)
- `ticket_selections` (jsonb, not null)
- `status` (varchar 50, not null, indexed)
- `expires_at` (timestamptz, not null)

**Status:** collecting, completed, partially_paid, expired, cancelled

---

#### 3.13 `group_payment_members`
Individual contributions.

**Key Fields:**
- `group_payment_id` (uuid, not null, FK)
- `user_id` (uuid)
- `email` (varchar 255, not null)
- `name` (varchar 255, not null)
- `amount_due` (numeric 10,2, not null)
- `ticket_count` (integer, not null)
- `paid` (boolean, default false)
- `reminders_sent` (integer, default 0)

---

### Tax & Compliance

#### 3.14 `tax_collections`
Tax breakdown per transaction.

**Key Fields:**
- `transaction_id` (uuid, not null, FK)
- `state_tax`, `local_tax`, `special_tax` (numeric 10,2)
- `total_tax` (numeric 10,2, not null)
- `jurisdiction` (varchar 255)
- `breakdown` (jsonb) - Detailed tax calculation

---

#### 3.15 `tax_forms_1099da`
Annual tax form generation.

**Key Fields:**
- `user_id` (uuid, not null)
- `tax_year` (integer, not null)
- `form_data` (jsonb, not null)
- `total_proceeds` (numeric 12,2, not null)
- `transaction_count` (integer, not null)
- `status` (varchar 50, default 'generated')

**Unique Constraint:** `(user_id, tax_year)`

---

### Fraud Detection System (10 Tables)

#### 3.16 `fraud_checks`
Real-time fraud scoring.

**Key Fields:**
- `user_id` (uuid, not null, indexed)
- `payment_id` (uuid, indexed)
- `device_fingerprint` (varchar 255, indexed)
- `ip_address` (inet)
- `score` (numeric 3,2) - 0.00-1.00
- `risk_score` (numeric 5,2)
- `signals` (jsonb) - Fraud indicators
- `reasons` (jsonb)
- `decision` (varchar 50, not null) - approve, review, challenge, decline
- `check_type` (varchar 100)

---

#### 3.17 `device_activity`
Device behavior tracking.

**Key Fields:**
- `device_fingerprint` (varchar 255, not null, indexed)
- `user_id` (uuid, not null, indexed)
- `activity_type` (varchar 100, not null)
- `metadata` (jsonb)

---

#### 3.18 `bot_detections`
Automated bot identification.

**Key Fields:**
- `user_id` (uuid)
- `session_id` (varchar 255)
- `is_bot` (boolean, not null)
- `confidence` (numeric 3,2, not null)
- `indicators` (text[])
- `user_agent` (text)

---

#### 3.19 `known_scalpers`
Blocklist management.

**Key Fields:**
- `user_id` (uuid)
- `device_fingerprint` (varchar 255)
- `reason` (text)
- `confidence_score` (numeric 3,2)
- `added_by` (varchar 255)
- `active` (boolean, default true)

---

#### 3.20 `ip_reputation`
IP-based fraud prevention.

**Primary Key:** `ip_address` (inet)

**Key Fields:**
- `risk_score` (integer, 0-100, default 0)
- `reputation_status` (varchar 20, default 'clean')
- `fraud_count`, `total_transactions` (integer)
- `is_proxy`, `is_vpn`, `is_tor`, `is_datacenter` (boolean)
- `country_code` (varchar 2)
- `asn` (varchar 50) - Autonomous System Number
- `geo_data` (jsonb)
- `blocked_at` (timestamptz)
- `blocked_reason` (varchar 500)

---

#### 3.21 `behavioral_analytics`
User behavior profiling.

**Key Fields:**
- `user_id`, `session_id` (uuid, indexed)
- `event_type` (varchar 100) - page_view, click, hover, scroll, form_interaction
- `page_url` (varchar 500)
- `event_data` (jsonb)
- `time_on_page_ms`, `mouse_movements`, `keystrokes` (integer)
- `copy_paste_detected`, `form_autofill_detected` (boolean)

---

#### 3.22 `velocity_limits`
Rate limiting per entity.

**Key Fields:**
- `entity_type` (varchar 50, not null) - user, ip, card, device
- `entity_id` (varchar 255, not null)
- `action_type` (varchar 50, not null) - purchase, login, api_call
- `limit_count`, `current_count` (integer, not null)
- `window_minutes` (integer, not null)
- `window_start`, `window_end` (timestamptz)

**Unique Constraint:** `(entity_type, entity_id, action_type)`

---

#### 3.23 `fraud_rules`
Configurable fraud detection rules.

**Key Fields:**
- `rule_name` (varchar 255, unique, not null)
- `description` (text)
- `rule_type` (varchar 50, not null) - velocity, pattern, threshold, ml_score
- `conditions` (jsonb, not null)
- `action` (varchar 50, not null) - block, flag, review, score_adjust
- `priority` (integer, default 100) - Lower = higher priority
- `is_active` (boolean, default true)
- `trigger_count`, `block_count` (integer, default 0)

---

#### 3.24 `fraud_review_queue`
Manual review system.

**Key Fields:**
- `user_id` (uuid, not null, indexed)
- `payment_id` (uuid, indexed)
- `fraud_check_id` (uuid, FK)
- `reason` (varchar 500, not null)
- `priority` (varchar 20, default 'medium') - low, medium, high, critical
- `status` (varchar 50, default 'pending')
- `assigned_to` (uuid)
- `reviewer_notes` (text)
- `decision` (varchar 50) - approve, decline, escalate, request_more_info

---

#### 3.25 `card_fingerprints`
Payment method tracking.

**Key Fields:**
- `card_fingerprint` (varchar 255, unique, not null, indexed)
- `bin` (varchar 6) - Bank Identification Number
- `last4` (varchar 4)
- `card_brand`, `issuing_bank`, `card_type` (varchar)
- `successful_purchases`, `failed_purchases` (integer, default 0)
- `chargeback_count`, `fraud_count` (integer, default 0)
- `total_amount_spent` (numeric 12,2, default 0)
- `risk_level` (varchar 20, default 'unknown')

---

#### 3.26 `ml_fraud_models`
Machine learning model registry.

**Key Fields:**
- `model_name` (varchar 255, unique, not null)
- `model_version` (varchar 50, not null)
- `model_type` (varchar 50, not null) - random_forest, neural_network, gradient_boosting
- `features` (jsonb, not null)
- `hyperparameters` (jsonb)
- `accuracy
