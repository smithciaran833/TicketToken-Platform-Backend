# FILE-SERVICE COMPREHENSIVE AUDIT REPORT

**Audit Date:** January 23, 2026
**Service:** file-service
**Location:** `backend/services/file-service/`
**Files Analyzed:** 65+ TypeScript source files

---

## 1. SERVICE CAPABILITIES

### Public Endpoints

| Method | Path | Controller | Purpose |
|--------|------|------------|---------|
| GET | `/health` | HealthController | Health check |
| GET | `/metrics` | MetricsController | Prometheus metrics |

### Authenticated Public Endpoints

| Method | Path | Controller | Purpose |
|--------|------|------------|---------|
| POST | `/upload/url` | UploadController | Generate presigned upload URL |
| POST | `/upload/confirm` | UploadController | Confirm upload completion |
| DELETE | `/files/:fileId` | UploadController | Delete file |
| GET | `/download/:fileId` | DownloadController | Download file |
| GET | `/stream/:fileId` | DownloadController | Stream file |
| POST | `/images/:fileId/resize` | ImageController | Resize image |
| POST | `/images/:fileId/crop` | ImageController | Crop image |
| POST | `/images/:fileId/rotate` | ImageController | Rotate image |
| POST | `/images/:fileId/watermark` | ImageController | Add watermark |
| GET | `/images/:fileId/metadata` | ImageController | Get image metadata |
| GET | `/documents/:fileId/preview` | DocumentController | Preview document |
| GET | `/documents/:fileId/page/:pageNumber` | DocumentController | Get document page |
| POST | `/documents/:fileId/convert` | DocumentController | Convert document format |
| GET | `/documents/:fileId/text` | DocumentController | Extract text |
| POST | `/qr/generate` | QRController | Generate QR code |
| POST | `/qr/generate-store` | QRController | Generate and store QR code |
| GET | `/metrics/json` | MetricsController | Metrics in JSON (admin) |
| GET | `/metrics/stats` | MetricsController | Service statistics (admin) |
| GET | `/metrics/health` | MetricsController | Detailed health (admin) |
| GET | `/admin/stats` | AdminController | Admin statistics |
| POST | `/admin/cleanup` | AdminController | Cleanup orphaned files |
| DELETE | `/admin/bulk-delete` | AdminController | Bulk delete files |

### Internal Endpoints (S2S Only)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/internal/users/:userId/files` | Get user files (GDPR export) |
| GET | `/internal/files/:fileId` | Get file metadata |
| POST | `/internal/ticket-pdf/generate` | Generate ticket PDF |

### Business Operations

1. **File Upload Management**
   - Presigned URL generation for direct S3 upload
   - Upload confirmation and file registration
   - Chunked upload support for large files
   - Multipart upload tracking

2. **S3 Storage Management**
   - S3 and local storage provider support
   - CDN URL generation
   - Presigned download URLs

3. **Image Processing**
   - Resize, crop, rotate operations
   - Watermarking with XSS-safe text sanitization
   - Thumbnail generation (small/medium/large)
   - EXIF metadata extraction
   - Format optimization (mozjpeg)

4. **Document Processing**
   - PDF text extraction (pdf-parse)
   - Word document processing (mammoth)
   - Document metadata extraction
   - Page count detection

5. **QR Code Generation**
   - Ticket QR code generation
   - Customizable dimensions
   - PNG output format

6. **Ticket PDF Generation**
   - Branded ticket PDFs with venue customization
   - White-label support
   - Puppeteer-based HTML-to-PDF

7. **Virus Scanning**
   - ClamAV integration
   - Mock scanner fallback for development
   - Quarantine system for infected files
   - Hash-based scan caching

8. **File Versioning**
   - Version history tracking
   - Version restoration
   - Version deletion

9. **Duplicate Detection**
   - SHA-256 hash-based deduplication
   - Storage savings calculation
   - Batch deduplication

10. **Storage Quotas**
    - Per-user/tenant/venue quotas
    - Usage tracking and alerts
    - Soft limit warnings

---

## 2. DATABASE SCHEMA

**Source:** `src/migrations/001_baseline_file_service.ts`

### Tables (13 total)

| Table | Tenant-Scoped | Purpose |
|-------|---------------|---------|
| `av_scans` | No (Global) | Virus scan cache by file hash |
| `files` | Yes | Main file metadata |
| `file_access_logs` | Yes | Access audit trail |
| `file_versions` | Yes | Version history |
| `upload_sessions` | Yes | Chunked upload tracking |
| `quarantined_files` | Yes | Infected files |
| `file_uploads` | Yes | Upload tracking |
| `file_shares` | Yes | Sharing permissions |
| `image_metadata` | Yes | Image processing data |
| `video_metadata` | Yes | Video processing data |
| `storage_quotas` | Yes | Quota limits |
| `storage_usage` | Yes | Usage tracking |
| `quota_alerts` | Yes | Quota warnings |

### Key Indexes

```sql
-- Performance indexes
idx_files_tenant (tenant_id)
idx_files_uploaded_by (uploaded_by)
idx_files_entity (entity_type, entity_id)
idx_files_status (status)
idx_files_hash (hash_sha256)
idx_files_tenant_created (tenant_id, created_at DESC)
idx_files_hash_tenant_unique (hash_sha256, tenant_id) -- Deduplication
```

### Row-Level Security

All 12 tenant-scoped tables have RLS enabled with:
```sql
CREATE POLICY {table}_tenant_isolation ON {table}
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.is_system_user', true) = 'true'
  )
```

### Sensitive Data Fields

| Table | Field | Sensitivity |
|-------|-------|-------------|
| files | hash_sha256 | File fingerprint |
| files | storage_path | Internal storage location |
| file_access_logs | ip_address | PII |
| file_access_logs | user_agent | Fingerprinting data |
| quarantined_files | threats | Security data |

---

## 3. SECURITY ANALYSIS

### A. File Upload Validation

**Source:** `src/validators/file.validator.ts`, `src/utils/sanitize.ts`

| Vulnerability | Status | Details |
|---------------|--------|---------|
| **Path Traversal** | PROTECTED | `sanitizeFilename()` removes `../`, absolute paths, null bytes |
| **Filename Sanitization** | PROTECTED | Only allows `[a-zA-Z0-9._\- ]`, replaces others with `_` |
| **File Type Validation** | PARTIAL | MIME type validation only - NO magic number validation |
| **MIME Type Spoofing** | VULNERABLE | No file content validation, relies on claimed MIME type |
| **File Size Limits** | PROTECTED | Per-type limits enforced via `fileValidator.validateSize()` |
| **Malicious Filenames** | PROTECTED | Null bytes removed, Unicode normalized |
| **Double Extension** | VULNERABLE | `file.jpg.php` not explicitly blocked |
| **ZIP Bomb** | NOT CHECKED | No archive decompression in upload flow |
| **XXE Injection** | PARTIAL RISK | SVG allowed, sanitization exists but complex |
| **Image Bomb** | NOT PROTECTED | No pixel dimension validation |

**CRITICAL ISSUE:** The file validation relies on MIME type headers, not magic number validation. An attacker could upload a PHP file with `Content-Type: image/jpeg`.

**Code Reference:** `src/validators/file.validator.ts:21-30`
```typescript
validateMimeType(mimeType: string): void {
  const allowedTypes = [...]; // Extension-based only
  if (!allowedTypes.includes(mimeType)) {
    throw new Error(...);
  }
}
```

### B. S3 Security

**Source:** `src/storage/providers/s3.provider.ts`, `src/services/cdn.service.ts`

| Security Issue | Status | Notes |
|----------------|--------|-------|
| S3 bucket public access | CONFIG-DEPENDENT | No explicit block in code |
| Presigned URL expiry | CONFIGURABLE | Default 3600s (1 hour) |
| Presigned URL permissions | READ-ONLY for downloads | PutObject for uploads |
| Server-side encryption | NOT CONFIGURED | No SSE-S3 or SSE-KMS in PutObjectCommand |
| Access logging | NOT CONFIGURED | No S3 access logging setup |
| Versioning | NOT CONFIGURED | Handled at application level |
| CORS configuration | NOT CONFIGURED | Left to external configuration |

**MISSING:** Server-side encryption not enabled in S3 uploads.

**Code Reference:** `src/storage/providers/s3.provider.ts:39-48`
```typescript
const command = new PutObjectCommand({
  Bucket: this.bucketName,
  Key: key,
  Body: file,
  ContentType: options?.mimeType,
  CacheControl: options?.cacheControl,
  Metadata: options?.metadata
  // MISSING: ServerSideEncryption: 'AES256' or 'aws:kms'
});
```

### C. Virus Scanning

**Source:** `src/services/antivirus.service.ts`

| Check | Status | Details |
|-------|--------|---------|
| Is virus scanning REAL? | CONDITIONAL | ClamAV if installed, MockScanner otherwise |
| ClamAV integration | YES | Uses `clamscan` CLI command |
| Scan timing | AFTER S3 upload | Files stored before scanning |
| Quarantine process | YES | Moves to `/var/quarantine`, logs to DB |
| Scan failure handling | FALLS BACK TO MOCK | Returns "clean" if ClamAV unavailable |

**CRITICAL ISSUE:** If ClamAV is not installed (code 127), the service falls back to a mock scanner that always returns clean unless filename contains "eicar" or "virus".

**Code Reference:** `src/services/antivirus.service.ts:105-110`
```typescript
} catch (error: any) {
  if (error.code === 127) {
    logger.warn({}, 'ClamAV not installed, using mock scanner');
    return this.mockScan(filePath);  // DANGER: Returns clean for most files
  }
  throw error;
}
```

**RECOMMENDATION:** Fail upload if ClamAV is unavailable, rather than using mock scanner.

### D. Access Control

**Source:** `src/middleware/file-ownership.middleware.ts`, `src/middleware/tenant-context.ts`

| Check | Status | Details |
|-------|--------|---------|
| File ownership verification | YES | `verifyFileOwnership` middleware |
| Tenant isolation | YES | All queries include tenant_id filter + RLS |
| Access logging | YES | `AccessLogService` logs all access |
| Presigned URLs tied to user | NO | Presigned URLs are bearer tokens |
| Cross-tenant access | BLOCKED | RLS + explicit tenant checks |

**Good Implementation:**
```typescript
// src/models/file.model.ts:91-101
async findById(id: string, tenantId: string): Promise<FileRecord | null> {
  if (!tenantId) {
    throw new TenantRequiredError('Tenant ID is required to query files');
  }
  const query = 'SELECT * FROM files WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL';
  // RLS provides additional defense
}
```

### E. S2S Authentication

**Source:** `src/middleware/internal-auth.middleware.ts`, `src/clients/venue-service.client.ts`

| File | Line | Service | Endpoint | Auth Method |
|------|------|---------|----------|-------------|
| venue-service.client.ts | 53-69 | venue-service | `/api/v1/branding/:venueId` | HMAC-SHA256 |
| venue-service.client.ts | 75-91 | venue-service | `/api/v1/venues/:venueId` | HMAC-SHA256 |
| internal.routes.ts | 24 | Internal | All `/internal/*` | HMAC middleware |

**Authentication Status:** Uses standardized HMAC-SHA256 from `@tickettoken/shared`.

### F. Service Boundary Check

| External Table | Direct Access | Status |
|----------------|---------------|--------|
| users | NO | Referenced via `uploaded_by` (FK comment only) |
| tickets | NO | Referenced via entity_id |
| orders | NO | Not referenced |
| events | NO | Not referenced |
| venues | NO | Accessed via venue-service client |

**COMPLIANT:** No direct database access to external service tables.

---

## 4. FILE PROCESSING

### A. Image Processing

**Source:** `src/processors/image/image.processor.ts`, `src/services/image.service.ts`

| Library | Version | Purpose |
|---------|---------|---------|
| Sharp | ^0.33.1 | Image manipulation, resize, format conversion |

**Features:**
- Thumbnail generation (150px, 300px, 600px)
- JPEG optimization with mozjpeg
- Metadata extraction (width, height, format, channels)
- Progressive JPEG output

**Security:**
- Metadata column whitelist for SQL injection prevention
- No pixel dimension validation (image bomb risk)

**Code Reference:** `src/processors/image/image.processor.ts:19-34`
```typescript
// SECURITY: Whitelist of allowed metadata fields
private readonly ALLOWED_METADATA_FIELDS = [
  'width', 'height', 'aspect_ratio', 'format', ...
];
```

### B. Document Processing

**Source:** `src/processors/document/document.processor.ts`

| Library | Purpose |
|---------|---------|
| pdf-parse | PDF text extraction, page count |
| mammoth | Word document text extraction |

**Features:**
- PDF page count detection
- Text extraction (first 5000 chars)
- PDF thumbnail generation (disabled)

### C. Video Processing

**Status:** Schema exists (`video_metadata` table), but no video processor implementation found.

**Dependencies installed:**
- `fluent-ffmpeg` ^2.1.2
- `@ffmpeg-installer/ffmpeg` ^1.1.0

---

## 5. STORAGE ARCHITECTURE

**Source:** `src/storage/storage.service.ts`, `src/storage/providers/`

### Storage Providers

| Provider | Class | Status |
|----------|-------|--------|
| S3 | `S3StorageProvider` | Production ready |
| Local | `LocalStorageProvider` | Development only |

**Production Safety:**
```typescript
// src/storage/storage.service.ts:21-26
} else if (process.env.NODE_ENV === 'production') {
  const errorMsg = 'FATAL: Production environment REQUIRES STORAGE_PROVIDER=s3.';
  throw new Error(errorMsg);  // GOOD: Fails fast if misconfigured
}
```

### Storage Key Generation

```typescript
// src/utils/file-helpers.ts:8-24
export function generateStorageKey(fileId, filename, entityType, entityId) {
  return `${entityPath}/${year}/${month}/${fileId}/${filename}`;
}
```

**Pattern:** `{entityType}/{entityId}/{year}/{month}/{fileId}/{filename}`

---

## 6. CDN INTEGRATION

**Source:** `src/services/cdn.service.ts`

| Feature | Status |
|---------|--------|
| CDN Provider | CloudFront (configurable via `CDN_DOMAIN`) |
| Cache Invalidation | Placeholder implementation |
| Edge Caching | Cache-Control headers set by content type |
| Signed URLs | Basic implementation (expiry only) |

**Cache-Control Policies:**
- Images: 1 year (`public, max-age=31536000, immutable`)
- Documents: 1 week (`public, max-age=604800`)
- Videos: 1 month (`public, max-age=2592000`)
- Default: 1 day (`public, max-age=86400`)

**INCOMPLETE:** CloudFront cache invalidation is a placeholder - actual API calls commented out.

---

## 7. SPECIAL FEATURES

### A. QR Code Generation

**Source:** `src/services/qr-code.service.ts`

| Feature | Value |
|---------|-------|
| Library | qrcode ^1.5.4 |
| Default Size | 400x400 pixels |
| Margin | 1 module |
| Output Format | PNG buffer |
| Error Correction | Default (M level) |

**Ticket QR Data:**
```json
{
  "ticketId": "...",
  "eventId": "...",
  "platform": "TicketToken",
  "timestamp": 1234567890
}
```

### B. Ticket PDF Generation

**Source:** `src/services/ticket-pdf.service.ts`

| Feature | Value |
|---------|-------|
| Library | Puppeteer ^21.7.0 |
| Output Format | A4 PDF |
| Branding | Custom colors, logos, backgrounds |
| White-label | Platform branding hidden when enabled |

**S2S Dependency:** Fetches venue branding from `venue-service` via HMAC-authenticated client.

### C. Chunked Upload

**Source:** `src/services/chunked-upload.service.ts`

| Feature | Value |
|---------|-------|
| Chunk Size | 5 MB |
| Session TTL | 24 hours |
| Storage | Temp directory + database tracking |

**Flow:**
1. `createSession()` - Initialize upload session
2. `uploadChunk()` - Upload individual chunks
3. `completeSession()` - Combine chunks, call upload service
4. Cleanup temp files after completion

### D. File Versioning

**Source:** `src/services/file-version.service.ts`

| Feature | Status |
|---------|--------|
| Version Tracking | YES |
| Rollback | YES |
| Version Retention | Manual deletion only |
| Storage | Separate files with `_v{n}` suffix |

### E. Duplicate Detection

**Source:** `src/services/duplicate-detector.service.ts`

| Feature | Status |
|---------|--------|
| Hash Algorithm | SHA-256 |
| Deduplication | Soft delete duplicates, reference original |
| Perceptual Hash | Placeholder only |
| Cache | Redis with `file-hash:` prefix |

### F. Storage Quotas

**Source:** `src/services/storage-quota.service.ts`

| Feature | Status |
|---------|--------|
| Per-user Quotas | YES |
| Per-tenant Quotas | YES |
| Per-venue Quotas | YES |
| Soft Limit Warnings | YES (configurable %) |
| Hard Limit Enforcement | YES |
| File Count Limits | YES |
| File Size Limits | YES |

---

## 8. BACKGROUND WORKERS

**Source:** `src/workers/index.ts`

**Status:** Stub implementation only.

```typescript
export async function startWorkers() { return true; }
export async function stopWorkers() { return true; }
```

**Batch Processing:** Handled synchronously in `BatchProcessorService`:
- Resize
- Convert
- Compress
- Watermark
- Delete

---

## 9. CODE QUALITY

### TODO/FIXME Comments

| Location | Comment |
|----------|---------|
| storage-quota.service.ts:390 | `TODO: Add storageQuotaAlert metric to metricsService` |

### `any` Type Usage

**Total Occurrences:** 74 across 29 files

**Highest Concentrations:**
- `middleware/rate-limit.middleware.ts`: 8 occurrences
- `middleware/idempotency.ts`: 8 occurrences
- `controllers/upload.controller.ts`: 5 occurrences
- `controllers/image.controller.ts`: 5 occurrences

### Error Handling

**Good Pattern:** RFC 7807 Problem Details format implemented in `src/errors/index.ts`

**Error Classes:**
- `InvalidFileTypeError`, `FileTooLargeError`
- `FileAccessDeniedError`, `FileNotFoundError`
- `VirusScanError`, `QuotaExceededError`
- `TenantMismatchError`, `TenantRequiredError`

### Dependencies

| Category | Notable Packages |
|----------|-----------------|
| Storage | @aws-sdk/client-s3, @aws-sdk/lib-storage |
| Image | sharp ^0.33.1 |
| PDF | puppeteer ^21.7.0, pdf-parse ^1.1.1 |
| Document | mammoth ^1.6.0 |
| Video | fluent-ffmpeg ^2.1.2 |
| Security | clamscan ^2.2.1 |
| QR | qrcode ^1.5.4 |
| Framework | fastify ^4.25.0 |

---

## 10. COMPARISON TO PREVIOUS AUDITS

| Aspect | Previous State | Current State |
|--------|----------------|---------------|
| Multi-tenancy | Unknown | FULLY IMPLEMENTED with RLS |
| S2S Auth | JWT-based | HMAC-SHA256 standardized |
| Error Handling | Basic | RFC 7807 compliant |
| Rate Limiting | Unknown | Per-endpoint limits |
| Tenant Context | Unknown | JWT extraction + header fallback |

---

## FINAL SUMMARY

### CRITICAL ISSUES

1. **NO MAGIC NUMBER VALIDATION** - File type validation relies solely on MIME type headers. Attackers can upload malicious files (PHP, executables) by spoofing Content-Type.

2. **MOCK VIRUS SCANNER FALLBACK** - If ClamAV is not installed, the service falls back to a mock scanner that returns "clean" for almost all files. This silently disables virus protection.

3. **NO S3 SERVER-SIDE ENCRYPTION** - Files uploaded to S3 are not encrypted at rest. No SSE-S3 or SSE-KMS configuration.

4. **DOUBLE EXTENSION NOT BLOCKED** - Files like `malware.jpg.php` are not explicitly rejected.

### HIGH PRIORITY

1. **Image Bomb Vulnerability** - No pixel dimension limits. Large images could cause memory exhaustion.

2. **CDN Cache Invalidation Incomplete** - CloudFront invalidation is a placeholder.

3. **Video Processing Not Implemented** - Schema exists but no processor code.

4. **Workers Not Implemented** - Background workers are stubs.

### MEDIUM PRIORITY

1. **74 `any` Type Usages** - Type safety could be improved.

2. **Presigned URLs Not User-Bound** - URLs are bearer tokens, not tied to specific users.

3. **PDF Thumbnail Generation Disabled** - Feature incomplete.

4. **Perceptual Hash Not Implemented** - Placeholder for image similarity detection.

### FILE SECURITY ASSESSMENT

| Aspect | Assessment |
|--------|------------|
| **Upload Validation** | CRITICAL - No magic number validation |
| **Virus Scanning** | CRITICAL - Mock fallback silently bypasses |
| **S3 Security** | HIGH - No encryption at rest |
| **Access Control** | GOOD - Tenant isolation + RLS + ownership checks |
| **File Type Validation** | CRITICAL - Extension-only, no content check |
| **Path Traversal** | GOOD - Sanitization implemented |
| **XSS in SVG/Watermarks** | GOOD - Sanitization implemented |

### ATTACK SURFACE

**Overall Risk: HIGH**

The file-service handles user-uploaded content without proper magic number validation, making it vulnerable to malicious file uploads. The virus scanning fallback to a mock scanner in non-ClamAV environments creates a false sense of security. These combined make the service a significant attack vector for:

- Remote Code Execution (via uploaded scripts)
- Malware distribution
- Storage abuse

### RECOMMENDATIONS

1. **IMMEDIATE:** Implement magic number validation using `file-type` library
2. **IMMEDIATE:** Fail-closed on virus scanner unavailability
3. **HIGH:** Enable S3 server-side encryption
4. **HIGH:** Block double extensions explicitly
5. **MEDIUM:** Implement image dimension limits
6. **MEDIUM:** Complete CDN cache invalidation

---

**Files Analyzed:** 65+
**Critical Issues:** 4
**High Priority Issues:** 4
**Medium Priority Issues:** 4

**Assessment:** This service requires immediate security hardening before production use. The file upload validation gaps represent significant security risks.
