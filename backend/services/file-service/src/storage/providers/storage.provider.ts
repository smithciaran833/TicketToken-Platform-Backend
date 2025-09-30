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
