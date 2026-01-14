/**
 * S3 Storage Service
 * 
 * AUDIT FIX: MT-4 - Multi-tenant S3 storage isolation
 * - All S3 paths are prefixed with tenant_id
 * - Prevents cross-tenant file access
 * - Validates tenant context on all operations
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../utils/logger';
import { TenantRequiredError, StorageError } from '../errors';
import crypto from 'crypto';

// =============================================================================
// Configuration
// =============================================================================

interface S3Config {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
}

const config: S3Config = {
  bucket: process.env.S3_BUCKET || 'tickettoken-files',
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  endpoint: process.env.S3_ENDPOINT
};

// =============================================================================
// S3 Client
// =============================================================================

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const clientConfig: any = {
      region: config.region
    };

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      };
    }

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = true; // Required for MinIO
    }

    s3Client = new S3Client(clientConfig);
  }

  return s3Client;
}

// =============================================================================
// Types
// =============================================================================

interface UploadOptions {
  tenantId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
  metadata?: Record<string, string>;
  isPublic?: boolean;
}

interface UploadResult {
  key: string;
  location: string;
  bucket: string;
  etag?: string;
  tenantPath: string;
}

interface DownloadOptions {
  tenantId: string;
  key: string;
}

interface SignedUrlOptions {
  tenantId: string;
  key: string;
  expiresIn?: number;
  contentType?: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * AUDIT FIX: MT-4 - Generate tenant-scoped S3 key
 * All files are stored under tenant-specific prefixes
 */
function buildTenantKey(tenantId: string, filename: string): string {
  if (!tenantId) {
    throw new TenantRequiredError('Tenant ID is required for S3 operations');
  }

  // Validate tenant ID format (UUID)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new TenantRequiredError('Invalid tenant ID format');
  }

  // Generate date-based path for organization
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  // Sanitize filename
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Add random suffix for uniqueness
  const uniqueSuffix = crypto.randomBytes(8).toString('hex');

  // Format: tenants/{tenant_id}/files/{year}/{month}/{unique_suffix}_{filename}
  return `tenants/${tenantId}/files/${year}/${month}/${uniqueSuffix}_${sanitizedFilename}`;
}

/**
 * AUDIT FIX: MT-4 - Extract tenant from S3 key and validate access
 */
function validateKeyAccess(key: string, tenantId: string): void {
  if (!tenantId) {
    throw new TenantRequiredError('Tenant ID is required for S3 operations');
  }

  // Extract tenant from key
  const match = key.match(/^tenants\/([^\/]+)\//);
  if (!match) {
    throw new StorageError('Invalid S3 key format - missing tenant prefix');
  }

  const keyTenantId = match[1];
  if (keyTenantId !== tenantId) {
    logger.warn({ requestedKey: key, tenantId, keyTenantId }, 'Attempted cross-tenant S3 access');
    throw new StorageError('Access denied - cross-tenant access not allowed');
  }
}

// =============================================================================
// S3 Service Class
// =============================================================================

export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = getS3Client();
    this.bucket = config.bucket;
  }

  /**
   * AUDIT FIX: MT-4 - Upload file with tenant-scoped path
   */
  async uploadToS3(options: UploadOptions): Promise<UploadResult> {
    const { tenantId, filename, contentType, buffer, metadata = {}, isPublic = false } = options;

    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required to upload files');
    }

    // Generate tenant-scoped key
    const key = buildTenantKey(tenantId, filename);

    // Add tenant ID to metadata for additional verification
    const fullMetadata = {
      ...metadata,
      'x-tenant-id': tenantId,
      'x-upload-timestamp': new Date().toISOString()
    };

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: fullMetadata,
      ACL: isPublic ? 'public-read' : 'private'
    });

    try {
      const result = await this.client.send(command);
      
      logger.info({ tenantId, key, size: buffer.length }, 'File uploaded to S3');

      return {
        key,
        location: `https://${this.bucket}.s3.${config.region}.amazonaws.com/${key}`,
        bucket: this.bucket,
        etag: result.ETag,
        tenantPath: `tenants/${tenantId}/files`
      };
    } catch (error) {
      logger.error({ error, tenantId, filename }, 'Failed to upload to S3');
      throw new StorageError(`Failed to upload file: ${(error as Error).message}`);
    }
  }

  /**
   * AUDIT FIX: MT-4 - Download file with tenant validation
   */
  async downloadFromS3(options: DownloadOptions): Promise<Buffer> {
    const { tenantId, key } = options;

    // Validate tenant access to this key
    validateKeyAccess(key, tenantId);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    try {
      const result = await this.client.send(command);
      
      if (!result.Body) {
        throw new StorageError('File not found or empty');
      }

      // Stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of result.Body as any) {
        chunks.push(chunk);
      }

      logger.info({ tenantId, key }, 'File downloaded from S3');

      return Buffer.concat(chunks);
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        throw new StorageError('File not found');
      }
      logger.error({ error, tenantId, key }, 'Failed to download from S3');
      throw new StorageError(`Failed to download file: ${error.message}`);
    }
  }

  /**
   * AUDIT FIX: MT-4 - Delete file with tenant validation
   */
  async deleteFromS3(tenantId: string, key: string): Promise<boolean> {
    // Validate tenant access to this key
    validateKeyAccess(key, tenantId);

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    try {
      await this.client.send(command);
      
      logger.info({ tenantId, key }, 'File deleted from S3');
      return true;
    } catch (error) {
      logger.error({ error, tenantId, key }, 'Failed to delete from S3');
      throw new StorageError(`Failed to delete file: ${(error as Error).message}`);
    }
  }

  /**
   * AUDIT FIX: MT-4 - Generate presigned URL for upload with tenant-scoped path
   */
  async generateUploadUrl(options: SignedUrlOptions): Promise<{ url: string; key: string }> {
    const { tenantId, key: filename, expiresIn = 3600, contentType } = options;

    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required to generate upload URL');
    }

    // Generate tenant-scoped key
    const key = buildTenantKey(tenantId, filename);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: {
        'x-tenant-id': tenantId
      }
    });

    try {
      const url = await getSignedUrl(this.client, command, { expiresIn });
      
      logger.info({ tenantId, key, expiresIn }, 'Generated presigned upload URL');

      return { url, key };
    } catch (error) {
      logger.error({ error, tenantId, filename }, 'Failed to generate upload URL');
      throw new StorageError(`Failed to generate upload URL: ${(error as Error).message}`);
    }
  }

  /**
   * AUDIT FIX: MT-4 - Generate presigned URL for download with tenant validation
   */
  async generateDownloadUrl(options: SignedUrlOptions): Promise<string> {
    const { tenantId, key, expiresIn = 3600 } = options;

    // Validate tenant access to this key
    validateKeyAccess(key, tenantId);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    try {
      const url = await getSignedUrl(this.client, command, { expiresIn });
      
      logger.info({ tenantId, key, expiresIn }, 'Generated presigned download URL');

      return url;
    } catch (error) {
      logger.error({ error, tenantId, key }, 'Failed to generate download URL');
      throw new StorageError(`Failed to generate download URL: ${(error as Error).message}`);
    }
  }

  /**
   * AUDIT FIX: MT-4 - Check if file exists with tenant validation
   */
  async fileExists(tenantId: string, key: string): Promise<boolean> {
    // Validate tenant access to this key
    validateKeyAccess(key, tenantId);

    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    try {
      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw new StorageError(`Failed to check file existence: ${error.message}`);
    }
  }

  /**
   * AUDIT FIX: MT-4 - List files for a tenant (scoped to tenant prefix)
   */
  async listTenantFiles(tenantId: string, prefix?: string, maxKeys: number = 1000): Promise<string[]> {
    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required to list files');
    }

    // Build tenant-scoped prefix
    const tenantPrefix = `tenants/${tenantId}/files/` + (prefix || '');

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: tenantPrefix,
      MaxKeys: maxKeys
    });

    try {
      const result = await this.client.send(command);
      
      const keys = (result.Contents || []).map(obj => obj.Key || '').filter(Boolean);
      
      logger.info({ tenantId, count: keys.length }, 'Listed tenant files');

      return keys;
    } catch (error) {
      logger.error({ error, tenantId, prefix }, 'Failed to list tenant files');
      throw new StorageError(`Failed to list files: ${(error as Error).message}`);
    }
  }

  /**
   * AUDIT FIX: MT-4 - Copy file within tenant namespace
   */
  async copyFile(tenantId: string, sourceKey: string, destFilename: string): Promise<string> {
    // Validate source key belongs to tenant
    validateKeyAccess(sourceKey, tenantId);

    // Generate new key for destination (same tenant)
    const destKey = buildTenantKey(tenantId, destFilename);

    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey}`,
      Key: destKey,
      Metadata: {
        'x-tenant-id': tenantId,
        'x-copied-from': sourceKey
      },
      MetadataDirective: 'REPLACE'
    });

    try {
      await this.client.send(command);
      
      logger.info({ tenantId, sourceKey, destKey }, 'File copied within S3');

      return destKey;
    } catch (error) {
      logger.error({ error, tenantId, sourceKey }, 'Failed to copy file');
      throw new StorageError(`Failed to copy file: ${(error as Error).message}`);
    }
  }

  /**
   * Get storage usage for a tenant
   */
  async getTenantStorageUsage(tenantId: string): Promise<{ count: number; totalBytes: number }> {
    if (!tenantId) {
      throw new TenantRequiredError('Tenant ID is required');
    }

    const tenantPrefix = `tenants/${tenantId}/files/`;
    let totalBytes = 0;
    let count = 0;
    let continuationToken: string | undefined;

    try {
      do {
        const command = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: tenantPrefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000
        });

        const result = await this.client.send(command);
        
        for (const obj of result.Contents || []) {
          totalBytes += obj.Size || 0;
          count++;
        }

        continuationToken = result.NextContinuationToken;
      } while (continuationToken);

      return { count, totalBytes };
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to get storage usage');
      throw new StorageError(`Failed to get storage usage: ${(error as Error).message}`);
    }
  }
}

export const s3Service = new S3Service();
