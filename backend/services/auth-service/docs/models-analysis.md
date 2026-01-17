# Auth Service Models Analysis
## Purpose: Integration Testing Documentation
## Source: src/models/user.model.ts
## Generated: January 15, 2026

---

## INTERFACES DEFINED

### 1. `User` Interface

| Property | Type | Required/Optional | Description |
|----------|------|-------------------|-------------|
| `id` | string | Required | User UUID |
| `email` | string | Required | Email address |
| `password_hash` | string | Required | Hashed password |
| `first_name` | string | Required | First name |
| `last_name` | string | Required | Last name |
| `phone` | string | Optional | Phone number |
| `email_verified` | boolean | Required | Email verification status |
| `phone_verified` | boolean | Required | Phone verification status |
| `kyc_status` | enum literal | Required | `'pending' \| 'verified' \| 'rejected'` |
| `kyc_level` | number | Required | KYC verification level |
| `mfa_enabled` | boolean | Required | MFA status |
| `mfa_secret` | string | Optional | MFA secret key |
| `backup_codes` | string[] | Optional | MFA backup codes |
| `created_at` | Date | Required | Creation timestamp |
| `updated_at` | Date | Required | Last update timestamp |
| `last_login_at` | Date | Optional | Last login timestamp |
| `last_login_ip` | string | Optional | Last login IP address |
| `failed_login_attempts` | number | Required | Failed login counter |
| `locked_until` | Date | Optional | Account lock expiry |
| `password_reset_token` | string | Optional | Password reset token |
| `password_reset_expires` | Date | Optional | Password reset token expiry |
| `email_verification_token` | string | Optional | Email verification token |
| `email_verification_expires` | Date | Optional | Email verification token expiry |
| `deleted_at` | Date | Optional | Soft delete timestamp |
| `deleted_by` | string | Optional | Who deleted the user |
| `deletion_reason` | string | Optional | Reason for deletion |
| `version` | number | Required | **Optimistic locking version** |

---

### 2. `UserVenueRole` Interface

| Property | Type | Required/Optional | Description |
|----------|------|-------------------|-------------|
| `id` | string | Required | Role assignment UUID |
| `user_id` | string | Required | FK → users |
| `venue_id` | string | Required | FK → venues |
| `role` | enum literal | Required | `'venue-owner' \| 'venue-manager' \| 'box-office' \| 'door-staff'` |
| `granted_by` | string | Required | Who granted the role (user_id) |
| `granted_at` | Date | Required | When role was granted |
| `expires_at` | Date | Optional | Role expiration |
| `is_active` | boolean | Required | Active status |

---

### 3. `UserSession` Interface

| Property | Type | Required/Optional | Description |
|----------|------|-------------------|-------------|
| `id` | string | Required | Session UUID |
| `user_id` | string | Required | FK → users |
| `session_token` | string | Required | Session token value |
| `ip_address` | string | Required | Client IP |
| `user_agent` | string | Required | Client user agent |
| `created_at` | Date | Required | Session start |
| `expires_at` | Date | Required | Session expiry |
| `revoked_at` | Date | Optional | Session revocation time |

---

### 4. `LoginAttempt` Interface

| Property | Type | Required/Optional | Description |
|----------|------|-------------------|-------------|
| `id` | string | Required | Attempt UUID |
| `email` | string | Required | Attempted email |
| `ip_address` | string | Required | Client IP |
| `success` | boolean | Required | Was login successful |
| `attempted_at` | Date | Required | Attempt timestamp |
| `failure_reason` | string | Optional | Reason if failed |

---

## ENUMS (Inline Union Types)

| Interface | Property | Enum Values |
|-----------|----------|-------------|
| `User` | `kyc_status` | `'pending'`, `'verified'`, `'rejected'` |
| `UserVenueRole` | `role` | `'venue-owner'`, `'venue-manager'`, `'box-office'`, `'door-staff'` |

---

## COMPARISON WITH DATABASE SCHEMA (`migrations-analysis.md`)

### User Interface vs `users` Table

| Model Field | DB Column | Match | Notes |
|-------------|-----------|-------|-------|
| `id` | `id` | ✅ | |
| `email` | `email` | ✅ | |
| `password_hash` | `password_hash` | ✅ | |
| `first_name` | `first_name` | ✅ | |
| `last_name` | `last_name` | ✅ | |
| `phone` | `phone` | ✅ | |
| `email_verified` | `email_verified` | ✅ | |
| `phone_verified` | `phone_verified` | ✅ | |
| `kyc_status` | ❌ Not in DB | ⚠️ | Model has kyc fields, DB does not |
| `kyc_level` | ❌ Not in DB | ⚠️ | Model has kyc fields, DB does not |
| `mfa_enabled` | `mfa_enabled` | ✅ | |
| `mfa_secret` | `mfa_secret` | ✅ | |
| `backup_codes` | `backup_codes` | ✅ | |
| `created_at` | `created_at` | ✅ | |
| `updated_at` | `updated_at` | ✅ | |
| `last_login_at` | `last_login_at` | ✅ | |
| `last_login_ip` | `last_login_ip` | ✅ | DB uses INET type |
| `failed_login_attempts` | `failed_login_attempts` | ✅ | |
| `locked_until` | `locked_until` | ✅ | |
| `password_reset_token` | `password_reset_token` | ✅ | |
| `password_reset_expires` | `password_reset_expires` | ✅ | |
| `email_verification_token` | `email_verification_token` | ✅ | |
| `email_verification_expires` | `email_verification_expires` | ✅ | |
| `deleted_at` | `deleted_at` | ✅ | Soft delete |
| `deleted_by` | ❌ Not in DB | ⚠️ | Model-only field |
| `deletion_reason` | ❌ Not in DB | ⚠️ | Model-only field |
| `version` | ❌ Not in DB | ⚠️ | Optimistic locking (model only) |
| ❌ Not in model | `tenant_id` | ⚠️ | **Missing from model** |
| ❌ Not in model | `username` | ⚠️ | DB has, model doesn't |
| ❌ Not in model | `display_name` | ⚠️ | DB has, model doesn't |
| ❌ Not in model | `role` | ⚠️ | DB has, model doesn't |
| ❌ Not in model | `status` | ⚠️ | DB has (PENDING/ACTIVE/etc) |
| ❌ Not in model | `permissions` | ⚠️ | DB has JSONB, model doesn't |
| ❌ Not in model | `two_factor_enabled` | ⚠️ | DB has separately from mfa |
| ❌ Not in model | All Stripe Connect fields | ⚠️ | 8+ fields in DB |
| ❌ Not in model | Profile fields | ⚠️ | bio, avatar_url, cover_image_url, etc |
| ❌ Not in model | Referral fields | ⚠️ | referral_code, referred_by, referral_count |
| ❌ Not in model | Consent fields | ⚠️ | terms_accepted_at, marketing_consent, etc |

### UserVenueRole vs `user_venue_roles` Table

| Model Field | DB Column | Match | Notes |
|-------------|-----------|-------|-------|
| `id` | `id` | ✅ | |
| `user_id` | `user_id` | ✅ | |
| `venue_id` | `venue_id` | ✅ | |
| `role` | `role` | ⚠️ | Model enum differs from DB free-text |
| `granted_by` | `granted_by` | ✅ | |
| `granted_at` | `granted_at` | ✅ | |
| `expires_at` | `expires_at` | ✅ | |
| `is_active` | `is_active` | ✅ | |
| ❌ Not in model | `tenant_id` | ⚠️ | **Missing from model** |
| ❌ Not in model | `revoked_at` | ⚠️ | DB has, model doesn't |
| ❌ Not in model | `revoked_by` | ⚠️ | DB has, model doesn't |

### UserSession vs `user_sessions` Table

| Model Field | DB Column | Match | Notes |
|-------------|-----------|-------|-------|
| `id` | `id` | ✅ | |
| `user_id` | `user_id` | ✅ | |
| `session_token` | ❌ Not in DB | ⚠️ | Model has, DB doesn't |
| `ip_address` | `ip_address` | ✅ | |
| `user_agent` | `user_agent` | ✅ | |
| `created_at` | `started_at` | ⚠️ | **Field name difference** |
| `expires_at` | `ended_at` | ⚠️ | Different semantic (expiry vs end) |
| `revoked_at` | `revoked_at` | ✅ | |
| ❌ Not in model | `tenant_id` | ⚠️ | **Missing from model** |
| ❌ Not in model | `metadata` | ⚠️ | DB has JSONB |

### LoginAttempt - No Corresponding DB Table

The `LoginAttempt` interface does not have a corresponding table in the `001_auth_baseline.ts` migration. This data may be:
- Stored in Redis (rate limiting)
- Logged to audit_logs table
- Part of a separate security-logging migration

---

## DATA TRANSFORMATIONS

**None in this file.** The model file only contains interface definitions.

Transformations (DB row → object, field omissions like password_hash) are likely in:
- Service layer files
- Repository layer files
- Response schemas (`response.schemas.ts` - SafeUserSchema excludes password_hash)

---

## KEY OBSERVATIONS

1. **Model is Simpler Than DB**: The TypeScript model represents a subset of fields. The database schema is much richer with 70+ columns in the users table.

2. **Missing `tenant_id`**: All model interfaces are missing `tenant_id` despite the DB having it with RLS policies. This could cause issues with multi-tenancy.

3. **Optimistic Locking**: Model has `version` field for optimistic locking that's not in the DB schema.

4. **KYC Fields Mismatch**: Model has `kyc_status` and `kyc_level` but these aren't in the auth baseline migration (may be in a separate compliance migration or derived from `identity_verified` in DB).

5. **Role Enum Mismatch**: `UserVenueRole.role` has specific enum values in model but DB column is free-text VARCHAR(50).

6. **Session Naming**: `created_at` in model vs `started_at` in DB, `expires_at` vs `ended_at` - semantic differences.

7. **No LoginAttempt Table**: The `LoginAttempt` interface has no corresponding table, may be handled differently.
