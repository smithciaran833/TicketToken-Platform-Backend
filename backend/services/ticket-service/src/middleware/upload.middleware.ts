/**
 * File Upload Validation Middleware
 * 
 * Batch 25 fix:
 * - SEC-EXT5: File upload validation - size limits, allowed types, virus scanning hook
 * 
 * Provides secure file upload handling with validation and scanning
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

// Type augmentation for @fastify/multipart
// Install: npm install @fastify/multipart
declare module 'fastify' {
  interface FastifyRequest {
    isMultipart(): boolean;
    parts(): AsyncIterable<MultipartFile | MultipartField>;
  }
}

interface MultipartFile {
  type: 'file';
  filename: string;
  mimetype: string;
  encoding: string;
  file: AsyncIterable<Buffer>;
}

interface MultipartField {
  type: 'field';
  fieldname: string;
  value: string;
}

const log = logger.child({ component: 'UploadMiddleware' });

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * File upload configuration
 */
export interface FileUploadConfig {
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize: number;
  /** Maximum total upload size for multipart (default: 50MB) */
  maxTotalSize: number;
  /** Allowed MIME types */
  allowedMimeTypes: string[];
  /** Allowed file extensions */
  allowedExtensions: string[];
  /** Enable virus scanning (default: true in production) */
  virusScanEnabled: boolean;
  /** Virus scanner endpoint */
  virusScannerUrl: string;
  /** Virus scan timeout in ms */
  virusScanTimeout: number;
  /** Maximum files per request */
  maxFiles: number;
  /** Check magic bytes for file type verification */
  verifyMagicBytes: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FileUploadConfig = {
  maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE || '10485760', 10), // 10MB
  maxTotalSize: parseInt(process.env.UPLOAD_MAX_TOTAL_SIZE || '52428800', 10), // 50MB
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/json',
  ],
  allowedExtensions: [
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.pdf', '.txt', '.csv', '.json',
  ],
  virusScanEnabled: process.env.NODE_ENV === 'production' && !!process.env.VIRUS_SCANNER_URL,
  virusScannerUrl: process.env.VIRUS_SCANNER_URL || 'http://clamav:3310/scan',
  virusScanTimeout: parseInt(process.env.VIRUS_SCAN_TIMEOUT || '30000', 10),
  maxFiles: parseInt(process.env.UPLOAD_MAX_FILES || '5', 10),
  verifyMagicBytes: true,
};

let uploadConfig: FileUploadConfig = { ...DEFAULT_CONFIG };

/**
 * Update upload configuration at runtime
 */
export function setUploadConfig(config: Partial<FileUploadConfig>): void {
  uploadConfig = { ...uploadConfig, ...config };
  log.info('Upload configuration updated', { 
    maxFileSize: uploadConfig.maxFileSize,
    allowedMimeTypes: uploadConfig.allowedMimeTypes.length,
    virusScanEnabled: uploadConfig.virusScanEnabled,
  });
}

/**
 * Get current upload configuration
 */
export function getUploadConfig(): FileUploadConfig {
  return { ...uploadConfig };
}

// =============================================================================
// MAGIC BYTES DETECTION
// =============================================================================

/**
 * Magic bytes signatures for common file types
 */
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  'image/jpeg': [
    { offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
  ],
  'image/png': [
    { offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  ],
  'image/gif': [
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  ],
  'image/webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
  ],
  'application/pdf': [
    { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  ],
  'application/zip': [
    { offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK..
  ],
};

/**
 * Verify file type using magic bytes
 */
function verifyMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  
  if (!signatures) {
    // No signature defined for this type - allow if text-based
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      return true;
    }
    return true; // Allow unknown types that passed MIME check
  }
  
  for (const sig of signatures) {
    const slice = buffer.slice(sig.offset, sig.offset + sig.bytes.length);
    if (slice.length >= sig.bytes.length) {
      const matches = sig.bytes.every((byte, i) => slice[i] === byte);
      if (matches) return true;
    }
  }
  
  return false;
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * File validation result
 */
export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fileInfo: {
    size: number;
    mimeType: string;
    extension: string;
    hash: string;
  } | null;
}

/**
 * Uploaded file structure
 */
export interface UploadedFile {
  filename: string;
  mimetype: string;
  data: Buffer;
  encoding?: string;
}

/**
 * Validate a single uploaded file
 */
export async function validateFile(
  file: UploadedFile,
  config?: Partial<FileUploadConfig>
): Promise<FileValidationResult> {
  const cfg = { ...uploadConfig, ...config };
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Extract file info
  const filename = file.filename || '';
  const mimeType = file.mimetype || 'application/octet-stream';
  const fileData = file.data;
  const fileSize = fileData.length;
  const extension = getFileExtension(filename).toLowerCase();
  
  // Check file size
  if (fileSize > cfg.maxFileSize) {
    errors.push(`File size (${formatBytes(fileSize)}) exceeds maximum allowed (${formatBytes(cfg.maxFileSize)})`);
  }
  
  if (fileSize === 0) {
    errors.push('File is empty');
  }
  
  // Check MIME type
  if (!cfg.allowedMimeTypes.includes(mimeType)) {
    errors.push(`File type '${mimeType}' is not allowed. Allowed types: ${cfg.allowedMimeTypes.join(', ')}`);
  }
  
  // Check file extension
  if (!cfg.allowedExtensions.includes(extension)) {
    errors.push(`File extension '${extension}' is not allowed. Allowed extensions: ${cfg.allowedExtensions.join(', ')}`);
  }
  
  // Verify magic bytes match claimed MIME type
  if (cfg.verifyMagicBytes && errors.length === 0) {
    if (!verifyMagicBytes(fileData, mimeType)) {
      errors.push(`File content does not match claimed type '${mimeType}'`);
      
      log.warn('Magic bytes mismatch', {
        filename,
        claimedMimeType: mimeType,
        fileSize,
      });
    }
  }
  
  // Check for executable content in supposedly safe files
  if (containsExecutableContent(fileData, mimeType)) {
    errors.push('File contains potentially executable content');
    
    log.warn('Executable content detected in upload', {
      filename,
      mimeType,
    });
  }
  
  // Calculate file hash for tracking
  const hash = createHash('sha256').update(fileData).digest('hex');
  
  // Log upload attempt
  log.info('File validation', {
    filename,
    mimeType,
    fileSize,
    extension,
    hash: hash.substring(0, 16),
    valid: errors.length === 0,
    errorCount: errors.length,
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fileInfo: errors.length === 0 ? {
      size: fileSize,
      mimeType,
      extension,
      hash,
    } : null,
  };
}

/**
 * Check for executable content hidden in files
 */
function containsExecutableContent(buffer: Buffer, mimeType: string): boolean {
  // Only check image and text files for hidden executables
  if (!mimeType.startsWith('image/') && !mimeType.startsWith('text/')) {
    return false;
  }
  
  const content = buffer.toString('latin1', 0, Math.min(buffer.length, 10000));
  
  // Check for script tags or PHP code
  const dangerousPatterns = [
    /<script\b/i,
    /<\?php/i,
    /<%.*%>/,  // ASP-style
    /\x00/,    // Null bytes (used in path traversal)
    /__HALT_COMPILER/i,  // PHP phar
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(content));
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot);
}

/**
 * Format bytes for display
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// =============================================================================
// VIRUS SCANNING
// =============================================================================

/**
 * Virus scan result
 */
export interface VirusScanResult {
  clean: boolean;
  threat?: string;
  scanTime: number;
  error?: string;
}

/**
 * Scan file for viruses using ClamAV or similar
 */
export async function scanFileForViruses(
  fileData: Buffer,
  filename: string
): Promise<VirusScanResult> {
  if (!uploadConfig.virusScanEnabled) {
    return { clean: true, scanTime: 0 };
  }
  
  const startTime = Date.now();
  
  try {
    // Prepare scan request
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), uploadConfig.virusScanTimeout);
    
    const response = await fetch(uploadConfig.virusScannerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': encodeURIComponent(filename),
      },
      body: new Uint8Array(fileData),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`Virus scanner returned ${response.status}`);
    }
    
    const result = await response.json() as { clean: boolean; threat?: string };
    const scanTime = Date.now() - startTime;
    
    if (!result.clean) {
      log.warn('Virus detected in upload', {
        filename,
        threat: result.threat,
        scanTime,
      });
    }
    
    return {
      clean: result.clean,
      threat: result.threat,
      scanTime,
    };
  } catch (error) {
    const scanTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    log.error('Virus scan failed', {
      filename,
      error: errorMessage,
      scanTime,
    });
    
    // In production, treat scan failures as suspicious
    if (process.env.NODE_ENV === 'production') {
      return {
        clean: false,
        error: errorMessage,
        scanTime,
      };
    }
    
    // In development, allow files if scanner is unavailable
    return {
      clean: true,
      error: `Scan skipped: ${errorMessage}`,
      scanTime,
    };
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Create file upload validation middleware
 */
export function createUploadMiddleware(options?: Partial<FileUploadConfig>) {
  const config = { ...uploadConfig, ...options };
  
  return async function uploadValidationMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Check if this is a multipart request
    if (!request.isMultipart()) {
      return;
    }
    
    const files: UploadedFile[] = [];
    const validationResults: FileValidationResult[] = [];
    let totalSize = 0;
    
    try {
      // Process multipart data
      const parts = request.parts();
      
      for await (const part of parts) {
        if (part.type === 'file') {
          // Check file count
          if (files.length >= config.maxFiles) {
            reply.status(400).send({
              error: 'Bad Request',
              code: 'TOO_MANY_FILES',
              message: `Maximum ${config.maxFiles} files allowed per request`,
            });
            return;
          }
          
          // Collect file data
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
            totalSize += chunk.length;
            
            // Check total size during upload
            if (totalSize > config.maxTotalSize) {
              reply.status(413).send({
                error: 'Payload Too Large',
                code: 'TOTAL_SIZE_EXCEEDED',
                message: `Total upload size exceeds ${formatBytes(config.maxTotalSize)}`,
              });
              return;
            }
          }
          
          const fileData = Buffer.concat(chunks);
          const uploadedFile: UploadedFile = {
            filename: part.filename,
            mimetype: part.mimetype,
            data: fileData,
            encoding: part.encoding,
          };
          
          // Validate file
          const validationResult = await validateFile(uploadedFile, config);
          validationResults.push(validationResult);
          
          if (!validationResult.valid) {
            reply.status(400).send({
              error: 'Bad Request',
              code: 'INVALID_FILE',
              message: 'File validation failed',
              details: validationResult.errors,
              filename: part.filename,
            });
            return;
          }
          
          // Virus scan if enabled
          if (config.virusScanEnabled) {
            const scanResult = await scanFileForViruses(fileData, part.filename);
            
            if (!scanResult.clean) {
              log.error('Virus scan rejected file', {
                filename: part.filename,
                threat: scanResult.threat,
                error: scanResult.error,
              });
              
              reply.status(400).send({
                error: 'Bad Request',
                code: 'MALWARE_DETECTED',
                message: 'File failed security scan',
              });
              return;
            }
          }
          
          files.push(uploadedFile);
        }
      }
      
      // Attach validated files to request
      (request as any).validatedFiles = files;
      (request as any).uploadValidation = validationResults;
      
    } catch (error) {
      log.error('Upload processing error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      reply.status(500).send({
        error: 'Internal Server Error',
        code: 'UPLOAD_PROCESSING_ERROR',
        message: 'Failed to process file upload',
      });
    }
  };
}

/**
 * Simple pre-handler for single file uploads
 */
export async function validateSingleFile(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  return createUploadMiddleware({ maxFiles: 1 })(request, reply);
}

/**
 * Pre-handler for image uploads only
 */
export const imageUploadMiddleware = createUploadMiddleware({
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  maxFileSize: 5 * 1024 * 1024, // 5MB
});

/**
 * Pre-handler for document uploads
 */
export const documentUploadMiddleware = createUploadMiddleware({
  allowedMimeTypes: ['application/pdf', 'text/plain', 'text/csv', 'application/json'],
  allowedExtensions: ['.pdf', '.txt', '.csv', '.json'],
  maxFileSize: 20 * 1024 * 1024, // 20MB
});

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createUploadMiddleware,
  validateFile,
  validateSingleFile,
  scanFileForViruses,
  setUploadConfig,
  getUploadConfig,
  imageUploadMiddleware,
  documentUploadMiddleware,
};
