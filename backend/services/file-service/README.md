# File Service

File storage and media processing microservice for the TicketToken Platform.

## Overview

The File Service handles all file operations including:
- **Upload**: Presigned URL generation for secure direct uploads to S3
- **Download**: Secure file retrieval with streaming support
- **Image Processing**: Resize, crop, rotate, watermark using Sharp
- **Document Processing**: PDF preview, text extraction
- **Video Processing**: Transcoding, thumbnail generation
- **QR Code Generation**: Dynamic QR codes for tickets

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run database migrations
npm run migrate

# Start development server
npm run dev

# Start production server
npm run start
```

## API Endpoints

### Health Checks
- `GET /health/live` - Kubernetes liveness probe
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/startup` - Kubernetes startup probe
- `GET /health` - Comprehensive health status

### File Operations
- `POST /api/v1/files/upload` - Generate presigned upload URL
- `POST /api/v1/files/confirm` - Confirm upload completion
- `DELETE /api/v1/files/:fileId` - Delete file
- `GET /api/v1/files/:fileId` - Get file metadata
- `GET /api/v1/files/:fileId/download` - Download file
- `GET /api/v1/files/:fileId/stream` - Stream file

### Image Processing
- `POST /api/v1/images/:fileId/resize` - Resize image
- `POST /api/v1/images/:fileId/crop` - Crop image
- `POST /api/v1/images/:fileId/rotate` - Rotate image
- `POST /api/v1/images/:fileId/watermark` - Add watermark
- `GET /api/v1/images/:fileId/metadata` - Get EXIF metadata

### Document Processing
- `GET /api/v1/documents/:fileId/preview` - Get document preview
- `GET /api/v1/documents/:fileId/page/:pageNumber` - Get specific page
- `POST /api/v1/documents/:fileId/convert` - Convert format
- `GET /api/v1/documents/:fileId/text` - Extract text

### Video Processing
- `GET /api/v1/videos/:fileId/preview` - Get video thumbnail
- `POST /api/v1/videos/:fileId/transcode` - Start transcode job
- `GET /api/v1/videos/:fileId/metadata` - Get video metadata

### QR Code
- `POST /api/v1/qr/generate` - Generate QR code (base64)
- `POST /api/v1/qr/generate-store` - Generate and store QR code

### Admin
- `GET /api/v1/admin/stats` - File statistics
- `POST /api/v1/admin/cleanup` - Clean orphaned files
- `POST /api/v1/admin/bulk-delete` - Bulk delete files (max 100)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | Environment |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `REDIS_URL` | Yes | - | Redis connection string |
| `AWS_ACCESS_KEY_ID` | Yes | - | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | - | AWS secret key |
| `AWS_REGION` | Yes | us-east-1 | AWS region |
| `S3_BUCKET` | Yes | - | S3 bucket name |
| `CLAMAV_HOST` | No | - | ClamAV host for virus scanning |
| `JWT_SECRET` | Yes | - | JWT signing secret |
| `LOG_LEVEL` | No | info | Log level (debug, info, warn, error) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       API Gateway                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      File Service                           │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │  Routes   │──│Controllers│──│ Services  │               │
│  └───────────┘  └───────────┘  └───────────┘               │
│       │              │              │                       │
│       ▼              ▼              ▼                       │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │Middleware │  │   Models  │  │  Storage  │               │
│  │• Auth     │  │• File     │  │• S3       │               │
│  │• RateLimit│  │           │  │• Local    │               │
│  │• Idemp.   │  │           │  │           │               │
│  └───────────┘  └───────────┘  └───────────┘               │
└─────────────────────────────────────────────────────────────┘
        │                │                │
        ▼                ▼                ▼
   PostgreSQL         Redis             S3
```

## Security Features

- **Authentication**: JWT-based authentication via API Gateway
- **Multi-Tenancy**: Row-Level Security (RLS) with FORCE enabled
- **Rate Limiting**: Redis-backed rate limiting per tenant
- **Input Validation**: Fastify JSON Schema validation on all routes
- **XSS Prevention**: SVG watermark text sanitization
- **Virus Scanning**: Optional ClamAV integration
- **Circuit Breakers**: Protects against S3/ClamAV failures

## Idempotency

Upload operations support the `Idempotency-Key` header for safe retries:

```bash
curl -X POST /api/v1/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: unique-upload-id-123" \
  -H "Content-Type: application/json" \
  -d '{"filename": "image.jpg", "mimeType": "image/jpeg"}'
```

Duplicate requests with the same key return the cached response.

## Circuit Breaker

The service uses circuit breakers for external dependencies:

| Circuit | Failure Threshold | Recovery Timeout |
|---------|-------------------|------------------|
| S3 | 5 failures | 60 seconds |
| ClamAV | 3 failures | 30 seconds |
| PostgreSQL | 5 failures | 30 seconds |

## Database Migrations

```bash
# Run all pending migrations
npm run migrate

# Rollback last migration
npm run migrate:rollback

# Check migration status
npm run migrate:status
```

## Development

### Running Tests

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Building

```bash
npm run build
```

## Docker

```bash
# Build image
docker build -t file-service .

# Run container
docker run -p 3000:3000 --env-file .env file-service
```

## Kubernetes

Health check endpoints are designed for K8s probes:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5

startupProbe:
  httpGet:
    path: /health/startup
    port: 3000
  initialDelaySeconds: 0
  periodSeconds: 5
  failureThreshold: 30
```

## Troubleshooting

### Common Issues

**S3 Connection Failures**
- Check AWS credentials and region
- Verify bucket exists and has correct permissions
- Check circuit breaker state at `/health/metrics`

**Database Connection Issues**
- Verify DATABASE_URL is correct
- Check PostgreSQL is running and accessible
- Ensure migrations have been run

**Rate Limiting**
- Check Redis connection
- Verify tenant ID is being passed correctly

## License

Proprietary - TicketToken Platform
