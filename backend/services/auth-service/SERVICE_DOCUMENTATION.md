# AUTH SERVICE - COMPLETE DOCUMENTATION

**Last Updated:** November 12, 2025  
**Version:** 1.1.0  
**Status:** PRODUCTION

---

## QUICK REFERENCE

- **Service:** auth-service
- **Port:** 3001 (configurable via PORT env)
- **Framework:** Fastify
- **Database:** PostgreSQL (tickettoken_db)
- **Cache:** Redis
- **Purpose:** Identity & Access Management for entire platform

---

## EXECUTIVE SUMMARY

**Auth-service is the security backbone of the TicketToken platform.**

This service demonstrates:
- ✅ Complete identity & access management (IAM)
- ✅ 6 authentication methods (password, MFA, OAuth, wallet, biometric, session)
- ✅ RS256 JWT with refresh token rotation and theft detection
- ✅ Multi-tenant isolation (tenant_id in every user)
- ✅ Advanced security (timing attack prevention, brute force protection, rate limiting)
- ✅ Role-Based Access Control (RBAC) with venue-scoped permissions
- ✅ Comprehensive audit logging (all security events tracked)
- ✅ 29 API endpoints (9 public, 20 authenticated)
- ✅ 59 organized files

**This is a CRITICAL, PRODUCTION-GRADE authentication system.**

### Service Statistics

- **Source Files:** 59 documented files (170 total with node_modules)
- **Services:** 24 service classes
- **Controllers:** 4 controllers
- **Middleware:** 6 middleware layers
- **Database Tables:** 10+ tables (users table has 64 columns!)
- **API Endpoints:** 29 endpoints
- **Authentication Methods:** 6 types
- **Lines of Code:** ~8,000+ lines (TypeScript)

### Business Purpose

**Core Responsibilities:**
1. User registration and authentication (email/password)
2. JWT token generation and validation (RS256, 4096-bit RSA)
3. Multi-factor authentication (TOTP with backup codes)
4. OAuth login (Google, Apple)
5. Crypto wallet authentication (Solana, Ethereum)
6. Biometric authentication (Face ID, Touch ID)
7. Password management (reset, change, validation)
8. Session management (multi-device, revocation)
9. Role-based access control (RBAC)
10. Venue role management (owner, manager, box-office, door-staff)
11. Security audit logging (all events tracked)
12. Multi-tenant isolation (tenant_id enforcement)

**Business Value:**
- **Platform Security:** Every user, every request authenticated
- **User Trust:** Multiple authentication options, MFA support
- **Compliance:** GDPR-ready, audit trails, data isolation
- **Developer Experience:** Clean JWT contracts, well-documented APIs
- **Fraud Prevention:** Brute force protection, timing attack prevention
- **Scalability:** Redis-backed sessions, stateless JWT architecture

### Blast Radius: CRITICAL ⚠️

**If auth-service is down, THE ENTIRE PLATFORM STOPS.**

**Impact:**
- ❌ No user can login
- ❌ No new registrations
- ❌ All authenticated API calls fail across ALL services
- ❌ No service-to-service authentication
- ❌ Payment-service cannot validate users
- ❌ Venue-service cannot check permissions
- ❌ Ticket-service cannot verify ownership

**ALL 21 services depend on auth-service for:**
- JWT validation (every authenticated request)
- User identity verification
- Permission checks
- Tenant isolation

**This is the HIGHEST priority service to keep operational.**

---

## ARCHITECTURE OVERVIEW

### Technology Stack

```
Runtime: Node.js 20 + TypeScript
Framework: Fastify (fully migrated)
Database: PostgreSQL (tickettoken_db) via Knex.js + raw Pool
Cache: Redis (ioredis)
DI Container: Awilix (configured but not fully utilized)
Password Hashing: bcrypt (production) / argon2 (alternate)
JWT: RS256 (4096-bit RSA keys)
Validation: Joi schemas
Monitoring: Prometheus metrics, Winston logger
Testing: Jest
OAuth: Google OAuth2Client, Apple Sign-In
Blockchain: Solana web3.js, Ethers.js (Ethereum)
```

### Service Architecture Layers

```
┌──────────────────────────────────────────────────────────────┐
│                    API LAYER (Express)                        │
│  29 Endpoints → Controllers → Services → Database            │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                   MIDDLEWARE LAYER                            │
│  • JWT Authentication (RS256, 4096-bit RSA)                  │
│  • Rate Limiting (Redis-backed, multi-level)                 │
│  • Brute Force Protection (5 attempts/15min lockout)         │
│  • Validation (Joi schemas)                                   │
│  • Security Headers (Helmet.js)                               │
│  • Request Logging (Winston + PII sanitization)              │
│  • Cache Middleware (@tickettoken/shared)                    │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                       │
│                                                               │
│  AUTHENTICATION SERVICES:                                     │
│  ├─ AuthService (register, login, logout)                    │
│  ├─ AuthExtendedService (password reset, email verify)       │
│  ├─ JWTService (RS256 tokens + refresh rotation)             │
│  ├─ MFAService (TOTP, QR codes, backup codes)                │
│  ├─ OAuthService (Google, Apple)                             │
│  └─ WalletService (Solana, Ethereum signature verification)  │
│                                                               │
│  SECURITY SERVICES:                                           │
│  ├─ BruteForceProtectionService (lockout management)         │
│  ├─ RateLimitService (per-IP, per-user, per-endpoint)        │
│  ├─ LockoutService (failed attempt tracking)                 │
│  ├─ PasswordSecurityService (strength validation)            │
│  ├─ DeviceTrustService (fingerprinting, trust scores)        │
│  └─ BiometricService (Face ID, Touch ID)                     │
│                                                               │
│  AUTHORIZATION:                                               │
│  ├─ RBACService (role-based access control)                  │
│  └─ Venue role management (owner/manager/staff)              │
│                                                               │
│  SUPPORTING SERVICES:                                         │
│  ├─ AuditService (security event logging)                    │
│  ├─ EmailService (verification, password reset)              │
│  ├─ MonitoringService (health checks, metrics)               │
│  └─ CacheIntegration (@tickettoken/shared cache system)      │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                 │
│  • Users table (64 columns!)                                  │
│  • Multi-tenant isolation (tenant_id)                         │
│  • Session management (user_sessions)                         │
│  • Audit logs (audit_logs)                                    │
│  • OAuth connections (oauth_connections)                      │
│  • Wallet connections (wallet_connections)                    │
└──────────────────────────────────────────────────────────────┘
```

### Dependency Injection (Awilix)

**Configuration:** `src/config/dependencies.ts`

```typescript
container.register({
  // Core Services (Singleton)
  jwtService: asClass(JWTService).singleton(),
  authService: asClass(AuthService).singleton(),
  authExtendedService: asClass(AuthExtendedService).singleton(),
  rbacService: asClass(RBACService).singleton(),
  mfaService: asClass(MFAService).singleton(),
  
  // Security Services
  rateLimitService: asClass(RateLimitService).singleton(),
  deviceTrustService: asClass(DeviceTrustService).singleton(),
  biometricService: asClass(BiometricService).singleton(),
  
  // Supporting Services
  emailService: asClass(EmailService).singleton(),
  auditService: asClass(AuditService).singleton(),
  monitoringService: asClass(MonitoringService).singleton(),
});
```

**Issue:** Container is configured but **NOT USED** in Express server. Services are manually instantiated in `src/index.ts`.

**Solution:** Switch to Fastify which properly uses the DI container (like venue-service).

---

## DATABASE SCHEMA

### Core Tables

#### **users** (PRIMARY TABLE - 64 columns!)

The most complex table in the system. Handles identity, profile, security, compliance, and multi-tenancy.

```sql
CREATE TABLE users (
  -- Core Identity (3 columns)
  id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  
  -- Email Verification (4 columns)
  email_verified BOOLEAN DEFAULT false,
  email_verification_token VARCHAR(64),
  email_verification_expires TIMESTAMP,
  email_verified_at TIMESTAMP,
  
  -- Profile - Basic (8 columns)
  username VARCHAR(30) UNIQUE,
  display_name VARCHAR(100),
  bio TEXT,
  avatar_url TEXT,
  cover_image_url TEXT,
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  date_of_birth DATE,
  
  -- Contact (2 columns)
  phone VARCHAR(20),
  phone_verified BOOLEAN DEFAULT false,
  
  -- Location (4 columns)
  country_code VARCHAR(2),
  city VARCHAR(100),
  state_province VARCHAR(100),
  postal_code VARCHAR(20),
  
  -- Preferences (2 columns)
  timezone VARCHAR(50) DEFAULT 'UTC',
  preferred_language VARCHAR(10) DEFAULT 'en',
  
  -- Status & Role (3 columns)
  status user_status DEFAULT 'PENDING',
  role VARCHAR(20) DEFAULT 'user',
  permissions JSONB DEFAULT '[]',
  
  -- MFA / 2FA (5 columns)
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret VARCHAR(32),
  backup_codes TEXT[],
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret TEXT,
  
  -- Password Management (4 columns)
  last_password_change TIMESTAMP DEFAULT NOW(),
  password_reset_token VARCHAR(64),
  password_reset_expires TIMESTAMP,
  password_changed_at TIMESTAMP,
  
  -- Login Tracking (5 columns)
  last_login_at TIMESTAMP,
  last_login_ip INET,
  last_login_device VARCHAR(255),
  login_count INTEGER DEFAULT 0,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  
  -- Settings (3 columns)
  preferences JSONB DEFAULT '{}',
  notification_preferences JSONB DEFAULT '{"email": {...}, "push": {...}}',
  profile_data JSONB DEFAULT '{}',
  
  -- Legal & Compliance (6 columns)
  terms_accepted_at TIMESTAMP,
  terms_version VARCHAR(20),
  privacy_accepted_at TIMESTAMP,
  privacy_version VARCHAR(20),
  marketing_consent BOOLEAN DEFAULT false,
  marketing_consent_date TIMESTAMP,
  
  -- Referrals (3 columns)
  referral_code VARCHAR(20) UNIQUE,
  referred_by UUID REFERENCES users(id),
  referral_count INTEGER DEFAULT 0,
  
  -- OAuth / External Auth (2 columns)
  provider VARCHAR(50),
  provider_user_id VARCHAR(255),
  
  -- Web3 / Wallet (3 columns)
  wallet_address VARCHAR(255),
  network VARCHAR(50),
  verified BOOLEAN DEFAULT false,
  
  -- Metadata (3 columns)
  metadata JSONB DEFAULT '{}',
  tags TEXT[],
  verification_token VARCHAR(255),
  
  -- Activity (1 column)
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps (3 columns)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  -- Multi-Tenancy (1 column) - CRITICAL!
  tenant_id UUID,
  
  -- Constraints
  CHECK (email = LOWER(email)),
  CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  CHECK (referred_by IS NULL OR referred_by != id),
  CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE - INTERVAL '13 years')
);
```

**Indexes (20+ indexes):**
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_tenant_id ON users(tenant_id); -- CRITICAL
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
CREATE INDEX idx_users_email_verification_token ON users(email_verification_token);
CREATE INDEX idx_users_password_reset_token ON users(password_reset_token);

-- JSONB GIN indexes for fast queries
CREATE INDEX idx_users_metadata_gin ON users USING gin(metadata);
CREATE INDEX idx_users_preferences_gin ON users USING gin(preferences);
CREATE INDEX idx_users_permissions_gin ON users USING gin(permissions);

-- Full-text search
CREATE INDEX idx_users_search ON users USING gin(
  to_tsvector('english',
    COALESCE(username, '') || ' ' ||
    COALESCE(display_name, '') || ' ' ||
    COALESCE(first_name, '') || ' ' ||
    COALESCE(last_name, '') || ' ' ||
    COALESCE(email, '')
  )
);
```

**Why 64 columns?**
- Comprehensive user profile
- Security tracking (login attempts, lockouts)
- Compliance (GDPR, marketing consent)
- Multi-auth support (OAuth, wallet, biometric)
- Referral system
- Multi-tenancy

#### **user_sessions**

Tracks active user sessions across devices.

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  revoked_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  
  INDEX idx_user_sessions_user_id(user_id),
  INDEX idx_user_sessions_ended_at(ended_at) WHERE ended_at IS NULL
);
```

**Purpose:**
- Track active sessions per user
- Enable "logout all devices" functionality
- Security monitoring (unusual locations)
- Session revocation

#### **user_venue_roles**

Links users to venues with specific roles.

```sql
CREATE TABLE user_venue_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL, -- FK to venues in venue-service
  role VARCHAR(50) NOT NULL, -- venue-owner, venue-manager, box-office, door-staff
  granted_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE (user_id, venue_id, role) WHERE is_active = true,
  INDEX idx_user_venue_roles_user_id(user_id),
  INDEX idx_user_venue_roles_venue_id(venue_id)
);
```

**Roles:**
- **venue-owner:** Full control, can delete venue
- **venue-manager:** Manage events, staff, reports
- **box-office:** Sell tickets, process payments
- **door-staff:** Validate tickets at entrance

#### **audit_logs**

Security event logging for compliance and forensics.

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_audit_logs_user_id(user_id),
  INDEX idx_audit_logs_action(action),
  INDEX idx_audit_logs_created_at(created_at),
  INDEX idx_audit_logs_resource(resource_type, resource_id)
);
```

**Logged Events:**
- Login attempts (success/failure)
- Password changes
- MFA enable/disable
- Role grants/revokes
- Session activity
- Permission changes

#### **invalidated_tokens**

Tracks revoked JWT tokens (logout).

```sql
CREATE TABLE invalidated_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invalidated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  
  INDEX idx_invalidated_tokens_user_id(user_id),
  INDEX idx_invalidated_tokens_expires_at(expires_at)
);
```

**Cleanup:** Tokens auto-expire based on `expires_at`. Cron job cleans old records.

#### **oauth_connections**

Links users to OAuth providers (Google, Apple).

```sql
CREATE TABLE oauth_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE (provider, provider_user_id),
  INDEX idx_oauth_connections_user_id(user_id)
);
```

**Providers:** google, apple (facebook planned)

#### **wallet_connections**

Links users to crypto wallets.

```sql
CREATE TABLE wallet_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(255) NOT NULL,
  network VARCHAR(50) NOT NULL, -- solana, ethereum
  verified BOOLEAN DEFAULT false,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE (wallet_address, network),
  INDEX idx_wallet_connections_user_id(user_id)
);
```

**Networks:** solana, ethereum

#### **biometric_credentials**

Stores public keys for biometric authentication.

```sql
CREATE TABLE biometric_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  public_key TEXT NOT NULL,
  credential_type VARCHAR(50) NOT NULL, -- faceId, touchId, fingerprint
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE (user_id, device_id),
  INDEX idx_biometric_credentials_user_id(user_id)
);
```

#### **trusted_devices**

Tracks device fingerprints and trust scores.

```sql
CREATE TABLE trusted_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint VARCHAR(255) NOT NULL,
  trust_score INTEGER DEFAULT 0, -- 0-100
  last_seen TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE (user_id, device_fingerprint),
  INDEX idx_trusted_devices_user_id(user_id)
);
```

**Trust Score Calculation:**
- Base: 50 points
- Age bonus: +1 point per 10 days (max 20)
- Recent activity: +30 if seen in last day, +20 if last week
- Score < 30 triggers MFA requirement

#### **tenants**

Multi-tenant support (platform isolation).

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Default tenant
INSERT INTO tenants (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default');
```

**Critical:** Every user MUST have a `tenant_id`. This provides data isolation.

---

## API ENDPOINTS

### Authentication Flow

```
1. Register → 2. Verify Email → 3. Login → 4. Get JWT → 5. Use JWT for all requests
                                    ↓
                              MFA required? → 6. Verify MFA code
```

### Public Endpoints (No Authentication Required)

#### **1. POST /auth/register**

Create a new user account.

**Request:**
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}
```

**Response: 201**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "email_verified": false,
      "mfa_enabled": false,
      "tenant_id": "uuid"
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    }
  }
}
```

**Validation:**
- Email: Valid format, max 255 chars
- Password: Min 8 chars, uppercase, lowercase, number, special char
- FirstName/LastName: Min 1, max 100 chars
- Phone: Optional, E.164 format

**Security:**
- Rate limit: 3 attempts per 5 minutes per IP
- Email uniqueness check
- Password hashing: bcrypt (10 rounds)
- Default tenant assigned if not provided

**Errors:**
- 400: Invalid input format
- 409: Email already registered
- 422: Validation failed
- 429: Rate limit exceeded
- 500: Server error

**Process:**
1. Validate input (Joi schema)
2. Check email uniqueness
3. Hash password (bcrypt)
4. Create user in database
5. Assign default tenant
6. Generate JWT tokens (RS256)
7. Return user + tokens

#### **2. POST /auth/login**

Authenticate user and get JWT tokens.

**Request:**
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "mfaToken": "123456"  // Optional, required if MFA enabled
}
```

**Response: 200 (No MFA)**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "email_verified": true,
      "mfa_enabled": false
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    }
  }
}
```

**Response: 200 (MFA Required)**
```json
{
  "requiresMFA": true,
  "userId": "uuid"
}
```

**Security Features:**
- **Timing attack prevention:** Constant 500ms response time
- **Brute force protection:** 5 attempts per 15 minutes
- **Account lockout:** 15 minutes after 5 failed attempts
- **Rate limiting:** 5 attempts per minute per IP
- **Dummy hash:** Runs bcrypt even for non-existent users
- **Random jitter:** 0-50ms added to prevent statistical analysis

**Errors:**
- 401: Invalid credentials
- 429: Too many attempts / Account locked
- 500: Server error

**Login Process:**
```typescript
// Constant-time operation (500ms minimum)
const startTime = Date.now();

// Always lookup user and run bcrypt (even if user doesn't exist)
const user = await findUser(email) || null;
const hash = user?.password_hash || DUMMY_HASH;
const valid = await bcrypt.compare(password, hash);

// Add random jitter (0-50ms)
await randomDelay(0, 50);

// Ensure minimum response time
const elapsed = Date.now() - startTime;
if (elapsed < 500) await delay(500 - elapsed);

// Check credentials after timing
if (!user || !valid) throw new Error('Invalid credentials');
```

#### **3. POST /auth/refresh**

Refresh access token using refresh token.

**Request:**
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..."
}
```

**Response: 200**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com"
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    }
  }
}
```

**Token Rotation:**
- Old refresh token invalidated
- New refresh token issued
- Access token regenerated
- Family tracking for theft detection

**Errors:**
- 401: Invalid/expired refresh token
- 401: Token reuse detected (theft)
- 500: Server error

#### **4. GET /auth/verify-email**

Verify user's email address.

**Request:**
```http
GET /auth/verify-email?token=abc123...
```

**Response: 200**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

**Process:**
1. Lookup token in Redis
2. Validate token not expired (24 hours)
3. Update user.email_verified = true
4. Delete token from Redis
5. Log audit event

**Errors:**
- 400: Invalid or expired token
- 404: Token not found
- 500: Server error

#### **5. POST /auth/forgot-password**

Request password reset email.

**Request:**
```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response: 200 (Always same response)**
```json
{
  "success": true,
  "message": "If an account exists with this email, you will receive password reset instructions."
}
```

**Security:**
- Constant-time response (300ms minimum)
- No user enumeration (always same response)
- Rate limit: 3 attempts per hour per IP
- Token valid for 1 hour

**Process:**
1. Lookup user (constant time)
2. Generate secure token (crypto.randomBytes)
3. Store in Redis with 1 hour TTL
4. Queue email (async, don't wait)
5. Always return success after 300ms

#### **6. POST /auth/reset-password**

Reset password using token from email.

**Request:**
```http
POST /auth/reset-password
Content-Type: application/json

{
  "token": "abc123...",
  "newPassword": "NewSecurePass123!"
}
```

**Response: 200**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

**Security:**
- Token single-use (deleted after use)
- Password strength validation
- All refresh tokens invalidated
- Audit log created

**Process:**
1. Validate token from Redis
2. Check token not expired
3. Validate new password strength
4. Hash new password (bcrypt)
5. Update user.password_hash
6. Delete token from Redis
7. Invalidate all user refresh tokens
8. Log audit event

**Errors:**
- 400: Invalid/expired token
- 422: Weak password
- 500: Server error

#### **7. GET /auth/wallet/nonce/:address**

Get nonce for wallet signature.

**Request:**
```http
GET /auth/wallet/nonce/5GHx...abc
```

**Response: 200**
```json
{
  "success": true,
  "nonce": "f3a8b9c..."
}
```

**Process:**
1. Generate random nonce (32 bytes)
2. Store in Redis with 5 minute TTL
3. Return nonce for signing

**Rate Limit:** 10 requests per minute per IP

#### **8. POST /auth/wallet/login**

Login with crypto wallet signature.

**Request:**
```http
POST /auth/wallet/login
Content-Type: application/json

{
  "address": "5GHx...abc",
  "signature": "0x...",
  "network": "solana",
  "message": "Login to TicketToken\nNonce: f3a8b9c..."
}
```

**Response: 200**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com"
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    },
    "wallet": {
      "address": "5GHx...abc",
      "network": "solana"
    }
  }
}
```

**Signature Verification:**
- **Solana:** nacl.sign.detached.verify()
- **Ethereum:** ethers.verifyMessage()

**Process:**
1. Get nonce from Redis
2. Verify signature matches address
3. Lookup wallet_connection
4. Get associated user
5. Generate JWT tokens
6. Delete nonce from Redis

**Errors:**
- 400: Nonce expired/not found
- 401: Invalid signature
- 404: Wallet not connected to account
- 500: Server error

#### **9. POST /auth/oauth/:provider/login**

Login with OAuth provider (Google, Apple).

**Request:**
```http
POST /auth/oauth/google/login
Content-Type: application/json

{
  "token": "google_id_token_here"
}
```

**Response: 200**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "emailVerified": true
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    },
    "provider": "google"
  }
}
```

**OAuth Providers:**
- **Google:** OAuth2Client.verifyIdToken()
- **Apple:** AppleAuth.verifyIdToken()

**Process:**
1. Verify token with provider
2. Extract profile (id, email, name, picture)
3. Find or create user
4. Store oauth_connection
5. Generate JWT tokens

**Errors:**
- 400: Invalid provider
- 401: Token verification failed
- 500: Server error

---

### Authenticated Endpoints (JWT Required)

All endpoints below require `Authorization: Bearer <accessToken>` header.

#### **10. GET /auth/verify**

Verify JWT token is valid.

**Request:**
```http
GET /auth/verify
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "customer",
    "permissions": ["buy:tickets", "view:events"]
  }
}
```

**Used By:** All services to validate JWT tokens

**Errors:**
- 401: Invalid/expired token

#### **11. GET /auth/me**

Get current authenticated user.

**Request:**
```http
GET /auth/me
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "email_verified": true,
    "mfa_enabled": false,
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

**Cache:** User data cached in Redis (5 min TTL)

#### **12. POST /auth/logout**

End current session and invalidate token.

**Request:**
```http
POST /auth/logout
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Process:**
1. Blacklist access token (Redis)
2. Delete refresh token (Redis)
3. End session in database
4. Clear user cache

#### **13. POST /auth/resend-verification**

Resend email verification link.

**Request:**
```http
POST /auth/resend-verification
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "success": true,
  "message": "Verification email sent"
}
```

**Rate Limit:** 3 attempts per hour per user

#### **14. GET /auth/profile**

Get full user profile.

**Request:**
```http
GET /auth/profile
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890",
    "email_verified": true,
    "mfa_enabled": false,
    "role": "customer",
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-15T12:00:00Z",
    "last_login_at": "2025-01-15T11:30:00Z",
    "password_changed_at": "2025-01-01T00:00:00Z"
  }
}
```

#### **15. PUT /auth/profile**

Update user profile.

**Request:**
```http
PUT /auth/profile
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "+1987654321"
}
```

**Response: 200**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "Jane",
    "last_name": "Smith",
    "phone": "+1987654321"
  }
}
```

**Allowed Fields:** first_name, last_name, phone, profile_data

**Audit:** Profile update logged

#### **16. PUT /auth/change-password**

Change user password.

**Request:**
```http
PUT /auth/change-password
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

**Response: 200**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Security:**
- Verify current password
- Validate new password strength
- Ensure new password is different
- Hash with bcrypt
- Invalidate all sessions
- Log audit event

#### **17. GET /auth/sessions**

List active sessions.

**Request:**
```http
GET /auth/sessions
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "started_at": "2025-01-15T10:00:00Z",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "is_current": true
    },
    {
      "id": "uuid",
      "started_at": "2025-01-14T08:00:00Z",
      "ip_address": "192.168.1.2",
      "user_agent": "Chrome Mobile...",
      "is_current": false
    }
  ]
}
```

#### **18. DELETE /auth/sessions/all**

Logout all devices.

**Request:**
```http
DELETE /auth/sessions/all
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "success": true,
  "message": "2 sessions invalidated",
  "sessions_revoked": 2
}
```

**Process:**
1. End all sessions in database
2. Delete all refresh tokens
3. Keep current session active
4. Log audit event

#### **19. DELETE /auth/sessions/:sessionId**

Revoke specific session.

**Request:**
```http
DELETE /auth/sessions/abc-123
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "success": true,
  "message": "Session revoked successfully"
}
```

#### **20. POST /auth/mfa/setup**

Setup multi-factor authentication.

**Request:**
```http
POST /auth/mfa/setup
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCode": "data:image/png;base64,iVBOR...",
    "backupCodes": [
      "A1B2-C3D4",
      "E5F6-G7H8",
      ...
    ]
  }
}
```

**Implementation:**
- TOTP algorithm (speakeasy)
- 30-second time window
- QR code generation
- 10 backup codes generated
- Secret encrypted in database

**Next Step:** User must verify with /auth/mfa/verify

#### **21. POST /auth/mfa/verify**

Verify and enable MFA.

**Request:**
```http
POST /auth/mfa/verify
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "token": "123456"
}
```

**Response: 200**
```json
{
  "success": true,
  "valid": true
}
```

**Process:**
1. Get temporary secret from Redis
2. Verify TOTP token
3. Enable MFA on user account
4. Store encrypted secret
5. Delete temporary setup data
6. Log audit event

**Errors:**
- 400: Setup expired/not found
- 401: Invalid MFA token
- 500: Server error

#### **22. DELETE /auth/mfa/disable**

Disable multi-factor authentication.

**Request:**
```http
DELETE /auth/mfa/disable
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "password": "CurrentPass123!"
}
```

**Response: 200**
```json
{
  "success": true,
  "message": "MFA disabled"
}
```

**Security:**
- Requires password confirmation
- Clears MFA secret
- Clears backup codes
- Logs audit event

#### **23. POST /auth/wallet/connect**

Connect crypto wallet to account.

**Request:**
```http
POST /auth/wallet/connect
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "address": "5GHx...abc",
  "signature": "0x...",
  "network": "solana"
}
```

**Response: 200**
```json
{
  "success": true,
  "message": "Wallet connected",
  "wallet": {
    "address": "5GHx...abc",
    "network": "solana",
    "verified": true
  }
}
```

**Process:**
1. Get nonce from Redis
2. Verify signature
3. Check wallet not already connected
4. Create wallet_connection
5. Delete nonce

#### **24. POST /auth/biometric/register**

Register biometric credential.

**Request:**
```http
POST /auth/biometric/register
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "deviceId": "iPhone14-ABC123",
  "publicKey": "-----BEGIN PUBLIC KEY-----...",
  "credentialType": "faceId"
}
```

**Response: 200**
```json
{
  "success": true,
  "message": "Biometric credential registered"
}
```

**Types:** faceId, touchId, fingerprint

#### **25. GET /auth/biometric/challenge**

Get biometric authentication challenge.

**Request:**
```http
GET /auth/biometric/challenge
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "success": true,
  "challenge": "a1b2c3d4..."
}
```

**Process:**
1. Generate random challenge (32 bytes)
2. Store in Redis (5 min TTL)
3. Return for signing

#### **26. POST /auth/oauth/:provider/link**

Link OAuth account to existing user.

**Request:**
```http
POST /auth/oauth/google/link
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "token": "google_id_token"
}
```

**Response: 200**
```json
{
  "success": true,
  "message": "Google account linked successfully",
  "provider": "google"
}
```

**Validation:**
- Check not already linked to this user
- Check OAuth account not linked to another user

#### **27. POST /auth/venues/:venueId/roles**

Grant venue role to user.

**Request:**
```http
POST /auth/venues/venue-123/roles
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "userId": "user-456",
  "role": "venue-manager",
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

**Response: 200**
```json
{
  "success": true,
  "message": "Role venue-manager granted to user user-456 for venue venue-123"
}
```

**Roles:** venue-owner, venue-manager, box-office, door-staff

**Permissions Required:** roles:manage for venue

#### **28. GET /auth/venues/:venueId/roles**

List venue roles.

**Request:**
```http
GET /auth/venues/venue-123/roles
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "roles": [
    {
      "user_id": "user-456",
      "role": "venue-manager",
      "granted_by": "user-123",
      "is_active": true,
      "expires_at": null,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### **29. DELETE /auth/venues/:venueId/roles/:userId**

Revoke venue role from user.

**Request:**
```http
DELETE /auth/venues/venue-123/roles/user-456
Authorization: Bearer eyJhbGc...
```

**Response: 200**
```json
{
  "success": true,
  "message": "All roles revoked for user user-456 at venue venue-123"
}
```

**Permissions Required:** roles:manage for venue

---

## DEPENDENCIES

### What This Service NEEDS (Upstream)

**REQUIRED (Service fails without these):**

**PostgreSQL (localhost:5432)**
- Database: tickettoken_db
- Tables: 10+ tables (see schema section)
- Breaking: Service won't start without database connection

**Redis (localhost:6379)**
- Sessions, rate limiting, token blacklist, cache
- Breaking: Service degrades but can run (falls back to in-memory)

**RSA Keys for JWT (RS256)**
- Location: ~/tickettoken-secrets/
- Files: jwt-private.pem (4096-bit), jwt-public.pem
- Generation:
  ```bash
  openssl genrsa -out ~/tickettoken-secrets/jwt-private.pem 4096
  openssl rsa -in ~/tickettoken-secrets/jwt-private.pem -pubout -out ~/tickettoken-secrets/jwt-public.pem
  ```
- Breaking: Service fails to start without keys

**OPTIONAL (Service works without these):**

**Google OAuth API**
- Client ID, Client Secret
- Breaking: Google login unavailable

**Apple OAuth API**
- Client ID, Team ID, Key ID
- Breaking: Apple login unavailable

**Solana RPC**
- For wallet signature verification
- Breaking: Solana wallet login unavailable

**Ethereum RPC**
- For wallet signature verification
- Breaking: Ethereum wallet login unavailable

**Email Service (SendGrid/AWS SES)**
- For verification emails, password resets
- Breaking: Email features queued but not sent

### What DEPENDS On This Service (Downstream)

**ALL 21 SERVICES depend on auth-service:**

**Direct Dependencies:**

**venue-service (port 3002)**
- Validates JWT for all authenticated requests
- Checks user permissions for venue operations
- Calls: Internal JWT verification

**payment-service (port 3005)**
- Validates user identity for payments
- Checks user can purchase tickets
- Calls: JWT validation

**ticket-service (port 3004)**
- Validates ticket ownership
- Checks transfer permissions
- Calls: JWT validation

**event-service (port 3003)**
- Checks user can create events
- Validates venue ownership
- Calls: JWT validation

**marketplace-service (port 3008)**
- Validates user for resale transactions
- Checks trading permissions
- Calls: JWT validation

**ALL OTHER SERVICES:**
- notification-service, analytics-service, queue-service, etc.
- All validate JWT tokens via auth-service

**Frontend/Mobile Apps:**
- Web app, iOS app, Android app
- All authentication flows
- User profile management
- Session management

**BLAST RADIUS: CRITICAL ⚠️**

**If auth-service is down:**
- ❌ No user can login
- ❌ No new registrations
- ❌ ALL authenticated API calls fail across ALL 21 services
- ❌ Existing sessions eventually expire
- ❌ No password resets
- ❌ No email verification
- ✓ Public endpoints (event browsing) continue working

**This is the SINGLE POINT OF FAILURE for authentication platform-wide.**

---

## CRITICAL FEATURES

### 1. JWT Token System (RS256) ✅

**Implementation Details:**

**Algorithm:** RS256 (RSA Signature with SHA-256)
- **Key Size:** 4096-bit RSA keys
- **Public Key:** Shared with all services for validation
- **Private Key:** Kept secure in auth-service only

**Token Types:**

**Access Token (2 hour expiry):**
```json
{
  "sub": "user-uuid",
  "type": "access",
  "jti": "token-uuid",
  "tenant_id": "tenant-uuid",
  "permissions": ["buy:tickets", "view:events"],
  "role": "customer",
  "exp": 1705000000,
  "iat": 1704993200,
  "iss": "api.tickettoken.com",
  "aud": "api.tickettoken.com"
}
```

**Refresh Token (7 day expiry):**
```json
{
  "sub": "user-uuid",
  "type": "refresh",
  "jti": "token-uuid",
  "tenant_id": "tenant-uuid",
  "family": "family-uuid",
  "exp": 1705598000,
  "iat": 1704993200
}
```

**Token Generation:**
```typescript
// Uses RSA private key (4096-bit)
const accessToken = jwt.sign(
  {
    sub: user.id,
    type: 'access',
    jti: crypto.randomUUID(),
    tenant_id: user.tenant_id,
    permissions: user.permissions,
    role: user.role
  },
  privateKey,
  {
    expiresIn: '2h',
    algorithm: 'RS256',
    keyid: '1'
  }
);
```

**Token Validation:**
```typescript
// Uses RSA public key (shared with all services)
const decoded = jwt.verify(token, publicKey, {
  issuer: 'api.tickettoken.com',
  audience: 'api.tickettoken.com',
  algorithms: ['RS256']
});

// Validate tenant_id present
if (!decoded.tenant_id) {
  throw new Error('Invalid token - missing tenant context');
}
```

**Refresh Token Rotation:**
- Old refresh token invalidated on use
- New refresh token issued
- Family tracking prevents theft
- If old token reused → entire family invalidated

**Token Storage:**
- Access tokens: Stateless (not stored)
- Refresh tokens: Redis with 7-day TTL
- Invalidated tokens: Redis (for logout)

**Security Features:**
- Token theft detection via family tracking
- Automatic family invalidation on reuse
- Token blacklist on logout
- JTI (JWT ID) for tracking

**Why RS256?**
- Public key verification (services don't need private key)
- Better security than HS256
- Key rotation support (keyid field)
- Industry standard for microservices

### 2. Multi-Tenant Isolation ✅

**Critical for Platform Security**

**Implementation:**

Every user belongs to a tenant:
```sql
users.tenant_id → tenants.id
```

**Default Tenant:**
```sql
INSERT INTO tenants (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'default');
```

**JWT Includes Tenant:**
```json
{
  "sub": "user-id",
  "tenant_id": "tenant-id",  // ← CRITICAL
  "role": "customer"
}
```

**Database Queries MUST Filter by Tenant:**
```typescript
// CORRECT
const user = await db('users')
  .where({ id: userId, tenant_id: tenantId })
  .first();

// WRONG (potential data leakage)
const user = await db('users')
  .where({ id: userId })
  .first();
```

**Why This Matters:**
- **Data Isolation:** Tenant A cannot access Tenant B's data
- **Compliance:** Required for multi-customer platforms
- **Security Boundary:** Prevents cross-tenant attacks
- **Future Proofing:** Enables white-label deployments

**Current Issue:** ⚠️
- Some endpoints don't validate tenant context
- Profile/session endpoints missing tenant checks
- **Fix Required:** Add tenant middleware to ALL routes

### 3. Authentication Methods (6 Types) ✅

**1. Email/Password**
```typescript
// Timing attack prevention
const startTime = Date.now();
const MIN_RESPONSE_TIME = 500; // ms

// Always run bcrypt (even for non-existent users)
const user = await findUser(email) || null;
const hash = user?.password_hash || DUMMY_HASH;
const valid = await bcrypt.compare(password, hash);

// Random jitter (0-50ms)
await randomDelay(0, 50);

// Ensure constant time
const elapsed = Date.now() - startTime;
if (elapsed < MIN_RESPONSE_TIME) {
  await delay(MIN_RESPONSE_TIME - elapsed);
}
```

**2. Multi-Factor Authentication (TOTP)**
```typescript
// speakeasy.totp.verify()
const verified = speakeasy.totp.verify({
  secret: decryptedSecret,
  encoding: 'base32',
  token: userProvidedToken,
  window: 2  // ±60 seconds tolerance
});

// Prevent replay attacks
await redis.setex(`mfa:recent:${userId}:${token}`, 90, '1');
```

**3. OAuth (Google, Apple)**
```typescript
// Google
const ticket = await googleClient.verifyIdToken({
  idToken: token,
  audience: process.env.GOOGLE_CLIENT_ID
});

// Apple
const decodedToken = await AppleAuth.verifyIdToken(token, {
  audience: process.env.APPLE_CLIENT_ID
});
```

**4. Wallet Authentication (Solana, Ethereum)**
```typescript
// Solana
const publicKeyObj = new PublicKey(walletAddress);
const verified = nacl.sign.detached.verify(
  messageBuffer,
  signatureBuffer,
  publicKeyObj.toBytes()
);

// Ethereum
const recoveredAddress = ethers.verifyMessage(message, signature);
const valid = recoveredAddress.toLowerCase() === address.toLowerCase();
```

**5. Biometric (Face ID, Touch ID)**
```typescript
// Store public key
await db('biometric_credentials').insert({
  user_id: userId,
  device_id: deviceId,
  public_key: publicKey,
  credential_type: 'faceId'
});

// Verify signature
const expectedSignature = crypto
  .createHash('sha256')
  .update(challenge + publicKey)
  .digest('hex');
```

**6. Session-Based (Legacy)**
```typescript
// Create session
const sessionId = crypto.randomUUID();
await redis.setex(`session:${sessionId}`, 86400, JSON.stringify({
  userId,
  createdAt: Date.now(),
  ipAddress,
  userAgent
}));
```

### 4. Timing Attack Prevention ✅

**Problem:** Attackers can measure response times to determine if users exist.

**Solution: Constant-Time Operations**

```typescript
async login(email: string, password: string) {
  // Store start time
  const startTime = Date.now();
  const MIN_RESPONSE_TIME = 500; // Always 500ms minimum
  
  try {
    // ALWAYS perform database lookup
    const user = await db('users').where({ email }).first();
    
    // ALWAYS perform bcrypt comparison (use dummy hash if user doesn't exist)
    const passwordHash = user?.password_hash || this.DUMMY_HASH;
    const valid = await bcrypt.compare(password, passwordHash);
    
    // Add random jitter (0-50ms) to prevent statistical analysis
    const jitter = crypto.randomInt(0, 50);
    await this.delay(jitter);
    
    // Check if login should succeed
    if (!user || !valid) {
      // Ensure minimum response time
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      throw new Error('Invalid credentials');
    }
    
    // Success - still ensure minimum time
    const elapsed = Date.now() - startTime;
    if (elapsed < MIN_RESPONSE_TIME) {
      await this.delay(MIN_RESPONSE_TIME - elapsed);
    }
    
    return generateTokens(user);
  } catch (error) {
    // Even errors take minimum time
    const elapsed = Date.now() - startTime;
    if (elapsed < MIN_RESPONSE_TIME) {
      await this.delay(MIN_RESPONSE_TIME - elapsed);
    }
    throw error;
  }
}

// Pre-generate dummy hash for non-existent users
private DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12';

constructor() {
  bcrypt.hash('dummy_password_for_timing_consistency', 10).then(hash => {
    this.DUMMY_HASH = hash;
  });
}
```

**Why This Works:**
1. Always performs same operations (lookup + bcrypt)
2. Adds random jitter to prevent averages
3. Enforces minimum response time
4. Attacker cannot distinguish user exists vs wrong password

### 5. Brute Force Protection ✅

**Multi-Layer Defense:**

**Layer 1: Per-Email Attempts**
```typescript
const key = `failed_auth:${email}`;
const attempts = await redis.incr(key);

if (attempts === 1) {
  await redis.expire(key, 900); // 15 minutes
}

if (attempts >= 5) {
  await redis.setex(`auth_lock:${email}`, 900, 'locked');
  throw new Error('Account locked for 15 minutes');
}
```

**Layer 2: Per-IP Attempts**
```typescript
const ipKey = `failed_auth_ip:${ipAddress}`;
const ipAttempts = await redis.incr(ipKey);

if (ipAttempts >= 10) {
  throw new Error('Too many attempts from this IP');
}
```

**Layer 3: Account Lockout**
```sql
UPDATE users 
SET locked_until = NOW() + INTERVAL '15 minutes',
    failed_login_attempts = failed_login_attempts + 1
WHERE email = $1;
```

**Protection Levels:**
- 5 attempts per email per 15 minutes
- 10 attempts per IP per 15 minutes
- Account locks for 15 minutes after 5 failures
- Automatic unlock after timeout

**Clear on Success:**
```typescript
await redis.del(`failed_auth:${email}`);
await redis.del(`auth_lock:${email}`);
await db('users').where({ email }).update({ failed_login_attempts: 0 });
```

### 6. Rate Limiting ✅

**Implementation:** Redis-backed rate limiters

**Levels:**

**Global Rate Limit:**
```typescript
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window
  message: 'Too many requests from this IP'
});
```

**Login Rate Limit:**
```typescript
const loginRateLimiter = new RateLimiter('login', {
  points: 5,           // 5 attempts
  duration: 60,        // per minute
  blockDuration: 900   // block for 15 minutes
});
```

**Registration Rate Limit:**
```typescript
const registrationRateLimiter = new RateLimiter('register', {
  points: 3,           // 3 registrations
  duration: 300,       // per 5 minutes
  blockDuration: 3600  // block for 1 hour
});
```

**Password Reset Rate Limit:**
```typescript
const passwordResetRateLimiter = new RateLimiter('password-reset', {
  points: 3,           // 3 attempts
  duration: 3600,      // per hour
  blockDuration: 3600  // block for 1 hour
});
```

**Custom Rate Limiter Class:**
```typescript
export class RateLimiter {
  async consume(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const currentPoints = await redis.incr(fullKey);
    
    if (currentPoints === 1) {
      await redis.expire(fullKey, this.options.duration);
    }
    
    if (currentPoints > this.options.points) {
      const blockKey = `${fullKey}:block`;
      await redis.setex(blockKey, this.options.blockDuration, '1');
      
      throw new RateLimitError('Rate limit exceeded', this.options.blockDuration);
    }
  }
}
```

### 7. Session Management ✅

**Multi-Device Support:**

Each user can have multiple active sessions:
```typescript
interface UserSession {
  id: UUID;
  user_id: UUID;
  ip_address: string;
  user_agent: string;
  started_at: Date;
  ended_at?: Date;
  revoked_at?: Date;
}
```

**Session Creation:**
```typescript
await db('user_sessions').insert({
  user_id: userId,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  started_at: new Date()
});
```

**Session Tracking:**
- IP address
- User agent (device info)
- Start/end timestamps
- Revocation tracking

**Session Operations:**

**List Active Sessions:**
```sql
SELECT * FROM user_sessions
WHERE user_id = $1
  AND ended_at IS NULL
  AND expires_at > NOW()
ORDER BY started_at DESC;
```

**Revoke Single Session:**
```sql
UPDATE user_sessions
SET revoked_at = NOW()
WHERE id = $1 AND user_id = $2;
```

**Revoke All Sessions (Logout All Devices):**
```sql
UPDATE user_sessions
SET revoked_at = NOW()
WHERE user_id = $1
  AND revoked_at IS NULL;
```

**Redis Session Cache:**
```typescript
await redis.setex(
  `session:${sessionId}`,
  86400,  // 24 hours
  JSON.stringify({
    userId,
    ipAddress,
    userAgent,
    createdAt: Date.now()
  })
);
```

### 8. Audit Logging ✅

**All Security Events Logged:**

```typescript
export interface AuditEvent {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  status: 'success' | 'failure';
  errorMessage?: string;
}
```

**Logged Events:**
- Login attempts (success/failure)
- Registration
- Password changes
- Password reset requests
- MFA enable/disable
- Role grants/revokes
- Session creation/revocation
- Profile updates
- OAuth connections
- Wallet connections

**Example Audit Log:**
```typescript
await auditService.log({
  userId: 'user-123',
  action: 'user.login',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  status: 'success',
  metadata: {
    method: 'password',
    mfaUsed: true
  }
});
```

**Storage:**
- Database: audit_logs table (permanent)
- Logs: Winston structured logging (rotated)

**Compliance:**
- GDPR: Track data access/changes
- Security: Forensic investigation
- Audit: Regulatory requirements

### 9. Password Security ✅

**Password Requirements:**

**Minimum Standards:**
- Length: 8-128 characters (12+ recommended)
- Must contain: uppercase, lowercase, number, special character
- No more than 2 repeated characters
- Not in common password list

**Validation Implementation:**
```typescript
validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Must contain uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Must contain lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Must contain number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Must contain special character');
  }
  
  // Check common passwords
  const commonPasswords = [
    'password123', '12345678', 'qwerty123', 'letmein',
    'welcome123', 'admin123', 'root1234'
  ];
  
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common');
  }
  
  // Check for repeated characters
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Cannot contain more than 2 repeated characters');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

**Password Hashing:**

**Production: bcrypt (10 rounds)**
```typescript
const passwordHash = await bcrypt.hash(password, 10);
```

**Alternate: argon2id (security-enhanced.service.ts)**
```typescript
const passwordHash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 4
});
```

**Why bcrypt in production?**
- Industry standard
- Proven security record
- Automatic salt generation
- Adjustable work factor

**Why argon2 as alternate?**
- Winner of Password Hashing Competition
- More memory-intensive (resistant to GPU attacks)
- Better against side-channel attacks
- Modern algorithm

### 10. MFA (Multi-Factor Authentication) ✅

**TOTP Implementation (Time-Based One-Time Password)**

**Setup Process:**

**1. Generate Secret:**
```typescript
const secret = speakeasy.generateSecret({
  name: `TicketToken (${user.email})`,
  issuer: 'TicketToken',
  length: 32
});
```

**2. Generate QR Code:**
```typescript
const qrCode = await QRCode.toDataURL(secret.otpauth_url);
```

**3. Generate Backup Codes:**
```typescript
generateBackupCodes(): string[] {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

// Hash before storage
const hashedCodes = backupCodes.map(code => 
  crypto.createHash('sha256').update(code).digest('hex')
);
```

**4. Store Encrypted:**
```typescript
// Encrypt MFA secret before storage
private encrypt(text: string): string {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(JWT_SECRET).slice(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}
```

**Verification Process:**

**1. Verify TOTP Token:**
```typescript
const verified = speakeasy.totp.verify({
  secret: decryptedSecret,
  encoding: 'base32',
  token: userProvidedToken,
  window: 2  // ±60 seconds tolerance
});
```

**2. Prevent Replay Attacks:**
```typescript
const recentKey = `mfa:recent:${userId}:${token}`;
const recentlyUsed = await redis.get(recentKey);

if (recentlyUsed) {
  throw new Error('MFA token recently used');
}

// Mark token as used for 90 seconds
await redis.setex(recentKey, 90, '1');
```

**Backup Code Verification:**
```typescript
async verifyBackupCode(userId: string, code: string): Promise<boolean> {
  const user = await db('users').where({ id: userId }).first();
  
  const backupCodes = JSON.parse(user.backup_codes);
  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
  const codeIndex = backupCodes.indexOf(hashedCode);
  
  if (codeIndex === -1) {
    return false;
  }
  
  // Remove used code (one-time use)
  backupCodes.splice(codeIndex, 1);
  
  await db('users').where({ id: userId }).update({
    backup_codes: JSON.stringify(backupCodes)
  });
  
  return true;
}
```

**MFA Requirements:**
- Sensitive operations require recent MFA verification
- MFA verification cached for 5 minutes
- Operations requiring MFA: withdraw funds, update bank details, delete venue, disable MFA

```typescript
async requireMFAForOperation(userId: string, operation: string): Promise<void> {
  const sensitiveOperations = [
    'withdraw:funds',
    'update:bank-details',
    'delete:venue',
    'export:customer-data',
    'disable:mfa'
  ];
  
  if (sensitiveOperations.includes(operation)) {
    const recentMFA = await redis.get(`mfa:verified:${userId}`);
    if (!recentMFA) {
      throw new Error('MFA required for this operation');
    }
  }
}
```

---

## SECURITY

### CSRF Protection ✅ (NEW - v1.1.0)

**Implementation:** Cookie-based CSRF tokens with signed cookies

**How It Works:**
```typescript
// Configured in app.ts
await app.register(csrf, {
  cookieOpts: { 
    signed: true,
    sameSite: 'strict',
    httpOnly: true,
    secure: env.NODE_ENV === 'production'
  }
});
```

**Protection:**
- All state-changing requests (POST, PUT, DELETE) require valid CSRF token
- Token stored in signed cookie (prevents tampering)
- SameSite=strict prevents cross-origin token theft
- HttpOnly prevents JavaScript access

**Error Handling:**
```typescript
// CSRF errors return 403
{
  "success": false,
  "error": "Invalid or missing CSRF token",
  "code": "CSRF_ERROR"
}
```

**Client Implementation:**
```javascript
// Client must include CSRF token in requests
const response = await fetch('/auth/profile', {
  method: 'PUT',
  credentials: 'include',  // Include cookies
  headers: {
    'X-CSRF-Token': csrfToken  // Token from cookie
  }
});
```

### Tenant Validation ✅ (NEW - v1.1.0)

**Implementation:** Middleware + database query filters

**Tenant Middleware:**
```typescript
// src/middleware/tenant.middleware.ts
export async function validateTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authRequest = request as AuthenticatedRequest;

  // Ensure tenant_id exists in JWT
  if (!authRequest.user.tenant_id) {
    return reply.status(403).send({
      success: false,
      error: 'Invalid tenant context',
      code: 'MISSING_TENANT_ID'
    });
  }
}
```

**Database Query Filters:**
```typescript
// Profile controller now includes tenant_id
const user = await db('users')
  .where({ id: userId, tenant_id: tenantId })
  .whereNull('deleted_at')
  .first();

// Session controller validates tenant membership
const sessions = await db('user_sessions')
  .where({ user_id: userId })
  .whereIn('user_id', function() {
    this.select('id').from('users').where({ tenant_id: tenantId });
  })
  .whereNull('revoked_at');
```

**Cross-Tenant Protection:**
- Every authenticated query filters by tenant_id
- Profile endpoints: ✅ Validated
- Session endpoints: ✅ Validated
- User cannot access data from different tenant
- Prevents data leakage across organizations

**Tenant Isolation Errors:**
```typescript
// Attempting cross-tenant access returns 403
{
  "success": false,
  "error": "Cross-tenant access denied",
  "code": "TENANT_ISOLATION_VIOLATION"
}
```

### Authentication Security

**JWT Security (RS256):**
- 4096-bit RSA keys
- Public key validation (services don't need private key)
- Token rotation on refresh
- Family tracking for theft detection
- Token blacklist on logout

**Password Security:**
- bcrypt hashing (10 rounds)
- Argon2id available (64MB, timeCost 3)
- Timing attack prevention (constant 500ms)
- Strength validation (8+ chars, complexity)
- Common password blocking

**Brute Force Protection:**
- 5 attempts per 15 minutes per email
- 10 attempts per 15 minutes per IP
- Account lockout for 15 minutes
- Automatic unlock after timeout

**Rate Limiting:**
- Login: 5/min
- Registration: 3/5min
- Password reset: 3/hour
- Global: 100/15min

### Authorization Security

**Role-Based Access Control (RBAC):**
```typescript
interface Role {
  name: string;
  permissions: string[];
  venueScoped: boolean;
}

// Roles defined
const roles = {
  'venue-owner': { permissions: ['*'], venueScoped: true },
  'venue-manager': { permissions: ['events:*', 'tickets:*', 'reports:*'], venueScoped: true },
  'box-office': { permissions: ['tickets:sell', 'payments:process'], venueScoped: true },
  'door-staff': { permissions: ['tickets:validate'], venueScoped: true },
  'customer': { permissions: ['tickets:purchase', 'tickets:view-own'], venueScoped: false }
};
```

**Permission Checking:**
```typescript
async checkPermission(userId: string, permission: string, venueId?: string): Promise<boolean> {
  const userPermissions = await this.getUserPermissions(userId, venueId);
  
  // Check wildcard
  if (userPermissions.includes('*')) {
    return true;
  }
  
  // Check specific permission
  return userPermissions.includes(permission);
}
```

**Venue-Scoped Permissions:**
- Permissions tied to specific venues
- User can have different roles at different venues
- Expiration support for temporary access

### Data Protection

**PII Sanitization:**
```typescript
// Uses @tickettoken/shared/PIISanitizer
import { PIISanitizer } from '@tickettoken/shared';

// Automatically sanitizes logs
logger.info('User login', PIISanitizer.sanitize({
  email: 'user@example.com',  // → 'u***@example.com'
  password: 'secret123'        // → '[REDACTED]'
}));
```

**Encrypted Fields:**
- MFA secrets: AES-256-GCM encryption
- Backup codes: SHA-256 hashing
- Password reset tokens: Secure random bytes

**Database Security:**
- Prepared statements (prevent SQL injection)
- Connection pooling
- Read replicas support (planned)
- Encrypted at rest (infrastructure level)

### Network Security

**Helmet.js Security Headers:**
```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

**CORS Configuration:**
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true
}));
```

**XSS Protection:**
```typescript
// Input sanitization
const cleanInput = (obj: any): any => {
  if (typeof obj === 'string') {
    return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }
  // Recursively clean objects
  return obj;
};
```

**MongoDB Injection Prevention:**
```typescript
app.use(mongoSanitize({
  replaceWith: '_'
}));
```

---

## MONITORING & OBSERVABILITY

### Health Checks

**Basic Health Check:**
```http
GET /health

Response: 200
{
  "status": "healthy",
  "service": "auth-service",
  "timestamp": "2025-01-15T12:00:00Z"
}
```

**Enhanced Health Check:**
```typescript
async performHealthCheck(): Promise<HealthCheckResult> {
  const checks = await Promise.all([
    this.checkDatabase(),
    this.checkRedis(),
    this.checkMemory()
  ]);
  
  const [database, redis, memory] = checks;
  const allHealthy = checks.every(check => check.status === 'ok');
  
  return {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    service: 'auth-service',
    version: '1.0.0',
    uptime: process.uptime(),
    checks: { database, redis, memory }
  };
}
```

**Database Health:**
```typescript
private async checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return {
      status: 'ok',
      latency: Date.now() - start,
      details: {
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingConnections: pool.waitingCount
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
}
```

**Redis Health:**
```typescript
private async checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await redis.ping();
    return {
      status: 'ok',
      latency: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
}
```

### Prometheus Metrics

**Available Metrics:**

```
# Login attempts
auth_login_attempts_total{status="success"} 1250
auth_login_attempts_total{status="failure"} 25

# Registrations
auth_registrations_total{status="success"} 150
auth_registrations_total{status="failure"} 5

# Token refreshes
auth_token_refresh_total{status="success"} 5000

# Operation duration
auth_operation_duration_seconds{operation="login"} 0.520
auth_operation_duration_seconds{operation="register"} 0.780

# Service metrics
auth_service_uptime_seconds 86400
auth_service_memory_heap_used_bytes 45000000
auth_service_db_pool_total 10
auth_service_db_pool_idle 7
auth_service_db_pool_waiting 0
```

**Metrics Endpoint:**
```http
GET /metrics

Response: 200 (text/plain)
# HELP auth_login_attempts_total Total login attempts
# TYPE auth_login_attempts_total counter
auth_login_attempts_total{status="success"} 1250
...
```

### Logging (Winston)

**Structured Logging:**
```typescript
logger.info('User login', {
  userId: 'user-123',
  email: 'u***@example.com',  // PII sanitized
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  duration: 520,
  mfaUsed: true
});
```

**Log Levels:**
- **debug:** Detailed debugging info
- **info:** General information (default)
- **warn:** Warning messages
- **error:** Error messages with stack traces

**PII Sanitization:**
All logs automatically sanitized using @tickettoken/shared:
- Emails: user@example.com → u***@example.com
- Passwords: [REDACTED]
- Tokens: [REDACTED]
- Credit cards: [REDACTED]

**Log Format (Production):**
```json
{
  "level": "info",
  "time": "2025-01-15T12:00:00.000Z",
  "service": "auth-service",
  "component": "AuthController",
  "msg": "User login successful",
  "userId": "user-123",
  "duration": 520
}
```

**Log Format (Development):**
```
[12:00:00] INFO (AuthController): User login successful
  userId: user-123
  duration: 520ms
```

### Audit Trail

**Audit Log Table:**
```sql
SELECT 
  id,
  user_id,
  action,
  ip_address,
  user_agent,
  status,
  created_at
FROM audit_logs
WHERE user_id = 'user-123'
ORDER BY created_at DESC
LIMIT 50;
```

**Sample Audit Events:**
```json
[
  {
    "action": "user.login",
    "status": "success",
    "ipAddress": "192.168.1.1",
    "timestamp": "2025-01-15T12:00:00Z"
  },
  {
    "action": "user.password_changed",
    "status": "success",
    "ipAddress": "192.168.1.1",
    "timestamp": "2025-01-15T11:00:00Z"
  },
  {
    "action": "user.mfa_enabled",
    "status": "success",
    "timestamp": "2025-01-14T10:00:00Z"
  }
]
```

---

## ERROR HANDLING

### Error Classes

**Base Error:**
```typescript
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

**Specific Errors:**
```typescript
export class ValidationError extends AppError {
  public errors: any[];
  constructor(errors: any[]) {
    super('Validation failed', 422);
    this.errors = errors;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class RateLimitError extends AppError {
  public ttl?: number;
  constructor(message: string, ttl?: number) {
    super(message, 429);
    this.ttl = ttl;
  }
}

export class TokenError extends AppError {
  constructor(message = 'Invalid or expired token') {
    super(message, 401);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}
```

### Error Response Format

```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "email",
      "message": "Please provide a valid email address"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters"
    }
  ],
  "timestamp": "2025-01-15T12:00:00Z",
  "path": "/auth/register"
}
```

### Common Error Codes

**Authentication (401):**
- `AUTH_REQUIRED` - No token provided
- `INVALID_TOKEN` - JWT signature invalid
- `TOKEN_EXPIRED` - JWT expired
- `INVALID_CREDENTIALS` - Wrong email/password
- `MFA_REQUIRED` - MFA code needed
- `INVALID_MFA_TOKEN` - Wrong MFA code

**Authorization (403):**
- `FORBIDDEN` - Insufficient permissions
- `MISSING_PERMISSION` - Specific permission required
- `VENUE_ACCESS_DENIED` - No access to venue

**Validation (422):**
- `VALIDATION_ERROR` - Input validation failed
- `WEAK_PASSWORD` - Password doesn't meet requirements
- `INVALID_EMAIL` - Email format invalid

**Conflict (409):**
- `EMAIL_ALREADY_REGISTERED` - Email taken
- `USERNAME_TAKEN` - Username already exists
- `WALLET_ALREADY_CONNECTED` - Wallet linked to another account

**Rate Limiting (429):**
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `ACCOUNT_LOCKED` - Too many failed login attempts

**Server (500):**
- `INTERNAL_ERROR` - Unexpected server error
- `DATABASE_ERROR` - Database connection failed
- `REDIS_ERROR` - Redis connection failed

---

## TESTING

### Test Structure

```
tests/
├── endpoints/           # API integration tests
│   └── auth-endpoints.test.ts
├── integration/         # Full flow tests
│   └── auth-flow.test.ts
├── fixtures/            # Test data
│   └── users.ts
├── mocks/              # Database mocks
│   └── database.ts
└── setup.ts            # Test configuration
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Security tests only
npm run test:security

# Integration tests
npm run test:integration

# Verbose output
npm run test:verbose
```

### Test Coverage Targets

```
Branches:   80%
Functions:  80%
Lines:      80%
Statements: 80%
```

### Example Test

```typescript
describe('POST /auth/register', () => {
  it('should create a new user', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User'
      });
    
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('test@example.com');
    expect(response.body.data.tokens.accessToken).toBeDefined();
  });
  
  it('should reject weak password', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'weak',
        firstName: 'Test',
        lastName: 'User'
      });
    
    expect(response.status).toBe(422);
    expect(response.body.error).toContain('Password');
  });
});
```

---

## DEPLOYMENT

### Environment Variables

**Critical Variables (.env.example):**

```bash
# Service
NODE_ENV=production
PORT=3001
SERVICE_NAME=auth-service

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=<CHANGE_ME>

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<CHANGE_ME>

# JWT (CRITICAL - Must be different!)
JWT_ACCESS_SECRET=<256_BIT_SECRET>  # Min 32 chars
JWT_REFRESH_SECRET=<256_BIT_SECRET> # Min 32 chars, DIFFERENT from access
JWT_ISSUER=api.tickettoken.com
JWT_ACCESS_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d

# RSA Keys (RS256)
JWT_PRIVATE_KEY_PATH=~/tickettoken-secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=~/tickettoken-secrets/jwt-public.pem

# Security
BCRYPT_ROUNDS=10
LOCKOUT_MAX_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15

# MFA
MFA_ISSUER=TicketToken
MFA_WINDOW=2

# OAuth (Optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
```

### Docker

**Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install --legacy-peer-deps --production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start service
CMD ["node", "dist/index.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  auth-service:
    build: ./auth-service
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - redis
    volumes:
      - ~/tickettoken-secrets:/root/tickettoken-secrets:ro
    restart: unless-stopped
  
  postgres:
    image: postgres:16
    environment:
      - POSTGRES_DB=tickettoken_db
      - POSTGRES_PASSWORD=postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass your_redis_password

volumes:
  postgres_data:
```

### Database Migrations

```bash
# Run migrations
npm run migrate

# Create new migration
npm run migrate:make add_new_column

# Rollback last migration
npm run migrate:rollback

# Check migration status
npm run migrate:status
```

### Startup Checklist

**Pre-Deployment:**
- [ ] RSA keys generated and secured
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Redis accessible
- [ ] JWT secrets different (access vs refresh)
- [ ] JWT secrets minimum 32 characters
- [ ] All tests passing
- [ ] No unused code/services

**Post-Deployment:**
- [ ] Health check returns 200
- [ ] Can register new user
- [ ] Can login
- [ ] JWT validation works
- [ ] Redis cache working
- [ ] Metrics endpoint accessible
- [ ] Logs properly formatted

---

## TECHNICAL DEBT & ISSUES

### Known Issues

**1. Framework Mismatch ⚠️**

**Problem:**
- Express.js running in production (src/index.ts)
- Fastify route files exist but unused (src/routes/*.routes.ts)
- Controllers use Fastify types but called from Express

**Files Affected:**
- src/index.ts (Express server)
- src/routes/auth.routes.ts (Fastify, unused)
- src/controllers/*.controller.ts (Fastify types)

**Impact:**
- Code confusion
- Inconsistent with other services (venue-service uses Fastify)
- Cannot use Fastify plugins/ecosystem

**Solution:**
Complete migration to Fastify (planned):
1. Replace Express server with Fastify
2. Use existing Fastify routes
3. Update controllers to match
4. Test all endpoints
5. Delete Express code

**2. Duplicate Services ⚠️**

**Problem:**
- auth-secure.service.ts (unused alternate)
- enhanced-jwt.service.ts (unused alternate)
- security-enhanced.service.ts (unused, only used by auth-secure)

**Why They Exist:**
- Different implementation approaches
- Testing alternatives
- Never cleaned up

**Impact:**
- Code confusion
- Maintenance burden
- Takes up space

**Solution:**
Delete unused services during Fastify migration

**3. DI Container Not Used ⚠️**

**Problem:**
- Awilix container configured (src/config/dependencies.ts)
- Express server manually instantiates services (src/index.ts)
- Container never used

**Code:**
```typescript
// dependencies.ts - configured but unused
container.register({
  jwtService: asClass(JWTService).singleton(),
  authService: asClass(AuthService).singleton(),
  // ...
});

// index.ts - manual instantiation instead
const jwtService = new JWTService();
const authService = new AuthService(jwtService);
```

**Impact:**
- Cannot leverage DI benefits
- Manual wiring error-prone
- Inconsistent with venue-service

**Solution:**
Switch to Fastify which properly uses DI container

**4. Missing Tenant Validation ⚠️**

**Problem:**
- Profile endpoints don't validate tenant context
- Session endpoints don't filter by tenant
- User can potentially access cross-tenant data

**Vulnerable Endpoints:**
```typescript
// WRONG - No tenant validation
app.get('/auth/profile', requireAuth, async (req, res) => {
  const user = await db('users').where({ id: req.user.id }).first();
  // Missing: .where({ tenant_id: req.user.tenant_id })
});
```

**Impact:**
- Potential cross-tenant data leakage
- Security vulnerability
- Compliance issue

**Solution:**
Add tenant middleware to ALL authenticated routes:
```typescript
const addTenantContext = async (request) => {
  const tenantId = request.user?.tenant_id;
  request.tenantId = tenantId;
};

// Then validate in all queries
const user = await db('users')
  .where({ id: userId, tenant_id: tenantId })
  .first();
```

**5. No Comprehensive Tests ⚠️**

**Problem:**
- Only basic integration tests exist
- Missing unit tests for services
- Low test coverage (~30%)

**Impact:**
- Regression risks
- Hard to refactor safely
- Bugs slip through

**Solution:**
Add comprehensive test suite:
- Unit tests for all services
- Integration tests for all endpoints
- Security tests (timing attacks, brute force)
- Load tests

**6. Dead Code**

**Problem:**
- Unused route files (profile.routes.ts, session.routes.ts - just stubs)
- Multiple unused service files
- Commented out code

**Solution:**
Clean up during Fastify migration

---

## TROUBLESHOOTING

### Common Issues

**1. "Failed to load JWT keys"**

**Symptom:**
```
✗ Failed to load JWT keys: ENOENT: no such file or directory
```

**Cause:** RSA keys not generated

**Solution:**
```bash
mkdir -p ~/tickettoken-secrets
openssl genrsa -out ~/tickettoken-secrets/jwt-private.pem 4096
openssl rsa -in ~/tickettoken-secrets/jwt-private.pem -pubout -out ~/tickettoken-secrets/jwt-public.pem
```

**2. "Invalid token"**

**Symptom:**
```json
{
  "error": "Invalid token",
  "code": "INVALID_TOKEN"
}
```

**Possible Causes:**
- Token expired (check exp claim)
- Wrong public key used for verification
- Token from different environment
- Token blacklisted (user logged out)

**Debug:**
```bash
# Decode token (without verification)
node -e "console.log(JSON.stringify(require('jsonwebtoken').decode('YOUR_TOKEN'), null, 2))"

# Check expiry
node -e "const jwt = require('jsonwebtoken'); const decoded = jwt.decode('YOUR_TOKEN'); console.log('Expires:', new Date(decoded.exp * 1000))"
```

**3. "Account locked"**

**Symptom:**
```json
{
  "error": "Account locked due to too many failed attempts",
  "code": "ACCOUNT_LOCKED"
}
```

**Cause:** Too many failed login attempts (5 in 15 minutes)

**Solution (Manual Unlock):**
```bash
# Connect to Redis
redis-cli

# Check lock status
GET auth_lock:user@example.com

# Remove lock (if needed for testing)
DEL auth_lock:user@example.com
DEL failed_auth:user@example.com
```

**Solution (Database):**
```sql
UPDATE users 
SET locked_until = NULL, 
    failed_login_attempts = 0 
WHERE email = 'user@example.com';
```

**4. "Rate limit exceeded"**

**Symptom:**
```json
{
  "error": "Too many requests. Try again in 300 seconds",
  "code": "RATE_LIMIT_EXCEEDED",
  "ttl": 300
}
```

**Cause:** Hit rate limit (5 login attempts/min, 3 registrations/5min, etc.)

**Solution:**
Wait for TTL to expire, or clear manually:
```bash
redis-cli
DEL rate:login:192.168.1.1
```

**5. "MFA token recently used"**

**Symptom:**
```json
{
  "error": "MFA token recently used",
  "code": "MFA_TOKEN_REUSED"
}
```

**Cause:** Replay attack prevention - same token used within 90 seconds

**Solution:** Wait 90 seconds and generate new token from authenticator app

**6. "Nonce expired or not found"**

**Symptom:** Wallet login fails with nonce error

**Cause:**
- Nonce older than 5 minutes
- Nonce already used
- Redis connection issue

**Solution:**
Get new nonce: `GET /auth/wallet/nonce/:address`

**7. "Database connection failed"**

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Debug Checklist:**
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Check connection string
echo $DATABASE_URL

# Test direct connection
psql -h localhost -U postgres -d tickettoken_db

# Check pool status
curl http://localhost:3001/health
```

**8. "Redis connection failed"**

**Symptom:**
```
Error: Redis connection to localhost:6379 failed
```

**Debug:**
```bash
# Check Redis is running
redis-cli ping

# Check password
redis-cli -a your_password ping

# Test connection
telnet localhost 6379
```

**9. "Timing attack prevention too slow"**

**Symptom:** Login takes exactly 500ms every time

**Cause:** This is INTENTIONAL for security

**Not a Bug:** Constant-time operations prevent timing attacks

**10. "Session not found"**

**Symptom:**
```json
{
  "error": "Session not found",
  "code": "SESSION_NOT_FOUND"
}
```

**Causes:**
- Session expired (24 hour TTL)
- Session revoked (user logged out)
- Redis data lost

**Solution:** User needs to login again

---

## COMPARISON WITH OTHER SERVICES

| Feature | Auth Service | Payment Service | Venue Service |
|---------|-------------|-----------------|---------------|
| **Framework** | Express ⚠️ | Express ✅ | Fastify ✅ |
| **DI Container** | Awilix (unused) ⚠️ | Manual ⚠️ | Awilix ✅ |
| **Database** | Knex + Pool ✅ | Knex ✅ | Knex ✅ |
| **Cache** | Redis + Shared ✅ | Redis ✅ | Redis + Shared ✅ |
| **JWT** | RS256 ✅ | RS256 ✅ | RS256 ✅ |
| **Multi-tenant** | tenant_id ✅ | tenant_id ✅ | tenant_id ✅ |
| **Rate Limiting** | Multi-level ✅ | Multi-level ✅ | Multi-level ✅ |
| **Monitoring** | Prometheus ✅ | Prometheus ✅ | Full (OTel) ✅ |
| **Error Handling** | AppError ✅ | AppError ✅ | Comprehensive ✅ |
| **Testing** | Basic ⚠️ | Basic ⚠️ | Comprehensive ✅ |
| **Code Quality** | Good ✅ | Good ✅ | Excellent ✅ |
| **Documentation** | Complete ✅ | Complete ✅ | Complete ✅ |
| **Complexity** | Very High 🔴 | Very High 🔴 | Medium 🟡 |
| **Blast Radius** | CRITICAL 🔴 | HIGH 🔴 | MEDIUM 🟡 |
| **Source Files** | 59 files | 129 files | 56 files |

**Auth-service is MORE critical than payment-service because:**
- Payment affects money; Auth affects EVERYTHING
- If payment is down: users can't buy tickets (bad)
- If auth is down: NOTHING works platform-wide (catastrophic)
- All 21 services depend on auth for JWT validation

**Auth-service should adopt from venue-service:**
- Fastify framework (consistent with platform)
- Proper DI container usage
- OpenTelemetry tracing
- Circuit breakers
- Comprehensive testing

**Recommendation:** Keep Express for now (too risky to refactor critical auth service). Apply Fastify + best practices to NEW services only.

---

## API CHANGE GUIDELINES

### ✅ SAFE Changes (Won't Break Clients)

**1. Add new optional fields to request bodies**
```typescript
// BEFORE
interface RegisterRequest {
  email: string;
  password: string;
}

// AFTER (safe)
interface RegisterRequest {
  email: string;
  password: string;
  referralCode?: string;  // ← Optional, safe
}
```

**2. Add new fields to response bodies**
```typescript
// Clients ignore unknown fields
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "newField": "value"  // ← Safe to add
  }
}
```

**3. Add new endpoints**
```typescript
// POST /auth/biometric/verify ← New endpoint, safe
```

**4. Change internal service logic**
- Switch from bcrypt to argon2 (as long as both work)
- Improve caching strategy
- Optimize database queries

**5. Add database indexes**
```sql
CREATE INDEX idx_users_last_login ON users(last_login_at);
```

**6. Improve error messages**
```typescript
// BEFORE: "Invalid input"
// AFTER: "Email must be a valid format" ← More helpful, safe
```

**7. Add new validation rules (for optional fields)**
```typescript
phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional()
```

**8. Change retry/timeout settings**
- Increase connection pool size
- Adjust timeout values

### ⚠️ BREAKING Changes (Require Coordination)

**1. Remove or rename endpoints**
```typescript
// DELETE /auth/legacy-login ← Breaking!
```

**2. Remove fields from responses**
```typescript
{
  "user": {
    "id": "uuid",
    // "email": "removed"  ← Breaking! Clients expect this
  }
}
```

**3. Change field types**
```typescript
// BEFORE
{ "userId": "12345" }

// AFTER
{ "userId": 12345 }  ← Breaking! String → Number
```

**4. Make optional fields required**
```typescript
// BEFORE
phone?: string;

// AFTER
phone: string;  ← Breaking! Now required
```

**5. Change authentication requirements**
```typescript
// Adding auth to previously public endpoint ← Breaking!
```

**6. Change status codes**
```typescript
// BEFORE: 200 on success
// AFTER: 201 on success  ← Breaking! Clients check status codes
```

**7. Change error response format**
```typescript
// BEFORE
{ "error": "Invalid" }

// AFTER
{ "message": "Invalid" }  ← Breaking! Different field name
```

**8. Change JWT payload structure**
```typescript
// BEFORE
{ "sub": "user-id", "role": "customer" }

// AFTER
{ "userId": "user-id", "role": "customer" }  ← Breaking! All services break
```

**9. Change password hashing (without supporting old)**
```typescript
// If you switch to argon2 and remove bcrypt support ← Breaking!
// Must support both during transition
```

### Deprecation Process

**For breaking changes:**

1. **Announce deprecation** (2 months notice)
2. **Run both versions** in parallel
3. **Monitor usage** of deprecated endpoint
4. **Remove old version** after transition period

**Example:**
```typescript
// v1 (deprecated)
app.post('/auth/login', deprecationWarning, oldLoginHandler);

// v2 (new)
app.post('/v2/auth/login', newLoginHandler);

function deprecationWarning(req, res, next) {
  res.setHeader('X-Deprecated', 'This endpoint will be removed on 2025-06-01');
  res.setHeader('X-New-Endpoint', '/v2/auth/login');
  next();
}
```

---

## FUTURE IMPROVEMENTS

### Phase 1: Critical (High Priority)

**1. Complete Fastify Migration**
- Replace Express with Fastify
- Use existing Fastify route files
- Leverage DI container properly
- Update controllers

**2. Add Tenant Validation Middleware**
```typescript
const validateTenant = async (request: FastifyRequest, reply: FastifyReply) => {
  const userTenantId = request.user.tenant_id;
  const resourceTenantId = await getResourceTenant(request.params.id);
  
  if (userTenantId !== resourceTenantId) {
    throw new AuthorizationError('Cross-tenant access denied');
  }
};
```

**3. Implement Comprehensive Testing**
- Unit tests for all services (target: 80% coverage)
- Integration tests for all endpoints
- Security tests (timing attacks, brute force)
- Load tests (1000+ requests/sec)

**4. Clean Up Unused Code**
- Delete auth-secure.service.ts
- Delete enhanced-jwt.service.ts
- Delete security-enhanced.service.ts
- Remove dead route files

**5. Add CSRF Protection**
```typescript
app.use(csrfProtection({
  cookie: true,
  value: (req) => req.headers['x-csrf-token']
}));
```

### Phase 2: Security Enhancements (Medium Priority)

**6. WebAuthn/FIDO2 Support**
- Passwordless authentication
- Hardware key support (YubiKey)
- Platform authenticators (Touch ID, Windows Hello)

**7. Risk-Based Authentication**
```typescript
interface RiskScore {
  deviceTrust: number;      // 0-100
  locationAnomaly: number;  // 0-100
  velocityAnomaly: number;  // 0-100
  overall: number;          // Weighted average
}

// High risk → Require MFA
if (riskScore.overall > 70) {
  requireMFA();
}
```

**8. Anomaly Detection**
- Impossible travel detection
- Device fingerprint changes
- Unusual access patterns
- ML-based threat detection

**9. Session Analytics**
- Active sessions dashboard
- Concurrent sessions limit
- Suspicious session alerts
- Geographic session map

**10. Enhanced Audit Logging**
- Detailed request/response logging
- Query parameter tracking
- Failed authorization attempts
- Admin action tracking

### Phase 3: Feature Additions (Nice to Have)

**11. Passwordless Authentication**
- Magic link emails
- SMS one-time codes
- Email one-time codes

**12. Additional OAuth Providers**
- Facebook
- Twitter
- GitHub
- Microsoft

**13. SAML/SSO Support**
- Enterprise SSO
- SAML 2.0 protocol
- Azure AD integration
- Okta integration

**14. Improved Biometric**
- Passkeys (WebAuthn)
- Advanced biometric options
- Multi-device sync

**15. Account Linking**
- Link multiple auth methods
- Social account linking
- Wallet linking improvements

### Phase 4: Infrastructure (Operations)

**16. OpenTelemetry Tracing**
- Distributed tracing
- Request flow visualization
- Performance bottleneck identification

**17. Circuit Breakers**
```typescript
const breaker = new CircuitBreaker(loginFunction, {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});
```

**18. Retry Logic with Exponential Backoff**
```typescript
await retry(operation, {
  retries: 3,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 10000
});
```

**19. Read Replicas**
- Separate read/write database connections
- Load balance read queries
- Improve scalability

**20. Key Rotation**
- Automated JWT key rotation
- Zero-downtime key updates
- Multiple active keys (keyid support)

---

## CONTACT & SUPPORT

### Service Ownership

**Service Owner:** Platform Team  
**Primary Contact:** Auth Service Team  
**Slack Channel:** #auth-service  
**On-Call Rotation:** PagerDuty - Auth Team

### Documentation

**This Document:** `backend/services/auth-service/SERVICE_DOCUMENTATION.md`  
**API Docs:** Swagger UI at `/docs` (when enabled)  
**Architecture Diagrams:** `docs/architecture/auth-service/`  
**Runbooks:** `docs/runbooks/auth-service/`

### Support Levels

**P0 - Critical (Page Immediately):**
- Service completely down
- No users can login
- JWT validation failing platform-wide
- Database connection lost
- Security breach detected

**P1 - High (Page During Business Hours):**
- High error rate (>5%)
- Performance degradation (>2s response time)
- MFA not working
- OAuth providers failing

**P2 - Medium (Create Ticket):**
- Single feature broken (e.g., password reset)
- Minor bugs
- Documentation updates needed

**P3 - Low (Backlog):**
- Feature requests
- Performance optimizations
- Code cleanup

### Escalation Path

1. **On-Call Engineer** (PagerDuty)
2. **Platform Team Lead**
3. **Engineering Manager**
4. **CTO**

### Monitoring & Alerts

**Grafana Dashboard:** https://grafana.tickettoken.com/auth-service  
**Prometheus:** http://localhost:9090/metrics  
**Health Check:** http://localhost:3001/health  
**Logs:** CloudWatch Logs - `/aws/auth-service/`

### Related Services

**Dependencies:**
- PostgreSQL Team: #database
- Redis Team: #redis
- Platform Team: #platform

**Dependent Services:**
Contact if auth-service changes affect them:
- Venue Service Team: #venue-service
- Payment Service Team: #payment-service
- Ticket Service Team: #ticket-service

---

## CHANGELOG

### Version 1.0.0 (Current) - January 15, 2025

**Features:**
- Complete authentication system with 6 auth methods
- RS256 JWT with refresh token rotation
- Multi-tenant isolation (tenant_id)
- Brute force protection
- Rate limiting
- MFA (TOTP)
- OAuth (Google, Apple)
- Wallet authentication (Solana, Ethereum)
- Biometric support
- Session management
- RBAC with venue-scoped permissions
- Comprehensive audit logging
- 29 API endpoints

**Technical:**
- Express.js framework
- PostgreSQL database (10+ tables)
- Redis cache
- Awilix DI (configured but unused)
- Winston logging with PII sanitization
- Prometheus metrics
- 59 documented files

**Known Issues:**
- Framework mismatch (Express vs Fastify routes)
- Duplicate unused services
- DI container not utilized
- Missing tenant validation in some endpoints
- Limited test coverage

### Version 0.9.0 - January 1, 2025

**Changes:**
- Migrated from HS256 to RS256 JWT
- Added multi-tenant support (tenant_id)
- Implemented timing attack prevention
- Added device trust scoring
- Enhanced audit logging

### Version 0.8.0 - December 1, 2024

**Changes:**
- Added OAuth support (Google, Apple)
- Implemented wallet authentication
- Added biometric registration
- Enhanced rate limiting

### Version 0.7.0 - November 1, 2024

**Changes:**
- Added MFA (TOTP) support
- Implemented session management
- Added RBAC system
- Enhanced security middleware

### Planned Changes (Next Release - 2.0.0)

**Major:**
- [ ] Complete Fastify migration
- [ ] Add tenant validation middleware
- [ ] Comprehensive test suite
- [ ] Clean up unused services
- [ ] CSRF protection

**Minor:**
- [ ] WebAuthn support
- [ ] Risk-based authentication
- [ ] Additional OAuth providers
- [ ] Enhanced monitoring

**Infrastructure:**
- [ ] OpenTelemetry tracing
- [ ] Circuit breakers
- [ ] Read replicas
- [ ] Automated key rotation

---

## APPENDIX

### A. JWT Payload Reference

**Access Token:**
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "type": "access",
  "jti": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "permissions": [
    "buy:tickets",
    "view:events",
    "transfer:tickets"
  ],
  "role": "customer",
  "exp": 1705007200,
  "iat": 1705000000,
  "iss": "api.tickettoken.com",
  "aud": "api.tickettoken.com"
}
```

**Refresh Token:**
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "type": "refresh",
  "jti": "8d0f7780-8536-51ef-b827-f18gd2g01bf8",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "family": "9e1g8891-9647-62fg-c938-g29he3h12cg9",
  "exp": 1705604800,
  "iat": 1705000000
}
```

### B. Database Schema Summary

**Tables:**
1. users (64 columns)
2. user_sessions
3. user_venue_roles
4. audit_logs
5. invalidated_tokens
6. oauth_connections
7. wallet_connections
8. biometric_credentials
9. trusted_devices
10. tenants

**Total Indexes:** 40+ indexes including GIN and full-text search

### C. Error Code Reference

| Code | Status | Description |
|------|--------|-------------|
| AUTH_REQUIRED | 401 | No token provided |
| INVALID_TOKEN | 401 | JWT invalid/expired |
| INVALID_CREDENTIALS | 401 | Wrong email/password |
| MFA_REQUIRED | 401 | MFA code needed |
| FORBIDDEN | 403 | Insufficient permissions |
| EMAIL_ALREADY_REGISTERED | 409 | Email taken |
| VALIDATION_ERROR | 422 | Input validation failed |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| ACCOUNT_LOCKED | 429 | Too many failed attempts |
| INTERNAL_ERROR | 500 | Server error |

### D. Rate Limit Reference

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login | 5 | 1 minute |
| Registration | 3 | 5 minutes |
| Password Reset | 3 | 1 hour |
| MFA Setup | 3 | 1 hour |
| Global | 100 | 15 minutes |

### E. Security Checklist

**Pre-Production:**
- [ ] RSA keys generated (4096-bit)
- [ ] JWT secrets different (access vs refresh)
- [ ] JWT secrets minimum 32 characters
- [ ] Database migrations applied
- [ ] Redis password set
- [ ] Environment variables secured
- [ ] HTTPS enabled
- [ ] CORS configured
- [ ] Rate limiting active
- [ ] Audit logging enabled
- [ ] Metrics collection working
- [ ] Health checks passing
- [ ] All tests passing

**Post-Production:**
- [ ] Monitor error rates
- [ ] Check login success rate
- [ ] Verify JWT validation works
- [ ] Confirm MFA working
- [ ] Test OAuth flows
- [ ] Validate rate limiting
- [ ] Review audit logs
- [ ] Check performance metrics

---

**END OF DOCUMENTATION**

*This documentation represents the COMPLETE state of auth-service as of January 15, 2025. Keep it updated as the service evolves.*
