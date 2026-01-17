# File Service - Complete Test Review

## Executive Summary

**Total Files to Test: 63**
**Test Type: Unit Verification Tests** (not smoke tests)
**Coverage Goal: 80%+ across all metrics**

This document provides a detailed breakdown of every file in the file-service that requires unit testing, including the specific functionality each file provides and what needs to be tested.

---

## File Categories & Detailed Breakdown

### 1. Core Application Files (2 files)

#### `src/app.ts`
**Purpose**: Express application setup
**Functions to Test**:
- Express app initialization
- Middleware registration (CORS, helmet, body-parser, etc.)
- Route mounting
- Error handling middleware registration
- Health check endpoint registration
**Test Scenarios**:
- App initializes correctly
- All middleware are registered in correct order
- Routes are mounted properly
- Error handler is last middleware
- 404 handler works

#### `src/index.ts`
**Purpose**: Server bootstrap and lifecycle management
**Functions to Test**:
- Server startup
- Port binding
- Database connection on startup
- Graceful shutdown handling
- Process signal handling (SIGTERM, SIGINT)
- Error handling during startup
**Test Scenarios**:
- Server starts on correct port
- Database connects successfully
- Handles startup errors gracefully
- Graceful shutdown closes connections
- Signal handlers work correctly

---

### 2. Configuration Files (5 files)

#### `src/config/constants.ts`
**Exports to Test**:
- `FILE_CONSTANTS` object
- `ERROR_MESSAGES` object
**Test Scenarios**:
- Size limits calculated correctly from env vars
- Thumbnail sizes are correct
- File types parsed from env correctly
- Paths use correct defaults
- Constants are immutable
- All status values are correct
- All entity types are correct

#### `src/config/database.config.ts`
**Functions to Test**:
- `connectDatabase()` - Initialize connection pool
- `getPool()` - Get pool instance
- `hasDatabase()` - Check connection status
- `closeDatabase()` - Close connections
**Test Scenarios**:
- Connection pool created with correct config
- Pool has correct max connections (20)
- Connect succeeds with valid config
- Connect fails with invalid config
- getPool returns pool after connect
- getPool throws before connect
- hasDatabase returns correct status
- closeDatabase closes all connections
- Database URL parsing works

#### `src/config/database.ts`
**Exports to Test**:
- Knex instance creation
- Database client configuration
- Connection pool settings
**Test Scenarios**:
- Knex instance created correctly
- PostgreSQL client configured
- Pool settings are correct
- Migrations config present
- Seeds config present (if any)

#### `src/config/secrets.ts`
**Functions to Test**:
- `loadSecrets()` - Load from AWS or env
**Test Scenarios**:
- Loads from environment in development
- Loads from AWS Secrets Manager in production
- Falls back to env if AWS fails
- Parses secret JSON correctly
- Handles missing secrets gracefully
- Returns correct secret structure
- Caches secrets appropriately

#### `src/config/validate.ts`
**Functions to Test**:
- Environment variable validation
- Required field checking
- Type validation
**Test Scenarios**:
- All required vars validated
- Type conversion works (string to number)
- Default values applied correctly
- Throws on missing required vars
- Validates format of vars (URLs, etc.)

---

### 3. Utility Files (6 files)

#### `src/utils/circuit-breaker.ts`
**Class/Functions to Test**:
- `CircuitBreaker` class
- `execute()` - Execute with circuit breaker
- `open()` - Open circuit
- `close()` - Close circuit
- `halfOpen()` - Half-open state
**Test Scenarios**:
- Circuit starts closed
- Opens after failure threshold
- Half-opens after timeout
- Closes after success threshold
- Tracks failure count
- Resets on success
- Throws when circuit open
- Records metrics

#### `src/utils/database-optimization.util.ts`
**Functions to Test**:
- Database query optimization utilities
- Index usage helpers
- Query batching utilities
**Test Scenarios**:
- Optimizations applied correctly
- Batch operations work
- Performance improvements verified

#### `src/utils/errors.ts`
**Classes to Test**:
- `FileNotFoundError`
- `UnauthorizedError`
- `FileTooLargeError`
- `InvalidFileTypeError`
- `UploadFailedError`
- `ProcessingFailedError`
**Test Scenarios**:
- Each error has correct status code
- Error messages set correctly
- Extends base Error correctly
- Stack trace preserved
- Custom properties work

#### `src/utils/file-helpers.ts`
**Functions to Test**:
- File name sanitization
- Extension extraction
- MIME type detection
- File size formatting
- Path manipulation
**Test Scenarios**:
- Sanitizes dangerous file names
- Extracts extensions correctly
- Handles files without extensions
- Detects MIME types accurately
- Formats sizes correctly (KB, MB, GB)
- Path utilities work cross-platform

#### `src/utils/logger.ts`
**Exports to Test**:
- Winston logger configuration
- Log levels
- Transports (console, file)
- Log formatting
**Test Scenarios**:
- Logger creates log files
- Console transport works
- File transport works
- Log levels filter correctly
- Formatting is correct
- Metadata included in logs
- Error stack traces captured

#### `src/utils/sanitize.ts`
**Functions to Test**:
- Input sanitization
- XSS prevention
- SQL injection prevention
- Path traversal prevention
**Test Scenarios**:
- Removes XSS attempts
- Escapes SQL characters
- Blocks path traversal (../)
- Handles unicode correctly
- Preserves valid input
- Multiple sanitization passes work

---

### 4. Middleware Files (10 files)

#### `src/middleware/auth.middleware.ts`
**Functions to Test**:
- `authenticateOptional()` - Optional JWT auth
- `authenticate()` - Required JWT auth
- `requireAdmin()` - Admin role check
**Test Scenarios**:
- Valid JWT passes authentication
- Invalid JWT rejected
- Expired JWT rejected
- Missing JWT handled (optional vs required)
- User object attached to request
- Admin check works
- Non-admin rejected by requireAdmin
- JWT secret validation

#### `src/middleware/bulkhead.ts`
**Functions to Test**:
- Bulkhead pattern implementation
- Concurrent request limiting
- Queue management
**Test Scenarios**:
- Limits concurrent requests
- Queues excess requests
- Rejects when queue full
- Releases slots on completion
- Tracks active requests
- Metrics recorded

#### `src/middleware/correlation-id.ts`
**Functions to Test**:
- Correlation ID generation
- ID propagation through request
- Header extraction
**Test Scenarios**:
- Generates UUID if not present
- Uses existing correlation ID
- Attaches to request object
- Adds to response headers
- Logger context includes ID

#### `src/middleware/error.middleware.ts`
**Functions to Test**:
- `errorHandler()` - Global error handler
**Test Scenarios**:
- Handles known errors with correct status
- Handles unknown errors (500)
- Logs errors appropriately
- Returns correct error response format
- Doesn't leak stack traces in production
- Development shows stack traces
- Handles async errors

#### `src/middleware/file-ownership.middleware.ts`
**Functions to Test**:
- `verifyFileOwnership()` - Check file access
- `verifyFileModifyPermission()` - Check modify access
- `checkExplicitAccess()` - Check file_shares table
- `checkSameTenant()` - Tenant verification
**Test Scenarios**:
- Owner can access private files
- Public files accessible to all authenticated users
- Shared files accessible to specific users
- Tenant files accessible within tenant
- Unauthorized users blocked
- Admin can access all files
- Database queries correct
- Access levels (private, public, shared, tenant) work

#### `src/middleware/idempotency.ts`
**Functions to Test**:
- Idempotency key checking
- Response caching
- Duplicate request detection
**Test Scenarios**:
- New idempotency key processed
- Duplicate key returns cached response
- Expired keys processed again
- Key stored in Redis/memory
- TTL works correctly
- Different keys processed independently

#### `src/middleware/load-shedding.ts`
**Functions to Test**:
- Load shedding under high load
- Health check integration
- Request rejection logic
**Test Scenarios**:
- Accepts requests under threshold
- Rejects requests over threshold
- Returns 503 when load shedding
- Monitors system resources
- Configurable thresholds
- Priority requests bypass shedding

#### `src/middleware/rate-limit.middleware.ts`
**Exports to Test**:
- `uploadRateLimiter` - 10 uploads per 15 min
- `downloadRateLimiter` - 100 downloads per 15 min
- `processingRateLimiter` - 30 processing per 15 min
- `qrRateLimiter` - 20 QR codes per 15 min
**Test Scenarios**:
- Each limiter has correct limits
- Tracks by user ID and IP
- Resets after time window
- Returns 429 when exceeded
- Redis storage works
- Memory fallback works
- Rate limit headers present

#### `src/middleware/rate-limit.ts`
**Functions to Test**:
- Rate limit utilities
- Custom rate limit creation
- Key generation
**Test Scenarios**:
- Creates rate limiters correctly
- Generates correct keys
- Handles Redis connection errors
- Falls back to memory

#### `src/middleware/tenant-context.ts`
**Functions to Test**:
- Tenant context extraction from JWT
- Tenant ID validation
- Context setting for RLS
**Test Scenarios**:
- Extracts tenant_id from token
- Sets tenant context on request
- Database tenant context set for RLS
- Missing tenant handled appropriately
- Multi-tenant isolation works

---

### 5. Service Files (23 files)

#### `src/services/access-log.service.ts`
**Class**: `AccessLogService`
**Methods to Test**:
- `logAccess(fileId, userId, accessType, ipAddress, userAgent)`
- `getAccessLogs(fileId, options)`
- `getUserAccessHistory(userId, options)`
- `getFileAccessStats(fileId)`
**Test Scenarios**:
- Logs access to database
- All access types work (view, download, share, stream)
- Retrieves logs with pagination
- User history filtered correctly
- Stats calculated correctly
- Handles database errors

#### `src/services/antivirus.service.ts`
**Class**: `AntivirusService`
**Methods to Test**:
- `scanFile(filePath)`
- `runClamAVScan(filePath)` (private)
- `mockScan(filePath)` (private)
- `calculateFileHash(filePath)`
- `checkExistingScan(hash)`
- `storeScanResult(hash, result)`
- `quarantineFile(filePath, threats)`
- `scanS3File(bucket, key)`
**Test Scenarios**:
- ClamAV scan detects threats
- Clean files pass scan
- Mock scanner works in development
- File hash calculated correctly
- Existing scans retrieved from cache
- Scan results stored in database
- Infected files quarantined
- S3 files downloaded and scanned
- Scan failures handled gracefully

#### `src/services/batch-operations.service.ts`
**Class**: `BatchOperationsService`
**Methods to Test**:
- `batchDelete(fileIds, userId)`
- `batchMove(fileIds, newLocation, userId)`
- `batchTag(fileIds, tags, userId)`
- `batchDownload(fileIds, userId)`
- `batchCopy(fileIds, destinationIds, userId)`
**Test Scenarios**:
- Multiple files deleted together
- Files moved to new location
- Tags applied to multiple files
- ZIP created for batch download
- Files copied correctly
- Partial failures handled
- Transaction rollback on error
- Permission checks for each file

#### `src/services/batch-processor.service.ts`
**Class**: `BatchProcessorService`
**Methods to Test**:
- `createBatchJob(operation, fileIds, options)`
- `getBatchJobStatus(jobId)`
- `processJob(jobId)` (private)
- `processFile(fileId, operation, options)` (private)
- `resizeFile(fileId, options)`
- `convertFile(fileId, format)`
- `compressFile(fileId, quality)`
- `watermarkFile(fileId, watermarkOptions)`
- `cancelBatchJob(jobId)`
- `cleanupOldJobs()`
**Test Scenarios**:
- Batch job created successfully
- Job status tracked correctly
- Files processed sequentially
- Resize batch works
- Convert batch works
- Compress batch works
- Watermark batch works
- Job cancellation works
- Old jobs cleaned up
- Progress tracking accurate

#### `src/services/cache-integration.ts`
**Functions to Test**:
- `get(key, fetcher?)`
- `set(key, value, ttl?)`
- `delete(key)`
- `flush()`
**Test Scenarios**:
- Gets cached values
- Fetcher called on cache miss
- Sets values with TTL
- Deletes keys
- Flushes entire cache
- Handles cache errors gracefully

#### `src/services/cache.service.ts`
**Class**: `CacheService`
**Methods to Test**:
- `get(key)`
- `set(key, value, ttl?)`
- `delete(key)`
- `deletePattern(pattern)`
- `exists(key)`
- `getOrSet(key, fetcher, ttl?)`
- `increment(key, amount?)`
- `mset(entries)`
- `mget(keys)`
- `clear(prefix?)`
- `getStats()`
- `isHealthy()`
**Test Scenarios**:
- Redis operations work
- In-memory fallback when Redis down
- TTL expiration works
- Pattern deletion works
- Exists check accurate
- GetOrSet fetches on miss
- Increment atomic
- Multiple get/set works
- Clear with prefix works
- Stats returned correctly
- Health check accurate

#### `src/services/cdn.service.ts`
**Class**: `CDNService`
**Methods to Test**:
- `getCDNUrl(filePath)`
- `getS3Url(filePath)`
- `getCacheControl(fileType)`
- `invalidateCache(paths)`
- `invalidateFileCache(fileId)`
- `getResponsiveImageUrls(fileId, sizes)`
- `getVideoUrls(fileId, formats)`
- `getSignedUrl(filePath, expiresIn)`
- `warmCache(paths)`
- `getStats()`
**Test Scenarios**:
- CDN URLs generated correctly
- S3 URLs generated correctly
- Cache control headers correct per type
- Cache invalidation calls CloudFront API
- File cache invalidated
- Responsive image URLs created
- Video format URLs correct (HLS, DASH)
- Signed URLs have expiration
- Cache warming works
- Stats retrieved

#### `src/services/chunked-upload.service.ts`
**Class**: `ChunkedUploadService`
**Methods to Test**:
- `createSession(filename, totalChunks, userId)`
- `uploadChunk(sessionId, chunkNumber, chunkData)`
- `completeSession(sessionId)`
- `cancelSession(sessionId)`
**Test Scenarios**:
- Session created with token
- Chunks uploaded and tracked
- All chunks must be uploaded
- Completion assembles file
- Cancellation cleans up chunks
- Concurrent chunk uploads handled
- Missing chunks detected
- Session expiration works

#### `src/services/cleanup.service.ts`
**Class**: `CleanupService`
**Methods to Test**:
- `cleanupOrphanedFiles()`
- `cleanupTempFiles()`
- `calculateStorageUsage()`
- `enforceStorageLimits()`
**Test Scenarios**:
- Finds files without DB records
- Deletes orphaned files
- Temp files older than X hours deleted
- Storage usage calculated correctly
- Quota enforcement triggers cleanup
- Oldest files deleted first when over quota
- Cleanup runs on schedule
- Reports files cleaned

#### `src/services/duplicate-detector.service.ts`
**Class**: `DuplicateDetectorService`
**Methods to Test**:
- `calculateFileHash(filePath)`
- `findDuplicateByHash(hash)`
- `findAllDuplicates(fileId)`
- `getDuplicateStats()`
- `getDuplicateGroups()`
- `deduplicateGroup(groupId)`
- `deduplicateAll()`
- `findSimilarImages(fileId, threshold)`
- `updateFileHash(fileId)`
- `scanForMissingHashes()`
**Test Scenarios**:
- SHA256 hash calculated
- Duplicate found by hash
- All duplicates of file found
- Deduplication stats correct
- Groups identified
- Deduplication creates links
- All files deduplicated
- Similar images found by perceptual hash
- Hash updated for existing file
- Missing hashes identified and calculated

#### `src/services/file-search.service.ts`
**Class**: `FileSearchService`
**Methods to Test**:
- `search(query, filters, pagination)`
- `searchByContent(text, filters)`
- `getRecentFiles(userId, limit)`
- `getMostAccessed(filters, limit)`
**Test Scenarios**:
- Filename search works
- Filter by type
- Filter by date range
- Filter by size
- Filter by entity
- Pagination works
- Content search finds text in docs
- Recent files sorted by date
- Most accessed sorted by access count
- Multi-tenant filtering

#### `src/services/file-version.service.ts`
**Class**: `FileVersionService`
**Methods to Test**:
- `createVersion(fileId, userId, changeDescription)`
- `getVersions(fileId)`
- `restoreVersion(fileId, versionNumber, userId)`
- `deleteVersion(fileId, versionNumber, userId)`
**Test Scenarios**:
- Version created with incremented number
- Previous file stored in versions
- All versions retrieved chronologically
- Version restored (becomes current)
- Version deleted (old file removed)
- Permission checks
- Version limit enforced
- Storage cleanup

#### `src/services/image.service.ts`
**Class**: `ImageService`
**Methods to Test**:
- `processUploadedImage(filePath, options)`
- `generateThumbnail(filePath, size)`
- `optimizeImage(filePath, quality)`
**Test Scenarios**:
- Image processed after upload
- Thumbnails generated (small, medium, large)
- Image optimized for web
- EXIF data extracted
- Sharp operations work
- Original preserved
- WebP conversion option
- Progressive JPEG
- Metadata stored

#### `src/services/metrics.service.ts`
**Class**: `MetricsService`
**Methods to Test**:
- `recordUpload(fileSize, mimeType, duration)`
- `recordDownload(fileId, fileSize)`
- `recordProcessing(operation, duration, success)`
- `recordVirusScan(result, duration)`
- `recordStorageOperation(operation, duration, success)`
- `recordStorageError(operation, error)`
- `recordAuthAttempt(success, userId)`
- `recordRateLimitExceeded(endpoint, userId)`
- `recordError(error, context)`
- `updateResourceMetrics()`
- `updateFileStats()`
- `getMetrics()` - Prometheus format
- `getMetricsJSON()` - JSON format
**Test Scenarios**:
- Each metric recorded correctly
- Counters increment
- Histograms track distributions
- Gauges set correctly
- Labels applied
- Prometheus format correct
- JSON format correct
- Metrics reset appropriately

#### `src/services/qr-code.service.ts`
**Class**: `QRCodeService`
**Methods to Test**:
- `generateQRCode(data, options)`
- `generateTicketQR(ticketId, options)`
**Test Scenarios**:
- QR code generated as PNG
- Data encoded correctly
- Size options work
- Error correction levels work
- Ticket QR has correct format
- Returns buffer or base64

#### `src/services/qr.service.ts`
**Class**: `QRService`
**Methods to Test**:
- `generateQR(data, options)`
**Test Scenarios**:
- QR generation wrapper works
- Delegates to qr-code service

#### `src/services/s3.service.ts`
**Class**: `S3Service`
**Methods to Test**:
- `uploadToS3(buffer, key, contentType)`
- `deleteFromS3(key)`
**Test Scenarios**:
- Upload to S3 works
- Key formatted correctly
- Content type set
- ACL set appropriately
- Delete works
- Handles S3 errors
- Retries on failure

#### `src/services/storage-quota.service.ts`
**Class**: `StorageQuotaService`
**Methods to Test**:
- `setQuota(entityType, entityId, limits)`
- `getQuota(entityType, entityId)`
- `calculateUsage(entityType, entityId)`
- `saveUsage(entityType, entityId, usage)`
- `checkQuota(entityType, entityId, additionalSize)`
- `createAlert(entityType, entityId, alertType, usagePercentage)`
- `getUsageSummary(entityType, entityId)`
- `clearQuotaCache(entityType, entityId)`
- `deleteQuota(entityType, entityId)`
**Test Scenarios**:
- Quota set for user/tenant/venue
- Quota limits retrieved
- Usage calculated from files
- Usage saved to database
- Quota check passes/fails
- Alerts created at thresholds (80%, 90%, 100%)
- Usage summary includes breakdown by type
- Cache cleared
- Quota deleted

#### `src/services/storage.s3.ts`
**Class**: `S3StorageService`
**Methods to Test**:
- `generateSignedUploadUrl(key, contentType, expiresIn)`
- `generateSignedDownloadUrl(key, expiresIn)`
- `deleteFile(key)`
- `setupLifecyclePolicy()`
**Test Scenarios**:
- Presigned upload URL generated
- Presigned download URL generated
- URL expiration works
- Delete calls S3
- Lifecycle policy created for auto-cleanup

#### `src/services/ticket-pdf.service.ts`
**Class**: `TicketPDFService`
**Methods to Test**:
- `generateTicketPDF(ticketData, venueId)`
- `fetchVenueBranding(venueId)` (private)
- `generateTicketHTML(ticketData, branding)` (private)
**Test Scenarios**:
- PDF generated from ticket data
- Venue branding fetched
- HTML template rendered
- QR code embedded
- PDF buffer returned
- Handles missing branding
- Custom fonts work
- Layout correct

#### `src/services/upload.service.ts`
**Class**: `UploadService`
**Methods to Test**:
- `uploadFile(fileBuffer, filename, mimeType, userId, entityType, entityId)`
- `getFile(fileId, userId)`
- `getFilesByEntity(entityType, entityId, userId)`
**Test Scenarios**:
- File uploaded to storage
- Database record created
- File ID returned
- Virus scan triggered
- Processing queued
- Get file retrieves record
- Get by entity filtered correctly
- Access control enforced

#### `src/services/virus-scan.service.ts`
**Class**: `VirusScanService`
**Methods to Test**:
- `initialize()`
- `scanFile(filePath)`
- `logScanResult(fileId, result)`
- `quarantineFile(fileId, filePath, threats)`
- `getScanHistory(fileId)`
- `getLatestScan(fileId)`
- `needsScan(fileId)`
- `getQuarantinedFiles()`
- `deleteQuarantinedFile(fileId)`
- `getHealth()`
**Test Scenarios**:
- Initializes ClamAV connection
- Scans file and returns result
- Logs result to database
- Quarantines infected files
- Scan history retrieved
- Latest scan returned
- Needs scan logic correct (new files, old scans)
- Quarantined list retrieved
- Quarantined file deleted
- Health check shows ClamAV status

---

### 6. Controller Files (8 files)

#### `src/controllers/admin.controller.ts`
**Class**: `AdminController`
**Methods to Test**:
- `getStats(req, res)`
- `cleanupOrphaned(req, res)`
- `bulkDelete(req, res)`
- `getAuditLogs(req, res)`
**Test Scenarios**:
- Stats returned with correct data
- Orphaned cleanup runs and reports
- Bulk delete removes multiple files
- Audit logs retrieved with pagination
- Admin-only access enforced
- Error responses correct

#### `src/controllers/document.controller.ts`
**Class**: `DocumentController`
**Methods to Test**:
- `getPreview(req, res)`
- `getPage(req, res)`
- `convertFormat(req, res)`
- `extractText(req, res)`
**Test Scenarios**:
- PDF preview (first page) returned
- Specific page extracted
- Format conversion works
- Text extraction works
- File not found returns 404
- Access control enforced
- Error handling

#### `src/controllers/download.controller.ts`
**Class**: `DownloadController`
**Methods to Test**:
- `downloadFile(req, res)`
- `streamFile(req, res)`
**Test Scenarios**:
- File downloaded with correct headers
- Stream returned for inline viewing
- Content-Disposition set correctly
- Access logged
- File not found handled
- Range requests supported (streaming)

#### `src/controllers/health.controller.ts`
**Class**: `HealthController`
**Methods to Test**:
- `check(req, res)`
**Test Scenarios**:
- Returns 200 when healthy
- Returns 503 when unhealthy
- Database status checked
- Response format correct

#### `src/controllers/image.controller.ts`
**Class**: `ImageController`
**Methods to Test**:
- `resize(req, res)`
- `crop(req, res)`
- `rotate(req, res)`
- `watermark(req, res)`
- `getMetadata(req, res)`
**Test Scenarios**:
- Resize with dimensions works
- Crop with coordinates works
- Rotate by angle works
- Watermark applied
- Metadata returned (dimensions, format, etc.)
- Validation errors handled
- Image processing errors handled

#### `src/controllers/metrics.controller.ts`
**Class**: `MetricsController`
**Methods to Test**:
- `getMetrics(req, res)`
- `getMetricsJSON(req, res)`
- `getStats(req, res)`
- `getDetailedHealth(req, res)`
**Test Scenarios**:
- Prometheus metrics returned
- JSON metrics returned
- Stats include file counts, sizes
- Detailed health checks all components
- Admin authorization works

#### `src/controllers/qr.controller.ts`
**Class**: `QRController`
**Methods to Test**:
- `generateQRCode(req, res)`
- `generateAndStore(req, res)`
**Test Scenarios**:
- QR code generated and returned
- QR code generated and stored
- Validation works
- Rate limiting applied
- Error handling

#### `src/controllers/upload.controller.ts`
**Class**: `UploadController`
**Methods to Test**:
- `generateUploadUrl(req, res)`
- `confirmUpload(req, res)`
- `deleteFile(req, res)`
**Test Scenarios**:
- Upload URL generated with correct expiration
- Confirmation creates DB record
- Confirmation triggers processing
- Delete soft-deletes file
- Validation works
- Quota check on upload
- Error handling

---

### 7. Validator Files (3 files)

#### `src/validators/file.validator.ts`
**Class**: `FileValidator`
**Methods to Test**:
- `validateSize(size, mimeType)`
- `validateMimeType(mimeType)`
- `sanitizeFilename(filename)`
- `getExtension(filename)`
**Test Scenarios**:
- Size validation per type
- MIME type in allowed list
- Filename sanitized correctly
- Extension extracted correctly
- Invalid inputs rejected

#### `src/validators/image.validator.ts`
**Schemas to Test**:
- `resizeImageSchema`
- `cropImageSchema`
- `rotateImageSchema`
- `watermarkImageSchema`
- `generateQRSchema`
- `fileIdSchema`
**Test Scenarios**:
- Valid inputs pass
- Invalid inputs fail with correct messages
- Required fields enforced
- Ranges validated (width, height, angle, etc.)
- UUID validation works

#### `src/validators/upload.validator.ts`
**Exports to Test**:
- `generateUploadUrlSchema`
- `confirmUploadSchema`
- `deleteFileSchema`
- `validateFileSizeForType()`
- `validateRequest()`
**Test Scenarios**:
- Upload URL schema validates all fields
- Confirmation schema validates
- Delete schema validates UUID
- File size checked per type
- Request validation middleware works

---

### 8. Model Files (1 file)

#### `src/models/file.model.ts`
**Class**: `FileModel`
**Methods to Test**:
- `create(fileData)`
- `findById(fileId)`
- `updateStatus(fileId, status)`
- `updateCdnUrl(fileId, cdnUrl)`
- `findByEntity(entityType, entityId)`
- `mapRowToFile(row)` (private)
**Test Scenarios**:
- Creates file record
- Finds by ID
- Status updated
- CDN URL updated
- Finds all files for entity
- Row mapping correct
- Handles not found
- Database errors handled

---

### 9. Route Files (4 files)

#### `src/routes/cache.routes.ts`
**Routes to Test**:
- `GET /cache/stats`
- `DELETE /cache/flush`
**Test Scenarios**:
- Routes mounted correctly
- Middleware applied
- Controllers called

#### `src/routes/health.routes.ts`
**Routes to Test**:
- `GET /health`
- `GET /health/db`
**Test Scenarios**:
- Routes mounted
- Health check works
- DB check works

#### `src/routes/index.ts`
**Routes to Test**:
- All main routes mounted
- Middleware order correct
- Path prefixes correct
**Test Scenarios**:
- Upload routes work
- Download routes work
- Image routes work
- Document routes work
- QR routes work
- Admin routes work
- Health routes work
- Metrics routes work

#### `src/routes/ticket-pdf.routes.ts`
**Routes to Test**:
- `POST /generate`
**Test Scenarios**:
- Route mounted
- Validation middleware
- Controller called

---

### 10. Schema/Validation Files (1 file)

#### `src/schemas/validation.ts`
**Schemas to Test**:
- All Joi schemas defined
**Test Scenarios**:
- Each schema validates correctly
- Required fields enforced
- Optional fields work
- Type validation
- Custom validation rules

---

### 11. Processor Files (5 files)

#### `src/processors/document/document.processor.ts`
**Class**: `DocumentProcessor`
**Methods to Test**:
- `processDocument(filePath)`
- `extractFirstPage(filePath)`
- `extractPage(filePath, pageNumber)`
- `extractText(filePath)`
**Test Scenarios**:
- PDF processed successfully
- First page extracted
- Specific page extracted
- Text extracted
- Handles corrupted PDFs

#### `src/processors/image/image.processor.ts`
**Class**: `ImageProcessor`
**Methods to Test**:
- `processImage(filePath, operations)`
- `resize(filePath, options)`
- `crop(filePath, options)`
- `rotate(filePath, angle)`
- `optimize(filePath, options)`
**Test Scenarios**:
- Image processing pipeline works
- Multiple operations chained
- Each operation works independently
- Sharp integration works

#### `src/processors/image/optimize.processor.ts`
**Class**: `OptimizeProcessor`
**Methods to Test**:
- `optimize(filePath, quality)`
- `toWebP(filePath)`
- `toProgressive(filePath)`
**Test Scenarios**:
- Image optimized to target quality
- WebP conversion works
- Progressive JPEG works
- File size reduced

#### `src/processors/image/thumbnail.generator.ts`
**Class**: `ThumbnailGenerator`
**Methods to Test**:
- `generate(filePath, sizes)`
- `generateSingle(filePath, width, height)`
**Test Scenarios**:
- Multiple thumbnails generated
- Correct sizes
- Aspect ratio preserved
- Single thumbnail works

#### `src/processors/image/watermark.processor.ts`
**Class**: `WatermarkProcessor`
**Methods to Test**:
- `applyWatermark(filePath, watermarkOptions)`
- `applyTextWatermark(filePath, text, options)`
- `applyImageWatermark(filePath, watermarkPath, options)`
**Test Scenarios**:
- Text watermark applied
- Image watermark applied
- Position options work
- Opacity works
- Font settings work

---

### 12. Storage Files (4 files)

#### `src/storage/storage.service.ts`
**Class**: `StorageService`
**Methods to Test**:
- `chooseProvider()`
- `upload(file, options)`
- `download(key)`
- `delete(key)`
- `getUrl(key)`
**Test Scenarios**:
- Selects S3 in production
- Selects local in development
- Delegates to correct provider
- Provider methods called

#### `src/storage/storage.setup.ts`
**Functions to Test**:
- `initializeStorage()`
- `validateStorageConfig()`
**Test Scenarios**:
- Storage initialized correctly
- Config validated
- Required env vars checked
- Fails fast if S3 missing in prod

#### `src/storage/providers/local.provider.ts`
**Class**: `LocalProvider`
**Methods to Test**:
- `upload(buffer, key)`
- `download(key)`
- `delete(key)`
- `getUrl(key)`
- `exists(key)`
**Test Scenarios**:
- Uploads to local filesystem
- Downloads from local filesystem
- Deletes files
- Returns local URL
- Checks existence
- Creates directories
- Handles errors

#### `src/storage/providers/s3.provider.ts`
**Class**: `S3Provider`
**Methods to Test**:
- `upload(buffer, key, options)`
- `download(key)`
- `delete(key)`
- `getUrl(key)`
- `getSignedUrl(key, expiresIn)`
- `exists(key)`
**Test Scenarios**:
- Uploads to S3
- Downloads from S3
- Deletes from S3
- Returns S3 URL
- Generates signed URLs
- Checks existence
- Handles S3 errors
- Retries on failure

---

### 13. Type/Error/Constant Files (3 files)

#### `src/types/file.types.ts`
**Types to Test**:
- `FileRecord` interface
- `FileStatus` type
- `StorageResult` interface
- `AccessLevel` type
**Test Scenarios**:
- Types compile correctly
- Enums have correct values
- Interfaces match database schema

#### `src/errors/index.ts`
**Errors to Test**:
- All error classes exported
- Error hierarchy correct
**Test Scenarios**:
- Errors importable
- Proper inheritance
- Status codes correct

#### `src/constants/file-status.ts`
**Constants to Test**:
- File status constants
**Test Scenarios**:
- All statuses defined
- Values correct
- Immutable

---

### 14. Worker Files (1 file)

#### `src/workers/index.ts`
**Functions to Test**:
- Worker initialization
- Queue setup
- Job processing
**Test Scenarios**:
- Workers start correctly
- Jobs processed
- Error handling
- Graceful shutdown

---

## Testing Priority Matrix

### Critical Priority (Test First)
1. **Config files** - Required for all other tests
2. **Errors & Utils** - Used everywhere
3. **Models** - Database layer
4. **Core Services** - upload, storage, file operations

### High Priority (Test Next)
5. **Middleware** - Authentication, authorization, rate limiting
6. **Validators** - Input validation
7. **Main Controllers** - Upload, download, admin

### Medium Priority (Test After Core)
8. **Processing Services** - Image, document, video processing
9. **Additional Controllers** - Image, document, QR
10. **Processors** - Image manipulation, document processing

### Lower Priority (Test Last)
11. **Routes** - Route mounting (simpler tests)
12. **Cache & CDN** - Nice-to-have features
13. **App & Index** - Integration-level tests

---

## Estimated Test Count

Based on the breakdown:
- **Configuration**: ~25 tests
- **Utilities**: ~40 tests
- **Middleware**: ~60 tests
- **Services**: ~250 tests (largest category)
- **Controllers**: ~80 tests
- **Validators**: ~40 tests
- **Models**: ~20 tests
- **Routes**: ~30 tests
- **Processors**: ~50 tests
- **Storage**: ~40 tests
- **Others**: ~20 tests

**Total Estimated Tests: 655+ unit tests**

---

## Success Metrics

✅ All 63 source files covered  
✅ 655+ unit tests written  
✅ 80%+ code coverage  
✅ All tests passing  
✅ Tests run in < 30 seconds  
✅ No flaky tests  
✅ All edge cases covered  
✅ All error paths tested  

---

**Next Steps**: Begin writing tests starting with Phase 1 (Foundation)

**Last Updated**: 2026-01-15
