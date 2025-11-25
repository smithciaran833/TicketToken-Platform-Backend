/**
 * Path Validation Utilities
 * Prevents path traversal attacks and ensures file operations are restricted to allowed directories
 */

import * as path from 'path';
import { logger } from './logger';
import { securityConfig } from '../config/security.config';

/**
 * Normalize and resolve a file path
 */
export function normalizePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }

  // Normalize the path to remove . and .. segments
  const normalized = path.normalize(filePath);
  
  // Resolve to absolute path
  const resolved = path.resolve(normalized);

  return resolved;
}

/**
 * Check if path contains traversal attempts
 */
export function containsTraversal(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  const traversalPatterns = [
    /\.\./,           // Parent directory reference
    /~\//,            // Home directory reference
    /\/\//,           // Double slashes
    /\\/,             // Backslashes (normalize first)
    /%2e%2e/i,        // URL encoded ..
    /%252e%252e/i,    // Double URL encoded ..
    /\.\.%2f/i,       // Mixed encoding
    /\.\.%5c/i,       // Windows path with encoding
  ];

  return traversalPatterns.some(pattern => pattern.test(filePath));
}

/**
 * Check if path is within allowed directories
 */
export function isPathAllowed(filePath: string): boolean {
  try {
    const normalized = normalizePath(filePath);
    const allowedDirs = securityConfig.pathValidation.allowedDirectories;

    // Check if path starts with any allowed directory
    return allowedDirs.some(allowedDir => {
      const resolvedAllowed = path.resolve(allowedDir);
      return normalized.startsWith(resolvedAllowed);
    });
  } catch (error) {
    logger.error('Error checking path allowlist', {
      path: filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Calculate depth of path (number of directory levels)
 */
export function getPathDepth(filePath: string): number {
  const normalized = normalizePath(filePath);
  const parts = normalized.split(path.sep).filter(part => part.length > 0);
  return parts.length;
}

/**
 * Check if path depth exceeds maximum
 */
export function isPathDepthValid(filePath: string): boolean {
  const depth = getPathDepth(filePath);
  const maxDepth = securityConfig.pathValidation.maxDepth;
  return depth <= maxDepth;
}

/**
 * Sanitize filename to remove dangerous characters
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Filename must be a non-empty string');
  }

  // Remove path separators and other dangerous characters
  let sanitized = filename
    .replace(/[\/\\]/g, '')           // Remove path separators
    .replace(/\.\./g, '')              // Remove parent directory references
    .replace(/^\.+/, '')               // Remove leading dots
    .replace(/[<>:"|?*]/g, '')         // Remove Windows invalid chars
    .replace(/[\x00-\x1f]/g, '')       // Remove control characters
    .replace(/\s+/g, '_');             // Replace spaces with underscores

  // Ensure filename is not empty after sanitization
  if (sanitized.length === 0) {
    sanitized = 'file_' + Date.now();
  }

  // Limit filename length
  const maxLength = 255;
  if (sanitized.length > maxLength) {
    const ext = path.extname(sanitized);
    const nameWithoutExt = path.basename(sanitized, ext);
    sanitized = nameWithoutExt.substring(0, maxLength - ext.length) + ext;
  }

  return sanitized;
}

/**
 * Validate file extension against allowed list
 */
export function isExtensionAllowed(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const allowedExtensions = securityConfig.inputSanitization.allowedFileExtensions;
  return allowedExtensions.includes(ext);
}

/**
 * Comprehensive path validation
 */
export function validatePath(filePath: string, options: {
  checkTraversal?: boolean;
  checkAllowed?: boolean;
  checkDepth?: boolean;
  checkExtension?: boolean;
} = {}): {
  valid: boolean;
  normalizedPath: string;
  errors: string[];
} {
  const {
    checkTraversal = true,
    checkAllowed = true,
    checkDepth = true,
    checkExtension = false,
  } = options;

  const errors: string[] = [];
  let normalizedPath = '';

  try {
    // Normalize path
    normalizedPath = normalizePath(filePath);

    // Check for traversal attempts
    if (checkTraversal && containsTraversal(filePath)) {
      errors.push('Path contains traversal attempts');
      logger.warn('Path traversal attempt detected', {
        path: filePath,
        normalizedPath,
      });
    }

    // Check if path is in allowed directories
    if (checkAllowed && securityConfig.pathValidation.preventTraversal) {
      if (!isPathAllowed(normalizedPath)) {
        errors.push('Path is not in allowed directories');
        logger.warn('Unauthorized path access attempt', {
          path: filePath,
          normalizedPath,
        });
      }
    }

    // Check path depth
    if (checkDepth && !isPathDepthValid(normalizedPath)) {
      errors.push(`Path depth exceeds maximum of ${securityConfig.pathValidation.maxDepth}`);
    }

    // Check file extension
    if (checkExtension && !isExtensionAllowed(filePath)) {
      errors.push('File extension is not allowed');
    }

  } catch (error) {
    errors.push(`Path validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    logger.error('Path validation failed', {
      path: filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  return {
    valid: errors.length === 0,
    normalizedPath,
    errors,
  };
}

/**
 * Build safe file path within allowed directory
 */
export function buildSafePath(baseDir: string, filename: string): string | null {
  try {
    // Sanitize filename
    const sanitizedFilename = sanitizeFilename(filename);

    // Build path
    const fullPath = path.join(baseDir, sanitizedFilename);

    // Validate the resulting path
    const validation = validatePath(fullPath, {
      checkTraversal: true,
      checkAllowed: true,
      checkDepth: true,
      checkExtension: true,
    });

    if (!validation.valid) {
      logger.error('Safe path building failed', {
        baseDir,
        filename,
        errors: validation.errors,
      });
      return null;
    }

    return validation.normalizedPath;
  } catch (error) {
    logger.error('Error building safe path', {
      baseDir,
      filename,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Check if file operations should be allowed on this path
 */
export function canAccessPath(filePath: string, operation: 'read' | 'write' | 'delete'): boolean {
  const validation = validatePath(filePath, {
    checkTraversal: true,
    checkAllowed: true,
    checkDepth: true,
  });

  if (!validation.valid) {
    logger.warn(`${operation} operation denied on path`, {
      path: filePath,
      operation,
      errors: validation.errors,
    });
    return false;
  }

  return true;
}

export default {
  normalizePath,
  containsTraversal,
  isPathAllowed,
  getPathDepth,
  isPathDepthValid,
  sanitizeFilename,
  isExtensionAllowed,
  validatePath,
  buildSafePath,
  canAccessPath,
};
