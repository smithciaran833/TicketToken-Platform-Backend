# DATABASE AUDIT: file-service
Generated: Thu Oct  2 15:05:55 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.1.0",
    "mammoth": "^1.6.0",
    "mime-types": "^2.1.35",
--
    "pg": "^8.11.3",
    "prom-client": "^15.1.3",
    "puppeteer": "^21.7.0",
```

## 2. DATABASE CONFIGURATION FILES
### database.config.ts
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


## 3. MODEL/ENTITY FILES
### backend/services/file-service//src/models/file.model.ts
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


## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/file-service//src/controllers/image.controller.ts:169:        'SELECT * FROM image_metadata WHERE file_id = $1',
backend/services/file-service//src/controllers/admin.controller.ts:43:        FROM files
backend/services/file-service//src/controllers/admin.controller.ts:53:        FROM files
backend/services/file-service//src/controllers/admin.controller.ts:61:        FROM files
backend/services/file-service//src/controllers/admin.controller.ts:102:        FROM files
backend/services/file-service//src/controllers/admin.controller.ts:115:            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
backend/services/file-service//src/controllers/admin.controller.ts:201:        'SELECT id, filename, size_bytes FROM files WHERE id = ANY($1)',
backend/services/file-service//src/controllers/admin.controller.ts:207:        'UPDATE files SET deleted_at = NOW() WHERE id = ANY($1) RETURNING id',
backend/services/file-service//src/controllers/video.controller.ts:20:        'SELECT * FROM video_metadata WHERE file_id = $1',
backend/services/file-service//src/controllers/video.controller.ts:57:        `INSERT INTO file_processing_queue (file_id, operation, priority) 
backend/services/file-service//src/controllers/video.controller.ts:82:        'SELECT * FROM video_metadata WHERE file_id = $1',
backend/services/file-service//src/models/file.model.ts:11:      INSERT INTO files (
backend/services/file-service//src/models/file.model.ts:55:    const query = 'SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL';
backend/services/file-service//src/models/file.model.ts:70:      UPDATE files
backend/services/file-service//src/models/file.model.ts:83:      UPDATE files
backend/services/file-service//src/models/file.model.ts:96:      SELECT * FROM files
backend/services/file-service//src/processors/document/document.processor.ts:104:      INSERT INTO document_metadata (
backend/services/file-service//src/processors/image/image.processor.ts:127:      INSERT INTO image_metadata (
backend/services/file-service//src/processors/image/image.processor.ts:159:      UPDATE image_metadata SET ${setClauses} WHERE file_id = $1
backend/services/file-service//src/services/access-log.service.ts:19:        `INSERT INTO file_access_logs 
backend/services/file-service//src/services/access-log.service.ts:34:      `SELECT * FROM file_access_logs 
backend/services/file-service//src/services/access-log.service.ts:50:       FROM file_access_logs fal
backend/services/file-service//src/services/access-log.service.ts:51:       JOIN files f ON f.id = fal.file_id
backend/services/file-service//src/services/access-log.service.ts:74:       FROM file_access_logs 
backend/services/file-service//src/services/file-version.service.ts:25:      'SELECT MAX(version_number) as max_version FROM file_versions WHERE file_id = $1',
backend/services/file-service//src/services/file-version.service.ts:37:      `INSERT INTO file_versions 
backend/services/file-service//src/services/file-version.service.ts:53:      'SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version_number DESC',
backend/services/file-service//src/services/file-version.service.ts:66:      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
backend/services/file-service//src/services/file-version.service.ts:88:      'UPDATE files SET size_bytes = $1, hash_sha256 = $2, updated_at = NOW() WHERE id = $3',
backend/services/file-service//src/services/file-version.service.ts:101:      'SELECT * FROM file_versions WHERE file_id = $1 AND version_number = $2',
backend/services/file-service//src/services/file-version.service.ts:116:      'DELETE FROM file_versions WHERE file_id = $1 AND version_number = $2',
backend/services/file-service//src/services/file-search.service.ts:23:    let query = 'SELECT * FROM files WHERE deleted_at IS NULL';
backend/services/file-service//src/services/file-search.service.ts:113:       FROM files f
backend/services/file-service//src/services/file-search.service.ts:114:       JOIN document_metadata dm ON dm.file_id = f.id
backend/services/file-service//src/services/file-search.service.ts:130:      `SELECT * FROM files 
backend/services/file-service//src/services/file-search.service.ts:146:       FROM files f
backend/services/file-service//src/services/file-search.service.ts:147:       LEFT JOIN file_access_logs fal ON fal.file_id = f.id
backend/services/file-service//src/services/batch-operations.service.ts:25:            'UPDATE files SET deleted_at = NOW() WHERE id = $1',
backend/services/file-service//src/services/batch-operations.service.ts:54:          'UPDATE files SET entity_type = $1, entity_id = $2 WHERE id = $3',
backend/services/file-service//src/services/batch-operations.service.ts:77:          'UPDATE files SET tags = array_cat(tags, $1) WHERE id = $2',
backend/services/file-service//src/services/chunked-upload.service.ts:27:      INSERT INTO upload_sessions (
backend/services/file-service//src/services/chunked-upload.service.ts:47:      'SELECT * FROM upload_sessions WHERE session_token = $1 AND status = $2',
backend/services/file-service//src/services/chunked-upload.service.ts:72:      UPDATE upload_sessions 
backend/services/file-service//src/services/chunked-upload.service.ts:91:      'SELECT * FROM upload_sessions WHERE session_token = $1',
backend/services/file-service//src/services/chunked-upload.service.ts:131:      'UPDATE upload_sessions SET status = $1, completed_at = $2 WHERE session_token = $3',
backend/services/file-service//src/services/chunked-upload.service.ts:150:      'UPDATE upload_sessions SET status = $1 WHERE session_token = $2',
backend/services/file-service//src/services/cleanup.service.ts:16:      `SELECT * FROM files 
backend/services/file-service//src/services/cleanup.service.ts:27:        await pool.query('DELETE FROM files WHERE id = $1', [file.id]);
backend/services/file-service//src/services/cleanup.service.ts:37:      `UPDATE upload_sessions 
backend/services/file-service//src/services/cleanup.service.ts:45:      `DELETE FROM file_access_logs 

### Knex Query Builder
backend/services/file-service//src/services/qr.service.ts:4:    return Buffer.from('QR_CODE_DATA');

## 5. REPOSITORY/SERVICE FILES
### storage.service.ts
First 100 lines:
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

### antivirus.service.ts
First 100 lines:
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
```

### access-log.service.ts
First 100 lines:
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

### file-version.service.ts
First 100 lines:
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
```

### qr.service.ts
First 100 lines:
```typescript
export class QRService {
  async generateQR(data: string) {
    // Stub implementation
    return Buffer.from('QR_CODE_DATA');
  }
}

export const qrService = new QRService();
```

### qr-code.service.ts
First 100 lines:
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

### file-search.service.ts
First 100 lines:
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
```

### s3.service.ts
First 100 lines:
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

### image.service.ts
First 100 lines:
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

### cdn.service.ts
First 100 lines:
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


## 6. ENVIRONMENT VARIABLES
```
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

