# Auth Service Configuration Analysis
## Purpose: Integration Testing Documentation
## Source: src/config/*.ts
## Generated: January 15, 2026

---

## 1. `env.ts` - Environment Configuration

### ENVIRONMENT VARIABLES

| Variable | Type | Default | Required |
|----------|------|---------|----------|
| **Server** |
| NODE_ENV | enum: development/test/staging/production | `development` | Optional |
| PORT | number (1-65535) | `3001` | Optional |
| LOG_LEVEL | enum: trace/debug/info/warn/error/fatal | `info` | Optional |
| **Database** |
| DB_HOST | string | - | **Required** |
| DB_PORT | number | `5432` | Optional |
| DB_NAME | string | - | **Required** |
| DB_USER | string | - | **Required** |
| DB_PASSWORD | string | - | **Required** |
| **Redis** |
| REDIS_HOST | string | `redis` | Optional |
| REDIS_PORT | number | `6379` | Optional |
| REDIS_PASSWORD | string | - | Optional |
| **JWT (User Tokens - RS256)** |
| JWT_ISSUER | string | `tickettoken-auth` | Optional |
| JWT_ACCESS_EXPIRES_IN | duration string | `15m` | Optional |
| JWT_REFRESH_EXPIRES_IN | duration string | `7d` | Optional |
| JWT_PRIVATE_KEY | string | - | Optional (Required in prod) |
| JWT_PUBLIC_KEY | string | - | Optional (Required in prod) |
| JWT_PRIVATE_KEY_PATH | string | `$HOME/tickettoken-secrets/jwt-private.pem` | Optional |
| JWT_PUBLIC_KEY_PATH | string | `$HOME/tickettoken-secrets/jwt-public.pem` | Optional |
| JWT_PRIVATE_KEY_PREVIOUS | string | - | Optional (rotation) |
| JWT_PUBLIC_KEY_PREVIOUS | string | - | Optional (rotation) |
| **S2S (Service-to-Service - RS256)** |
| S2S_PRIVATE_KEY | string | - | Optional (Required in prod) |
| S2S_PUBLIC_KEY | string | - | Optional (Required in prod) |
| S2S_PRIVATE_KEY_PATH | string | `$HOME/tickettoken-secrets/s2s-private.pem` | Optional |
| S2S_PUBLIC_KEY_PATH | string | `$HOME/tickettoken-secrets/s2s-public.pem` | Optional |
| S2S_TOKEN_EXPIRES_IN | duration string | `24h` | Optional |
| **Encryption** |
| ENCRYPTION_KEY | string (min 32 chars) | Dev fallback: `dev-only-insecure-key...` | **Required in prod** |
| **OAuth - Google** |
| GOOGLE_CLIENT_ID | string | - | Optional |
| GOOGLE_CLIENT_SECRET | string | - | Optional |
| GOOGLE_REDIRECT_URI | URL | - | Optional |
| **OAuth - GitHub** |
| GITHUB_CLIENT_ID | string | - | Optional |
| GITHUB_CLIENT_SECRET | string | - | Optional |
| GITHUB_REDIRECT_URI | URL | - | Optional |
| **OAuth - Apple** |
| APPLE_CLIENT_ID | string | - | Optional |
| APPLE_TEAM_ID | string | - | Optional |
| APPLE_KEY_ID | string | - | Optional |
| **Security** |
| BCRYPT_ROUNDS | number (10-14) | `12` | Optional |
| LOCKOUT_MAX_ATTEMPTS | number (3-10) | `5` | Optional |
| LOCKOUT_DURATION_MINUTES | number (5-60) | `15` | Optional |
| **MFA** |
| MFA_ISSUER | string | `TicketToken` | Optional |
| MFA_WINDOW | number (1-5) | `2` | Optional |
| **CAPTCHA** |
| CAPTCHA_ENABLED | boolean | `false` | Optional |
| CAPTCHA_SECRET_KEY | string | - | **Required in prod** |
| CAPTCHA_PROVIDER | enum: recaptcha/hcaptcha | `recaptcha` | Optional |
| CAPTCHA_MIN_SCORE | number (0-1) | `0.5` | Optional |
| CAPTCHA_FAIL_OPEN | boolean | `false` | Optional |
| **Email** |
| RESEND_API_KEY | string | - | **Required in prod** |
| EMAIL_FROM | string | `TicketToken <noreply@tickettoken.com>` | Optional |
| **Service URLs** |
| API_GATEWAY_URL | URL | `http://api-gateway:3000` | Optional |
| VENUE_SERVICE_URL | URL | `http://venue-service:3002` | Optional |
| NOTIFICATION_SERVICE_URL | URL | `http://notification-service:3008` | Optional |
| **Other** |
| ENABLE_SWAGGER | boolean | `false` | Optional |
| LB_DRAIN_DELAY | number (0-60) | `5` | Optional |
| TRUSTED_PROXIES | string | - | Optional |
| DEFAULT_TENANT_ID | UUID | `00000000-0000-0000-0000-000000000001` | Optional |

### FEATURE FLAGS
- `ENABLE_SWAGGER` - Toggle Swagger docs (default: disabled)
- `CAPTCHA_ENABLED` - Toggle CAPTCHA verification
- `CAPTCHA_FAIL_OPEN` - Allow requests if CAPTCHA fails

### CONFIGURATION VALUES
- JWT Access Token TTL: `15m`
- JWT Refresh Token TTL: `7d`
- S2S Token TTL: `24h`
- Bcrypt Rounds: `12`
- Lockout Max Attempts: `5`
- Lockout Duration: `15 minutes`
- MFA Window: `2` (TOTP codes)
- CAPTCHA Min Score: `0.5`
- LB Drain Delay: `5 seconds`

---

## 2. `database.ts` - PostgreSQL Configuration

### ENVIRONMENT VARIABLES

| Variable | Type | Default | Required |
|----------|------|---------|----------|
| DB_HOST | string | `localhost` | Optional |
| DB_PORT | number | `6432` (PgBouncer) | Optional |
| DB_NAME | string | `tickettoken_db` | Optional |
| DB_USER | string | `postgres` | Optional |
| DB_PASSWORD | string | `postgres` | Optional |
| DB_SSL | string | - | Optional |
| DB_CA_CERT | string | - | Optional (prod) |

### CONFIGURATION VALUES (Timeouts/Limits)
- **Pool Max Connections**: `5`
- **Idle Timeout**: `30000ms` (30s)
- **Connection Timeout**: `10000ms` (10s)
- **Statement Timeout**: `30000ms` (30s)
- **Transaction Timeout**: `60000ms` (60s)
- **Lock Timeout**: `10000ms` (10s)

### DEPENDENCIES INITIALIZED
- **pg.Pool** - PostgreSQL connection pool
- **Knex** - Query builder with pool (min: 0, max: 5)
- SSL configuration: Auto-enabled in production with `rejectUnauthorized: true`

---

## 3. `redis.ts` - Redis Configuration

### ENVIRONMENT VARIABLES
Uses shared config from `@tickettoken/shared` - inherits REDIS_HOST, REDIS_PORT, REDIS_PASSWORD

### DEPENDENCIES INITIALIZED
- **redis** - Main Redis client (via `getRedisClient()`)
- **redisPub** - Pub client (via `getRedisPubClient()`)
- **redisSub** - Sub client (via `getRedisSubClient()`)
- **connectionManager** - Shared connection manager

### NOTES
- Lazy initialization pattern
- Uses `@tickettoken/shared` for actual Redis config
- Requires `initRedis()` call during startup

---

## 4. `oauth.ts` - OAuth Provider Configuration

### ENVIRONMENT VARIABLES

| Variable | Type | Default | Required |
|----------|------|---------|----------|
| GOOGLE_CLIENT_ID | string | `''` | Optional |
| GOOGLE_CLIENT_SECRET | string | `''` | Optional |
| GOOGLE_REDIRECT_URI | string | `http://localhost:3001/api/v1/auth/oauth/google/callback` | Optional |
| GITHUB_CLIENT_ID | string | `''` | Optional |
| GITHUB_CLIENT_SECRET | string | `''` | Optional |
| GITHUB_REDIRECT_URI | string | `http://localhost:3001/api/v1/auth/oauth/github/callback` | Optional |
| FACEBOOK_CLIENT_ID | string | `''` | Optional |
| FACEBOOK_CLIENT_SECRET | string | `''` | Optional |
| FACEBOOK_REDIRECT_URI | string | `http://localhost:3001/auth/facebook/callback` | Optional |

### CONFIGURATION VALUES
- Supported providers: `['google', 'github', 'facebook']`

---

## 5. `secrets.ts` - AWS Secrets Manager Configuration

### SECRETS LOADED (AWS Secrets Manager)

| Secret Key | AWS Secret Name | Environment Variable |
|------------|-----------------|---------------------|
| **Database (Core - Always Required)** |
| POSTGRES_PASSWORD | `tickettoken/production/postgres-password` | POSTGRES_PASSWORD |
| POSTGRES_USER | `tickettoken/production/postgres-user` | POSTGRES_USER |
| POSTGRES_DB | `tickettoken/production/postgres-db` | POSTGRES_DB |
| **Redis** |
| REDIS_PASSWORD | `tickettoken/production/redis-password` | REDIS_PASSWORD |
| **JWT (Required in Production)** |
| JWT_PRIVATE_KEY | `tickettoken/production/jwt-private-key` | JWT_PRIVATE_KEY |
| JWT_PUBLIC_KEY | `tickettoken/production/jwt-public-key` | JWT_PUBLIC_KEY |
| JWT_PRIVATE_KEY_PREVIOUS | `tickettoken/production/jwt-private-key-previous` | JWT_PRIVATE_KEY_PREVIOUS |
| JWT_PUBLIC_KEY_PREVIOUS | `tickettoken/production/jwt-public-key-previous` | JWT_PUBLIC_KEY_PREVIOUS |
| **Encryption** |
| ENCRYPTION_KEY | `tickettoken/production/encryption-key` | ENCRYPTION_KEY |
| **OAuth - Google** |
| GOOGLE_CLIENT_ID | `tickettoken/production/google-client-id` | GOOGLE_CLIENT_ID |
| GOOGLE_CLIENT_SECRET | `tickettoken/production/google-client-secret` | GOOGLE_CLIENT_SECRET |
| **OAuth - GitHub** |
| GITHUB_CLIENT_ID | `tickettoken/production/github-client-id` | GITHUB_CLIENT_ID |
| GITHUB_CLIENT_SECRET | `tickettoken/production/github-client-secret` | GITHUB_CLIENT_SECRET |
| **OAuth - Apple** |
| APPLE_CLIENT_ID | `tickettoken/production/apple-client-id` | APPLE_CLIENT_ID |
| APPLE_TEAM_ID | `tickettoken/production/apple-team-id` | APPLE_TEAM_ID |
| APPLE_KEY_ID | `tickettoken/production/apple-key-id` | APPLE_KEY_ID |
| APPLE_PRIVATE_KEY | `tickettoken/production/apple-private-key` | APPLE_PRIVATE_KEY |
| **Email** |
| RESEND_API_KEY | `tickettoken/production/resend-api-key` | RESEND_API_KEY |

### DEPENDENCIES
- Uses `secretsManager` from `@tickettoken/shared`

---

## 6. `logger.ts` - Pino Logger Configuration

### ENVIRONMENT VARIABLES

| Variable | Type | Source |
|----------|------|--------|
| LOG_LEVEL | enum | From `env.ts` |
| NODE_ENV | string | From `env.ts` |
| npm_package_version | string | Process env |

### CONFIGURATION VALUES
- Base fields: `service: 'auth-service'`, `environment`, `version`
- Development: Uses `pino-pretty` transport

### DEPENDENCIES INITIALIZED
- **logger** - Main logger
- **dbLogger** - Database component logger
- **redisLogger** - Redis component logger
- **authLogger** - Auth component logger
- **apiLogger** - API component logger
- **auditLogger** - Security audit logger (always info level)

---

## 7. `swagger.ts` - OpenAPI/Swagger Configuration

### ENVIRONMENT VARIABLES

| Variable | Type | Default |
|----------|------|---------|
| AUTH_SERVICE_URL | URL | `http://auth-service:3001` |

### CONFIGURATION VALUES
- Title: `TicketToken Auth Service API`
- Version: `1.0.0`
- Route Prefix: `/docs`
- Security: Bearer JWT
- Tags: `auth`, `mfa`, `roles`

---

## 8. `tracing.ts` - OpenTelemetry Configuration

### ENVIRONMENT VARIABLES

| Variable | Type | Required |
|----------|------|----------|
| OTEL_EXPORTER_OTLP_ENDPOINT | URL | Optional (disables tracing if not set in prod) |
| NODE_ENV | string | - |
| npm_package_version | string | - |

### CONFIGURATION VALUES
- Service Name: `auth-service`
- Ignored paths: `/health`, `/health/live`, `/health/ready`, `/health/startup`, `/metrics`
- File system instrumentation: Disabled

### DEPENDENCIES INITIALIZED
- **NodeSDK** - OpenTelemetry SDK
- Auto-instrumentations for HTTP, pg, etc.

---

## 9. `dependencies.ts` - Awilix DI Container

### DEPENDENCIES INITIALIZED (All Singletons)

| Service | Class | Dependencies |
|---------|-------|--------------|
| **Config** |
| env | Value | EnvConfig |
| db | Value | Knex instance |
| **Core Services** |
| jwtService | JWTService | - |
| authService | AuthService | jwtService |
| authExtendedService | AuthExtendedService | emailService |
| rbacService | RBACService | - |
| mfaService | MFAService | - |
| walletService | WalletService | - |
| rateLimitService | RateLimitService | - |
| deviceTrustService | DeviceTrustService | - |
| biometricService | BiometricService | - |
| oauthService | OAuthService | - |
| **Supporting Services** |
| emailService | EmailService | - |
| lockoutService | LockoutService | - |
| auditService | AuditService | - |
| monitoringService | MonitoringService | - |

---

## 10. `priorities.ts` - Load Shedding Configuration

### CONFIGURATION VALUES (Route Priorities)

| Priority Level | Value | Shed Threshold | Routes |
|----------------|-------|----------------|--------|
| CRITICAL | 4 | Never | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/verify-mfa`, `GET /auth/verify`, `GET /health/*` |
| HIGH | 3 | Load ≥95% | `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/logout`, `**/auth/internal/*` |
| NORMAL | 2 | Load ≥70% | `GET /auth/me`, `PUT /auth/profile`, `POST /auth/change-password`, `GET /auth/sessions`, consent routes |
| LOW | 1 | Load ≥50% | `GET /auth/export`, `GET /auth/audit-logs`, MFA setup, `/metrics`, `/docs` |

### LOAD SHEDDING THRESHOLDS
- 0-50%: No shedding
- 50-70%: Shed LOW priority
- 70-85%: Shed NORMAL priority
- 85-95%: Shed HIGH priority
- 95%+: Only CRITICAL allowed

---

## Summary for Integration Testing

### Required Environment Variables (Test Setup)
```bash
# Required
DB_HOST=localhost
DB_NAME=test_db
DB_USER=test_user
DB_PASSWORD=test_pass

# Dev defaults acceptable for testing
NODE_ENV=test
PORT=3001
REDIS_HOST=localhost
```

### Secrets to Mock
- ENCRYPTION_KEY (32+ chars)
- JWT keys (or use file paths)
- S2S keys (if testing S2S)

### Dependencies to Initialize
1. `initRedis()` - Must call before Redis usage
2. `createDependencyContainer()` - Creates Awilix container with all services
3. Database pool auto-initializes on import

### Feature Flags for Testing
- `ENABLE_SWAGGER=false` (default)
- `CAPTCHA_ENABLED=false` (default)
- `CAPTCHA_FAIL_OPEN=false` (default)
