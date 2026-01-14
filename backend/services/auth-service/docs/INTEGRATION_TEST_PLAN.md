# Auth Service Integration Test Plan

> **Status:** Planning
> **Prerequisites:** Docker (Postgres + Redis)
> **Estimated Tests:** ~200+

---

## What Integration Tests Cover

Integration tests verify **real interactions within the auth-service**:
- Service → Database (actual SQL queries, transactions, constraints)
- Service → Redis (actual key storage, TTL, atomic operations)
- Service → Service (AuthService → JWTService → Redis)
- Data integrity through the full flow

**NOT covered (that's E2E):**
- Service-to-service (auth → venue)
- API Gateway routing
- Full user journeys across services

---

## Infrastructure Setup

### Docker Compose (`docker-compose.test.yml`)
```yaml
version: '3.8'
services:
  postgres-test:
    image: postgres:15
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: auth_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data  # RAM disk for speed

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    command: redis-server --appendonly no  # Disable persistence for speed
```

### Test Lifecycle
```
globalSetup.ts:
  1. Start Docker containers (if not running)
  2. Wait for healthy connections
  3. Run migrations
  4. Seed default tenant

beforeEach (per test):
  1. BEGIN transaction
  2. Clear Redis keys (FLUSHDB or selective DEL)

afterEach (per test):
  1. ROLLBACK transaction (fast cleanup)

globalTeardown.ts:
  1. Close all connections
  2. (Optional) Stop containers
```

---

## Phase 3 Files: 14 Total

### Services (9 files)

| File | Priority | Tests | What's Tested |
|------|----------|-------|---------------|
| `auth.service.ts` | HIGH | ~27 | Core auth flows |
| `auth-extended.service.ts` | HIGH | ~19 | Password reset, email verify |
| `rbac.service.ts` | MEDIUM | ~10 | Role/permission queries |
| `oauth.service.ts` | MEDIUM | ~18 | Google/GitHub OAuth |
| `wallet.service.ts` | HIGH | ~11 | Full wallet flows (DB parts) |
| `biometric.service.ts` | LOW | ~12 | Challenge-response |
| `device-trust.service.ts` | LOW | ~9 | Device fingerprinting |
| `audit.service.ts` | LOW | ~17 | Audit log insertion |
| `monitoring.service.ts` | LOW | ~14 | Health checks |

### Controllers (5 files)

| File | Priority | Tests | What's Tested |
|------|----------|-------|---------------|
| `auth.controller.ts` | HIGH | ~28 | Register, login, MFA endpoints |
| `auth-extended.controller.ts` | HIGH | ~13 | Password/email endpoints |
| `wallet.controller.ts` | MEDIUM | ~10 | Wallet endpoints |
| `session.controller.ts` | MEDIUM | ~11 | Session management |
| `profile.controller.ts` | MEDIUM | ~20 | Profile & GDPR |

---

## Detailed Test Cases by File

### 1. `services/auth.service.ts` (27 tests) - HIGH PRIORITY

**register()**
| # | Test Case | Verifies |
|---|-----------|----------|
| 1 | Creates user with hashed password | DB insert, bcrypt |
| 2 | Generates access + refresh tokens | JWT + Redis storage |
| 3 | Creates session record | DB insert |
| 4 | Sends verification email | Redis token storage |
| 5 | Rejects duplicate email (409) | Unique constraint |
| 6 | Rejects invalid tenant | Foreign key constraint |
| 7 | Sanitizes firstName/lastName | XSS prevention |
| 8 | Returns correct user shape | Response format |

**login()**
| # | Test Case | Verifies |
|---|-----------|----------|
| 9 | Returns tokens on valid credentials | Full auth flow |
| 10 | Rejects invalid password | bcrypt.compare |
| 11 | Uses dummy hash for nonexistent user | Timing attack prevention |
| 12 | Response time >= 500ms | Timing attack prevention |
| 13 | Increments failed_login_attempts | DB update |
| 14 | Locks account after 5 failures | Lockout logic |
| 15 | Rejects locked account with time | Lockout check |
| 16 | Resets failed attempts on success | DB update |
| 17 | Updates last_login_at | DB update |

**refreshTokens()**
| # | Test Case | Verifies |
|---|-----------|----------|
| 18 | Returns new token pair | Token rotation |
| 19 | Rejects invalid refresh token | JWT verify |
| 20 | Rejects token not in Redis | Revocation check |

**logout()**
| # | Test Case | Verifies |
|---|-----------|----------|
| 21 | Invalidates refresh token | Redis DEL |
| 22 | Ends active session | DB update |

**verifyEmail()**
| # | Test Case | Verifies |
|---|-----------|----------|
| 23 | Updates email_verified on valid token | DB update |
| 24 | Rejects invalid/expired token | Redis lookup |

**forgotPassword() / resetPassword()**
| # | Test Case | Verifies |
|---|-----------|----------|
| 25 | Generates reset token (idempotent) | Redis storage |
| 26 | Constant response regardless of email | Enumeration prevention |
| 27 | Updates password, clears token | DB + Redis |

---

### 2. `services/auth-extended.service.ts` (19 tests) - HIGH PRIORITY

**requestPasswordReset()**
| # | Test Case | Verifies |
|---|-----------|----------|
| 1 | Rate limited (3/hour) | Rate limiter |
| 2 | Returns success for nonexistent email | Enumeration prevention |
| 3 | Sends email for valid user | Email service |
| 4 | Creates audit log | DB insert |

**resetPassword()**
| # | Test Case | Verifies |
|---|-----------|----------|
| 5 | Finds token with tenant prefix | Redis lookup |
| 6 | Finds token without tenant prefix | Fallback |
| 7 | Validates password strength | Validation |
| 8 | Updates password_hash | DB update |
| 9 | Invalidates all refresh tokens | Redis SCAN + DEL |
| 10 | Creates audit log | DB insert |

**verifyEmail()**
| # | Test Case | Verifies |
|---|-----------|----------|
| 11 | Finds token with/without prefix | Redis lookup |
| 12 | Verifies email matches user | Security check |
| 13 | Updates email_verified_at | DB update |

**resendVerificationEmail()**
| # | Test Case | Verifies |
|---|-----------|----------|
| 14 | Rate limited (3/hour) | Rate limiter |
| 15 | Rejects if already verified | Logic check |

**changePassword()**
| # | Test Case | Verifies |
|---|-----------|----------|
| 16 | Verifies current password | bcrypt.compare |
| 17 | Validates new password strength | Validation |
| 18 | Rejects if same as current | Logic check |
| 19 | Invalidates all sessions | DB update |

---

### 3. `services/rbac.service.ts` (10 tests) - MEDIUM PRIORITY

| # | Test Case | Verifies |
|---|-----------|----------|
| 1 | getUserPermissions() returns role-based perms | DB query |
| 2 | getUserVenueRoles() returns all venue roles | DB query |
| 3 | checkPermission() returns true with perm | Logic |
| 4 | checkPermission() checks venue-specific | DB join |
| 5 | venue-owner has all permissions | Role hierarchy |
| 6 | door-staff only has scan:tickets | Role hierarchy |
| 7 | grantVenueRole() creates record | DB insert |
| 8 | grantVenueRole() handles expiration | Date logic |
| 9 | revokeVenueRole() deactivates | DB update |
| 10 | Respects tenant isolation | RLS |

---

### 4. `services/oauth.service.ts` (18 tests) - MEDIUM PRIORITY

**Note:** External API calls (Google/GitHub) will be mocked. DB operations are real.

| # | Test Case | Verifies |
|---|-----------|----------|
| 1-4 | exchangeGoogleCode() | Token verify, profile extract |
| 5-8 | exchangeGitHubCode() | Token exchange, profile fetch |
| 9 | findOrCreateUser() finds existing OAuth | DB query |
| 10 | findOrCreateUser() links by email | DB update |
| 11 | findOrCreateUser() creates new user | DB insert |
| 12 | findOrCreateUser() respects tenant | RLS |
| 13-15 | authenticate() full flows | End-to-end |
| 16 | linkProvider() links OAuth | DB insert |
| 17 | linkProvider() rejects if linked elsewhere | Constraint |
| 18 | unlinkProvider() removes connection | DB delete |

---

### 5. `services/wallet.service.ts` (11 tests) - HIGH PRIORITY

**Unit tests cover signature verification. Integration tests cover DB flows:**

| # | Test Case | Verifies |
|---|-----------|----------|
| 1 | registerWithWallet() creates user | DB insert |
| 2 | registerWithWallet() creates wallet_connection | DB insert |
| 3 | registerWithWallet() creates session | DB insert |
| 4 | registerWithWallet() generates tokens | JWT + Redis |
| 5 | registerWithWallet() deletes nonce | Redis DEL |
| 6 | loginWithWallet() finds wallet_connection | DB query |
| 7 | loginWithWallet() throws if not registered | Error |
| 8 | loginWithWallet() creates session | DB insert |
| 9 | linkWallet() creates connection | DB insert |
| 10 | linkWallet() rejects if linked elsewhere | Constraint |
| 11 | unlinkWallet() deletes connection | DB delete |

---

### 6. `services/biometric.service.ts` (12 tests) - LOW PRIORITY

| # | Test Case | Verifies |
|---|-----------|----------|
| 1 | registerBiometric() throws if exists | Constraint |
| 2 | registerBiometric() stores credential | DB insert |
| 3 | generateChallenge() creates 32-byte hex | Crypto |
| 4 | generateChallenge() stores in Redis | Redis SETEX |
| 5 | verifyBiometric() retrieves challenge | Redis GET |
| 6 | verifyBiometric() throws if expired | TTL check |
| 7 | verifyBiometric() throws if mismatch | Security |
| 8 | verifyBiometric() deletes after use | Redis DEL |
| 9 | verifyBiometric() finds credential | DB query |
| 10 | verifyBiometric() verifies signature | Crypto |
| 11 | listBiometricDevices() returns devices | DB query |
| 12 | removeBiometricDevice() deletes | DB delete |

---

### 7. `services/device-trust.service.ts` (9 tests) - LOW PRIORITY

| # | Test Case | Verifies |
|---|-----------|----------|
| 1 | generateFingerprint() creates SHA256 | Crypto |
| 2 | calculateTrustScore() returns 0-100 | Logic |
| 3 | calculateTrustScore() higher for older | Age bonus |
| 4 | calculateTrustScore() higher for recent | Activity bonus |
| 5 | calculateTrustScore() returns 0 unknown | Default |
| 6 | shouldRequireMFA() true if < 30 | Threshold |
| 7 | shouldRequireMFA() false if >= 30 | Threshold |
| 8 | registerDevice() stores fingerprint | DB insert |
| 9 | getKnownDevices() returns devices | DB query |

---

### 8. `services/audit.service.ts` (17 tests) - LOW PRIORITY

| # | Test Case | Verifies |
|---|-----------|----------|
| 1 | log() inserts with correct fields | DB insert |
| 2 | log() includes correlationId | Metadata |
| 3 | log() handles DB errors gracefully | Error handling |
| 4-17 | Convenience methods populate correct action | Each method |

---

### 9. `services/monitoring.service.ts` (14 tests) - LOW PRIORITY

| # | Test Case | Verifies |
|---|-----------|----------|
| 1 | performHealthCheck() aggregates checks | Logic |
| 2 | performHealthCheck() returns healthy | Happy path |
| 3 | performHealthCheck() returns unhealthy | Failure case |
| 4 | checkDatabase() pings DB | Connection |
| 5 | checkRedis() pings Redis | Connection |
| 6 | checkMemory() flags high heap | Threshold |
| 7-14 | Health endpoints return correct codes | HTTP responses |

---

### 10. `controllers/auth.controller.ts` (28 tests) - HIGH PRIORITY

Full request/response cycle tests via supertest:

| # | Test Case | HTTP |
|---|-----------|------|
| 1 | register() returns 201 | POST /auth/register |
| 2 | register() caches user | Cache check |
| 3 | register() returns 409 duplicate | Conflict |
| 4 | login() returns 200 with tokens | POST /auth/login |
| 5 | login() checks CAPTCHA if required | CAPTCHA flow |
| 6 | login() returns 428 if CAPTCHA needed | Precondition |
| 7 | login() returns 200 requiresMFA | MFA flow |
| 8 | login() verifies TOTP | MFA verify |
| 9 | login() tries backup code | Fallback |
| 10 | login() returns 401 invalid MFA | Error |
| 11-28 | All other endpoints... | Various |

---

### 11-14. Other Controllers

Similar pattern - test HTTP request/response with real DB.

---

## Test Execution

### Commands
```bash
# Start test infrastructure
docker-compose -f docker-compose.test.yml up -d

# Wait for healthy
./scripts/wait-for-it.sh localhost:5433 -- echo "Postgres ready"
./scripts/wait-for-it.sh localhost:6380 -- echo "Redis ready"

# Run migrations
DATABASE_URL=postgres://test:test@localhost:5433/auth_test npm run migrate

# Run integration tests
npm test -- --testPathPattern="integration/" --runInBand

# Run with coverage
npm test -- --testPathPattern="integration/" --coverage --runInBand
```

### CI Pipeline
```yaml
integration-tests:
  services:
    - postgres:15
    - redis:7-alpine
  script:
    - npm run migrate:test
    - npm test -- --testPathPattern="integration/" --runInBand
```

---

## Summary

| Category | Files | Tests |
|----------|-------|-------|
| Services (HIGH) | 3 | ~57 |
| Services (MEDIUM) | 2 | ~28 |
| Services (LOW) | 4 | ~52 |
| Controllers (HIGH) | 2 | ~41 |
| Controllers (MEDIUM) | 3 | ~41 |
| **TOTAL** | **14** | **~219** |

### Priority Order
1. `auth.service.ts` - Core flows
2. `auth-extended.service.ts` - Password/email
3. `auth.controller.ts` - Main endpoints
4. `auth-extended.controller.ts` - Extended endpoints
5. `wallet.service.ts` - Web3 auth
6. `rbac.service.ts` - Permissions
7. Everything else...

---

## Next Steps

1. [ ] Create `docker-compose.test.yml`
2. [ ] Create `tests/integration/setup.ts` (global setup/teardown)
3. [ ] Create `tests/integration/helpers/` (db, redis, fixtures)
4. [ ] Implement HIGH priority tests first
5. [ ] Add to CI pipeline
