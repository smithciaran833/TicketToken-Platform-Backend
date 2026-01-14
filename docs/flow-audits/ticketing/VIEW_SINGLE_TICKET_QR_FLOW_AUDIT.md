# VIEW SINGLE TICKET & QR CODE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | View Single Ticket Details & Generate QR Code |

---

## Executive Summary

**PARTIAL IMPLEMENTATION - Duplicate endpoints with security gap**

| Component | Status |
|-----------|--------|
| Get single ticket by ID | ✅ Working |
| Ownership validation | ✅ Complete |
| Tenant isolation | ✅ Complete |
| QR generation (ticketRoutes) | ✅ Working & Protected |
| QR generation (qrRoutes) | ❌ UNPROTECTED |
| QR validation | ✅ Working |
| Rotating QR codes | ✅ Implemented |
| QR encryption | ✅ AES-256-CBC |
| API Gateway routing | ⚠️ Partial (/qr not routed) |

**Bottom Line:** The core functionality works well with good security on the main ticket routes. However, there's a duplicate set of QR endpoints (`/api/v1/qr/*`) that lack authentication middleware - a security vulnerability if the service is directly accessible.

---

## Architecture Overview

### Expected Flow
```
┌─────────────────────────────────────────────────────────────┐
│              VIEW SINGLE TICKET + QR FLOW                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   User Request ──> API Gateway ──> Ticket Service            │
│                         │                                    │
│                         ▼                                    │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              TICKET RETRIEVAL                        │   │
│   ├─────────────────────────────────────────────────────┤   │
│   │  1. Authenticate user (JWT)                         │   │
│   │  2. Get ticket from DB with tenant isolation        │   │
│   │  3. Verify ownership (user owns ticket OR admin)    │   │
│   │  4. Return ticket with event/type details           │   │
│   └─────────────────────────────────────────────────────┘   │
│                         │                                    │
│                         ▼                                    │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              QR CODE GENERATION                      │   │
│   ├─────────────────────────────────────────────────────┤   │
│   │  1. Verify ticket ownership again                   │   │
│   │  2. Create time-based QR payload                    │   │
│   │  3. Encrypt with AES-256-CBC                        │   │
│   │  4. Generate QR image (base64)                      │   │
│   │  5. Store validation data in Redis                  │   │
│   │  6. Return QR code + image (expires in 30s)         │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Actual Flow (Fragmented)
```
┌─────────────────────────────────────────────────────────────┐
│              ACTUAL IMPLEMENTATION                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   PROTECTED ROUTES (ticketRoutes.ts):                       │
│   ├── GET /api/v1/tickets/:ticketId        ✅ Auth          │
│   ├── GET /api/v1/tickets/:ticketId/qr     ✅ Auth          │
│   └── POST /api/v1/tickets/validate-qr     ✅ Auth + Role   │
│                                                              │
│   UNPROTECTED ROUTES (qrRoutes.ts):                         │
│   ├── GET /api/v1/qr/:ticketId/generate    ❌ NO AUTH       │
│   ├── POST /api/v1/qr/validate             ❌ NO AUTH       │
│   └── POST /api/v1/qr/refresh              ❌ NO AUTH       │
│                                                              │
│   Note: API Gateway only routes /tickets/*, not /qr/*       │
│   Vulnerability exists if ticket-service is directly        │
│   accessible (e.g., internal network, misconfigured LB)     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## What Works ✅

### 1. Get Single Ticket

**Route:** `GET /api/v1/tickets/:ticketId`

**File:** `backend/services/ticket-service/src/routes/ticketRoutes.ts`
```typescript
fastify.get('/:ticketId', {
  preHandler: [rateLimiters.read, authMiddleware]
}, (request, reply) => ticketController.getTicketById(request, reply));
```

**Controller:** `backend/services/ticket-service/src/controllers/ticketController.ts`
```typescript
async getTicketById(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { ticketId } = request.params as any;
  const tenantId = (request as any).tenantId;
  const user = (request as any).user;

  const ticket = await this.ticketService.getTicket(ticketId, tenantId);

  if (!ticket) {
    return reply.status(404).send({
      error: 'NOT_FOUND',
      message: 'Ticket not found'
    });
  }

  // Security: Only owner or admin can view ticket
  if (ticket.user_id !== user?.id && user?.role !== 'admin') {
    return reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'You do not own this ticket'
    });
  }

  reply.send({
    success: true,
    data: ticket
  });
}
```

### 2. Generate QR Code (Protected)

**Route:** `GET /api/v1/tickets/:ticketId/qr`

**File:** `backend/services/ticket-service/src/routes/ticketRoutes.ts`
```typescript
fastify.get('/:ticketId/qr', {
  preHandler: [rateLimiters.read, authMiddleware]
}, (request, reply) => ticketController.generateQR(request, reply));
```

**Controller:**
```typescript
async generateQR(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { ticketId } = request.params as any;
  const tenantId = (request as any).tenantId;
  const user = (request as any).user;

  const ticket = await this.ticketService.getTicket(ticketId, tenantId);

  if (ticket.user_id !== user?.id && user?.role !== 'admin') {
    return reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'You do not own this ticket'
    });
  }

  const result = await this.qrService.generateRotatingQR(ticketId);

  reply.send({
    success: true,
    data: {
      qrCode: result.qrCode,
      qrImage: result.qrImage,
      expiresIn: 30
    }
  });
}
```

### 3. QR Service - Rotating Codes

**File:** `backend/services/ticket-service/src/services/qrService.ts`
```typescript
async generateRotatingQR(ticketId: string): Promise<{ qrCode: string; qrImage: string }> {
  const ticket = await this.getTicketData(ticketId);

  // Create time-based QR data
  const timestamp = Math.floor(Date.now() / config.qr.rotationInterval);
  const qrData = {
    ticketId,
    eventId: ticket.event_id,
    timestamp,
    nonce: crypto.randomBytes(8).toString('hex')
  };

  // Encrypt QR data
  const encrypted = this.encrypt(JSON.stringify(qrData));
  const qrString = `TKT:${encrypted}`;

  // Generate QR image
  const qrImage = await QRCode.toDataURL(qrString, {
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });

  // Store validation data in Redis
  try {
    const validationKey = `qr:${ticketId}:${timestamp}`;
    await RedisService.set(
      validationKey,
      JSON.stringify({
        ticketId,
        eventId: ticket.event_id,
        validUntil: new Date((timestamp + 1) * config.qr.rotationInterval)
      }),
      config.qr.rotationInterval * 2
    );
  } catch (error) {
    this.log.warn('Redis storage failed for QR validation data, QR will still work', { ticketId });
  }

  return { qrCode: qrString, qrImage };
}
```

**Security Features:**
- ✅ Time-based rotation (configurable interval)
- ✅ Random nonce per generation
- ✅ AES-256-CBC encryption
- ✅ Redis caching with TTL
- ✅ Graceful Redis failure handling

### 4. QR Encryption

**File:** `backend/services/ticket-service/src/services/qrService.ts`
```typescript
private encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey.slice(0, 32), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}
```

### 5. QR Validation (Protected)

**Route:** `POST /api/v1/tickets/validate-qr`

**File:** `backend/services/ticket-service/src/routes/ticketRoutes.ts`
```typescript
fastify.post('/validate-qr', {
  preHandler: [rateLimiters.qrScan, authMiddleware, requireRole(['admin', 'venue_manager', 'venue_staff'])]
}, (request, reply) => ticketController.validateQR(request, reply));
```

**Validation Logic:**
```typescript
async validateQR(qrCode: string, validationData: {...}): Promise<QRValidation> {
  // 1. Verify QR format
  if (!qrCode.startsWith('TKT:')) {
    throw new ValidationError('Invalid QR format');
  }

  // 2. Decrypt and parse
  const encrypted = qrCode.substring(4);
  const decrypted = this.decrypt(encrypted);
  const qrData = JSON.parse(decrypted);

  // 3. Validate timestamp (within 2 rotation intervals)
  const currentTimestamp = Math.floor(Date.now() / config.qr.rotationInterval);
  const timeDiff = currentTimestamp - qrData.timestamp;
  if (timeDiff < 0 || timeDiff > 2) {
    return { isValid: false, reason: 'QR code expired' };
  }

  // 4. Validate event match
  if (qrData.eventId !== validationData.eventId) {
    return { isValid: false, reason: 'Wrong event' };
  }

  // 5. Check ticket status
  const ticket = await this.getTicketData(qrData.ticketId);
  if (ticket.status === TicketStatus.USED) {
    return { isValid: false, reason: 'Ticket already used' };
  }

  // 6. Mark as used (with row locking)
  await DatabaseService.transaction(async (client) => {
    const lockQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
    // ... update status to USED
  });

  return { isValid: true, validatedAt: new Date() };
}
```

---

## What's Missing / Broken ❌

### 1. SECURITY: Unprotected QR Routes

**File:** `backend/services/ticket-service/src/routes/qrRoutes.ts`
```typescript
export default async function qrRoutes(fastify: FastifyInstance) {
  // NO AUTH MIDDLEWARE!
  fastify.get('/:ticketId/generate',
    (request, reply) => qrController.generateQR(request, reply)
  );

  fastify.post('/validate',
    (request, reply) => qrController.validateQR(request, reply)
  );

  fastify.post('/refresh',
    (request, reply) => qrController.refreshQR(request, reply)
  );
}
```

**Impact:** If ticket-service is directly accessible (not through API gateway), anyone can:
- Generate QR codes for any ticket ID
- Validate QR codes without staff authentication
- Refresh QR codes for any ticket

**Note:** The controller does check ownership, but without auth middleware, `request.user` will be undefined, potentially causing errors or bypasses.

### 2. Duplicate Endpoints

| Function | Protected Route | Unprotected Route |
|----------|-----------------|-------------------|
| Generate QR | `GET /tickets/:id/qr` | `GET /qr/:id/generate` |
| Validate QR | `POST /tickets/validate-qr` | `POST /qr/validate` |
| Refresh QR | N/A | `POST /qr/refresh` |

### 3. Missing Ticket Details in Response

Current `getTicketById` returns raw ticket data. Missing user-friendly fields:
- Formatted price
- Event date/time
- Venue name and address
- Seat/section information
- Transfer history

---

## API Endpoints

### Ticket Service - Protected

| Endpoint | Method | Auth | Role Required | Status |
|----------|--------|------|---------------|--------|
| `/api/v1/tickets/:ticketId` | GET | ✅ | Owner/Admin | ✅ Working |
| `/api/v1/tickets/:ticketId/qr` | GET | ✅ | Owner/Admin | ✅ Working |
| `/api/v1/tickets/validate-qr` | POST | ✅ | venue_staff+ | ✅ Working |

### Ticket Service - UNPROTECTED (Security Issue)

| Endpoint | Method | Auth | Status |
|----------|--------|------|--------|
| `/api/v1/qr/:ticketId/generate` | GET | ❌ | ⚠️ Vulnerable |
| `/api/v1/qr/validate` | POST | ❌ | ⚠️ Vulnerable |
| `/api/v1/qr/refresh` | POST | ❌ | ⚠️ Vulnerable |

### API Gateway

| Endpoint | Proxies To | Status |
|----------|------------|--------|
| `/api/v1/tickets/*` | ticket-service | ✅ Working |
| `/api/v1/qr/*` | - | ❌ Not configured (good - limits exposure) |

### Internal Routes (S2S Auth)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/internal/tickets/:ticketId/status` | GET | S2S HMAC | Refund eligibility check |
| `/internal/tickets/cancel-batch` | POST | S2S HMAC | Batch cancellation |
| `/internal/tickets/calculate-price` | POST | S2S HMAC | Price calculation |

---

## QR Code Payload Structure
```json
{
  "ticketId": "uuid",
  "eventId": "uuid",
  "timestamp": 1704067200,
  "nonce": "a1b2c3d4e5f6g7h8"
}
```

**Encrypted format:** `TKT:{iv}:{encrypted_hex}`

---

## Database Tables

### tickets
```sql
-- Relevant columns for this flow
id UUID PRIMARY KEY,
user_id UUID,
event_id UUID,
ticket_type_id UUID,
status VARCHAR(20),
validated_at TIMESTAMP,
validator_id UUID,
entrance VARCHAR(100)
```

### ticket_validations
```sql
CREATE TABLE ticket_validations (
  id UUID PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id),
  event_id UUID,
  validated_at TIMESTAMP,
  validator_id UUID,
  entrance VARCHAR(100),
  device_id VARCHAR(100)
);
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `ticket-service/src/routes/ticketRoutes.ts` | Protected ticket & QR routes |
| `ticket-service/src/routes/qrRoutes.ts` | **UNPROTECTED** QR routes |
| `ticket-service/src/controllers/ticketController.ts` | Ticket + QR controller |
| `ticket-service/src/controllers/qrController.ts` | Duplicate QR controller |
| `ticket-service/src/services/ticketService.ts` | Ticket data access |
| `ticket-service/src/services/qrService.ts` | QR generation & validation |
| `api-gateway/src/routes/tickets.routes.ts` | Gateway proxy |

---

## Recommendations

### P0 - Security Fix (CRITICAL)

| Issue | Fix | Effort |
|-------|-----|--------|
| Unprotected QR routes | Add `authMiddleware` to all routes in `qrRoutes.ts` OR delete the file entirely | 0.5 day |

**Immediate fix for qrRoutes.ts:**
```typescript
import { authMiddleware, requireRole } from '../middleware/auth';

export default async function qrRoutes(fastify: FastifyInstance) {
  fastify.get('/:ticketId/generate', {
    preHandler: [authMiddleware]
  }, (request, reply) => qrController.generateQR(request, reply));

  fastify.post('/validate', {
    preHandler: [authMiddleware, requireRole(['admin', 'venue_manager', 'venue_staff'])]
  }, (request, reply) => qrController.validateQR(request, reply));

  fastify.post('/refresh', {
    preHandler: [authMiddleware]
  }, (request, reply) => qrController.refreshQR(request, reply));
}
```

**OR simply delete qrRoutes.ts** since ticketRoutes.ts already has protected versions.

### P1 - Cleanup

| Issue | Fix | Effort |
|-------|-----|--------|
| Duplicate QR routes | Remove `qrRoutes.ts` and `qrController.ts` | 0.5 day |
| Add refresh to ticketRoutes | Add `POST /tickets/:ticketId/qr/refresh` if needed | 0.5 day |

### P2 - Enhancements

| Issue | Fix | Effort |
|-------|-----|--------|
| Missing ticket details | Enrich response with event, venue, price info | 1 day |
| No transfer history in response | Add transfer history to ticket view | 0.5 day |

---

## Related Documents

- `VIEW_MY_TICKETS_FLOW_AUDIT.md` - Listing all user tickets
- `TICKET_VALIDATION_ENTRY_FLOW_AUDIT.md` - Full scanning flow
- `TICKET_SCANNING_FLOW_AUDIT.md` - Scanner device operations
- `TICKET_TRANSFER_GIFT_FLOW_AUDIT.md` - Ownership changes
