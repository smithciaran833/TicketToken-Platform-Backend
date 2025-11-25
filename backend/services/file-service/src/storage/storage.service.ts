import { StorageProvider, StorageResult } from './providers/storage.provider';
import { LocalStorageProvider } from './providers/local.provider';
import { S3StorageProvider } from './providers/s3.provider';
import { logger } from '../utils/logger';

export class StorageService {
  private provider: StorageProvider;
  
  constructor() {
    // Choose provider based on STORAGE_PROVIDER environment variable
    if (process.env.STORAGE_PROVIDER === 's3') {
      // Use S3 storage
      this.provider = new S3StorageProvider({
        region: process.env.AWS_REGION!,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        bucketName: process.env.S3_BUCKET_NAME!,
        cdnDomain: process.env.CDN_DOMAIN
      });
      logger.info('✅ Using S3 storage provider');
    } else if (process.env.NODE_ENV === 'production') {
      // Production MUST use S3 - fail fast
      const errorMsg = 'FATAL: Production environment REQUIRES STORAGE_PROVIDER=s3. ' +
        'Local storage would result in data loss on container restarts.';
      logger.error(errorMsg);
      throw new Error(errorMsg);
    } else {
      // Development/staging can use local storage
      this.provider = new LocalStorageProvider();
      logger.warn('⚠️  Using local storage provider - NOT suitable for production! ' +
        'Files will be lost on container restart. Set STORAGE_PROVIDER=s3 for persistence.');
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
