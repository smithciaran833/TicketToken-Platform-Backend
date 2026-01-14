cat > scanning-service/docs/TEST_PLAN.md << 'EOF'
# Scanning Service - Test Plan

**Service:** scanning-service  
**Version:** 1.0  
**Created:** January 5, 2026  
**Total Test Cases:** 682  

---

## Table of Contents

1. [Overview](#overview)
2. [Test Summary](#test-summary)
3. [Config Layer](#config-layer)
4. [Errors Layer](#errors-layer)
5. [Schemas & Validators Layer](#schemas--validators-layer)
6. [Utils Layer](#utils-layer)
7. [Middleware Layer](#middleware-layer)
8. [Services Layer](#services-layer)
9. [Routes Layer](#routes-layer)
10. [Entry Point](#entry-point)
11. [End-to-End Tests](#end-to-end-tests)

---

## Overview

This document provides a comprehensive test plan for the scanning-service, covering all source files with detailed test cases for unit, integration, and end-to-end testing.

### Test Types

| Type | Description | Dependencies |
|------|-------------|--------------|
| **Unit** | Tests individual functions/methods in isolation with mocked dependencies | Jest, mocks |
| **Integration** | Tests components with real dependencies (database, Redis) | Test containers, real DB |
| **E2E** | Tests complete user flows through the API | Supertest, full service |

---

## Test Summary

### By Layer

| Layer | Files | Unit | Integration | E2E |
|-------|-------|------|-------------|-----|
| Config | 5 | 31 | 9 | - |
| Errors | 1 | 45 | 0 | - |
| Schemas/Validators | 2 | 49 | 0 | - |
| Utils | 3 | 47 | 3 | - |
| Middleware | 6 | 119 | 17 | - |
| Services | 6 | 178 | 41 | - |
| Routes | 6 | 74 | 26 | 13 |
| Entry | 1 | 8 | 16 | 6 |
| **TOTAL** | **30** | **551** | **112** | **19** |

### Grand Total: 682 Tests

---

## Config Layer

### File: `src/config/database.ts`

**Purpose:** PostgreSQL connection pool management with retry logic and DNS resolution.

#### Unit Tests (7 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `getPool throws error when called before initializeDatabase` | Verify getPool() throws "Database not initialized" error when pool is undefined |
| 2 | `getPool returns pool instance after initialization` | After successful init, getPool() returns the Pool instance |
| 3 | `initializeDatabase retries on connection failure` | Mock Pool to fail, verify retry logic executes up to MAX_RETRIES |
| 4 | `initializeDatabase uses exponential backoff delay` | Verify delay increases: 2000ms, 4000ms, 6000ms, 8000ms, 10000ms |
| 5 | `initializeDatabase throws after MAX_RETRIES exhausted` | After 5 failures, function throws the last error |
| 6 | `initializeDatabase cleans up failed pool before retry` | Verify pool.end() called on failed connection before retry |
| 7 | `initializeDatabase logs correctly at each attempt` | Verify logger.info called with attempt number |

#### Integration Tests (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `initializeDatabase connects to real PostgreSQL` | Using test container, verify successful connection |
| 2 | `initializeDatabase resolves DNS and connects via IP` | Verify DNS resolution works with real hostname |
| 3 | `getPool returns working pool that can execute queries` | Execute SELECT 1 query successfully |
| 4 | `Pool handles SELECT 1 health check query` | Verify health check pattern works |

---

### File: `src/config/env.validator.ts`

**Purpose:** Joi-based environment variable validation with fail-fast behavior.

#### Unit Tests (12 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `validateEnv passes with all required vars present` | Set all required env vars, verify returns validated object |
| 2 | `validateEnv exits process when HMAC_SECRET missing` | Mock process.exit, verify called with 1 |
| 3 | `validateEnv exits process when HMAC_SECRET less than 32 chars` | Set 31-char secret, verify exit |
| 4 | `validateEnv exits process when JWT_SECRET missing` | Verify process.exit(1) called |
| 5 | `validateEnv exits process when JWT_SECRET less than 32 chars` | Set short secret, verify exit |
| 6 | `validateEnv exits process when DB_HOST missing` | Remove DB_HOST, verify exit |
| 7 | `validateEnv exits process when REDIS_HOST missing` | Remove REDIS_HOST, verify exit |
| 8 | `validateEnv applies default values` | Verify PORT=3009, DB_PORT=5432, etc. |
| 9 | `validateEnv validates NODE_ENV is valid enum` | Test with invalid value, verify rejection |
| 10 | `validateEnv validates LOG_LEVEL is valid enum` | Test error/warn/info/debug only |
| 11 | `validateEnv allows unknown env vars` | Set extra vars, verify no error |
| 12 | `getRequiredEnvVars returns correct list` | Verify returns array of 7 required var names |

---

### File: `src/config/redis.ts`

**Purpose:** Redis client singleton with retry strategy.

#### Unit Tests (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `getRedis throws error when called before initializeRedis` | Verify "Redis not initialized" error |
| 2 | `getRedis returns client instance after initialization` | After init, returns Redis client |
| 3 | `initializeRedis uses correct host/port from env vars` | Mock Redis, verify config passed |
| 4 | `initializeRedis uses default values when env vars missing` | Verify host='redis', port=6379 |
| 5 | `Retry strategy returns correct delay capped at 2000ms` | Test retryStrategy function returns min(times*50, 2000) |

#### Integration Tests (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `initializeRedis connects to real Redis` | Using test container, verify connection |
| 2 | `getRedis returns working client that can SET/GET` | Execute SET then GET, verify value |
| 3 | `Client reconnects after connection loss` | Simulate disconnect, verify reconnection |

---

### File: `src/config/secrets.config.ts`

**Purpose:** Static configuration mapping AWS secret names to environment variable names.

#### Unit Tests (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `SECRETS_CONFIG contains all required secret mappings` | Verify POSTGRES_PASSWORD, POSTGRES_USER, POSTGRES_DB, REDIS_PASSWORD exist |
| 2 | `Each config entry has secretName and envVarName properties` | Iterate all entries, verify both properties exist |

---

### File: `src/config/secrets.ts`

**Purpose:** AWS Secrets Manager integration with caching and environment fallback.

#### Unit Tests (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `loadSecrets calls secretsManager with correct config` | Mock secretsManager.getSecrets, verify called with commonSecrets |
| 2 | `loadSecrets returns secrets record on success` | Verify returns Record<string, string> |
| 3 | `loadSecrets throws error when secretsManager fails` | Mock rejection, verify error thrown |
| 4 | `loadSecrets logs service name correctly` | Verify console.log includes SERVICE_NAME |
| 5 | `loadSecrets loads all 4 common secrets` | Verify POSTGRES_PASSWORD, USER, DB, REDIS_PASSWORD requested |

#### Integration Tests (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `loadSecrets retrieves secrets from AWS Secrets Manager` | With real AWS credentials, verify retrieval |
| 2 | `loadSecrets handles AWS authentication errors gracefully` | With bad credentials, verify error handling |

---

## Errors Layer

### File: `src/errors/index.ts`

**Purpose:** RFC 7807 Problem Details error implementation with domain-specific errors.

#### Unit Tests - AppError Base Class (8 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Constructor sets all properties correctly` | Verify type, title, status, detail, timestamp, correlationId |
| 2 | `Constructor generates default type URI from title` | Verify URL format: https://api.tickettoken.com/errors/{title-slug} |
| 3 | `Constructor sets isOperational to true by default` | Verify default value |
| 4 | `Constructor sets timestamp to ISO format` | Verify ISO 8601 format |
| 5 | `toJSON returns valid ProblemDetails object` | Verify all required fields present |
| 6 | `toJSON includes extensions in output` | Add custom extensions, verify in JSON |
| 7 | `instanceof AppError works correctly` | Verify prototype chain |
| 8 | `Stack trace is captured properly` | Verify Error.captureStackTrace called |

#### Unit Tests - HTTP Error Classes (12 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `BadRequestError sets status 400 and correct type` | Verify status and type URL |
| 2 | `ValidationError sets status 400 and includes errors array` | Pass errors array, verify in extensions |
| 3 | `UnauthorizedError sets status 401 with default detail` | Verify "Authentication required" default |
| 4 | `ForbiddenError sets status 403 and includes required permissions` | Pass required array, verify in extensions |
| 5 | `NotFoundError sets status 404 and formats resource/id in detail` | Verify "Resource with id 'x' not found" format |
| 6 | `ConflictError sets status 409 and includes resourceId` | Verify resourceId in extensions |
| 7 | `UnprocessableEntityError sets status 422 and includes reason` | Verify reason in extensions |
| 8 | `TooManyRequestsError sets status 429 and includes retryAfter` | Verify retryAfter property and extension |
| 9 | `InternalServerError sets status 500 and isOperational false` | Verify isOperational = false |
| 10 | `BadGatewayError sets status 502 and includes upstream` | Verify upstream in extensions |
| 11 | `ServiceUnavailableError sets status 503 and includes retryAfter` | Verify retryAfter property |
| 12 | `GatewayTimeoutError sets status 504 and includes upstream` | Verify upstream in extensions |

#### Unit Tests - Domain-Specific Errors (10 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `QRValidationError sets correct type and status 400` | Verify type URL contains qr-validation-error |
| 2 | `QRValidationError includes ticketId and reason in extensions` | Pass both, verify in JSON |
| 3 | `TicketAlreadyScannedError sets status 409` | Verify conflict status |
| 4 | `TicketAlreadyScannedError formats ticketId in detail message` | Verify "Ticket {id} has already been scanned" |
| 5 | `TicketAlreadyScannedError includes scannedAt and scannedBy` | Verify both in extensions |
| 6 | `DeviceUnauthorizedError sets status 401` | Verify unauthorized status |
| 7 | `DeviceUnauthorizedError includes deviceId in extensions` | Verify deviceId present |
| 8 | `PolicyViolationError sets status 403` | Verify forbidden status |
| 9 | `PolicyViolationError includes policyId and violationType` | Verify both in extensions |
| 10 | `DatabaseError sets status 500 and isOperational false` | Verify non-operational error |

#### Unit Tests - Helper Functions (15 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `isOperationalError returns true for operational AppError` | Create operational error, verify true |
| 2 | `isOperationalError returns false for non-operational AppError` | Create InternalServerError, verify false |
| 3 | `isOperationalError returns false for plain Error` | Pass new Error(), verify false |
| 4 | `isOperationalError returns false for non-error values` | Pass null, string, number, verify false |
| 5 | `toAppError returns same AppError if already AppError` | Pass AppError, verify same instance |
| 6 | `toAppError adds correlationId to existing AppError` | Pass AppError without correlationId, add one |
| 7 | `toAppError converts plain Error to InternalServerError` | Pass Error, verify InternalServerError returned |
| 8 | `toAppError hides error message in production` | Set NODE_ENV=production, verify generic message |
| 9 | `toAppError shows error message in non-production` | Set NODE_ENV=development, verify original message |
| 10 | `toAppError handles non-Error values` | Pass string, null, verify InternalServerError |
| 11 | `createErrorResponse returns valid ProblemDetails` | Pass AppError, verify JSON structure |
| 12 | `createErrorResponse preserves all error properties` | Verify all fields copied |
| 13 | `Each error class passes instanceof check for its type` | Test each class with instanceof |
| 14 | `Each error class passes instanceof AppError check` | All errors are instanceof AppError |
| 15 | `Error prototype chain is correct after setPrototypeOf` | Verify inheritance chain |

---

## Schemas & Validators Layer

### File: `src/schemas/validation.ts`

**Purpose:** Fastify JSON Schema definitions for all routes.

#### Unit Tests - Common Components (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `uuidPattern regex matches valid UUIDs` | Test various valid UUID formats |
| 2 | `uuidPattern regex rejects invalid UUIDs` | Test malformed UUIDs, wrong length, invalid chars |
| 3 | `commonHeaders requires authorization header` | Validate schema requires authorization |
| 4 | `commonHeaders validates Bearer token pattern` | Test "Bearer xxx" format requirement |
| 5 | `paginationQuerystring enforces min/max on limit` | Test limit < 1 rejected, limit > 100 rejected |
| 6 | `errorResponse matches RFC 7807 ProblemDetails structure` | Verify required fields: type, title, status, timestamp |

#### Unit Tests - QR Schemas (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `generateQRSchema requires ticketId as UUID param` | Test non-UUID rejected |
| 2 | `validateQRSchema requires qr_data in body` | Test missing qr_data rejected |
| 3 | `validateQRSchema validates location lat/long bounds` | Test lat > 90, lon > 180 rejected |
| 4 | `validateQRSchema rejects additionalProperties` | Test unknown field rejected |
| 5 | `validateQRSchema response includes all status enums` | Verify VALID, INVALID, EXPIRED, ALREADY_USED |

#### Unit Tests - Device Schemas (8 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `registerDeviceSchema requires device_name, device_type, venue_id` | Test each missing field rejected |
| 2 | `registerDeviceSchema validates device_name pattern` | Test special chars rejected |
| 3 | `registerDeviceSchema validates device_type enum` | Test invalid type rejected |
| 4 | `registerDeviceSchema validates capabilities array enum` | Test invalid capability rejected |
| 5 | `listDevicesSchema accepts pagination params` | Test page, limit, sort accepted |
| 6 | `listDevicesSchema validates status enum filter` | Test invalid status rejected |
| 7 | `getDeviceSchema requires deviceId as UUID` | Test non-UUID rejected |
| 8 | `updateDeviceSchema requires at least one property` | Test empty body rejected (minProperties: 1) |

#### Unit Tests - Offline Schemas (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `getOfflineManifestSchema accepts optional query filters` | Test device_id, venue_id, event_id accepted |
| 2 | `getOfflineManifestSchema validates since as date-time` | Test invalid date rejected |
| 3 | `reconcileOfflineScansSchema requires device_id and scans array` | Test each missing rejected |
| 4 | `reconcileOfflineScansSchema validates scan items structure` | Test invalid scan item rejected |
| 5 | `reconcileOfflineScansSchema enforces scans array bounds` | Test min 1, max 1000 |
| 6 | `reconcileOfflineScansSchema requires offline: true const` | Test offline: false rejected |

#### Unit Tests - Policy Schemas (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `createPolicySchema requires name, venue_id, rules` | Test each missing rejected |
| 2 | `createPolicySchema validates rule type enum` | Test invalid rule type rejected |
| 3 | `createPolicySchema enforces priority range 0-100` | Test -1 and 101 rejected |
| 4 | `listPoliciesSchema accepts venue_id, event_id, active filters` | Test all accepted |
| 5 | `getPolicySchema requires policyId as UUID` | Test non-UUID rejected |
| 6 | `applyPolicySchema requires ticket_id` | Test missing ticket_id rejected |

#### Unit Tests - Scan Schema (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `processScanSchema requires qr_data and device_id` | Test each missing rejected |
| 2 | `processScanSchema validates scan_type enum` | Test invalid type rejected |
| 3 | `processScanSchema validates location lat/long bounds` | Test out-of-range rejected |
| 4 | `processScanSchema response includes all scan_result enums` | Verify ACCEPTED, REJECTED, PENDING |

---

### File: `src/validators/scan.validator.ts`

**Purpose:** Joi validation schemas for scan endpoints.

#### Unit Tests - scanRequestSchema (10 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Passes with valid qr_data and device_id` | Test valid input passes |
| 2 | `Fails when qr_data missing` | Verify required error |
| 3 | `Fails when qr_data format invalid` | Test wrong pattern rejected |
| 4 | `Fails when device_id missing` | Verify required error |
| 5 | `Fails when device_id not valid UUID` | Test non-UUID rejected |
| 6 | `Passes with optional location string` | Test location accepted |
| 7 | `Fails when location exceeds 200 chars` | Test max length enforced |
| 8 | `Passes with optional staff_user_id UUID` | Test valid UUID accepted |
| 9 | `Fails when staff_user_id not valid UUID` | Test non-UUID rejected |
| 10 | `Passes with optional metadata object` | Test object accepted |

#### Unit Tests - bulkScanRequestSchema (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Passes with array of valid scans` | Test valid array passes |
| 2 | `Fails when scans array empty` | Test min 1 enforced |
| 3 | `Fails when scans array exceeds 100 items` | Test max 100 enforced |
| 4 | `Fails when any scan item is invalid` | Test array item validation |

---

## Utils Layer

### File: `src/utils/logger.ts`

**Purpose:** Winston logger configuration with console and file transports.

#### Unit Tests (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Logger uses LOG_LEVEL from env` | Set LOG_LEVEL=debug, verify level |
| 2 | `Logger includes service name in defaultMeta` | Verify service: 'scanning-service' |
| 3 | `Logger formats errors with stack traces` | Log Error object, verify stack in output |
| 4 | `Logger outputs JSON format` | Verify JSON structure in output |
| 5 | `Logger creates file transport with correct path` | Verify file path and rotation config |

---

### File: `src/utils/metrics.ts`

**Purpose:** Prometheus metrics registry with 25+ custom metrics.

#### Unit Tests - Registry & Setup (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `register is a valid Prometheus Registry` | Verify instance type |
| 2 | `Default metrics are collected with scanning_service_ prefix` | Verify prefix in metric names |
| 3 | `All metrics are registered to the same registry` | Verify all use same register |

#### Unit Tests - HTTP Metrics (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `httpRequestTotal counter increments with labels` | Call inc(), verify count increases |
| 2 | `httpRequestDuration histogram observes with correct buckets` | Call observe(), verify buckets |

#### Unit Tests - Scanning Metrics (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `scansAllowedTotal counter increments with venue/event/access labels` | Test label combinations |
| 2 | `scansDeniedTotal counter increments with reason label` | Test denial reason tracking |
| 3 | `scanLatency histogram observes with result/venue labels` | Test latency recording |
| 4 | `qrGenerationDuration histogram has correct buckets` | Verify bucket values |
| 5 | `replayAttemptsTotal counter tracks replay attacks` | Test counter increment |
| 6 | `expiredQRAttemptsTotal counter tracks expired QR attempts` | Test counter increment |

#### Unit Tests - Policy Metrics (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `duplicateScansDetected counter increments` | Test counter works |
| 2 | `reentryAllowed counter increments` | Test counter works |
| 3 | `reentryDenied counter increments with reason` | Test reason label |
| 4 | `accessZoneViolations counter tracks zone violations` | Test labels |

#### Unit Tests - Offline Metrics (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `offlineManifestsGenerated counter increments` | Test counter works |
| 2 | `offlineScansReconciled counter increments with result` | Test result label |

#### Unit Tests - Infrastructure Metrics (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `databaseQueryDuration histogram observes with operation/table` | Test labels |
| 2 | `databaseConnectionsActive gauge sets/increments/decrements` | Test gauge operations |
| 3 | `redisCacheHits counter increments` | Test counter works |
| 4 | `redisCacheMisses counter increments` | Test counter works |
| 5 | `rateLimitExceeded counter increments` | Test counter works |

#### Unit Tests - Security Metrics (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `authenticationFailures counter increments with reason` | Test reason label |
| 2 | `venueIsolationViolations counter tracks violations` | Test labels |
| 3 | `tenantIsolationViolations counter tracks violations` | Test labels |

#### Unit Tests - Business Metrics (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `activeScans gauge sets current value` | Test gauge.set() |
| 2 | `scansPerMinute gauge sets current rate` | Test gauge.set() |
| 3 | `uniqueTicketsScanned counter increments` | Test counter works |

---

### File: `src/utils/secrets-manager.ts`

**Purpose:** AWS Secrets Manager client with caching and environment fallback.

#### Unit Tests (14 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Constructor does not create AWS client in non-production` | Set NODE_ENV=development, verify client null |
| 2 | `Constructor creates AWS client in production` | Set NODE_ENV=production, verify client exists |
| 3 | `getSecret returns env var in non-production` | Set env var, verify returned |
| 4 | `getSecret throws if env var missing in non-production` | Remove env var, verify error |
| 5 | `getSecret returns cached value if within TTL` | Set cache, verify no AWS call |
| 6 | `getSecret fetches from AWS if cache expired` | Set expired cache, verify AWS called |
| 7 | `getSecret caches fetched value with timestamp` | After fetch, verify cache populated |
| 8 | `getSecret falls back to env var if AWS fails` | Mock AWS error with env fallback |
| 9 | `getSecret throws if AWS fails and no env fallback` | Mock AWS error, no env, verify error |
| 10 | `clearCache empties the cache` | Call clearCache(), verify empty |
| 11 | `getSecrets returns multiple secrets as record` | Request multiple, verify Record returned |
| 12 | `getSecrets fetches each secret in order` | Verify sequential calls |
| 13 | `AWS client uses correct region from env` | Set AWS_REGION, verify used |
| 14 | `Cache TTL is 5 minutes (300000ms)` | Verify cacheTTL value |

#### Integration Tests (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `getSecret fetches real secret from AWS` | With real creds, verify retrieval |
| 2 | `getSecret handles AWS authentication errors` | With bad creds, verify error handling |
| 3 | `getSecrets fetches multiple secrets from AWS` | Request multiple, verify all returned |

---

## Middleware Layer

### File: `src/middleware/auth.middleware.ts`

**Purpose:** JWT authentication with role and permission-based access control.

#### Unit Tests - Helper Functions (8 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `validateJWTSecret returns false for empty secret` | Pass '', verify false |
| 2 | `validateJWTSecret returns false for secret < 32 chars` | Pass 31 chars, verify false |
| 3 | `validateJWTSecret returns true for secret >= 32 chars` | Pass 32+ chars, verify true |
| 4 | `getVerifyOptions returns correct issuer from env` | Set JWT_ISSUER, verify in options |
| 5 | `getVerifyOptions returns correct audience from env` | Set JWT_AUDIENCE, verify in options |
| 6 | `getVerifyOptions includes correct algorithms` | Verify RS256, HS256 |
| 7 | `getJWTSecret returns RSA public key when set` | Set JWT_PUBLIC_KEY, verify returned |
| 8 | `getJWTSecret throws when no secret configured` | Remove all secrets, verify error |

#### Unit Tests - authenticateRequest (18 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 401 when no Authorization header` | No header, verify 401 |
| 2 | `Returns 401 when Authorization header not Bearer format` | Use "Basic xxx", verify 401 |
| 3 | `Returns 500 when JWT not configured` | Remove JWT_SECRET, verify 500 |
| 4 | `Returns 401 for expired token` | Use expired JWT, verify 401 with token-expired type |
| 5 | `Returns 401 for token not yet valid` | Use future nbf, verify 401 |
| 6 | `Returns 401 for invalid token signature` | Tamper with signature, verify 401 |
| 7 | `Returns 401 for invalid token format` | Use malformed JWT, verify 401 |
| 8 | `Returns 401 when token missing userId claim` | JWT without userId, verify 401 |
| 9 | `Returns 401 when token missing tenantId claim` | JWT without tenantId, verify 401 |
| 10 | `Returns 401 when token missing role claim` | JWT without role, verify 401 |
| 11 | `Returns 401 when tenantId not valid UUID format` | Use non-UUID tenantId, verify 401 |
| 12 | `Sets request.user on successful auth` | Valid JWT, verify request.user populated |
| 13 | `Sets request.tenantId on successful auth` | Valid JWT, verify request.tenantId set |
| 14 | `Validates issuer claim matches config` | Wrong issuer, verify 401 |
| 15 | `Validates audience claim matches config` | Wrong audience, verify 401 |
| 16 | `Supports RS256 algorithm with public key` | Use RSA key pair, verify works |
| 17 | `Supports HS256 algorithm with secret` | Use symmetric secret, verify works |
| 18 | `Logs authentication duration` | Verify logger.debug called with durationMs |

#### Unit Tests - requireRole (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 401 when request.user not set` | No user, verify 401 |
| 2 | `Returns 403 when user role not in allowed list` | Wrong role, verify 403 |
| 3 | `Passes when user role matches single allowed role` | Matching role, verify passes |
| 4 | `Passes when user role matches one of multiple allowed roles` | Multiple roles, verify passes |
| 5 | `Response includes required roles and current role` | Verify response body |
| 6 | `Logs insufficient permissions warning` | Verify logger.warn called |

#### Unit Tests - requirePermission (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 401 when request.user not set` | No user, verify 401 |
| 2 | `Returns 403 when user missing required permissions` | Missing perms, verify 403 |
| 3 | `Passes when user has all required permissions` | All perms, verify passes |
| 4 | `Handles user with empty permissions array` | Empty array, verify 403 |
| 5 | `Response includes missing permissions list` | Verify response body |
| 6 | `Requires ALL permissions not just one` | Missing one, verify 403 |

#### Unit Tests - optionalAuthentication (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Continues without user when no token` | No header, verify continues |
| 2 | `Continues without user when invalid token` | Bad token, verify continues |
| 3 | `Sets request.user when valid token` | Valid token, verify user set |
| 4 | `Handles JWT config errors gracefully` | No secret, verify continues |

#### Unit Tests - authenticateInternalService (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 401 when missing x-service-key header` | No key, verify 401 |
| 2 | `Returns 401 when missing x-service-name header` | No name, verify 401 |
| 3 | `Returns 500 when INTERNAL_SERVICE_KEY not configured` | No env var, verify 500 |
| 4 | `Returns 401 when service key does not match` | Wrong key, verify 401 |
| 5 | `Returns 403 when service not in allowed list` | Unlisted service, verify 403 |
| 6 | `Passes when key matches and service allowed` | Valid creds, verify passes |

#### Integration Tests (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Full auth flow with real JWT token generation/validation` | Generate and validate JWT |
| 2 | `Role-based access works end-to-end` | Test route with role check |
| 3 | `Permission-based access works end-to-end` | Test route with permission check |
| 4 | `Service-to-service auth works with real headers` | Test internal auth |

---

### File: `src/middleware/tenant.middleware.ts`

**Purpose:** PostgreSQL RLS tenant context setter with helper functions.

#### Unit Tests (10 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `setTenantContext skips when no tenantId on request` | No tenantId, verify no query |
| 2 | `setTenantContext calls pool.query with correct tenant` | Verify set_tenant_context($1) called |
| 3 | `setTenantContext returns 500 on database error` | Mock error, verify 500 |
| 4 | `setTenantContext logs tenant context set` | Verify logger.debug called |
| 5 | `getTenantClient returns client with context set` | Verify context set before return |
| 6 | `getTenantClient releases client on context error` | Mock error, verify release called |
| 7 | `queryWithTenant executes query with tenant context` | Verify query executed |
| 8 | `queryWithTenant releases client after query` | Verify client.release called |
| 9 | `transactionWithTenant commits on success` | Verify COMMIT executed |
| 10 | `transactionWithTenant rolls back on error` | Mock error, verify ROLLBACK |

#### Integration Tests (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `setTenantContext sets RLS context in real PostgreSQL` | Verify current_setting works |
| 2 | `getTenantClient creates working client with context` | Verify queries work |
| 3 | `queryWithTenant respects RLS policies` | Verify data filtered |
| 4 | `transactionWithTenant maintains context through transaction` | Verify context persists |
| 5 | `Queries fail when tenant context not set` | RLS blocks access |

---

### File: `src/middleware/tenant-context.ts`

**Purpose:** Alternative tenant context implementation supporting Knex and pg Pool.

#### Unit Tests (10 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Extracts tenant_id from user.tenant_id` | Set user.tenant_id, verify used |
| 2 | `Extracts tenantId from user.tenantId` | Set user.tenantId (camelCase), verify used |
| 3 | `Falls back to request.tenantId` | No user.tenantId, verify request.tenantId used |
| 4 | `Falls back to DEFAULT_TENANT_ID when none available` | No tenant anywhere, verify default |
| 5 | `Uses Knex raw query when db.raw available` | Mock db.raw, verify called |
| 6 | `Uses pg Pool query when db.query available` | Mock db.query, verify called |
| 7 | `Sets request.tenantId after setting context` | Verify request updated |
| 8 | `Throws error on database failure` | Mock error, verify thrown |
| 9 | `requireTenantContext returns 401 when no tenantId` | No tenant, verify 401 |
| 10 | `requireTenantContext warns on default tenant usage` | Default tenant, verify warning |

#### Integration Tests (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Sets tenant context with real database connection` | Test with real DB |
| 2 | `RLS policies filter data based on set context` | Verify filtering works |

---

### File: `src/middleware/correlation-id.ts`

**Purpose:** Distributed tracing with correlation ID generation and propagation.

#### Unit Tests - generateCorrelationId (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns valid UUID v4 format` | Verify UUID regex match |
| 2 | `Returns unique IDs on each call` | Call twice, verify different |

#### Unit Tests - extractCorrelationId (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Extracts from x-correlation-id header` | Set header, verify extracted |
| 2 | `Extracts from x-request-id header` | Set header, verify extracted |
| 3 | `Extracts from x-trace-id header` | Set header, verify extracted |
| 4 | `Extracts trace-id portion from traceparent header` | Set W3C header, verify parsed |
| 5 | `Returns first value when header is array` | Set array header, verify first |
| 6 | `Returns undefined when no correlation headers present` | No headers, verify undefined |

#### Unit Tests - isValidCorrelationId (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns true for valid UUID` | Test UUID, verify true |
| 2 | `Returns true for valid hex string` | Test hex, verify true |
| 3 | `Returns false for empty string` | Test '', verify false |
| 4 | `Returns false for string < 8 chars` | Test 7 chars, verify false |
| 5 | `Returns false for string > 128 chars` | Test 129 chars, verify false |

#### Unit Tests - correlationIdMiddleware (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Uses existing valid correlation ID from headers` | Set valid header, verify used |
| 2 | `Generates new ID when none present` | No header, verify generated |
| 3 | `Generates new ID when invalid ID received` | Set invalid, verify new generated |
| 4 | `Sets request.correlationId` | Verify request property set |
| 5 | `Sets response header` | Verify x-correlation-id header |

#### Unit Tests - Helper Functions (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `createServiceContext returns correct structure` | Verify correlationId, tenantId, userId, timestamp |
| 2 | `getCorrelationHeaders includes correlation ID` | Verify x-correlation-id present |
| 3 | `getCorrelationHeaders includes tenant ID when present` | Verify x-tenant-id present |
| 4 | `getCorrelationHeaders forwards authorization header` | Verify authorization forwarded |
| 5 | `getCurrentCorrelationId returns ID from async storage` | Set storage, verify returned |
| 6 | `runWithCorrelation sets context for function execution` | Run function, verify context |

#### Integration Tests (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Correlation ID propagates through request lifecycle` | Full request, verify propagation |
| 2 | `AsyncLocalStorage maintains context across async calls` | Async operations, verify context |

---

### File: `src/middleware/rate-limit.middleware.ts`

**Purpose:** Rate limiter factory with 5 different limiters for various use cases.

#### Unit Tests - createRateLimiter (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns config with default values` | Call with no args, verify defaults |
| 2 | `Overrides defaults with provided options` | Pass options, verify used |
| 3 | `Uses custom keyGenerator when provided` | Pass keyGenerator, verify in config |
| 4 | `Uses custom errorResponseBuilder when provided` | Pass builder, verify in config |

#### Unit Tests - apiRateLimiter (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Has max 100 requests` | Verify max: 100 |
| 2 | `Has 15-minute window` | Verify timeWindow: 900000 |

#### Unit Tests - scanRateLimiter (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Has max 10 requests per minute` | Verify max: 10, timeWindow: 60000 |
| 2 | `Key generator uses IP:device_id combination` | Test keyGenerator output |
| 3 | `Key generator falls back to unknown for missing device_id` | No device_id, verify 'unknown' |
| 4 | `Error response includes RATE_LIMIT_EXCEEDED error` | Verify error format |

#### Unit Tests - deviceRateLimiter (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Has max 50 requests per 5 minutes` | Verify max: 50, timeWindow: 300000 |
| 2 | `Key generator uses device_id or falls back to IP` | Test both cases |

#### Unit Tests - staffRateLimiter (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Has max 30 requests per minute` | Verify max: 30, timeWindow: 60000 |
| 2 | `Key generator uses staff_user_id` | Verify staff_user_id used |

#### Unit Tests - failedAttemptLimiter (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Has max 5 failed attempts per 10 minutes` | Verify max: 5, timeWindow: 600000 |
| 2 | `Has skipSuccessfulRequests enabled` | Verify skipSuccessfulRequests: true |
| 3 | `Key generator includes IP, device_id, and staff_id` | Test key format |
| 4 | `Error response mentions account locked` | Verify message content |

#### Integration Tests (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Rate limiter blocks after max requests exceeded` | Exceed limit, verify 429 |
| 2 | `Rate limiter resets after time window` | Wait, verify allowed again |
| 3 | `Different keys are tracked independently` | Different IPs, verify independent |
| 4 | `Failed attempt limiter only counts failures` | Success doesn't count |

---

### File: `src/middleware/validation.middleware.ts`

**Purpose:** Joi validation middleware factory for body, params, and query.

#### Unit Tests - validateRequest (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Passes validation and replaces body with validated data` | Valid body, verify replaced |
| 2 | `Returns 400 with error details on validation failure` | Invalid body, verify 400 |
| 3 | `Returns all validation errors` | Multiple errors, verify all returned |
| 4 | `Strips unknown fields from body` | Extra fields, verify stripped |
| 5 | `Error response includes field paths` | Verify field in details |

#### Unit Tests - validateParams (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Passes validation and replaces params` | Valid params, verify replaced |
| 2 | `Returns 400 on validation failure` | Invalid params, verify 400 |
| 3 | `Returns all validation errors` | Multiple errors, verify all returned |
| 4 | `Strips unknown params` | Extra params, verify stripped |
| 5 | `Error message says Parameter validation failed` | Verify message text |

#### Unit Tests - validateQuery (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Passes validation and replaces query` | Valid query, verify replaced |
| 2 | `Returns 400 on validation failure` | Invalid query, verify 400 |
| 3 | `Returns all validation errors` | Multiple errors, verify all returned |
| 4 | `Strips unknown query params` | Extra params, verify stripped |
| 5 | `Error message says Query validation failed` | Verify message text |

---

## Services Layer

### File: `src/services/QRGenerator.ts`

**Purpose:** Rotating QR code generation with HMAC signatures and offline manifest support.

#### Unit Tests - Constructor (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Uses HMAC_SECRET from env` | Set env, verify used |
| 2 | `Falls back to default secret when env not set` | No env, verify default |
| 3 | `Uses QR_ROTATION_SECONDS from env` | Set env, verify used (default 30) |

#### Unit Tests - generateRotatingQR (12 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns success:true for valid ticket` | Valid ticket, verify success |
| 2 | `Throws error when ticket not found` | Invalid ticketId, verify error |
| 3 | `Returns qr_data in format ticketId:timestamp:nonce:hmac` | Verify format with regex |
| 4 | `Returns base64 PNG qr_image` | Verify starts with data:image/png |
| 5 | `Returns expires_at based on rotation seconds` | Verify expiration time |
| 6 | `Returns ticket metadata` | Verify id, ticket_number, event_name, event_date, access_level |
| 7 | `Defaults access_level to GA when null` | Null access_level, verify 'GA' |
| 8 | `Generates unique nonce on each call` | Call twice, verify different nonces |
| 9 | `HMAC is SHA256 of ticketId:timestamp:nonce` | Verify HMAC computation |
| 10 | `QR image has correct dimensions` | Verify 300x300 |
| 11 | `QR image has error correction level M` | Verify QR options |
| 12 | `Handles database errors gracefully` | Mock error, verify thrown |

#### Unit Tests - generateOfflineManifest (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns manifest with correct event_id and device_id` | Verify properties |
| 2 | `Sets expires_at to 4 hours from generation` | Verify time difference |
| 3 | `Includes only SOLD and MINTED tickets` | Verify filtering |
| 4 | `Generates unique offline_token per ticket` | Verify HMAC per ticket |
| 5 | `Returns empty tickets object when no tickets for event` | Empty event, verify {} |

#### Unit Tests - validateOfflineScan (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns true for valid offline token` | Valid token, verify true |
| 2 | `Returns false for invalid/tampered token` | Tampered token, verify false |

#### Integration Tests (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `generateRotatingQR queries real database for ticket` | Real DB, verify query |
| 2 | `generateRotatingQR joins tickets with events table` | Verify join works |
| 3 | `generateOfflineManifest retrieves all event tickets` | Real DB, verify all tickets |
| 4 | `Generated QR code is scannable and contains correct data` | Scan QR, verify data |
| 5 | `Offline token validates correctly after manifest generation` | Generate then validate |
| 6 | `Tenant isolation - only returns tickets for current tenant` | Verify RLS filtering |

---

### File: `src/services/QRValidator.ts`

**Purpose:** Complete scan validation with policy enforcement and security checks.

#### Unit Tests - Constructor (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Throws error when HMAC_SECRET not set` | No env, verify error |
| 2 | `Sets hmacSecret from env` | Set env, verify used |
| 3 | `Sets timeWindowSeconds to 30` | Verify default value |

#### Unit Tests - validateQRToken (10 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns valid:true for valid token within time window` | Valid token, verify true |
| 2 | `Returns valid:false reason:QR_EXPIRED for old token` | Old timestamp, verify expired |
| 3 | `Returns valid:false reason:QR_ALREADY_USED when nonce reused` | Reuse nonce, verify rejected |
| 4 | `Returns valid:false reason:INVALID_QR for bad HMAC` | Wrong HMAC, verify invalid |
| 5 | `Uses timing-safe comparison for HMAC` | Verify timingSafeEqual used |
| 6 | `Stores used nonce in Redis with 60s TTL` | Verify redis.setex called |
| 7 | `Logs warning on replay attack detection` | Verify logger.warn called |
| 8 | `Handles Redis errors gracefully` | Mock error, verify handling |
| 9 | `Correctly computes HMAC from ticketId:timestamp:nonce` | Verify computation |
| 10 | `Rejects token with mismatched buffer lengths` | Wrong length, verify rejected |

#### Unit Tests - checkDuplicate (8 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns isDuplicate:true when Redis cache hit` | Cache hit, verify true |
| 2 | `Returns isDuplicate:false when no cache and no DB record` | No data, verify false |
| 3 | `Returns isDuplicate:true with lastScan from database` | DB record, verify lastScan |
| 4 | `Caches result in Redis after DB lookup` | Verify redis.setex called |
| 5 | `Validates windowMinutes is finite number` | Non-finite, verify error |
| 6 | `Throws error for negative windowMinutes` | Negative, verify error |
| 7 | `Throws error for windowMinutes > 1440` | > 1440, verify error |
| 8 | `Uses parameterized query for SQL injection prevention` | Verify $1, $2 params |

#### Unit Tests - checkReentryPolicy (8 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns allowed:false reason:NO_REENTRY when no policy` | No policy, verify rejected |
| 2 | `Returns allowed:false reason:REENTRY_DISABLED when disabled` | Disabled policy, verify rejected |
| 3 | `Returns allowed:false reason:MAX_REENTRIES_REACHED at limit` | At max, verify rejected |
| 4 | `Returns allowed:false reason:COOLDOWN_ACTIVE during cooldown` | In cooldown, verify rejected |
| 5 | `Returns minutesRemaining when cooldown active` | Verify minutesRemaining value |
| 6 | `Returns allowed:true when all checks pass` | Valid reentry, verify allowed |
| 7 | `Handles null lastScannedAt for first entry` | Null, verify no cooldown check |
| 8 | `Queries only active policies` | Verify is_active = true filter |

#### Unit Tests - checkAccessZone (7 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `BACKSTAGE ticket only allows BACKSTAGE zone` | BACKSTAGE ticket, verify restrictions |
| 2 | `VIP ticket allows VIP and GA zones` | VIP ticket, verify VIP, GA allowed |
| 3 | `GA ticket only allows GA zone` | GA ticket, verify only GA |
| 4 | `ALL ticket allows all zones` | ALL ticket, verify all zones |
| 5 | `Returns reason:WRONG_ZONE for unauthorized zone` | Wrong zone, verify reason |
| 6 | `Returns required and deviceZone in response` | Verify both properties |
| 7 | `Defaults to GA when ticket access level unknown` | Unknown level, verify GA default |

#### Unit Tests - validateScan Happy Path (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns valid:true result:ALLOW for valid scan` | Valid scan, verify allowed |
| 2 | `Updates ticket scan_count and last_scanned_at` | Verify UPDATE query |
| 3 | `Sets first_scanned_at on first scan` | First scan, verify set |
| 4 | `Logs ALLOW scan to database` | Verify logScan called |
| 5 | `Clears and sets Redis duplicate cache` | Verify redis operations |
| 6 | `Returns ticket metadata in response` | Verify ticket object |

#### Unit Tests - validateScan QR Validation (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns DENY for expired QR` | Expired QR, verify denied |
| 2 | `Returns DENY for invalid QR format` | Not 4 parts, verify denied |
| 3 | `Returns DENY for invalid HMAC` | Bad HMAC, verify denied |
| 4 | `Parses QR data from string or object` | Test both formats |

#### Unit Tests - validateScan Device Validation (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns DENY for unknown device` | Unknown device_id, verify denied |
| 2 | `Returns DENY for inactive device` | is_active=false, verify denied |
| 3 | `Gets device by device_id` | Verify correct query |

#### Unit Tests - validateScan Tenant/Venue Isolation (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns DENY when device venue != staff venue` | Mismatch, verify denied |
| 2 | `Returns DENY when device tenant != staff tenant` | Mismatch, verify denied |
| 3 | `Returns DENY when ticket tenant != staff tenant` | Mismatch, verify denied |
| 4 | `Returns DENY when ticket venue != device venue` | Mismatch, verify denied |
| 5 | `Logs CRITICAL for tenant isolation violations` | Verify logger.error |
| 6 | `Returns generic error message for tenant mismatch` | Verify no leak |

#### Unit Tests - validateScan Ticket Status (8 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns DENY for REFUNDED ticket` | Refunded, verify denied |
| 2 | `Returns DENY for CANCELLED ticket` | Cancelled, verify denied |
| 3 | `Returns DENY for TRANSFERRED ticket` | Transferred, verify denied with new ID |
| 4 | `Returns DENY for invalid status` | Not SOLD/MINTED, verify denied |
| 5 | `Returns DENY when event not started` | Before start, verify denied |
| 6 | `Returns DENY when event ended` | After end, verify denied |
| 7 | `Returns DENY when ticket not yet valid` | Before valid_from, verify denied |
| 8 | `Returns DENY when ticket expired` | After valid_until, verify denied |

#### Unit Tests - validateScan Policy Enforcement (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns DENY for wrong access zone` | Wrong zone, verify denied |
| 2 | `Returns DENY for duplicate scan no reentry` | Duplicate, verify denied |
| 3 | `Returns DENY when max reentries reached` | At max, verify denied |
| 4 | `Returns DENY during cooldown period` | In cooldown, verify denied |

#### Unit Tests - validateScan Error Handling (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Rolls back transaction on error` | Error, verify ROLLBACK |
| 2 | `Returns result:ERROR reason:SYSTEM_ERROR` | Error, verify response |
| 3 | `Releases database client in finally block` | Verify client.release called |

#### Unit Tests - logScan (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Inserts scan record with correct fields` | Verify INSERT query |
| 2 | `Uses provided client for transaction support` | Verify client used |

#### Unit Tests - getScanStats (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns all stat fields` | Verify allowed, denied, duplicates, etc. |
| 2 | `Throws error for invalid time range` | Invalid range, verify error |
| 3 | `Accepts valid time ranges` | Test 1 hour, 24 hours, 7 days |
| 4 | `Uses parameterized query` | Verify SQL injection prevention |
| 5 | `Filters by event_id` | Verify event filter |
| 6 | `Filters by time window` | Verify time filter |

#### Integration Tests (12 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Full scan validation flow with real database` | End-to-end validation |
| 2 | `Nonce replay prevention works with real Redis` | Test replay blocking |
| 3 | `Duplicate detection works across cache and database` | Test both paths |
| 4 | `Re-entry policy loaded from scan_policies table` | Real policy lookup |
| 5 | `Tenant isolation enforced at database level` | Test RLS |
| 6 | `Venue isolation enforced correctly` | Test venue checks |
| 7 | `Scan logging creates audit trail` | Verify scans table |
| 8 | `Transaction rollback on validation failure` | Verify no partial commits |
| 9 | `Redis cache properly set/cleared during scan` | Test cache operations |
| 10 | `Access zone hierarchy enforced` | Test zone permissions |
| 11 | `Ticket status updates persist correctly` | Verify scan_count updates |
| 12 | `getScanStats returns accurate counts` | Verify aggregations |

---

### File: `src/services/DeviceManager.ts`

**Purpose:** Scanner device lifecycle management.

#### Unit Tests - registerDevice (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Generates device ID if not provided` | No ID, verify SCANNER-xxx format |
| 2 | `Uses provided deviceId when given` | Pass ID, verify used |
| 3 | `Inserts device with all fields` | Verify INSERT query |
| 4 | `Defaults deviceType to mobile` | No type, verify 'mobile' |
| 5 | `Defaults canScanOffline to false` | No flag, verify false |
| 6 | `Throws Device ID already exists on duplicate` | Duplicate, verify error |

#### Unit Tests - revokeDevice (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Sets is_active to false` | Verify UPDATE query |
| 2 | `Records revoked_at, revoked_by, revoked_reason` | Verify fields set |
| 3 | `Throws Device not found when device does not exist` | Invalid ID, verify error |
| 4 | `Returns updated device record` | Verify RETURNING * |

#### Unit Tests - getDevice (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns device for valid deviceId` | Valid ID, verify device returned |
| 2 | `Returns null when device not found` | Invalid ID, verify null |
| 3 | `Queries by device_id` | Verify query parameter |

#### Unit Tests - listVenueDevices (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns only active devices when activeOnly true` | Verify filter |
| 2 | `Returns all devices when activeOnly false` | No filter, verify all |
| 3 | `Orders by registered_at DESC` | Verify ORDER BY |

#### Unit Tests - updateDeviceSync (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Updates last_sync_at to NOW` | Verify UPDATE query |
| 2 | `Returns success:true` | Verify response |

#### Integration Tests (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Full device registration persists to database` | Real insert |
| 2 | `Revoked device cannot be used for scanning` | Test revocation effect |
| 3 | `listVenueDevices respects tenant isolation` | Test RLS |
| 4 | `Device sync timestamp updates correctly` | Verify timestamp |
| 5 | `Duplicate device ID rejected by database constraint` | Test unique constraint |
| 6 | `Device metadata stored as JSONB` | Test JSON storage |

---

### File: `src/services/OfflineCache.ts`

**Purpose:** Offline scanning validation cache management.

#### Unit Tests - Constructor (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Uses OFFLINE_CACHE_DURATION_MINUTES from env` | Set env, verify used |
| 2 | `Defaults to 30 minutes when env not set` | No env, verify 30 |

#### Unit Tests - generateEventCache (10 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns success:true with ticket count` | Verify response |
| 2 | `Creates cache entries only for SOLD and TRANSFERRED` | Verify filtering |
| 3 | `Generates qr_hmac_secret for tickets without one` | Verify secret generation |
| 4 | `Computes validationHash using ticket HMAC secret` | Verify hash computation |
| 5 | `Sets validFrom to current time` | Verify timestamp |
| 6 | `Sets validUntil based on cacheWindowMinutes` | Verify expiration |
| 7 | `Deletes expired cache entries before inserting` | Verify DELETE query |
| 8 | `Uses upsert ON CONFLICT DO UPDATE` | Verify upsert |
| 9 | `Rolls back transaction on error` | Error, verify ROLLBACK |
| 10 | `Returns cacheSize in bytes` | Verify size calculation |

#### Unit Tests - getDeviceCache (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Throws error if device not found` | Invalid ID, verify error |
| 2 | `Throws error if device not active` | Inactive, verify error |
| 3 | `Throws error if device cannot scan offline` | No permission, verify error |
| 4 | `Returns only valid cache entries` | Verify time filter |
| 5 | `Updates device last_sync_at timestamp` | Verify UPDATE |

#### Unit Tests - validateOfflineScan (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns valid:true for matching hash within window` | Valid, verify true |
| 2 | `Returns valid:false error:INVALID_OFFLINE_HASH for bad hash` | Bad hash, verify error |
| 3 | `Returns valid:false for expired cache entry` | Expired, verify false |

#### Integration Tests (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `generateEventCache creates entries in database` | Real insert |
| 2 | `getDeviceCache retrieves correct entries` | Real query |
| 3 | `Offline validation works with real cache data` | End-to-end |
| 4 | `Expired cache entries cleaned up properly` | Verify cleanup |
| 5 | `Tenant isolation enforced on cache operations` | Test RLS |
| 6 | `Device offline authorization checked against database` | Real check |

---

### File: `src/services/analytics-dashboard.service.ts`

**Purpose:** Comprehensive scanning analytics and dashboard metrics.

#### Unit Tests - getDashboardMetrics (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns all metric sections` | Verify realtime, historical, devices, patterns, alerts |
| 2 | `Calls all sub-methods in parallel` | Verify Promise.all |
| 3 | `Handles errors and logs them` | Error, verify logging |

#### Unit Tests - getRealtimeMetrics (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns currentScansPerMinute from last minute` | Verify count |
| 2 | `Returns activeDevices count` | Verify count |
| 3 | `Calculates successRate correctly` | Verify percentage |
| 4 | `Returns avgResponseTime` | Verify average |
| 5 | `Returns topDenialReasons top 5` | Verify limit 5 |
| 6 | `Handles zero scans returns 0 percent` | Zero, verify 0 |

#### Unit Tests - getHistoricalMetrics (7 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns totalScans for time range` | Verify count |
| 2 | `Returns uniqueTickets count` | Verify distinct count |
| 3 | `Returns allowedScans and deniedScans` | Verify both |
| 4 | `Calculates successRate correctly` | Verify percentage |
| 5 | `Identifies peakHour` | Verify hour with max scans |
| 6 | `Returns scansByHour array` | Verify 24 hours |
| 7 | `Returns scansByDay array with formatted dates` | Verify ISO dates |

#### Unit Tests - getDeviceMetrics (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns metrics for all venue devices` | Verify all devices |
| 2 | `Calculates per-device successRate` | Verify percentage |
| 3 | `Determines status as active when scanned < 5 min ago` | Verify status |
| 4 | `Determines status as idle when active but no recent scans` | Verify status |
| 5 | `Determines status as offline when is_active false` | Verify status |

#### Unit Tests - getEntryPatterns (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns top 10 peakTimes` | Verify limit 10 |
| 2 | `Returns entryDistribution by zone` | Verify zone breakdown |
| 3 | `Calculates reentryRate percentage` | Verify percentage |
| 4 | `Returns avgScansPerTicket` | Verify average |
| 5 | `Handles events with no scans` | Empty, verify defaults |

#### Unit Tests - getAlerts (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Creates anomaly alerts for high denial rates` | > 10 in 5 min |
| 2 | `Creates performance alerts for devices with > 50% denial` | Verify alert |
| 3 | `Sets severity based on count thresholds` | > 50 = high |
| 4 | `Returns max 10 alerts` | Verify slice |

#### Unit Tests - exportAnalytics (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns CSV format with headers and data` | Verify CSV structure |
| 2 | `Returns JSON format when specified` | Verify JSON output |

#### Integration Tests (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Full dashboard metrics query against real database` | End-to-end |
| 2 | `Real-time metrics reflect actual scan data` | Verify accuracy |
| 3 | `Historical metrics aggregate correctly` | Verify sums |
| 4 | `Device metrics respect venue filtering` | Test filter |
| 5 | `Alerts generated from actual scan patterns` | Real alerts |
| 6 | `Export generates valid CSV/JSON` | Verify format |

---

### File: `src/services/anomaly-detector.service.ts`

**Purpose:** Fraud and suspicious pattern detection with risk scoring.

#### Unit Tests - analyzeScan (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns detected:false when no anomalies` | Clean scan, verify false |
| 2 | `Returns detected:true with anomalies array` | Anomaly found, verify array |
| 3 | `Runs all detection methods in parallel` | Verify Promise.all |
| 4 | `Calculates riskScore from anomalies` | Verify score |
| 5 | `Records anomaly when riskScore > 70` | High risk, verify recorded |

#### Unit Tests - detectScreenshotFraud (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns null for normal scan pattern` | Normal, verify null |
| 2 | `Returns anomaly for > 3 scans in 5 seconds` | Fast scans, verify anomaly |
| 3 | `Returns critical severity for multiple devices` | Multi-device, verify critical |
| 4 | `Returns high severity for single device` | Single device, verify high |
| 5 | `Evidence includes count, devices, timeWindow` | Verify evidence object |

#### Unit Tests - detectDuplicateDeviceScans (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns null for <= 2 devices` | 2 devices, verify null |
| 2 | `Returns anomaly for > 2 devices in 1 minute` | 3+ devices, verify anomaly |
| 3 | `Evidence includes deviceCount and device list` | Verify evidence |
| 4 | `Sets severity to high` | Verify severity |

#### Unit Tests - detectTimingAnomalies (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns null for normal hours` | 9 AM, verify null |
| 2 | `Returns anomaly for scans between 2-5 AM` | 3 AM, verify anomaly |
| 3 | `Sets severity to low` | Verify severity |

#### Unit Tests - detectPatternAnomalies (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns null for low denial rate` | 10%, verify null |
| 2 | `Returns anomaly for > 50% denial rate with > 10 scans` | High rate, verify anomaly |
| 3 | `Evidence includes total, denied, denialRate` | Verify evidence |
| 4 | `Sets severity to medium` | Verify severity |

#### Unit Tests - calculateRiskScore (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 0 for no anomalies` | Empty array, verify 0 |
| 2 | `Returns 10 for single low severity` | Low, verify 10 |
| 3 | `Returns 100 for single critical` | Critical, verify 100 |
| 4 | `Weights 70% max score 30% average` | Multiple, verify formula |
| 5 | `Caps at 100` | High total, verify 100 max |

#### Unit Tests - recordAnomaly (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Inserts record with all fields` | Verify INSERT |
| 2 | `Handles database errors gracefully` | Error, verify no throw |

#### Unit Tests - getAnomalyStats (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns aggregated stats for time range` | Verify aggregations |
| 2 | `Filters by venueId` | Verify venue filter |

#### Integration Tests (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Screenshot fraud detected from real scan data` | Real detection |
| 2 | `Duplicate device detection works across tables` | Real detection |
| 3 | `Anomalies recorded to scan_anomalies table` | Verify persistence |
| 4 | `getAnomalyStats aggregates correctly` | Real aggregation |
| 5 | `Tenant isolation enforced on anomaly queries` | Test RLS |

---

## Routes Layer

### File: `src/routes/scan.ts`

**Purpose:** Main ticket scanning endpoint with full security stack.

#### Unit Tests - POST /api/scan (10 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 401 without authentication` | No auth, verify 401 |
| 2 | `Returns 403 for unauthorized role` | Wrong role, verify 403 |
| 3 | `Returns 400 for missing qr_data` | No qr_data, verify 400 |
| 4 | `Returns 400 for missing device_id` | No device_id, verify 400 |
| 5 | `Returns 400 for invalid qr_data format` | Bad format, verify 400 |
| 6 | `Returns 400 for invalid device_id not UUID` | Non-UUID, verify 400 |
| 7 | `Calls qrValidator.validateScan with correct params` | Verify call |
| 8 | `Passes authenticated user context to validateScan` | Verify user passed |
| 9 | `Increments scansAllowedTotal metric on success` | Success, verify metric |
| 10 | `Increments scansDeniedTotal metric with reason on failure` | Failure, verify metric |

#### Unit Tests - POST /api/scan/bulk (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 501 Not Implemented` | Call, verify 501 |
| 2 | `Requires authentication and role` | No auth, verify 401 |

#### Integration Tests (8 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Full scan flow with valid JWT and QR code` | End-to-end success |
| 2 | `Rate limiter blocks after 10 requests per minute` | Exceed limit, verify 429 |
| 3 | `Authentication middleware validates JWT` | Invalid JWT, verify 401 |
| 4 | `Role check rejects unauthorized users` | Wrong role, verify 403 |
| 5 | `Validation middleware rejects bad input` | Invalid body, verify 400 |
| 6 | `Metrics recorded correctly` | Verify Prometheus metrics |
| 7 | `Tenant isolation enforced through user context` | Cross-tenant, verify denied |
| 8 | `Venue isolation enforced through user context` | Cross-venue, verify denied |

#### E2E Tests (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Valid staff scans ticket -> entry allowed` | Full flow success |
| 2 | `Valid staff scans expired QR -> denied with QR_EXPIRED` | Expired QR test |
| 3 | `Valid staff scans duplicate -> denied with DUPLICATE` | Duplicate test |
| 4 | `Staff from wrong venue -> denied with VENUE_MISMATCH` | Venue isolation |
| 5 | `Staff from wrong tenant -> denied with UNAUTHORIZED` | Tenant isolation |
| 6 | `Unauthenticated request -> 401 Unauthorized` | No auth test |

---

### File: `src/routes/qr.ts`

**Purpose:** QR code generation, validation, and management.

#### Unit Tests - GET /api/qr/generate/:ticketId (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 401 without authentication` | No auth, verify 401 |
| 2 | `Returns 403 for unauthorized role` | Wrong role, verify 403 |
| 3 | `Returns 400 for invalid ticketId not UUID` | Non-UUID, verify 400 |
| 4 | `Returns 404 when ticket not found` | Invalid ticket, verify 404 |
| 5 | `Returns QR data with qr_code, qr_data, expires_at` | Success, verify response |
| 6 | `Calls qrGenerator.generateRotatingQR with ticketId` | Verify call |

#### Unit Tests - POST /api/qr/validate (7 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 401 without authentication` | No auth, verify 401 |
| 2 | `Returns 403 for unauthorized role` | Wrong role, verify 403 |
| 3 | `Returns 400 for qr_data too short` | < 10 chars, verify 400 |
| 4 | `Returns 400 for missing colon separator` | No colon, verify 400 |
| 5 | `Returns 400 for invalid ticket ID not UUID` | Non-UUID in QR, verify 400 |
| 6 | `Returns valid:true for correct format` | Valid format, verify true |
| 7 | `Extracts and returns ticket_id from QR data` | Verify extraction |

#### Unit Tests - GET /api/qr/status/:ticketId (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 401 without authentication` | No auth, verify 401 |
| 2 | `Returns 400 for invalid ticketId` | Non-UUID, verify 400 |
| 3 | `Returns status with qr_enabled, rotation_enabled, scanned` | Success, verify response |

#### Unit Tests - POST /api/qr/revoke/:ticketId (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 401 without authentication` | No auth, verify 401 |
| 2 | `Returns 403 for non-admin role` | Non-admin, verify 403 |
| 3 | `Returns success with revoked_at and revoked_by` | Success, verify response |
| 4 | `Accepts optional reason in body` | With reason, verify accepted |

#### Integration Tests (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Generate QR creates valid scannable code` | Generate and decode |
| 2 | `Validate rejects tampered QR data` | Tamper, verify rejected |
| 3 | `Status reflects actual ticket state` | Real ticket, verify state |
| 4 | `Revoke invalidates future scans` | Revoke then scan, verify denied |

#### E2E Tests (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Ticket holder generates QR -> scans successfully` | Full flow |
| 2 | `Admin revokes QR -> scan fails` | Revocation flow |
| 3 | `QR expires after rotation window` | Wait, verify expired |
| 4 | `Invalid QR format rejected at validation` | Bad format test |

---

### File: `src/routes/devices.ts`

**Purpose:** Device registration and listing.

#### Unit Tests - GET /api/devices (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns list of active devices` | Call, verify array |
| 2 | `Orders by name` | Verify ORDER BY name |
| 3 | `Returns 500 on database error` | Mock error, verify 500 |

#### Unit Tests - POST /api/devices/register (5 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 400 when device_id missing` | No device_id, verify 400 |
| 2 | `Returns 400 when name missing` | No name, verify 400 |
| 3 | `Defaults zone to GA` | No zone, verify 'GA' |
| 4 | `Creates new device on first registration` | New device, verify INSERT |
| 5 | `Updates existing device on conflict upsert` | Existing, verify UPDATE |

#### Integration Tests (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Device list queries real database` | Real query |
| 2 | `Registration persists to database` | Verify persistence |
| 3 | `Upsert updates existing device` | Register twice, verify update |
| 4 | `Tenant isolation on device queries RLS` | Test isolation |

---

### File: `src/routes/offline.ts`

**Purpose:** Offline scanning manifest generation and reconciliation.

#### Unit Tests - GET /api/offline/manifest/:eventId (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 400 when device_id missing` | No device_id, verify 400 |
| 2 | `Returns manifest for valid event and device` | Valid request, verify manifest |
| 3 | `Calls qrGenerator.generateOfflineManifest` | Verify call |
| 4 | `Returns 500 on error` | Mock error, verify 500 |

#### Unit Tests - POST /api/offline/reconcile (10 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 400 when device_id missing` | No device_id, verify 400 |
| 2 | `Returns 400 when scans not array` | Non-array, verify 400 |
| 3 | `Skips duplicate scans already processed` | Duplicate, verify DUPLICATE status |
| 4 | `Returns ERROR for unknown device` | Unknown device, verify ERROR |
| 5 | `Inserts scan record for valid scan` | Valid, verify INSERT |
| 6 | `Updates ticket scan_count for ALLOW result` | Allow, verify UPDATE |
| 7 | `Updates ticket first_scanned_at and last_scanned_at` | Verify timestamps |
| 8 | `Uses GREATEST/LEAST for timestamp comparison` | Verify SQL functions |
| 9 | `Commits transaction on success` | Success, verify COMMIT |
| 10 | `Rolls back transaction on error` | Error, verify ROLLBACK |

#### Integration Tests (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Manifest generation queries real database` | Real query |
| 2 | `Reconciliation persists scans to database` | Verify persistence |
| 3 | `Duplicate detection works across reconciliation calls` | Multiple calls |
| 4 | `Tenant isolation enforced on manifest/reconcile` | Test isolation |

#### E2E Tests (3 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Device downloads manifest -> scans offline -> reconciles` | Full flow |
| 2 | `Duplicate offline scans handled correctly` | Duplicate test |
| 3 | `Offline scan count syncs with online state` | Verify sync |

---

### File: `src/routes/policies.ts`

**Purpose:** Scan policy management for events.

#### Unit Tests - GET /api/policies/templates (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns list of templates ordered by is_default` | Verify ORDER BY |
| 2 | `Returns 500 on database error` | Mock error, verify 500 |

#### Unit Tests - GET /api/policies/event/:eventId (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns policies for event with event/venue names` | Verify JOIN |
| 2 | `Returns 500 on database error` | Mock error, verify 500 |

#### Unit Tests - POST /api/policies/event/:eventId/apply-template (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 400 when template_id missing` | No template_id, verify 400 |
| 2 | `Calls apply_scan_policy_template function` | Verify function call |
| 3 | `Returns updated policies after apply` | Success, verify policies |
| 4 | `Returns 500 on error` | Mock error, verify 500 |

#### Unit Tests - PUT /api/policies/event/:eventId/custom (8 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns 404 when event not found` | Invalid event, verify 404 |
| 2 | `Updates DUPLICATE_WINDOW policy` | Set window, verify upsert |
| 3 | `Updates REENTRY policy with defaults` | Set reentry, verify defaults |
| 4 | `Updates ZONE_ENFORCEMENT policy` | Set zones, verify upsert |
| 5 | `Uses upsert ON CONFLICT DO UPDATE` | Verify upsert |
| 6 | `Commits transaction on success` | Success, verify COMMIT |
| 7 | `Rolls back transaction on error` | Error, verify ROLLBACK |
| 8 | `Returns updated policies after changes` | Success, verify response |

#### Integration Tests (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Template application creates policies in database` | Real apply |
| 2 | `Custom policy updates persist correctly` | Verify persistence |
| 3 | `Policy changes affect scan validation` | Change policy, test scan |
| 4 | `Tenant isolation on policy queries` | Test isolation |

---

### File: `src/routes/health.routes.ts`

**Purpose:** Health check endpoints for Kubernetes.

#### Unit Tests - GET /health (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns status:ok with service name` | Call, verify response |
| 2 | `Always returns 200` | Verify status code |

#### Unit Tests - GET /health/db (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Returns status:ok when database connected` | Connected, verify ok |
| 2 | `Returns 503 when database disconnected` | Disconnected, verify 503 |

#### Integration Tests (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `/health/db actually tests database connection` | Real connection test |
| 2 | `/health/db returns error details on failure` | Verify error in response |

---

## Entry Point

### File: `src/index.ts`

**Purpose:** Main application entry point with startup, shutdown, and error handling.

#### Unit Tests (8 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Calls validateEnv before initialization` | Verify order |
| 2 | `Configures Fastify with correct timeouts` | Verify 30s, 10s, 5s |
| 3 | `Registers helmet and cors plugins` | Verify registration |
| 4 | `Decorates app with database pool` | Verify app.db |
| 5 | `Registers all route prefixes correctly` | Verify prefixes |
| 6 | `Global error handler returns 500 with standard format` | Verify format |
| 7 | `Uses PORT and HOST from environment` | Verify env usage |
| 8 | `Defaults PORT to 3009 and HOST to 0.0.0.0` | Verify defaults |

#### Integration Tests - Startup (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Service starts successfully with valid config` | Full startup |
| 2 | `Service fails to start with invalid env vars` | Invalid env, verify exit |
| 3 | `Database connection established on startup` | Verify connection |
| 4 | `Redis connection established on startup` | Verify connection |

#### Integration Tests - Health Endpoints (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `GET /health returns healthy status with component checks` | Verify response |
| 2 | `GET /health returns 503 during shutdown` | During shutdown, verify 503 |
| 3 | `GET /health returns degraded when database unhealthy` | DB down, verify degraded |
| 4 | `GET /health/ready returns ready:true when dependencies healthy` | All healthy, verify ready |
| 5 | `GET /health/ready returns 503 when dependencies unavailable` | Deps down, verify 503 |
| 6 | `GET /health/live returns alive:true with uptime` | Verify response |

#### Integration Tests - Metrics (2 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `GET /metrics returns Prometheus format` | Verify content type |
| 2 | `GET /metrics includes custom scanning metrics` | Verify custom metrics |

#### Integration Tests - Graceful Shutdown (4 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `SIGTERM triggers graceful shutdown` | Send SIGTERM, verify shutdown |
| 2 | `SIGINT triggers graceful shutdown` | Send SIGINT, verify shutdown |
| 3 | `Shutdown closes HTTP server, database, Redis` | Verify all closed |
| 4 | `Health returns 503 after shutdown initiated` | After signal, verify 503 |

#### E2E Tests (6 tests)

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Full service startup -> health check -> shutdown` | Complete lifecycle |
| 2 | `Request during shutdown returns 503` | During shutdown, verify 503 |
| 3 | `In-flight requests complete before shutdown` | Verify graceful drain |
| 4 | `Service handles database failure gracefully` | DB failure, verify degraded |
| 5 | `Service handles Redis failure gracefully` | Redis failure, verify degraded |
| 6 | `Uncaught exception triggers graceful shutdown` | Throw, verify shutdown |

---

## End-to-End Tests

### Complete User Flows

These tests verify the complete scanning workflow from start to finish.

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `Ticket Purchase -> QR Generation -> Venue Scan -> Entry` | Complete happy path |
| 2 | `Re-entry Flow: Exit -> Cooldown -> Re-scan -> Entry` | Re-entry with policy |
| 3 | `Offline Flow: Download Manifest -> Offline Scans -> Reconcile` | Offline scanning |
| 4 | `Admin Flow: Create Policy -> Apply to Event -> Enforce on Scan` | Policy management |
| 5 | `Security Flow: Cross-tenant Scan Attempt -> Blocked` | Tenant isolation |
| 6 | `Security Flow: Cross-venue Scan Attempt -> Blocked` | Venue isolation |
| 7 | `Fraud Detection: Screenshot Sharing -> Detected -> Blocked` | Anomaly detection |
| 8 | `High Load: 100 Concurrent Scans -> All Processed` | Performance test |
| 9 | `Failure Recovery: DB Down -> Reconnect -> Resume` | Resilience test |
| 10 | `Audit Trail: Scan -> Log Created -> Queryable` | Logging verification |

---

## Test Infrastructure

### Required Test Dependencies
```json
{
  "devDependencies": {
    "jest": "^29.x",
    "@types/jest": "^29.x",
    "ts-jest": "^29.x",
    "supertest": "^6.x",
    "@types/supertest": "^2.x",
    "testcontainers": "^10.x",
    "@testcontainers/postgresql": "^10.x",
    "@testcontainers/redis": "^10.x",
    "jest-mock-extended": "^3.x",
    "nock": "^13.x"
  }
}
```

### Jest Configuration
```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/*.test.ts',
    '**/*.integration.ts',
    '**/*.e2e.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/types/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000
};
```

### Test File Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Unit Test | `*.test.ts` | `QRValidator.test.ts` |
| Integration Test | `*.integration.ts` | `scan-routes.integration.ts` |
| E2E Test | `*.e2e.ts` | `scanning-flow.e2e.ts` |

### Test Directory Structure

scanning-service/
├── src/
│   └── ... (source files)
└── tests/
├── setup.ts                    # Global test setup
├── fixtures/                   # Test data
│   ├── tickets.ts
│   ├── devices.ts
│   └── users.ts
├── mocks/                      # Mock implementations
│   ├── database.ts
│   ├── redis.ts
│   └── jwt.ts
├── unit/                       # Unit tests
│   ├── config/
│   ├── errors/
│   ├── middleware/
│   ├── services/
│   └── utils/
├── integration/                # Integration tests
│   ├── routes/
│   └── services/
└── e2e/                        # End-to-end tests
└── flows/

### Coverage Requirements by Module

| Module | Line Coverage | Branch Coverage |
|--------|--------------|-----------------|
| Config | 85% | 80% |
| Errors | 90% | 85% |
| Middleware (Auth) | 95% | 90% |
| Middleware (Tenant) | 95% | 90% |
| Services (Core) | 90% | 85% |
| Services (Analytics) | 85% | 80% |
| Routes | 85% | 80% |
| Utils | 80% | 75% |

---

*End of Test Plan Document*
EOF