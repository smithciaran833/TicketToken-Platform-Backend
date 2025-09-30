import fs from 'fs/promises';
import path from 'path';
import { StorageProvider, StorageResult } from './storage.provider';
import { logger } from '../../utils/logger';

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;
  
  constructor() {
    this.basePath = process.env.LOCAL_STORAGE_PATH || './uploads';
    this.ensureDirectoryExists();
  }
  
  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      logger.error('Failed to create storage directory:', error);
    }
  }
  
  async upload(file: Buffer, key: string): Promise<StorageResult> {
    const filePath = path.join(this.basePath, key);
    const fileDir = path.dirname(filePath);
    
    // Ensure directory exists
    await fs.mkdir(fileDir, { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, file);
    
    logger.debug(`File saved to local storage: ${filePath}`);
    
    return {
      key,
      storageUrl: `file://${filePath}`,
      publicUrl: `/files/${key}`,
      provider: 'local'
    };
  }
  
  async download(key: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, key);
    return await fs.readFile(filePath);
  }
  
  async delete(key: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
    await fs.unlink(filePath);
  }
  
  async exists(key: string): Promise<boolean> {
    const filePath = path.join(this.basePath, key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  getUrl(key: string): string {
    return `/files/${key}`;
  }
}
