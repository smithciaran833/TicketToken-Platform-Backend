import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to generate signed URL');
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
