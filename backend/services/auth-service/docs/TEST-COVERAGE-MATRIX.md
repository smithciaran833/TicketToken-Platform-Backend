# AUTH SERVICE - COMPLETE TEST COVERAGE MATRIX
## Purpose: Integration Testing Documentation
## Source: Compiled from 12 analysis documents
## Generated: January 15, 2026

---

## EXECUTIVE SUMMARY

Based on analysis of all 12 documentation files, here is the comprehensive test coverage map for the auth service integration tests.

**Total Estimated Test Count: ~148 integration tests**

---

## 1. ENDPOINTS BY DOMAIN (from routes-analysis.md)

### 1.1 AUTH DOMAIN (13 endpoints)
| # | Endpoint | Auth | Rate Limited | Validation Schema | Test Scenarios |
|---|----------|------|--------------|-------------------|----------------|
| 1 | `POST /register` | No | Yes | registerSchema | Success, duplicate email (409), invalid tenant (400), validation errors |
| 2 | `POST /login` | No | Yes (dual) | loginSchema | Success, MFA required, account locked, wrong password (401), captcha triggered |
| 3 | `POST /refresh` | No | No | refreshTokenSchema | Success, expired token (401), reused token (401 + family invalidation) |
| 4 | `POST /forgot-password` | No | Yes | forgotPasswordSchema | Success (always 200), rate limited (429), idempotency window |
| 5 | `POST /reset-password` | No | Yes | resetPasswordSchema | Success, expired token (400), invalid token (400) |
| 6 | `GET /verify-email` | No | No | verifyEmailSchema | Success, expired token (400), invalid token (400) |
| 7 | `GET /verify` | Yes | No | emptyBodySchema | Valid token → 200, invalid/expired → 401 |
| 8 | `GET /me` | Yes | No | emptyBodySchema | Success, user not found (404) |
| 9 | `POST /logout` | Yes | No | logoutSchema | Success (204), cache invalidation |
| 10 | `POST /resend-verification` | Yes | No | emptyBodySchema | Success, already verified (400), rate limited (400) |
| 11 | `PUT /change-password` | Yes | No | changePasswordSchema | Success, wrong current password (401), same password (400) |

### 1.2 MFA DOMAIN (5 endpoints)
| # | Endpoint | Test Scenarios |
|---|----------|----------------|
| 12 | `POST /mfa/setup` | Success (QR code), already enabled (400), idempotency |
| 13 | `POST /mfa/verify-setup` | Success (backup codes), invalid token (400), expired setup (400) |
| 14 | `POST /mfa/verify` | Success, invalid token (401), token replay (401) |
| 15 | `POST /mfa/regenerate-backup-codes` | Success, MFA not enabled (400) |
| 16 | `DELETE /mfa/disable` | Success, wrong password (400), invalid MFA token (400) |

### 1.3 WALLET DOMAIN (5 endpoints)
| # | Endpoint | Auth | Test Scenarios |
|---|----------|------|----------------|
| 17 | `POST /wallet/nonce` | No | Success, rate limited |
| 18 | `POST /wallet/register` | No | Success (201), duplicate wallet (409), invalid signature (401) |
| 19 | `POST /wallet/login` | No | Success, wallet not found (401), invalid signature (401), expired nonce (401) |
| 20 | `POST /wallet/link` | Yes | Success, wallet already linked (409), invalid signature (401) |
| 21 | `DELETE /wallet/unlink/:publicKey` | Yes | Success, wallet not found (401) |

### 1.4 BIOMETRIC DOMAIN (6 endpoints)
| # | Endpoint | Auth | Test Scenarios |
|---|----------|------|----------------|
| 22 | `POST /biometric/challenge` (public) | No | Success (challenge returned) |
| 23 | `POST /biometric/authenticate` | No | Success (tokens), invalid signature (401), expired challenge (401) |
| 24 | `POST /biometric/register` | Yes | Success (credential ID), device already registered (401) |
| 25 | `GET /biometric/challenge` | Yes | Success |
| 26 | `GET /biometric/devices` | Yes | Success (device list) |
| 27 | `DELETE /biometric/devices/:credentialId` | Yes | Success, credential not found (401) |

### 1.5 OAUTH DOMAIN (4 endpoints)
| # | Endpoint | Auth | Test Scenarios |
|---|----------|------|----------------|
| 28 | `POST /oauth/:provider/callback` | No | Success (Google), Success (GitHub), unsupported provider (422) |
| 29 | `POST /oauth/:provider/login` | No | Success, OAuth error (401), account creation |
| 30 | `POST /oauth/:provider/link` | Yes | Success, already linked (422), linked to another user (422) |
| 31 | `DELETE /oauth/:provider/unlink` | Yes | Success, not linked (422) |

### 1.6 SESSION DOMAIN (3 endpoints)
| # | Endpoint | Test Scenarios |
|---|----------|----------------|
| 32 | `GET /sessions` | Success (list with pagination), empty list |
| 33 | `DELETE /sessions/:sessionId` | Success, session not found (404), wrong tenant (404) |
| 34 | `DELETE /sessions/all` | Success (count returned), audit logged |

### 1.7 PROFILE/GDPR DOMAIN (6 endpoints)
| # | Endpoint | Test Scenarios |
|---|----------|----------------|
| 35 | `GET /profile` | Success, cache fallback scenario |
| 36 | `PUT /profile` | Success, validation errors (422), XSS sanitization |
| 37 | `GET /gdpr/export` | Success (file download), audit logged |
| 38 | `GET /consent` | Success |
| 39 | `PUT /consent` | Success, missing data (400), audit logged |
| 40 | `POST /gdpr/delete` | Success, email mismatch (400), audit logged |

### 1.8 RBAC DOMAIN (3 endpoints)
| # | Endpoint | Permission | Test Scenarios |
|---|----------|------------|----------------|
| 41 | `POST /venues/:venueId/roles` | `roles:manage` | Success, permission denied (403), invalid role |
| 42 | `DELETE /venues/:venueId/roles/:userId` | `roles:manage` | Success, permission denied (403) |
| 43 | `GET /venues/:venueId/roles` | VenueAccess | Success, no access (403) |

### 1.9 INTERNAL/S2S DOMAIN (10 endpoints)
| # | Endpoint | Consumer Services | Test Scenarios |
|---|----------|-------------------|----------------|
| 44 | `POST /internal/validate-permissions` | ticket, payment, event | Valid permissions, invalid permissions |
| 45 | `POST /internal/validate-users` | Multiple | Users found, partial found, max 100 limit |
| 46 | `GET /internal/user-tenant/:userId` | Multiple | Success, user not found |
| 47 | `GET /internal/health` | All | Status 200 |
| 48 | `GET /internal/users/:userId` | Multiple | Success, not found |
| 49 | `GET /internal/users/by-email/:email` | Multiple | Success, not found |
| 50 | `GET /internal/users/admins` | Multiple | Filter by tenant, roles |
| 51 | `GET /internal/users/:userId/tax-info` | Payment | Success, not found |
| 52 | `GET /internal/users/:userId/chargeback-count` | Payment | Success with monthsBack query |
| 53 | `POST /internal/users/batch-verification-check` | Multiple | Success, max 100 limit |

---

## 2. VALIDATION SCENARIOS (from validators-analysis.md)

### 2.1 Required Field Tests
| Schema | Required Fields | Test: Missing Each Field |
|--------|-----------------|--------------------------|
| registerSchema | email, password, firstName, lastName, tenant_id | 5 tests |
| loginSchema | email, password | 2 tests |
| walletNonceSchema | publicKey, chain | 2 tests |
| walletRegisterSchema | publicKey, signature, nonce, chain, tenant_id | 5 tests |
| biometricAuthenticateSchema | userId, credentialId, signature, challenge | 4 tests |
| grantRoleSchema | userId, role | 2 tests |

### 2.2 Format Validation Tests
| Field Type | Validation | Test Cases |
|------------|------------|------------|
| Email | Joi email format | Valid, invalid format, max 255 |
| Password | min 8, max 128 | Too short, too long, valid |
| Phone | E.164 pattern | Valid +1234567890, invalid 1234, invalid abc |
| UUID | Joi UUID | Valid UUID, invalid string |
| Chain | enum: solana, ethereum | Valid, invalid "bitcoin" |
| Provider | enum: google, github, facebook, apple | Valid, invalid "twitter" |
| MFA Token | exactly 6 chars | Valid "123456", too short, too long |
| Pagination | page min 1, limit 1-100 | Valid, page 0, limit 101 |
| Biometric Type | enum: faceId, touchId, fingerprint | Valid, invalid |

### 2.3 Extra Fields Rejection
All schemas use `.unknown(false)` - test that extra fields return 400.

---

## 3. DATABASE CONSTRAINT TESTS (from migrations-analysis.md)

### 3.1 UNIQUE Constraints
| Table | Constraint | Test Scenario |
|-------|------------|---------------|
| `tenants` | slug UNIQUE | Insert duplicate slug → error |
| `users` | username UNIQUE | Insert duplicate username → conflict |
| `users` | referral_code UNIQUE | Verify auto-generated uniqueness |
| `users` | idx_users_email_active (partial) | Same email for deleted vs active user |
| `oauth_connections` | provider + provider_user_id | Same OAuth account → conflict |

### 3.2 Foreign Key Tests
| Table | FK Column | Parent | ON DELETE | Test Scenario |
|-------|-----------|--------|-----------|---------------|
| `users` | tenant_id | tenants | RESTRICT | Delete tenant with users → error |
| `user_sessions` | user_id | users | CASCADE | Delete user → sessions cascade |
| `user_venue_roles` | user_id | users | CASCADE | Delete user → roles cascade |
| `user_venue_roles` | granted_by | users | - | Verify granter exists |
| `oauth_connections` | user_id | users | CASCADE | Delete user → oauth cascade |
| `wallet_connections` | user_id | users | CASCADE | Delete user → wallets cascade |

### 3.3 CHECK Constraints
| Table | Constraint | Test Scenario |
|-------|------------|---------------|
| `users` | check_email_lowercase | Insert uppercase email → normalized or error |
| `users` | check_username_format | Invalid chars → error, valid → success |
| `users` | check_referral_not_self | Self-referral → error |
| `users` | check_age_minimum | Under 13 → error |
| `users` | users_status_check | Invalid status → error |
| `user_addresses` | chk_user_addresses_type | Invalid type → error |

### 3.4 Soft Delete Tests
| Table | Column | Test Scenarios |
|-------|--------|----------------|
| `users` | deleted_at | Soft delete preserves data, login fails after soft delete |
| `user_sessions` | revoked_at | Revoked session cannot be used |
| `user_venue_roles` | is_active, revoked_at | Inactive role not returned, expired role not returned |

### 3.5 RLS Tests (Row Level Security)
| Table | Test Scenario |
|-------|---------------|
| All 11 tables | Query without tenant context → empty results or error |
| All 11 tables | Query with tenant A context → only tenant A data |
| `tenants` | No RLS → accessible without context |

---

## 4. ERROR PATH TESTS (from errors-analysis.md)

### 4.1 Error Triggering Map
| Error Class | HTTP | Code | Triggered By |
|-------------|------|------|--------------|
| ValidationError | 422 | VALIDATION_ERROR | Invalid input in any validated endpoint |
| NotFoundError | 404 | NOT_FOUND | User lookup fails, session not found |
| AuthenticationError | 401 | AUTHENTICATION_FAILED | Wrong password, invalid token, expired token |
| AuthorizationError | 403 | ACCESS_DENIED | Permission denied, wrong tenant |
| ConflictError | 409 | CONFLICT | Duplicate email, duplicate wallet |
| RateLimitError | 429 | RATE_LIMIT_EXCEEDED | Too many login attempts, registration throttled |
| TokenError | 401 | TOKEN_INVALID | Expired JWT, malformed JWT, blacklisted token |
| TenantError | 400 | TENANT_INVALID | Missing tenant_id, invalid UUID format |
| MFARequiredError | 401 | MFA_REQUIRED | MFA enabled but no token provided |
| CaptchaError | 400 | CAPTCHA_REQUIRED | Failed login attempts trigger captcha |
| SessionError | 401 | SESSION_EXPIRED | Session timeout, revoked session |

---

## 5. MIDDLEWARE BEHAVIOR TESTS (from middleware-analysis.md)

### 5.1 Rate Limiting Scenarios
| Rate Limiter | Trigger | Points | Duration | Test |
|--------------|---------|--------|----------|------|
| loginRateLimiter | POST /login | 5 | 15 min | 5 attempts → pass, 6th → 429 |
| registrationRateLimiter | POST /register | 3 | 1 hr | 3 → pass, 4th → 429 |
| passwordResetRateLimiter | POST /forgot-password | 3 | 1 hr | Verify 429 after threshold |
| otpRateLimiter | MFA verify | 5 | 5 min | Brute force protection |
| mfaSetupRateLimiter | POST /mfa/setup | 3 | 1 hr | Prevent setup spam |

### 5.2 Auth Rejection Scenarios
| Middleware | Scenario | Expected |
|------------|----------|----------|
| authenticate | Missing Authorization header | 401 |
| authenticate | Malformed "Bearer " prefix | 401 |
| authenticate | Expired JWT | 401 |
| authenticate | Invalid signature | 401 |
| requirePermission | No user on request | 401 |
| requirePermission | User lacks permission | 403 |
| requireVenueAccess | User has no venue role | 403 |

### 5.3 Tenant Isolation Scenarios
| Middleware | Scenario | Expected |
|------------|----------|----------|
| validateTenant | Missing tenant_id in JWT | 403 MISSING_TENANT_ID |
| validateTenant | Invalid UUID format | 403 INVALID_TENANT_ID_FORMAT |
| validateTenant | RLS set_config fails | 500 RLS_CONTEXT_ERROR |
| Cross-tenant | User A accesses User B's session | 404 (filtered by RLS) |

### 5.4 Idempotency Scenarios
| Scenario | Expected |
|----------|----------|
| First request with Idempotency-Key | Process normally |
| Same key, same body | Return cached response, header: Idempotency-Replayed: true |
| Same key, different body | 422 IDEMPOTENCY_KEY_MISMATCH |
| Concurrent requests same key | 409 IDEMPOTENCY_CONFLICT |
| Key too short (<16 chars) | 400 INVALID_IDEMPOTENCY_KEY |

### 5.5 S2S Auth Scenarios
| Scenario | Expected |
|----------|----------|
| Missing x-service-token | 401 MISSING_SERVICE_TOKEN |
| Invalid service token | 401 INVALID_SERVICE_TOKEN |
| Service not in allowlist | 403 SERVICE_NOT_ALLOWED |
| Expired service token | 401 SERVICE_TOKEN_EXPIRED |
| Valid service token | Success with request.service set |

### 5.6 Load Shedding Scenarios
| Load Level | Shed Priority | Test Endpoints |
|------------|---------------|----------------|
| 50-70% | LOW | GET /metrics → 503 |
| 70-85% | NORMAL | GET /me → 503 |
| 85-95% | HIGH | POST /register → 503 |
| Any | Never shed CRITICAL | POST /login, GET /health always work |

---

## 6. SERVICE LOGIC TESTS (from services-analysis-batch1/2/3.md)

### 6.1 AuthService
| Method | Success Path | Error Paths | Redis Verify | DB Verify |
|--------|--------------|-------------|--------------|-----------|
| register | User created, session created, tokens returned | DUPLICATE_EMAIL (409), INVALID_TENANT (400) | - | INSERT users, INSERT user_sessions |
| login | Tokens returned, failed_attempts cleared | Account locked, invalid credentials | - | UPDATE users (login_count, last_login_at) |
| refreshTokens | New token pair | Token reuse → family invalidation | DEL old token, SET new | SELECT user for permissions |
| logout | 204 | - | DEL refresh token | INSERT invalidated_tokens, UPDATE sessions |

### 6.2 MFAService
| Method | Success Path | Error Paths | Redis Verify |
|--------|--------------|-------------|--------------|
| setupTOTP | QR code + secret | Already enabled | SET mfa:setup:{userId} TTL 10min |
| verifyAndEnableTOTP | Backup codes | Invalid token, expired setup | GET + DEL setup key |
| verifyTOTP | true | Invalid token, replay | SET recent:{token} TTL 90s |
| disableTOTP | true | Wrong password, invalid token | DEL all mfa keys |

### 6.3 WalletService
| Method | Success Path | Error Paths | Redis Verify |
|--------|--------------|-------------|--------------|
| generateNonce | Nonce returned | - | SET wallet-nonce:{nonce} TTL 15min |
| registerWithWallet | User + tokens | Duplicate wallet (409), invalid sig | GET + DEL nonce |
| loginWithWallet | Tokens | Wallet not found, invalid sig, expired nonce | GET + DEL nonce |
| linkWallet | Success | Already linked to another | Nonce consumed |

### 6.4 OAuthService
| Method | External Mock | Success Path | Error Paths |
|--------|---------------|--------------|-------------|
| authenticate (Google) | OAuth2Client | User + tokens | Invalid token (401) |
| authenticate (GitHub) | GitHub API | User + tokens | No email (401) |
| linkProvider | - | Success | Already linked (422) |
| unlinkProvider | - | Success | Not linked (422) |

### 6.5 BiometricService
| Method | Redis Key | Success Path | Error Paths |
|--------|-----------|--------------|-------------|
| generateChallenge | biometric_challenge:{userId} | Challenge (5min TTL) | - |
| registerBiometric | - | Credential ID | Device already registered |
| verifyBiometric | GET + DEL challenge | Tokens | Invalid signature, expired challenge |

### 6.6 RBACService
| Method | Permission Check | Success Path | Error Paths |
|--------|------------------|--------------|-------------|
| checkPermission | Wildcard `*` matches all | Boolean | - |
| requirePermission | - | Passes | AuthorizationError |
| grantVenueRole | roles:manage | Success | Permission denied |
| revokeVenueRole | roles:manage | Success | Permission denied |

---

## 7. SIDE EFFECTS TO VERIFY (from services + controllers)

### 7.1 Audit Log Events
| Trigger | Action | Table |
|---------|--------|-------|
| User login | user.login | audit_logs |
| User logout | user.logout | audit_logs |
| User registration | user.registration | audit_logs |
| Password change | user.password_changed | audit_logs |
| Password reset | user.password_reset | audit_logs |
| MFA enabled | user.mfa_enabled | audit_logs |
| MFA disabled | user.mfa_disabled | audit_logs |
| Session revoked | session.revoked | audit_logs |
| All sessions revoked | session.all_revoked | audit_logs |
| Role granted | role.granted | audit_logs |
| Role revoked | role.revoked | audit_logs |
| Data export | data.exported | audit_logs |
| Account deletion | account.deletion_requested | audit_logs |
| Profile update | profile.updated | audit_logs |
| Consent change | consent.granted/withdrawn | audit_logs |
| Token refresh | (token_refresh_log table) | token_refresh_log |

### 7.2 Email Events
| Trigger | Email Type | Mock Verify |
|---------|------------|-------------|
| Registration | Verification email | sendVerificationEmail called |
| Forgot password | Reset email | sendPasswordResetEmail called |
| Resend verification | Verification email | sendVerificationEmail called |
| MFA setup complete | Backup codes email | sendMFABackupCodesEmail called (optional) |

### 7.3 Cache Invalidations
| Trigger | Cache Keys Invalidated |
|---------|------------------------|
| Logout | userCache, sessionCache |
| Profile update | cache:user:{tenant}:{user}:profile |
| Password change | All user sessions, refresh tokens |
| Account deletion | All user cache entries |
| Consent update | userCache |

### 7.4 Token Operations
| Trigger | Token Operation |
|---------|-----------------|
| Login | Generate access + refresh token pair |
| Refresh | Invalidate old, generate new pair |
| Logout | Add to invalidated_tokens table |
| Password change | Invalidate all refresh tokens (SCAN + DEL) |
| MFA setup | Generate backup codes |

---

## 8. SUGGESTED TEST GROUPINGS

### Group 1: Auth Flow Integration (~25 tests)
- Registration happy path + duplicates + validation
- Login happy path + MFA flow + lockout + captcha
- Token refresh + rotation + reuse detection
- Logout + session invalidation
- Password reset flow end-to-end

### Group 2: Wallet/Biometric Auth (~15 tests)
- Wallet nonce generation + expiry
- Wallet registration + login + linking
- Biometric challenge + registration + authentication
- Signature verification (Solana + Ethereum)

### Group 3: MFA Flow (~10 tests)
- TOTP setup + verification + backup codes
- Token replay prevention
- MFA disable with password verification

### Group 4: OAuth Integration (~10 tests)
- Google OAuth flow (mock Google API)
- GitHub OAuth flow (mock GitHub API)
- Link/unlink providers
- Account creation via OAuth

### Group 5: Session Management (~8 tests)
- List sessions with pagination
- Revoke single session
- Revoke all sessions
- Session not found scenarios

### Group 6: Profile/GDPR (~10 tests)
- Profile get/update
- GDPR export (file download)
- Consent management
- Account deletion request

### Group 7: RBAC (~8 tests)
- Grant venue role
- Revoke venue role
- Permission checking
- Venue access verification

### Group 8: Internal S2S API (~15 tests)
- All 10 internal endpoints
- S2S token validation
- Service allowlist enforcement

### Group 9: Middleware Behaviors (~20 tests)
- Rate limiting per endpoint type
- Idempotency key handling
- Tenant isolation (RLS)
- Load shedding priorities
- Correlation ID propagation

### Group 10: Database Constraints (~15 tests)
- UNIQUE constraint violations
- FK integrity
- CHECK constraints
- Soft delete behavior

### Group 11: Error Handling (~12 tests)
- Each error class triggered correctly
- Error response format validation
- Error codes in responses

---

## 9. INFRASTRUCTURE REQUIREMENTS

### 9.1 Database Setup
- PostgreSQL with RLS enabled
- All 12 tables from migration
- Default tenant seeded
- Test user data fixtures

### 9.2 Redis Setup
- All key prefixes configured
- TTL verification capability
- Ability to inspect/assert on keys

### 9.3 External Mocks Required
| Service | Mock Target |
|---------|-------------|
| Google OAuth | OAuth2Client |
| GitHub API | Token endpoint, User endpoint, Emails endpoint |
| Resend Email | Email send API |
| CAPTCHA | reCAPTCHA/hCaptcha verify endpoint |

### 9.4 Blockchain Mocks
| Chain | Mock Target |
|-------|-------------|
| Solana | @solana/web3.js PublicKey, nacl signature verification |
| Ethereum | ethers.verifyMessage |

---

## 10. REDIS KEY PATTERNS TO TEST

### 10.1 Rate Limiting Keys
```
tenant:{tenantId}:ratelimit:{action}:{identifier}
tenant:{tenantId}:ratelimit:{action}:block:{identifier}
```

### 10.2 Authentication Keys
```
tenant:{tenantId}:refresh_token:{jti}
tenant:{tenantId}:password-reset:{token}
tenant:{tenantId}:email-verify:{token}
```

### 10.3 MFA Keys
```
tenant:{tenantId}:mfa:setup:{userId}
tenant:{tenantId}:mfa:secret:{userId}
tenant:{tenantId}:mfa:verified:{userId}
tenant:{tenantId}:mfa:recent:{userId}:{code}
```

### 10.4 Biometric/Wallet Keys
```
tenant:{tenantId}:biometric_challenge:{userId}
tenant:{tenantId}:wallet-nonce:{nonce}
```

### 10.5 Lockout Keys
```
tenant:{tenantId}:lockout:user:{userId}
tenant:{tenantId}:lockout:ip:{ip}
tenant:{tenantId}:bf:attempts:{identifier}
tenant:{tenantId}:bf:lock:{identifier}
```

### 10.6 Session/Cache Keys
```
tenant:{tenantId}:session:{sessionId}
tenant:{tenantId}:user:sessions:{userId}
cache:user:{tenantId}:{userId}:profile
cache:user:{tenantId}:{userId}:permissions
```

### 10.7 Idempotency Keys
```
idempotency:tenant:{tenant_id}:{key}
idempotency:{key}
```

---

## 11. DATABASE TABLES SUMMARY

| Table | Primary Operations | RLS |
|-------|-------------------|-----|
| `tenants` | SELECT | No |
| `users` | CRUD | Yes |
| `user_sessions` | CRUD | Yes |
| `user_venue_roles` | CRUD | Yes |
| `audit_logs` | INSERT, SELECT | Yes |
| `invalidated_tokens` | INSERT, SELECT | Yes |
| `token_refresh_log` | INSERT, SELECT | Yes |
| `oauth_connections` | CRUD | Yes |
| `wallet_connections` | CRUD | Yes |
| `biometric_credentials` | CRUD | Yes |
| `trusted_devices` | CRUD | Yes |
| `user_addresses` | CRUD | Yes |

---

## 12. SOURCE DOCUMENTATION REFERENCES

| Document | Coverage Area |
|----------|---------------|
| routes-analysis.md | 53 endpoints, middleware chains |
| validators-analysis.md | 33 input schemas, 38 response schemas |
| controllers-analysis.md | 5 controllers, 32 methods |
| services-analysis-batch1.md | Auth, JWT, Lockout, Rate Limit, Password Security |
| services-analysis-batch2.md | MFA, Biometric, OAuth, Wallet, CAPTCHA, Key Rotation |
| services-analysis-batch3.md | Cache, Email, Audit, RBAC, Monitoring |
| migrations-analysis.md | 12 tables, 8 CHECK constraints, 19 FKs, 11 RLS policies |
| errors-analysis.md | 11 error classes |
| middleware-analysis.md | 7 middleware modules |
| config-analysis.md | 10 config files, 50+ env vars |
| utils-analysis.md | 12 utility modules |
| models-analysis.md | 4 interfaces, DB-model comparison |
