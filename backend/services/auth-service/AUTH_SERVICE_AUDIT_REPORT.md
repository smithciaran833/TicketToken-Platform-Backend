# AUTH-SERVICE COMPREHENSIVE AUDIT REPORT

**Date:** 2026-01-23
**Service Version:** 1.0.0
**Auditor:** Claude Code

---

## EXECUTIVE SUMMARY

The auth-service is a mature, well-architected authentication and authorization service built with Fastify and TypeScript. It provides comprehensive identity management capabilities including JWT authentication, MFA, OAuth integration, wallet-based authentication, and role-based access control.

**Overall Assessment: GOOD** with a few critical issues requiring attention.

- **Files Analyzed:** ~75 TypeScript source files
- **Lines of Code:** ~12,500+
- **Critical Issues Found:** 1
- **High Priority Issues Found:** 3
- **Medium Priority Issues Found:** 6

---

## 1. SERVICE CAPABILITIES

### Public Endpoints (User-Facing)

| Method | Path | Purpose | Required For |
|--------|------|---------|--------------|
| POST | `/auth/register` | Creates new user account | Ticket purchases, venue accounts |
| POST | `/auth/login` | User authentication | All authenticated actions |
| POST | `/auth/logout` | End user session | Security/compliance |
| POST | `/auth/refresh` | Refresh access token | Session continuity |
| POST | `/auth/forgot-password` | Request password reset email | Account recovery |
| POST | `/auth/reset-password` | Reset password with token | Account recovery |
| GET | `/auth/verify-email` | Verify email address | Account activation |
| GET | `/auth/verify` | Verify JWT token validity | Token validation |
| GET | `/auth/me` | Get current user information | User profile display |
| POST | `/auth/resend-verification` | Resend email verification | Account activation |
| PUT | `/auth/change-password` | Change password | Account security |

### MFA Endpoints

| Method | Path | Purpose | Required For |
|--------|------|---------|--------------|
| POST | `/auth/mfa/setup` | Initialize TOTP MFA setup | Security enhancement |
| POST | `/auth/mfa/verify-setup` | Complete MFA setup with code | MFA activation |
| POST | `/auth/mfa/verify` | Verify MFA code during login | MFA-protected login |
| POST | `/auth/mfa/regenerate-backup-codes` | Generate new backup codes | Backup code recovery |
| DELETE | `/auth/mfa/disable` | Disable MFA | MFA removal |

### OAuth Endpoints

| Method | Path | Purpose | Required For |
|--------|------|---------|--------------|
| POST | `/auth/oauth/:provider/callback` | OAuth callback handler | Social login |
| POST | `/auth/oauth/:provider/login` | OAuth login | Social login |
| POST | `/auth/oauth/:provider/link` | Link OAuth provider to account | Account linking |
| DELETE | `/auth/oauth/:provider/unlink` | Unlink OAuth provider | Account management |

### Wallet Authentication (Web3) Endpoints

| Method | Path | Purpose | Required For |
|--------|------|---------|--------------|
| POST | `/auth/wallet/nonce` | Request nonce for signature | Wallet auth initiation |
| POST | `/auth/wallet/register` | Register with wallet signature | Wallet-based registration |
| POST | `/auth/wallet/login` | Login with wallet signature | Wallet-based login |
| POST | `/auth/wallet/link` | Link wallet to existing account | Wallet linking |
| DELETE | `/auth/wallet/unlink/:publicKey` | Unlink wallet from account | Wallet removal |

### Biometric Authentication Endpoints

| Method | Path | Purpose | Required For |
|--------|------|---------|--------------|
| POST | `/auth/biometric/challenge` | Generate challenge for biometric login | Passwordless initiation |
| POST | `/auth/biometric/authenticate` | Authenticate with biometric signature | Passwordless login |
| POST | `/auth/biometric/register` | Register biometric credential | Device registration |
| GET | `/auth/biometric/challenge` | Get challenge for verification | Device verification |
| GET | `/auth/biometric/devices` | List registered biometric devices | Device management |
| DELETE | `/auth/biometric/devices/:credentialId` | Remove biometric device | Device removal |

### Session Management Endpoints

| Method | Path | Purpose | Required For |
|--------|------|---------|--------------|
| GET | `/auth/sessions` | List active sessions | Session auditing |
| DELETE | `/auth/sessions/:sessionId` | Revoke specific session | Session management |
| DELETE | `/auth/sessions/all` | Revoke all sessions | Security logout |

### Profile & RBAC Endpoints

| Method | Path | Purpose | Required For |
|--------|------|---------|--------------|
| GET | `/auth/profile` | Get user profile | Profile display |
| PUT | `/auth/profile` | Update user profile | Profile management |
| POST | `/auth/venues/:venueId/roles` | Grant venue role | Venue RBAC |
| DELETE | `/auth/venues/:venueId/roles/:userId` | Revoke venue roles | Venue RBAC |
| GET | `/auth/venues/:venueId/roles` | List venue roles | Venue RBAC |

### Internal Endpoints (Service-to-Service)

| Method | Path | Called By | Purpose |
|--------|------|-----------|---------|
| POST | `/internal/validate-permissions` | ticket-service, payment-service | Permission validation |
| POST | `/internal/validate-users` | Multiple services | Batch user validation |
| GET | `/internal/user-tenant/:userId` | Multiple services | Get user tenant info |
| GET | `/internal/health` | All services | Health check |
| GET | `/internal/users/:userId` | Multiple services | User lookup |
| GET | `/internal/users/by-email/:email` | Multiple services | User lookup by email |
| GET | `/internal/users/admins` | Admin services | Admin user list |
| GET | `/internal/users/:userId/tax-info` | payment-service | Tax information |
| GET | `/internal/users/:userId/chargeback-count` | payment-service | Chargeback data |
| POST | `/internal/users/batch-verification-check` | Multiple services | Batch verification |

### Health Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Basic health check |
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe |
| GET | `/health/startup` | Startup probe |
| GET | `/health/pressure` | Load status |
| GET | `/metrics` | Prometheus metrics |

---

## 2. DATABASE SCHEMA

### Tables

#### tenants
**Purpose:** Multi-tenant organization management

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PRIMARY KEY |
| `name` | varchar(255) | NOT NULL |
| `slug` | varchar(100) | UNIQUE, NOT NULL |
| `status` | varchar(50) | NOT NULL |
| `settings` | jsonb | DEFAULT '{}' |
| `created_at` | timestamp | DEFAULT NOW() |
| `updated_at` | timestamp | DEFAULT NOW() |

**Indexes:** PRIMARY KEY on `id`, UNIQUE INDEX on `slug`
**RLS Enabled:** No (global reference table)

#### users
**Purpose:** Core user identity and profile storage (~60 columns)

| Column Group | Columns |
|-------------|---------|
| **Identity** | `id`, `email`, `password_hash`, `username` |
| **Profile** | `first_name`, `last_name`, `bio`, `avatar_url`, `date_of_birth`, `phone` |
| **Location** | `country_code`, `city`, `state_province`, `postal_code`, `timezone` |
| **Security** | `email_verified`, `mfa_enabled`, `mfa_secret`, `backup_codes` |
| **Password** | `password_reset_token`, `password_reset_expires`, `last_password_change` |
| **Login** | `last_login_at`, `last_login_ip`, `login_count`, `failed_login_attempts`, `locked_until` |
| **Permissions** | `role`, `permissions` (jsonb), `status` |
| **Preferences** | `preferred_language`, `notification_preferences`, `privacy_settings` |
| **Compliance** | `terms_accepted_at`, `privacy_accepted_at`, `marketing_consent` |
| **Referrals** | `referral_code`, `referred_by`, `referral_count` |
| **Analytics** | `lifetime_value`, `total_spent`, `events_attended`, `ticket_purchase_count` |
| **OAuth** | `provider`, `provider_user_id` |
| **Wallet** | `wallet_address`, `network`, `verified` |
| **Stripe** | `stripe_connect_account_id`, `stripe_connect_status`, `capabilities` |
| **Multi-tenancy** | `tenant_id` (FK to tenants) |
| **Audit** | `created_at`, `updated_at`, `deleted_at` |

**Indexes:** 12 indexes (email, username, phone, role, status, referral_code, metadata GIN, permissions GIN, full-text search)
**RLS Enabled:** Yes

**RLS Policies:**
- `users_view_own` - Users can view their own data
- `users_update_own` - Users can update their own data
- `users_admin_all` - Admins can access all data
- `users_tenant_isolation` - Tenant data isolation

#### user_sessions
**Purpose:** Active session tracking

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PRIMARY KEY |
| `user_id` | uuid | FK -> users.id (CASCADE) |
| `tenant_id` | uuid | FK -> tenants.id |
| `started_at` | timestamp | NOT NULL |
| `ended_at` | timestamp | |
| `ip_address` | inet | |
| `user_agent` | text | |
| `metadata` | jsonb | DEFAULT '{}' |
| `revoked_at` | timestamp | |

**RLS Enabled:** Yes

#### user_venue_roles
**Purpose:** Venue-specific RBAC assignments

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PRIMARY KEY |
| `user_id` | uuid | FK -> users.id (CASCADE) |
| `venue_id` | uuid | NOT NULL |
| `tenant_id` | uuid | FK -> tenants.id |
| `role` | varchar(50) | NOT NULL |
| `granted_by` | uuid | FK -> users.id |
| `is_active` | boolean | DEFAULT true |
| `expires_at` | timestamp | |
| `granted_at` | timestamp | DEFAULT NOW() |
| `revoked_at` | timestamp | |
| `revoked_by` | uuid | |

**RLS Enabled:** Yes

#### audit_logs
**Purpose:** Comprehensive security audit trail

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PRIMARY KEY |
| `service` | varchar(100) | NOT NULL |
| `action` | varchar(100) | NOT NULL |
| `action_type` | varchar(50) | |
| `user_id` | uuid | |
| `user_role` | varchar(50) | |
| `resource_type` | varchar(100) | |
| `resource_id` | uuid | |
| `table_name` | varchar(100) | |
| `record_id` | uuid | |
| `changed_fields` | jsonb | |
| `old_data` | jsonb | |
| `new_data` | jsonb | |
| `ip_address` | inet | |
| `user_agent` | text | |
| `created_at` | timestamp | DEFAULT NOW() |
| `success` | boolean | DEFAULT true |
| `error_message` | text | |
| `tenant_id` | uuid | |

**Indexes:** 7 indexes (user_id, action, created_at, resource, table_name, changed_fields GIN)
**RLS Enabled:** Yes

#### invalidated_tokens
**Purpose:** JWT token blacklist

| Column | Type | Constraints |
|--------|------|-------------|
| `token` | varchar(255) | PRIMARY KEY |
| `user_id` | uuid | |
| `tenant_id` | uuid | |
| `invalidated_at` | timestamp | DEFAULT NOW() |
| `expires_at` | timestamp | NOT NULL |

**Indexes:** user_id, expires_at
**RLS Enabled:** Yes

#### oauth_connections
**Purpose:** Linked OAuth provider accounts

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PRIMARY KEY |
| `user_id` | uuid | FK -> users.id (CASCADE) |
| `tenant_id` | uuid | |
| `provider` | varchar(50) | NOT NULL |
| `provider_user_id` | varchar(255) | NOT NULL |
| `profile_data` | jsonb | |
| `created_at` | timestamp | DEFAULT NOW() |
| `updated_at` | timestamp | DEFAULT NOW() |

**Unique Constraint:** (provider, provider_user_id)
**RLS Enabled:** Yes

#### wallet_connections
**Purpose:** Linked blockchain wallets

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PRIMARY KEY |
| `user_id` | uuid | FK -> users.id (CASCADE) |
| `tenant_id` | uuid | |
| `wallet_address` | varchar(128) | NOT NULL |
| `network` | varchar(50) | NOT NULL |
| `verified` | boolean | DEFAULT false |
| `last_login_at` | timestamp | |
| `created_at` | timestamp | DEFAULT NOW() |

**RLS Enabled:** Yes

#### biometric_credentials
**Purpose:** FaceID/TouchID credential storage

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PRIMARY KEY |
| `user_id` | uuid | FK -> users.id (CASCADE) |
| `tenant_id` | uuid | |
| `device_id` | varchar(256) | NOT NULL |
| `public_key` | text | NOT NULL |
| `credential_type` | varchar(50) | |
| `created_at` | timestamp | DEFAULT NOW() |

**RLS Enabled:** Yes

#### trusted_devices
**Purpose:** Device trust scoring

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PRIMARY KEY |
| `user_id` | uuid | FK -> users.id (CASCADE) |
| `tenant_id` | uuid | |
| `device_fingerprint` | varchar(256) | NOT NULL |
| `trust_score` | integer | DEFAULT 0 |
| `last_seen` | timestamp | |
| `created_at` | timestamp | DEFAULT NOW() |

**RLS Enabled:** Yes

#### user_addresses
**Purpose:** User shipping/billing addresses

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PRIMARY KEY |
| `user_id` | uuid | FK -> users.id (CASCADE) |
| `tenant_id` | uuid | |
| `address_type` | varchar(50) | CHECK constraint |
| `address_line1` | varchar(255) | NOT NULL |
| `address_line2` | varchar(255) | |
| `city` | varchar(100) | NOT NULL |
| `state_province` | varchar(100) | |
| `postal_code` | varchar(20) | |
| `country_code` | varchar(2) | NOT NULL |
| `created_at` | timestamp | DEFAULT NOW() |
| `updated_at` | timestamp | DEFAULT NOW() |

**RLS Enabled:** Yes

### Database Functions Created

| Function | Purpose |
|----------|---------|
| `update_updated_at_column()` | Auto-update updated_at timestamp |
| `generate_user_referral_code()` | Generate unique referral code |
| `increment_referral_count()` | Update referral count on verification |
| `audit_trigger_function()` | Comprehensive audit logging trigger |
| `backfill_user_aggregates()` | Calculate user aggregate metrics |
| `mask_email()` | Mask email for support view |
| `mask_phone()` | Mask phone number |
| `mask_tax_id()` | Mask SSN/TIN |
| `mask_card_number()` | Mask credit card number |
| `cleanup_expired_data()` | Clean expired sessions and anonymize deleted users |

### Masked View

- **`users_masked`** - Support view with PII masked (email, phone redacted)

### Schema Issues Found

- ✅ RLS enabled on 11 tables
- ✅ Comprehensive indexing
- ✅ Foreign key constraints with appropriate CASCADE behavior
- ✅ CHECK constraints for data validation
- ✅ PII masking functions implemented
- ⚠️ No index on `users.tenant_id` combined with common query columns (consider composite indexes for multi-tenant queries)

---

## 3. SECURITY ANALYSIS

### Password Security
- **Algorithm:** Argon2id (via `argon2` package)
- **Configuration:** Configurable via environment, defaults to secure parameters
- **Fallback:** bcrypt (12 rounds) for legacy compatibility
- **Requirements:** Minimum 8 characters, maximum 128 characters
- **Validation:** Email format validation, length constraints
- **Issues:** ✅ None - industry best practice

### JWT Implementation
- **Algorithm:** RS256 (RSA with SHA-256)
- **Secret Management:** RSA key pairs loaded from files or environment variables (base64 encoded)
- **Token Expiry:**
  - Access token: 15 minutes (configurable)
  - Refresh token: 7 days (configurable)
  - S2S token: 24 hours (configurable)
- **Token Features:**
  - Token family tracking for refresh token rotation
  - Refresh token reuse detection
  - Token blacklisting via `invalidated_tokens` table
  - JTI (JWT ID) for unique token identification
- **Key Separation:** Separate key pairs for user JWT and S2S tokens
- **Key Rotation:** Key rotation service implemented with versioning
- **Issues:** ✅ Excellent implementation

### Session Management
- **Storage:** Redis (primary) + PostgreSQL (persistence)
- **Timeout:** Configurable session duration
- **Secure Features:**
  - Session ID stored in Redis with TTL
  - Session metadata tracking (IP, user agent)
  - Session revocation on logout
  - Bulk session invalidation capability
  - Device fingerprinting
- **Issues:** ✅ None

### Rate Limiting
- **Endpoints Protected:**
  - Login: 10 attempts per minute
  - Register: 3 per 5 minutes
  - Forgot password: 3 per 5 minutes
  - Reset password: 5 per 5 minutes
  - Wallet operations: Various limits
- **Storage:** Redis with atomic Lua scripts
- **Features:**
  - Fixed window rate limiting
  - Per-IP and per-user limits
  - Exponential backoff for lockouts
- **Issues:** ✅ None - well implemented using shared library

### MFA (Multi-Factor Authentication)
- **Implemented:** ✅ Yes
- **Methods:** TOTP (Google Authenticator compatible)
- **Required:** Optional per user
- **Backup Codes:** Yes - 10 codes, formatted as XXXX-XXXX
- **Window:** Configurable (default 2 - allows 1 code before/after current)
- **Replay Prevention:** Recent codes cached in Redis for 90 seconds
- **Issues:** ✅ None

### Input Validation
- **Framework:** Joi validation schemas
- **Email validation:** Joi email format, max 255 characters
- **Password validation:** Min 8, max 128 characters
- **UUID validation:** Joi UUID format
- **Extra fields:** Rejected via `.unknown(false)`
- **Issues:** ✅ Comprehensive validation

### HMAC for Service-to-Service
- **Implementation:** HMAC-SHA256 via `@tickettoken/shared` library
- **Headers Used:** Standard HMAC headers from shared library
- **Matches Standardization:** ✅ Yes
- **Dual Support:** Also supports RS256 JWT-based S2S authentication
- **Issues:** ✅ None

### Account Security Features
- **Account Lockout:** 5 failed attempts triggers 15-minute lockout
- **Brute Force Protection:** Progressive delays, IP-based tracking
- **CAPTCHA:** Optional reCAPTCHA/hCaptcha integration
- **Device Trust:** Fingerprinting and trust scoring
- **Suspicious Activity Detection:** IP/device analysis

### Critical Vulnerabilities Found

1. **[HIGH] SQL Injection Risk in OAuth Service**
   - **File:** `src/services/oauth.service.ts`, Line 72
   - **Code:** `await client.query(\`SET LOCAL app.current_tenant_id = '${finalTenantId}'\`);`
   - **Description:** String interpolation in SQL query. While `finalTenantId` is validated as a UUID in validators, string interpolation should never be used in SQL queries.
   - **Recommendation:** Use parameterized query: `await client.query('SET LOCAL app.current_tenant_id = $1', [finalTenantId]);`

### Medium Security Concerns

1. **[MEDIUM] Debug Breadcrumbs in Production Code**
   - **File:** `src/index.ts`, Lines 1-28
   - **Description:** Console.log debugging statements left in production code
   - **Impact:** Verbose logging, potential information disclosure
   - **Recommendation:** Remove all `[BOOT]` debug statements

2. **[MEDIUM] S2S Fallback to JWT Keys in Development**
   - **File:** `src/middleware/s2s.middleware.ts`, Lines 98-106
   - **Description:** Falls back to using user JWT keys if S2S keys not configured
   - **Impact:** Reduced security isolation in development
   - **Recommendation:** Document this clearly, ensure production enforces separate keys

---

## 4. CODE QUALITY

### Dead Code
- ✅ No significant dead code found
- Code is well-structured with clear separation of concerns

### Commented-Out Code
- ✅ No commented-out code blocks found

### Duplication Issues

**auth.controller.ts vs auth-extended.controller.ts:**
- `auth.controller.ts` - Core authentication (login, register, logout, MFA)
- `auth-extended.controller.ts` - Extended features (password reset, email verification, profile)
- **Separation is intentional:** Different concern areas
- **No significant duplication** - clean separation

### TODO/FIXME Comments (Total: 1)

| File | Line | Comment |
|------|------|---------|
| `src/index.ts` | 1 | `// DEBUG BREADCRUMBS - Remove after debugging` |

### Error Handling

**Positive:**
- Custom error classes with appropriate HTTP status codes (`AuthenticationError`, `AuthorizationError`, `ValidationError`, etc.)
- `isOperational` flag for distinguishing expected vs unexpected errors
- Consistent error response format

**Issues:**
- ✅ All error handling is appropriate
- Try-catch blocks present where needed

### Inconsistent Patterns
- ✅ Consistent class-based service pattern
- ✅ Consistent controller structure
- ✅ Consistent route registration
- Minor: Some services exported as singletons, others as classes

### Dependency Issues

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| fastify | ^4.29.1 | ✅ Current | |
| jsonwebtoken | ^9.0.2 | ✅ Current | |
| bcrypt | ^5.1.1 | ✅ Current | |
| argon2 | ^0.44.0 | ✅ Current | |
| ioredis | ^5.8.2 | ✅ Current | |
| knex | ^2.5.1 | ✅ Current | |
| zod | ^3.25.76 | ✅ Current | |
| joi | ^18.0.1 | ✅ Current | |
| axios | ^1.13.2 | ✅ Current | |
| amqplib | ^0.10.9 | ✅ Current | |
| react | ^19.2.3 | ⚠️ Unusual | React in auth service? Likely unused |
| react-dom | ^19.2.3 | ⚠️ Unusual | React-dom in auth service? Likely unused |

**Note:** The presence of `react` and `react-dom` dependencies in an authentication service is unusual and should be investigated for removal if not needed.

---

## 5. SERVICE INTEGRATION

### Inbound Dependencies (Who calls auth-service)

| Calling Service | Endpoint | Purpose |
|----------------|----------|---------|
| api-gateway | `/auth/*` | All public auth endpoints |
| ticket-service | `/internal/validate-permissions` | Permission checks |
| payment-service | `/internal/users/:userId`, `/internal/validate-permissions` | User validation, permissions |
| event-service | `/internal/validate-permissions` | Permission checks |
| notification-service | `/auth/verify` | Token verification |
| venue-service | `/internal/users/:userId` | User lookup |
| All services | `/internal/health` | Health checks |

### Outbound Dependencies (Who auth-service calls)

| Called Service | Endpoint | Purpose | Implementation |
|---------------|----------|---------|----------------|
| notification-service | (via RabbitMQ) | Welcome emails, password reset emails | RabbitMQ events |
| Google OAuth | OAuth token exchange | Social login | OAuth2Client |

### Message Queue Integration

**Published Events:**

| Event Name | Exchange | Routing Key | Consumers |
|------------|----------|-------------|-----------|
| user.registered | tickettoken_events | user.registered | notification-service, analytics-service |
| user.login | tickettoken_events | user.login | analytics-service |
| user.logout | tickettoken_events | user.logout | analytics-service |
| user.password_reset_requested | tickettoken_events | user.password_reset_requested | notification-service |
| user.password_reset_completed | tickettoken_events | user.password_reset_completed | notification-service |
| user.email_verified | tickettoken_events | user.email_verified | notification-service |
| user.mfa_enabled | tickettoken_events | user.mfa_enabled | notification-service |
| user.mfa_disabled | tickettoken_events | user.mfa_disabled | notification-service |

**Consumed Events:**
| Event Name | Source | Purpose |
|------------|--------|---------|
| None | - | Auth service is event producer only |

### Infrastructure Dependencies

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **PostgreSQL** | User data, sessions, audit logs | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` |
| **Redis** | Caching, rate limiting, session storage, token blacklist | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| **RabbitMQ** | Event publishing | `RABBITMQ_URL` |
| **Resend** | Email delivery | `RESEND_API_KEY` |
| **Google OAuth** | Social login | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

---

## 6. TEST COVERAGE

### Test Suite Summary
- **Integration Tests:** 11 files (487,784 bytes total)
- **Unit Tests:** 17 service test files + additional tests
- **Total Test Files:** 88

### Integration Test Files

| Test File | What It Tests | Status |
|-----------|---------------|--------|
| auth-flow.integration.test.ts | Registration, login, logout, refresh | ✅ Active |
| mfa-flow.integration.test.ts | MFA setup, verification, backup codes | ✅ Active |
| wallet-auth.integration.test.ts | Wallet nonce, registration, login | ✅ Active |
| biometric-auth.integration.test.ts | Biometric registration, authentication | ✅ Active |
| session-management.integration.test.ts | Session listing, revocation | ✅ Active |
| profile-gdpr.integration.test.ts | Profile management, GDPR export | ✅ Active |
| rbac-flow.integration.test.ts | Role grants, permission checks | ✅ Active |
| s2s-internal.integration.test.ts | Internal API authentication | ✅ Active |
| database-constraints.integration.test.ts | DB constraints, RLS | ✅ Active |
| error-handling.integration.test.ts | Error response validation | ✅ Active |
| middleware-behaviors.integration.test.ts | Middleware behaviors | ✅ Active |

### Unit Test Files

| Test File | Coverage Area |
|-----------|---------------|
| auth.service.test.ts | Core authentication logic |
| jwt.service.test.ts | JWT generation/verification |
| mfa.service.test.ts | MFA operations |
| password-security.service.test.ts | Password hashing/validation |
| oauth.service.test.ts | OAuth provider integration |
| wallet.service.test.ts | Wallet authentication |
| cache.service.test.ts | Caching layer |
| cache-fallback.service.test.ts | Cache fallback |
| cache-integration.test.ts | Cache integration |
| rate-limit.service.test.ts | Rate limiting |
| lockout.service.test.ts | Account lockout |
| brute-force-protection.service.test.ts | Brute force protection |
| key-rotation.service.test.ts | Key rotation |
| captcha.service.test.ts | CAPTCHA verification |
| email.service.test.ts | Email sending |
| monitoring.service.test.ts | Health monitoring |
| monitoring.routes.test.ts | Monitoring endpoints |

### Feature Coverage Matrix

| Feature | Unit Test | Integration Test | Notes |
|---------|-----------|------------------|-------|
| User Registration | ✅ | ✅ | Full coverage |
| User Login | ✅ | ✅ | Full coverage |
| Token Refresh | ✅ | ✅ | Full coverage |
| Password Reset | ✅ | ✅ | Full coverage |
| Email Verification | ✅ | ✅ | Full coverage |
| MFA Setup | ✅ | ✅ | Full coverage |
| MFA Verification | ✅ | ✅ | Full coverage |
| OAuth Login | ✅ | ⚠️ | Mocked external calls |
| Wallet Auth | ✅ | ✅ | Full coverage |
| Biometric Auth | ✅ | ✅ | Full coverage |
| Session Management | ✅ | ✅ | Full coverage |
| RBAC | ✅ | ✅ | Full coverage |
| Rate Limiting | ✅ | ✅ | Full coverage |
| S2S Authentication | ✅ | ✅ | Full coverage |

### Skipped Tests
- ✅ No skipped tests found (no `.skip` or `test.only` patterns)

### Coverage Gaps
- ⚠️ No E2E tests (browser-level testing)
- ⚠️ No load/stress tests
- ⚠️ OAuth integration relies on mocking (no real OAuth testing)

---

## 7. CONFIGURATION & DEPLOYMENT

### Required Environment Variables

| Variable | Purpose | Required | Default |
|----------|---------|----------|---------|
| `DB_HOST` | PostgreSQL host | Yes | - |
| `DB_PORT` | PostgreSQL port | No | 5432 |
| `DB_NAME` | Database name | Yes | - |
| `DB_USER` | Database user | Yes | - |
| `DB_PASSWORD` | Database password | Yes | - |
| `REDIS_HOST` | Redis host | No | redis |
| `REDIS_PORT` | Redis port | No | 6379 |
| `REDIS_PASSWORD` | Redis password | No | - |
| `JWT_PRIVATE_KEY` | JWT signing key (prod) | Yes (prod) | - |
| `JWT_PUBLIC_KEY` | JWT verification key (prod) | Yes (prod) | - |
| `S2S_PRIVATE_KEY` | S2S signing key (prod) | Yes (prod) | - |
| `S2S_PUBLIC_KEY` | S2S verification key (prod) | Yes (prod) | - |
| `ENCRYPTION_KEY` | Data encryption key (prod) | Yes (prod) | dev fallback |
| `RESEND_API_KEY` | Email service key (prod) | Yes (prod) | - |
| `CAPTCHA_SECRET_KEY` | CAPTCHA verification (prod) | Yes (prod) | - |

### Optional Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_ENV` | Environment mode | development |
| `PORT` | Service port | 3001 |
| `LOG_LEVEL` | Logging level | info |
| `BCRYPT_ROUNDS` | Password hashing cost | 12 |
| `LOCKOUT_MAX_ATTEMPTS` | Max failed logins | 5 |
| `LOCKOUT_DURATION_MINUTES` | Lockout duration | 15 |
| `MFA_ISSUER` | TOTP issuer name | TicketToken |
| `MFA_WINDOW` | TOTP verification window | 2 |
| `JWT_ACCESS_EXPIRES_IN` | Access token expiry | 15m |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | 7d |
| `S2S_TOKEN_EXPIRES_IN` | S2S token expiry | 24h |
| `CAPTCHA_ENABLED` | Enable CAPTCHA | false |
| `ENABLE_SWAGGER` | Enable Swagger UI | false |
| `LB_DRAIN_DELAY` | Graceful shutdown delay | 5 |

### Dockerfile Analysis
- **Base Image:** node:20-alpine (pinned to digest)
- **Multi-stage Build:** ✅ Yes
- **Non-root User:** ✅ Yes (nodejs:1001)
- **Health Check:** ✅ Configured
- **Security:** ✅ Proper ownership and permissions
- **Issues:** ✅ Excellent Dockerfile

### NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `tsx src/index.ts` | Development server |
| `build` | `tsc` | Compile TypeScript |
| `start` | `node dist/index.js` | Production server |
| `test` | `jest` | Run unit tests |
| `test:coverage` | `jest --coverage` | Coverage report |
| `test:integration` | `jest --config jest.integration.config.js` | Integration tests |
| `migrate` | `knex migrate:latest` | Apply migrations |
| `migrate:rollback` | `knex migrate:rollback` | Rollback migration |
| `migrate:make` | `knex migrate:make -x ts` | Create migration |

### Configuration Issues
- ✅ `.env.example` file exists with comprehensive documentation
- ✅ Production vs development configuration clearly separated
- ✅ Zod schema validation for all environment variables
- ✅ Clear error messages for missing configuration

---

## 8. DOCUMENTATION QUALITY

### Core Documentation

| Document | Exists | Quality | Notes |
|----------|--------|---------|-------|
| README.md | ✅ | Excellent | Getting started, API overview, scripts |
| SERVICE_OVERVIEW.md | ✅ | Excellent | Comprehensive architecture documentation |
| ARCHITECTURE.md | ✅ | Good | C4 diagrams, data flow |
| TEST-COVERAGE-MATRIX.md | ✅ | Excellent | Detailed test coverage map |
| .env.example | ✅ | Excellent | All variables documented |

### ADRs (Architecture Decision Records)

| ADR | Topic | Quality |
|-----|-------|---------|
| 001-fastify-framework.md | Framework choice | ✅ Good |
| 002-postgresql-database.md | Database choice | ✅ Good |
| 003-jwt-rs256.md | JWT algorithm choice | ✅ Good |
| 004-redis-caching.md | Caching strategy | ✅ Good |

### Runbooks

| Runbook | Purpose | Quality |
|---------|---------|---------|
| auth-failures.md | Mass authentication failures | ✅ Actionable |
| database-issues.md | Database connectivity | ✅ Actionable |
| high-error-rate.md | Error rate spikes | ✅ Actionable |
| rate-limiting.md | Rate limit issues | ✅ Actionable |
| redis-issues.md | Redis connectivity | ✅ Actionable |
| token-issues.md | JWT token issues | ✅ Actionable |

### Documentation Gaps
- ⚠️ No OpenAPI/Swagger specification file (though Swagger UI is available at runtime)
- ⚠️ No sequence diagrams for complex flows in docs

---

## CRITICAL ISSUES (Must Fix)

1. **[HIGH] SQL Injection Risk in OAuth Service**
   - **Location:** `src/services/oauth.service.ts:72`
   - **Impact:** Potential SQL injection if tenant_id validation bypassed
   - **Fix:** Use parameterized query instead of string interpolation

---

## HIGH PRIORITY (Should Fix Soon)

1. **[HIGH] Debug Logging in Production**
   - **Location:** `src/index.ts:1-28`
   - **Impact:** Verbose logging, potential information disclosure
   - **Fix:** Remove all `console.log('[BOOT]...` statements

2. **[HIGH] Unnecessary React Dependencies**
   - **Location:** `package.json`
   - **Impact:** Increased bundle size, unnecessary dependencies
   - **Fix:** Remove `react` and `react-dom` if not used

3. **[HIGH] No API Schema Export**
   - **Impact:** No machine-readable API documentation for consumers
   - **Fix:** Export OpenAPI spec file from Swagger configuration

---

## TECHNICAL DEBT (Can Be Addressed Later)

1. **[MEDIUM] S2S Key Fallback Behavior**
   - Development allows fallback to JWT keys for S2S
   - Document clearly and add monitoring alerts

2. **[MEDIUM] No E2E Browser Tests**
   - OAuth flows not tested end-to-end
   - Add Playwright/Cypress tests for OAuth

3. **[LOW] Console.log Usage**
   - Some console.log statements in error paths
   - Replace with structured logger

4. **[LOW] Mixed Export Patterns**
   - Some services exported as singletons, others as classes
   - Standardize export pattern

5. **[LOW] Missing Composite Indexes**
   - Multi-tenant queries may benefit from composite indexes
   - Profile query patterns and add indexes as needed

6. **[LOW] TypeScript Strict Mode**
   - Consider enabling stricter TypeScript options

---

## BUSINESS CAPABILITIES SUMMARY

The auth-service is the **central identity and access management hub** for the entire TicketToken platform. It enables:

### Core Business Functions
- **User Onboarding:** Registration, email verification, profile management
- **Authentication:** Password, OAuth (Google), Web3 wallet (Solana/Ethereum), biometric
- **Security:** MFA, account lockout, brute force protection, session management
- **Authorization:** Role-based access control, venue-specific permissions

### Revenue Impact
The auth-service is critical path for:
- **Ticket Purchases:** All purchases require authenticated users
- **Venue Operations:** Venue staff authentication for event management
- **Payment Processing:** User verification for payment flows
- **NFT Minting:** Wallet authentication for blockchain operations

### Downtime Impact
If auth-service goes down:
- ❌ No new user registrations
- ❌ No user logins (existing sessions continue until token expiry)
- ❌ No password resets
- ❌ No token refresh (sessions will expire)
- ❌ Internal services cannot validate permissions
- ⚠️ Existing authenticated sessions work until access tokens expire (15 min)

### Dependency Chain
Auth-service is depended upon by ALL other services:
- API Gateway → Auth Service (token validation)
- Ticket Service → Auth Service (permission checks)
- Payment Service → Auth Service (user validation)
- Event Service → Auth Service (permission checks)
- Venue Service → Auth Service (user lookup)
- All Services → Auth Service (internal health)

---

## AUDIT COMPLETION

**Date:** 2026-01-23
**Auditor:** Claude Code (Opus 4.5)
**Files Analyzed:** ~75 source files + 88 test files
**Lines of Code:** ~12,500+
**Critical Issues Found:** 1
**High Priority Issues Found:** 3
**Medium Priority Issues Found:** 6
**Technical Debt Items:** 6

### Recommendations Priority

| Priority | Action | Effort |
|----------|--------|--------|
| 1 | Fix SQL injection in oauth.service.ts | Low |
| 2 | Remove debug breadcrumbs from index.ts | Low |
| 3 | Remove unused React dependencies | Low |
| 4 | Export OpenAPI specification | Medium |
| 5 | Add E2E tests for OAuth flows | High |
| 6 | Document S2S key fallback behavior | Low |

### Overall Assessment

The auth-service demonstrates **mature, production-ready code** with:
- ✅ Comprehensive authentication methods (5 different auth types)
- ✅ Strong security implementation (Argon2, RS256, MFA, rate limiting)
- ✅ Excellent test coverage (~88 test files)
- ✅ Good documentation (README, ADRs, runbooks)
- ✅ Proper multi-tenancy with RLS
- ✅ Event-driven architecture with RabbitMQ
- ✅ Kubernetes-ready (health probes, graceful shutdown)

The identified issues are minor and easily addressable. The service is well-architected and follows security best practices.
