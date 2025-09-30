import { FILE_CONSTANTS, ERROR_MESSAGES } from '../config/constants';
import { logger } from '../utils/logger';

export class FileValidator {
  validateSize(size: number, mimeType: string): void {
    let maxSize = FILE_CONSTANTS.MAX_FILE_SIZE;
    
    if (mimeType.startsWith('image/')) {
      maxSize = FILE_CONSTANTS.MAX_IMAGE_SIZE;
    } else if (mimeType.startsWith('video/')) {
      maxSize = FILE_CONSTANTS.MAX_VIDEO_SIZE;
    } else if (mimeType.includes('pdf') || mimeType.includes('document')) {
      maxSize = FILE_CONSTANTS.MAX_DOCUMENT_SIZE;
    }
    
    if (size > maxSize) {
      throw new Error(`${ERROR_MESSAGES.FILE_TOO_LARGE}: ${Math.round(maxSize / 1024 / 1024)}MB max`);
    }
  }
  
  validateMimeType(mimeType: string): void {
    const allowedTypes = [
      ...FILE_CONSTANTS.ALLOWED_IMAGE_TYPES,
      ...FILE_CONSTANTS.ALLOWED_DOCUMENT_TYPES,
      ...FILE_CONSTANTS.ALLOWED_VIDEO_TYPES
    ];
    
    if (!allowedTypes.includes(mimeType)) {
      throw new Error(`${ERROR_MESSAGES.INVALID_FILE_TYPE}: ${mimeType}`);
    }
  }
  
  sanitizeFilename(filename: string): string {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');
  }
  
  getExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  }
}

export const fileValidator = new FileValidator();
