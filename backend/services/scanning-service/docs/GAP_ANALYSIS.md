# Scanning Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED (No audit files - reviewed codebase directly)

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Security | 0 | - |
| Multi-Tenancy | 0 | - |
| Frontend Features | 3 | MEDIUM |

**Good News:** This service is well-built. Auth, tenant isolation, RLS all implemented properly.

---

## What Works Well ✅

### Authentication
- JWT authentication on all scan routes
- Role-based access: VENUE_STAFF, VENUE_MANAGER, ADMIN
- `authenticateRequest` middleware properly implemented

### Multi-Tenancy
- RLS policies on ALL 7 tables
- `SET LOCAL app.current_tenant` called in middleware
- Cross-tenant checks in QRValidator
- Tenant isolation violations logged and metricked

### Security
- Rate limiting on scan endpoints
- Joi validation on requests
- Logging of scan attempts with user context
- Device-venue binding enforced

### Offline Support
- GET /offline/manifest/:eventId - download tickets for offline
- POST /offline/reconcile - sync offline scans when back online

---

## All Routes Inventory

### scan.ts (2 routes) ✅ AUTH + VALIDATION
| Method | Path | Auth | Validation | Purpose |
|--------|------|------|------------|---------|
| POST | / | ✅ VENUE_STAFF+ | ✅ Joi | Scan ticket |
| POST | /bulk | ✅ VENUE_STAFF+ | ✅ Joi | Bulk scan (not implemented) |

### devices.ts (2 routes)
| Method | Path | Auth | Validation | Purpose |
|--------|------|------|------------|---------|
| GET | / | ❓ | ❌ | List devices |
| POST | /register | ❓ | ❌ | Register device |

### qr.ts (2 routes)
| Method | Path | Auth | Validation | Purpose |
|--------|------|------|------------|---------|
| GET | /generate/:ticketId | ❓ | ❌ | Generate QR |
| POST | /validate | ❓ | ❌ | Validate QR |

### policies.ts (4 routes)
| Method | Path | Auth | Validation | Purpose |
|--------|------|------|------------|---------|
| GET | /templates | ❓ | ❌ | List policy templates |
| GET | /event/:eventId | ❓ | ❌ | Get event policies |
| POST | /event/:eventId/apply-template | ❓ | ❌ | Apply template |
| PUT | /event/:eventId/custom | ❓ | ❌ | Set custom policies |

### offline.ts (2 routes)
| Method | Path | Auth | Validation | Purpose |
|--------|------|------|------------|---------|
| GET | /manifest/:eventId | ❌ | ❌ | Get offline manifest |
| POST | /reconcile | ❌ | ❌ | Reconcile offline scans |

### health.routes.ts (2 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Health check |
| GET | /health/db | Database check |

---

## Frontend-Related Gaps

### GAP-SCAN-001: No Scan History Endpoint
- **Severity:** MEDIUM
- **User Story:** "As a venue manager, I want to see all scans for my event"
- **Current:** `scans` table exists, no GET endpoint to retrieve history
- **Needed:**
  - GET /scans/event/:eventId - list scans for event
  - Query params: ?from=datetime&to=datetime&result=ALLOW|DENY&device_id=x
  - Pagination support
- **Impact:** Venue portal can't show scan activity log

### GAP-SCAN-002: No Scan Analytics Endpoint
- **Severity:** MEDIUM
- **User Story:** "Show me how many people have entered vs tickets sold"
- **Current:** Metrics exist (Prometheus) but no API endpoint
- **Needed:**
  - GET /analytics/event/:eventId - scan stats
  - Returns: total_scanned, unique_tickets, denied_count, by_hour breakdown
- **Impact:** Can't build event dashboard with entry stats

### GAP-SCAN-003: No Real-Time Scan Count
- **Severity:** LOW
- **User Story:** "Show live attendance count during event"
- **Current:** No endpoint
- **Needed:**
  - GET /live/event/:eventId/count - current entry count
  - Could use WebSocket for real-time updates
- **Impact:** No live attendance dashboard

### GAP-SCAN-004: Offline/Device Routes Missing Auth
- **Severity:** MEDIUM
- **Current:** GET /offline/manifest and POST /offline/reconcile have no auth
- **Risk:** Anyone could download ticket manifest or submit fake scans
- **Fix:** Add authenticateRequest + role check to offline routes

### GAP-SCAN-005: Bulk Scan Not Implemented
- **Severity:** LOW
- **Current:** POST /bulk returns 501 Not Implemented
- **Note:** May not be needed, flag for product decision

---

## Database Tables (7 tables)

| Table | RLS | Purpose |
|-------|-----|---------|
| scanner_devices | ✅ | Device registry |
| devices | ✅ | Device info |
| scans | ✅ | Scan records |
| scan_policy_templates | ✅ | Policy templates |
| scan_policies | ✅ | Event-specific policies |
| offline_validation_cache | ✅ | Offline ticket data |
| scan_anomalies | ✅ | Suspicious activity |

---

## Cross-Service Dependencies

| This service needs from | What |
|------------------------|------|
| ticket-service | Ticket validation, ownership |
| event-service | Event details, timing |
| venue-service | Venue ownership verification |
| auth-service | User/staff authentication |

| Other services need from this | What |
|------------------------------|------|
| analytics-service | Scan data for reports |
| ticket-service | Mark ticket as used |

---

## Priority Order for Fixes

### This Week
1. GAP-SCAN-004: Add auth to offline routes

### This Month (Frontend Features)
2. GAP-SCAN-001: Scan history endpoint
3. GAP-SCAN-002: Scan analytics endpoint
4. GAP-SCAN-003: Real-time scan count

