# scanning-service Communication Inventory
**Date:** January 21, 2026
**Purpose:** Document how scanning-service implements the 4 connection patterns

---

## Category 1: Service-to-Service Authentication (Incoming)

**Implementation:** Dual system - JWT for API routes + Service key for internal services
**Files Examined:**
- `src/middleware/auth.middleware.ts` - JWT and internal service authentication

### System 1: JWT Authentication (User Requests)

**How it works:**
- Configurable algorithm whitelist: `RS256, HS256` (default, configurable via `JWT_ALGORITHMS`)
- Supports both symmetric (HS256) and asymmetric (RS256) keys
- Issuer validation via `JWT_ISSUER` (default: `tickettoken-auth-service`)
- Audience validation via `JWT_AUDIENCE` (default: `scanning-service`)
- Clock tolerance: 30 seconds
- Minimum key length validation: 32 characters for HS256

**Audit Fixes Applied:**
- S2S-2: JWT issuer validation
- S2S-3: JWT audience validation
- S2S-4: Key strength validation (32-byte minimum)

**Code Example:**
```typescript
// From middleware/auth.middleware.ts
const JWT_CONFIG = {
  issuer: process.env.JWT_ISSUER || 'tickettoken-auth-service',
  audience: process.env.JWT_AUDIENCE || 'scanning-service',
  algorithms: (process.env.JWT_ALGORITHMS?.split(',') || ['RS256', 'HS256']) as jwt.Algorithm[],
  clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE || '30', 10),
  minKeyLength: 32,
};

function getVerifyOptions(): jwt.VerifyOptions {
  return {
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
    algorithms: JWT_CONFIG.algorithms,
    clockTolerance: JWT_CONFIG.clockTolerance,
    complete: false,
  };
}

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = authHeader.substring(7);
  const jwtKey = getJWTSecret();
  const verifyOptions = getVerifyOptions();

  const payload = jwt.verify(token, jwtKey, verifyOptions) as JWTPayload;

  // Validate required claims
  if (!payload.userId || !payload.tenantId || !payload.role) {
    return reply.status(401).send({ /* ... */ });
  }

  // Validate tenant ID format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(payload.tenantId)) {
    return reply.status(401).send({ /* ... */ });
  }

  request.user = payload;
  request.tenantId = payload.tenantId;
}
```

### Role-Based Authorization

```typescript
// From middleware/auth.middleware.ts
export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        type: 'https://api.tickettoken.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Insufficient permissions for this operation',
        required: allowedRoles,
        current: request.user?.role,
      });
    }
  };
}
```

**Defined Roles:**
| Role | Access Level |
|------|-------------|
| `VENUE_STAFF` | Scan tickets at assigned venue |
| `VENUE_MANAGER` | Manage venue scanning operations |
| `TICKET_HOLDER` | Generate QR codes for own tickets |
| `SCANNER` | Validate QR codes |
| `ORGANIZER` | Full event management |
| `ADMIN` | Full system access |

### Permission-Based Authorization

```typescript
// From middleware/auth.middleware.ts
export function requirePermission(...requiredPermissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userPermissions = request.user?.permissions || [];
    const hasAllPermissions = requiredPermissions.every(perm =>
      userPermissions.includes(perm)
    );

    if (!hasAllPermissions) {
      const missingPermissions = requiredPermissions.filter(
        perm => !userPermissions.includes(perm)
      );
      return reply.status(403).send({ /* ... */ });
    }
  };
}
```

### System 2: Internal Service Authentication

**How it works:**
- Headers required: `x-service-key`, `x-service-name`
- Service key validated via `INTERNAL_SERVICE_KEY` env var
- Service allowlist via `ALLOWED_INTERNAL_SERVICES` env var
- Uses `crypto.timingSafeEqual` for constant-time comparison

**Code Example:**
```typescript
// From middleware/auth.middleware.ts
export async function authenticateInternalService(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serviceKey = request.headers['x-service-key'] as string;
  const serviceName = request.headers['x-service-name'] as string;

  if (!serviceKey || !serviceName) {
    return reply.status(401).send({
      detail: 'Missing service credentials'
    });
  }

  const expectedKey = process.env.INTERNAL_SERVICE_KEY;
  const allowedServices = (process.env.ALLOWED_INTERNAL_SERVICES || '').split(',');

  // Use timing-safe comparison to prevent timing attacks
  const keyBuffer = Buffer.from(serviceKey);
  const expectedBuffer = Buffer.from(expectedKey);

  if (keyBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(keyBuffer, expectedBuffer)) {
    return reply.status(401).send({
      detail: 'Invalid service credentials'
    });
  }

  if (!allowedServices.includes(serviceName)) {
    return reply.status(403).send({
      detail: 'Service not authorized'
    });
  }
}
```

### QR Code HMAC Validation

**Purpose:** Validate rotating QR codes with replay attack prevention

```typescript
// From services/QRValidator.ts
async validateQRToken(
  ticketId: string,
  timestamp: string,
  nonce: string,
  providedHmac: string
): Promise<TokenValidation> {
  const redis = getRedis();
  const now = Date.now();
  const tokenAge = now - parseInt(timestamp);

  // Check if token is within valid time window (30 seconds)
  if (tokenAge > this.timeWindowSeconds * 1000) {
    return { valid: false, reason: 'QR_EXPIRED' };
  }

  // Check if nonce has already been used (replay attack prevention)
  const nonceKey = `qr-nonce:${nonce}`;
  const alreadyUsed = await redis.get(nonceKey);

  if (alreadyUsed) {
    logger.warn('Replay attack detected - nonce already used', { nonce, ticketId });
    return { valid: false, reason: 'QR_ALREADY_USED' };
  }

  // Verify HMAC using timing-safe comparison
  const data = `${ticketId}:${timestamp}:${nonce}`;
  const expectedHmac = crypto
    .createHmac('sha256', this.hmacSecret)
    .update(data)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedHmac, 'hex');
  const providedBuffer = Buffer.from(providedHmac, 'hex');

  if (expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return { valid: false, reason: 'INVALID_QR' };
  }

  // Mark nonce as used (expire after 60 seconds)
  await redis.setex(nonceKey, 60, '1');

  return { valid: true };
}
```

---

## Category 2: Internal Endpoint Patterns

**Implementation:** No dedicated `/internal/` routes
**Files Examined:**
- `src/routes/` directory
- `src/index.ts`

**Findings:**
- scanning-service does **not expose** any `/internal/` routes
- All routes are public API endpoints requiring JWT authentication
- Internal services can use the `authenticateInternalService` middleware if needed

**Public API Routes:**

| Route Prefix | Auth | Description |
|--------------|------|-------------|
| `/health` | None | Health check endpoints |
| `/health/ready` | None | Kubernetes readiness probe |
| `/health/live` | None | Kubernetes liveness probe |
| `/metrics` | None | Prometheus metrics export |
| `/api/scan` | JWT + Role | Main scanning endpoint |
| `/api/scan/bulk` | JWT + Role | Bulk scanning |
| `/api/qr/generate/:ticketId` | JWT + Role | Generate rotating QR |
| `/api/qr/validate` | JWT + Role | Validate QR code |
| `/api/qr/status/:ticketId` | JWT + Role | Get QR status |
| `/api/qr/revoke/:ticketId` | JWT + Admin | Revoke QR code |
| `/api/devices` | None | List devices |
| `/api/devices/register` | None | Register device |
| `/api/offline/manifest/:eventId` | None | Get offline manifest |
| `/api/offline/reconcile` | None | Reconcile offline scans |
| `/api/policies/templates` | None | List policy templates |
| `/api/policies/event/:eventId` | None | Get event policies |

**Route Authorization:**

| Endpoint | Required Roles |
|----------|---------------|
| `POST /api/scan` | VENUE_STAFF, VENUE_MANAGER, ADMIN |
| `POST /api/scan/bulk` | VENUE_STAFF, VENUE_MANAGER, ADMIN |
| `GET /api/qr/generate/:ticketId` | TICKET_HOLDER, VENUE_STAFF, ADMIN, ORGANIZER |
| `POST /api/qr/validate` | VENUE_STAFF, SCANNER, ADMIN, ORGANIZER |
| `POST /api/qr/revoke/:ticketId` | ADMIN, ORGANIZER |

---

## Category 3: HTTP Client (Outgoing)

**Implementation:** None - direct database access
**Files Examined:**
- `src/services/QRValidator.ts`
- `src/services/OfflineCache.ts`
- `src/services/analytics-dashboard.service.ts`
- `src/routes/policies.ts`

**Findings:**
- scanning-service does **not make HTTP calls** to other services
- Uses direct PostgreSQL queries for tickets, events, and venues data
- This is an intentional **PHASE 5c BYPASS EXCEPTION** documented in code

**Rationale (from code comments):**
```typescript
/**
 * PHASE 5c BYPASS EXCEPTION:
 * This is the most performance-critical service in scanning-service.
 * It reads from tickets/events and WRITES scan_count updates to tickets.
 * This is intentional because:
 *
 * 1. LATENCY: Scanning must complete in <500ms for real-time entry validation
 * 2. ATOMICITY: The validation + scan_count update must be transactional
 * 3. VOLUME: Events can have thousands of scans per minute at entry
 * 4. AVAILABILITY: Scanning must work even if ticket-service is degraded
 * 5. The scans table (primary data) is scanning-service owned
 */
```

**Direct Database Access:**
| Table | Operation | Purpose |
|-------|-----------|---------|
| `scans` | READ/WRITE | Scan records (owned) |
| `devices` | READ/WRITE | Device registration (owned) |
| `scan_policies` | READ/WRITE | Scan policies (owned) |
| `offline_validation_cache` | READ/WRITE | Offline cache (owned) |
| `tickets` | READ/WRITE | Ticket status, scan_count |
| `events` | READ | Event details |
| `venues` | READ | Venue information |

**Future Improvement (noted in code):**
> The ticket writes (scan_count, last_scanned_at, first_scanned_at) are
> metadata updates that should eventually be refactored to use:
> - ticketServiceClient.recordScan() for async scan counting
> - Event-driven updates via message queue

---

## Category 4: Message Queues

**Implementation:** None
**Files Examined:**
- Searched for: `amqplib`, `rabbitmq`, `bull`, `bullmq`, `pg-boss`
- `src/config/` directory

**Findings:**
- scanning-service does **not use any message queues**
- All operations are synchronous database transactions
- This is appropriate for real-time scanning requirements

**Why No Queues:**
1. **Real-time requirement:** Scanning must respond immediately (< 500ms)
2. **Transactional integrity:** Scan validation and logging must be atomic
3. **High throughput:** Direct DB operations are faster than queue round-trips
4. **Simplicity:** Scanning is a stateless, request-response operation

**Future Consideration (from code):**
> Event-driven updates via message queue

Could be used for:
- Async notification to analytics systems
- Cross-service scan event propagation
- Audit log distribution

---

## Summary

| Category | Implementation | Notes |
|----------|---------------|-------|
| Auth (Incoming) | JWT + Service key | Algorithm whitelist, issuer/audience validation |
| Internal Endpoints | **None** | All routes are public API |
| HTTP Client (Outgoing) | **None** | Direct database access (intentional bypass) |
| Message Queues | **None** | Synchronous operations only |

**Key Characteristics:**
- scanning-service is the **real-time entry validation** system
- Optimized for <500ms response time with thousands of scans/minute
- Uses rotating QR codes with HMAC-SHA256 and nonce-based replay prevention
- Supports offline scanning with pre-generated validation caches
- Direct database access for performance-critical operations
- Multi-tenant isolation enforced at JWT and database levels

**Security Features:**
- JWT algorithm whitelist (RS256, HS256)
- JWT issuer and audience validation
- Key strength validation (32-byte minimum)
- Timing-safe comparison for all secrets
- Nonce-based replay attack prevention
- 30-second QR code expiration window
- Tenant isolation at database level
- Venue isolation for staff scanning
- Role-based and permission-based authorization

**Performance Optimizations:**
- Redis caching for duplicate scan detection
- Offline validation cache for connectivity issues
- Direct PostgreSQL queries (no HTTP overhead)
- Connection pooling with PgBouncer
- Prometheus metrics for monitoring

**Standardization Notes:**
- No standardization gaps - service is intentionally self-contained
- Direct database access is documented exception for performance
- Internal service auth uses simple key (not HMAC) - acceptable for this use case
- Future refactoring should add async scan count updates via message queue

