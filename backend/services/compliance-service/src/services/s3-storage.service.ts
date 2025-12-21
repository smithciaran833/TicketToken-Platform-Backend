import AWS from 'aws-sdk';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * S3 STORAGE SERVICE
 * 
 * Handles document storage in AWS S3
 * Phase 5: Production Infrastructure
 */

export class S3StorageService {
  private s3: AWS.S3;
  private bucketName: string;
  private region: string;

  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.bucketName = process.env.S3_BUCKET_NAME || 'compliance-documents';

    this.s3 = new AWS.S3({
      region: this.region,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      signatureVersion: 'v4',
    });

    logger.info(`S3 Storage initialized: bucket=${this.bucketName}, region=${this.region}`);
  }

  /**
   * Upload file to S3
   */
  async uploadFile(
    buffer: Buffer,
    filename: string,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<{ key: string; url: string }> {
    const key = `documents/${new Date().getFullYear()}/${uuidv4()}-${filename}`;

    try {
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
        Metadata: metadata || {},
        ACL: 'private',
      };

      await this.s3.putObject(params).promise();

      logger.info(`File uploaded to S3: ${key}`);

      return {
        key,
        url: `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`,
      };
    } catch (error) {
      logger.error({ error }, 'S3 upload failed:');
      throw new Error(`Failed to upload file to S3: ${error}`);
    }
  }

  /**
   * Generate presigned URL for secure download
   */
  async getPresignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn, // Default 1 hour
      };

      const url = await this.s3.getSignedUrlPromise('getObject', params);
      logger.debug(`Generated presigned URL for: ${key}`);
      return url;
    } catch (error) {
      logger.error({ error }, 'Failed to generate presigned URL:');
      throw new Error(`Failed to generate presigned URL: ${error}`);
    }
  }

  /**
   * Generate presigned URL for direct upload
   */
  async getPresignedUploadUrl(
    filename: string,
    contentType: string,
    expiresIn: number = 300
  ): Promise<{ url: string; key: string; fields: Record<string, string> }> {
    const key = `documents/${new Date().getFullYear()}/${uuidv4()}-${filename}`;

    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn, // Default 5 minutes
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      };

      const url = await this.s3.getSignedUrlPromise('putObject', params);

      return {
        url,
        key,
        fields: {
          'Content-Type': contentType,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to generate upload URL:');
      throw new Error(`Failed to generate upload URL: ${error}`);
    }
  }

  /**
   * Download file from S3
   */
  async downloadFile(key: string): Promise<Buffer> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
      };

      const result = await this.s3.getObject(params).promise();
      logger.debug(`Downloaded file from S3: ${key}`);
      return result.Body as Buffer;
    } catch (error) {
      logger.error({ error }, 'S3 download failed:');
      throw new Error(`Failed to download file from S3: ${error}`);
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
      };

      await this.s3.deleteObject(params).promise();
      logger.info(`Deleted file from S3: ${key}`);
    } catch (error) {
      logger.error({ error }, 'S3 deletion failed:');
      throw new Error(`Failed to delete file from S3: ${error}`);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
      };

      await this.s3.headObject(params).promise();
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<{
    size: number;
    lastModified: Date;
    contentType: string;
    metadata: Record<string, string>;
  }> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
      };

      const result = await this.s3.headObject(params).promise();

      return {
        size: result.ContentLength || 0,
        lastModified: result.LastModified || new Date(),
        contentType: result.ContentType || 'application/octet-stream',
        metadata: result.Metadata || {},
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get file metadata:');
      throw new Error(`Failed to get file metadata: ${error}`);
    }
  }

  /**
   * Set object lifecycle policy for automatic expiration
   */
  async setExpirationPolicy(days: number): Promise<void> {
    try {
      const params = {
        Bucket: this.bucketName,
        LifecycleConfiguration: {
          Rules: [
            {
              Id: 'DeleteOldDocuments',
              Status: 'Enabled',
              Prefix: 'documents/',
              Expiration: {
                Days: days,
              },
            },
          ],
        },
      };

      await this.s3.putBucketLifecycleConfiguration(params).promise();
      logger.info(`Set S3 expiration policy: ${days} days`);
    } catch (error) {
      logger.error({ error }, 'Failed to set expiration policy:');
      throw new Error(`Failed to set expiration policy: ${error}`);
    }
  }

  /**
   * List files with prefix
   */
  async listFiles(prefix: string, maxKeys: number = 1000): Promise<string[]> {
    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      };

      const result = await this.s3.listObjectsV2(params).promise();
      return (result.Contents || []).map(obj => obj.Key || '');
    } catch (error) {
      logger.error({ error }, 'Failed to list files:');
      throw new Error(`Failed to list files: ${error}`);
    }
  }

  /**
   * Copy file within S3
   */
  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      const params = {
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${sourceKey}`,
        Key: destinationKey,
        ServerSideEncryption: 'AES256',
      };

      await this.s3.copyObject(params).promise();
      logger.info(`Copied file in S3: ${sourceKey} -> ${destinationKey}`);
    } catch (error) {
      logger.error({ error }, 'S3 copy failed:');
      throw new Error(`Failed to copy file in S3: ${error}`);
    }
  }

  /**
   * Get bucket size and object count
   */
  async getBucketStats(): Promise<{ size: number; count: number }> {
    try {
      let totalSize = 0;
      let totalCount = 0;
      let continuationToken: string | undefined;

      do {
        const params: AWS.S3.ListObjectsV2Request = {
          Bucket: this.bucketName,
          ContinuationToken: continuationToken,
        };

        const result = await this.s3.listObjectsV2(params).promise();
        
        if (result.Contents) {
          totalCount += result.Contents.length;
          totalSize += result.Contents.reduce((sum, obj) => sum + (obj.Size || 0), 0);
        }

        continuationToken = result.NextContinuationToken;
      } while (continuationToken);

      return {
        size: totalSize,
        count: totalCount,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get bucket stats:');
      throw new Error(`Failed to get bucket stats: ${error}`);
    }
  }
}

export const s3StorageService = new S3StorageService();
