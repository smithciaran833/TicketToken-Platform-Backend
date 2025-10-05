# COMPLETE DATABASE ANALYSIS: file-service
Generated: Thu Oct  2 15:07:50 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/health.routes.ts
```typescript
import { Router } from 'express';
import { pool } from '../config/database';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'file-service' });
});

router.get('/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'file-service' 
    });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'file-service'
    });
  }
});

export default router;
```

### FILE: src/config/database.config.ts
```typescript
import { Pool } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

export async function connectDatabase(): Promise<void> {
  try {
    const dbUrl = process.env.DATABASE_URL;
    logger.info('Attempting database connection...');
    logger.debug(`Connection string: ${dbUrl?.replace(/:[^:@]+@/, ':****@')}`); // Log URL with hidden password
    
    pool = new Pool({
      connectionString: dbUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Test connection
    await pool.query('SELECT 1');
    logger.info('Database connection established');
  } catch (error: any) {
    logger.error('Database connection failed:', error);
    logger.error('Error code:', error.code);
    
    // In development, show helpful message
    if (process.env.NODE_ENV === 'development') {
      logger.info('Try connecting manually: psql -h localhost -p 5432 -U postgres -d tickettoken_db');
      logger.info('Then update DATABASE_URL in .env.development with the working password');
    }
    throw error;
  }
}

export function getPool(): Pool | null {
  return pool;
}

export function hasDatabase(): boolean {
  return pool !== null;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
  }
}
```

### FILE: src/config/constants.ts
```typescript
export const FILE_CONSTANTS = {
  // Size limits in bytes
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE_MB) * 1024 * 1024,
  MAX_IMAGE_SIZE: Number(process.env.MAX_IMAGE_SIZE_MB) * 1024 * 1024,
  MAX_VIDEO_SIZE: Number(process.env.MAX_VIDEO_SIZE_MB) * 1024 * 1024,
  MAX_DOCUMENT_SIZE: Number(process.env.MAX_DOCUMENT_SIZE_MB) * 1024 * 1024,
  CHUNK_SIZE: Number(process.env.CHUNK_SIZE_MB) * 1024 * 1024,
  
  // Thumbnail sizes
  THUMBNAIL_SIZES: {
    small: { width: 150, height: 150 },
    medium: { width: 300, height: 300 },
    large: { width: 600, height: 600 }
  },
  
  // Allowed MIME types
  ALLOWED_IMAGE_TYPES: process.env.ALLOWED_IMAGE_TYPES?.split(',') || [],
  ALLOWED_DOCUMENT_TYPES: process.env.ALLOWED_DOCUMENT_TYPES?.split(',') || [],
  ALLOWED_VIDEO_TYPES: process.env.ALLOWED_VIDEO_TYPES?.split(',') || [],
  
  // Storage paths
  UPLOAD_PATH: process.env.LOCAL_STORAGE_PATH || './uploads',
  TEMP_PATH: process.env.TEMP_STORAGE_PATH || './temp',
  
  // File status
  FILE_STATUS: {
    UPLOADING: 'uploading',
    PROCESSING: 'processing',
    READY: 'ready',
    FAILED: 'failed',
    DELETED: 'deleted'
  },
  
  // Entity types that can own files
  ENTITY_TYPES: {
    VENUE: 'venue',
    EVENT: 'event',
    USER: 'user',
    TICKET: 'ticket'
  }
};

export const ERROR_MESSAGES = {
  FILE_TOO_LARGE: 'File size exceeds maximum allowed size',
  INVALID_FILE_TYPE: 'File type is not allowed',
  UPLOAD_FAILED: 'Failed to upload file',
  FILE_NOT_FOUND: 'File not found',
  UNAUTHORIZED: 'Unauthorized to access this file',
  PROCESSING_FAILED: 'Failed to process file'
};
```

### FILE: src/config/database.ts
```typescript
import { Pool } from 'pg';
import knex from 'knex';

export const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

export const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  }
});
```

### FILE: src/constants/file-status.ts
```typescript
export const FileStatus = {
  UPLOADING: 'uploading' as const,
  PROCESSING: 'processing' as const,
  READY: 'ready' as const,
  FAILED: 'failed' as const,
  DELETED: 'deleted' as const
};
```

### FILE: src/storage/providers/storage.provider.ts
```typescript
export interface StorageResult {
  key: string;
  storageUrl: string;
  publicUrl?: string;
  provider: string;
  bucket?: string;
}

export interface StorageProvider {
  upload(file: Buffer, key: string, options?: any): Promise<StorageResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
}
```

### FILE: src/storage/providers/s3.provider.ts
```typescript
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { StorageProvider, StorageResult } from './storage.provider';
import { logger } from '../../utils/logger';
import { Readable } from 'stream';

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  cdnDomain?: string;
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucketName: string;
  private cdnDomain?: string;

  constructor(config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
    this.bucketName = config.bucketName;
    this.cdnDomain = config.cdnDomain;
  }

  async upload(file: Buffer, key: string, options?: any): Promise<StorageResult> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file,
        ContentType: options?.mimeType || 'application/octet-stream',
        CacheControl: options?.cacheControl || 'max-age=31536000',
        Metadata: options?.metadata || {}
      });

      await this.client.send(command);
      
      const publicUrl = this.cdnDomain 
        ? `https://${this.cdnDomain}/${key}`
        : `https://${this.bucketName}.s3.amazonaws.com/${key}`;

      logger.debug(`File uploaded to S3: ${key}`);

      return {
        key,
        storageUrl: `s3://${this.bucketName}/${key}`,
        publicUrl,
        provider: 's3',
        bucket: this.bucketName
      };
    } catch (error) {
      logger.error('S3 upload failed:', error);
      throw error;
    }
  }

  async uploadStream(stream: Readable, key: string, options?: any): Promise<StorageResult> {
    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: stream,
          ContentType: options?.mimeType || 'application/octet-stream'
        },
        queueSize: 4,
        partSize: 5 * 1024 * 1024, // 5MB chunks
        leavePartsOnError: false
      });

      upload.on('httpUploadProgress', (progress) => {
        logger.debug(`Upload progress: ${progress.loaded}/${progress.total} bytes`);
      });

      await upload.done();

      const publicUrl = this.cdnDomain 
        ? `https://${this.cdnDomain}/${key}`
        : `https://${this.bucketName}.s3.amazonaws.com/${key}`;

      return {
        key,
        storageUrl: `s3://${this.bucketName}/${key}`,
        publicUrl,
        provider: 's3',
        bucket: this.bucketName
      };
    } catch (error) {
      logger.error('S3 stream upload failed:', error);
      throw error;
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const response = await this.client.send(command);
      const stream = response.Body as Readable;
      
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      logger.error('S3 download failed:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.client.send(command);
      logger.debug(`File deleted from S3: ${key}`);
    } catch (error) {
      logger.error('S3 delete failed:', error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }

  getUrl(key: string): string {
    return this.cdnDomain 
      ? `https://${this.cdnDomain}/${key}`
      : `https://${this.bucketName}.s3.amazonaws.com/${key}`;
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async getUploadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }
}
```

### FILE: src/controllers/image.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import sharp from 'sharp';
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';

export class ImageController {
  async resize(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { width, height, fit } = request.body as any;
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      const resized = await sharp(buffer)
        .resize(width, height, {
          fit: fit || 'cover',
          position: 'center'
        })
        .toBuffer();
      
      const newPath = file.storagePath.replace(/\.[^.]+$/, `_${width}x${height}.jpg`);
      const result = await storageService.upload(resized, newPath);
      
      reply.send({
        success: true,
        url: result.publicUrl,
        width,
        height
      });
      
    } catch (error: any) {
      logger.error('Resize failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async crop(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { x, y, width, height } = request.body as any;
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      const cropped = await sharp(buffer)
        .extract({ left: x, top: y, width, height })
        .toBuffer();
      
      const newPath = file.storagePath.replace(/\.[^.]+$/, `_crop_${width}x${height}.jpg`);
      const result = await storageService.upload(cropped, newPath);
      
      reply.send({
        success: true,
        url: result.publicUrl
      });
      
    } catch (error: any) {
      logger.error('Crop failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async rotate(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { angle } = request.body as { angle: number };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      const rotated = await sharp(buffer)
        .rotate(angle)
        .toBuffer();
      
      const newPath = file.storagePath.replace(/\.[^.]+$/, `_rot${angle}.jpg`);
      const result = await storageService.upload(rotated, newPath);
      
      reply.send({
        success: true,
        url: result.publicUrl,
        angle
      });
      
    } catch (error: any) {
      logger.error('Rotate failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async watermark(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { text, position } = request.body as any;
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      const metadata = await sharp(buffer).metadata();
      
      // Create watermark SVG
      const watermarkSVG = Buffer.from(`
        <svg width="${metadata.width}" height="${metadata.height}">
          <text x="50%" y="50%" 
                font-family="Arial" 
                font-size="48" 
                fill="white" 
                fill-opacity="0.5"
                text-anchor="middle"
                transform="rotate(-45 ${metadata.width!/2} ${metadata.height!/2})">
            ${text || 'WATERMARK'}
          </text>
        </svg>
      `);
      
      const watermarked = await sharp(buffer)
        .composite([{
          input: watermarkSVG,
          blend: 'over'
        }])
        .toBuffer();
      
      const newPath = file.storagePath.replace(/\.[^.]+$/, '_watermark.jpg');
      const result = await storageService.upload(watermarked, newPath);
      
      reply.send({
        success: true,
        url: result.publicUrl
      });
      
    } catch (error: any) {
      logger.error('Watermark failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async getMetadata(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      const metadata = await sharp(buffer).metadata();
      
      // Get image metadata from database
      const pool = await import('../config/database.config').then(m => m.getPool());
      const dbMetadata = await pool?.query(
        'SELECT * FROM image_metadata WHERE file_id = $1',
        [id]
      );
      
      reply.send({
        file: metadata,
        stored: dbMetadata?.rows[0] || null
      });
      
    } catch (error: any) {
      logger.error('Get metadata failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
}

export const imageController = new ImageController();
```

### FILE: src/controllers/admin.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import { auditService } from '@tickettoken/shared/services/audit.service';

export class AdminController {
  async getStats(request: FastifyRequest, reply: FastifyReply) {
    try {
      const pool = getPool();
      if (!pool) {
        return reply.status(500).send({ error: 'Database not available' });
      }

      // Log admin action
      await auditService.logAdminAction(
        'file-service',
        'admin.getStats',
        (request as any).user?.id || 'system',
        'statistics',
        {
          actionType: 'ACCESS',
          userRole: (request as any).user?.role,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string
        }
      );

      // Get file statistics
      const stats = await pool.query(`
        SELECT
          COUNT(*) as total_files,
          SUM(size_bytes) as total_bytes,
          COUNT(DISTINCT uploaded_by) as unique_users,
          COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_files,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
          COUNT(CASE WHEN mime_type LIKE 'image/%' THEN 1 END) as images,
          COUNT(CASE WHEN mime_type LIKE 'video/%' THEN 1 END) as videos,
          COUNT(CASE WHEN mime_type LIKE '%pdf%' THEN 1 END) as pdfs
        FROM files
        WHERE deleted_at IS NULL
      `);

      // Get storage usage by entity
      const entityStats = await pool.query(`
        SELECT
          entity_type,
          COUNT(*) as file_count,
          SUM(size_bytes) as total_bytes
        FROM files
        WHERE deleted_at IS NULL AND entity_type IS NOT NULL
        GROUP BY entity_type
      `);

      // Get recent uploads
      const recentUploads = await pool.query(`
        SELECT id, filename, mime_type, size_bytes, created_at
        FROM files
        ORDER BY created_at DESC
        LIMIT 10
      `);

      reply.send({
        overview: stats.rows[0],
        byEntity: entityStats.rows,
        recentFiles: recentUploads.rows
      });

    } catch (error) {
      logger.error('Failed to get stats:', error);
      
      // Log failure
      await auditService.logAdminAction(
        'file-service',
        'admin.getStats',
        (request as any).user?.id || 'system',
        'statistics',
        {
          actionType: 'ACCESS',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      
      reply.status(500).send({ error: 'Failed to get statistics' });
    }
  }

  async cleanupOrphaned(request: FastifyRequest, reply: FastifyReply) {
    try {
      const pool = getPool();
      if (!pool) {
        return reply.status(500).send({ error: 'Database not available' });
      }

      // Find orphaned files (in DB but not on disk)
      const files = await pool.query(`
        SELECT id, storage_path
        FROM files
        WHERE status = 'ready' AND deleted_at IS NULL
      `);

      let cleaned = 0;
      let failed = 0;
      const cleanedFileIds: string[] = [];

      for (const file of files.rows) {
        const exists = await storageService.exists(file.storage_path);
        if (!exists) {
          // Mark as deleted if file doesn't exist
          await pool.query(
            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
            [file.id]
          );
          cleanedFileIds.push(file.id);
          cleaned++;
        }
      }

      // Clean up temp directory
      const tempDir = './temp';
      const tempFiles = await fs.readdir(tempDir).catch(() => []);
      const now = Date.now();
      const tempFilesCleaned: string[] = [];

      for (const file of tempFiles) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);

        // Delete files older than 24 hours
        if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
          await fs.unlink(filePath).catch(() => {});
          tempFilesCleaned.push(file);
          cleaned++;
        }
      }

      // Log admin cleanup action
      await auditService.logAdminAction(
        'file-service',
        'admin.cleanupOrphaned',
        (request as any).user?.id || 'system',
        'cleanup',
        {
          actionType: 'DELETE',
          userRole: (request as any).user?.role,
          metadata: {
            orphanedFiles: cleanedFileIds,
            tempFilesCleaned,
            totalCleaned: cleaned
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string
        }
      );

      reply.send({
        success: true,
        orphanedFiles: cleaned,
        tempFilesCleaned: tempFiles.length
      });

    } catch (error) {
      logger.error('Cleanup failed:', error);
      
      // Log failure
      await auditService.logAdminAction(
        'file-service',
        'admin.cleanupOrphaned',
        (request as any).user?.id || 'system',
        'cleanup',
        {
          actionType: 'DELETE',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      
      reply.status(500).send({ error: 'Cleanup failed' });
    }
  }

  async bulkDelete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { fileIds } = request.body as { fileIds: string[] };

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return reply.status(400).send({ error: 'No file IDs provided' });
      }

      const pool = getPool();
      if (!pool) {
        return reply.status(500).send({ error: 'Database not available' });
      }

      // Get file info before deletion for audit
      const filesBeforeDelete = await pool.query(
        'SELECT id, filename, size_bytes FROM files WHERE id = ANY($1)',
        [fileIds]
      );

      // Soft delete files
      const result = await pool.query(
        'UPDATE files SET deleted_at = NOW() WHERE id = ANY($1) RETURNING id',
        [fileIds]
      );

      // Log bulk delete action
      await auditService.logAdminAction(
        'file-service',
        'admin.bulkDelete',
        (request as any).user?.id || 'system',
        'files',
        {
          actionType: 'DELETE',
          userRole: (request as any).user?.role,
          previousValue: filesBeforeDelete.rows,
          metadata: {
            requestedFileIds: fileIds,
            deletedCount: result.rowCount,
            deletedFileIds: result.rows.map((r: any) => r.id)
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string
        }
      );

      reply.send({
        success: true,
        deleted: result.rowCount
      });

    } catch (error) {
      logger.error('Bulk delete failed:', error);
      
      // Log failure
      await auditService.logAdminAction(
        'file-service',
        'admin.bulkDelete',
        (request as any).user?.id || 'system',
        'files',
        {
          actionType: 'DELETE',
          success: false,
          metadata: {
            requestedFileIds: (request.body as any).fileIds
          },
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      
      reply.status(500).send({ error: 'Bulk delete failed' });
    }
  }

  // New endpoint to view audit logs
  async getAuditLogs(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = request.query as any;
      
      // Log audit log access
      await auditService.logAdminAction(
        'file-service',
        'admin.getAuditLogs',
        (request as any).user?.id || 'system',
        'audit_logs',
        {
          actionType: 'ACCESS',
          userRole: (request as any).user?.role,
          metadata: { query }
        }
      );

      const logs = await auditService.getAuditLogs({
        service: query.service || 'file-service',
        userId: query.userId,
        resourceType: query.resourceType,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        limit: parseInt(query.limit) || 50,
        offset: parseInt(query.offset) || 0
      });

      reply.send({
        success: true,
        logs,
        count: logs.length
      });

    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      reply.status(500).send({ error: 'Failed to get audit logs' });
    }
  }
}

export const adminController = new AdminController();
```

### FILE: src/controllers/upload.controller.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { s3Storage } from '../services/storage.s3';
import { antivirusService } from '../services/antivirus.service';
import { logger } from '../utils/logger';
import { db } from '../config/database';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf'];

interface UploadUrlBody {
  fileName: string;
  contentType: string;
}

interface ConfirmUploadParams {
  fileKey: string;
}

interface DeleteFileParams {
  fileId: string;
}

// Extend the UploadOptions interface locally to include what S3StorageService expects
interface S3UploadOptions {
  contentType: string;
  maxSize?: number;
  allowedTypes?: string[];
  expiresIn?: number;
  generateThumbnail?: boolean;
  scanForVirus?: boolean;
  entityType?: string;
  entityId?: string;
  isPublic?: boolean;
  metadata?: any;
  tags?: string[];
}

export class UploadController {
  /**
   * Generate signed URL for file upload
   */
  async generateUploadUrl(request: FastifyRequest<{ Body: UploadUrlBody }>, reply: FastifyReply) {
    try {
      const { fileName, contentType } = request.body;
      const userId = (request as any).user?.id || 'anonymous';

      // Validate file type
      const allowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];
      if (!allowedTypes.includes(contentType)) {
        return reply.status(400).send({
          error: 'Invalid file type'
        });
      }

      // Generate signed URL with correct parameters including contentType
      const options: S3UploadOptions = {
        contentType,
        maxSize: MAX_FILE_SIZE,
        allowedTypes,
        expiresIn: 300 // 5 minutes
      };
      
      const signedUrl = await s3Storage.generateSignedUploadUrl(userId, options as any);

      // Store upload record - Use proper Knex syntax
      await db('file_uploads').insert({
        user_id: userId,
        file_key: signedUrl.fileKey,
        file_name: fileName,
        content_type: contentType,
        status: 'pending',
        expires_at: signedUrl.expiresAt
      });

      return reply.send({
        uploadUrl: signedUrl.uploadUrl,
        fileKey: signedUrl.fileKey,
        expiresAt: signedUrl.expiresAt
      });
    } catch (error: any) {
      logger.error('Failed to generate upload URL:', error);
      return reply.status(500).send({
        error: 'Failed to generate upload URL'
      });
    }
  }

  /**
   * Confirm file upload completion
   */
  async confirmUpload(request: FastifyRequest<{ Params: ConfirmUploadParams }>, reply: FastifyReply) {
    try {
      const { fileKey } = request.params;
      const userId = (request as any).user?.id || 'anonymous';

      // Get upload record - Use proper Knex syntax
      const upload = await db('file_uploads')
        .where({ file_key: fileKey, user_id: userId, status: 'pending' })
        .first();

      if (!upload) {
        return reply.status(404).send({ error: 'Upload not found' });
      }

      // Update status - Use proper Knex syntax
      await db('file_uploads')
        .where({ id: upload.id })
        .update({ 
          status: 'processing',
          updated_at: db.fn.now()
        });

      // Start processing
      await this.processFile(upload.id, fileKey);

      return reply.send({
        message: 'Upload confirmed',
        fileId: upload.id
      });
    } catch (error: any) {
      logger.error('Failed to confirm upload:', error);
      return reply.status(500).send({
        error: 'Failed to confirm upload'
      });
    }
  }

  /**
   * Process uploaded file
   */
  private async processFile(fileId: string, fileKey: string) {
    try {
      // Note: S3StorageService doesn't have a download/getObject method
      // We'll need to add it or use the AWS SDK directly
      // For now, skip virus scanning
      
      // Update status to ready - Use proper Knex syntax
      await db('file_uploads')
        .where({ id: fileId })
        .update({
          status: 'ready',
          updated_at: db.fn.now()
        });

      // Clear cache
      await serviceCache.delete(`file:${fileId}`);
    } catch (error: any) {
      logger.error('File processing failed:', error);
      await db('file_uploads')
        .where({ id: fileId })
        .update({
          status: 'failed',
          processing_error: error.message,
          updated_at: db.fn.now()
        });
    }
  }

  /**
   * Delete file
   */
  async deleteFile(request: FastifyRequest<{ Params: DeleteFileParams }>, reply: FastifyReply) {
    try {
      const { fileId } = request.params;
      const userId = (request as any).user?.id || 'anonymous';

      // Get file record - Use proper Knex syntax
      const upload = await db('file_uploads')
        .where({ id: fileId, user_id: userId })
        .first();

      if (!upload) {
        return reply.status(404).send({ error: 'File not found' });
      }

      // Delete from storage - Use the correct method name
      await s3Storage.deleteFile(upload.file_key);

      // Update database - Use proper Knex syntax
      await db('file_uploads')
        .where({ id: fileId })
        .update({
          status: 'deleted',
          deleted_at: db.fn.now()
        });

      return reply.send({ message: 'File deleted successfully' });
    } catch (error: any) {
      logger.error('Failed to delete file:', error);
      return reply.status(500).send({
        error: 'Failed to delete file'
      });
    }
  }
}
```

### FILE: src/controllers/video.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { fileModel } from '../models/file.model';
import { videoProcessor } from '../processors/video/video.processor';
import { logger } from '../utils/logger';

export class VideoController {
  async getPreview(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      // Get video metadata from database
      const pool = await import('../config/database.config').then(m => m.getPool());
      const result = await pool?.query(
        'SELECT * FROM video_metadata WHERE file_id = $1',
        [id]
      );
      
      if (!result?.rows[0]) {
        // Process video if not yet processed
        await videoProcessor.processVideo(id);
      }
      
      reply.send({
        metadata: result?.rows[0] || {},
        thumbnails: [
          file.storagePath.replace(/\.[^.]+$/, '_thumb_1.jpg'),
          file.storagePath.replace(/\.[^.]+$/, '_thumb_2.jpg'),
          file.storagePath.replace(/\.[^.]+$/, '_thumb_3.jpg')
        ]
      });
      
    } catch (error: any) {
      logger.error('Video preview failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async transcode(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { format, quality } = request.body as any;
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      // Add to processing queue
      const pool = await import('../config/database.config').then(m => m.getPool());
      await pool?.query(
        `INSERT INTO file_processing_queue (file_id, operation, priority) 
         VALUES ($1, $2, $3)`,
        [id, `transcode_${format}_${quality}`, 5]
      );
      
      reply.send({
        success: true,
        message: 'Video transcoding queued',
        jobId: id,
        format,
        quality
      });
      
    } catch (error: any) {
      logger.error('Transcode failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async getMetadata(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      const pool = await import('../config/database.config').then(m => m.getPool());
      const result = await pool?.query(
        'SELECT * FROM video_metadata WHERE file_id = $1',
        [id]
      );
      
      if (!result?.rows[0]) {
        return reply.status(404).send({ error: 'Video metadata not found' });
      }
      
      reply.send(result.rows[0]);
      
    } catch (error: any) {
      logger.error('Get video metadata failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
}

export const videoController = new VideoController();
```

### FILE: src/controllers/document.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { documentProcessor } from '../processors/document/document.processor';
import { logger } from '../utils/logger';
import pdf from 'pdf-parse';

export class DocumentController {
  async getPreview(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      if (file.mimeType === 'application/pdf') {
        const data = await pdf(buffer);
        reply.send({
          text: data.text.substring(0, 1000),
          pages: data.numpages,
          info: data.info
        });
      } else {
        reply.send({
          text: buffer.toString('utf8').substring(0, 1000)
        });
      }
      
    } catch (error: any) {
      logger.error('Document preview failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async getPage(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id, page } = request.params as { id: string; page: string };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      if (file.mimeType !== 'application/pdf') {
        return reply.status(400).send({ error: 'Not a PDF file' });
      }
      
      // For full implementation, would extract specific page
      // This is simplified version
      const buffer = await storageService.download(file.storagePath);
      const data = await pdf(buffer);
      
      reply.send({
        page: parseInt(page),
        totalPages: data.numpages,
        text: `Page ${page} content would be extracted here`
      });
      
    } catch (error: any) {
      logger.error('Get page failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async convertFormat(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { format } = request.body as { format: string };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      // Simplified - real implementation would use LibreOffice or similar
      reply.send({
        success: true,
        message: `Conversion to ${format} would be processed here`,
        originalFormat: file.mimeType,
        targetFormat: format
      });
      
    } catch (error: any) {
      logger.error('Convert format failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async extractText(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      let text = '';
      if (file.mimeType === 'application/pdf') {
        const data = await pdf(buffer);
        text = data.text;
      } else if (file.mimeType.includes('text')) {
        text = buffer.toString('utf8');
      }
      
      reply.send({ text, length: text.length });
      
    } catch (error: any) {
      logger.error('Extract text failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
}

export const documentController = new DocumentController();
```

### FILE: src/controllers/health.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database.config';

export class HealthController {
  async check(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Check database
      const pool = getPool();
      let dbHealthy = false;
      
      if (pool) {
        await pool.query('SELECT 1');
        dbHealthy = true;
      }
      
      return reply.send({
        status: 'healthy',
        service: 'file-service',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbHealthy ? 'healthy' : 'unavailable'
        }
      });
      
    } catch (error) {
      return reply.status(503).send({
        status: 'unhealthy',
        service: 'file-service',
        timestamp: new Date().toISOString()
      });
    }
  }
}

export const healthController = new HealthController();
```

### FILE: src/models/file.model.ts
```typescript
import { getPool } from '../config/database.config';
import { FileRecord, FileStatus } from '../types/file.types';
import { logger } from '../utils/logger';

export class FileModel {
  async create(data: Partial<FileRecord>): Promise<FileRecord> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      INSERT INTO files (
        filename, original_filename, mime_type, extension,
        storage_provider, bucket_name, storage_path, cdn_url,
        size_bytes, hash_sha256, uploaded_by, entity_type, entity_id,
        is_public, access_level, status, metadata, tags
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      ) RETURNING *
    `;

    const values = [
      data.filename || data.file_name,
      data.original_filename || data.originalFilename,
      data.mime_type || data.mimeType || data.content_type,
      data.extension,
      data.storage_provider || 'local',
      data.bucket_name,
      data.storage_path || data.storagePath || data.file_key,
      data.cdn_url || data.cdnUrl,
      data.size_bytes || data.sizeBytes || data.file_size,
      data.hash_sha256 || data.hashSha256,
      data.uploaded_by || data.uploadedBy || data.user_id,
      data.entity_type || data.entityType,
      data.entity_id || data.entityId,
      data.is_public !== undefined ? data.is_public : (data.isPublic || false),
      data.access_level || data.accessLevel || 'private',
      data.status || 'uploading',
      JSON.stringify(data.metadata || {}),
      data.tags || []
    ];

    try {
      const result = await pool.query(query, values);
      return this.mapRowToFile(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create file record:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<FileRecord | null> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = 'SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToFile(result.rows[0]);
  }

  async updateStatus(id: string, status: FileStatus, error?: string): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      UPDATE files
      SET status = $2, processing_error = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await pool.query(query, [id, status, error]);
  }

  async updateCdnUrl(id: string, cdnUrl: string): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      UPDATE files
      SET cdn_url = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await pool.query(query, [id, cdnUrl]);
  }

  async findByEntity(entityType: string, entityId: string): Promise<FileRecord[]> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      SELECT * FROM files
      WHERE entity_type = $1 AND entity_id = $2 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [entityType, entityId]);
    return result.rows.map(row => this.mapRowToFile(row));
  }

  private mapRowToFile(row: any): FileRecord {
    return {
      id: row.id,
      // Required snake_case properties
      filename: row.filename,
      original_filename: row.original_filename,
      mime_type: row.mime_type,
      extension: row.extension,
      storage_provider: row.storage_provider,
      bucket_name: row.bucket_name,
      storage_path: row.storage_path,
      cdn_url: row.cdn_url,
      size_bytes: parseInt(row.size_bytes),
      hash_sha256: row.hash_sha256,
      uploaded_by: row.uploaded_by,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      is_public: row.is_public,
      access_level: row.access_level,
      status: row.status,
      processing_error: row.processing_error,
      metadata: row.metadata || {},
      tags: row.tags,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      
      // Backwards compatibility aliases (camelCase)
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      storagePath: row.storage_path,
      cdnUrl: row.cdn_url,
      sizeBytes: parseInt(row.size_bytes),
      hashSha256: row.hash_sha256,
      uploadedBy: row.uploaded_by,
      entityType: row.entity_type,
      entityId: row.entity_id,
      isPublic: row.is_public,
      accessLevel: row.access_level,
      file_name: row.filename,
      file_key: row.storage_path,
      content_type: row.mime_type,
      file_size: parseInt(row.size_bytes),
      user_id: row.uploaded_by
    };
  }
}

export const fileModel = new FileModel();
```

### FILE: src/processors/document/document.processor.ts
```typescript
import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import puppeteer from 'puppeteer';
import { logger } from '../../utils/logger';
import { fileModel } from '../../models/file.model';
import { storageService } from '../../storage/storage.service';

export class DocumentProcessor {
  async processDocument(fileId: string): Promise<void> {
    try {
      const file = await fileModel.findById(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      const buffer = await storageService.download(file.storagePath);

      if (file.mimeType === 'application/pdf') {
        await this.processPDF(fileId, buffer);
      } else if (file.mimeType.includes('word')) {
        await this.processWord(fileId, buffer);
      }

      await fileModel.updateStatus(fileId, 'ready');
      
    } catch (error) {
      logger.error(`Document processing failed for ${fileId}:`, error);
      await fileModel.updateStatus(fileId, 'failed', error.message);
    }
  }

  private async processPDF(fileId: string, buffer: Buffer): Promise<void> {
    try {
      const data = await pdf(buffer);
      
      await this.saveDocumentMetadata(fileId, {
        pageCount: data.numpages,
        text: data.text.substring(0, 5000), // First 5000 chars
        info: data.info
      });

      // Generate thumbnail of first page
      await this.generatePDFThumbnail(fileId, buffer);
      
    } catch (error) {
      logger.error('PDF processing failed:', error);
      throw error;
    }
  }

  private async processWord(fileId: string, buffer: Buffer): Promise<void> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      await this.saveDocumentMetadata(fileId, {
        text: result.value.substring(0, 5000),
        messages: result.messages
      });
      
    } catch (error) {
      logger.error('Word processing failed:', error);
      throw error;
    }
  }

  private async generatePDFThumbnail(fileId: string, buffer: Buffer): Promise<void> {
    const browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Convert PDF to image using puppeteer
      const base64 = buffer.toString('base64');
      await page.goto(`data:application/pdf;base64,${base64}`);
      
      const screenshot = await page.screenshot({ 
        type: 'jpeg',
        quality: 85,
        clip: { x: 0, y: 0, width: 600, height: 800 }
      });

      // Save thumbnail
      const file = await fileModel.findById(fileId);
      if (file) {
        const thumbPath = file.storagePath.replace(/\.[^.]+$/, '_thumb.jpg');
        await storageService.upload(screenshot, thumbPath);
      }
      
    } finally {
      await browser.close();
    }
  }

  private async saveDocumentMetadata(fileId: string, metadata: any): Promise<void> {
    const pool = await import('../../config/database.config').then(m => m.getPool());
    if (!pool) return;

    await pool.query(`
      INSERT INTO document_metadata (
        file_id, page_count, extracted_text
      ) VALUES ($1, $2, $3)
      ON CONFLICT (file_id) DO UPDATE SET
        page_count = $2, extracted_text = $3
    `, [fileId, metadata.pageCount || null, metadata.text || null]);
  }
}

export const documentProcessor = new DocumentProcessor();
```

### FILE: src/processors/image/watermark.processor.ts
```typescript
import sharp from 'sharp';
import { logger } from '../../utils/logger';

export interface WatermarkOptions {
  text?: string;
  imagePath?: string;
  position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity?: number;
  fontSize?: number;
  rotate?: number;
}

export class WatermarkProcessor {
  async addTextWatermark(
    imageBuffer: Buffer,
    options: WatermarkOptions
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    
    const fontSize = options.fontSize || Math.min(width, height) / 10;
    const opacity = options.opacity || 0.3;
    const rotate = options.rotate || -45;
    
    // Position calculation
    let x = width / 2;
    let y = height / 2;
    let anchor = 'middle';
    
    switch (options.position) {
      case 'top-left':
        x = fontSize;
        y = fontSize;
        anchor = 'start';
        break;
      case 'top-right':
        x = width - fontSize;
        y = fontSize;
        anchor = 'end';
        break;
      case 'bottom-left':
        x = fontSize;
        y = height - fontSize;
        anchor = 'start';
        break;
      case 'bottom-right':
        x = width - fontSize;
        y = height - fontSize;
        anchor = 'end';
        break;
    }
    
    const watermarkSVG = Buffer.from(`
      <svg width="${width}" height="${height}">
        <defs>
          <style>
            .watermark { 
              fill: white; 
              fill-opacity: ${opacity};
              font-family: Arial, sans-serif;
              font-size: ${fontSize}px;
              font-weight: bold;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            }
          </style>
        </defs>
        <text x="${x}" y="${y}" 
              class="watermark"
              text-anchor="${anchor}"
              transform="rotate(${rotate} ${x} ${y})">
          ${options.text || 'WATERMARK'}
        </text>
      </svg>
    `);
    
    return sharp(imageBuffer)
      .composite([{
        input: watermarkSVG,
        blend: 'over'
      }])
      .toBuffer();
  }
  
  async addImageWatermark(
    imageBuffer: Buffer,
    watermarkBuffer: Buffer,
    options: WatermarkOptions
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const watermarkMetadata = await sharp(watermarkBuffer).metadata();
    
    // Resize watermark to 20% of main image
    const watermarkWidth = Math.floor((metadata.width || 800) * 0.2);
    const resizedWatermark = await sharp(watermarkBuffer)
      .resize(watermarkWidth, null, { 
        withoutEnlargement: true 
      })
      .toBuffer();
    
    // Calculate position
    let left = 0;
    let top = 0;
    
    switch (options.position) {
      case 'top-left':
        left = 20;
        top = 20;
        break;
      case 'top-right':
        left = (metadata.width || 800) - watermarkWidth - 20;
        top = 20;
        break;
      case 'bottom-left':
        left = 20;
        top = (metadata.height || 600) - (watermarkMetadata.height || 100) - 20;
        break;
      case 'bottom-right':
        left = (metadata.width || 800) - watermarkWidth - 20;
        top = (metadata.height || 600) - (watermarkMetadata.height || 100) - 20;
        break;
      default: // center
        left = Math.floor(((metadata.width || 800) - watermarkWidth) / 2);
        top = Math.floor(((metadata.height || 600) - (watermarkMetadata.height || 100)) / 2);
    }
    
    return sharp(imageBuffer)
      .composite([{
        input: resizedWatermark,
        left,
        top,
        blend: 'over'
      }])
      .toBuffer();
  }
  
  async addPattern(imageBuffer: Buffer, pattern: string): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    
    // Create repeating pattern
    const patternSVG = Buffer.from(`
      <svg width="${width}" height="${height}">
        <defs>
          <pattern id="watermarkPattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <text x="100" y="100" 
                  fill="white" 
                  fill-opacity="0.1" 
                  font-size="20" 
                  text-anchor="middle"
                  transform="rotate(-45 100 100)">
              ${pattern}
            </text>
          </pattern>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#watermarkPattern)" />
      </svg>
    `);
    
    return sharp(imageBuffer)
      .composite([{
        input: patternSVG,
        blend: 'over'
      }])
      .toBuffer();
  }
}

export const watermarkProcessor = new WatermarkProcessor();
```

### FILE: src/processors/image/thumbnail.generator.ts
```typescript
import sharp from 'sharp';
import { logger } from '../../utils/logger';

export interface ThumbnailOptions {
  width: number;
  height: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export class ThumbnailGenerator {
  async generate(
    input: Buffer,
    options: ThumbnailOptions
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(input)
        .resize(options.width, options.height, {
          fit: options.fit || 'cover',
          position: 'centre',
          withoutEnlargement: true
        });

      // Apply format
      switch (options.format || 'jpeg') {
        case 'jpeg':
          pipeline = pipeline.jpeg({ 
            quality: options.quality || 85,
            progressive: true 
          });
          break;
        case 'png':
          pipeline = pipeline.png({ 
            quality: options.quality || 90,
            compressionLevel: 9 
          });
          break;
        case 'webp':
          pipeline = pipeline.webp({ 
            quality: options.quality || 85 
          });
          break;
      }

      return await pipeline.toBuffer();
      
    } catch (error) {
      logger.error('Thumbnail generation failed:', error);
      throw error;
    }
  }

  async generateSet(
    input: Buffer,
    sizes: Record<string, ThumbnailOptions>
  ): Promise<Record<string, Buffer>> {
    const results: Record<string, Buffer> = {};
    
    for (const [name, options] of Object.entries(sizes)) {
      results[name] = await this.generate(input, options);
    }
    
    return results;
  }
}

export const thumbnailGenerator = new ThumbnailGenerator();
```

### FILE: src/processors/image/image.processor.ts
```typescript
import sharp from 'sharp';
import { logger } from '../../utils/logger';
import { fileModel } from '../../models/file.model';
import { storageService } from '../../storage/storage.service';

export interface ImageProcessingOptions {
  generateThumbnails?: boolean;
  optimize?: boolean;
  extractMetadata?: boolean;
  generateBlurHash?: boolean;
}

export class ImageProcessor {
  private thumbnailSizes = {
    small: { width: 150, height: 150 },
    medium: { width: 300, height: 300 },
    large: { width: 600, height: 600 }
  };

  // SECURITY: Whitelist of allowed metadata fields
  private readonly ALLOWED_METADATA_FIELDS = [
    'width',
    'height',
    'aspect_ratio',
    'format',
    'thumbnail_small_url',
    'thumbnail_medium_url',
    'thumbnail_large_url',
    'space',
    'channels',
    'depth',
    'density',
    'has_alpha',
    'orientation'
  ];

  async processImage(fileId: string, buffer: Buffer): Promise<void> {
    try {
      logger.info(`Processing image: ${fileId}`);

      // Get file record
      const file = await fileModel.findById(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Process based on file type
      const tasks = [];

      // Always extract metadata
      tasks.push(this.extractMetadata(fileId, buffer));

      // Generate thumbnails
      tasks.push(this.generateThumbnails(fileId, buffer, file.storagePath));

      // Optimize original
      tasks.push(this.optimizeImage(fileId, buffer, file.storagePath));

      await Promise.all(tasks);

      logger.info(`Image processing completed: ${fileId}`);

    } catch (error) {
      logger.error(`Image processing failed for ${fileId}:`, error);
      throw error;
    }
  }

  private async extractMetadata(fileId: string, buffer: Buffer): Promise<void> {
    const metadata = await sharp(buffer).metadata();

    await this.saveImageMetadata(fileId, {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format,
      space: metadata.space,
      channels: metadata.channels,
      depth: metadata.depth,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation
    });
  }

  private async generateThumbnails(fileId: string, buffer: Buffer, originalPath: string): Promise<void> {
    const thumbnailUrls: any = {};

    for (const [size, dimensions] of Object.entries(this.thumbnailSizes)) {
      const thumbnail = await sharp(buffer)
        .resize(dimensions.width, dimensions.height, {
          fit: 'cover',
          position: 'centre'
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      // Generate thumbnail path
      const thumbPath = originalPath.replace(/\.[^.]+$/, `_${size}.jpg`);

      // Save thumbnail
      const result = await storageService.upload(thumbnail, thumbPath);
      thumbnailUrls[`thumbnail_${size}_url`] = result.publicUrl;
    }

    // Update database with thumbnail URLs
    await this.updateImageMetadata(fileId, thumbnailUrls);
  }

  private async optimizeImage(fileId: string, buffer: Buffer, originalPath: string): Promise<void> {
    const optimized = await sharp(buffer)
      .jpeg({ quality: 85, progressive: true, mozjpeg: true })
      .toBuffer();

    // Only save if smaller
    if (optimized.length < buffer.length) {
      const optimizedPath = originalPath.replace(/\.[^.]+$/, '_optimized.jpg');
      await storageService.upload(optimized, optimizedPath);
      logger.info(`Image optimized: ${fileId} (${Math.round((1 - optimized.length/buffer.length) * 100)}% reduction)`);
    }
  }

  private async saveImageMetadata(fileId: string, metadata: any): Promise<void> {
    const pool = await import('../../config/database.config').then(m => m.getPool());
    if (!pool) return;

    await pool.query(`
      INSERT INTO image_metadata (
        file_id, width, height, aspect_ratio, format
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (file_id) DO UPDATE SET
        width = $2, height = $3, aspect_ratio = $4, format = $5
    `, [fileId, metadata.width, metadata.height, metadata.width/metadata.height, metadata.format]);
  }

  private async updateImageMetadata(fileId: string, data: any): Promise<void> {
    const pool = await import('../../config/database.config').then(m => m.getPool());
    if (!pool) return;

    // SECURITY FIX: Validate column names against whitelist
    const validFields: string[] = [];
    const validValues: any[] = [];
    
    Object.keys(data).forEach(key => {
      if (this.ALLOWED_METADATA_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push(data[key]);
      }
    });

    if (validFields.length === 0) {
      logger.warn('No valid fields to update in image metadata');
      return;
    }

    const setClauses = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const values = [fileId, ...validValues];

    await pool.query(`
      UPDATE image_metadata SET ${setClauses} WHERE file_id = $1
    `, values);
  }
}

export const imageProcessor = new ImageProcessor();
```

### FILE: src/services/antivirus.service.ts
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { db } from '../config/database';

const execAsync = promisify(exec);

interface ScanResult {
  clean: boolean;
  threats: string[];
  scannedAt: Date;
  scanEngine: string;
  fileHash: string;
}

export class AntivirusService {
  private quarantinePath: string;
  private tempPath: string;

  constructor() {
    this.quarantinePath = process.env.QUARANTINE_PATH || '/var/quarantine';
    this.tempPath = process.env.TEMP_PATH || '/tmp/av-scan';
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  private ensureDirectories() {
    [this.quarantinePath, this.tempPath].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Scan file for viruses using ClamAV
   */
  async scanFile(filePath: string): Promise<ScanResult> {
    try {
      logger.info(`Starting AV scan for: ${filePath}`);

      // Calculate file hash for tracking
      const fileHash = await this.calculateFileHash(filePath);

      // Check if file was already scanned
      const existingScan = await this.checkExistingScan(fileHash);
      if (existingScan && existingScan.clean) {
        logger.info(`File already scanned and clean: ${fileHash}`);
        return existingScan;
      }

      // Run ClamAV scan
      const scanResult = await this.runClamAVScan(filePath);

      // Store scan result
      await this.storeScanResult(fileHash, scanResult);

      // If infected, quarantine the file
      if (!scanResult.clean) {
        await this.quarantineFile(filePath, fileHash, scanResult.threats);
      }

      return scanResult;
    } catch (error) {
      logger.error('AV scan failed:', error);
      throw new Error('Antivirus scan failed');
    }
  }

  /**
   * Run ClamAV scan on file
   */
  private async runClamAVScan(filePath: string): Promise<ScanResult> {
    try {
      // Use clamscan command
      const { stdout, stderr } = await execAsync(`clamscan --no-summary "${filePath}"`);
      
      const clean = !stdout.includes('FOUND');
      const threats: string[] = [];

      if (!clean) {
        // Parse threats from output
        const lines = stdout.split('\n');
        lines.forEach(line => {
          if (line.includes('FOUND')) {
            const threat = line.split(':')[1]?.replace('FOUND', '').trim();
            if (threat) threats.push(threat);
          }
        });
      }

      return {
        clean,
        threats,
        scannedAt: new Date(),
        scanEngine: 'ClamAV',
        fileHash: ''
      };
    } catch (error: any) {
      // If clamscan is not installed, use alternative or mock
      if (error.code === 127) {
        logger.warn('ClamAV not installed, using mock scanner');
        return this.mockScan(filePath);
      }
      throw error;
    }
  }

  /**
   * Mock scanner for development/testing
   */
  private async mockScan(filePath: string): Promise<ScanResult> {
    // Simulate virus detection for test files
    const fileName = path.basename(filePath);
    const isMalicious = fileName.includes('eicar') || fileName.includes('virus');

    return {
      clean: !isMalicious,
      threats: isMalicious ? ['Test.Virus.EICAR'] : [],
      scannedAt: new Date(),
      scanEngine: 'MockScanner',
      fileHash: await this.calculateFileHash(filePath)
    };
  }

  /**
   * Calculate SHA256 hash of file
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /**
   * Check if file was already scanned
   */
  private async checkExistingScan(fileHash: string): Promise<ScanResult | null> {
    try {
      const result = await db('av_scans')
        .where({ file_hash: fileHash, clean: true })
        .orderBy('scanned_at', 'desc')
        .first();

      if (result) {
        return {
          clean: result.clean,
          threats: result.threats || [],
          scannedAt: result.scanned_at,
          scanEngine: result.scan_engine,
          fileHash: result.file_hash
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to check existing scan:', error);
      return null;
    }
  }

  /**
   * Store scan result in database
   */
  private async storeScanResult(fileHash: string, result: ScanResult): Promise<void> {
    await db('av_scans').insert({
      file_hash: fileHash,
      clean: result.clean,
      threats: JSON.stringify(result.threats),
      scanned_at: result.scannedAt,
      scan_engine: result.scanEngine
    });
  }

  /**
   * Move infected file to quarantine
   */
  private async quarantineFile(
    filePath: string,
    fileHash: string,
    threats: string[]
  ): Promise<void> {
    const quarantinedPath = path.join(
      this.quarantinePath,
      `${fileHash}_${Date.now()}_infected`
    );

    // Move file to quarantine
    fs.renameSync(filePath, quarantinedPath);

    // Log quarantine action
    await db('quarantined_files').insert({
      original_path: filePath,
      quarantine_path: quarantinedPath,
      file_hash: fileHash,
      threats: JSON.stringify(threats),
      quarantined_at: new Date()
    });

    logger.warn(`File quarantined: ${filePath} -> ${quarantinedPath}`, { threats });
  }

  /**
   * Scan S3 file by downloading temporarily
   */
  async scanS3File(s3Url: string): Promise<ScanResult> {
    const tempFile = path.join(this.tempPath, `scan_${Date.now()}`);
    
    try {
      // Download file temporarily
      // Implementation depends on your S3 setup
      
      // Scan the file
      const result = await this.scanFile(tempFile);
      
      return result;
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
}

export const antivirusService = new AntivirusService();
```

### FILE: src/services/access-log.service.ts
```typescript
import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';

export class AccessLogService {
  async logAccess(
    fileId: string,
    accessType: 'view' | 'download' | 'share' | 'stream',
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    responseCode?: number,
    bytesSent?: number
  ): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    
    try {
      await pool.query(
        `INSERT INTO file_access_logs 
         (file_id, accessed_by, access_type, ip_address, user_agent, response_code, bytes_sent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [fileId, userId, accessType, ipAddress, userAgent, responseCode, bytesSent]
      );
    } catch (error) {
      logger.error('Failed to log file access:', error);
    }
  }
  
  async getAccessLogs(fileId: string, limit: number = 100): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT * FROM file_access_logs 
       WHERE file_id = $1 
       ORDER BY accessed_at DESC 
       LIMIT $2`,
      [fileId, limit]
    );
    
    return result.rows;
  }
  
  async getUserAccessHistory(userId: string, limit: number = 100): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT fal.*, f.filename, f.mime_type 
       FROM file_access_logs fal
       JOIN files f ON f.id = fal.file_id
       WHERE fal.accessed_by = $1 
       ORDER BY fal.accessed_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows;
  }
  
  async getFileAccessStats(fileId: string): Promise<any> {
    const pool = getPool();
    if (!pool) return null;
    
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_accesses,
        COUNT(DISTINCT accessed_by) as unique_users,
        COUNT(CASE WHEN access_type = 'download' THEN 1 END) as downloads,
        COUNT(CASE WHEN access_type = 'view' THEN 1 END) as views,
        COUNT(CASE WHEN access_type = 'share' THEN 1 END) as shares,
        SUM(bytes_sent) as total_bytes_sent,
        MAX(accessed_at) as last_accessed
       FROM file_access_logs 
       WHERE file_id = $1`,
      [fileId]
    );
    
    return result.rows[0];
  }
}

export const accessLogService = new AccessLogService();
```

### FILE: src/services/file-version.service.ts
```typescript
import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { fileModel } from '../models/file.model';
import { generateFileHash } from '../utils/file-helpers';
import { logger } from '../utils/logger';

export class FileVersionService {
  async createVersion(
    fileId: string,
    buffer: Buffer,
    changeDescription?: string,
    userId?: string
  ): Promise<number> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get current file
    const file = await fileModel.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }
    
    // Get latest version number
    const versionResult = await pool.query(
      'SELECT MAX(version_number) as max_version FROM file_versions WHERE file_id = $1',
      [fileId]
    );
    
    const nextVersion = (versionResult.rows[0].max_version || 0) + 1;
    
    // Save new version
    const versionPath = file.storagePath.replace(/\.[^.]+$/, `_v${nextVersion}.$1`);
    await storageService.upload(buffer, versionPath);
    
    // Create version record
    await pool.query(
      `INSERT INTO file_versions 
       (file_id, version_number, storage_path, size_bytes, hash_sha256, change_description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [fileId, nextVersion, versionPath, buffer.length, generateFileHash(buffer), changeDescription, userId]
    );
    
    logger.info(`Created version ${nextVersion} for file ${fileId}`);
    
    return nextVersion;
  }
  
  async getVersions(fileId: string): Promise<any[]> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    const result = await pool.query(
      'SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version_number DESC',
      [fileId]
    );
    
    return result.rows;
  }
  
  async restoreVersion(fileId: string, versionNumber: number): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get version
    const versionResult = await pool.query(
      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
      [fileId, versionNumber]
    );
    
    if (versionResult.rows.length === 0) {
      throw new Error('Version not found');
    }
    
    const version = versionResult.rows[0];
    
    // Get file
    const file = await fileModel.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }
    
    // Copy version to main file
    const buffer = await storageService.download(version.storage_path);
    await storageService.upload(buffer, file.storagePath);
    
    // Update file record
    await pool.query(
      'UPDATE files SET size_bytes = $1, hash_sha256 = $2, updated_at = NOW() WHERE id = $3',
      [version.size_bytes, version.hash_sha256, fileId]
    );
    
    logger.info(`Restored version ${versionNumber} for file ${fileId}`);
  }
  
  async deleteVersion(fileId: string, versionNumber: number): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get version
    const versionResult = await pool.query(
      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
      [fileId, versionNumber]
    );
    
    if (versionResult.rows.length === 0) {
      throw new Error('Version not found');
    }
    
    const version = versionResult.rows[0];
    
    // Delete from storage
    await storageService.delete(version.storage_path);
    
    // Delete record
    await pool.query(
      'DELETE FROM file_versions WHERE file_id = $1 AND version_number = $2',
      [fileId, versionNumber]
    );
    
    logger.info(`Deleted version ${versionNumber} for file ${fileId}`);
  }
}

export const fileVersionService = new FileVersionService();
```

### FILE: src/services/storage.s3.ts
```typescript
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface UploadOptions {
  contentType: string;
  maxSize: number;
  allowedTypes?: string[];
  expiresIn?: number;
}

interface SignedUrlResponse {
  uploadUrl: string;
  fileKey: string;
  expiresAt: Date;
}

export class S3StorageService {
  private s3: AWS.S3;
  private bucketName: string;
  private region: string;

  constructor() {
    this.bucketName = process.env.S3_BUCKET || 'tickettoken-files';
    this.region = process.env.AWS_REGION || 'us-east-1';
    
    this.s3 = new AWS.S3({
      region: this.region,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      signatureVersion: 'v4'
    });
  }

  /**
   * Generate a signed URL for secure file upload
   */
  async generateSignedUploadUrl(
    userId: string,
    options: UploadOptions
  ): Promise<SignedUrlResponse> {
    try {
      // Validate content type
      if (options.allowedTypes && !options.allowedTypes.includes(options.contentType)) {
        throw new Error(`Content type ${options.contentType} not allowed`);
      }

      // Generate unique file key
      const fileKey = `uploads/${userId}/${uuidv4()}-${Date.now()}`;
      const expiresIn = options.expiresIn || 300; // 5 minutes default

      // Create signed URL with conditions
      const params = {
        Bucket: this.bucketName,
        Key: fileKey,
        Expires: expiresIn,
        ContentType: options.contentType,
        Conditions: [
          ['content-length-range', 0, options.maxSize],
          ['starts-with', '$Content-Type', options.contentType.split('/')[0]]
        ],
        Metadata: {
          userId,
          uploadedAt: new Date().toISOString(),
          status: 'pending_scan'
        }
      };

      const uploadUrl = await this.s3.getSignedUrlPromise('putObject', params);

      logger.info(`Generated signed URL for user ${userId}, key: ${fileKey}`);

      return {
        uploadUrl,
        fileKey,
        expiresAt: new Date(Date.now() + expiresIn * 1000)
      };
    } catch (error) {
      logger.error('Failed to generate signed URL:', error);
      throw error;
    }
  }

  /**
   * Generate signed URL for secure download
   */
  async generateSignedDownloadUrl(
    fileKey: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const params = {
      Bucket: this.bucketName,
      Key: fileKey,
      Expires: expiresIn
    };

    return await this.s3.getSignedUrlPromise('getObject', params);
  }

  /**
   * Delete file from S3
   */
  async deleteFile(fileKey: string): Promise<void> {
    await this.s3.deleteObject({
      Bucket: this.bucketName,
      Key: fileKey
    }).promise();

    logger.info(`Deleted file: ${fileKey}`);
  }

  /**
   * Set lifecycle policy for automatic cleanup
   */
  async setupLifecyclePolicy(): Promise<void> {
    const policy = {
      Rules: [
        {
          Id: 'DeleteTempFiles',
          Status: 'Enabled',
          Prefix: 'temp/',
          Expiration: {
            Days: 1 // Delete temp files after 24 hours
          }
        },
        {
          Id: 'DeleteOldUploads',
          Status: 'Enabled',
          Prefix: 'uploads/',
          Expiration: {
            Days: 90 // Delete uploads after 90 days
          }
        },
        {
          Id: 'MoveToGlacier',
          Status: 'Enabled',
          Prefix: 'archive/',
          Transitions: [
            {
              Days: 30,
              StorageClass: 'GLACIER' // Archive old files to Glacier
            }
          ]
        }
      ]
    };

    await this.s3.putBucketLifecycleConfiguration({
      Bucket: this.bucketName,
      LifecycleConfiguration: policy
    }).promise();

    logger.info('Lifecycle policy configured');
  }
}

export const s3Storage = new S3StorageService();
```

### FILE: src/services/qr.service.ts
```typescript
export class QRService {
  async generateQR(data: string) {
    // Stub implementation
    return Buffer.from('QR_CODE_DATA');
  }
}

export const qrService = new QRService();
```

### FILE: src/services/file-search.service.ts
```typescript
import { getPool } from '../config/database.config';

export interface SearchFilters {
  filename?: string;
  mimeType?: string;
  entityType?: string;
  entityId?: string;
  uploadedBy?: string;
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  isPublic?: boolean;
}

export class FileSearchService {
  async search(filters: SearchFilters, limit: number = 100, offset: number = 0): Promise<any> {
    const pool = getPool();
    if (!pool) return { files: [], total: 0 };
    
    let query = 'SELECT * FROM files WHERE deleted_at IS NULL';
    const params: any[] = [];
    let paramCount = 0;
    
    if (filters.filename) {
      query += ` AND filename ILIKE $${++paramCount}`;
      params.push(`%${filters.filename}%`);
    }
    
    if (filters.mimeType) {
      query += ` AND mime_type LIKE $${++paramCount}`;
      params.push(`${filters.mimeType}%`);
    }
    
    if (filters.entityType) {
      query += ` AND entity_type = $${++paramCount}`;
      params.push(filters.entityType);
    }
    
    if (filters.entityId) {
      query += ` AND entity_id = $${++paramCount}`;
      params.push(filters.entityId);
    }
    
    if (filters.uploadedBy) {
      query += ` AND uploaded_by = $${++paramCount}`;
      params.push(filters.uploadedBy);
    }
    
    if (filters.tags && filters.tags.length > 0) {
      query += ` AND tags && $${++paramCount}`;
      params.push(filters.tags);
    }
    
    if (filters.minSize) {
      query += ` AND size_bytes >= $${++paramCount}`;
      params.push(filters.minSize);
    }
    
    if (filters.maxSize) {
      query += ` AND size_bytes <= $${++paramCount}`;
      params.push(filters.maxSize);
    }
    
    if (filters.startDate) {
      query += ` AND created_at >= $${++paramCount}`;
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ` AND created_at <= $${++paramCount}`;
      params.push(filters.endDate);
    }
    
    if (filters.status) {
      query += ` AND status = $${++paramCount}`;
      params.push(filters.status);
    }
    
    if (filters.isPublic !== undefined) {
      query += ` AND is_public = $${++paramCount}`;
      params.push(filters.isPublic);
    }
    
    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get paginated results
    query += ` ORDER BY created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    return {
      files: result.rows,
      total,
      limit,
      offset
    };
  }
  
  async searchByContent(searchText: string, limit: number = 100): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    // Search in document metadata
    const result = await pool.query(
      `SELECT f.*, dm.extracted_text 
       FROM files f
       JOIN document_metadata dm ON dm.file_id = f.id
       WHERE dm.extracted_text ILIKE $1
       AND f.deleted_at IS NULL
       ORDER BY f.created_at DESC
       LIMIT $2`,
      [`%${searchText}%`, limit]
    );
    
    return result.rows;
  }
  
  async getRecentFiles(limit: number = 10): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT * FROM files 
       WHERE deleted_at IS NULL 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }
  
  async getMostAccessed(limit: number = 10): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT f.*, COUNT(fal.id) as access_count
       FROM files f
       LEFT JOIN file_access_logs fal ON fal.file_id = f.id
       WHERE f.deleted_at IS NULL
       GROUP BY f.id
       ORDER BY access_count DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }
}

export const fileSearchService = new FileSearchService();
```

### FILE: src/services/image.service.ts
```typescript
import { imageProcessor } from '../processors/image/image.processor';
import { thumbnailGenerator } from '../processors/image/thumbnail.generator';
import { imageOptimizer } from '../processors/image/optimize.processor';
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';

export class ImageService {
  async processUploadedImage(fileId: string): Promise<void> {
    try {
      const file = await fileModel.findById(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Download original
      const buffer = await storageService.download(file.storagePath);
      
      // Process image
      await imageProcessor.processImage(fileId, buffer);
      
      // Update status
      await fileModel.updateStatus(fileId, 'ready');
      
      logger.info(`Image processing completed for ${fileId}`);
      
    } catch (error) {
      logger.error(`Image processing failed for ${fileId}:`, error);
      await fileModel.updateStatus(fileId, 'failed', error.message);
    }
  }

  async generateThumbnail(fileId: string, size: 'small' | 'medium' | 'large'): Promise<string> {
    const file = await fileModel.findById(fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    const buffer = await storageService.download(file.storagePath);
    
    const sizes = {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 }
    };

    const thumbnail = await thumbnailGenerator.generate(buffer, sizes[size]);
    
    const thumbPath = file.storagePath.replace(/\.[^.]+$/, `_${size}.jpg`);
    const result = await storageService.upload(thumbnail, thumbPath);
    
    return result.publicUrl || '';
  }

  async optimizeImage(fileId: string): Promise<void> {
    const file = await fileModel.findById(fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    const buffer = await storageService.download(file.storagePath);
    const optimized = await imageOptimizer.optimize(buffer, file.mimeType);
    
    if (optimized.length < buffer.length) {
      const optimizedPath = file.storagePath.replace(/\.[^.]+$/, '_optimized.jpg');
      await storageService.upload(optimized, optimizedPath);
      
      const reduction = Math.round((1 - optimized.length/buffer.length) * 100);
      logger.info(`Image optimized: ${fileId} (${reduction}% size reduction)`);
    }
  }
}

export const imageService = new ImageService();
```

### FILE: src/services/cdn.service.ts
```typescript
import { logger } from '../utils/logger';

export interface CDNConfig {
  provider: 'cloudfront' | 'cloudflare' | 'local';
  domain?: string;
  distributionId?: string;
}

export class CDNService {
  private config: CDNConfig;
  
  constructor() {
    this.config = {
      provider: process.env.CDN_PROVIDER as any || 'local',
      domain: process.env.CDN_DOMAIN,
      distributionId: process.env.CDN_DISTRIBUTION_ID
    };
  }
  
  getPublicUrl(path: string): string {
    if (this.config.provider === 'local') {
      return `/files/${path}`;
    }
    
    return `https://${this.config.domain}/${path}`;
  }
  
  async invalidateCache(paths: string[]): Promise<void> {
    if (this.config.provider === 'cloudfront') {
      await this.invalidateCloudFront(paths);
    } else if (this.config.provider === 'cloudflare') {
      await this.invalidateCloudFlare(paths);
    }
  }
  
  private async invalidateCloudFront(paths: string[]): Promise<void> {
    // AWS CloudFront invalidation
    logger.info(`Invalidating CloudFront cache for ${paths.length} paths`);
    // Implementation would use AWS SDK
  }
  
  private async invalidateCloudFlare(paths: string[]): Promise<void> {
    // CloudFlare cache purge
    logger.info(`Purging CloudFlare cache for ${paths.length} paths`);
    // Implementation would use CloudFlare API
  }
  
  generateResponsiveUrls(basePath: string, sizes: number[]): Record<string, string> {
    const urls: Record<string, string> = {};
    
    for (const size of sizes) {
      const sizePath = basePath.replace(/\.[^.]+$/, `_${size}w.jpg`);
      urls[`${size}w`] = this.getPublicUrl(sizePath);
    }
    
    return urls;
  }
  
  generateSrcSet(basePath: string): string {
    const sizes = [320, 640, 960, 1280, 1920];
    const srcset = sizes.map(size => {
      const url = this.getPublicUrl(basePath.replace(/\.[^.]+$/, `_${size}w.jpg`));
      return `${url} ${size}w`;
    }).join(', ');
    
    return srcset;
  }
}

export const cdnService = new CDNService();
```

### FILE: src/services/batch-operations.service.ts
```typescript
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';
import archiver from 'archiver';
import { Readable } from 'stream';

export class BatchOperationsService {
  async batchDelete(fileIds: string[]): Promise<{ deleted: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    let deleted = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        const file = await fileModel.findById(fileId);
        if (file) {
          // Delete from storage
          await storageService.delete(file.storagePath).catch(() => {});
          
          // Soft delete in database
          await pool.query(
            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
            [fileId]
          );
          
          deleted++;
        }
      } catch (error) {
        logger.error(`Failed to delete file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { deleted, failed };
  }
  
  async batchMove(
    fileIds: string[],
    newEntityType: string,
    newEntityId: string
  ): Promise<{ moved: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    let moved = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        await pool.query(
          'UPDATE files SET entity_type = $1, entity_id = $2 WHERE id = $3',
          [newEntityType, newEntityId, fileId]
        );
        moved++;
      } catch (error) {
        logger.error(`Failed to move file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { moved, failed };
  }
  
  async batchTag(fileIds: string[], tags: string[]): Promise<{ tagged: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    let tagged = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        await pool.query(
          'UPDATE files SET tags = array_cat(tags, $1) WHERE id = $2',
          [tags, fileId]
        );
        tagged++;
      } catch (error) {
        logger.error(`Failed to tag file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { tagged, failed };
  }
  
  async batchDownload(fileIds: string[]): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks: Buffer[] = [];
        
        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);
        
        for (const fileId of fileIds) {
          const file = await fileModel.findById(fileId);
          if (file) {
            const buffer = await storageService.download(file.storagePath);
            archive.append(buffer, { name: file.filename });
          }
        }
        
        await archive.finalize();
      } catch (error) {
        reject(error);
      }
    });
  }
  
  async batchCopy(
    fileIds: string[],
    targetEntityType: string,
    targetEntityId: string
  ): Promise<{ copied: number; failed: number }> {
    let copied = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        const file = await fileModel.findById(fileId);
        if (file) {
          const buffer = await storageService.download(file.storagePath);
          
          // Create new file record
          const { uploadService } = await import('./upload.service');
          await uploadService.uploadFile(
            buffer,
            file.filename,
            file.mimeType,
            file.uploadedBy,
            {
              entityType: targetEntityType,
              entityId: targetEntityId,
              metadata: file.metadata,
              tags: file.tags
            }
          );
          
          copied++;
        }
      } catch (error) {
        logger.error(`Failed to copy file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { copied, failed };
  }
}

export const batchOperationsService = new BatchOperationsService();
```

### FILE: src/services/chunked-upload.service.ts
```typescript
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';

export class ChunkedUploadService {
  private readonly CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  private readonly SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  async createSession(
    filename: string,
    fileSize: number,
    mimeType: string,
    userId?: string
  ): Promise<string> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    const sessionToken = uuidv4();
    const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
    const expiresAt = new Date(Date.now() + this.SESSION_TTL);
    
    await pool.query(`
      INSERT INTO upload_sessions (
        session_token, uploaded_by, filename, mime_type,
        total_size, total_chunks, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [sessionToken, userId, filename, mimeType, fileSize, totalChunks, expiresAt]);
    
    logger.info(`Chunked upload session created: ${sessionToken}`);
    return sessionToken;
  }
  
  async uploadChunk(
    sessionToken: string,
    chunkNumber: number,
    chunkData: Buffer
  ): Promise<{ progress: number; complete: boolean }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get session
    const sessionResult = await pool.query(
      'SELECT * FROM upload_sessions WHERE session_token = $1 AND status = $2',
      [sessionToken, 'active']
    );
    
    if (sessionResult.rows.length === 0) {
      throw new Error('Invalid or expired session');
    }
    
    const session = sessionResult.rows[0];
    
    // Validate chunk number
    if (chunkNumber >= session.total_chunks) {
      throw new Error('Invalid chunk number');
    }
    
    // Store chunk temporarily
    const chunkPath = path.join('./temp', 'chunks', sessionToken, `chunk_${chunkNumber}`);
    await fs.mkdir(path.dirname(chunkPath), { recursive: true });
    await fs.writeFile(chunkPath, chunkData);
    
    // Update session progress
    const updatedChunks = session.uploaded_chunks + 1;
    const updatedBytes = session.uploaded_bytes + chunkData.length;
    
    await pool.query(`
      UPDATE upload_sessions 
      SET uploaded_chunks = $1, uploaded_bytes = $2
      WHERE session_token = $3
    `, [updatedChunks, updatedBytes, sessionToken]);
    
    const progress = (updatedChunks / session.total_chunks) * 100;
    const complete = updatedChunks === session.total_chunks;
    
    logger.debug(`Chunk ${chunkNumber} uploaded for session ${sessionToken}`);
    
    return { progress, complete };
  }
  
  async completeSession(sessionToken: string): Promise<string> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get session
    const sessionResult = await pool.query(
      'SELECT * FROM upload_sessions WHERE session_token = $1',
      [sessionToken]
    );
    
    if (sessionResult.rows.length === 0) {
      throw new Error('Session not found');
    }
    
    const session = sessionResult.rows[0];
    
    if (session.uploaded_chunks !== session.total_chunks) {
      throw new Error('Not all chunks uploaded');
    }
    
    // Combine chunks
    const chunksDir = path.join('./temp', 'chunks', sessionToken);
    const chunks: Buffer[] = [];
    
    for (let i = 0; i < session.total_chunks; i++) {
      const chunkPath = path.join(chunksDir, `chunk_${i}`);
      const chunkData = await fs.readFile(chunkPath);
      chunks.push(chunkData);
    }
    
    const completeFile = Buffer.concat(chunks);
    
    // Create file record using regular upload service
    const { uploadService } = await import('./upload.service');
    const file = await uploadService.uploadFile(
      completeFile,
      session.filename,
      session.mime_type,
      session.uploaded_by
    );
    
    // Clean up chunks
    await fs.rm(chunksDir, { recursive: true, force: true });
    
    // Mark session as completed
    await pool.query(
      'UPDATE upload_sessions SET status = $1, completed_at = $2 WHERE session_token = $3',
      ['completed', new Date(), sessionToken]
    );
    
    logger.info(`Chunked upload completed: ${sessionToken} -> ${file.id}`);
    
    return file.id;
  }
  
  async cancelSession(sessionToken: string): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Clean up chunks
    const chunksDir = path.join('./temp', 'chunks', sessionToken);
    await fs.rm(chunksDir, { recursive: true, force: true }).catch(() => {});
    
    // Mark session as cancelled
    await pool.query(
      'UPDATE upload_sessions SET status = $1 WHERE session_token = $2',
      ['cancelled', sessionToken]
    );
    
    logger.info(`Upload session cancelled: ${sessionToken}`);
  }
}

export const chunkedUploadService = new ChunkedUploadService();
```

### FILE: src/services/upload.service.ts
```typescript
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { fileValidator } from '../validators/file.validator';
import { generateFileHash, generateStorageKey, generateFileId } from '../utils/file-helpers';
import { FileRecord, UploadOptions } from '../types/file.types';
import { FileStatus } from '../constants/file-status';
import { logger } from '../utils/logger';

export class UploadService {
  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    userId?: string,
    options?: UploadOptions
  ): Promise<FileRecord> {
    let fileId: string | undefined;
    
    try {
      // Validate file
      fileValidator.validateSize(buffer.length, mimeType);
      fileValidator.validateMimeType(mimeType);
      
      // Generate file metadata ONCE
      fileId = generateFileId();
      const sanitizedFilename = fileValidator.sanitizeFilename(filename);
      const extension = fileValidator.getExtension(filename);
      const hash = generateFileHash(buffer);
      
      // Use the SAME fileId for storage key
      const storageKey = generateStorageKey(
        fileId,
        sanitizedFilename,
        options?.entityType,
        options?.entityId
      );
      
      logger.info(`Creating file - ID: ${fileId}, Storage Path: ${storageKey}`);
      
      // Create database record
      const fileRecord = await fileModel.create({
        id: fileId,
        filename: sanitizedFilename,
        originalFilename: filename,
        mimeType,
        extension,
        sizeBytes: buffer.length,
        hashSha256: hash,
        uploadedBy: userId,
        entityType: options?.entityType,
        entityId: options?.entityId,
        isPublic: options?.isPublic || false,
        metadata: options?.metadata || {},
        tags: options?.tags,
        status: FileStatus.UPLOADING,
        storagePath: storageKey
      });
      
      // Upload to storage
      const storageResult = await storageService.upload(buffer, storageKey);
      logger.info(`File uploaded to storage: ${storageKey}`);
      
      // Update file record with CDN URL
      await fileModel.updateCdnUrl(fileId, storageResult.publicUrl || '');
      
      // Get the updated record
      const updatedRecord = await fileModel.findById(fileId);
      
      if (!updatedRecord) {
        logger.warn(`Could not retrieve updated record for ${fileId}`);
        fileRecord.cdnUrl = storageResult.publicUrl;
        fileRecord.status = FileStatus.READY;
        return fileRecord;
      }
      
      logger.info(`File upload completed: ${fileId}`);
      return updatedRecord;
      
    } catch (error: any) {
      logger.error('File upload failed:', error);
      
      if (fileId) {
        try {
          await fileModel.updateStatus(fileId, FileStatus.FAILED, error.message);
        } catch (updateError) {
          logger.error('Failed to update file status:', updateError);
        }
      }
      
      throw error;
    }
  }
  
  async getFile(fileId: string): Promise<FileRecord | null> {
    return fileModel.findById(fileId);
  }
  
  async getFilesByEntity(entityType: string, entityId: string): Promise<FileRecord[]> {
    return fileModel.findByEntity(entityType, entityId);
  }
}

export const uploadService = new UploadService();
```

### FILE: src/services/cleanup.service.ts
```typescript
import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export class CleanupService {
  async cleanupOrphanedFiles(): Promise<{ cleaned: number }> {
    const pool = getPool();
    if (!pool) return { cleaned: 0 };
    
    let cleaned = 0;
    
    // Find files marked as deleted
    const deletedFiles = await pool.query(
      `SELECT * FROM files 
       WHERE deleted_at IS NOT NULL 
       AND deleted_at < NOW() - INTERVAL '7 days'`
    );
    
    for (const file of deletedFiles.rows) {
      try {
        // Delete from storage
        await storageService.delete(file.storage_path).catch(() => {});
        
        // Hard delete from database
        await pool.query('DELETE FROM files WHERE id = $1', [file.id]);
        
        cleaned++;
      } catch (error) {
        logger.error(`Failed to cleanup file ${file.id}:`, error);
      }
    }
    
    // Clean expired upload sessions
    await pool.query(
      `UPDATE upload_sessions 
       SET status = 'expired' 
       WHERE status = 'active' 
       AND expires_at < NOW()`
    );
    
    // Clean old access logs
    await pool.query(
      `DELETE FROM file_access_logs 
       WHERE accessed_at < NOW() - INTERVAL '90 days'`
    );
    
    return { cleaned };
  }
  
  async cleanupTempFiles(): Promise<{ cleaned: number }> {
    let cleaned = 0;
    const tempDir = './temp';
    
    try {
      const files = await fs.readdir(tempDir);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        // Delete files older than 24 hours
        if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
          await fs.unlink(filePath).catch(() => {});
          cleaned++;
        }
      }
    } catch (error) {
      logger.error('Temp cleanup failed:', error);
    }
    
    return { cleaned };
  }
  
  async calculateStorageUsage(): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    
    // Calculate usage by entity
    await pool.query(`
      INSERT INTO storage_usage (entity_type, entity_id, total_files, total_bytes, 
                                 image_bytes, document_bytes, video_bytes, other_bytes)
      SELECT 
        entity_type,
        entity_id,
        COUNT(*) as total_files,
        SUM(size_bytes) as total_bytes,
        SUM(CASE WHEN mime_type LIKE 'image/%' THEN size_bytes ELSE 0 END) as image_bytes,
        SUM(CASE WHEN mime_type LIKE '%pdf%' OR mime_type LIKE '%document%' THEN size_bytes ELSE 0 END) as document_bytes,
        SUM(CASE WHEN mime_type LIKE 'video/%' THEN size_bytes ELSE 0 END) as video_bytes,
        SUM(CASE WHEN mime_type NOT LIKE 'image/%' 
                 AND mime_type NOT LIKE 'video/%' 
                 AND mime_type NOT LIKE '%pdf%' 
                 AND mime_type NOT LIKE '%document%' THEN size_bytes ELSE 0 END) as other_bytes
      FROM files
      WHERE deleted_at IS NULL
      AND entity_type IS NOT NULL
      AND entity_id IS NOT NULL
      GROUP BY entity_type, entity_id
      ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        total_files = EXCLUDED.total_files,
        total_bytes = EXCLUDED.total_bytes,
        image_bytes = EXCLUDED.image_bytes,
        document_bytes = EXCLUDED.document_bytes,
        video_bytes = EXCLUDED.video_bytes,
        other_bytes = EXCLUDED.other_bytes,
        calculated_at = NOW()
    `);
    
    logger.info('Storage usage calculated');
  }
  
  async enforceStorageLimits(): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    
    // Check entities exceeding limits
    const result = await pool.query(`
      SELECT su.*, su.total_bytes > su.max_bytes as exceeds_limit
      FROM storage_usage su
      WHERE su.max_bytes IS NOT NULL
      AND su.total_bytes > su.max_bytes
    `);
    
    for (const entity of result.rows) {
      logger.warn(`Entity ${entity.entity_type}/${entity.entity_id} exceeds storage limit: ${entity.total_bytes}/${entity.max_bytes}`);
      // Could implement automatic cleanup or notifications here
    }
  }
}

export const cleanupService = new CleanupService();
```

### FILE: src/types/fluent-ffmpeg.d.ts
```typescript
declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    ffprobe(file: string, callback: (err: any, metadata: any) => void): void;
    // Add other methods as needed
  }
  
  function ffmpeg(input?: string): FfmpegCommand;
  
  namespace ffmpeg {
    function ffprobe(file: string, callback: (err: any, metadata: any) => void): void;
  }
  
  export = ffmpeg;
}
```

### FILE: src/types/file.types.ts
```typescript
export type FileStatus = 'uploading' | 'processing' | 'ready' | 'failed' | 'deleted';

export interface FileUpdate {
  status?: FileStatus;
  metadata?: any;
}

export interface FileRecord {
  id: string;
  // File identification
  filename: string;
  original_filename: string;
  mime_type: string;
  extension?: string;
  // Storage location
  storage_provider: string;
  bucket_name?: string;
  storage_path: string;
  cdn_url?: string;
  // File properties
  size_bytes: number;
  hash_sha256?: string;
  // Ownership
  uploaded_by?: string;
  entity_type?: string;
  entity_id?: string;
  // Access control
  is_public: boolean;
  access_level: string;
  // Status
  status: FileStatus;
  processing_error?: string;
  // Metadata
  metadata?: any;
  tags?: string[];
  // Timestamps
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
  
  // Aliases for backwards compatibility
  file_name?: string;
  file_key?: string;
  content_type?: string;
  mimeType?: string;
  storagePath?: string;
  sizeBytes?: number;
  cdnUrl?: string;
  hashSha256?: string;
  uploadedBy?: string;
  entityType?: string;
  entityId?: string;
  isPublic?: boolean;
  accessLevel?: string;
  file_size?: number;
  user_id?: string;
  originalFilename?: string;
}

export interface UploadOptions {
  maxSize?: number;
  allowedTypes?: string[];
  generateThumbnail?: boolean;
  scanForVirus?: boolean;
  entityType?: string;
  entityId?: string;
  isPublic?: boolean;
  metadata?: any;
  tags?: string[];
}
```

### FILE: src/types/express.d.ts
```typescript
import { Express } from 'express-serve-static-core';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        [key: string]: any;
      };
    }
  }
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/storage/providers/storage.provider.ts
```typescript
export interface StorageResult {
  key: string;
  storageUrl: string;
  publicUrl?: string;
  provider: string;
  bucket?: string;
}

export interface StorageProvider {
  upload(file: Buffer, key: string, options?: any): Promise<StorageResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
}
```

### FILE: src/storage/providers/s3.provider.ts
```typescript
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { StorageProvider, StorageResult } from './storage.provider';
import { logger } from '../../utils/logger';
import { Readable } from 'stream';

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  cdnDomain?: string;
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucketName: string;
  private cdnDomain?: string;

  constructor(config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
    this.bucketName = config.bucketName;
    this.cdnDomain = config.cdnDomain;
  }

  async upload(file: Buffer, key: string, options?: any): Promise<StorageResult> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file,
        ContentType: options?.mimeType || 'application/octet-stream',
        CacheControl: options?.cacheControl || 'max-age=31536000',
        Metadata: options?.metadata || {}
      });

      await this.client.send(command);
      
      const publicUrl = this.cdnDomain 
        ? `https://${this.cdnDomain}/${key}`
        : `https://${this.bucketName}.s3.amazonaws.com/${key}`;

      logger.debug(`File uploaded to S3: ${key}`);

      return {
        key,
        storageUrl: `s3://${this.bucketName}/${key}`,
        publicUrl,
        provider: 's3',
        bucket: this.bucketName
      };
    } catch (error) {
      logger.error('S3 upload failed:', error);
      throw error;
    }
  }

  async uploadStream(stream: Readable, key: string, options?: any): Promise<StorageResult> {
    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: stream,
          ContentType: options?.mimeType || 'application/octet-stream'
        },
        queueSize: 4,
        partSize: 5 * 1024 * 1024, // 5MB chunks
        leavePartsOnError: false
      });

      upload.on('httpUploadProgress', (progress) => {
        logger.debug(`Upload progress: ${progress.loaded}/${progress.total} bytes`);
      });

      await upload.done();

      const publicUrl = this.cdnDomain 
        ? `https://${this.cdnDomain}/${key}`
        : `https://${this.bucketName}.s3.amazonaws.com/${key}`;

      return {
        key,
        storageUrl: `s3://${this.bucketName}/${key}`,
        publicUrl,
        provider: 's3',
        bucket: this.bucketName
      };
    } catch (error) {
      logger.error('S3 stream upload failed:', error);
      throw error;
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const response = await this.client.send(command);
      const stream = response.Body as Readable;
      
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      logger.error('S3 download failed:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.client.send(command);
      logger.debug(`File deleted from S3: ${key}`);
    } catch (error) {
      logger.error('S3 delete failed:', error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }

  getUrl(key: string): string {
    return this.cdnDomain 
      ? `https://${this.cdnDomain}/${key}`
      : `https://${this.bucketName}.s3.amazonaws.com/${key}`;
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async getUploadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }
}
```

### FILE: src/controllers/admin.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import { auditService } from '@tickettoken/shared/services/audit.service';

export class AdminController {
  async getStats(request: FastifyRequest, reply: FastifyReply) {
    try {
      const pool = getPool();
      if (!pool) {
        return reply.status(500).send({ error: 'Database not available' });
      }

      // Log admin action
      await auditService.logAdminAction(
        'file-service',
        'admin.getStats',
        (request as any).user?.id || 'system',
        'statistics',
        {
          actionType: 'ACCESS',
          userRole: (request as any).user?.role,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string
        }
      );

      // Get file statistics
      const stats = await pool.query(`
        SELECT
          COUNT(*) as total_files,
          SUM(size_bytes) as total_bytes,
          COUNT(DISTINCT uploaded_by) as unique_users,
          COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_files,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
          COUNT(CASE WHEN mime_type LIKE 'image/%' THEN 1 END) as images,
          COUNT(CASE WHEN mime_type LIKE 'video/%' THEN 1 END) as videos,
          COUNT(CASE WHEN mime_type LIKE '%pdf%' THEN 1 END) as pdfs
        FROM files
        WHERE deleted_at IS NULL
      `);

      // Get storage usage by entity
      const entityStats = await pool.query(`
        SELECT
          entity_type,
          COUNT(*) as file_count,
          SUM(size_bytes) as total_bytes
        FROM files
        WHERE deleted_at IS NULL AND entity_type IS NOT NULL
        GROUP BY entity_type
      `);

      // Get recent uploads
      const recentUploads = await pool.query(`
        SELECT id, filename, mime_type, size_bytes, created_at
        FROM files
        ORDER BY created_at DESC
        LIMIT 10
      `);

      reply.send({
        overview: stats.rows[0],
        byEntity: entityStats.rows,
        recentFiles: recentUploads.rows
      });

    } catch (error) {
      logger.error('Failed to get stats:', error);
      
      // Log failure
      await auditService.logAdminAction(
        'file-service',
        'admin.getStats',
        (request as any).user?.id || 'system',
        'statistics',
        {
          actionType: 'ACCESS',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      
      reply.status(500).send({ error: 'Failed to get statistics' });
    }
  }

  async cleanupOrphaned(request: FastifyRequest, reply: FastifyReply) {
    try {
      const pool = getPool();
      if (!pool) {
        return reply.status(500).send({ error: 'Database not available' });
      }

      // Find orphaned files (in DB but not on disk)
      const files = await pool.query(`
        SELECT id, storage_path
        FROM files
        WHERE status = 'ready' AND deleted_at IS NULL
      `);

      let cleaned = 0;
      let failed = 0;
      const cleanedFileIds: string[] = [];

      for (const file of files.rows) {
        const exists = await storageService.exists(file.storage_path);
        if (!exists) {
          // Mark as deleted if file doesn't exist
          await pool.query(
            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
            [file.id]
          );
          cleanedFileIds.push(file.id);
          cleaned++;
        }
      }

      // Clean up temp directory
      const tempDir = './temp';
      const tempFiles = await fs.readdir(tempDir).catch(() => []);
      const now = Date.now();
      const tempFilesCleaned: string[] = [];

      for (const file of tempFiles) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);

        // Delete files older than 24 hours
        if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
          await fs.unlink(filePath).catch(() => {});
          tempFilesCleaned.push(file);
          cleaned++;
        }
      }

      // Log admin cleanup action
      await auditService.logAdminAction(
        'file-service',
        'admin.cleanupOrphaned',
        (request as any).user?.id || 'system',
        'cleanup',
        {
          actionType: 'DELETE',
          userRole: (request as any).user?.role,
          metadata: {
            orphanedFiles: cleanedFileIds,
            tempFilesCleaned,
            totalCleaned: cleaned
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string
        }
      );

      reply.send({
        success: true,
        orphanedFiles: cleaned,
        tempFilesCleaned: tempFiles.length
      });

    } catch (error) {
      logger.error('Cleanup failed:', error);
      
      // Log failure
      await auditService.logAdminAction(
        'file-service',
        'admin.cleanupOrphaned',
        (request as any).user?.id || 'system',
        'cleanup',
        {
          actionType: 'DELETE',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      
      reply.status(500).send({ error: 'Cleanup failed' });
    }
  }

  async bulkDelete(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { fileIds } = request.body as { fileIds: string[] };

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return reply.status(400).send({ error: 'No file IDs provided' });
      }

      const pool = getPool();
      if (!pool) {
        return reply.status(500).send({ error: 'Database not available' });
      }

      // Get file info before deletion for audit
      const filesBeforeDelete = await pool.query(
        'SELECT id, filename, size_bytes FROM files WHERE id = ANY($1)',
        [fileIds]
      );

      // Soft delete files
      const result = await pool.query(
        'UPDATE files SET deleted_at = NOW() WHERE id = ANY($1) RETURNING id',
        [fileIds]
      );

      // Log bulk delete action
      await auditService.logAdminAction(
        'file-service',
        'admin.bulkDelete',
        (request as any).user?.id || 'system',
        'files',
        {
          actionType: 'DELETE',
          userRole: (request as any).user?.role,
          previousValue: filesBeforeDelete.rows,
          metadata: {
            requestedFileIds: fileIds,
            deletedCount: result.rowCount,
            deletedFileIds: result.rows.map((r: any) => r.id)
          },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] as string
        }
      );

      reply.send({
        success: true,
        deleted: result.rowCount
      });

    } catch (error) {
      logger.error('Bulk delete failed:', error);
      
      // Log failure
      await auditService.logAdminAction(
        'file-service',
        'admin.bulkDelete',
        (request as any).user?.id || 'system',
        'files',
        {
          actionType: 'DELETE',
          success: false,
          metadata: {
            requestedFileIds: (request.body as any).fileIds
          },
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
      
      reply.status(500).send({ error: 'Bulk delete failed' });
    }
  }

  // New endpoint to view audit logs
  async getAuditLogs(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = request.query as any;
      
      // Log audit log access
      await auditService.logAdminAction(
        'file-service',
        'admin.getAuditLogs',
        (request as any).user?.id || 'system',
        'audit_logs',
        {
          actionType: 'ACCESS',
          userRole: (request as any).user?.role,
          metadata: { query }
        }
      );

      const logs = await auditService.getAuditLogs({
        service: query.service || 'file-service',
        userId: query.userId,
        resourceType: query.resourceType,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        limit: parseInt(query.limit) || 50,
        offset: parseInt(query.offset) || 0
      });

      reply.send({
        success: true,
        logs,
        count: logs.length
      });

    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      reply.status(500).send({ error: 'Failed to get audit logs' });
    }
  }
}

export const adminController = new AdminController();
```

### FILE: src/controllers/upload.controller.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { s3Storage } from '../services/storage.s3';
import { antivirusService } from '../services/antivirus.service';
import { logger } from '../utils/logger';
import { db } from '../config/database';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf'];

interface UploadUrlBody {
  fileName: string;
  contentType: string;
}

interface ConfirmUploadParams {
  fileKey: string;
}

interface DeleteFileParams {
  fileId: string;
}

// Extend the UploadOptions interface locally to include what S3StorageService expects
interface S3UploadOptions {
  contentType: string;
  maxSize?: number;
  allowedTypes?: string[];
  expiresIn?: number;
  generateThumbnail?: boolean;
  scanForVirus?: boolean;
  entityType?: string;
  entityId?: string;
  isPublic?: boolean;
  metadata?: any;
  tags?: string[];
}

export class UploadController {
  /**
   * Generate signed URL for file upload
   */
  async generateUploadUrl(request: FastifyRequest<{ Body: UploadUrlBody }>, reply: FastifyReply) {
    try {
      const { fileName, contentType } = request.body;
      const userId = (request as any).user?.id || 'anonymous';

      // Validate file type
      const allowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];
      if (!allowedTypes.includes(contentType)) {
        return reply.status(400).send({
          error: 'Invalid file type'
        });
      }

      // Generate signed URL with correct parameters including contentType
      const options: S3UploadOptions = {
        contentType,
        maxSize: MAX_FILE_SIZE,
        allowedTypes,
        expiresIn: 300 // 5 minutes
      };
      
      const signedUrl = await s3Storage.generateSignedUploadUrl(userId, options as any);

      // Store upload record - Use proper Knex syntax
      await db('file_uploads').insert({
        user_id: userId,
        file_key: signedUrl.fileKey,
        file_name: fileName,
        content_type: contentType,
        status: 'pending',
        expires_at: signedUrl.expiresAt
      });

      return reply.send({
        uploadUrl: signedUrl.uploadUrl,
        fileKey: signedUrl.fileKey,
        expiresAt: signedUrl.expiresAt
      });
    } catch (error: any) {
      logger.error('Failed to generate upload URL:', error);
      return reply.status(500).send({
        error: 'Failed to generate upload URL'
      });
    }
  }

  /**
   * Confirm file upload completion
   */
  async confirmUpload(request: FastifyRequest<{ Params: ConfirmUploadParams }>, reply: FastifyReply) {
    try {
      const { fileKey } = request.params;
      const userId = (request as any).user?.id || 'anonymous';

      // Get upload record - Use proper Knex syntax
      const upload = await db('file_uploads')
        .where({ file_key: fileKey, user_id: userId, status: 'pending' })
        .first();

      if (!upload) {
        return reply.status(404).send({ error: 'Upload not found' });
      }

      // Update status - Use proper Knex syntax
      await db('file_uploads')
        .where({ id: upload.id })
        .update({ 
          status: 'processing',
          updated_at: db.fn.now()
        });

      // Start processing
      await this.processFile(upload.id, fileKey);

      return reply.send({
        message: 'Upload confirmed',
        fileId: upload.id
      });
    } catch (error: any) {
      logger.error('Failed to confirm upload:', error);
      return reply.status(500).send({
        error: 'Failed to confirm upload'
      });
    }
  }

  /**
   * Process uploaded file
   */
  private async processFile(fileId: string, fileKey: string) {
    try {
      // Note: S3StorageService doesn't have a download/getObject method
      // We'll need to add it or use the AWS SDK directly
      // For now, skip virus scanning
      
      // Update status to ready - Use proper Knex syntax
      await db('file_uploads')
        .where({ id: fileId })
        .update({
          status: 'ready',
          updated_at: db.fn.now()
        });

      // Clear cache
      await serviceCache.delete(`file:${fileId}`);
    } catch (error: any) {
      logger.error('File processing failed:', error);
      await db('file_uploads')
        .where({ id: fileId })
        .update({
          status: 'failed',
          processing_error: error.message,
          updated_at: db.fn.now()
        });
    }
  }

  /**
   * Delete file
   */
  async deleteFile(request: FastifyRequest<{ Params: DeleteFileParams }>, reply: FastifyReply) {
    try {
      const { fileId } = request.params;
      const userId = (request as any).user?.id || 'anonymous';

      // Get file record - Use proper Knex syntax
      const upload = await db('file_uploads')
        .where({ id: fileId, user_id: userId })
        .first();

      if (!upload) {
        return reply.status(404).send({ error: 'File not found' });
      }

      // Delete from storage - Use the correct method name
      await s3Storage.deleteFile(upload.file_key);

      // Update database - Use proper Knex syntax
      await db('file_uploads')
        .where({ id: fileId })
        .update({
          status: 'deleted',
          deleted_at: db.fn.now()
        });

      return reply.send({ message: 'File deleted successfully' });
    } catch (error: any) {
      logger.error('Failed to delete file:', error);
      return reply.status(500).send({
        error: 'Failed to delete file'
      });
    }
  }
}
```

### FILE: src/models/file.model.ts
```typescript
import { getPool } from '../config/database.config';
import { FileRecord, FileStatus } from '../types/file.types';
import { logger } from '../utils/logger';

export class FileModel {
  async create(data: Partial<FileRecord>): Promise<FileRecord> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      INSERT INTO files (
        filename, original_filename, mime_type, extension,
        storage_provider, bucket_name, storage_path, cdn_url,
        size_bytes, hash_sha256, uploaded_by, entity_type, entity_id,
        is_public, access_level, status, metadata, tags
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      ) RETURNING *
    `;

    const values = [
      data.filename || data.file_name,
      data.original_filename || data.originalFilename,
      data.mime_type || data.mimeType || data.content_type,
      data.extension,
      data.storage_provider || 'local',
      data.bucket_name,
      data.storage_path || data.storagePath || data.file_key,
      data.cdn_url || data.cdnUrl,
      data.size_bytes || data.sizeBytes || data.file_size,
      data.hash_sha256 || data.hashSha256,
      data.uploaded_by || data.uploadedBy || data.user_id,
      data.entity_type || data.entityType,
      data.entity_id || data.entityId,
      data.is_public !== undefined ? data.is_public : (data.isPublic || false),
      data.access_level || data.accessLevel || 'private',
      data.status || 'uploading',
      JSON.stringify(data.metadata || {}),
      data.tags || []
    ];

    try {
      const result = await pool.query(query, values);
      return this.mapRowToFile(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create file record:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<FileRecord | null> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = 'SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToFile(result.rows[0]);
  }

  async updateStatus(id: string, status: FileStatus, error?: string): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      UPDATE files
      SET status = $2, processing_error = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await pool.query(query, [id, status, error]);
  }

  async updateCdnUrl(id: string, cdnUrl: string): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      UPDATE files
      SET cdn_url = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await pool.query(query, [id, cdnUrl]);
  }

  async findByEntity(entityType: string, entityId: string): Promise<FileRecord[]> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');

    const query = `
      SELECT * FROM files
      WHERE entity_type = $1 AND entity_id = $2 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [entityType, entityId]);
    return result.rows.map(row => this.mapRowToFile(row));
  }

  private mapRowToFile(row: any): FileRecord {
    return {
      id: row.id,
      // Required snake_case properties
      filename: row.filename,
      original_filename: row.original_filename,
      mime_type: row.mime_type,
      extension: row.extension,
      storage_provider: row.storage_provider,
      bucket_name: row.bucket_name,
      storage_path: row.storage_path,
      cdn_url: row.cdn_url,
      size_bytes: parseInt(row.size_bytes),
      hash_sha256: row.hash_sha256,
      uploaded_by: row.uploaded_by,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      is_public: row.is_public,
      access_level: row.access_level,
      status: row.status,
      processing_error: row.processing_error,
      metadata: row.metadata || {},
      tags: row.tags,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      
      // Backwards compatibility aliases (camelCase)
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      storagePath: row.storage_path,
      cdnUrl: row.cdn_url,
      sizeBytes: parseInt(row.size_bytes),
      hashSha256: row.hash_sha256,
      uploadedBy: row.uploaded_by,
      entityType: row.entity_type,
      entityId: row.entity_id,
      isPublic: row.is_public,
      accessLevel: row.access_level,
      file_name: row.filename,
      file_key: row.storage_path,
      content_type: row.mime_type,
      file_size: parseInt(row.size_bytes),
      user_id: row.uploaded_by
    };
  }
}

export const fileModel = new FileModel();
```

### FILE: src/processors/image/watermark.processor.ts
```typescript
import sharp from 'sharp';
import { logger } from '../../utils/logger';

export interface WatermarkOptions {
  text?: string;
  imagePath?: string;
  position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity?: number;
  fontSize?: number;
  rotate?: number;
}

export class WatermarkProcessor {
  async addTextWatermark(
    imageBuffer: Buffer,
    options: WatermarkOptions
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    
    const fontSize = options.fontSize || Math.min(width, height) / 10;
    const opacity = options.opacity || 0.3;
    const rotate = options.rotate || -45;
    
    // Position calculation
    let x = width / 2;
    let y = height / 2;
    let anchor = 'middle';
    
    switch (options.position) {
      case 'top-left':
        x = fontSize;
        y = fontSize;
        anchor = 'start';
        break;
      case 'top-right':
        x = width - fontSize;
        y = fontSize;
        anchor = 'end';
        break;
      case 'bottom-left':
        x = fontSize;
        y = height - fontSize;
        anchor = 'start';
        break;
      case 'bottom-right':
        x = width - fontSize;
        y = height - fontSize;
        anchor = 'end';
        break;
    }
    
    const watermarkSVG = Buffer.from(`
      <svg width="${width}" height="${height}">
        <defs>
          <style>
            .watermark { 
              fill: white; 
              fill-opacity: ${opacity};
              font-family: Arial, sans-serif;
              font-size: ${fontSize}px;
              font-weight: bold;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            }
          </style>
        </defs>
        <text x="${x}" y="${y}" 
              class="watermark"
              text-anchor="${anchor}"
              transform="rotate(${rotate} ${x} ${y})">
          ${options.text || 'WATERMARK'}
        </text>
      </svg>
    `);
    
    return sharp(imageBuffer)
      .composite([{
        input: watermarkSVG,
        blend: 'over'
      }])
      .toBuffer();
  }
  
  async addImageWatermark(
    imageBuffer: Buffer,
    watermarkBuffer: Buffer,
    options: WatermarkOptions
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const watermarkMetadata = await sharp(watermarkBuffer).metadata();
    
    // Resize watermark to 20% of main image
    const watermarkWidth = Math.floor((metadata.width || 800) * 0.2);
    const resizedWatermark = await sharp(watermarkBuffer)
      .resize(watermarkWidth, null, { 
        withoutEnlargement: true 
      })
      .toBuffer();
    
    // Calculate position
    let left = 0;
    let top = 0;
    
    switch (options.position) {
      case 'top-left':
        left = 20;
        top = 20;
        break;
      case 'top-right':
        left = (metadata.width || 800) - watermarkWidth - 20;
        top = 20;
        break;
      case 'bottom-left':
        left = 20;
        top = (metadata.height || 600) - (watermarkMetadata.height || 100) - 20;
        break;
      case 'bottom-right':
        left = (metadata.width || 800) - watermarkWidth - 20;
        top = (metadata.height || 600) - (watermarkMetadata.height || 100) - 20;
        break;
      default: // center
        left = Math.floor(((metadata.width || 800) - watermarkWidth) / 2);
        top = Math.floor(((metadata.height || 600) - (watermarkMetadata.height || 100)) / 2);
    }
    
    return sharp(imageBuffer)
      .composite([{
        input: resizedWatermark,
        left,
        top,
        blend: 'over'
      }])
      .toBuffer();
  }
  
  async addPattern(imageBuffer: Buffer, pattern: string): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    
    // Create repeating pattern
    const patternSVG = Buffer.from(`
      <svg width="${width}" height="${height}">
        <defs>
          <pattern id="watermarkPattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <text x="100" y="100" 
                  fill="white" 
                  fill-opacity="0.1" 
                  font-size="20" 
                  text-anchor="middle"
                  transform="rotate(-45 100 100)">
              ${pattern}
            </text>
          </pattern>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#watermarkPattern)" />
      </svg>
    `);
    
    return sharp(imageBuffer)
      .composite([{
        input: patternSVG,
        blend: 'over'
      }])
      .toBuffer();
  }
}

export const watermarkProcessor = new WatermarkProcessor();
```

### FILE: src/processors/image/thumbnail.generator.ts
```typescript
import sharp from 'sharp';
import { logger } from '../../utils/logger';

export interface ThumbnailOptions {
  width: number;
  height: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export class ThumbnailGenerator {
  async generate(
    input: Buffer,
    options: ThumbnailOptions
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(input)
        .resize(options.width, options.height, {
          fit: options.fit || 'cover',
          position: 'centre',
          withoutEnlargement: true
        });

      // Apply format
      switch (options.format || 'jpeg') {
        case 'jpeg':
          pipeline = pipeline.jpeg({ 
            quality: options.quality || 85,
            progressive: true 
          });
          break;
        case 'png':
          pipeline = pipeline.png({ 
            quality: options.quality || 90,
            compressionLevel: 9 
          });
          break;
        case 'webp':
          pipeline = pipeline.webp({ 
            quality: options.quality || 85 
          });
          break;
      }

      return await pipeline.toBuffer();
      
    } catch (error) {
      logger.error('Thumbnail generation failed:', error);
      throw error;
    }
  }

  async generateSet(
    input: Buffer,
    sizes: Record<string, ThumbnailOptions>
  ): Promise<Record<string, Buffer>> {
    const results: Record<string, Buffer> = {};
    
    for (const [name, options] of Object.entries(sizes)) {
      results[name] = await this.generate(input, options);
    }
    
    return results;
  }
}

export const thumbnailGenerator = new ThumbnailGenerator();
```

### FILE: src/processors/image/image.processor.ts
```typescript
import sharp from 'sharp';
import { logger } from '../../utils/logger';
import { fileModel } from '../../models/file.model';
import { storageService } from '../../storage/storage.service';

export interface ImageProcessingOptions {
  generateThumbnails?: boolean;
  optimize?: boolean;
  extractMetadata?: boolean;
  generateBlurHash?: boolean;
}

export class ImageProcessor {
  private thumbnailSizes = {
    small: { width: 150, height: 150 },
    medium: { width: 300, height: 300 },
    large: { width: 600, height: 600 }
  };

  // SECURITY: Whitelist of allowed metadata fields
  private readonly ALLOWED_METADATA_FIELDS = [
    'width',
    'height',
    'aspect_ratio',
    'format',
    'thumbnail_small_url',
    'thumbnail_medium_url',
    'thumbnail_large_url',
    'space',
    'channels',
    'depth',
    'density',
    'has_alpha',
    'orientation'
  ];

  async processImage(fileId: string, buffer: Buffer): Promise<void> {
    try {
      logger.info(`Processing image: ${fileId}`);

      // Get file record
      const file = await fileModel.findById(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Process based on file type
      const tasks = [];

      // Always extract metadata
      tasks.push(this.extractMetadata(fileId, buffer));

      // Generate thumbnails
      tasks.push(this.generateThumbnails(fileId, buffer, file.storagePath));

      // Optimize original
      tasks.push(this.optimizeImage(fileId, buffer, file.storagePath));

      await Promise.all(tasks);

      logger.info(`Image processing completed: ${fileId}`);

    } catch (error) {
      logger.error(`Image processing failed for ${fileId}:`, error);
      throw error;
    }
  }

  private async extractMetadata(fileId: string, buffer: Buffer): Promise<void> {
    const metadata = await sharp(buffer).metadata();

    await this.saveImageMetadata(fileId, {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format,
      space: metadata.space,
      channels: metadata.channels,
      depth: metadata.depth,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation
    });
  }

  private async generateThumbnails(fileId: string, buffer: Buffer, originalPath: string): Promise<void> {
    const thumbnailUrls: any = {};

    for (const [size, dimensions] of Object.entries(this.thumbnailSizes)) {
      const thumbnail = await sharp(buffer)
        .resize(dimensions.width, dimensions.height, {
          fit: 'cover',
          position: 'centre'
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      // Generate thumbnail path
      const thumbPath = originalPath.replace(/\.[^.]+$/, `_${size}.jpg`);

      // Save thumbnail
      const result = await storageService.upload(thumbnail, thumbPath);
      thumbnailUrls[`thumbnail_${size}_url`] = result.publicUrl;
    }

    // Update database with thumbnail URLs
    await this.updateImageMetadata(fileId, thumbnailUrls);
  }

  private async optimizeImage(fileId: string, buffer: Buffer, originalPath: string): Promise<void> {
    const optimized = await sharp(buffer)
      .jpeg({ quality: 85, progressive: true, mozjpeg: true })
      .toBuffer();

    // Only save if smaller
    if (optimized.length < buffer.length) {
      const optimizedPath = originalPath.replace(/\.[^.]+$/, '_optimized.jpg');
      await storageService.upload(optimized, optimizedPath);
      logger.info(`Image optimized: ${fileId} (${Math.round((1 - optimized.length/buffer.length) * 100)}% reduction)`);
    }
  }

  private async saveImageMetadata(fileId: string, metadata: any): Promise<void> {
    const pool = await import('../../config/database.config').then(m => m.getPool());
    if (!pool) return;

    await pool.query(`
      INSERT INTO image_metadata (
        file_id, width, height, aspect_ratio, format
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (file_id) DO UPDATE SET
        width = $2, height = $3, aspect_ratio = $4, format = $5
    `, [fileId, metadata.width, metadata.height, metadata.width/metadata.height, metadata.format]);
  }

  private async updateImageMetadata(fileId: string, data: any): Promise<void> {
    const pool = await import('../../config/database.config').then(m => m.getPool());
    if (!pool) return;

    // SECURITY FIX: Validate column names against whitelist
    const validFields: string[] = [];
    const validValues: any[] = [];
    
    Object.keys(data).forEach(key => {
      if (this.ALLOWED_METADATA_FIELDS.includes(key)) {
        validFields.push(key);
        validValues.push(data[key]);
      }
    });

    if (validFields.length === 0) {
      logger.warn('No valid fields to update in image metadata');
      return;
    }

    const setClauses = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
    const values = [fileId, ...validValues];

    await pool.query(`
      UPDATE image_metadata SET ${setClauses} WHERE file_id = $1
    `, values);
  }
}

export const imageProcessor = new ImageProcessor();
```

### FILE: src/services/antivirus.service.ts
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { db } from '../config/database';

const execAsync = promisify(exec);

interface ScanResult {
  clean: boolean;
  threats: string[];
  scannedAt: Date;
  scanEngine: string;
  fileHash: string;
}

export class AntivirusService {
  private quarantinePath: string;
  private tempPath: string;

  constructor() {
    this.quarantinePath = process.env.QUARANTINE_PATH || '/var/quarantine';
    this.tempPath = process.env.TEMP_PATH || '/tmp/av-scan';
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  private ensureDirectories() {
    [this.quarantinePath, this.tempPath].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Scan file for viruses using ClamAV
   */
  async scanFile(filePath: string): Promise<ScanResult> {
    try {
      logger.info(`Starting AV scan for: ${filePath}`);

      // Calculate file hash for tracking
      const fileHash = await this.calculateFileHash(filePath);

      // Check if file was already scanned
      const existingScan = await this.checkExistingScan(fileHash);
      if (existingScan && existingScan.clean) {
        logger.info(`File already scanned and clean: ${fileHash}`);
        return existingScan;
      }

      // Run ClamAV scan
      const scanResult = await this.runClamAVScan(filePath);

      // Store scan result
      await this.storeScanResult(fileHash, scanResult);

      // If infected, quarantine the file
      if (!scanResult.clean) {
        await this.quarantineFile(filePath, fileHash, scanResult.threats);
      }

      return scanResult;
    } catch (error) {
      logger.error('AV scan failed:', error);
      throw new Error('Antivirus scan failed');
    }
  }

  /**
   * Run ClamAV scan on file
   */
  private async runClamAVScan(filePath: string): Promise<ScanResult> {
    try {
      // Use clamscan command
      const { stdout, stderr } = await execAsync(`clamscan --no-summary "${filePath}"`);
      
      const clean = !stdout.includes('FOUND');
      const threats: string[] = [];

      if (!clean) {
        // Parse threats from output
        const lines = stdout.split('\n');
        lines.forEach(line => {
          if (line.includes('FOUND')) {
            const threat = line.split(':')[1]?.replace('FOUND', '').trim();
            if (threat) threats.push(threat);
          }
        });
      }

      return {
        clean,
        threats,
        scannedAt: new Date(),
        scanEngine: 'ClamAV',
        fileHash: ''
      };
    } catch (error: any) {
      // If clamscan is not installed, use alternative or mock
      if (error.code === 127) {
        logger.warn('ClamAV not installed, using mock scanner');
        return this.mockScan(filePath);
      }
      throw error;
    }
  }

  /**
   * Mock scanner for development/testing
   */
  private async mockScan(filePath: string): Promise<ScanResult> {
    // Simulate virus detection for test files
    const fileName = path.basename(filePath);
    const isMalicious = fileName.includes('eicar') || fileName.includes('virus');

    return {
      clean: !isMalicious,
      threats: isMalicious ? ['Test.Virus.EICAR'] : [],
      scannedAt: new Date(),
      scanEngine: 'MockScanner',
      fileHash: await this.calculateFileHash(filePath)
    };
  }

  /**
   * Calculate SHA256 hash of file
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /**
   * Check if file was already scanned
   */
  private async checkExistingScan(fileHash: string): Promise<ScanResult | null> {
    try {
      const result = await db('av_scans')
        .where({ file_hash: fileHash, clean: true })
        .orderBy('scanned_at', 'desc')
        .first();

      if (result) {
        return {
          clean: result.clean,
          threats: result.threats || [],
          scannedAt: result.scanned_at,
          scanEngine: result.scan_engine,
          fileHash: result.file_hash
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to check existing scan:', error);
      return null;
    }
  }

  /**
   * Store scan result in database
   */
  private async storeScanResult(fileHash: string, result: ScanResult): Promise<void> {
    await db('av_scans').insert({
      file_hash: fileHash,
      clean: result.clean,
      threats: JSON.stringify(result.threats),
      scanned_at: result.scannedAt,
      scan_engine: result.scanEngine
    });
  }

  /**
   * Move infected file to quarantine
   */
  private async quarantineFile(
    filePath: string,
    fileHash: string,
    threats: string[]
  ): Promise<void> {
    const quarantinedPath = path.join(
      this.quarantinePath,
      `${fileHash}_${Date.now()}_infected`
    );

    // Move file to quarantine
    fs.renameSync(filePath, quarantinedPath);

    // Log quarantine action
    await db('quarantined_files').insert({
      original_path: filePath,
      quarantine_path: quarantinedPath,
      file_hash: fileHash,
      threats: JSON.stringify(threats),
      quarantined_at: new Date()
    });

    logger.warn(`File quarantined: ${filePath} -> ${quarantinedPath}`, { threats });
  }

  /**
   * Scan S3 file by downloading temporarily
   */
  async scanS3File(s3Url: string): Promise<ScanResult> {
    const tempFile = path.join(this.tempPath, `scan_${Date.now()}`);
    
    try {
      // Download file temporarily
      // Implementation depends on your S3 setup
      
      // Scan the file
      const result = await this.scanFile(tempFile);
      
      return result;
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
}

export const antivirusService = new AntivirusService();
```

### FILE: src/services/storage.s3.ts
```typescript
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface UploadOptions {
  contentType: string;
  maxSize: number;
  allowedTypes?: string[];
  expiresIn?: number;
}

interface SignedUrlResponse {
  uploadUrl: string;
  fileKey: string;
  expiresAt: Date;
}

export class S3StorageService {
  private s3: AWS.S3;
  private bucketName: string;
  private region: string;

  constructor() {
    this.bucketName = process.env.S3_BUCKET || 'tickettoken-files';
    this.region = process.env.AWS_REGION || 'us-east-1';
    
    this.s3 = new AWS.S3({
      region: this.region,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      signatureVersion: 'v4'
    });
  }

  /**
   * Generate a signed URL for secure file upload
   */
  async generateSignedUploadUrl(
    userId: string,
    options: UploadOptions
  ): Promise<SignedUrlResponse> {
    try {
      // Validate content type
      if (options.allowedTypes && !options.allowedTypes.includes(options.contentType)) {
        throw new Error(`Content type ${options.contentType} not allowed`);
      }

      // Generate unique file key
      const fileKey = `uploads/${userId}/${uuidv4()}-${Date.now()}`;
      const expiresIn = options.expiresIn || 300; // 5 minutes default

      // Create signed URL with conditions
      const params = {
        Bucket: this.bucketName,
        Key: fileKey,
        Expires: expiresIn,
        ContentType: options.contentType,
        Conditions: [
          ['content-length-range', 0, options.maxSize],
          ['starts-with', '$Content-Type', options.contentType.split('/')[0]]
        ],
        Metadata: {
          userId,
          uploadedAt: new Date().toISOString(),
          status: 'pending_scan'
        }
      };

      const uploadUrl = await this.s3.getSignedUrlPromise('putObject', params);

      logger.info(`Generated signed URL for user ${userId}, key: ${fileKey}`);

      return {
        uploadUrl,
        fileKey,
        expiresAt: new Date(Date.now() + expiresIn * 1000)
      };
    } catch (error) {
      logger.error('Failed to generate signed URL:', error);
      throw error;
    }
  }

  /**
   * Generate signed URL for secure download
   */
  async generateSignedDownloadUrl(
    fileKey: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const params = {
      Bucket: this.bucketName,
      Key: fileKey,
      Expires: expiresIn
    };

    return await this.s3.getSignedUrlPromise('getObject', params);
  }

  /**
   * Delete file from S3
   */
  async deleteFile(fileKey: string): Promise<void> {
    await this.s3.deleteObject({
      Bucket: this.bucketName,
      Key: fileKey
    }).promise();

    logger.info(`Deleted file: ${fileKey}`);
  }

  /**
   * Set lifecycle policy for automatic cleanup
   */
  async setupLifecyclePolicy(): Promise<void> {
    const policy = {
      Rules: [
        {
          Id: 'DeleteTempFiles',
          Status: 'Enabled',
          Prefix: 'temp/',
          Expiration: {
            Days: 1 // Delete temp files after 24 hours
          }
        },
        {
          Id: 'DeleteOldUploads',
          Status: 'Enabled',
          Prefix: 'uploads/',
          Expiration: {
            Days: 90 // Delete uploads after 90 days
          }
        },
        {
          Id: 'MoveToGlacier',
          Status: 'Enabled',
          Prefix: 'archive/',
          Transitions: [
            {
              Days: 30,
              StorageClass: 'GLACIER' // Archive old files to Glacier
            }
          ]
        }
      ]
    };

    await this.s3.putBucketLifecycleConfiguration({
      Bucket: this.bucketName,
      LifecycleConfiguration: policy
    }).promise();

    logger.info('Lifecycle policy configured');
  }
}

export const s3Storage = new S3StorageService();
```

### FILE: src/services/file-search.service.ts
```typescript
import { getPool } from '../config/database.config';

export interface SearchFilters {
  filename?: string;
  mimeType?: string;
  entityType?: string;
  entityId?: string;
  uploadedBy?: string;
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  isPublic?: boolean;
}

export class FileSearchService {
  async search(filters: SearchFilters, limit: number = 100, offset: number = 0): Promise<any> {
    const pool = getPool();
    if (!pool) return { files: [], total: 0 };
    
    let query = 'SELECT * FROM files WHERE deleted_at IS NULL';
    const params: any[] = [];
    let paramCount = 0;
    
    if (filters.filename) {
      query += ` AND filename ILIKE $${++paramCount}`;
      params.push(`%${filters.filename}%`);
    }
    
    if (filters.mimeType) {
      query += ` AND mime_type LIKE $${++paramCount}`;
      params.push(`${filters.mimeType}%`);
    }
    
    if (filters.entityType) {
      query += ` AND entity_type = $${++paramCount}`;
      params.push(filters.entityType);
    }
    
    if (filters.entityId) {
      query += ` AND entity_id = $${++paramCount}`;
      params.push(filters.entityId);
    }
    
    if (filters.uploadedBy) {
      query += ` AND uploaded_by = $${++paramCount}`;
      params.push(filters.uploadedBy);
    }
    
    if (filters.tags && filters.tags.length > 0) {
      query += ` AND tags && $${++paramCount}`;
      params.push(filters.tags);
    }
    
    if (filters.minSize) {
      query += ` AND size_bytes >= $${++paramCount}`;
      params.push(filters.minSize);
    }
    
    if (filters.maxSize) {
      query += ` AND size_bytes <= $${++paramCount}`;
      params.push(filters.maxSize);
    }
    
    if (filters.startDate) {
      query += ` AND created_at >= $${++paramCount}`;
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ` AND created_at <= $${++paramCount}`;
      params.push(filters.endDate);
    }
    
    if (filters.status) {
      query += ` AND status = $${++paramCount}`;
      params.push(filters.status);
    }
    
    if (filters.isPublic !== undefined) {
      query += ` AND is_public = $${++paramCount}`;
      params.push(filters.isPublic);
    }
    
    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get paginated results
    query += ` ORDER BY created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    return {
      files: result.rows,
      total,
      limit,
      offset
    };
  }
  
  async searchByContent(searchText: string, limit: number = 100): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    // Search in document metadata
    const result = await pool.query(
      `SELECT f.*, dm.extracted_text 
       FROM files f
       JOIN document_metadata dm ON dm.file_id = f.id
       WHERE dm.extracted_text ILIKE $1
       AND f.deleted_at IS NULL
       ORDER BY f.created_at DESC
       LIMIT $2`,
      [`%${searchText}%`, limit]
    );
    
    return result.rows;
  }
  
  async getRecentFiles(limit: number = 10): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT * FROM files 
       WHERE deleted_at IS NULL 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }
  
  async getMostAccessed(limit: number = 10): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT f.*, COUNT(fal.id) as access_count
       FROM files f
       LEFT JOIN file_access_logs fal ON fal.file_id = f.id
       WHERE f.deleted_at IS NULL
       GROUP BY f.id
       ORDER BY access_count DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }
}

export const fileSearchService = new FileSearchService();
```

### FILE: src/services/cdn.service.ts
```typescript
import { logger } from '../utils/logger';

export interface CDNConfig {
  provider: 'cloudfront' | 'cloudflare' | 'local';
  domain?: string;
  distributionId?: string;
}

export class CDNService {
  private config: CDNConfig;
  
  constructor() {
    this.config = {
      provider: process.env.CDN_PROVIDER as any || 'local',
      domain: process.env.CDN_DOMAIN,
      distributionId: process.env.CDN_DISTRIBUTION_ID
    };
  }
  
  getPublicUrl(path: string): string {
    if (this.config.provider === 'local') {
      return `/files/${path}`;
    }
    
    return `https://${this.config.domain}/${path}`;
  }
  
  async invalidateCache(paths: string[]): Promise<void> {
    if (this.config.provider === 'cloudfront') {
      await this.invalidateCloudFront(paths);
    } else if (this.config.provider === 'cloudflare') {
      await this.invalidateCloudFlare(paths);
    }
  }
  
  private async invalidateCloudFront(paths: string[]): Promise<void> {
    // AWS CloudFront invalidation
    logger.info(`Invalidating CloudFront cache for ${paths.length} paths`);
    // Implementation would use AWS SDK
  }
  
  private async invalidateCloudFlare(paths: string[]): Promise<void> {
    // CloudFlare cache purge
    logger.info(`Purging CloudFlare cache for ${paths.length} paths`);
    // Implementation would use CloudFlare API
  }
  
  generateResponsiveUrls(basePath: string, sizes: number[]): Record<string, string> {
    const urls: Record<string, string> = {};
    
    for (const size of sizes) {
      const sizePath = basePath.replace(/\.[^.]+$/, `_${size}w.jpg`);
      urls[`${size}w`] = this.getPublicUrl(sizePath);
    }
    
    return urls;
  }
  
  generateSrcSet(basePath: string): string {
    const sizes = [320, 640, 960, 1280, 1920];
    const srcset = sizes.map(size => {
      const url = this.getPublicUrl(basePath.replace(/\.[^.]+$/, `_${size}w.jpg`));
      return `${url} ${size}w`;
    }).join(', ');
    
    return srcset;
  }
}

export const cdnService = new CDNService();
```

### FILE: src/services/cleanup.service.ts
```typescript
import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export class CleanupService {
  async cleanupOrphanedFiles(): Promise<{ cleaned: number }> {
    const pool = getPool();
    if (!pool) return { cleaned: 0 };
    
    let cleaned = 0;
    
    // Find files marked as deleted
    const deletedFiles = await pool.query(
      `SELECT * FROM files 
       WHERE deleted_at IS NOT NULL 
       AND deleted_at < NOW() - INTERVAL '7 days'`
    );
    
    for (const file of deletedFiles.rows) {
      try {
        // Delete from storage
        await storageService.delete(file.storage_path).catch(() => {});
        
        // Hard delete from database
        await pool.query('DELETE FROM files WHERE id = $1', [file.id]);
        
        cleaned++;
      } catch (error) {
        logger.error(`Failed to cleanup file ${file.id}:`, error);
      }
    }
    
    // Clean expired upload sessions
    await pool.query(
      `UPDATE upload_sessions 
       SET status = 'expired' 
       WHERE status = 'active' 
       AND expires_at < NOW()`
    );
    
    // Clean old access logs
    await pool.query(
      `DELETE FROM file_access_logs 
       WHERE accessed_at < NOW() - INTERVAL '90 days'`
    );
    
    return { cleaned };
  }
  
  async cleanupTempFiles(): Promise<{ cleaned: number }> {
    let cleaned = 0;
    const tempDir = './temp';
    
    try {
      const files = await fs.readdir(tempDir);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        // Delete files older than 24 hours
        if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
          await fs.unlink(filePath).catch(() => {});
          cleaned++;
        }
      }
    } catch (error) {
      logger.error('Temp cleanup failed:', error);
    }
    
    return { cleaned };
  }
  
  async calculateStorageUsage(): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    
    // Calculate usage by entity
    await pool.query(`
      INSERT INTO storage_usage (entity_type, entity_id, total_files, total_bytes, 
                                 image_bytes, document_bytes, video_bytes, other_bytes)
      SELECT 
        entity_type,
        entity_id,
        COUNT(*) as total_files,
        SUM(size_bytes) as total_bytes,
        SUM(CASE WHEN mime_type LIKE 'image/%' THEN size_bytes ELSE 0 END) as image_bytes,
        SUM(CASE WHEN mime_type LIKE '%pdf%' OR mime_type LIKE '%document%' THEN size_bytes ELSE 0 END) as document_bytes,
        SUM(CASE WHEN mime_type LIKE 'video/%' THEN size_bytes ELSE 0 END) as video_bytes,
        SUM(CASE WHEN mime_type NOT LIKE 'image/%' 
                 AND mime_type NOT LIKE 'video/%' 
                 AND mime_type NOT LIKE '%pdf%' 
                 AND mime_type NOT LIKE '%document%' THEN size_bytes ELSE 0 END) as other_bytes
      FROM files
      WHERE deleted_at IS NULL
      AND entity_type IS NOT NULL
      AND entity_id IS NOT NULL
      GROUP BY entity_type, entity_id
      ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        total_files = EXCLUDED.total_files,
        total_bytes = EXCLUDED.total_bytes,
        image_bytes = EXCLUDED.image_bytes,
        document_bytes = EXCLUDED.document_bytes,
        video_bytes = EXCLUDED.video_bytes,
        other_bytes = EXCLUDED.other_bytes,
        calculated_at = NOW()
    `);
    
    logger.info('Storage usage calculated');
  }
  
  async enforceStorageLimits(): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    
    // Check entities exceeding limits
    const result = await pool.query(`
      SELECT su.*, su.total_bytes > su.max_bytes as exceeds_limit
      FROM storage_usage su
      WHERE su.max_bytes IS NOT NULL
      AND su.total_bytes > su.max_bytes
    `);
    
    for (const entity of result.rows) {
      logger.warn(`Entity ${entity.entity_type}/${entity.entity_id} exceeds storage limit: ${entity.total_bytes}/${entity.max_bytes}`);
      // Could implement automatic cleanup or notifications here
    }
  }
}

export const cleanupService = new CleanupService();
```

### FILE: src/types/fluent-ffmpeg.d.ts
```typescript
declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    ffprobe(file: string, callback: (err: any, metadata: any) => void): void;
    // Add other methods as needed
  }
  
  function ffmpeg(input?: string): FfmpegCommand;
  
  namespace ffmpeg {
    function ffprobe(file: string, callback: (err: any, metadata: any) => void): void;
  }
  
  export = ffmpeg;
}
```

### FILE: src/types/file.types.ts
```typescript
export type FileStatus = 'uploading' | 'processing' | 'ready' | 'failed' | 'deleted';

export interface FileUpdate {
  status?: FileStatus;
  metadata?: any;
}

export interface FileRecord {
  id: string;
  // File identification
  filename: string;
  original_filename: string;
  mime_type: string;
  extension?: string;
  // Storage location
  storage_provider: string;
  bucket_name?: string;
  storage_path: string;
  cdn_url?: string;
  // File properties
  size_bytes: number;
  hash_sha256?: string;
  // Ownership
  uploaded_by?: string;
  entity_type?: string;
  entity_id?: string;
  // Access control
  is_public: boolean;
  access_level: string;
  // Status
  status: FileStatus;
  processing_error?: string;
  // Metadata
  metadata?: any;
  tags?: string[];
  // Timestamps
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
  
  // Aliases for backwards compatibility
  file_name?: string;
  file_key?: string;
  content_type?: string;
  mimeType?: string;
  storagePath?: string;
  sizeBytes?: number;
  cdnUrl?: string;
  hashSha256?: string;
  uploadedBy?: string;
  entityType?: string;
  entityId?: string;
  isPublic?: boolean;
  accessLevel?: string;
  file_size?: number;
  user_id?: string;
  originalFilename?: string;
}

export interface UploadOptions {
  maxSize?: number;
  allowedTypes?: string[];
  generateThumbnail?: boolean;
  scanForVirus?: boolean;
  entityType?: string;
  entityId?: string;
  isPublic?: boolean;
  metadata?: any;
  tags?: string[];
}
```

### FILE: src/types/express.d.ts
```typescript
import { Express } from 'express-serve-static-core';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        [key: string]: any;
      };
    }
  }
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/file-service//src/routes/health.routes.ts:12:    await pool.query('SELECT 1');
backend/services/file-service//src/config/database.config.ts:20:    await pool.query('SELECT 1');
backend/services/file-service//src/config/database.config.ts:29:      logger.info('Then update DATABASE_URL in .env.development with the working password');
backend/services/file-service//src/controllers/image.controller.ts:169:        'SELECT * FROM image_metadata WHERE file_id = $1',
backend/services/file-service//src/controllers/admin.controller.ts:34:        SELECT
backend/services/file-service//src/controllers/admin.controller.ts:49:        SELECT
backend/services/file-service//src/controllers/admin.controller.ts:60:        SELECT id, filename, mime_type, size_bytes, created_at
backend/services/file-service//src/controllers/admin.controller.ts:101:        SELECT id, storage_path
backend/services/file-service//src/controllers/admin.controller.ts:115:            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
backend/services/file-service//src/controllers/admin.controller.ts:201:        'SELECT id, filename, size_bytes FROM files WHERE id = ANY($1)',
backend/services/file-service//src/controllers/admin.controller.ts:207:        'UPDATE files SET deleted_at = NOW() WHERE id = ANY($1) RETURNING id',
backend/services/file-service//src/controllers/upload.controller.ts:107:      // Update status - Use proper Knex syntax
backend/services/file-service//src/controllers/upload.controller.ts:110:        .update({ 
backend/services/file-service//src/controllers/upload.controller.ts:112:          updated_at: db.fn.now()
backend/services/file-service//src/controllers/upload.controller.ts:139:      // Update status to ready - Use proper Knex syntax
backend/services/file-service//src/controllers/upload.controller.ts:142:        .update({
backend/services/file-service//src/controllers/upload.controller.ts:144:          updated_at: db.fn.now()
backend/services/file-service//src/controllers/upload.controller.ts:153:        .update({
backend/services/file-service//src/controllers/upload.controller.ts:156:          updated_at: db.fn.now()
backend/services/file-service//src/controllers/upload.controller.ts:178:      // Delete from storage - Use the correct method name
backend/services/file-service//src/controllers/upload.controller.ts:181:      // Update database - Use proper Knex syntax
backend/services/file-service//src/controllers/upload.controller.ts:184:        .update({
backend/services/file-service//src/controllers/video.controller.ts:20:        'SELECT * FROM video_metadata WHERE file_id = $1',
backend/services/file-service//src/controllers/video.controller.ts:57:        `INSERT INTO file_processing_queue (file_id, operation, priority) 
backend/services/file-service//src/controllers/video.controller.ts:82:        'SELECT * FROM video_metadata WHERE file_id = $1',
backend/services/file-service//src/controllers/health.controller.ts:13:        await pool.query('SELECT 1');
backend/services/file-service//src/utils/file-helpers.ts:5:  return crypto.createHash('sha256').update(buffer).digest('hex');
backend/services/file-service//src/models/file.model.ts:11:      INSERT INTO files (
backend/services/file-service//src/models/file.model.ts:55:    const query = 'SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL';
backend/services/file-service//src/models/file.model.ts:65:  async updateStatus(id: string, status: FileStatus, error?: string): Promise<void> {
backend/services/file-service//src/models/file.model.ts:70:      UPDATE files
backend/services/file-service//src/models/file.model.ts:71:      SET status = $2, processing_error = $3, updated_at = CURRENT_TIMESTAMP
backend/services/file-service//src/models/file.model.ts:78:  async updateCdnUrl(id: string, cdnUrl: string): Promise<void> {
backend/services/file-service//src/models/file.model.ts:83:      UPDATE files
backend/services/file-service//src/models/file.model.ts:84:      SET cdn_url = $2, updated_at = CURRENT_TIMESTAMP
backend/services/file-service//src/models/file.model.ts:96:      SELECT * FROM files
backend/services/file-service//src/models/file.model.ts:129:      updated_at: row.updated_at,
backend/services/file-service//src/processors/document/document.processor.ts:26:      await fileModel.updateStatus(fileId, 'ready');
backend/services/file-service//src/processors/document/document.processor.ts:30:      await fileModel.updateStatus(fileId, 'failed', error.message);
backend/services/file-service//src/processors/document/document.processor.ts:104:      INSERT INTO document_metadata (
backend/services/file-service//src/processors/document/document.processor.ts:107:      ON CONFLICT (file_id) DO UPDATE SET
backend/services/file-service//src/processors/image/image.processor.ts:105:    // Update database with thumbnail URLs
backend/services/file-service//src/processors/image/image.processor.ts:106:    await this.updateImageMetadata(fileId, thumbnailUrls);
backend/services/file-service//src/processors/image/image.processor.ts:127:      INSERT INTO image_metadata (
backend/services/file-service//src/processors/image/image.processor.ts:130:      ON CONFLICT (file_id) DO UPDATE SET
backend/services/file-service//src/processors/image/image.processor.ts:135:  private async updateImageMetadata(fileId: string, data: any): Promise<void> {
backend/services/file-service//src/processors/image/image.processor.ts:151:      logger.warn('No valid fields to update in image metadata');
backend/services/file-service//src/processors/image/image.processor.ts:159:      UPDATE image_metadata SET ${setClauses} WHERE file_id = $1
backend/services/file-service//src/services/antivirus.service.ts:139:      stream.on('data', chunk => hash.update(chunk));
backend/services/file-service//src/services/access-log.service.ts:19:        `INSERT INTO file_access_logs 
backend/services/file-service//src/services/access-log.service.ts:34:      `SELECT * FROM file_access_logs 
backend/services/file-service//src/services/access-log.service.ts:49:      `SELECT fal.*, f.filename, f.mime_type 
backend/services/file-service//src/services/access-log.service.ts:66:      `SELECT 
backend/services/file-service//src/services/file-version.service.ts:25:      'SELECT MAX(version_number) as max_version FROM file_versions WHERE file_id = $1',
backend/services/file-service//src/services/file-version.service.ts:37:      `INSERT INTO file_versions 
backend/services/file-service//src/services/file-version.service.ts:53:      'SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version_number DESC',
backend/services/file-service//src/services/file-version.service.ts:66:      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
backend/services/file-service//src/services/file-version.service.ts:86:    // Update file record
backend/services/file-service//src/services/file-version.service.ts:88:      'UPDATE files SET size_bytes = $1, hash_sha256 = $2, updated_at = NOW() WHERE id = $3',
backend/services/file-service//src/services/file-version.service.ts:101:      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
backend/services/file-service//src/services/file-version.service.ts:111:    // Delete from storage
backend/services/file-service//src/services/file-version.service.ts:116:      'DELETE FROM file_versions WHERE file_id = $1 AND version_number = $2',
backend/services/file-service//src/services/file-search.service.ts:23:    let query = 'SELECT * FROM files WHERE deleted_at IS NULL';
backend/services/file-service//src/services/file-search.service.ts:88:    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
backend/services/file-service//src/services/file-search.service.ts:112:      `SELECT f.*, dm.extracted_text 
backend/services/file-service//src/services/file-search.service.ts:130:      `SELECT * FROM files 
backend/services/file-service//src/services/file-search.service.ts:145:      `SELECT f.*, COUNT(fal.id) as access_count
backend/services/file-service//src/services/image.service.ts:22:      // Update status
backend/services/file-service//src/services/image.service.ts:23:      await fileModel.updateStatus(fileId, 'ready');
backend/services/file-service//src/services/image.service.ts:29:      await fileModel.updateStatus(fileId, 'failed', error.message);
backend/services/file-service//src/services/batch-operations.service.ts:20:          // Delete from storage
backend/services/file-service//src/services/batch-operations.service.ts:25:            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
backend/services/file-service//src/services/batch-operations.service.ts:54:          'UPDATE files SET entity_type = $1, entity_id = $2 WHERE id = $3',
backend/services/file-service//src/services/batch-operations.service.ts:77:          'UPDATE files SET tags = array_cat(tags, $1) WHERE id = $2',
backend/services/file-service//src/services/chunked-upload.service.ts:27:      INSERT INTO upload_sessions (
backend/services/file-service//src/services/chunked-upload.service.ts:47:      'SELECT * FROM upload_sessions WHERE session_token = $1 AND status = $2',
backend/services/file-service//src/services/chunked-upload.service.ts:67:    // Update session progress
backend/services/file-service//src/services/chunked-upload.service.ts:68:    const updatedChunks = session.uploaded_chunks + 1;
backend/services/file-service//src/services/chunked-upload.service.ts:69:    const updatedBytes = session.uploaded_bytes + chunkData.length;
backend/services/file-service//src/services/chunked-upload.service.ts:72:      UPDATE upload_sessions 
backend/services/file-service//src/services/chunked-upload.service.ts:75:    `, [updatedChunks, updatedBytes, sessionToken]);
backend/services/file-service//src/services/chunked-upload.service.ts:77:    const progress = (updatedChunks / session.total_chunks) * 100;
backend/services/file-service//src/services/chunked-upload.service.ts:78:    const complete = updatedChunks === session.total_chunks;
backend/services/file-service//src/services/chunked-upload.service.ts:91:      'SELECT * FROM upload_sessions WHERE session_token = $1',
backend/services/file-service//src/services/chunked-upload.service.ts:131:      'UPDATE upload_sessions SET status = $1, completed_at = $2 WHERE session_token = $3',
backend/services/file-service//src/services/chunked-upload.service.ts:150:      'UPDATE upload_sessions SET status = $1 WHERE session_token = $2',
backend/services/file-service//src/services/upload.service.ts:63:      // Update file record with CDN URL
backend/services/file-service//src/services/upload.service.ts:64:      await fileModel.updateCdnUrl(fileId, storageResult.publicUrl || '');
backend/services/file-service//src/services/upload.service.ts:66:      // Get the updated record
backend/services/file-service//src/services/upload.service.ts:67:      const updatedRecord = await fileModel.findById(fileId);
backend/services/file-service//src/services/upload.service.ts:69:      if (!updatedRecord) {
backend/services/file-service//src/services/upload.service.ts:70:        logger.warn(`Could not retrieve updated record for ${fileId}`);
backend/services/file-service//src/services/upload.service.ts:77:      return updatedRecord;
backend/services/file-service//src/services/upload.service.ts:84:          await fileModel.updateStatus(fileId, FileStatus.FAILED, error.message);
backend/services/file-service//src/services/upload.service.ts:85:        } catch (updateError) {
backend/services/file-service//src/services/upload.service.ts:86:          logger.error('Failed to update file status:', updateError);
backend/services/file-service//src/services/cleanup.service.ts:16:      `SELECT * FROM files 
backend/services/file-service//src/services/cleanup.service.ts:23:        // Delete from storage
backend/services/file-service//src/services/cleanup.service.ts:26:        // Hard delete from database
backend/services/file-service//src/services/cleanup.service.ts:27:        await pool.query('DELETE FROM files WHERE id = $1', [file.id]);
backend/services/file-service//src/services/cleanup.service.ts:37:      `UPDATE upload_sessions 
backend/services/file-service//src/services/cleanup.service.ts:45:      `DELETE FROM file_access_logs 
backend/services/file-service//src/services/cleanup.service.ts:83:      INSERT INTO storage_usage (entity_type, entity_id, total_files, total_bytes, 
backend/services/file-service//src/services/cleanup.service.ts:85:      SELECT 
backend/services/file-service//src/services/cleanup.service.ts:102:      ON CONFLICT (entity_type, entity_id) DO UPDATE SET
backend/services/file-service//src/services/cleanup.service.ts:121:      SELECT su.*, su.total_bytes > su.max_bytes as exceeds_limit
backend/services/file-service//src/types/file.types.ts:3:export interface FileUpdate {
backend/services/file-service//src/types/file.types.ts:38:  updated_at: Date;

### All JOIN operations:
backend/services/file-service//src/app.ts:50:      root: path.join(__dirname, '../uploads'),
backend/services/file-service//src/storage/providers/local.provider.ts:23:    const filePath = path.join(this.basePath, key);
backend/services/file-service//src/storage/providers/local.provider.ts:43:    const filePath = path.join(this.basePath, key);
backend/services/file-service//src/storage/providers/local.provider.ts:48:    const filePath = path.join(this.basePath, key);
backend/services/file-service//src/storage/providers/local.provider.ts:53:    const filePath = path.join(this.basePath, key);
backend/services/file-service//src/controllers/admin.controller.ts:130:        const filePath = path.join(tempDir, file);
backend/services/file-service//src/utils/logger.ts:16:      filename: path.join(logDir, 'error.log'), 
backend/services/file-service//src/utils/logger.ts:20:      filename: path.join(logDir, 'combined.log') 
backend/services/file-service//src/processors/image/image.processor.ts:155:    const setClauses = validFields.map((key, idx) => `${key} = $${idx + 2}`).join(', ');
backend/services/file-service//src/services/antivirus.service.ts:192:    const quarantinedPath = path.join(
backend/services/file-service//src/services/antivirus.service.ts:216:    const tempFile = path.join(this.tempPath, `scan_${Date.now()}`);
backend/services/file-service//src/services/access-log.service.ts:51:       JOIN files f ON f.id = fal.file_id
backend/services/file-service//src/services/file-search.service.ts:114:       JOIN document_metadata dm ON dm.file_id = f.id
backend/services/file-service//src/services/file-search.service.ts:147:       LEFT JOIN file_access_logs fal ON fal.file_id = f.id
backend/services/file-service//src/services/cdn.service.ts:64:    }).join(', ');
backend/services/file-service//src/services/virus-scan.service.ts:43:        logger.warn(`Virus detected: ${viruses.join(', ')}`);
backend/services/file-service//src/services/virus-scan.service.ts:69:        logger.warn(`Virus detected in ${file}: ${viruses.join(', ')}`);
backend/services/file-service//src/services/chunked-upload.service.ts:63:    const chunkPath = path.join('./temp', 'chunks', sessionToken, `chunk_${chunkNumber}`);
backend/services/file-service//src/services/chunked-upload.service.ts:106:    const chunksDir = path.join('./temp', 'chunks', sessionToken);
backend/services/file-service//src/services/chunked-upload.service.ts:110:      const chunkPath = path.join(chunksDir, `chunk_${i}`);
backend/services/file-service//src/services/chunked-upload.service.ts:145:    const chunksDir = path.join('./temp', 'chunks', sessionToken);
backend/services/file-service//src/services/cleanup.service.ts:61:        const filePath = path.join(tempDir, file);

### All WHERE clauses:
backend/services/file-service//src/controllers/image.controller.ts:169:        'SELECT * FROM image_metadata WHERE file_id = $1',
backend/services/file-service//src/controllers/admin.controller.ts:44:        WHERE deleted_at IS NULL
backend/services/file-service//src/controllers/admin.controller.ts:54:        WHERE deleted_at IS NULL AND entity_type IS NOT NULL
backend/services/file-service//src/controllers/admin.controller.ts:103:        WHERE status = 'ready' AND deleted_at IS NULL
backend/services/file-service//src/controllers/admin.controller.ts:115:            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
backend/services/file-service//src/controllers/admin.controller.ts:201:        'SELECT id, filename, size_bytes FROM files WHERE id = ANY($1)',
backend/services/file-service//src/controllers/admin.controller.ts:207:        'UPDATE files SET deleted_at = NOW() WHERE id = ANY($1) RETURNING id',
backend/services/file-service//src/controllers/video.controller.ts:20:        'SELECT * FROM video_metadata WHERE file_id = $1',
backend/services/file-service//src/controllers/video.controller.ts:82:        'SELECT * FROM video_metadata WHERE file_id = $1',
backend/services/file-service//src/models/file.model.ts:55:    const query = 'SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL';
backend/services/file-service//src/models/file.model.ts:72:      WHERE id = $1
backend/services/file-service//src/models/file.model.ts:85:      WHERE id = $1
backend/services/file-service//src/models/file.model.ts:97:      WHERE entity_type = $1 AND entity_id = $2 AND deleted_at IS NULL
backend/services/file-service//src/processors/image/image.processor.ts:159:      UPDATE image_metadata SET ${setClauses} WHERE file_id = $1
backend/services/file-service//src/services/access-log.service.ts:35:       WHERE file_id = $1 
backend/services/file-service//src/services/access-log.service.ts:52:       WHERE fal.accessed_by = $1 
backend/services/file-service//src/services/access-log.service.ts:75:       WHERE file_id = $1`,
backend/services/file-service//src/services/file-version.service.ts:25:      'SELECT MAX(version_number) as max_version FROM file_versions WHERE file_id = $1',
backend/services/file-service//src/services/file-version.service.ts:53:      'SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version_number DESC',
backend/services/file-service//src/services/file-version.service.ts:66:      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
backend/services/file-service//src/services/file-version.service.ts:88:      'UPDATE files SET size_bytes = $1, hash_sha256 = $2, updated_at = NOW() WHERE id = $3',
backend/services/file-service//src/services/file-version.service.ts:101:      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
backend/services/file-service//src/services/file-version.service.ts:116:      'DELETE FROM file_versions WHERE file_id = $1 AND version_number = $2',
backend/services/file-service//src/services/file-search.service.ts:23:    let query = 'SELECT * FROM files WHERE deleted_at IS NULL';
backend/services/file-service//src/services/file-search.service.ts:115:       WHERE dm.extracted_text ILIKE $1
backend/services/file-service//src/services/file-search.service.ts:131:       WHERE deleted_at IS NULL 
backend/services/file-service//src/services/file-search.service.ts:148:       WHERE f.deleted_at IS NULL
backend/services/file-service//src/services/batch-operations.service.ts:25:            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
backend/services/file-service//src/services/batch-operations.service.ts:54:          'UPDATE files SET entity_type = $1, entity_id = $2 WHERE id = $3',
backend/services/file-service//src/services/batch-operations.service.ts:77:          'UPDATE files SET tags = array_cat(tags, $1) WHERE id = $2',
backend/services/file-service//src/services/chunked-upload.service.ts:47:      'SELECT * FROM upload_sessions WHERE session_token = $1 AND status = $2',
backend/services/file-service//src/services/chunked-upload.service.ts:74:      WHERE session_token = $3
backend/services/file-service//src/services/chunked-upload.service.ts:91:      'SELECT * FROM upload_sessions WHERE session_token = $1',
backend/services/file-service//src/services/chunked-upload.service.ts:131:      'UPDATE upload_sessions SET status = $1, completed_at = $2 WHERE session_token = $3',
backend/services/file-service//src/services/chunked-upload.service.ts:150:      'UPDATE upload_sessions SET status = $1 WHERE session_token = $2',
backend/services/file-service//src/services/cleanup.service.ts:17:       WHERE deleted_at IS NOT NULL 
backend/services/file-service//src/services/cleanup.service.ts:27:        await pool.query('DELETE FROM files WHERE id = $1', [file.id]);
backend/services/file-service//src/services/cleanup.service.ts:39:       WHERE status = 'active' 
backend/services/file-service//src/services/cleanup.service.ts:46:       WHERE accessed_at < NOW() - INTERVAL '90 days'`
backend/services/file-service//src/services/cleanup.service.ts:98:      WHERE deleted_at IS NULL
backend/services/file-service//src/services/cleanup.service.ts:123:      WHERE su.max_bytes IS NOT NULL

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import { Pool } from 'pg';
import knex from 'knex';

export const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

export const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  }
});
```
### .env.example
```
# ================================================
# FILE-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: file-service
# Port: 3013
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=file-service           # Service identifier

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/storage/storage.service.ts
```typescript
import { StorageProvider, StorageResult } from './providers/storage.provider';
import { LocalStorageProvider } from './providers/local.provider';
import { S3StorageProvider } from './providers/s3.provider';
import { logger } from '../utils/logger';

export class StorageService {
  private provider: StorageProvider;
  
  constructor() {
    // Choose provider based on environment
    if (process.env.STORAGE_PROVIDER === 's3' && process.env.NODE_ENV === 'production') {
      this.provider = new S3StorageProvider({
        region: process.env.AWS_REGION!,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        bucketName: process.env.S3_BUCKET_NAME!,
        cdnDomain: process.env.CDN_DOMAIN
      });
      logger.info('Using S3 storage provider');
    } else {
      this.provider = new LocalStorageProvider();
      logger.info('Using local storage provider');
    }
  }
  
  async upload(file: Buffer, key: string): Promise<StorageResult> {
    return this.provider.upload(file, key);
  }
  
  async download(key: string): Promise<Buffer> {
    return this.provider.download(key);
  }
  
  async delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }
  
  async exists(key: string): Promise<boolean> {
    return this.provider.exists(key);
  }
  
  getUrl(key: string): string {
    return this.provider.getUrl(key);
  }
}

export const storageService = new StorageService();
```

### FILE: src/services/antivirus.service.ts
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { db } from '../config/database';

const execAsync = promisify(exec);

interface ScanResult {
  clean: boolean;
  threats: string[];
  scannedAt: Date;
  scanEngine: string;
  fileHash: string;
}

export class AntivirusService {
  private quarantinePath: string;
  private tempPath: string;

  constructor() {
    this.quarantinePath = process.env.QUARANTINE_PATH || '/var/quarantine';
    this.tempPath = process.env.TEMP_PATH || '/tmp/av-scan';
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  private ensureDirectories() {
    [this.quarantinePath, this.tempPath].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Scan file for viruses using ClamAV
   */
  async scanFile(filePath: string): Promise<ScanResult> {
    try {
      logger.info(`Starting AV scan for: ${filePath}`);

      // Calculate file hash for tracking
      const fileHash = await this.calculateFileHash(filePath);

      // Check if file was already scanned
      const existingScan = await this.checkExistingScan(fileHash);
      if (existingScan && existingScan.clean) {
        logger.info(`File already scanned and clean: ${fileHash}`);
        return existingScan;
      }

      // Run ClamAV scan
      const scanResult = await this.runClamAVScan(filePath);

      // Store scan result
      await this.storeScanResult(fileHash, scanResult);

      // If infected, quarantine the file
      if (!scanResult.clean) {
        await this.quarantineFile(filePath, fileHash, scanResult.threats);
      }

      return scanResult;
    } catch (error) {
      logger.error('AV scan failed:', error);
      throw new Error('Antivirus scan failed');
    }
  }

  /**
   * Run ClamAV scan on file
   */
  private async runClamAVScan(filePath: string): Promise<ScanResult> {
    try {
      // Use clamscan command
      const { stdout, stderr } = await execAsync(`clamscan --no-summary "${filePath}"`);
      
      const clean = !stdout.includes('FOUND');
      const threats: string[] = [];

      if (!clean) {
        // Parse threats from output
        const lines = stdout.split('\n');
        lines.forEach(line => {
          if (line.includes('FOUND')) {
            const threat = line.split(':')[1]?.replace('FOUND', '').trim();
            if (threat) threats.push(threat);
          }
        });
      }

      return {
        clean,
        threats,
        scannedAt: new Date(),
        scanEngine: 'ClamAV',
        fileHash: ''
      };
    } catch (error: any) {
      // If clamscan is not installed, use alternative or mock
      if (error.code === 127) {
        logger.warn('ClamAV not installed, using mock scanner');
        return this.mockScan(filePath);
      }
      throw error;
    }
  }

  /**
   * Mock scanner for development/testing
   */
  private async mockScan(filePath: string): Promise<ScanResult> {
    // Simulate virus detection for test files
    const fileName = path.basename(filePath);
    const isMalicious = fileName.includes('eicar') || fileName.includes('virus');

    return {
      clean: !isMalicious,
      threats: isMalicious ? ['Test.Virus.EICAR'] : [],
      scannedAt: new Date(),
      scanEngine: 'MockScanner',
      fileHash: await this.calculateFileHash(filePath)
    };
  }

  /**
   * Calculate SHA256 hash of file
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /**
   * Check if file was already scanned
   */
  private async checkExistingScan(fileHash: string): Promise<ScanResult | null> {
    try {
      const result = await db('av_scans')
        .where({ file_hash: fileHash, clean: true })
        .orderBy('scanned_at', 'desc')
        .first();

      if (result) {
        return {
          clean: result.clean,
          threats: result.threats || [],
          scannedAt: result.scanned_at,
          scanEngine: result.scan_engine,
          fileHash: result.file_hash
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to check existing scan:', error);
      return null;
    }
  }

  /**
   * Store scan result in database
   */
  private async storeScanResult(fileHash: string, result: ScanResult): Promise<void> {
    await db('av_scans').insert({
      file_hash: fileHash,
      clean: result.clean,
      threats: JSON.stringify(result.threats),
      scanned_at: result.scannedAt,
      scan_engine: result.scanEngine
    });
  }

  /**
   * Move infected file to quarantine
   */
  private async quarantineFile(
    filePath: string,
    fileHash: string,
    threats: string[]
  ): Promise<void> {
    const quarantinedPath = path.join(
      this.quarantinePath,
      `${fileHash}_${Date.now()}_infected`
    );

    // Move file to quarantine
    fs.renameSync(filePath, quarantinedPath);

    // Log quarantine action
    await db('quarantined_files').insert({
      original_path: filePath,
      quarantine_path: quarantinedPath,
      file_hash: fileHash,
      threats: JSON.stringify(threats),
      quarantined_at: new Date()
    });

    logger.warn(`File quarantined: ${filePath} -> ${quarantinedPath}`, { threats });
  }

  /**
   * Scan S3 file by downloading temporarily
   */
  async scanS3File(s3Url: string): Promise<ScanResult> {
    const tempFile = path.join(this.tempPath, `scan_${Date.now()}`);
    
    try {
      // Download file temporarily
      // Implementation depends on your S3 setup
      
      // Scan the file
      const result = await this.scanFile(tempFile);
      
      return result;
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
}

export const antivirusService = new AntivirusService();
```

### FILE: src/services/access-log.service.ts
```typescript
import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';

export class AccessLogService {
  async logAccess(
    fileId: string,
    accessType: 'view' | 'download' | 'share' | 'stream',
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    responseCode?: number,
    bytesSent?: number
  ): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    
    try {
      await pool.query(
        `INSERT INTO file_access_logs 
         (file_id, accessed_by, access_type, ip_address, user_agent, response_code, bytes_sent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [fileId, userId, accessType, ipAddress, userAgent, responseCode, bytesSent]
      );
    } catch (error) {
      logger.error('Failed to log file access:', error);
    }
  }
  
  async getAccessLogs(fileId: string, limit: number = 100): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT * FROM file_access_logs 
       WHERE file_id = $1 
       ORDER BY accessed_at DESC 
       LIMIT $2`,
      [fileId, limit]
    );
    
    return result.rows;
  }
  
  async getUserAccessHistory(userId: string, limit: number = 100): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT fal.*, f.filename, f.mime_type 
       FROM file_access_logs fal
       JOIN files f ON f.id = fal.file_id
       WHERE fal.accessed_by = $1 
       ORDER BY fal.accessed_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows;
  }
  
  async getFileAccessStats(fileId: string): Promise<any> {
    const pool = getPool();
    if (!pool) return null;
    
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_accesses,
        COUNT(DISTINCT accessed_by) as unique_users,
        COUNT(CASE WHEN access_type = 'download' THEN 1 END) as downloads,
        COUNT(CASE WHEN access_type = 'view' THEN 1 END) as views,
        COUNT(CASE WHEN access_type = 'share' THEN 1 END) as shares,
        SUM(bytes_sent) as total_bytes_sent,
        MAX(accessed_at) as last_accessed
       FROM file_access_logs 
       WHERE file_id = $1`,
      [fileId]
    );
    
    return result.rows[0];
  }
}

export const accessLogService = new AccessLogService();
```

### FILE: src/services/file-version.service.ts
```typescript
import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { fileModel } from '../models/file.model';
import { generateFileHash } from '../utils/file-helpers';
import { logger } from '../utils/logger';

export class FileVersionService {
  async createVersion(
    fileId: string,
    buffer: Buffer,
    changeDescription?: string,
    userId?: string
  ): Promise<number> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get current file
    const file = await fileModel.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }
    
    // Get latest version number
    const versionResult = await pool.query(
      'SELECT MAX(version_number) as max_version FROM file_versions WHERE file_id = $1',
      [fileId]
    );
    
    const nextVersion = (versionResult.rows[0].max_version || 0) + 1;
    
    // Save new version
    const versionPath = file.storagePath.replace(/\.[^.]+$/, `_v${nextVersion}.$1`);
    await storageService.upload(buffer, versionPath);
    
    // Create version record
    await pool.query(
      `INSERT INTO file_versions 
       (file_id, version_number, storage_path, size_bytes, hash_sha256, change_description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [fileId, nextVersion, versionPath, buffer.length, generateFileHash(buffer), changeDescription, userId]
    );
    
    logger.info(`Created version ${nextVersion} for file ${fileId}`);
    
    return nextVersion;
  }
  
  async getVersions(fileId: string): Promise<any[]> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    const result = await pool.query(
      'SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version_number DESC',
      [fileId]
    );
    
    return result.rows;
  }
  
  async restoreVersion(fileId: string, versionNumber: number): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get version
    const versionResult = await pool.query(
      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
      [fileId, versionNumber]
    );
    
    if (versionResult.rows.length === 0) {
      throw new Error('Version not found');
    }
    
    const version = versionResult.rows[0];
    
    // Get file
    const file = await fileModel.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }
    
    // Copy version to main file
    const buffer = await storageService.download(version.storage_path);
    await storageService.upload(buffer, file.storagePath);
    
    // Update file record
    await pool.query(
      'UPDATE files SET size_bytes = $1, hash_sha256 = $2, updated_at = NOW() WHERE id = $3',
      [version.size_bytes, version.hash_sha256, fileId]
    );
    
    logger.info(`Restored version ${versionNumber} for file ${fileId}`);
  }
  
  async deleteVersion(fileId: string, versionNumber: number): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get version
    const versionResult = await pool.query(
      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
      [fileId, versionNumber]
    );
    
    if (versionResult.rows.length === 0) {
      throw new Error('Version not found');
    }
    
    const version = versionResult.rows[0];
    
    // Delete from storage
    await storageService.delete(version.storage_path);
    
    // Delete record
    await pool.query(
      'DELETE FROM file_versions WHERE file_id = $1 AND version_number = $2',
      [fileId, versionNumber]
    );
    
    logger.info(`Deleted version ${versionNumber} for file ${fileId}`);
  }
}

export const fileVersionService = new FileVersionService();
```

### FILE: src/services/qr.service.ts
```typescript
export class QRService {
  async generateQR(data: string) {
    // Stub implementation
    return Buffer.from('QR_CODE_DATA');
  }
}

export const qrService = new QRService();
```

### FILE: src/services/qr-code.service.ts
```typescript
import * as QRCode from 'qrcode';
import { logger } from '../utils/logger';

export class QRCodeService {
  async generateQRCode(data: string, options?: QRCode.QRCodeToBufferOptions): Promise<Buffer> {
    try {
      const buffer: Buffer = await QRCode.toBuffer(data, {
        type: 'png',
        width: 400,
        margin: 1,
        ...options
      });
      
      logger.info(`Generated QR code for data length: ${data.length}`);
      return buffer;
    } catch (error) {
      logger.error('QR code generation failed:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  async generateTicketQR(ticketId: string, eventId: string): Promise<Buffer> {
    const ticketData = JSON.stringify({
      ticketId,
      eventId,
      platform: 'TicketToken',
      timestamp: Date.now()
    });

    return this.generateQRCode(ticketData);
  }
}

export const qrCodeService = new QRCodeService();
```

### FILE: src/services/file-search.service.ts
```typescript
import { getPool } from '../config/database.config';

export interface SearchFilters {
  filename?: string;
  mimeType?: string;
  entityType?: string;
  entityId?: string;
  uploadedBy?: string;
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  isPublic?: boolean;
}

export class FileSearchService {
  async search(filters: SearchFilters, limit: number = 100, offset: number = 0): Promise<any> {
    const pool = getPool();
    if (!pool) return { files: [], total: 0 };
    
    let query = 'SELECT * FROM files WHERE deleted_at IS NULL';
    const params: any[] = [];
    let paramCount = 0;
    
    if (filters.filename) {
      query += ` AND filename ILIKE $${++paramCount}`;
      params.push(`%${filters.filename}%`);
    }
    
    if (filters.mimeType) {
      query += ` AND mime_type LIKE $${++paramCount}`;
      params.push(`${filters.mimeType}%`);
    }
    
    if (filters.entityType) {
      query += ` AND entity_type = $${++paramCount}`;
      params.push(filters.entityType);
    }
    
    if (filters.entityId) {
      query += ` AND entity_id = $${++paramCount}`;
      params.push(filters.entityId);
    }
    
    if (filters.uploadedBy) {
      query += ` AND uploaded_by = $${++paramCount}`;
      params.push(filters.uploadedBy);
    }
    
    if (filters.tags && filters.tags.length > 0) {
      query += ` AND tags && $${++paramCount}`;
      params.push(filters.tags);
    }
    
    if (filters.minSize) {
      query += ` AND size_bytes >= $${++paramCount}`;
      params.push(filters.minSize);
    }
    
    if (filters.maxSize) {
      query += ` AND size_bytes <= $${++paramCount}`;
      params.push(filters.maxSize);
    }
    
    if (filters.startDate) {
      query += ` AND created_at >= $${++paramCount}`;
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ` AND created_at <= $${++paramCount}`;
      params.push(filters.endDate);
    }
    
    if (filters.status) {
      query += ` AND status = $${++paramCount}`;
      params.push(filters.status);
    }
    
    if (filters.isPublic !== undefined) {
      query += ` AND is_public = $${++paramCount}`;
      params.push(filters.isPublic);
    }
    
    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get paginated results
    query += ` ORDER BY created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    return {
      files: result.rows,
      total,
      limit,
      offset
    };
  }
  
  async searchByContent(searchText: string, limit: number = 100): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    // Search in document metadata
    const result = await pool.query(
      `SELECT f.*, dm.extracted_text 
       FROM files f
       JOIN document_metadata dm ON dm.file_id = f.id
       WHERE dm.extracted_text ILIKE $1
       AND f.deleted_at IS NULL
       ORDER BY f.created_at DESC
       LIMIT $2`,
      [`%${searchText}%`, limit]
    );
    
    return result.rows;
  }
  
  async getRecentFiles(limit: number = 10): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT * FROM files 
       WHERE deleted_at IS NULL 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }
  
  async getMostAccessed(limit: number = 10): Promise<any[]> {
    const pool = getPool();
    if (!pool) return [];
    
    const result = await pool.query(
      `SELECT f.*, COUNT(fal.id) as access_count
       FROM files f
       LEFT JOIN file_access_logs fal ON fal.file_id = f.id
       WHERE f.deleted_at IS NULL
       GROUP BY f.id
       ORDER BY access_count DESC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  }
}

export const fileSearchService = new FileSearchService();
```

### FILE: src/services/s3.service.ts
```typescript
export class S3Service {
  async uploadToS3(buffer: Buffer, key: string) {
    // Stub implementation
    console.log('S3 upload stub:', key);
    return { Location: `https://s3.example.com/${key}` };
  }
  
  async deleteFromS3(key: string) {
    console.log('S3 delete stub:', key);
    return true;
  }
}

export const s3Service = new S3Service();
```

### FILE: src/services/image.service.ts
```typescript
import { imageProcessor } from '../processors/image/image.processor';
import { thumbnailGenerator } from '../processors/image/thumbnail.generator';
import { imageOptimizer } from '../processors/image/optimize.processor';
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';

export class ImageService {
  async processUploadedImage(fileId: string): Promise<void> {
    try {
      const file = await fileModel.findById(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Download original
      const buffer = await storageService.download(file.storagePath);
      
      // Process image
      await imageProcessor.processImage(fileId, buffer);
      
      // Update status
      await fileModel.updateStatus(fileId, 'ready');
      
      logger.info(`Image processing completed for ${fileId}`);
      
    } catch (error) {
      logger.error(`Image processing failed for ${fileId}:`, error);
      await fileModel.updateStatus(fileId, 'failed', error.message);
    }
  }

  async generateThumbnail(fileId: string, size: 'small' | 'medium' | 'large'): Promise<string> {
    const file = await fileModel.findById(fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    const buffer = await storageService.download(file.storagePath);
    
    const sizes = {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 }
    };

    const thumbnail = await thumbnailGenerator.generate(buffer, sizes[size]);
    
    const thumbPath = file.storagePath.replace(/\.[^.]+$/, `_${size}.jpg`);
    const result = await storageService.upload(thumbnail, thumbPath);
    
    return result.publicUrl || '';
  }

  async optimizeImage(fileId: string): Promise<void> {
    const file = await fileModel.findById(fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    const buffer = await storageService.download(file.storagePath);
    const optimized = await imageOptimizer.optimize(buffer, file.mimeType);
    
    if (optimized.length < buffer.length) {
      const optimizedPath = file.storagePath.replace(/\.[^.]+$/, '_optimized.jpg');
      await storageService.upload(optimized, optimizedPath);
      
      const reduction = Math.round((1 - optimized.length/buffer.length) * 100);
      logger.info(`Image optimized: ${fileId} (${reduction}% size reduction)`);
    }
  }
}

export const imageService = new ImageService();
```

### FILE: src/services/cdn.service.ts
```typescript
import { logger } from '../utils/logger';

export interface CDNConfig {
  provider: 'cloudfront' | 'cloudflare' | 'local';
  domain?: string;
  distributionId?: string;
}

export class CDNService {
  private config: CDNConfig;
  
  constructor() {
    this.config = {
      provider: process.env.CDN_PROVIDER as any || 'local',
      domain: process.env.CDN_DOMAIN,
      distributionId: process.env.CDN_DISTRIBUTION_ID
    };
  }
  
  getPublicUrl(path: string): string {
    if (this.config.provider === 'local') {
      return `/files/${path}`;
    }
    
    return `https://${this.config.domain}/${path}`;
  }
  
  async invalidateCache(paths: string[]): Promise<void> {
    if (this.config.provider === 'cloudfront') {
      await this.invalidateCloudFront(paths);
    } else if (this.config.provider === 'cloudflare') {
      await this.invalidateCloudFlare(paths);
    }
  }
  
  private async invalidateCloudFront(paths: string[]): Promise<void> {
    // AWS CloudFront invalidation
    logger.info(`Invalidating CloudFront cache for ${paths.length} paths`);
    // Implementation would use AWS SDK
  }
  
  private async invalidateCloudFlare(paths: string[]): Promise<void> {
    // CloudFlare cache purge
    logger.info(`Purging CloudFlare cache for ${paths.length} paths`);
    // Implementation would use CloudFlare API
  }
  
  generateResponsiveUrls(basePath: string, sizes: number[]): Record<string, string> {
    const urls: Record<string, string> = {};
    
    for (const size of sizes) {
      const sizePath = basePath.replace(/\.[^.]+$/, `_${size}w.jpg`);
      urls[`${size}w`] = this.getPublicUrl(sizePath);
    }
    
    return urls;
  }
  
  generateSrcSet(basePath: string): string {
    const sizes = [320, 640, 960, 1280, 1920];
    const srcset = sizes.map(size => {
      const url = this.getPublicUrl(basePath.replace(/\.[^.]+$/, `_${size}w.jpg`));
      return `${url} ${size}w`;
    }).join(', ');
    
    return srcset;
  }
}

export const cdnService = new CDNService();
```

### FILE: src/services/virus-scan.service.ts
```typescript
import NodeClam from 'clamscan';
import { logger } from '../utils/logger';

export class VirusScanService {
  private clam: any;
  private initialized: boolean = false;
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.clam = await new NodeClam().init({
        clamdscan: {
          host: process.env.CLAMAV_HOST || 'clamav',
          port: parseInt(process.env.CLAMAV_PORT || '3310'),
          bypassTest: process.env.NODE_ENV === 'development'
        },
        preference: 'clamdscan'
      });
      
      this.initialized = true;
      logger.info('Virus scanner initialized');
    } catch (error) {
      logger.warn('Virus scanner not available, skipping scans');
      this.initialized = false;
    }
  }
  
  async scanBuffer(buffer: Buffer): Promise<{ isClean: boolean; virus?: string }> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.clam) {
      logger.debug('Virus scanning skipped - scanner not available');
      return { isClean: true };
    }
    
    try {
      const { isInfected, viruses } = await this.clam.scanBuffer(buffer);
      
      if (isInfected) {
        logger.warn(`Virus detected: ${viruses.join(', ')}`);
        return { isClean: false, virus: viruses[0] };
      }
      
      return { isClean: true };
      
    } catch (error) {
      logger.error('Virus scan failed:', error);
      // Don't block upload if scanner fails
      return { isClean: true };
    }
  }
  
  async scanFile(filePath: string): Promise<{ isClean: boolean; virus?: string }> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.clam) {
      return { isClean: true };
    }
    
    try {
      const { isInfected, viruses, file } = await this.clam.scanFile(filePath);
      
      if (isInfected) {
        logger.warn(`Virus detected in ${file}: ${viruses.join(', ')}`);
        return { isClean: false, virus: viruses[0] };
      }
      
      return { isClean: true };
      
    } catch (error) {
      logger.error('Virus scan failed:', error);
      return { isClean: true };
    }
  }
}

export const virusScanService = new VirusScanService();
```

### FILE: src/services/batch-operations.service.ts
```typescript
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';
import archiver from 'archiver';
import { Readable } from 'stream';

export class BatchOperationsService {
  async batchDelete(fileIds: string[]): Promise<{ deleted: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    let deleted = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        const file = await fileModel.findById(fileId);
        if (file) {
          // Delete from storage
          await storageService.delete(file.storagePath).catch(() => {});
          
          // Soft delete in database
          await pool.query(
            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
            [fileId]
          );
          
          deleted++;
        }
      } catch (error) {
        logger.error(`Failed to delete file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { deleted, failed };
  }
  
  async batchMove(
    fileIds: string[],
    newEntityType: string,
    newEntityId: string
  ): Promise<{ moved: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    let moved = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        await pool.query(
          'UPDATE files SET entity_type = $1, entity_id = $2 WHERE id = $3',
          [newEntityType, newEntityId, fileId]
        );
        moved++;
      } catch (error) {
        logger.error(`Failed to move file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { moved, failed };
  }
  
  async batchTag(fileIds: string[], tags: string[]): Promise<{ tagged: number; failed: number }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    let tagged = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        await pool.query(
          'UPDATE files SET tags = array_cat(tags, $1) WHERE id = $2',
          [tags, fileId]
        );
        tagged++;
      } catch (error) {
        logger.error(`Failed to tag file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { tagged, failed };
  }
  
  async batchDownload(fileIds: string[]): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks: Buffer[] = [];
        
        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);
        
        for (const fileId of fileIds) {
          const file = await fileModel.findById(fileId);
          if (file) {
            const buffer = await storageService.download(file.storagePath);
            archive.append(buffer, { name: file.filename });
          }
        }
        
        await archive.finalize();
      } catch (error) {
        reject(error);
      }
    });
  }
  
  async batchCopy(
    fileIds: string[],
    targetEntityType: string,
    targetEntityId: string
  ): Promise<{ copied: number; failed: number }> {
    let copied = 0;
    let failed = 0;
    
    for (const fileId of fileIds) {
      try {
        const file = await fileModel.findById(fileId);
        if (file) {
          const buffer = await storageService.download(file.storagePath);
          
          // Create new file record
          const { uploadService } = await import('./upload.service');
          await uploadService.uploadFile(
            buffer,
            file.filename,
            file.mimeType,
            file.uploadedBy,
            {
              entityType: targetEntityType,
              entityId: targetEntityId,
              metadata: file.metadata,
              tags: file.tags
            }
          );
          
          copied++;
        }
      } catch (error) {
        logger.error(`Failed to copy file ${fileId}:`, error);
        failed++;
      }
    }
    
    return { copied, failed };
  }
}

export const batchOperationsService = new BatchOperationsService();
```

### FILE: src/services/chunked-upload.service.ts
```typescript
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';

export class ChunkedUploadService {
  private readonly CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  private readonly SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  async createSession(
    filename: string,
    fileSize: number,
    mimeType: string,
    userId?: string
  ): Promise<string> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    const sessionToken = uuidv4();
    const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
    const expiresAt = new Date(Date.now() + this.SESSION_TTL);
    
    await pool.query(`
      INSERT INTO upload_sessions (
        session_token, uploaded_by, filename, mime_type,
        total_size, total_chunks, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [sessionToken, userId, filename, mimeType, fileSize, totalChunks, expiresAt]);
    
    logger.info(`Chunked upload session created: ${sessionToken}`);
    return sessionToken;
  }
  
  async uploadChunk(
    sessionToken: string,
    chunkNumber: number,
    chunkData: Buffer
  ): Promise<{ progress: number; complete: boolean }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get session
    const sessionResult = await pool.query(
      'SELECT * FROM upload_sessions WHERE session_token = $1 AND status = $2',
      [sessionToken, 'active']
    );
    
    if (sessionResult.rows.length === 0) {
      throw new Error('Invalid or expired session');
    }
    
    const session = sessionResult.rows[0];
    
    // Validate chunk number
    if (chunkNumber >= session.total_chunks) {
      throw new Error('Invalid chunk number');
    }
    
    // Store chunk temporarily
    const chunkPath = path.join('./temp', 'chunks', sessionToken, `chunk_${chunkNumber}`);
    await fs.mkdir(path.dirname(chunkPath), { recursive: true });
    await fs.writeFile(chunkPath, chunkData);
    
    // Update session progress
    const updatedChunks = session.uploaded_chunks + 1;
    const updatedBytes = session.uploaded_bytes + chunkData.length;
    
    await pool.query(`
      UPDATE upload_sessions 
      SET uploaded_chunks = $1, uploaded_bytes = $2
      WHERE session_token = $3
    `, [updatedChunks, updatedBytes, sessionToken]);
    
    const progress = (updatedChunks / session.total_chunks) * 100;
    const complete = updatedChunks === session.total_chunks;
    
    logger.debug(`Chunk ${chunkNumber} uploaded for session ${sessionToken}`);
    
    return { progress, complete };
  }
  
  async completeSession(sessionToken: string): Promise<string> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get session
    const sessionResult = await pool.query(
      'SELECT * FROM upload_sessions WHERE session_token = $1',
      [sessionToken]
    );
    
    if (sessionResult.rows.length === 0) {
      throw new Error('Session not found');
    }
    
    const session = sessionResult.rows[0];
    
    if (session.uploaded_chunks !== session.total_chunks) {
      throw new Error('Not all chunks uploaded');
    }
    
    // Combine chunks
    const chunksDir = path.join('./temp', 'chunks', sessionToken);
    const chunks: Buffer[] = [];
    
    for (let i = 0; i < session.total_chunks; i++) {
      const chunkPath = path.join(chunksDir, `chunk_${i}`);
      const chunkData = await fs.readFile(chunkPath);
      chunks.push(chunkData);
    }
    
    const completeFile = Buffer.concat(chunks);
    
    // Create file record using regular upload service
    const { uploadService } = await import('./upload.service');
    const file = await uploadService.uploadFile(
      completeFile,
      session.filename,
      session.mime_type,
      session.uploaded_by
    );
    
    // Clean up chunks
    await fs.rm(chunksDir, { recursive: true, force: true });
    
    // Mark session as completed
    await pool.query(
      'UPDATE upload_sessions SET status = $1, completed_at = $2 WHERE session_token = $3',
      ['completed', new Date(), sessionToken]
    );
    
    logger.info(`Chunked upload completed: ${sessionToken} -> ${file.id}`);
    
    return file.id;
  }
  
  async cancelSession(sessionToken: string): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Clean up chunks
    const chunksDir = path.join('./temp', 'chunks', sessionToken);
    await fs.rm(chunksDir, { recursive: true, force: true }).catch(() => {});
    
    // Mark session as cancelled
    await pool.query(
      'UPDATE upload_sessions SET status = $1 WHERE session_token = $2',
      ['cancelled', sessionToken]
    );
    
    logger.info(`Upload session cancelled: ${sessionToken}`);
  }
}

export const chunkedUploadService = new ChunkedUploadService();
```

### FILE: src/services/upload.service.ts
```typescript
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { fileValidator } from '../validators/file.validator';
import { generateFileHash, generateStorageKey, generateFileId } from '../utils/file-helpers';
import { FileRecord, UploadOptions } from '../types/file.types';
import { FileStatus } from '../constants/file-status';
import { logger } from '../utils/logger';

export class UploadService {
  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    userId?: string,
    options?: UploadOptions
  ): Promise<FileRecord> {
    let fileId: string | undefined;
    
    try {
      // Validate file
      fileValidator.validateSize(buffer.length, mimeType);
      fileValidator.validateMimeType(mimeType);
      
      // Generate file metadata ONCE
      fileId = generateFileId();
      const sanitizedFilename = fileValidator.sanitizeFilename(filename);
      const extension = fileValidator.getExtension(filename);
      const hash = generateFileHash(buffer);
      
      // Use the SAME fileId for storage key
      const storageKey = generateStorageKey(
        fileId,
        sanitizedFilename,
        options?.entityType,
        options?.entityId
      );
      
      logger.info(`Creating file - ID: ${fileId}, Storage Path: ${storageKey}`);
      
      // Create database record
      const fileRecord = await fileModel.create({
        id: fileId,
        filename: sanitizedFilename,
        originalFilename: filename,
        mimeType,
        extension,
        sizeBytes: buffer.length,
        hashSha256: hash,
        uploadedBy: userId,
        entityType: options?.entityType,
        entityId: options?.entityId,
        isPublic: options?.isPublic || false,
        metadata: options?.metadata || {},
        tags: options?.tags,
        status: FileStatus.UPLOADING,
        storagePath: storageKey
      });
      
      // Upload to storage
      const storageResult = await storageService.upload(buffer, storageKey);
      logger.info(`File uploaded to storage: ${storageKey}`);
      
      // Update file record with CDN URL
      await fileModel.updateCdnUrl(fileId, storageResult.publicUrl || '');
      
      // Get the updated record
      const updatedRecord = await fileModel.findById(fileId);
      
      if (!updatedRecord) {
        logger.warn(`Could not retrieve updated record for ${fileId}`);
        fileRecord.cdnUrl = storageResult.publicUrl;
        fileRecord.status = FileStatus.READY;
        return fileRecord;
      }
      
      logger.info(`File upload completed: ${fileId}`);
      return updatedRecord;
      
    } catch (error: any) {
      logger.error('File upload failed:', error);
      
      if (fileId) {
        try {
          await fileModel.updateStatus(fileId, FileStatus.FAILED, error.message);
        } catch (updateError) {
          logger.error('Failed to update file status:', updateError);
        }
      }
      
      throw error;
    }
  }
  
  async getFile(fileId: string): Promise<FileRecord | null> {
    return fileModel.findById(fileId);
  }
  
  async getFilesByEntity(entityType: string, entityId: string): Promise<FileRecord[]> {
    return fileModel.findByEntity(entityType, entityId);
  }
}

export const uploadService = new UploadService();
```

### FILE: src/services/cleanup.service.ts
```typescript
import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export class CleanupService {
  async cleanupOrphanedFiles(): Promise<{ cleaned: number }> {
    const pool = getPool();
    if (!pool) return { cleaned: 0 };
    
    let cleaned = 0;
    
    // Find files marked as deleted
    const deletedFiles = await pool.query(
      `SELECT * FROM files 
       WHERE deleted_at IS NOT NULL 
       AND deleted_at < NOW() - INTERVAL '7 days'`
    );
    
    for (const file of deletedFiles.rows) {
      try {
        // Delete from storage
        await storageService.delete(file.storage_path).catch(() => {});
        
        // Hard delete from database
        await pool.query('DELETE FROM files WHERE id = $1', [file.id]);
        
        cleaned++;
      } catch (error) {
        logger.error(`Failed to cleanup file ${file.id}:`, error);
      }
    }
    
    // Clean expired upload sessions
    await pool.query(
      `UPDATE upload_sessions 
       SET status = 'expired' 
       WHERE status = 'active' 
       AND expires_at < NOW()`
    );
    
    // Clean old access logs
    await pool.query(
      `DELETE FROM file_access_logs 
       WHERE accessed_at < NOW() - INTERVAL '90 days'`
    );
    
    return { cleaned };
  }
  
  async cleanupTempFiles(): Promise<{ cleaned: number }> {
    let cleaned = 0;
    const tempDir = './temp';
    
    try {
      const files = await fs.readdir(tempDir);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        // Delete files older than 24 hours
        if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
          await fs.unlink(filePath).catch(() => {});
          cleaned++;
        }
      }
    } catch (error) {
      logger.error('Temp cleanup failed:', error);
    }
    
    return { cleaned };
  }
  
  async calculateStorageUsage(): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    
    // Calculate usage by entity
    await pool.query(`
      INSERT INTO storage_usage (entity_type, entity_id, total_files, total_bytes, 
                                 image_bytes, document_bytes, video_bytes, other_bytes)
      SELECT 
        entity_type,
        entity_id,
        COUNT(*) as total_files,
        SUM(size_bytes) as total_bytes,
        SUM(CASE WHEN mime_type LIKE 'image/%' THEN size_bytes ELSE 0 END) as image_bytes,
        SUM(CASE WHEN mime_type LIKE '%pdf%' OR mime_type LIKE '%document%' THEN size_bytes ELSE 0 END) as document_bytes,
        SUM(CASE WHEN mime_type LIKE 'video/%' THEN size_bytes ELSE 0 END) as video_bytes,
        SUM(CASE WHEN mime_type NOT LIKE 'image/%' 
                 AND mime_type NOT LIKE 'video/%' 
                 AND mime_type NOT LIKE '%pdf%' 
                 AND mime_type NOT LIKE '%document%' THEN size_bytes ELSE 0 END) as other_bytes
      FROM files
      WHERE deleted_at IS NULL
      AND entity_type IS NOT NULL
      AND entity_id IS NOT NULL
      GROUP BY entity_type, entity_id
      ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        total_files = EXCLUDED.total_files,
        total_bytes = EXCLUDED.total_bytes,
        image_bytes = EXCLUDED.image_bytes,
        document_bytes = EXCLUDED.document_bytes,
        video_bytes = EXCLUDED.video_bytes,
        other_bytes = EXCLUDED.other_bytes,
        calculated_at = NOW()
    `);
    
    logger.info('Storage usage calculated');
  }
  
  async enforceStorageLimits(): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    
    // Check entities exceeding limits
    const result = await pool.query(`
      SELECT su.*, su.total_bytes > su.max_bytes as exceeds_limit
      FROM storage_usage su
      WHERE su.max_bytes IS NOT NULL
      AND su.total_bytes > su.max_bytes
    `);
    
    for (const entity of result.rows) {
      logger.warn(`Entity ${entity.entity_type}/${entity.entity_id} exceeds storage limit: ${entity.total_bytes}/${entity.max_bytes}`);
      // Could implement automatic cleanup or notifications here
    }
  }
}

export const cleanupService = new CleanupService();
```

