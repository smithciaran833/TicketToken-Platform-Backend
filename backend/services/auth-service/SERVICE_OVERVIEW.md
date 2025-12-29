# Auth Service - Architecture Overview

## Service Information
- **Port**: 3001
- **Framework**: Fastify (Node.js/TypeScript)
- **Database**: PostgreSQL (via pg and Knex)
- **Cache**: Redis (ioredis)
- **Purpose**: User authentication, authorization, session management, and identity verification for the TicketToken platform

---

## 1. Routes (`src/routes/auth.routes.ts`)

### Public Routes (Rate Limited)

#### `/auth/register` - User Registration
- **POST** `/auth/register` — Register new user with email/password

#### `/auth/login` - User Login
- **POST** `/auth/login` — Login with email/password (brute force protected)

#### `/auth/forgot-password` - Password Reset
- **POST** `/auth/forgot-password` — Request password reset email
- **POST** `/auth/reset-password` — Reset password with token

#### `/auth/verify-email` - Email Verification
- **GET** `/auth/verify-email` — Verify email with token (query param)

#### `/auth/refresh` - Token Refresh
- **POST** `/auth/refresh` — Refresh access/refresh token pair

#### `/auth/oauth/:provider/callback` - OAuth Callbacks
- **POST** `/auth/oauth/:provider/callback` — OAuth callback handler (Google, Apple, GitHub)
- **POST** `/auth/oauth/:provider/login` — Legacy OAuth login endpoint

#### `/auth/wallet` - Wallet Authentication (Web3)
- **POST** `/auth/wallet/nonce` — Request nonce for signature
- **POST** `/auth/wallet/register` — Register with wallet signature
- **POST** `/auth/wallet/login` — Login with wallet signature

#### `/auth/biometric` - Passwordless Biometric Login
- **POST** `/auth/biometric/challenge` — Generate challenge for biometric login
- **POST** `/auth/biometric/authenticate` — Authenticate with biometric signature

### Authenticated Routes (Require JWT)

#### `/auth/verify` - Token Verification
- **GET** `/auth/verify` — Verify current JWT token

#### `/auth/me` - Current User
- **GET** `/auth/me` — Get current user information

#### `/auth/logout` - Logout
- **POST** `/auth/logout` — Logout and invalidate tokens

#### `/auth/resend-verification` - Resend Email
- **POST** `/auth/resend-verification` — Resend verification email

#### `/auth/change-password` - Password Change
- **PUT** `/auth/change-password` — Change password (requires current password)

#### `/auth/mfa` - Multi-Factor Authentication
- **POST** `/auth/mfa/setup` — Setup TOTP-based MFA
- **POST** `/auth/mfa/verify-setup` — Verify MFA setup with code
- **POST** `/auth/mfa/verify` — Verify MFA code during login
- **POST** `/auth/mfa/regenerate-backup-codes` — Generate new backup codes
- **DELETE** `/auth/mfa/disable` — Disable MFA

#### `/auth/wallet` - Wallet Management
- **POST** `/auth/wallet/link` — Link wallet to existing account
- **DELETE** `/auth/wallet/unlink/:publicKey` — Unlink wallet from account

#### `/auth/biometric` - Biometric Device Management
- **POST** `/auth/biometric/register` — Register biometric credential
- **GET** `/auth/biometric/challenge` — Get challenge for biometric verification
- **GET** `/auth/biometric/devices` — List registered biometric devices
- **DELETE** `/auth/biometric/devices/:credentialId` — Remove biometric device

#### `/auth/oauth/:provider` - OAuth Linking
- **POST** `/auth/oauth/:provider/link` — Link OAuth provider to account
- **DELETE** `/auth/oauth/:provider/unlink` — Unlink OAuth provider

#### `/auth/sessions` - Session Management
- **GET** `/auth/sessions` — List active sessions
- **DELETE** `/auth/sessions/:sessionId` — Revoke specific session
- **DELETE** `/auth/sessions/all` — Revoke all sessions

#### `/auth/profile` - Profile Management
- **GET** `/auth/profile` — Get user profile
- **PUT** `/auth/profile` — Update user profile

#### `/auth/venues/:venueId/roles` - RBAC Management
- **POST** `/auth/venues/:venueId/roles` — Grant venue role (requires `roles:manage`)
- **DELETE** `/auth/venues/:venueId/roles/:userId` — Revoke venue roles
- **GET** `/auth/venues/:venueId/roles` — List venue roles

### Health Endpoints
- **GET** `/health` — Basic service health check
- **GET** `/metrics` — Prometheus metrics endpoint

---

## 2. Services (`src/services/`)

### Core Authentication
- **`auth.service.ts`** — Core authentication logic
  - `register()` — User registration with email verification
  - `login()` — Login with timing attack prevention and account lockout
  - `refreshTokens()` — JWT token rotation with reuse detection
  - `logout()` — Token invalidation and session cleanup
  - `verifyEmail()` — Email verification token validation
  - `forgotPassword()` — Password reset request (constant-time)
  - `resetPassword()` — Password reset with token validation
  - `changePassword()` — Password change with current password verification
  - `getUserById()` — Fetch user by ID
  - `regenerateTokensAfterMFA()` — Post-MFA token generation

- **`auth-extended.service.ts`** — Extended authentication features
  - `requestPasswordReset()` — Password reset request with email
  - `resetPassword()` — Password reset with token and validation
  - `verifyEmail()` — Email verification
  - `resendVerificationEmail()` — Resend verification email
  - `changePassword()` — Password change with strength validation
  - `validatePasswordStrength()` — Password strength checker

- **`jwt.service.ts`** — JWT token management
  - `generateTokenPair()` — Generate access + refresh tokens
  - `verifyAccessToken()` — Verify and decode access token
  - `refreshTokens()` — Refresh token rotation with family tracking
  - `invalidateTokenFamily()` — Invalidate entire token family (security)
  - `revokeAllUserTokens()` — Revoke all user tokens
  - `decode()` — Decode JWT without verification
  - `verifyRefreshToken()` — Verify refresh token
  - `getPublicKey()` — Get JWT public key for verification

### Multi-Factor Authentication
- **`mfa.service.ts`** — TOTP-based MFA
  - `setupTOTP()` — Generate TOTP secret and QR code
  - `verifyAndEnableTOTP()` — Verify and activate MFA
  - `verifyTOTP()` — Verify TOTP code
  - `verifyBackupCode()` — Verify and consume backup code
  - `regenerateBackupCodes()` — Generate new backup codes
  - `requireMFAForOperation()` — Enforce MFA for sensitive operations
  - `markMFAVerified()` — Mark MFA as verified in session
  - `disableTOTP()` — Disable MFA with password verification

### OAuth Integration
- **`oauth.service.ts`** — OAuth provider integration
  - `authenticate()` — Authenticate with OAuth provider
  - `exchangeGoogleCode()` — Exchange Google OAuth code for profile
  - `exchangeGitHubCode()` — Exchange GitHub OAuth code for profile
  - `findOrCreateUser()` — Find or create user from OAuth profile
  - `linkProvider()` — Link OAuth provider to existing account
  - `unlinkProvider()` — Unlink OAuth provider
  - `handleOAuthLogin()` — Handle OAuth login flow
  - `linkOAuthProvider()` — Link OAuth provider to user

### Wallet Authentication (Web3)
- **`wallet.service.ts`** — Blockchain wallet authentication
  - `generateNonce()` — Generate nonce for wallet signature
  - `verifySolanaSignature()` — Verify Solana wallet signature
  - `verifyEthereumSignature()` — Verify Ethereum wallet signature
  - `registerWithWallet()` — Register user with wallet signature
  - `loginWithWallet()` — Login with wallet signature
  - `linkWallet()` — Link wallet to existing account
  - `unlinkWallet()` — Unlink wallet from account

### Biometric Authentication
- **`biometric.service.ts`** — Biometric credential management
  - `registerBiometric()` — Register biometric credential (FaceID/TouchID)
  - `verifyBiometric()` — Verify biometric signature
  - `generateChallenge()` — Generate challenge for biometric auth
  - `listBiometricDevices()` — List user's biometric devices
  - `removeBiometricDevice()` — Remove biometric credential
  - `getCredential()` — Get biometric credential details

### Security Services
- **`password-security.service.ts`** — Password management
  - `hashPassword()` — Hash password with argon2
  - `verifyPassword()` — Verify password against hash
  - `validatePassword()` — Validate password strength
  - `generateSecurePassword()` — Generate secure random password

- **`brute-force-protection.service.ts`** — Brute force protection
  - `recordFailedAttempt()` — Record failed login attempt
  - `clearFailedAttempts()` — Clear failed attempts on success
  - `isLocked()` — Check if account is locked
  - `getLockInfo()` — Get lockout information

- **`lockout.service.ts`** — Account lockout management
  - `recordFailedAttempt()` — Record failed attempt
  - `checkLockout()` — Check if account is locked
  - `clearFailedAttempts()` — Clear failed attempts

- **`device-trust.service.ts`** — Device fingerprinting and trust
  - `generateFingerprint()` — Generate device fingerprint
  - `calculateTrustScore()` — Calculate device trust score
  - `recordDeviceActivity()` — Record device activity
  - `requiresAdditionalVerification()` — Check if additional verification needed

- **`rate-limit.service.ts`** — Rate limiting
  - `consume()` — Consume rate limit quota for action

### Authorization
- **`rbac.service.ts`** — Role-Based Access Control
  - `getUserPermissions()` — Get user's permissions
  - `checkPermission()` — Check if user has permission
  - `requirePermission()` — Enforce permission requirement
  - `grantVenueRole()` — Grant venue-specific role
  - `revokeVenueRole()` — Revoke venue role
  - `getUserVenueRoles()` — Get user's venue roles

### Caching
- **`cache.service.ts`** — Redis caching layer
  - `get()` — Get cached value
  - `set()` — Set cached value with TTL
  - `checkLimit()` — Check rate limit

- **`cache-integration.ts`** — Cache integration helpers
  - `getSession()` — Get session from cache
  - `setSession()` — Store session in cache
  - `deleteSession()` — Delete session from cache
  - `deleteUserSessions()` — Delete all user sessions
  - `getUser()` — Get user from cache
  - `setUser()` — Store user in cache
  - `deleteUser()` — Delete user from cache
  - `getUserWithFetch()` — Get user with cache-aside pattern
  - `add()` — Add invalidated token
  - `check()` — Check if token is invalidated
  - `checkLimit()` — Check rate limit
  - `reset()` — Reset rate limit counter

### Communication
- **`email.service.ts`** — Email notifications
  - `sendVerificationEmail()` — Send email verification
  - `sendPasswordResetEmail()` — Send password reset email
  - `sendMFABackupCodesEmail()` — Send MFA backup codes
  - `sendEmail()` — Generic email sender

### Monitoring
- **`audit.service.ts`** — Audit logging
  - `log()` — Log audit event
  - `logLogin()` — Log login attempt
  - `logRegistration()` — Log user registration
  - `logPasswordChange()` — Log password change
  - `logMFAEnabled()` — Log MFA enablement
  - `logTokenRefresh()` — Log token refresh
  - `logRoleGrant()` — Log role grant

- **`monitoring.service.ts`** — Health monitoring
  - `performHealthCheck()` — Comprehensive health check
  - `checkDatabase()` — Check database connectivity
  - `checkRedis()` — Check Redis connectivity
  - `checkMemory()` — Check memory usage
  - `getMetrics()` — Get Prometheus metrics

---

## 3. Controllers (`src/controllers/`)

### AuthController
- `register()` — Handle user registration
- `login()` — Handle user login
- `refreshTokens()` — Handle token refresh
- `logout()` — Handle logout
- `verifyToken()` — Verify JWT token
- `getCurrentUser()` — Get current user info
- `setupMFA()` — Setup MFA
- `verifyMFASetup()` — Verify MFA setup
- `verifyMFA()` — Verify MFA code
- `regenerateBackupCodes()` — Regenerate backup codes
- `disableMFA()` — Disable MFA

### AuthExtendedController
- `forgotPassword()` — Handle password reset request
- `resetPassword()` — Handle password reset
- `verifyEmail()` — Handle email verification
- `resendVerification()` — Resend verification email
- `changePassword()` — Handle password change

### WalletController
- `requestNonce()` — Request wallet signature nonce
- `register()` — Register with wallet
- `login()` — Login with wallet
- `linkWallet()` — Link wallet to account
- `unlinkWallet()` — Unlink wallet

### SessionController
- `listSessions()` — List user sessions
- `revokeSession()` — Revoke specific session
- `invalidateAllSessions()` — Revoke all sessions

### ProfileController
- `getProfile()` — Get user profile
- `updateProfile()` — Update user profile

---

## 4. Middleware (`src/middleware/`)

- **`auth.middleware.ts`** — JWT authentication middleware
  - `authenticate()` — Verify JWT and attach user to request
  - `requirePermission()` — Check permission requirement
  - `requireVenueAccess()` — Check venue access

- **`tenant.middleware.ts`** — Multi-tenancy middleware
  - Tenant isolation and context setting

- **`validation.middleware.ts`** — Request validation
  - `validate()` — Validate request against Joi schema

---

## 5. Config (`src/config/`)

### External Services Configured

#### Database
- **PostgreSQL** — User data, sessions, audit logs
  - `host`, `port`, `database`, `user`, `password`

#### Cache
- **Redis** — Token storage, rate limiting, sessions
  - `host`, `port`, `password`

#### OAuth Providers
- **Google OAuth** — Google Sign-In
  - `clientId`, `clientSecret`, `redirectUri`
- **GitHub OAuth** — GitHub Sign-In
  - `clientId`, `clientSecret`, `redirectUri`
- **Apple Sign In** — Apple authentication
  - `clientId`, `teamId`, `keyId`, `privateKey`

#### Email
- **Resend** — Email delivery
  - `apiKey`, `fromEmail`

#### JWT
- **JWT Configuration**
  - `accessTokenSecret`, `refreshTokenSecret`
  - `accessTokenExpiry` (15 minutes)
  - `refreshTokenExpiry` (7 days)

#### Blockchain
- **Solana RPC** — Wallet signature verification
  - `rpcUrl`
- **Ethereum RPC** — Wallet signature verification
  - `rpcUrl`

### Config Files
- **`database.ts`** — PostgreSQL connection pool
- **`redis.ts`** — Redis client setup
- **`env.ts`** — Environment variable validation
- **`logger.ts`** — Winston logger configuration
- **`oauth.ts`** — OAuth provider configuration
- **`secrets.ts`** — Secret management
- **`swagger.ts`** — API documentation
- **`dependencies.ts`** — Dependency injection container (Awilix)

---

## 6. Migrations (`src/migrations/001_auth_baseline.ts`)

### Database Functions Created

#### Utility Functions
1. **`update_updated_at_column()`** — Auto-update updated_at timestamp
2. **`generate_user_referral_code()`** — Generate unique referral code
3. **`increment_referral_count()`** — Update referral count on verification
4. **`audit_trigger_function()`** — Comprehensive audit logging trigger
5. **`backfill_user_aggregates()`** — Calculate user aggregate metrics

#### PII Masking Functions
6. **`mask_email()`** — Mask email for support view
7. **`mask_phone()`** — Mask phone number
8. **`mask_tax_id()`** — Mask SSN/TIN
9. **`mask_card_number()`** — Mask credit card number

#### Data Retention
10. **`cleanup_expired_data()`** — Clean expired sessions and anonymize deleted users

### Tables Created (11 tables)

1. **`tenants`** — Multi-tenant organizations
   - id, name, slug, status, settings
   - Default tenant seeded: '00000000-0000-0000-0000-000000000001'

2. **`users`** — Core user table (60+ columns)
   - **Identity**: id, email, password_hash, username
   - **Profile**: first_name, last_name, bio, avatar_url, date_of_birth, phone
   - **Location**: country_code, city, state_province, postal_code, timezone
   - **Security**: email_verified, mfa_enabled, mfa_secret, backup_codes
   - **Password**: password_reset_token, password_reset_expires, last_password_change
   - **Login**: last_login_at, last_login_ip, login_count, failed_login_attempts, locked_until
   - **Permissions**: role, permissions (jsonb), status
   - **Preferences**: preferred_language, notification_preferences, privacy_settings
   - **Compliance**: terms_accepted_at, privacy_accepted_at, marketing_consent
   - **Referrals**: referral_code, referred_by, referral_count
   - **Analytics**: lifetime_value, total_spent, events_attended, ticket_purchase_count
   - **OAuth**: provider, provider_user_id
   - **Wallet**: wallet_address, network, verified
   - **Stripe Connect**: stripe_connect_account_id, stripe_connect_status, capabilities
   - **Audit**: created_at, updated_at, deleted_at
   - **Multi-tenancy**: tenant_id

3. **`user_sessions`** — Active user sessions
   - id, user_id, started_at, ended_at, ip_address, user_agent, revoked_at

4. **`user_venue_roles`** — Venue-specific RBAC
   - id, user_id, venue_id, role, granted_by, is_active, expires_at, granted_at, revoked_at, revoked_by

5. **`audit_logs`** — Comprehensive audit trail
   - id, service, action, action_type, user_id, user_role
   - resource_type, resource_id, table_name, record_id
   - changed_fields, old_data, new_data
   - ip_address, user_agent, created_at, success, error_message

6. **`invalidated_tokens`** — Blacklisted JWT tokens
   - token (pk), user_id, invalidated_at, expires_at

7. **`token_refresh_log`** — Token refresh audit
   - id, user_id, ip_address, user_agent, refreshed_at

8. **`oauth_connections`** — Linked OAuth accounts
   - id, user_id, provider, provider_user_id, profile_data

9. **`wallet_connections`** — Linked blockchain wallets
   - id, user_id, wallet_address, network, verified, last_login_at

10. **`biometric_credentials`** — FaceID/TouchID credentials
    - id, user_id, device_id, public_key, credential_type

11. **`trusted_devices`** — Device trust scores
    - id, user_id, device_fingerprint, trust_score, last_seen

12. **`user_addresses`** — User shipping/billing addresses
    - id, user_id, address_type, address_line1, address_line2, city, state_province, postal_code, country_code

### Indexes Created
- **users**: 12 indexes (email, username, phone, role, status, referral_code, metadata GIN, permissions GIN, full-text search)
- **user_sessions**: 2 indexes (user_id, ended_at)
- **user_venue_roles**: 2 indexes (user_id, venue_id)
- **audit_logs**: 7 indexes (user_id, action, created_at, resource, table_name, changed_fields GIN)
- **invalidated_tokens**: 2 indexes (user_id, expires_at)
- **oauth_connections**: 2 indexes (user_id, provider+provider_user_id unique)
- **wallet_connections**: 1 index (user_id)
- **biometric_credentials**: 1 index (user_id)
- **trusted_devices**: 1 index (user_id)
- **user_addresses**: 1 index (user_id)

### Constraints
- Email must be lowercase
- Username format: 3-30 alphanumeric + underscore
- Referral cannot be self
- Minimum age: 13 years
- User status enum: PENDING, ACTIVE, SUSPENDED, DELETED
- Stripe Connect status enum

### Triggers
1. **`trigger_generate_referral_code`** — Auto-generate referral code on insert
2. **`trigger_increment_referral_count`** — Increment referrer count on email verification
3. **`trigger_update_users_timestamp`** — Auto-update updated_at
4. **`audit_users_changes`** — Audit all user changes

### Row Level Security (RLS)
- **users** table has RLS enabled with policies:
  - `users_view_own` — Users can view their own data
  - `users_update_own` — Users can update their own data
  - `users_admin_all` — Admins can access all data
  - `users_tenant_isolation` — Tenant data isolation

### Masked View
- **`users_masked`** — Support view with PII masked (email, phone redacted)

---

## 7. Validators (`src/validators/auth.validators.ts`)

Joi schemas for request validation:
- `registerSchema` — User registration
- `loginSchema` — User login
- `refreshTokenSchema` — Token refresh
- `logoutSchema` — Logout
- `forgotPasswordSchema` — Password reset request
- `resetPasswordSchema` — Password reset
- `changePasswordSchema` — Password change
- `verifyEmailSchema` — Email verification
- `setupMFASchema` — MFA setup
- `verifyMFASchema` — MFA verification
- `disableMFASchema` — MFA disable
- `walletNonceSchema` — Wallet nonce request
- `walletRegisterSchema` — Wallet registration
- `walletLoginSchema` — Wallet login
- `walletLinkSchema` — Wallet linking
- `publicKeyParamSchema` — Public key parameter
- `oauthCallbackSchema` — OAuth callback
- `oauthLoginSchema` — OAuth login
- `oauthLinkSchema` — OAuth linking
- `providerParamSchema` — Provider parameter
- `biometricRegisterSchema` — Biometric registration
- `biometricChallengeSchema` — Biometric challenge
- `biometricAuthenticateSchema` — Biometric authentication
- `credentialIdParamSchema` — Credential ID parameter
- `sessionIdParamSchema` — Session ID parameter
- `updateProfileSchema` — Profile update
- `grantRoleSchema` — Role grant
- `venueIdParamSchema` — Venue ID parameter
- `venueIdAndUserIdParamSchema` — Venue and user ID parameters
- `paginationQuerySchema` — Pagination query
- `emptyBodySchema` — Empty body validation

---

## 8. Other Components

### `src/types/`
- **`types.ts`** — TypeScript type definitions for auth domain

### `src/utils/`
- **`logger.ts`** — Winston logger with PII scrubbing
- **`metrics.ts`** — Prometheus metrics collection
- **`rateLimiter.ts`** — Rate limiter factories
- **`sanitize.ts`** — HTML sanitization (XSS prevention)

### `src/errors/`
- **`index.ts`** — Custom error classes

### `tests/`
Comprehensive test suite:
- **`unit/`** — Unit tests for services, controllers, middleware
- **`integration/`** — Integration tests for full flows
- **`e2e/`** — End-to-end API tests
- **`fixtures/`** — Test data fixtures

---

## Key Features

### ✅ Implemented Security Features
- **Authentication Methods**:
  - Email/Password with bcrypt hashing
  - TOTP-based Multi-Factor Authentication
  - OAuth (Google, GitHub, Apple)
  - Web3 Wallet (Solana, Ethereum)
  - Biometric (FaceID, TouchID)

- **Security Hardening**:
  - Constant-time password comparison (timing attack prevention)
  - Account lockout after 5 failed attempts (15-minute lockout)
  - JWT token rotation with refresh token families
  - Refresh token reuse detection
  - Rate limiting on sensitive endpoints
  - CSRF protection
  - Helmet security headers
  - Input sanitization (HTML stripping)
  - Brute force protection
  - Device fingerprinting and trust scores

- **Authorization**:
  - Role-Based Access Control (RBAC)
  - Venue-specific permissions
  - Permission checking middleware
  - Row-Level Security (RLS) in database

- **Audit & Compliance**:
  - Comprehensive audit logging
  - Database-level audit triggers
  - PII masking functions
  - Data retention cleanup
  - GDPR-compliant user deletion/anonymization

- **Session Management**:
  - Redis-backed sessions
  - Session revocation
  - Multi-device session tracking
  - Session invalidation on security events

### 📊 Observability
- Prometheus metrics
- Structured logging (Winston)
- Request ID tracking
- Health check endpoints
- Performance monitoring

---

## Integration Points

### Upstream Dependencies
- **None** — Auth service is the root authentication provider

### Downstream Integrations
- **All Services** — All microservices depend on auth-service for authentication
- **Google OAuth** — OAuth authentication
- **GitHub OAuth** — OAuth authentication  
- **Apple Sign In** — OAuth authentication
- **Resend** — Email delivery
- **Solana RPC** — Wallet signature verification
- **Ethereum RPC** — Wallet signature verification
- **PostgreSQL** — User data persistence
- **Redis** — Token storage, rate limiting, caching

---

## Development Notes

### Running the Service
```bash
# Install dependencies
npm install

# Run migrations
npm run migrate

# Start in development
npm run dev

# Run tests
npm test
npm run test:coverage

# Production
npm start
```

### Environment Variables
See `.env.example` for required configuration:
- Database credentials (PostgreSQL)
- Redis connection
- JWT secrets
- OAuth credentials (Google, GitHub, Apple)
- Email service (Resend)
- Blockchain RPC URLs (Solana, Ethereum)

---

## Architecture Patterns

- **JWT with Refresh Tokens** — Secure token rotation
- **Token Families** — Prevent token reuse attacks
- **Constant-Time Operations** — Prevent timing attacks
- **Rate Limiting** — API abuse prevention
- **Idempotency** — Duplicate request handling
- **Audit Logging** — Comprehensive audit trail
- **Row-Level Security** — Database-level tenant isolation
- **PII Masking** — Support-safe data views
- **Device Trust** — Risk-based authentication
- **Multi-Factor Auth** — TOTP + backup codes

---

## Monitoring & Alerts

### Health Endpoints
- `/health` — Basic liveness probe
- `/metrics` — Prometheus metrics

### Key Metrics
- User registrations
- Login attempts (success/failure)
- Token refresh rate
- MFA adoption rate
- OAuth usage
- Wallet authentication
- Rate limit hits
- Account lockouts
- API latency

---

**Generated:** 2025-12-21  
**Service Version:** 1.0  
**Schema Version:** 001_auth_baseline
