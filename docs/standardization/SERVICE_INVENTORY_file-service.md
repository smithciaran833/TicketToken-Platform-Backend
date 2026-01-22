# file-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how file-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** JWT authentication with algorithm whitelist, issuer/audience validation
**Files Examined:**
- `src/middleware/auth.middleware.ts`

### JWT Authentication

**How it works:**
- Algorithm whitelist: `RS256, HS256, HS384, HS512` (no 'none')
- Issuer validation: `JWT_ISSUER` env var (default: `tickettoken-auth-service`)
- Audience validation: `JWT_AUDIENCE` env var (default: `tickettoken-file-service`)
- Supports both symmetric (HS*) and asymmetric (RS256) keys
- Public key via `JWT_PUBLIC_KEY` env var (base64 encoded)

**Audit Fixes Applied:**
- S2S-4: Algorithm whitelisting
- S2S-5: Issuer validation
- S2S-6: Audience validation
- SEC-H1: JWT validation security

**Code Example:**
```typescript
// From middleware/auth.middleware.ts
const ALLOWED_ALGORITHMS: jwt.Algorithm[] = ['RS256', 'HS256', 'HS384', 'HS512'];
const EXPECTED_ISSUER = process.env.JWT_ISSUER || 'tickettoken-auth-service';
const EXPECTED_AUDIENCE = process.env.JWT_AUDIENCE || 'tickettoken-file-service';

function getVerifyOptions(): VerifyOptions {
  return {
    algorithms: ALLOWED_ALGORITHMS,
    issuer: EXPECTED_ISSUER,
    audience: EXPECTED_AUDIENCE,
    complete: false,
  };
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('No authentication token provided', 'NO_TOKEN');
  }

  const token = authHeader.slice(7);

  const decoded = jwt.verify(
    token,
    getJWTSecret(),
    getVerifyOptions()
  ) as JWTUser;

  setUser(request, decoded);
}
```

### Authentication Middleware Variants

| Middleware | Purpose |
|------------|---------|
| `authenticate` | Required JWT - rejects if missing/invalid |
| `authenticateOptional` | Optional JWT - continues without user if missing |
| `requireAdmin` | Requires admin role after authentication |
| `requireRole(role)` | Requires specific role after authentication |
| `requireFileOwnerOrAdmin(fn)` | Requires file ownership or admin |

### Role Checking

```typescript
// Admin detection supports multiple field formats
const isAdmin =
  user.is_system_admin === true ||
  user.isSystemAdmin === true ||
  user.isAdmin === true ||
  user.role === 'admin' ||
  user.roles?.includes('admin') ||
  user.roles?.includes('system_admin');
```

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes
**Files Examined:**
- `src/routes/index.ts`

**Findings:**
- file-service does **not expose** any `/internal/` routes
- All routes are public API endpoints requiring JWT authentication
- File ownership is enforced via `verifyFileOwnership` and `verifyFileModifyPermission` middleware
- Tenant context is set via `setTenantContext` middleware from JWT

**Public API Routes:**

| Route Category | Path Pattern | Auth | Additional Middleware |
|---------------|--------------|------|----------------------|
| Health | `/health` | None | - |
| Metrics | `/metrics` | None | - |
| Metrics JSON | `/metrics/json` | JWT + Admin | setTenantContext |
| Admin | `/admin/*` | JWT + Admin | setTenantContext |
| Documents | `/documents/:fileId/*` | JWT | setTenantContext, verifyFileOwnership |
| Download | `/download/:fileId` | JWT | setTenantContext, downloadRateLimiter, verifyFileOwnership |
| Stream | `/stream/:fileId` | JWT | setTenantContext, downloadRateLimiter, verifyFileOwnership |
| Images | `/images/:fileId/*` | JWT | setTenantContext, processingRateLimiter, verifyFileModifyPermission |
| QR | `/qr/*` | JWT | setTenantContext |
| Upload | `/upload/*` | JWT | setTenantContext, uploadRateLimiter |
| Delete | `/files/:fileId` | JWT | setTenantContext, verifyFileModifyPermission |

**Audit Fixes:**
- SEC-R7: Upload rate limiting
- SEC-R9: Processing rate limiting

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** Simple axios calls (no HMAC, no circuit breaker)
**Files Examined:**
- `src/services/ticket-pdf.service.ts`

### Venue Service Integration

**Purpose:** Fetch venue branding for ticket PDF generation

**How it works:**
- Uses axios with 2-second timeout
- No HMAC authentication (calls public API)
- No circuit breaker protection
- Fails gracefully - returns null if service unavailable

**Code Example:**
```typescript
// From services/ticket-pdf.service.ts
private async fetchVenueBranding(venueId: string): Promise<any> {
  try {
    const venueServiceUrl = process.env.VENUE_SERVICE_URL || 'http://venue-service:3002';

    // Fetch branding
    const response = await axios.get(
      `${venueServiceUrl}/api/v1/branding/${venueId}`,
      { timeout: 2000 }
    );

    // Fetch venue details for white-label check
    const venueResponse = await axios.get(
      `${venueServiceUrl}/api/v1/venues/${venueId}`,
      { timeout: 2000 }
    );

    return {
      branding: response.data.branding,
      isWhiteLabel: venueResponse.data.venue?.hide_platform_branding || false
    };
  } catch (error: any) {
    logger.warn({ venueId, errorMessage: error.message }, 'Failed to fetch branding for venue');
    return null; // Graceful degradation
  }
}
```

**Services Called:**
| Service | Endpoint | Purpose |
|---------|----------|---------|
| venue-service | `GET /api/v1/branding/:venueId` | Get venue branding config |
| venue-service | `GET /api/v1/venues/:venueId` | Check white-label setting |

**Note:** This is a **gap** in the standardization - file-service should use the shared HTTP client library with HMAC authentication for internal service calls.

---

## Category 4: Message Queues

**Implementation:** None
**Files Examined:**
- Searched for: amqplib, rabbitmq, Bull, bullmq, pg-boss
- `src/workers/index.ts` - Empty stub

**Findings:**
- file-service does **not use any message queues**
- Worker system is stubbed out (no-op functions)
- Cleanup operations run synchronously when triggered

**Worker Stub:**
```typescript
// From workers/index.ts
export async function startWorkers() { return true; }
export async function stopWorkers() { return true; }
```

### Cleanup Operations (On-Demand)

Instead of background workers, file-service provides cleanup via admin endpoints:

| Operation | Endpoint | Description |
|-----------|----------|-------------|
| `cleanupOrphanedFiles()` | `POST /admin/cleanup` | Delete files marked deleted > 7 days |
| `cleanupTempFiles()` | `POST /admin/cleanup` | Delete temp files > 24 hours |
| `calculateStorageUsage()` | Admin API | Calculate storage per entity |
| `enforceStorageLimits()` | Admin API | Check entities exceeding limits |

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT with algorithm whitelist | RS256/HS256, issuer/audience |
| Internal Endpoints | **None** | All routes are public API |
| HTTP Client (Outgoing) | Simple axios (no HMAC) | **Gap**: Should use shared client |
| Message Queues | **None** | Stub workers, on-demand cleanup |

**Key Characteristics:**
- file-service is a **standalone file storage service**
- Uses tenant context from JWT for multi-tenancy
- File ownership enforced at middleware level
- Rate limiting applied per operation type (upload, download, processing)
- No background workers - cleanup is admin-triggered
- **Standardization Gap:** Should use `@tickettoken/shared/clients` for venue-service calls

**Security Features:**
- Algorithm whitelisting prevents JWT algorithm confusion attacks
- Issuer/audience validation ensures tokens are from auth-service
- File ownership verification prevents unauthorized access
- Separate rate limits for upload/download/processing operations
