# FILE SERVICE - API DOCUMENTATION

**Version:** 1.0.0  
**Base URL:** `http://localhost:3013` (development)  
**Base URL:** `https://api.tickettoken.com/files` (production)

---

## TABLE OF CONTENTS

1. [Authentication](#authentication)
2. [Upload Operations](#upload-operations)
3. [Download Operations](#download-operations)
4. [Image Operations](#image-operations)
5. [Document Operations](#document-operations)
6. [Video Operations](#video-operations)
7. [Admin Operations](#admin-operations)
8. [Metrics & Health](#metrics--health)
9. [Error Codes](#error-codes)
10. [Rate Limits](#rate-limits)

---

## AUTHENTICATION

All endpoints (except `/health` and `/metrics`) require JWT authentication.

### Headers
```
Authorization: Bearer <jwt_token>
```

### Roles
- **user** - Standard user access
- **admin** - Administrative access

---

## UPLOAD OPERATIONS

### Generate Upload URL
**POST** `/upload/url`

Generate a signed URL for direct file upload to storage.

**Authentication:** Required  
**Rate Limit:** 10 requests per 15 minutes per user

**Request Body:**
```json
{
  "filename": "example.jpg",
  "contentType": "image/jpeg",
  "fileSize": 1048576,
  "accessLevel": "private",
  "tenantId": "uuid-optional",
  "venueId": "uuid-optional"
}
```

**Response:** `200 OK`
```json
{
  "uploadUrl": "https://s3.amazonaws.com/bucket/key?signature=...",
  "fileKey": "files/user-id/uuid/example.jpg",
  "expiresAt": "2025-11-17T18:00:00Z",
  "uploadId": "uuid"
}
```

**Errors:**
- `401` - Unauthorized
- `400` - Invalid file metadata
- `403` - Quota exceeded
- `429` - Rate limit exceeded

---

### Confirm Upload
**POST** `/upload/confirm`

Confirm successful file upload and trigger processing.

**Authentication:** Required  
**Rate Limit:** 30 requests per 15 minutes per user

**Request Body:**
```json
{
  "uploadId": "uuid",
  "fileKey": "files/user-id/uuid/example.jpg",
  "actualSize": 1048576,
  "checksum": "sha256-hash"
}
```

**Response:** `200 OK`
```json
{
  "fileId": "uuid",
  "status": "processing",
  "virusScanTriggered": true,
  "estimatedProcessingTime": 30
}
```

**Errors:**
- `401` - Unauthorized
- `404` - Upload session not found
- `400` - Invalid confirmation data

---

### Delete File
**DELETE** `/files/:fileId`

Soft delete a file (marks as deleted, not physically removed).

**Authentication:** Required (owner or admin)  
**Rate Limit:** 100 requests per 15 minutes per user

**Response:** `204 No Content`

**Errors:**
- `401` - Unauthorized
- `403` - Not file owner
- `404` - File not found

---

## DOWNLOAD OPERATIONS

### Download File
**GET** `/download/:fileId`

Download file with ownership verification.

**Authentication:** Required  
**Rate Limit:** 100 requests per 15 minutes per user

**Response:** `200 OK`
- **Headers:**
  - `Content-Type`: file's MIME type
  - `Content-Length`: file size
  - `Content-Disposition`: attachment; filename="..."
- **Body:** File binary data

**Errors:**
- `401` - Unauthorized
- `403` - No access to file
- `404` - File not found

---

### Stream File
**GET** `/stream/:fileId`

Stream file (supports range requests for videos).

**Authentication:** Required  
**Rate Limit:** 100 requests per 15 minutes per user

**Headers:**
- `Range`: bytes=0-1023 (optional)

**Response:** `206 Partial Content` or `200 OK`
- **Headers:**
  - `Content-Range`: bytes 0-1023/10240
  - `Accept-Ranges`: bytes
  - `Content-Type`: file's MIME type
- **Body:** File chunk

---

## IMAGE OPERATIONS

### Resize Image
**POST** `/images/:fileId/resize`

Resize image to specified dimensions.

**Authentication:** Required (owner or admin)  
**Rate Limit:** 30 requests per 15 minutes per user

**Request Body:**
```json
{
  "width": 800,
  "height": 600,
  "maintainAspectRatio": true,
  "quality": 85
}
```

**Response:** `200 OK`
```json
{
  "fileId": "uuid",
  "newDimensions": {
    "width": 800,
    "height": 600
  },
  "newSize": 524288,
  "processedAt": "2025-11-17T17:00:00Z"
}
```

**Errors:**
- `400` - Invalid dimensions
- `403` - Not file owner
- `422` - Not an image file

---

### Crop Image
**POST** `/images/:fileId/crop`

Crop image to specified region.

**Authentication:** Required (owner or admin)

**Request Body:**
```json
{
  "x": 100,
  "y": 100,
  "width": 400,
  "height": 300
}
```

**Response:** `200 OK`

---

### Rotate Image
**POST** `/images/:fileId/rotate`

Rotate image by specified degrees.

**Authentication:** Required (owner or admin)

**Request Body:**
```json
{
  "degrees": 90
}
```

**Response:** `200 OK`

---

### Add Watermark
**POST** `/images/:fileId/watermark`

Add text or image watermark.

**Authentication:** Required (owner or admin)

**Request Body:**
```json
{
  "text": "© TicketToken",
  "position": "bottom-right",
  "opacity": 0.5,
  "fontSize": 24
}
```

**Response:** `200 OK`

---

### Get Image Metadata
**GET** `/images/:fileId/metadata`

Get image metadata (dimensions, EXIF, etc.).

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "fileId": "uuid",
  "dimensions": {
    "width": 1920,
    "height": 1080
  },
  "format": "JPEG",
  "colorSpace": "sRGB",
  "hasAlpha": false,
  "exifStripped": true
}
```

---

## DOCUMENT OPERATIONS

### Get PDF Preview
**GET** `/documents/:fileId/preview`

Generate PDF preview (first page).

**Authentication:** Required

**Response:** `200 OK`
- Image of first page

---

### Get PDF Page
**GET** `/documents/:fileId/page/:pageNumber`

Get specific page of PDF.

**Authentication:** Required

**Response:** `200 OK`
- Image of specified page

---

### Convert Document
**POST** `/documents/:fileId/convert`

Convert document to different format.

**Authentication:** Required

**Request Body:**
```json
{
  "targetFormat": "pdf"
}
```

**Response:** `202 Accepted`
```json
{
  "conversionId": "uuid",
  "status": "processing",
  "estimatedTime": 60
}
```

---

### Extract Text
**GET** `/documents/:fileId/text`

Extract text from document (OCR if needed).

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "fileId": "uuid",
  "text": "Extracted text content...",
  "pageCount": 5,
  "language": "en"
}
```

---

## VIDEO OPERATIONS

### Get Video Preview
**GET** `/videos/:fileId/preview`

Get video thumbnail/preview image.

**Authentication:** Required

**Response:** `200 OK`
- Thumbnail image (JPEG)

---

### Transcode Video
**POST** `/videos/:fileId/transcode`

Transcode video to different format/quality.

**Authentication:** Required

**Request Body:**
```json
{
  "format": "mp4",
  "resolution": "720p",
  "codec": "h264",
  "bitrate": 2000
}
```

**Response:** `202 Accepted`
```json
{
  "jobId": "uuid",
  "status": "queued",
  "estimatedTime": 300
}
```

---

### Get Video Metadata
**GET** `/videos/:fileId/metadata`

Get video metadata (duration, resolution, codec, etc.).

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "fileId": "uuid",
  "duration": 120.5,
  "resolution": {
    "width": 1920,
    "height": 1080
  },
  "codec": "h264",
  "bitrate": 2500000,
  "fps": 30
}
```

---

## ADMIN OPERATIONS

### Get Service Statistics
**GET** `/admin/stats`

Get comprehensive service statistics.

**Authentication:** Required (admin only)

**Response:** `200 OK`
```json
{
  "files": {
    "total": 150000,
    "totalSize": 52428800000,
    "byType": {
      "images": 100000,
      "documents": 30000,
      "videos": 20000
    }
  },
  "storage": {
    "used": 52428800000,
    "percentage": 52.4
  },
  "virusScans": {
    "total": 150000,
    "clean": 149950,
    "infected": 50
  },
  "performance": {
    "avgUploadTime": 2.5,
    "avgDownloadTime": 0.8
  }
}
```

---

### Cleanup Orphaned Files
**POST** `/admin/cleanup`

Remove orphaned files from storage.

**Authentication:** Required (admin only)

**Response:** `200 OK`
```json
{
  "filesRemoved": 150,
  "spaceReclaimed": 1048576000
}
```

---

### Bulk Delete Files
**DELETE** `/admin/bulk-delete`

Delete multiple files at once.

**Authentication:** Required (admin only)

**Request Body:**
```json
{
  "fileIds": ["uuid1", "uuid2", "uuid3"],
  "reason": "cleanup"
}
```

**Response:** `200 OK`
```json
{
  "deleted": 3,
  "failed": 0,
  "errors": []
}
```

---

## METRICS & HEALTH

### Health Check
**GET** `/health`

Simple health check endpoint.

**Authentication:** Not required

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "uptime": 86400,
  "timestamp": "2025-11-17T17:00:00Z"
}
```

---

### Prometheus Metrics
**GET** `/metrics`

Prometheus-compatible metrics endpoint.

**Authentication:** Not required (for Prometheus scraping)

**Response:** `200 OK`
```
# HELP file_uploads_total Total number of file uploads
# TYPE file_uploads_total counter
file_uploads_total{status="success",file_type="image/jpeg"} 1000

# HELP file_upload_duration_seconds File upload duration
# TYPE file_upload_duration_seconds histogram
file_upload_duration_seconds_bucket{file_type="image/jpeg",le="1"} 800
...
```

---

### Metrics JSON
**GET** `/metrics/json`

Metrics in JSON format.

**Authentication:** Required (admin only)

**Response:** `200 OK`
```json
{
  "metrics": [
    {
      "name": "file_uploads_total",
      "type": "counter",
      "value": 1000
    }
  ]
}
```

---

### Service Statistics
**GET** `/metrics/stats`

Detailed service statistics.

**Authentication:** Required (admin only)

**Response:** `200 OK`
```json
{
  "files": {
    "total": 150000,
    "totalSizeBytes": 52428800000,
    "totalSizeMb": 50000,
    "uniqueUploaders": 5000,
    "recentUploads24h": 250
  },
  "fileTypes": [
    {"type": "image/jpeg", "count": 50000},
    {"type": "application/pdf", "count": 30000}
  ],
  "virusScans": [
    {"result": "clean", "count": 149900},
    {"result": "infected", "count": 50}
  ],
  "quarantined": 50
}
```

---

### Detailed Health
**GET** `/metrics/health`

Detailed health check with component status.

**Authentication:** Required (admin only)

**Response:** `200 OK` or `503 Service Unavailable`
```json
{
  "status": "healthy",
  "timestamp": "2025-11-17T17:00:00Z",
  "uptime": 86400,
  "memory": {
    "rss": 183500800,
    "heapTotal": 120000000,
    "heapUsed": 95000000
  },
  "components": {
    "database": {
      "status": "healthy",
      "latencyMs": 5
    },
    "storage": {
      "status": "healthy",
      "provider": "s3"
    },
    "virusScanner": {
      "status": "healthy",
      "version": "0.103.0"
    }
  }
}
```

---

## ERROR CODES

### Standard HTTP Codes
- `200` - Success
- `201` - Created
- `202` - Accepted (async operation)
- `204` - No Content
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Unprocessable Entity
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error
- `503` - Service Unavailable

### Error Response Format
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional info"
  },
  "timestamp": "2025-11-17T17:00:00Z"
}
```

### Custom Error Codes
- `QUOTA_EXCEEDED` - Storage quota exceeded
- `INVALID_FILE_TYPE` - File type not allowed
- `FILE_TOO_LARGE` - File exceeds size limit
- `VIRUS_DETECTED` - File failed virus scan
- `UPLOAD_EXPIRED` - Upload session expired
- `INVALID_TOKEN` - JWT token invalid
- `INSUFFICIENT_PERMISSIONS` - User lacks permissions

---

## RATE LIMITS

### Per-User Limits
| Operation | Limit | Window |
|-----------|-------|--------|
| Upload URL Generation | 10 | 15 minutes |
| Upload Confirmation | 30 | 15 minutes |
| File Downloads | 100 | 15 minutes |
| Image Processing | 30 | 15 minutes |
| File Deletion | 100 | 15 minutes |

### Rate Limit Headers
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1700236800
```

### Exceeding Limits
When rate limit exceeded:
- **Status:** `429 Too Many Requests`
- **Header:** `Retry-After: 900` (seconds)
- **Body:**
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 900,
  "limit": 10,
  "window": 900
}
```

---

## WEBHOOKS (Future)

### File Processing Complete
```json
{
  "event": "file.processing.complete",
  "fileId": "uuid",
  "status": "success",
  "virusScan": {
    "result": "clean",
    "scannedAt": "2025-11-17T17:00:00Z"
  },
  "timestamp": "2025-11-17T17:00:05Z"
}
```

### Quota Warning
```json
{
  "event": "quota.warning",
  "userId": "uuid",
  "usage": 84,
  "limit": 100,
  "percentageUsed": 84,
  "timestamp": "2025-11-17T17:00:00Z"
}
```

---

## OpenAPI/Swagger

Full OpenAPI 3.0 specification available at:
- Development: `http://localhost:3013/api-docs`
- Production: `https://api.tickettoken.com/files/api-docs`

**Swagger UI:** Interactive API documentation with "Try it out" feature.

---

## SDK Examples

### JavaScript/TypeScript
```typescript
import { FileServiceClient } from '@tickettoken/sdk';

const client = new FileServiceClient({
  baseUrl: 'https://api.tickettoken.com/files',
  apiKey: 'your-jwt-token'
});

// Upload file
const { uploadUrl, fileKey } = await client.generateUploadUrl({
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
  fileSize: 1048576
});

// Upload to S3
await fetch(uploadUrl, {
  method: 'PUT',
  body: fileBuffer,
  headers: { 'Content-Type': 'image/jpeg' }
});

// Confirm upload
const { fileId } = await client.confirmUpload({
  fileKey,
  actualSize: 1048576
});
```

### Python
```python
from tickettoken_sdk import FileServiceClient

client = FileServiceClient(
    base_url='https://api.tickettoken.com/files',
    api_key='your-jwt-token'
)

# Upload file
upload_info = client.generate_upload_url(
    filename='photo.jpg',
    content_type='image/jpeg',
    file_size=1048576
)

# Confirm
file_info = client.confirm_upload(
    file_key=upload_info['fileKey'],
    actual_size=1048576
)
```

---

## CHANGELOG

### v1.0.0 (2025-11-17)
- Initial API release
- Upload/download operations
- Image/document/video processing
- Virus scanning integration
- Storage quotas
- Multi-tenancy support
- Prometheus metrics
- Comprehensive access control

---

**Documentation Version:** 1.0.0  
**Last Updated:** 2025-11-17  
**API Status:** Production Ready
