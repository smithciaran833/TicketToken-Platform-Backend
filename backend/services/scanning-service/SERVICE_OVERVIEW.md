# Scanning Service - Complete Overview

**Service Purpose:** QR code generation, ticket scanning validation, offline scanning support, scan policy enforcement, fraud detection, and real-time analytics.

**Port:** 3009  
**Technology:** Fastify, PostgreSQL, Redis, Winston, Prometheus  
**Key Features:** Rotating QR codes, offline mode, tenant/venue isolation, anomaly detection, comprehensive analytics

---

## 📁 routes/

### `/api/devices` (devices.ts)
**Purpose:** Device registration and management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all active devices |
| POST | `/register` | Register or update a scanner device |

**Key Features:**
- Device registry with zones (GA, VIP, Backstage)
- Active/inactive device status
- Upsert logic on conflict

---

### `/api/health` (health.routes.ts)
**Purpose:** Health check endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic service health |
| GET | `/health/db` | Database connectivity check |
| GET | `/health/ready` | Kubernetes readiness probe |
| GET | `/health/live` | Kubernetes liveness probe |

**Also in index.ts:**
- Returns 503 during graceful shutdown
- Includes uptime and component health status

---

### `/api/offline` (offline.ts)
**Purpose:** Offline scanning support

| Method | Path | Description |
|--------|------|-------------|
| GET | `/manifest/:eventId` | Generate offline validation manifest for device |
| POST | `/reconcile` | Reconcile offline scans when device reconnects |

**Key Features:**
- Generates validation hashes for offline use
- Device authorization check (can_scan_offline)
- Transaction-based reconciliation with duplicate detection
- Updates ticket scan counts retroactively

---

### `/api/policies` (policies.ts)
**Purpose:** Scan policy configuration

| Method | Path | Description |
|--------|------|-------------|
| GET | `/templates` | List available policy templates |
| GET | `/event/:eventId` | Get current policies for an event |
| POST | `/event/:eventId/apply-template` | Apply a policy template to an event |
| PUT | `/event/:eventId/custom` | Set custom policies for an event |

**Policy Types:**
- `DUPLICATE_WINDOW` - Scan window configuration
- `REENTRY` - Re-entry rules (enabled, cooldown, max reentries)
- `ZONE_ENFORCEMENT` - Access zone restrictions

---

### `/api/qr` (qr.ts)
**Purpose:** QR code generation and validation

| Method | Path | Description |
|--------|------|-------------|
| GET | `/generate/:ticketId` | Generate rotating QR code for ticket |
| POST | `/validate` | Validate QR code format |

**QR Format:** `ticketId:timestamp:nonce:hmac`
- Time-based rotation (30s default)
- HMAC-SHA256 signed
- Nonce for replay attack prevention (Phase 2.8)
- Returns base64 PNG image

---

### `/api/scan` (scan.ts)
**Purpose:** Main ticket scanning endpoint (SECURITY CRITICAL)

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/` | Scan a ticket QR code | ✅ VENUE_STAFF/MANAGER/ADMIN |
| POST | `/bulk` | Bulk scan tickets (not implemented) | ✅ VENUE_STAFF/MANAGER/ADMIN |

**Security Features:**
- JWT authentication required (Phase 1.3)
- Role-based access control
- Tenant isolation enforcement
- Venue isolation enforcement
- Rate limiting (10/min per IP+device)
- Joi validation
- Nonce-based replay attack prevention

**Validation Chain:**
1. QR token validation (HMAC, expiry, nonce)
2. Device authorization
3. Venue/tenant isolation checks
4. Ticket status validation
5. Event timing validation (Phase 5.1)
6. Refunded/cancelled ticket checks (Phase 5.2)
7. Transfer status checks (Phase 5.3)
8. Access zone validation
9. Duplicate scan detection
10. Re-entry policy enforcement
11. Anomaly detection

**Prometheus Metrics:**
- `scans_allowed_total`
- `scans_denied_total`
- `scan_latency_seconds`

---

## 📁 services/

### analytics-dashboard.service.ts
**Purpose:** Phase 5.4 - Comprehensive scanning analytics

**Class:** `AnalyticsDashboardService`

**Key Methods:**
- `getDashboardMetrics(eventId, venueId, timeRange)` - Full dashboard data
- `getRealtimeMetrics(eventId)` - Last minute stats
- `getHistoricalMetrics(eventId, timeRange)` - Trends and patterns
- `getDeviceMetrics(venueId, timeRange)` - Device performance
- `getEntryPatterns(eventId, timeRange)` - Peak times, zones, reentry
- `getAlerts(eventId, venueId)` - Active security/performance alerts
- `exportAnalytics(eventId, timeRange, format)` - CSV/JSON export

**Provides:**
- Real-time scans per minute
- Success rates
- Top denial reasons
- Peak hours analysis
- Entry distribution by zone
- Device status (active/idle/offline)
- Anomaly alerts
- Performance alerts

---

### anomaly-detector.service.ts
**Purpose:** Phase 5.5 - Fraud and pattern detection

**Class:** `AnomalyDetectorService`

**Key Methods:**
- `analyzeScan(ticketId, deviceId, timestamp)` - Full anomaly analysis
- `detectScreenshotFraud(ticketId, deviceId, timestamp)` - Multiple scans in 5s
- `detectDuplicateDeviceScans(ticketId, timestamp)` - Same ticket, multiple devices
- `detectTimingAnomalies(ticketId, timestamp)` - Unusual scan hours
- `detectPatternAnomalies(ticketId, deviceId)` - High denial rates
- `calculateRiskScore(anomalies)` - 0-100 risk scoring
- `getAnomalyStats(venueId, timeRange)` - Fraud statistics

**Anomaly Types:**
- `screenshot_fraud` - Ticket screenshot detected
- `duplicate_device` - Simultaneous multi-device usage
- `timing` - Scans at unusual hours
- `geographic` - Location anomalies (placeholder)
- `pattern` - Unusual scanning patterns

**Risk Levels:** low, medium, high, critical

**Auto-logs:** High-risk anomalies (score > 70) to `scan_anomalies` table

---

### DeviceManager.ts
**Purpose:** Scanner device lifecycle management

**Class:** `DeviceManager`

**Key Methods:**
- `registerDevice(deviceData)` - Register new scanner device
- `revokeDevice(deviceId, revokedBy, reason)` - Revoke device access
- `getDevice(deviceId)` - Fetch device info
- `listVenueDevices(venueId, activeOnly)` - List venue's devices
- `updateDeviceSync(deviceId)` - Update last sync timestamp

**Device Properties:**
- Device ID, name, type (mobile/kiosk/handheld)
- Venue assignment
- IP address, user agent, app version
- Offline scanning capability flag
- Active/revoked status
- Registration and revocation audit trail

---

### OfflineCache.ts
**Purpose:** Offline scanning validation cache

**Class:** `OfflineCache`

**Key Methods:**
- `generateEventCache(eventId)` - Generate validation cache for all tickets
- `getDeviceCache(deviceId, eventId)` - Download cache to device
- `validateOfflineScan(ticketId, validationHash, eventId)` - Validate offline scan

**Cache Features:**
- HMAC-based validation tokens
- Configurable validity window (default 30 min)
- Includes ticket metadata for offline display
- Upserts existing cache entries
- Auto-cleanup of expired entries
- Device authorization (can_scan_offline flag)

**Security:**
- Uses ticket-specific HMAC secrets
- Time-bound validation
- Device authorization check

---

### QRGenerator.ts
**Purpose:** Rotating QR code generation

**Class:** `QRGenerator`

**Key Methods:**
- `generateRotatingQR(ticketId)` - Generate time-based QR code
- `generateOfflineManifest(eventId, deviceId)` - Offline token set
- `validateOfflineScan(ticketId, offlineToken, eventId)` - Validate offline token

**QR Format:** `ticketId:timestamp:nonce:hmac`
- **Phase 2.8:** Added nonce for replay attack prevention
- 30-second rotation window (configurable)
- HMAC-SHA256 signature
- Base64 PNG image output (300x300)
- Error correction level: M

**Offline Manifest:**
- Valid for 4 hours
- Contains HMAC tokens for each ticket
- Ticket metadata (number, access level, scan count)

---

### QRValidator.ts
**Purpose:** Complete scan validation and policy enforcement

**Class:** `QRValidator`

**Key Methods:**
- `validateScan(qrData, deviceId, location, staffUserId, authenticatedUser)` - Main validation
- `validateQRToken(ticketId, timestamp, nonce, hmac)` - Token cryptography
- `checkDuplicate(ticketId, windowMinutes)` - Duplicate detection
- `checkReentryPolicy(ticketId, eventId, scanCount, lastScannedAt)` - Re-entry rules
- `checkAccessZone(ticketAccessLevel, deviceZone)` - Zone permissions
- `logScan(client, ticketId, deviceId, result, reason)` - Audit logging
- `getScanStats(eventId, timeRange)` - Statistics query

**Security Features (Phase 1.3):**
- **Tenant Isolation:** Validates ticket belongs to staff's tenant
- **Venue Isolation:** Validates device belongs to staff's venue
- **Event/Venue Match:** Checks ticket event matches device venue
- Timing-safe HMAC comparison (prevents timing attacks)
- Nonce replay attack prevention
- SQL injection prevention (parameterized queries)

**Phase 5 Validations:**
- Event start/end time enforcement (5.1)
- Refunded/cancelled ticket blocking (5.2)
- Transfer status handling (5.3)

**Zone Hierarchy:**
- `ALL` → BACKSTAGE, VIP, GA
- `BACKSTAGE` → BACKSTAGE only
- `VIP` → VIP, GA
- `GA` → GA only

**Returns:** `{ valid, result, reason, message, ticket, scan_count }`

---

## 📁 middleware/

### auth.middleware.ts
**Purpose:** JWT authentication and authorization

**Key Functions:**
- `authenticateRequest(request, reply)` - Verify JWT token
- `requireRole(...roles)` - Role-based access control
- `requirePermission(...permissions)` - Permission-based access control
- `optionalAuthentication(request, reply)` - Optional auth for public endpoints

**JWT Payload:**
```typescript
{
  userId: string
  tenantId: string
  role: string
  venueId?: string
  permissions: string[]
  iat: number
  exp: number
}
```

**Attaches to request:** `request.user`, `request.tenantId`

**Error Responses:**
- 401: Unauthorized (missing/invalid/expired token)
- 403: Forbidden (insufficient permissions/role)

---

### rate-limit.middleware.ts
**Purpose:** Rate limiting configuration (Issue #26 fix)

**Rate Limiters:**
- `apiRateLimiter` - 100 req/15min (general API)
- `scanRateLimiter` - 10 req/1min per IP+device
- `deviceRateLimiter` - 50 req/5min per device
- `staffRateLimiter` - 30 req/1min per staff member
- `failedAttemptLimiter` - 5 failed/10min (security lockout)

**Key Strategy:** IP + device_id composite keys for accurate limiting

---

### tenant-context.ts
**Purpose:** PostgreSQL RLS tenant context setter

**Key Function:**
- `setTenantContext(request, reply)` - Sets `app.current_tenant` session variable

**Critical for:**
- Row Level Security (RLS) enforcement
- Complete tenant isolation at database level
- Scanner device isolation
- Offline cache isolation

**Usage:** Must run AFTER authentication middleware

---

### tenant.middleware.ts
**Purpose:** Helper functions for tenant-scoped queries

**Key Functions:**
- `setTenantContext(request, reply)` - Main middleware
- `getTenantClient(tenantId)` - Get client with tenant context
- `queryWithTenant(tenantId, query, params)` - Execute tenant-scoped query
- `transactionWithTenant(tenantId, callback)` - Transaction wrapper

**Security:** Fails fast if tenant context cannot be set (critical security error)

---

### validation.middleware.ts
**Purpose:** Joi validation middleware (Phase 2.5)

**Key Functions:**
- `validateRequest(schema)` - Validate request body
- `validateParams(schema)` - Validate URL params
- `validateQuery(schema)` - Validate query string

**Features:**
- Returns all validation errors (abortEarly: false)
- Strips unknown fields
- Formatted error responses

---

## 📁 config/

### database.ts
**Purpose:** PostgreSQL connection pool management

**Key Functions:**
- `initializeDatabase()` - Initialize with retry logic (5 attempts)
- `getPool()` - Get singleton pool instance

**Features:**
- DNS resolution with caching bypass
- Exponential backoff retry
- PgBouncer connection (port 6432)
- Pool size: 20 connections
- Connection timeout: 5s
- Idle timeout: 30s

---

### env.validator.ts
**Purpose:** Environment variable validation (Phase 2.3)

**Function:** `validateEnv()` - Joi-based validation

**Required Secrets:**
- `HMAC_SECRET` (min 32 chars) - QR code signing
- `JWT_SECRET` (min 32 chars) - Authentication
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `REDIS_HOST`

**Feature Configs:**
- `DUPLICATE_SCAN_WINDOW_SECONDS` (default: 600)
- `QR_EXPIRATION_SECONDS` (default: 30)
- `OFFLINE_MANIFEST_VALIDITY_HOURS` (default: 4)
- `MAX_REENTRY_LIMIT` (default: 5)

**Behavior:** Exits process if validation fails (fail-fast)

---

### redis.ts
**Purpose:** Redis connection management

**Key Functions:**
- `initializeRedis()` - Create Redis client
- `getRedis()` - Get singleton instance

**Configuration:**
- Host: REDIS_HOST (default: redis)
- Port: REDIS_PORT (default: 6379)
- Retry strategy: Exponential backoff (max 2s)

**Used For:**
- QR nonce deduplication (replay attack prevention)
- Duplicate scan detection caching
- Rate limiting state

---

### secrets.ts
**Purpose:** AWS Secrets Manager integration

**Function:** `loadSecrets()` - Load common secrets

**Loads:**
- PostgreSQL credentials
- Redis credentials

**Behavior:** Throws error if secrets unavailable (fail-fast)

---

## 📁 migrations/

### 001_baseline_scanning.ts
**Purpose:** Baseline database schema with RLS

**Tables Created (7):**

#### 1. `scanner_devices`
Scanner device registry with offline capabilities
- device_id, device_name, device_type
- venue_id, registered_by, revoked_by
- can_scan_offline, is_active
- ip_address, user_agent, app_version
- Tenant isolation + RLS

#### 2. `devices`
Simpler device registry
- device_id, name, zone
- is_active
- Tenant isolation + RLS

#### 3. `scans`
Scan event audit log
- ticket_id, device_id
- result (ALLOW/DENY), reason
- scanned_at, metadata
- Tenant isolation + RLS

#### 4. `scan_policy_templates`
Reusable policy templates
- name, description, policy_set (JSONB)
- is_default
- Tenant isolation + RLS

#### 5. `scan_policies`
Event-specific scan policies
- event_id, venue_id
- policy_type (DUPLICATE_WINDOW, REENTRY, ZONE_ENFORCEMENT)
- config (JSONB), is_active
- Unique constraint: (event_id, policy_type)
- Tenant isolation + RLS

#### 6. `offline_validation_cache`
Offline scanning validation data
- ticket_id, event_id
- validation_hash, valid_from, valid_until
- ticket_data (JSONB)
- Tenant isolation + RLS

#### 7. `scan_anomalies`
Fraud detection results
- ticket_id, device_id
- anomaly_types (TEXT[])
- risk_score (0-100), details (JSONB)
- Tenant isolation + RLS

**Foreign Keys (9):**
- scanner_devices → venues, users (registered_by, revoked_by)
- scans → tickets
- scan_policies → events, venues
- offline_validation_cache → tickets, events
- scan_anomalies → tickets

**Security:**
- Row Level Security (RLS) enabled on all tables
- Tenant isolation policies: `tenant_id = current_setting('app.current_tenant')`
- All tables have tenant_id with default tenant

---

## 📁 validators/

### scan.validator.ts
**Purpose:** Joi validation schemas (Phase 2.5)

**Schemas:**

#### `scanRequestSchema`
```typescript
{
  qr_data: string (format: ticketId:timestamp:nonce:hmac)
  device_id: UUID (required)
  location: string (max 200, optional)
  staff_user_id: UUID (optional)
  metadata: object (optional)
}
```

#### `bulkScanRequestSchema`
```typescript
{
  scans: array of scanRequestSchema (min 1, max 100)
}
```

---

## 📁 utils/

### logger.ts
**Purpose:** Winston logging configuration

**Configuration:**
- Service name: `scanning-service`
- Default level: `info`
- Format: JSON with timestamps
- Transports: Console (colorized) + File (10MB, 5 rotations)

---

### metrics.ts
**Purpose:** Prometheus metrics (Phase 3.4)

**Metrics Exported (25+):**

**HTTP:**
- `http_requests_total` (method, route, status)
- `http_request_duration_seconds` (buckets: 1ms-5s)

**Scanning:**
- `scans_allowed_total` (venue, event, access_level)
- `scans_denied_total` (reason, venue, event)
- `scan_latency_seconds` (result, venue)
- `qr_generation_duration_seconds`

**Security (Phase 2.8):**
- `replay_attacks_detected_total`
- `expired_qr_attempts_total`
- `authentication_failures_total`
- `venue_isolation_violations_total`
- `tenant_isolation_violations_total`

**Policies:**
- `duplicate_scans_detected_total`
- `reentry_allowed_total`
- `reentry_denied_total`
- `access_zone_violations_total`

**Offline:**
- `offline_manifests_generated_total`
- `offline_scans_reconciled_total`

**Infrastructure:**
- `database_connections_active`
- `database_query_duration_seconds`
- `redis_cache_hits_total`
- `redis_cache_misses_total`
- `rate_limit_exceeded_total`

**Business:**
- `active_scans_current`
- `scans_per_minute_current`
- `unique_tickets_scanned_total`

---

## 📁 workers/

**Status:** Empty - No background workers implemented

**Potential Future Workers:**
- Offline cache pre-generation
- Expired cache cleanup
- Anomaly alert notifications
- Analytics aggregation

---

## 🔧 Main Application (index.ts)

**Framework:** Fastify  
**Port:** 3009 (configurable)

**Startup Sequence:**
1. Environment validation (Phase 2.3)
2. Initialize PostgreSQL connection pool
3. Initialize Redis connection
4. Create Fastify app with timeout configs (Phase 2.4)
5. Register Helmet + CORS
6. Register tenant context middleware
7. Register health check endpoints
8. Register metrics endpoint
9. Register API routes
10. Start HTTP server

**Timeout Configuration (Phase 2.4):**
- Request timeout: 30s
- Connection timeout: 10s
- Keep-alive timeout: 5s

**Health Endpoints:**
- `/health` - Basic health with component checks
- `/health/ready` - Kubernetes readiness (503 during shutdown)
- `/health/live` - Kubernetes liveness
- `/health/db` - Database connectivity

**Graceful Shutdown (Phase 2.1):**
1. Set `isShuttingDown` flag (health checks return 503)
2. Stop accepting new connections
3. Close HTTP server
4. Close database pool
5. Close Redis connection
6. Wait 10s for in-flight requests
7. Exit cleanly

**Signals Handled:**
- SIGTERM, SIGINT
- uncaughtException, unhandledRejection

---

## 🔒 Security Features

### Phase 1.3: Tenant & Venue Isolation
- ✅ JWT authentication required for all scan operations
- ✅ Tenant ID validation (cross-tenant access blocked)
- ✅ Venue ID validation (staff can only scan at assigned venue)
- ✅ Device-venue matching enforcement
- ✅ Ticket-tenant verification
- ✅ Row Level Security (RLS) at database level

### Phase 2.3: Secret Management
- ✅ HMAC_SECRET required (min 32 chars)
- ✅ JWT_SECRET required (min 32 chars)
- ✅ Environment validation with Joi
- ✅ Fail-fast on missing secrets
- ✅ AWS Secrets Manager integration

### Phase 2.5: Input Validation
- ✅ Joi schemas for all scan endpoints
- ✅ UUID validation for device IDs
- ✅ QR format validation
- ✅ Request sanitization

### Phase 2.8: Replay Attack Prevention
- ✅ Nonce-based QR codes (16-char random)
- ✅ Redis-based nonce tracking (60s TTL)
- ✅ Timing-safe HMAC comparison
- ✅ Prometheus metric: `replay_attacks_detected_total`

### Issue #26: Rate Limiting
- ✅ 10 scans/minute per IP+device
- ✅ 50 scans/5min per device
- ✅ 30 scans/minute per staff
- ✅ 5 failed attempts/10min before lockout

---

## 📊 Key Business Logic

### Duplicate Detection
1. Check Redis cache for recent scan (fast path)
2. Query database for scans within policy window
3. If duplicate found, check re-entry policy
4. Cache result in Redis with TTL

### Re-entry Policy
- Configurable: enabled, cooldown period, max re-entries
- Enforced per ticket per event
- Cooldown timer between scans
- Re-entry counter with limits

### Access Zones
- Zone hierarchy: ALL > VIP > GA, BACKSTAGE (isolated)
- Device assigned to zone
- Ticket has access level
- Match validated on every scan

### Offline Mode
1. Device downloads manifest (HMAC tokens for all tickets)
2. Device validates scans locally
3. Device queues scan records
4. Device uploads when reconnected
5. Server reconciles with duplicate detection

---

## 🎯 Dependencies

**NPM Packages:**
- `fastify` - Web framework
- `@fastify/helmet`, `@fastify/cors` - Security
- `@fastify/rate-limit` - Rate limiting
- `pg` - PostgreSQL client
- `ioredis` - Redis client
- `winston` - Logging
- `prom-client` - Metrics
- `jsonwebtoken` - JWT handling
- `joi` - Validation
- `qrcode` - QR generation
- `knex` - Database migrations
- `dotenv` - Environment loading

**Database:**
- PostgreSQL (via PgBouncer on port 6432)
- Redis

**External Tables (Foreign Keys):**
- `tenants` - Tenant registry
- `venues` - Venue registry
- `users` - User accounts
- `tickets` - Ticket records
- `events` - Event records

---

## 📈 Performance Considerations

**Connection Pooling:**
- PostgreSQL: 20 max connections
- Redis: Single connection with auto-reconnect

**Caching Strategy:**
- Duplicate detection: Redis cache with policy-based TTL
- QR nonces: Redis with 60s TTL
- Database results cached in Redis for fast lookups

**Query Optimization:**
- Indexed columns: ticket_id, device_id, scanned_at, tenant_id
- Composite indexes for common query patterns
- Row Level Security with indexed tenant_id

**Metrics & Monitoring:**
- 25+ Prometheus metrics
- Request duration histograms
- Database query duration tracking
- Cache hit/miss ratios

---

## 🚀 Deployment Notes

**Environment Requirements:**
- `HMAC_SECRET` (32+ chars, required)
- `JWT_SECRET` (32+ chars, required)
- PostgreSQL with RLS enabled
- Redis for caching
- Prometheus for metrics (optional)

**Database Prerequisites:**
- `tenants` table must exist
- `venues`, `users`, `tickets`, `events` tables must exist
- UUID extension enabled
- Default tenant created

**Kubernetes:**
- Readiness probe: `/health/ready`
- Liveness probe: `/health/live`
- Graceful shutdown: 10s termination period
- Returns 503 during shutdown

**Migration:**
```bash
npm run migrate:up
```

**Start Service:**
```bash
npm start
```

---

## 📝 Summary

The **Scanning Service** is a **security-critical** component that handles all ticket validation at venue entry points. It provides:

- **Rotating QR codes** with replay attack prevention
- **Comprehensive policy enforcement** (duplicate, re-entry, zones)
- **Offline scanning** with reconciliation
- **Fraud detection** with risk scoring
- **Real-time analytics** and dashboards
- **Multi-tenant isolation** at database level
- **Venue-scoped permissions** for staff
- **Rate limiting** and security monitoring
- **Prometheus metrics** for observability
- **Graceful shutdown** for zero-downtime deployments

**Critical Security Features:**
- JWT authentication on all scan endpoints
- Tenant/venue isolation enforcement
- Nonce-based replay attack prevention
- HMAC-signed QR codes
- Row Level Security (RLS)
- Comprehensive audit logging

**Tables Owned:** 7 (scanner_devices, devices, scans, scan_policy_templates, scan_policies, offline_validation_cache, scan_anomalies)
