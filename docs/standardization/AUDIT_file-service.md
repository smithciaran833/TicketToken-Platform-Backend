# Audit Report: file-service Internal Endpoints

**Date:** January 21, 2026
**Auditor:** Claude Code
**Service Port:** 3013
**Purpose:** Determine if file-service needs /internal/ endpoints

---

## Executive Summary

**Recommendation: MODERATE /internal/ endpoints needed**

file-service currently has **NO** internal endpoints. All file operations go through the API Gateway with JWT authentication. However, several internal endpoints are needed for:

1. **GDPR compliance** - Other services need to query user's files for data export
2. **Service-to-service file metadata** - Services storing file references need metadata validation
3. **Standardization gap** - file-service calls venue-service WITHOUT HMAC authentication

---

## 1. HTTP Calls TO file-service

### Search Methodology
- Searched for: `FILE_SERVICE_URL`, `file-service`, `fileClient`, `serviceUrls.file`, `:3013`
- Examined: All `*Client.ts` files, service configurations

### Findings: NO direct service-to-service HTTP calls

| Service | Makes HTTP calls to file-service? | Notes |
|---------|-----------------------------------|-------|
| api-gateway | **Yes (proxy only)** | Routes `/api/v1/file/*` to file-service |
| venue-service | No | Stores file URLs only |
| event-service | No | Stores file URLs only |
| ticket-service | No | Has upload middleware locally |
| compliance-service | No | Has own S3 storage service |
| marketplace-service | No | Stores file URLs only |
| blockchain-service | No | Has `fileService` URL configured but unused |

**Key Finding:** Services store file URLs in their databases but don't call file-service directly. Uploads happen:
1. Client → API Gateway → file-service (get signed URL)
2. Client → S3 directly (using signed URL)
3. Client → API Gateway → file-service (confirm upload)

### api-gateway Configuration

```typescript
// backend/services/api-gateway/src/routes/file.routes.ts
export default async function fileRoutes(server: FastifyInstance) {
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.file}/api/v1/file`,
    serviceName: 'file',
    publicPaths: ['/health', '/metrics']
  });
  return authenticatedRoutes(server);
}
```

---

## 2. Queue Messages FROM file-service

### Search Methodology
- Searched for: `publish`, `emit`, `queue`, `amqplib`, `rabbitmq`, `bull`
- Examined: `src/workers/index.ts`, `src/services/*.ts`

### Findings: **NONE**

**Current state:**
- No message queue integration
- Worker system is stubbed (empty functions)
- Cleanup operations run on-demand via admin endpoints

```typescript
// backend/services/file-service/src/workers/index.ts
export async function startWorkers() { return true; }
export async function stopWorkers() { return true; }
```

**Expected events (if implemented):**
| Event | Would be consumed by | Priority |
|-------|---------------------|----------|
| `file.uploaded` | analytics-service | Low |
| `file.deleted` | analytics-service | Low |
| `file.scan.completed` | compliance-service | Medium |
| `file.processing.completed` | notification-service | Low |

**Analysis:** File uploads are synchronous by design (clients need URLs immediately). Queue events would be useful for analytics and virus scan notifications but are not critical.

---

## 3. Current /internal/ Routes

### Search Methodology
- Examined: `src/routes/index.ts`, `src/routes/internal*.ts`
- Searched for: `/internal/` pattern

### Findings: **NONE**

file-service has NO `/internal/` routes. All routes are public API endpoints:

| Route | Auth | Middleware | Purpose |
|-------|------|------------|---------|
| `/health` | None | - | Health check |
| `/metrics` | None | - | Prometheus metrics |
| `/metrics/json` | JWT + Admin | setTenantContext | Detailed metrics |
| `/admin/stats` | JWT + Admin | setTenantContext | Storage statistics |
| `/admin/cleanup` | JWT + Admin | setTenantContext | Orphan cleanup |
| `/admin/bulk-delete` | JWT + Admin | setTenantContext | Bulk delete |
| `/documents/:fileId/*` | JWT | setTenantContext, verifyFileOwnership | Document operations |
| `/download/:fileId` | JWT | downloadRateLimiter, verifyFileOwnership | File download |
| `/stream/:fileId` | JWT | downloadRateLimiter, verifyFileOwnership | File streaming |
| `/images/:fileId/*` | JWT | processingRateLimiter, verifyFileModifyPermission | Image processing |
| `/qr/*` | JWT | setTenantContext | QR code generation |
| `/upload/url` | JWT | uploadRateLimiter | Get signed upload URL |
| `/upload/confirm` | JWT | uploadRateLimiter | Confirm upload |
| `/files/:fileId` | JWT | verifyFileModifyPermission | Delete file |

---

## 4. HTTP Calls FROM file-service (Outgoing)

### Findings: Calls venue-service WITHOUT HMAC

```typescript
// backend/services/file-service/src/services/ticket-pdf.service.ts
private async fetchVenueBranding(venueId: string): Promise<any> {
  try {
    const venueServiceUrl = process.env.VENUE_SERVICE_URL || 'http://venue-service:3002';

    // Uses axios with timeout - NO HMAC authentication!
    const response = await axios.get(
      `${venueServiceUrl}/api/v1/branding/${venueId}`,
      { timeout: 2000 }
    );

    const venueResponse = await axios.get(
      `${venueServiceUrl}/api/v1/venues/${venueId}`,
      { timeout: 2000 }
    );

    return {
      branding: response.data.branding,
      isWhiteLabel: venueResponse.data.venue?.hide_platform_branding || false
    };
  } catch (error: any) {
    return null; // Graceful degradation
  }
}
```

**Issue:** This calls venue-service public API without HMAC authentication, violating the standardization pattern.

**Fix needed:** Use shared HTTP client with HMAC for internal service calls.

---

## 5. Missing Endpoints Analysis

### What Other Services NEED from file-service

| Service | Data Need | Current Solution | Priority |
|---------|-----------|------------------|----------|
| compliance-service | User's file list for GDPR export | None | **HIGH** |
| compliance-service | File metadata for audit | None | **MEDIUM** |
| analytics-service | File statistics | Direct DB query | LOW |
| event-service | Validate file exists | None (trusts URL) | LOW |
| venue-service | Validate file exists | None (trusts URL) | LOW |

### Recommended /internal/ Endpoints

#### HIGH PRIORITY

**1. GET /internal/users/:userId/files**
- **Purpose:** Get all files uploaded by a user for GDPR data export
- **Used by:** compliance-service
- **Why internal:** Contains PII, tenant-scoped

```typescript
fastify.get('/internal/users/:userId/files', {
  preHandler: [verifyInternalService]
}, async (request, reply) => {
  const { userId } = request.params;
  const tenantId = request.headers['x-tenant-id'];

  const files = await fileModel.findByUser(userId, tenantId);

  return reply.send({
    userId,
    tenantId,
    files: files.map(f => ({
      id: f.id,
      filename: f.original_filename,
      mimeType: f.mime_type,
      size: f.size_bytes,
      uploadedAt: f.created_at,
      cdnUrl: f.cdn_url
    })),
    count: files.length
  });
});
```

**2. GET /internal/files/:fileId**
- **Purpose:** Get file metadata for validation
- **Used by:** compliance-service, any service needing file details
- **Why internal:** Validates file exists and returns metadata without downloading

```typescript
fastify.get('/internal/files/:fileId', {
  preHandler: [verifyInternalService]
}, async (request, reply) => {
  const { fileId } = request.params;
  const tenantId = request.headers['x-tenant-id'];

  const file = await fileModel.findById(fileId, tenantId);

  if (!file) {
    return reply.status(404).send({ error: 'File not found' });
  }

  return reply.send({
    id: file.id,
    filename: file.original_filename,
    mimeType: file.mime_type,
    size: file.size_bytes,
    status: file.status,
    entityType: file.entity_type,
    entityId: file.entity_id,
    uploadedBy: file.uploaded_by,
    uploadedAt: file.created_at,
    cdnUrl: file.cdn_url,
    isPublic: file.is_public
  });
});
```

#### MEDIUM PRIORITY

**3. GET /internal/files/:fileId/signed-url**
- **Purpose:** Get time-limited signed download URL
- **Used by:** Any service needing secure file access
- **Why internal:** Generates signed URLs for private files

```typescript
fastify.get('/internal/files/:fileId/signed-url', {
  preHandler: [verifyInternalService]
}, async (request, reply) => {
  const { fileId } = request.params;
  const { expiresIn } = request.query; // seconds, default 300
  const tenantId = request.headers['x-tenant-id'];

  const file = await fileModel.findById(fileId, tenantId);
  if (!file) {
    return reply.status(404).send({ error: 'File not found' });
  }

  const signedUrl = await s3Storage.generateSignedDownloadUrl(
    file.storage_path,
    parseInt(expiresIn) || 300
  );

  return reply.send({
    fileId,
    signedUrl,
    expiresAt: new Date(Date.now() + (parseInt(expiresIn) || 300) * 1000)
  });
});
```

**4. DELETE /internal/files/:fileId**
- **Purpose:** Programmatically delete file from another service
- **Used by:** Any service that manages files (event deletion, user deletion)
- **Why internal:** Admin-level operation without user authentication

**5. GET /internal/entities/:entityType/:entityId/files**
- **Purpose:** Get all files associated with an entity
- **Used by:** Event deletion, venue deletion (cascade files)
- **Why internal:** Bulk operations for entity lifecycle

#### LOW PRIORITY

**6. POST /internal/upload**
- **Purpose:** Upload file directly from another service
- **Used by:** ticket-service (ticket PDFs), notification-service (attachments)
- **Note:** Current architecture has file-service generate PDFs internally

---

## 6. Standardization Gaps

### Gap 1: No HMAC Client for Outgoing Calls

**Issue:** file-service calls venue-service using plain axios without HMAC authentication.

**Current:**
```typescript
const response = await axios.get(`${venueServiceUrl}/api/v1/branding/${venueId}`, { timeout: 2000 });
```

**Should be:**
```typescript
import { createServiceClient } from '@tickettoken/shared/clients';

const venueClient = createServiceClient('venue-service', {
  baseUrl: process.env.VENUE_SERVICE_URL,
  hmacSecret: process.env.INTERNAL_SERVICE_KEY
});

const response = await venueClient.get(`/internal/branding/${venueId}`);
```

### Gap 2: No Internal Service Authentication Middleware

**Issue:** file-service has no `verifyInternalService` middleware for /internal/ routes.

**Need to add:**
```typescript
export async function verifyInternalService(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serviceKey = request.headers['x-service-key'];
  const serviceName = request.headers['x-service-name'];
  const tenantId = request.headers['x-tenant-id'];

  if (!serviceKey || !serviceName) {
    return reply.status(401).send({ error: 'Missing service credentials' });
  }

  // Verify HMAC signature
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;
  if (!crypto.timingSafeEqual(Buffer.from(serviceKey), Buffer.from(expectedKey))) {
    return reply.status(401).send({ error: 'Invalid service credentials' });
  }

  request.serviceName = serviceName;
  request.tenantId = tenantId;
}
```

---

## 7. Architecture Diagram

```
                                    ┌─────────────────────┐
                                    │    api-gateway      │
                                    │   (proxy traffic)   │
                                    └──────────┬──────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          file-service:3013                              │
│                                                                         │
│  PUBLIC ROUTES (via api-gateway):                                      │
│  ├── /upload/url         → Get signed upload URL                       │
│  ├── /upload/confirm     → Confirm upload completion                   │
│  ├── /download/:fileId   → Download file                               │
│  ├── /stream/:fileId     → Stream file                                 │
│  ├── /images/:fileId/*   → Image processing                            │
│  ├── /documents/:fileId/* → Document operations                        │
│  ├── /qr/*               → QR code generation                          │
│  └── /files/:fileId      → Delete file                                 │
│                                                                         │
│  INTERNAL ROUTES: **NONE** (NEED TO ADD)                               │
│  ├── GET /internal/files/:fileId          → File metadata              │
│  ├── GET /internal/files/:fileId/signed-url → Signed download URL      │
│  ├── GET /internal/users/:userId/files    → GDPR user files            │
│  ├── GET /internal/entities/:type/:id/files → Entity files             │
│  └── DELETE /internal/files/:fileId       → Programmatic delete        │
│                                                                         │
│  OUTBOUND CALLS:                                                       │
│  └── venue-service → GET /api/v1/branding/:venueId (NO HMAC - BUG!)   │
│                                                                         │
│  DATABASE (owned tables):                                              │
│  ├── files               (file metadata)                               │
│  ├── file_uploads        (upload tracking)                             │
│  └── file_access_logs    (download audit)                              │
│                                                                         │
│  STORAGE:                                                              │
│  └── S3 (or local in dev)                                              │
└─────────────────────────────────────────────────────────────────────────┘

SERVICES THAT STORE FILE URLs:
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ venue-service   │  │ event-service   │  │ marketplace-svc │
│ (logo_url,      │  │ (cover_image,   │  │ (listing_images)│
│  photos)        │  │  promo_images)  │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘

SERVICES THAT NEED INTERNAL ACCESS:
┌─────────────────┐
│ compliance-svc  │
│ (GDPR exports,  │
│  audit queries) │
└─────────────────┘
```

---

## 8. Summary

| Question | Answer |
|----------|--------|
| Services calling file-service | **None** (only api-gateway proxies) |
| Data other services need | File metadata, user files (GDPR), signed URLs |
| Current /internal/ routes | **None** |
| Missing /internal/ routes | 5 recommended (2 high, 2 medium, 1 low priority) |
| Queue events | Not implemented |
| Outbound HTTP calls | venue-service (WITHOUT HMAC - bug) |
| Primary interaction model | Client uploads via signed URLs |

### Priority Actions

| Priority | Action | Impact |
|----------|--------|--------|
| **HIGH** | Add `GET /internal/users/:userId/files` | GDPR compliance |
| **HIGH** | Add `GET /internal/files/:fileId` | File validation |
| **HIGH** | Fix HMAC client for venue-service calls | Security standardization |
| **MEDIUM** | Add `GET /internal/files/:fileId/signed-url` | Secure file sharing |
| **MEDIUM** | Add internal service auth middleware | Security |
| LOW | Add `DELETE /internal/files/:fileId` | Entity cascade deletes |
| LOW | Implement queue events for analytics | Analytics coverage |

### Final Recommendation

file-service needs **moderate updates** to support proper internal service communication:

1. **Add 2-3 internal endpoints** for GDPR compliance and file metadata
2. **Implement HMAC authentication** for outgoing venue-service calls
3. **Add internal service verification middleware** for new /internal/ routes

The current architecture where clients upload directly via signed URLs is sound and should remain the primary upload pattern. Internal endpoints are needed for **metadata queries** and **GDPR data exports**, not for file uploads.
