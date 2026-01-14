import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand,
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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'S3 upload failed');
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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'S3 stream upload failed');
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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'S3 download failed');
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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'S3 delete failed');
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
