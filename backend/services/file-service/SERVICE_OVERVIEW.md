# File Service - Complete Overview

**Service Purpose:** Handles file uploads, storage, processing, and serving for images, videos, documents, PDFs, and QR codes. Provides virus scanning, CDN integration, storage quotas, and multi-provider storage support (S3/local).

---

## 📁 routes/

### **index.ts** (Main Routes)
| Method | Path | Middleware | Controller Method | Description |
|--------|------|------------|------------------|-------------|
| **Health & Metrics** |
| GET | `/health` | None | `HealthController.check` | Public health check |
| GET | `/metrics` | None | `MetricsController.getMetrics` | Prometheus metrics (public) |
| GET | `/metrics/json` | authenticate, requireAdmin | `MetricsController.getMetricsJSON` | JSON metrics (admin) |
| GET | `/metrics/stats` | authenticate, requireAdmin | `MetricsController.getStats` | Service statistics (admin) |
| GET | `/metrics/health` | authenticate, requireAdmin | `MetricsController.getDetailedHealth` | Detailed health check (admin) |
| **Admin Operations** |
| GET | `/admin/stats` | authenticate, requireAdmin | `AdminController.getStats` | File statistics and usage data |
| POST | `/admin/cleanup` | authenticate, requireAdmin | `AdminController.cleanupOrphaned` | Cleanup orphaned files |
| DELETE | `/admin/bulk-delete` | authenticate, requireAdmin | `AdminController.bulkDelete` | Bulk delete files |
| **Document Operations** |
| GET | `/documents/:fileId/preview` | authenticate, verifyFileOwnership | `DocumentController.getPreview` | Preview document (first page) |
| GET | `/documents/:fileId/page/:pageNumber` | authenticate, verifyFileOwnership | `DocumentController.getPage` | Get specific page from PDF |
| POST | `/documents/:fileId/convert` | authenticate, verifyFileOwnership | `DocumentController.convertFormat` | Convert document format |
| GET | `/documents/:fileId/text` | authenticate, verifyFileOwnership | `DocumentController.extractText` | Extract text from document |
| **Download Operations** |
| GET | `/download/:fileId` | authenticate, verifyFileOwnership | `DownloadController.downloadFile` | Download file (attachment) |
| GET | `/stream/:fileId` | authenticate, verifyFileOwnership | `DownloadController.streamFile` | Stream file (inline) |
| **Image Operations** |
| POST | `/images/:fileId/resize` | authenticate, verifyFileModifyPermission | `ImageController.resize` | Resize image |
| POST | `/images/:fileId/crop` | authenticate, verifyFileModifyPermission | `ImageController.crop` | Crop image |
| POST | `/images/:fileId/rotate` | authenticate, verifyFileModifyPermission | `ImageController.rotate` | Rotate image |
| POST | `/images/:fileId/watermark` | authenticate, verifyFileModifyPermission | `ImageController.watermark` | Add watermark to image |
| GET | `/images/:fileId/metadata` | authenticate, verifyFileOwnership | `ImageController.getMetadata` | Get image metadata |
| **QR Code Operations** |
| POST | `/qr/generate` | authenticate | `QRController.generateQRCode` | Generate QR code |
| POST | `/qr/generate-store` | authenticate | `QRController.generateAndStore` | Generate and store QR code |
| **Upload Operations** |
| POST | `/upload/url` | authenticate | `UploadController.generateUploadUrl` | Generate presigned upload URL |
| POST | `/upload/confirm` | authenticate | `UploadController.confirmUpload` | Confirm upload completion |
| DELETE | `/files/:fileId` | authenticate, verifyFileModifyPermission | `UploadController.deleteFile` | Delete file |
| **Video Operations** |
| GET | `/videos/:fileId/preview` | authenticate, verifyFileOwnership | `VideoController.getPreview` | Get video preview/thumbnails |
| POST | `/videos/:fileId/transcode` | authenticate, verifyFileModifyPermission | `VideoController.transcode` | Transcode video |
| GET | `/videos/:fileId/metadata` | authenticate, verifyFileOwnership | `VideoController.getMetadata` | Get video metadata |

### **health.routes.ts**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/db` | Database connectivity check |

### **cache.routes.ts**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/cache/stats` | Get cache statistics |
| DELETE | `/cache/flush` | Flush cache |

### **ticket-pdf.routes.ts**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/generate` | Generate branded ticket PDF |

---

## 🎮 controllers/

### **AdminController**
- **`getStats()`** - Get file service statistics (total files, storage usage, by entity type)
- **`cleanupOrphaned()`** - Find and cleanup orphaned files (DB records without files on disk)
- **`bulkDelete()`** - Soft delete multiple files at once
- **`getAuditLogs()`** - View audit logs for admin actions

**Purpose:** Administrative operations for file management, cleanup, and monitoring.

### **UploadController**
- **`generateUploadUrl()`** - Generate signed S3 upload URL for direct client uploads
- **`confirmUpload()`** - Confirm upload completion and start processing
- **`deleteFile()`** - Delete file from storage and database
- **`processFile()` (private)** - Process uploaded file (virus scan, metadata extraction)

**Purpose:** Handle file upload lifecycle with presigned URLs and confirmation.

### **DownloadController**
- **`downloadFile()`** - Download file as attachment
- **`streamFile()`** - Stream file inline (for viewing in browser)

**Purpose:** Serve files to authenticated users with proper access control.

### **ImageController**
- **`resize()`** - Resize image with configurable dimensions and fit options
- **`crop()`** - Crop image to specific coordinates and dimensions
- **`rotate()`** - Rotate image by 90/180/270 degrees
- **`watermark()`** - Add text watermark to image
- **`getMetadata()`** - Get image metadata (dimensions, format, color space, etc.)

**Purpose:** Image manipulation and metadata extraction using Sharp library.

### **DocumentController**
- **`getPreview()`** - Preview document (first page or text excerpt)
- **`getPage()`** - Get specific page from PDF document
- **`convertFormat()`** - Convert document between formats
- **`extractText()`** - Extract text content from PDF or text documents

**Purpose:** Document processing and text extraction using pdf-parse.

### **VideoController**
- **`getPreview()`** - Get video preview images and metadata
- **`transcode()`** - Queue video transcoding job
- **`getMetadata()`** - Get video metadata (duration, codec, bitrate, etc.)

**Purpose:** Video processing and thumbnail generation.

### **QRController**
- **`generateQRCode()`** - Generate QR code as PNG image
- **`generateAndStore()`** - Generate QR code and return as base64

**Purpose:** QR code generation for tickets and other use cases.

### **HealthController**
- **`check()`** - Basic health check with database status

**Purpose:** Health monitoring for orchestration systems.

### **MetricsController**
- **`getMetrics()`** - Prometheus-formatted metrics
- **`getMetricsJSON()`** - JSON-formatted metrics (admin only)
- **`getStats()`** - Detailed service statistics (file counts, types, virus scans, etc.)
- **`getDetailedHealth()`** - Comprehensive health check (DB, storage, virus scanner)
- **`checkDatabase()` (private)** - Database health check
- **`checkStorage()` (private)** - Storage provider health check
- **`checkVirusScanner()` (private)** - Virus scanner health check

**Purpose:** Monitoring, metrics collection, and observability.

---

## 🔧 services/

### **access-log.service.ts** - `AccessLogService`
- **`logAccess()`** - Log file access (view, download, share, stream)
- **`getAccessLogs()`** - Get access logs for a file
- **`getUserAccessHistory()`** - Get user's access history
- **`getFileAccessStats()`** - Get access statistics for a file

### **antivirus.service.ts** - `AntivirusService`
- **`scanFile()`** - Scan file for viruses using ClamAV or mock scanner
- **`runClamAVScan()`** - Run ClamAV scan
- **`mockScan()`** - Mock scanner for development
- **`calculateFileHash()`** - Calculate SHA256 hash
- **`checkExistingScan()`** - Check if file already scanned
- **`storeScanResult()`** - Store scan result in database
- **`quarantineFile()`** - Move infected file to quarantine
- **`scanS3File()`** - Scan file from S3

### **batch-operations.service.ts** - `BatchOperationsService`
- **`batchDelete()`** - Delete multiple files
- **`batchMove()`** - Move multiple files
- **`batchTag()`** - Tag multiple files
- **`batchDownload()`** - Download multiple files as ZIP
- **`batchCopy()`** - Copy multiple files

### **batch-processor.service.ts** - `BatchProcessorService`
- **`createBatchJob()`** - Create batch processing job
- **`getBatchJobStatus()`** - Get job status
- **`processJob()`** - Process batch job
- **`processFile()`** - Process individual file in batch
- **`resizeFile()`** - Batch resize operation
- **`convertFile()`** - Batch convert operation
- **`compressFile()`** - Batch compress operation
- **`watermarkFile()`** - Batch watermark operation
- **`cancelBatchJob()`** - Cancel running job
- **`cleanupOldJobs()`** - Cleanup completed jobs

### **cache-integration.ts** - Service Cache Functions
- **`get()`** - Get from cache with optional fetcher
- **`set()`** - Set cache value with TTL
- **`delete()`** - Delete cache key(s)
- **`flush()`** - Clear entire cache

### **cache.service.ts** - `CacheService`
- **`get()`** - Get value from cache
- **`set()`** - Set value in cache
- **`delete()`** - Delete key
- **`deletePattern()`** - Delete keys matching pattern
- **`exists()`** - Check if key exists
- **`getOrSet()`** - Get from cache or fetch and cache
- **`increment()`** - Increment counter
- **`mset()`** - Set multiple values
- **`mget()`** - Get multiple values
- **`clear()`** - Clear cache with optional prefix
- **`getStats()`** - Get cache statistics
- **`isHealthy()`** - Check cache health

### **cdn.service.ts** - `CDNService`
- **`getCDNUrl()`** - Get CDN URL for file
- **`getS3Url()`** - Get direct S3 URL
- **`getCacheControl()`** - Get cache control headers
- **`invalidateCache()`** - Invalidate CDN cache for paths
- **`invalidateFileCache()`** - Invalidate cache for specific file
- **`getResponsiveImageUrls()`** - Get responsive image URLs
- **`getVideoUrls()`** - Get video URLs (HLS, DASH)
- **`getSignedUrl()`** - Get signed URL with expiration
- **`warmCache()`** - Pre-warm CDN cache
- **`getStats()`** - Get CDN statistics

### **chunked-upload.service.ts** - `ChunkedUploadService`
- **`createSession()`** - Create chunked upload session
- **`uploadChunk()`** - Upload single chunk
- **`completeSession()`** - Complete chunked upload
- **`cancelSession()`** - Cancel upload session

### **cleanup.service.ts** - `CleanupService`
- **`cleanupOrphanedFiles()`** - Remove orphaned files
- **`cleanupTempFiles()`** - Remove temporary files
- **`calculateStorageUsage()`** - Calculate storage usage
- **`enforceStorageLimits()`** - Enforce storage quotas

### **duplicate-detector.service.ts** - `DuplicateDetectorService`
- **`calculateFileHash()`** - Calculate file hash
- **`findDuplicateByHash()`** - Find duplicate by hash
- **`findAllDuplicates()`** - Find all duplicates of file
- **`getDuplicateStats()`** - Get deduplication statistics
- **`getDuplicateGroups()`** - Get groups of duplicate files
- **`deduplicateGroup()`** - Deduplicate single group
- **`deduplicateAll()`** - Deduplicate all files
- **`findSimilarImages()`** - Find visually similar images
- **`updateFileHash()`** - Update file hash
- **`scanForMissingHashes()`** - Find files without hashes

### **file-search.service.ts** - `FileSearchService`
- **`search()`** - Search files with filters
- **`searchByContent()`** - Search by content/text
- **`getRecentFiles()`** - Get recently uploaded files
- **`getMostAccessed()`** - Get most accessed files

### **file-version.service.ts** - `FileVersionService`
- **`createVersion()`** - Create new file version
- **`getVersions()`** - Get all versions of file
- **`restoreVersion()`** - Restore previous version
- **`deleteVersion()`** - Delete specific version

### **image.service.ts** - `ImageService`
- **`processUploadedImage()`** - Process uploaded image
- **`generateThumbnail()`** - Generate thumbnail (small/medium/large)
- **`optimizeImage()`** - Optimize image for web

### **metrics.service.ts** - `MetricsService`
- **`recordUpload()`** - Record upload metrics
- **`recordDownload()`** - Record download metrics
- **`recordProcessing()`** - Record processing metrics
- **`recordVirusScan()`** - Record virus scan metrics
- **`recordStorageOperation()`** - Record storage operation metrics
- **`recordStorageError()`** - Record storage errors
- **`recordAuthAttempt()`** - Record authentication attempts
- **`recordRateLimitExceeded()`** - Record rate limit violations
- **`recordError()`** - Record general errors
- **`updateResourceMetrics()`** - Update resource usage metrics
- **`updateFileStats()`** - Update file statistics
- **`getMetrics()`** - Get Prometheus metrics
- **`getMetricsJSON()`** - Get JSON metrics

### **qr-code.service.ts** - `QRCodeService`
- **`generateQRCode()`** - Generate QR code from data
- **`generateTicketQR()`** - Generate ticket-specific QR code

### **qr.service.ts** - `QRService`
- **`generateQR()`** - Generate QR code

### **s3.service.ts** - `S3Service`
- **`uploadToS3()`** - Upload buffer to S3
- **`deleteFromS3()`** - Delete file from S3

### **storage-quota.service.ts** - `StorageQuotaService`
- **`setQuota()`** - Set storage quota for user/tenant/venue
- **`getQuota()`** - Get quota limits
- **`calculateUsage()`** - Calculate current storage usage
- **`saveUsage()`** - Save usage to database
- **`checkQuota()`** - Check if within quota limits
- **`createAlert()`** - Create quota alert
- **`getUsageSummary()`** - Get usage summary
- **`clearQuotaCache()`** - Clear quota cache
- **`deleteQuota()`** - Delete quota

### **storage.s3.ts** - `S3StorageService`
- **`generateSignedUploadUrl()`** - Generate presigned upload URL
- **`generateSignedDownloadUrl()`** - Generate presigned download URL
- **`deleteFile()`** - Delete file from S3
- **`setupLifecyclePolicy()`** - Setup S3 lifecycle policies

### **ticket-pdf.service.ts** - `TicketPDFService`
- **`generateTicketPDF()`** - Generate branded ticket PDF
- **`fetchVenueBranding()`** - Fetch venue branding
- **`generateTicketHTML()`** - Generate HTML for PDF

### **upload.service.ts** - `UploadService`
- **`uploadFile()`** - Upload file to storage
- **`getFile()`** - Get file by ID
- **`getFilesByEntity()`** - Get files for entity

### **virus-scan.service.ts** - `VirusScanService`
- **`initialize()`** - Initialize virus scanner
- **`scanFile()`** - Scan file for viruses
- **`logScanResult()`** - Log scan result
- **`quarantineFile()`** - Quarantine infected file
- **`getScanHistory()`** - Get scan history for file
- **`getLatestScan()`** - Get latest scan result
- **`needsScan()`** - Check if file needs scanning
- **`getQuarantinedFiles()`** - Get quarantined files list
- **`deleteQuarantinedFile()`** - Delete quarantined file
- **`getHealth()`** - Get virus scanner health status

---

## 🛡️ middleware/

### **auth.middleware.ts**
- **`authenticateOptional()`** - Optional JWT authentication (doesn't block request)
- **`authenticate()`** - Required JWT authentication
- **`requireAdmin()`** - Require admin role

**Purpose:** JWT-based authentication and role-based access control.

### **file-ownership.middleware.ts**
- **`verifyFileOwnership()`** - Verify user can access file (owner, public, shared, tenant)
- **`verifyFileModifyPermission()`** - Verify user can modify file (owner or admin only)
- **`checkExplicitAccess()`** - Check file_shares table for explicit access
- **`checkSameTenant()`** - Check if users in same tenant

**Purpose:** Fine-grained file access control supporting multiple access levels (private, public, shared, tenant).

### **error.middleware.ts**
- **`errorHandler()`** - Global error handler for standardized error responses

**Purpose:** Centralized error handling and logging.

### **rate-limit.middleware.ts**
- **`registerRateLimiting()`** - Register global rate limiting
- **`uploadRateLimiter`** - Rate limiter for uploads (10/15min)
- **`downloadRateLimiter`** - Rate limiter for downloads (100/15min)
- **`processingRateLimiter`** - Rate limiter for processing (30/15min)
- **`qrRateLimiter`** - Rate limiter for QR generation (20/15min)

**Purpose:** Prevent abuse with Redis-backed rate limiting per user/IP.

---

## ⚙️ config/

### **database.config.ts**
- **PostgreSQL connection pool** (max 20 connections)
- **`connectDatabase()`** - Initialize database connection
- **`getPool()`** - Get pool instance
- **`hasDatabase()`** - Check if connected
- **`closeDatabase()`** - Close connections

**Purpose:** PostgreSQL connection management with connection pooling.

### **secrets.ts**
- **`loadSecrets()`** - Load secrets from AWS Secrets Manager or environment
- Secrets: POSTGRES_PASSWORD, POSTGRES_USER, POSTGRES_DB, REDIS_PASSWORD

**Purpose:** Secure secrets management for production deployments.

### **constants.ts** - `FILE_CONSTANTS`
- **Size limits:** MAX_FILE_SIZE, MAX_IMAGE_SIZE, MAX_VIDEO_SIZE, MAX_DOCUMENT_SIZE, CHUNK_SIZE
- **Thumbnail sizes:** small (150x150), medium (300x300), large (600x600)
- **Allowed types:** ALLOWED_IMAGE_TYPES, ALLOWED_DOCUMENT_TYPES, ALLOWED_VIDEO_TYPES
- **Storage paths:** UPLOAD_PATH, TEMP_PATH
- **File statuses:** uploading, processing, ready, failed, deleted
- **Entity types:** venue, event, user, ticket

**Purpose:** Centralized configuration constants and limits.

### **database.ts**
- Knex database instance for query building

---

## 🗄️ migrations/

### **001_baseline_files.ts**
Creates core tables:
- **`files`** - Main files table (filename, mime_type, storage_path, size_bytes, uploaded_by, entity_type, entity_id, access_level, status, metadata, tags, etc.)
- **`file_access_logs`** - Access tracking (file_id, accessed_by, access_type, ip_address, user_agent)
- **`file_versions`** - File versioning (file_id, version_number, storage_path, change_description)
- **`upload_sessions`** - Chunked upload sessions (session_token, filename, total_chunks, uploaded_chunks, status)

### **002_add_missing_tables.ts**
Creates supporting tables:
- **`av_scans`** - Virus scan results (file_hash, clean, threats, scan_engine)
- **`quarantined_files`** - Quarantined infected files (original_path, quarantine_path, threats)
- **`file_uploads`** - Upload tracking (user_id, file_key, content_type, status, expires_at)
- **`file_shares`** - File sharing (file_id, shared_with_user_id, permission_level, expires_at)
- **`image_metadata`** - Image metadata (width, height, aspect_ratio, format, thumbnails, color space)
- **`video_metadata`** - Video metadata (duration, width, height, codec, bitrate, fps)
- **Row Level Security (RLS)** policies for tenant isolation

### **003_add_storage_quotas.ts**
Creates quota management tables:
- **`storage_quotas`** - Quota limits (user_id, tenant_id, venue_id, max_storage_bytes, max_files, limits_by_type)
- **`storage_usage`** - Current usage (total_storage_bytes, total_files, usage_by_type, peak_storage)
- **`quota_alerts`** - Quota alerts (alert_type, usage_percentage, notification_sent)
- Adds **tenant_id** and **venue_id** to files table

---

## ✅ validators/

### **upload.validator.ts**
- **`generateUploadUrlSchema`** - Joi schema for upload URL generation (fileName, contentType, fileSize, entityType, entityId)
- **`confirmUploadSchema`** - Joi schema for upload confirmation (fileKey, etag)
- **`deleteFileSchema`** - Joi schema for file deletion (fileId UUID)
- **`validateFileSizeForType()`** - Validate file size based on content type
- **`validateRequest()`** - Validate request against Joi schema

**Validation Rules:**
- Filename: 1-255 chars, alphanumeric + dots/underscores/hyphens only
- Content type: Must be in allowed list (images, documents, videos)
- File size limits: Images (10MB), Videos (500MB), Documents (50MB), General (100MB)

### **file.validator.ts** - `FileValidator`
- **`validateSize()`** - Validate file size against type-specific limits
- **`validateMimeType()`** - Validate MIME type against allowed types
- **`sanitizeFilename()`** - Sanitize filename (lowercase, remove special chars)
- **`getExtension()`** - Extract file extension

### **image.validator.ts**
- **`resizeImageSchema`** - Joi schema for resize (width, height, fit, quality)
- **`cropImageSchema`** - Joi schema for crop (x, y, width, height)
- **`rotateImageSchema`** - Joi schema for rotate (angle: 90/180/270)
- **`watermarkImageSchema`** - Joi schema for watermark (text, opacity, position)
- **`generateQRSchema`** - Joi schema for QR generation (data, size, errorCorrectionLevel)
- **`fileIdSchema`** - UUID validation for file IDs

---

## 📦 Other Folders

### **models/**
- **`file.model.ts`** - File model with CRUD operations
  - `create()` - Create file record
  - `findById()` - Find by ID
  - `updateStatus()` - Update file status
  - `updateCdnUrl()` - Update CDN URL
  - `findByEntity()` - Find files for entity
  - `mapRowToFile()` - Map DB row to FileRecord

### **processors/**
- **`document/document.processor.ts`** - PDF document processing
- **`image/image.processor.ts`** - Image processing pipeline
- **`image/optimize.processor.ts`** - Image optimization
- **`image/thumbnail.generator.ts`** - Thumbnail generation
- **`image/watermark.processor.ts`** - Watermark application
- **`video/video.processor.ts`** - Video transcoding and thumbnail generation

### **storage/**
- **`storage.service.ts`** - Storage abstraction layer (chooses provider)
- **`storage.setup.ts`** - Storage initialization
- **`providers/storage.provider.ts`** - Storage provider interface
- **`providers/local.provider.ts`** - Local filesystem storage (development only)
- **`providers/s3.provider.ts`** - AWS S3 storage provider (production)

**Storage Strategy:**
- **Development:** Local filesystem (with warning)
- **Production:** AWS S3 (required - fails fast if not configured)

### **types/**
- **`file.types.ts`** - TypeScript type definitions
  - `FileRecord` - File database record
  - `FileStatus` - File status enum
  - `StorageResult` - Storage operation result

### **utils/**
- **`database-optimization.util.ts`** - Database optimization utilities
- **`errors.ts`** - Custom error classes
- **`file-helpers.ts`** - File utility functions
- **`logger.ts`** - Winston logger configuration

### **workers/**
- **`index.ts`** - Background workers for async processing

### **constants/**
- **`file-status.ts`** - File status constants

---

## 🔌 External Service Integrations

### **AWS S3**
- File storage (production)
- Presigned URLs for direct uploads
- Lifecycle policies for automatic cleanup
- Environment Variables: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`

### **CloudFront CDN** (Optional)
- CDN distribution for file serving
- Cache invalidation support
- Responsive image URLs
- Environment Variable: `CDN_DOMAIN`

### **PostgreSQL**
- File metadata and relationships
- Access logs and audit trail
- Virus scan results
- Storage quotas and usage tracking
- Environment Variable: `DATABASE_URL`

### **Redis** (Optional)
- Cache layer for file metadata
- Rate limiting storage
- Session management for chunked uploads
- Environment Variables: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

### **ClamAV** (Optional)
- Virus scanning for uploaded files
- Automatic quarantine of infected files
- Falls back to mock scanner if unavailable
- Environment Variable: `ENABLE_VIRUS_SCAN`

### **Shared Audit Service**
- Logs admin actions
- Tracks file access and modifications
- Provides audit trail for compliance

---

## 📊 Database Schema Summary

### Core Tables (10)
1. **files** - Main file records with metadata, access control, and storage info
2. **file_access_logs** - Tracks every file access (view, download, stream)
3. **file_versions** - File version history with storage paths
4. **upload_sessions** - Chunked upload session management
5. **file_uploads** - Upload tracking and status
6. **av_scans** - Virus scan results indexed by file hash
7. **quarantined_files** - Infected files quarantine
8. **file_shares** - Fine-grained sharing permissions
9. **image_metadata** - Image-specific metadata (dimensions, thumbnails, color space)
10. **video_metadata** - Video-specific metadata (duration, codec, bitrate)

### Quota Management Tables (3)
11. **storage_quotas** - Storage quota definitions per user/tenant/venue
12. **storage_usage** - Current storage usage tracking
13. **quota_alerts** - Quota violation alerts and notifications

### Key Indexes
- `files`: uploaded_by, entity_type+entity_id, status, hash_sha256, created_at
- `file_access_logs`: file_id, accessed_by, accessed_at
- `av_scans`: file_hash (unique), scanned_at, clean
- `storage_quotas`: user_id, tenant_id, venue_id
- Composite indexes for storage usage queries

### Row Level Security (RLS)
- **Enabled on:** file_shares, image_metadata, video_metadata
- **Policy:** `tenant_id = current_setting('app.current_tenant')`
- **Purpose:** Multi-tenant data isolation

---

## 🔐 Security Features

1. **Multi-level Access Control**
   - Private (owner only)
   - Public (authenticated users)
   - Shared (explicit permissions)
   - Tenant (organization-wide)

2. **Virus Scanning**
   - ClamAV integration
   - Automatic quarantine
   - Hash-based scan caching

3. **Rate Limiting**
   - Per-endpoint limits
   - User/IP based tracking
   - Redis-backed storage

4. **Audit Logging**
   - Admin action tracking
   - File access logging
   - Change history

5. **Input Validation**
   - Joi schemas for all inputs
   - File type restrictions
   - Size limits per type
   - Filename sanitization

6. **Secure Storage**
   - Presigned URLs (time-limited)
   - S3 encryption at rest
   - No direct file access

---

## 📈 Monitoring & Observability

- **Prometheus Metrics:** Upload/download rates, processing times, error rates
- **Health Checks:** Database, storage, virus scanner connectivity
- **Access Logs:** Every file access tracked with user, IP, timestamp
- **Audit Trail:** Admin actions logged with full context
- **Quota Alerts:** Automatic alerts when approaching limits
- **Performance Metrics:** Response times, cache hit rates, queue sizes

---

## 🚀 Key Features

1. **Multi-Provider Storage** - S3 (production) or local (development)
2. **Direct Upload** - Presigned URLs for client-side uploads
3. **Image Processing** - Resize, crop, rotate, watermark with Sharp
4. **Video Processing** - Transcoding and thumbnail generation
5. **Document Processing** - PDF preview, page extraction, text extraction
6. **QR Code Generation** - Ticket QR codes with branding
7. **Virus Scanning** - ClamAV integration with quarantine
8. **CDN Integration** - CloudFront for global file distribution
9. **Storage Quotas** - Per-user/tenant/venue limits and tracking
10. **Deduplication** - Hash-based duplicate detection
11. **Versioning** - File version history and rollback
12. **Batch Operations** - Bulk file operations (delete, move, tag, download)
13. **Chunked Uploads** - Large file support with resumable uploads
14. **Access Control** - Fine-grained permissions (private, public, shared, tenant)
15. **Rate Limiting** - Prevent abuse with per-endpoint limits
16. **Caching** - Redis-backed caching for metadata and thumbnails

---

## 🔧 Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Storage
STORAGE_PROVIDER=s3  # 's3' or 'local' (local only for dev)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
S3_BUCKET_NAME=tickettoken-files
CDN_DOMAIN=cdn.tickettoken.com  # Optional

# Redis (Optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=xxx

# File Limits
MAX_FILE_SIZE_MB=100
MAX_IMAGE_SIZE_MB=10
MAX_VIDEO_SIZE_MB=500
MAX_DOCUMENT_SIZE_MB=50
CHUNK_SIZE_MB=5

# Allowed Types
ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/gif,image/webp
ALLOWED_DOCUMENT_TYPES=application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document
ALLOWED_VIDEO_TYPES=video/mp4,video/quicktime,video/x-msvideo,video/webm

# Virus Scanning (Optional)
ENABLE_VIRUS_SCAN=true

# Paths
LOCAL_STORAGE_PATH=./uploads
TEMP_STORAGE_PATH=./temp

# Auth
JWT_SECRET=xxx

# Service
SERVICE_NAME=file-service
NODE_ENV=production
PORT=3000
```

---

## 📝 Notes

- **Production requires S3:** Local storage will cause data loss on container restarts
- **Virus scanning is optional:** Falls back to mock scanner if ClamAV unavailable
- **Redis is optional:** In-memory cache used if Redis not configured
- **CDN is optional:** Direct S3 URLs used if CDN not configured
- **Multi-tenancy:** RLS policies enforce tenant isolation for shared resources
- **Soft deletes:** Files marked as deleted but not immediately removed from storage
- **Background workers:** Async processing for thumbnails, transcoding, virus scanning

---

**Last Updated:** 2025-12-21
