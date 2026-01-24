# SCANNING-SERVICE COMPREHENSIVE AUDIT REPORT

**Service:** scanning-service
**Audit Date:** 2026-01-23
**Auditor:** Claude Opus 4.5
**Framework:** Fastify 5.x with TypeScript
**Status:** FINAL SERVICE - AUDIT COMPLETE

---

## 1. SERVICE CAPABILITIES

### What This Service Does

The scanning-service is the critical entry validation system for the TicketToken platform. It handles:
- **QR Code Generation**: Creates rotating, HMAC-signed QR codes for tickets
- **Ticket Scanning & Validation**: Real-time entry validation at venue gates
- **Device Management**: Registration and tracking of scanner devices
- **Offline Mode**: Enables scanning when network is unavailable
- **Policy Enforcement**: Re-entry rules, zone access, duplicate detection
- **Fraud Detection**: Anomaly detection for screenshot fraud and replay attacks
- **Analytics Dashboard**: Real-time and historical scanning metrics

### Public Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/scan` | JWT (VENUE_STAFF, VENUE_MANAGER, ADMIN) | Main ticket scanning endpoint |
| POST | `/api/scan/bulk` | JWT (VENUE_STAFF, VENUE_MANAGER, ADMIN) | Bulk scanning (not implemented) |
| GET | `/api/qr/generate/:ticketId` | JWT (TICKET_HOLDER, VENUE_STAFF, ADMIN, ORGANIZER) | Generate rotating QR code |
| POST | `/api/qr/validate` | JWT (VENUE_STAFF, SCANNER, ADMIN, ORGANIZER) | Lightweight QR validation |
| GET | `/api/qr/status/:ticketId` | JWT (TICKET_HOLDER, VENUE_STAFF, ADMIN, ORGANIZER) | Get QR status |
| POST | `/api/qr/revoke/:ticketId` | JWT (ADMIN, ORGANIZER) | Revoke a QR code |
| GET | `/api/devices` | None | List all devices |
| POST | `/api/devices/register` | None | Register new device |
| GET | `/api/offline/manifest/:eventId` | None | Get offline manifest |
| POST | `/api/offline/reconcile` | None | Reconcile offline scans |
| GET | `/api/policies/templates` | None | List policy templates |
| GET | `/api/policies/event/:eventId` | None | Get event policies |
| POST | `/api/policies/event/:eventId/apply-template` | None | Apply policy template |
| PUT | `/api/policies/event/:eventId/custom` | None | Set custom policies |
| GET | `/health` | None | Health check with component status |
| GET | `/health/ready` | None | Kubernetes readiness probe |
| GET | `/health/live` | None | Kubernetes liveness probe |
| GET | `/metrics` | None | Prometheus metrics |

### Internal Endpoints

| Method | Path | Called By | Purpose |
|--------|------|-----------|---------|
| POST | `/internal/scan-results` | ticket-service, mobile apps | Record scan result |
| GET | `/internal/scan-results/:ticketId` | ticket-service, compliance-service | Get scan history |
| GET | `/internal/events/:eventId/scan-summary` | event-service, analytics-service | Event scan summary |

### Business Operations Summary
- Real-time ticket validation at event entry points
- Rotating QR code generation with HMAC signatures
- Offline scanning capability for connectivity-challenged venues
- Re-entry policy enforcement with cooldown periods
- Zone-based access control (VIP, GA, Backstage)
- Duplicate scan prevention with configurable windows
- Screenshot fraud detection via anomaly analysis
- Device registration and management for venues

---

## 2. DATABASE SCHEMA

### Tables

#### scanner_devices
**Columns:**
- `id` (uuid, PK, default: gen_random_uuid())
- `tenant_id` (uuid, NOT NULL, FK → tenants)
- `device_id` (varchar(255), NOT NULL, UNIQUE)
- `device_name` (varchar(255), NOT NULL)
- `device_type` (varchar(50), default: 'mobile')
- `venue_id` (uuid, nullable)
- `registered_by` (uuid, nullable)
- `ip_address` (varchar(45))
- `user_agent` (text)
- `app_version` (varchar(50))
- `can_scan_offline` (boolean, default: false)
- `is_active` (boolean, default: true)
- `last_sync_at`, `revoked_at` (timestamptz)
- `revoked_by` (uuid), `revoked_reason` (text)
- `metadata` (jsonb, default: '{}')
- `created_at`, `updated_at` (timestamptz)

**Indexes:** device_id, venue_id, is_active, can_scan_offline, (venue_id, is_active), tenant_id

**RLS:** Yes - tenant_isolation policy

#### devices
**Columns:**
- `id` (uuid, PK)
- `tenant_id` (uuid, NOT NULL, FK → tenants)
- `device_id` (varchar(255), NOT NULL, UNIQUE)
- `name` (varchar(255), NOT NULL)
- `zone` (varchar(100))
- `is_active` (boolean, default: true)
- `created_at`, `updated_at` (timestamptz)

**Indexes:** device_id, zone, is_active, tenant_id

**RLS:** Yes

#### scans
**Columns:**
- `id` (uuid, PK)
- `tenant_id` (uuid, NOT NULL, FK → tenants)
- `ticket_id` (uuid, NOT NULL) - Cross-service FK
- `device_id` (uuid)
- `result` (varchar(50), NOT NULL) - 'ALLOW' | 'DENY'
- `reason` (varchar(100))
- `scanned_at` (timestamptz, default: now())
- `metadata` (jsonb, default: '{}')

**Indexes:** ticket_id, device_id, result, scanned_at, (ticket_id, result, scanned_at), tenant_id

**RLS:** Yes

#### scan_results (referenced in internal routes but not in migration)
**Note:** The internal routes reference this table but it's not in the migration. This appears to be a **schema inconsistency**.

#### scan_policy_templates
**Columns:**
- `id` (uuid, PK)
- `tenant_id` (uuid, NOT NULL)
- `name` (varchar(255), NOT NULL)
- `description` (text)
- `policy_set` (jsonb, NOT NULL)
- `is_default` (boolean, default: false)
- `created_at`, `updated_at` (timestamptz)

**Indexes:** is_default, name, tenant_id

**RLS:** Yes

#### scan_policies
**Columns:**
- `id` (uuid, PK)
- `tenant_id` (uuid, NOT NULL)
- `event_id` (uuid, NOT NULL) - Cross-service FK
- `venue_id` (uuid) - Cross-service FK
- `policy_type` (varchar(100), NOT NULL)
- `name` (varchar(255), NOT NULL)
- `config` (jsonb, NOT NULL)
- `is_active` (boolean, default: true)
- `created_at`, `updated_at` (timestamptz)

**Unique:** (event_id, policy_type)

**Indexes:** event_id, venue_id, policy_type, is_active, tenant_id

**RLS:** Yes

#### offline_validation_cache
**Columns:**
- `id` (uuid, PK)
- `tenant_id` (uuid, NOT NULL)
- `ticket_id` (uuid, NOT NULL) - Cross-service FK
- `event_id` (uuid, NOT NULL) - Cross-service FK
- `validation_hash` (varchar(255), NOT NULL)
- `valid_from`, `valid_until` (timestamptz, NOT NULL)
- `ticket_data` (jsonb, NOT NULL)
- `created_at` (timestamptz)

**Unique:** (ticket_id, valid_from)

**Indexes:** ticket_id, event_id, valid_until, (event_id, valid_until), tenant_id

**RLS:** Yes

#### scan_anomalies
**Columns:**
- `id` (uuid, PK)
- `tenant_id` (uuid, NOT NULL)
- `ticket_id` (uuid, NOT NULL) - Cross-service FK
- `device_id` (varchar(255), NOT NULL)
- `anomaly_types` (TEXT[])
- `risk_score` (integer, NOT NULL)
- `details` (jsonb, NOT NULL)
- `detected_at`, `created_at`, `updated_at` (timestamptz)

**Indexes:** ticket_id, device_id, detected_at, risk_score, (device_id, detected_at), tenant_id

**RLS:** Yes

### Schema Issues

1. **CRITICAL:** `scan_results` table referenced in internal routes but missing from migration
2. **MEDIUM:** Two device tables (`scanner_devices` and `devices`) with overlapping functionality
3. **LOW:** Cross-service FKs documented as comments but not enforced

---

## 3. SECURITY ANALYSIS

### HMAC Implementation

**QR Code HMAC (HMAC_SECRET):**
- ✅ Uses SHA-256 for HMAC signatures
- ✅ Timing-safe comparison in QRValidator (`crypto.timingSafeEqual`)
- ✅ Nonce-based replay attack prevention (stored in Redis)
- ✅ 30-second QR expiration window
- ✅ Validates HMAC_SECRET is at least 32 characters
- ✅ Fails fast if HMAC_SECRET not configured

**S2S HMAC (INTERNAL_HMAC_SECRET):**
- ✅ Uses @tickettoken/shared standardized library
- ✅ Configurable replay window (60 seconds)
- ✅ Service allowlist validation
- ✅ Feature flag (`USE_NEW_HMAC`) for gradual rollout
- ⚠️ Different env var from QR HMAC (potential confusion)

**Matches Standardization:** Yes

### QR Code Security

**Replay Protection:**
- ✅ Nonce included in QR data (`ticketId:timestamp:nonce:hmac`)
- ✅ Nonces stored in Redis with 60-second TTL
- ✅ Duplicate nonces rejected before signature validation

**Tampering Prevention:**
- ✅ HMAC-SHA256 signature validation
- ✅ Timing-safe comparison prevents timing attacks

**Expiration:**
- ✅ 30-second default validity window
- ✅ Configurable via `QR_ROTATION_SECONDS`

**Issues:**
- None identified - robust implementation

### Device Authentication

**How Devices Authenticated:**
- ✅ Devices registered in `devices` or `scanner_devices` table
- ✅ Device must be `is_active = true` to scan
- ✅ Venue isolation enforced (device must belong to staff's venue)
- ✅ Tenant isolation enforced (device must match tenant)

**Issues:**
1. **HIGH:** `GET /api/devices` and `POST /api/devices/register` have NO authentication
2. **HIGH:** `GET /api/offline/manifest/:eventId` has NO authentication
3. **HIGH:** `POST /api/offline/reconcile` has NO authentication
4. **HIGH:** All policy routes have NO authentication

### Offline Mode Security

**How Offline Data Protected:**
- ✅ Validation hashes use ticket-specific HMAC secrets
- ✅ Cache has time-bounded validity (`valid_from`, `valid_until`)
- ✅ Only devices with `can_scan_offline = true` can get manifests

**Sync Security:**
- ✅ Duplicate scan detection during reconciliation
- ⚠️ No authentication on reconcile endpoint

**Issues:**
1. **HIGH:** Offline manifest endpoint not authenticated
2. **MEDIUM:** Offline tokens use static HMAC without nonce

### Input Validation

- ✅ Joi validation for scan requests (`scan.validator.ts`)
- ✅ Fastify JSON Schema validation for QR routes (`schemas/validation.ts`)
- ✅ UUID format validation on ticket IDs
- ✅ QR data format pattern validation

### Rate Limiting

- ✅ Scan rate limiter: 10 requests/minute per IP:device
- ✅ Device rate limiter: 50 scans/5 minutes per device
- ✅ Staff rate limiter: 30 scans/minute per staff
- ✅ Failed attempt limiter: 5 failures/10 minutes (lockout)
- ✅ Bulk scan limiter: 5 requests/5 minutes

### Critical Vulnerabilities

1. **[CRITICAL]** Missing Authentication on Device Routes - `src/routes/devices.ts:13-66`
   - `GET /api/devices` - Anyone can list all devices
   - `POST /api/devices/register` - Anyone can register devices

2. **[CRITICAL]** Missing Authentication on Offline Routes - `src/routes/offline.ts:27-170`
   - `GET /api/offline/manifest/:eventId` - Anyone can get ticket data
   - `POST /api/offline/reconcile` - Anyone can inject scan records

3. **[CRITICAL]** Missing Authentication on Policy Routes - `src/routes/policies.ts:41-243`
   - All policy endpoints accessible without authentication

4. **[HIGH]** SQL Injection Risk - `src/routes/policies.ts:72-82`
   - JOINs with `events` and `venues` tables without parameterization concerns

5. **[MEDIUM]** Schema Mismatch - `src/routes/internal.routes.ts:90-97`
   - References `scan_results` table not in migration

---

## 4. CODE QUALITY

### Dead Code

- `src/config/secrets.ts` - loadSecrets() function not called anywhere
- `src/services/DeviceManager.ts` - Not used in any route (devices.ts uses direct queries)
- `src/migrations/archived/001_baseline_scanning.ts` - Archived migration

### TODO/FIXME (Total: 0)

No TODO or FIXME comments found.

### `any` Type Usage

- **Total:** 17 occurrences
- **Files:**
  - `src/middleware/rate-limit.middleware.ts:4` - `options: any`
  - `src/middleware/validation.middleware.ts:13` - `error: any`
  - `src/middleware/tenant-context.ts:29,37` - Type assertions
  - `src/routes/offline.ts:77,142` - `results: any[]`, `error: any`
  - `src/routes/policies.ts:128,232` - `error: any`
  - `src/services/QRValidator.ts:673` - `emitScanEvent(ticket: any, device: any)`
  - `src/config/env.validator.ts:69` - Joi details

### Dependencies

| Package | Current | Issue |
|---------|---------|-------|
| moment | ^2.29.4 | Consider dayjs for smaller bundle |
| crypto | ^1.0.1 | Built-in module, dependency unnecessary |
| redis | ^5.8.2 | Unused - uses ioredis instead |
| speakeasy | ^2.0.0 | Included but not actively used |
| bcrypt | ^5.1.1 | Included but not actively used |
| bull | ^4.11.5 | Included but no job queues defined |

### Code Duplication

1. **Tenant context middleware** - Two implementations:
   - `src/middleware/tenant-context.ts`
   - `src/middleware/tenant.middleware.ts`

2. **Device tables** - Two tables with similar purpose:
   - `scanner_devices` (full-featured)
   - `devices` (simple)

---

## 5. SERVICE INTEGRATION

### Outbound Dependencies

| Service | Method | Purpose |
|---------|--------|---------|
| ticket-service | DB Read | Get ticket details for validation |
| event-service | DB Read | Get event details for QR generation |
| venue-service | DB Read | Venue info for policy routes |

**Note:** This service does direct DB queries to `tickets`, `events`, `venues` tables rather than making HTTP calls. This is documented as "PHASE 5c BYPASS EXCEPTION" due to latency requirements.

### Inbound Dependencies (Services Calling This)

| Service | Endpoint | Purpose |
|---------|----------|---------|
| ticket-service | POST /internal/scan-results | Record scan |
| event-service | GET /internal/events/:id/scan-summary | Get stats |
| compliance-service | GET /internal/scan-results/:ticketId | Audit trail |
| analytics-service | GET /internal/events/:id/scan-summary | Analytics |

### Offline Sync Strategy

**Caching:**
- Ticket data cached in `offline_validation_cache` table
- Default validity: 30 minutes (`OFFLINE_CACHE_DURATION_MINUTES`)
- HMAC secrets generated per-ticket for offline validation

**Sync:**
- Device calls `POST /api/offline/reconcile` when back online
- Scans inserted with actual `scanned_at` timestamps
- Duplicate detection prevents double-counting

**Conflict Resolution:**
- First-write-wins for scan records
- Duplicate scans marked as `DUPLICATE` status
- Ticket `scan_count` updated to max of online/offline count

### Issues

1. **Direct DB access** to tickets/events violates microservice boundaries
2. **No circuit breaker** on outbound calls (not applicable - uses DB)
3. **No retry logic** for failed reconciliations

---

## 6. APPLICATION SETUP

### Framework

- **Fastify 5.6.2** with TypeScript
- **Plugins:** @fastify/helmet, @fastify/cors, @fastify/rate-limit
- **Logger:** Winston (not Fastify's built-in pino)

### Required Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| HMAC_SECRET | QR code HMAC signing | Yes (32+ chars) |
| JWT_SECRET | User authentication | Yes (32+ chars) |
| DB_HOST | PostgreSQL host | Yes |
| DB_PORT | PostgreSQL port | No (default: 5432) |
| DB_NAME | Database name | Yes |
| DB_USER | Database user | Yes |
| DB_PASSWORD | Database password | Yes |
| REDIS_HOST | Redis host | Yes |
| REDIS_PORT | Redis port | No (default: 6379) |
| REDIS_PASSWORD | Redis password | No |
| PORT | Service port | No (default: 3009) |
| NODE_ENV | Environment | No (default: development) |
| INTERNAL_HMAC_SECRET | S2S HMAC secret | No (optional S2S auth) |
| USE_NEW_HMAC | Enable S2S HMAC | No (default: false) |
| QR_ROTATION_SECONDS | QR validity | No (default: 30) |
| OFFLINE_CACHE_DURATION_MINUTES | Offline cache TTL | No (default: 30) |

### Graceful Shutdown

**Implementation:** `src/index.ts:196-255`
- ✅ SIGTERM and SIGINT handlers registered
- ✅ Sets `isShuttingDown` flag
- ✅ Health endpoints return 503 during shutdown
- ✅ Closes Fastify server first (stops new requests)
- ✅ Closes database pool
- ✅ Closes Redis connection
- ✅ 10-second wait for in-flight requests
- ✅ Handles uncaught exceptions and unhandled rejections

---

## 7. SERVICES ANALYSIS

### 7.1 QRGenerator.ts

**Purpose:** Generate rotating HMAC-signed QR codes for tickets

**Key Methods:**
- `generateRotatingQR(ticketId)` - Creates QR with nonce and HMAC
- `generateOfflineManifest(eventId, deviceId)` - Batch generate offline tokens
- `validateOfflineScan(ticketId, offlineToken, eventId)` - Verify offline token

**Dependencies:**
- `pg` (database)
- `crypto` (HMAC)
- `qrcode` (image generation)

**Issues:**
- Debug logging includes ticket counts (remove in production)
- HMAC secret has default fallback (should fail if not set)

### 7.2 QRValidator.ts

**Purpose:** Core ticket scanning validation with policy enforcement

**Key Methods:**
- `validateQRToken()` - HMAC and nonce validation
- `checkDuplicate()` - Duplicate scan detection with Redis cache
- `checkReentryPolicy()` - Re-entry rules enforcement
- `checkAccessZone()` - Zone-based access control
- `validateScan()` - Main validation orchestrator
- `getScanStats()` - Scan statistics by event

**Dependencies:**
- `pg` (database)
- `ioredis` (nonce tracking, duplicate cache)
- `crypto` (HMAC validation)

**Issues:**
- ✅ Fixed: Timing-safe HMAC comparison
- ✅ Fixed: SQL injection in checkDuplicate (uses parameterized query)
- ✅ Fixed: SQL injection in getScanStats (uses parameterized query)

### 7.3 DeviceManager.ts

**Purpose:** Scanner device lifecycle management

**Key Methods:**
- `registerDevice(deviceData)` - Register new scanner
- `revokeDevice(deviceId, revokedBy, reason)` - Revoke device access
- `getDevice(deviceId)` - Get device by ID
- `listVenueDevices(venueId, activeOnly)` - List devices for venue
- `updateDeviceSync(deviceId)` - Update last sync timestamp

**Dependencies:**
- `pg` (database)
- `crypto` (device ID generation)

**Issues:**
- Not used by routes (devices.ts uses direct queries)

### 7.4 OfflineCache.ts

**Purpose:** Generate and validate offline scanning capabilities

**Key Methods:**
- `generateEventCache(eventId)` - Create offline cache for event
- `getDeviceCache(deviceId, eventId)` - Get cache for device
- `validateOfflineScan()` - Validate offline scan attempt

**Dependencies:**
- `pg` (database)
- `crypto` (validation hash generation)

**Issues:**
- Updates `tickets.qr_hmac_secret` directly (cross-service write)

### 7.5 analytics-dashboard.service.ts

**Purpose:** Real-time and historical scanning analytics

**Key Methods:**
- `getDashboardMetrics()` - Comprehensive dashboard data
- `getRealtimeMetrics()` - Last-minute scan stats
- `getHistoricalMetrics()` - Time-range aggregations
- `getDeviceMetrics()` - Per-device performance
- `getEntryPatterns()` - Entry time/zone analysis
- `getAlerts()` - Active anomaly alerts
- `exportAnalytics()` - CSV/JSON export

**Dependencies:**
- `pg` (complex aggregation queries)
- `ioredis` (caching)

**Issues:**
- Large JOINs may cause performance issues at scale

### 7.6 anomaly-detector.service.ts

**Purpose:** Fraud and anomaly detection for scans

**Key Methods:**
- `analyzeScan()` - Run all anomaly detectors
- `detectScreenshotFraud()` - Multiple scans within 5 seconds
- `detectDuplicateDeviceScans()` - Same ticket on multiple devices
- `detectTimingAnomalies()` - Scans at unusual hours
- `detectPatternAnomalies()` - Device with high denial rate
- `calculateRiskScore()` - Weighted risk scoring
- `recordAnomaly()` - Store detected anomalies

**Dependencies:**
- `pg` (database)
- `ioredis` (caching)

**Issues:**
- Time-based anomaly detection is simplistic (2-5 AM)
- Not integrated into main scan flow (not called from QRValidator)

---

## 8. QR CODE & SCANNING ANALYSIS

### QR Code Format

**Encoding:** Colon-separated string
**Structure:** `{ticketId}:{timestamp}:{nonce}:{hmac}`

Example: `550e8400-e29b-41d4-a716-446655440000:1706054400000:abc123def456:signature`

**Components:**
1. `ticketId` - UUID of the ticket
2. `timestamp` - Unix timestamp in milliseconds
3. `nonce` - 16-character random hex (8 bytes)
4. `hmac` - SHA-256 HMAC signature (64 hex chars)

### Signature Generation

```typescript
const data = `${ticketId}:${timestamp}:${nonce}`;
const hmac = crypto
  .createHmac('sha256', HMAC_SECRET)
  .update(data)
  .digest('hex');
```

### Validation Flow

1. Parse QR data into components
2. Check token age (must be < 30 seconds)
3. Check nonce in Redis (replay prevention)
4. Compute expected HMAC
5. Timing-safe compare signatures
6. Mark nonce as used in Redis (60s TTL)
7. Validate device is active and authorized
8. Enforce venue/tenant isolation
9. Load ticket details from database
10. Check ticket status (SOLD, MINTED)
11. Check event timing (started, not ended)
12. Check ticket validity period
13. Check for refunded/cancelled/transferred status
14. Check access zone permissions
15. Check duplicate scan window
16. Check re-entry policy if duplicate
17. Update ticket scan_count
18. Log scan record
19. Return result

### Security Measures

**Replay Protection:**
- ✅ Nonce stored in Redis after first use
- ✅ 60-second TTL (longer than QR validity)
- ✅ Rejected before signature check to prevent enumeration

**Expiration:**
- ✅ 30-second default window
- ✅ Configurable via environment variable

**Double-Scan Prevention:**
- ✅ Duplicate window configurable per-event (default: 10 minutes)
- ✅ Redis cache for fast duplicate checks
- ✅ Database as source of truth

### Issues

- None critical - implementation is robust

---

## 9. OFFLINE MODE ANALYSIS

### Offline Data

**What's Cached:**
- Ticket ID and number
- Status (SOLD, TRANSFERRED)
- Section, row, seat information
- Event name and date
- Per-ticket validation hash

**Cache Duration:** 30 minutes (configurable)

**Storage:** PostgreSQL `offline_validation_cache` table

### Sync Strategy

1. Device requests manifest before going offline
2. Manifest includes all valid tickets for event
3. Device stores manifest locally
4. Scans validated against local cache
5. When online, device calls `/api/offline/reconcile`
6. Server processes each scan:
   - Check if already processed (duplicate)
   - Verify device exists
   - Insert scan record with original timestamp
   - Update ticket scan_count if ALLOW
7. Return reconciliation results

### Conflict Resolution

**Strategy:** First-write-wins with max merge

- If scan already exists with same ticket_id + scanned_at: Skip (DUPLICATE)
- If device not found: ERROR
- For ticket counts: `GREATEST(COALESCE(scan_count, 0), offline_count)`
- For timestamps: `LEAST/GREATEST` for first/last scanned

### Issues

1. **HIGH:** No authentication on offline endpoints
2. **MEDIUM:** Validation hash doesn't include timestamp (static token)
3. **MEDIUM:** No manifest versioning to detect stale cache
4. **LOW:** No compression for large manifests

---

## 10. TEST COVERAGE

### Test Files

- **Unit Tests:** 32 files
- **Integration Tests:** 1 file (hmac-integration.test.ts)

### Unit Test Coverage

| Directory | Files | Coverage Areas |
|-----------|-------|----------------|
| config/ | 5 | database, redis, secrets, env validation |
| middleware/ | 6 | auth, correlation-id, rate-limit, tenant, validation |
| routes/ | 7 | scan, qr, devices, offline, policies, health, internal |
| services/ | 6 | QRGenerator, QRValidator, DeviceManager, OfflineCache, analytics, anomaly |
| utils/ | 3 | logger, metrics, secrets-manager |
| schemas/ | 1 | validation schemas |
| errors/ | 1 | error classes |

### HMAC Integration Tests

- ✅ Header generation for all request types
- ✅ Signature validation from multiple services
- ✅ Replay attack prevention
- ✅ Invalid signature detection
- ✅ Missing headers detection

### Coverage Gaps

1. **No E2E tests** for full scan flow
2. **No load tests** for high-volume scanning
3. **No offline reconciliation tests**
4. **No cross-service integration tests**
5. **No anomaly detection tests** in scan flow

---

## 11. TYPE SAFETY

### Validation Framework

- **Joi** for request body validation (`scan.validator.ts`)
- **Fastify JSON Schema** for route schemas (`schemas/validation.ts`)
- **Dual validation** approach (redundant but safe)

### Type Definitions

**Main Types:**
- `JWTPayload` - User authentication context
- `ScanBody` - Scan request structure
- `ScanResult` - Scan response structure
- `TokenValidation` - QR token validation result
- `DuplicateCheck` - Duplicate detection result
- `PolicyCheck` - Policy evaluation result
- `CacheEntry` - Offline cache entry
- `Anomaly` - Detected anomaly structure

**RFC 7807 Error Types:**
- `ProblemDetails` - Standard error interface
- `AppError` - Base error class
- `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, etc.
- `QRValidationError`, `TicketAlreadyScannedError`, `DeviceUnauthorizedError`

### `any` Type Usage

- **Total:** 17 occurrences
- **Impact:** Medium - mostly in error handling and options

### Issues

1. **MEDIUM:** Type assertions in tenant middleware
2. **LOW:** Some route handlers use implicit `any`

---

## CRITICAL ISSUES (Must Fix)

1. **[CRITICAL]** Missing Authentication on Device Routes
   - **Location:** `src/routes/devices.ts:13, 35`
   - **Impact:** Anyone can register rogue devices or list all registered devices
   - **Fix:** Add `authenticateRequest` and `requireRole` middleware

2. **[CRITICAL]** Missing Authentication on Offline Routes
   - **Location:** `src/routes/offline.ts:29, 60`
   - **Impact:** Ticket data exposure, fake scan injection
   - **Fix:** Add authentication and device verification

3. **[CRITICAL]** Missing Authentication on Policy Routes
   - **Location:** `src/routes/policies.ts:43, 67, 98, 139`
   - **Impact:** Unauthorized policy modification
   - **Fix:** Add authentication with ADMIN/ORGANIZER role check

4. **[CRITICAL]** Schema Mismatch - scan_results Table Missing
   - **Location:** `src/routes/internal.routes.ts:90-97`
   - **Impact:** Internal routes will fail at runtime
   - **Fix:** Add `scan_results` table to migration or use `scans` table

---

## HIGH PRIORITY (Should Fix)

1. **[HIGH]** Anomaly Detector Not Integrated
   - **Location:** `src/services/anomaly-detector.service.ts`
   - **Impact:** Fraud detection not active during scans
   - **Fix:** Call `analyzeScan()` from QRValidator.validateScan()

2. **[HIGH]** Duplicate Device Registration Code
   - **Location:** `src/services/DeviceManager.ts` vs `src/routes/devices.ts`
   - **Impact:** Code duplication, maintenance burden
   - **Fix:** Use DeviceManager service in routes

3. **[HIGH]** Debug Logging in Production Code
   - **Location:** `src/services/QRGenerator.ts:78-89`
   - **Impact:** Verbose logs, potential data exposure
   - **Fix:** Remove or guard with LOG_LEVEL check

---

## MEDIUM PRIORITY

1. **[MEDIUM]** Unused Dependencies
   - `crypto`, `redis`, `speakeasy`, `bcrypt`, `bull` in package.json
   - Fix: Remove unused packages

2. **[MEDIUM]** Duplicate Tenant Context Middleware
   - `tenant-context.ts` and `tenant.middleware.ts`
   - Fix: Consolidate into single implementation

3. **[MEDIUM]** Static Offline Validation Tokens
   - Tokens don't include timestamp, reducing security
   - Fix: Include expiration in token signature

4. **[MEDIUM]** Missing Manifest Versioning
   - No way to detect stale offline cache
   - Fix: Add version field and validation

---

## TECHNICAL DEBT

1. Direct database access to tickets/events tables (documented exception)
2. Two device tables with overlapping functionality
3. Moment.js instead of lighter alternative
4. 17 instances of `any` type usage
5. No job queue for async operations (Bull included but unused)

---

## BUSINESS CAPABILITIES SUMMARY

**What does scanning-service enable?**
- Real-time ticket validation at event entry (< 500ms latency)
- Rotating QR codes that prevent screenshot fraud
- Offline scanning for venues with poor connectivity
- Re-entry management with configurable policies
- Zone-based access control (VIP, GA, Backstage)
- Fraud detection and anomaly alerting
- Comprehensive scanning analytics

**What breaks if it goes down?**
- **CRITICAL:** All venue entry validation stops
- **CRITICAL:** Attendees cannot enter events
- **HIGH:** QR code generation fails (app shows loading)
- **MEDIUM:** Offline devices continue until cache expires
- **MEDIUM:** Analytics dashboard shows stale data

---

## COMPARISON TO OTHER SERVICES

**Better than others in:**
- QR code security (nonce + HMAC + timing-safe)
- Comprehensive error classes (RFC 7807)
- Prometheus metrics coverage
- Rate limiting strategy (multi-layered)
- Graceful shutdown implementation

**Worse than others in:**
- Authentication coverage (critical gaps)
- Service boundary adherence (direct DB access)
- Code duplication (device management)

**Similar quality:**
- TypeScript strictness
- Test file structure
- Logging patterns

---

## FILES ANALYZED VERIFICATION

**Total source files read:** 39

**By category:**
- Config: 5 (database.ts, env.validator.ts, redis.ts, secrets.ts, secrets.config.ts)
- Middleware: 7 (auth.middleware.ts, correlation-id.ts, internal-auth.middleware.ts, rate-limit.middleware.ts, tenant-context.ts, tenant.middleware.ts, validation.middleware.ts)
- Routes: 7 (scan.ts, qr.ts, devices.ts, offline.ts, policies.ts, health.routes.ts, internal.routes.ts)
- Services: 6 (QRGenerator.ts, QRValidator.ts, DeviceManager.ts, OfflineCache.ts, analytics-dashboard.service.ts, anomaly-detector.service.ts)
- Utils: 3 (logger.ts, metrics.ts, secrets-manager.ts)
- Validators: 1 (scan.validator.ts)
- Schemas: 1 (validation.ts)
- Errors: 1 (index.ts)
- Types: 2 (global.d.ts, modules.d.ts)
- Migrations: 2 (001_consolidated_baseline.ts, archived/001_baseline_scanning.ts)
- Root: 3 (index.ts, package.json, knexfile.ts)
- Tests: 1 (hmac-integration.test.ts)

**Files Analyzed:** 39
**Critical Issues:** 4
**Code Quality:** Good (with authentication gaps)

---

## 🏁 FINAL SERVICE - AUDIT COMPLETE!

This is the last of 6 blockchain/ticketing services audited.

**All Services Audited:**
1. ✅ minting-service
2. ✅ blockchain-service
3. ✅ blockchain-indexer
4. ✅ marketplace-service
5. ✅ transfer-service
6. ✅ **scanning-service** (THIS ONE)

**Overall Assessment:**
The scanning-service has excellent QR code security implementation with nonce-based replay prevention, timing-safe HMAC comparison, and multi-layered rate limiting. However, it has **critical authentication gaps** on device, offline, and policy routes that must be fixed before production use. The core scanning logic in QRValidator is well-implemented with comprehensive policy enforcement.

**Recommended Priority:**
1. Fix authentication on all unprotected routes (CRITICAL)
2. Add scan_results table or fix internal routes (CRITICAL)
3. Integrate anomaly detection into scan flow (HIGH)
4. Remove/consolidate duplicate code (MEDIUM)
