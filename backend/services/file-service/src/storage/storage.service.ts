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
