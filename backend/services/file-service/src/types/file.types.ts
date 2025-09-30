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
