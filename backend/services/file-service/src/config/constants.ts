export const FILE_CONSTANTS = {
  // Size limits in bytes
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE_MB) * 1024 * 1024,
  MAX_IMAGE_SIZE: Number(process.env.MAX_IMAGE_SIZE_MB) * 1024 * 1024,
  MAX_VIDEO_SIZE: Number(process.env.MAX_VIDEO_SIZE_MB) * 1024 * 1024,
  MAX_DOCUMENT_SIZE: Number(process.env.MAX_DOCUMENT_SIZE_MB) * 1024 * 1024,
  CHUNK_SIZE: Number(process.env.CHUNK_SIZE_MB) * 1024 * 1024,
  
  // Thumbnail sizes
  THUMBNAIL_SIZES: {
    small: { width: 150, height: 150 },
    medium: { width: 300, height: 300 },
    large: { width: 600, height: 600 }
  },
  
  // Allowed MIME types
  ALLOWED_IMAGE_TYPES: process.env.ALLOWED_IMAGE_TYPES?.split(',') || [],
  ALLOWED_DOCUMENT_TYPES: process.env.ALLOWED_DOCUMENT_TYPES?.split(',') || [],
  ALLOWED_VIDEO_TYPES: process.env.ALLOWED_VIDEO_TYPES?.split(',') || [],
  
  // Storage paths
  UPLOAD_PATH: process.env.LOCAL_STORAGE_PATH || './uploads',
  TEMP_PATH: process.env.TEMP_STORAGE_PATH || './temp',
  
  // File status
  FILE_STATUS: {
    UPLOADING: 'uploading',
    PROCESSING: 'processing',
    READY: 'ready',
    FAILED: 'failed',
    DELETED: 'deleted'
  },
  
  // Entity types that can own files
  ENTITY_TYPES: {
    VENUE: 'venue',
    EVENT: 'event',
    USER: 'user',
    TICKET: 'ticket'
  }
};

export const ERROR_MESSAGES = {
  FILE_TOO_LARGE: 'File size exceeds maximum allowed size',
  INVALID_FILE_TYPE: 'File type is not allowed',
  UPLOAD_FAILED: 'Failed to upload file',
  FILE_NOT_FOUND: 'File not found',
  UNAUTHORIZED: 'Unauthorized to access this file',
  PROCESSING_FAILED: 'Failed to process file'
};
