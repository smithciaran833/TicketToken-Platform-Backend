/**
 * Sanitization Utilities
 * 
 * AUDIT FIXES:
 * - INP-4: SVG watermark XSS → Text sanitization for SVG watermarks
 * - General input sanitization for security
 */

// =============================================================================
// HTML/XML Entity Escaping
// =============================================================================

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/**
 * AUDIT FIX INP-4: Escape HTML entities to prevent XSS
 * Used for watermark text that will be embedded in SVG
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  return text.replace(/[&<>"'`=\/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Escape XML entities for SVG content
 */
export function escapeXml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  return text.replace(/[&<>"']/g, (char) => XML_ENTITIES[char] || char);
}

// =============================================================================
// SVG-Specific Sanitization
// =============================================================================

/**
 * AUDIT FIX INP-4: Sanitize text for use in SVG watermarks
 * Removes potentially dangerous characters and escapes XML entities
 */
export function sanitizeSvgText(text: string, maxLength: number = 100): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Remove control characters
  let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Remove potential script injection patterns
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');
  sanitized = sanitized.replace(/data:/gi, '');
  
  // Escape XML entities
  sanitized = escapeXml(sanitized);
  
  // Trim and limit length
  sanitized = sanitized.trim().substring(0, maxLength);
  
  return sanitized;
}

/**
 * Validate and sanitize SVG watermark options
 */
export function sanitizeWatermarkOptions(options: {
  text?: string;
  position?: string;
  opacity?: number;
  fontSize?: number;
  color?: string;
}): {
  text: string;
  position: string;
  opacity: number;
  fontSize: number;
  color: string;
} {
  const validPositions = ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
  
  return {
    text: sanitizeSvgText(options.text || '', 100),
    position: validPositions.includes(options.position || '') ? options.position! : 'center',
    opacity: Math.max(0, Math.min(1, options.opacity ?? 0.5)),
    fontSize: Math.max(10, Math.min(200, options.fontSize ?? 24)),
    color: sanitizeColor(options.color || '#000000'),
  };
}

// =============================================================================
// Color Sanitization
// =============================================================================

/**
 * Sanitize a color value to prevent injection
 * Only allows hex colors or named colors
 */
export function sanitizeColor(color: string): string {
  if (!color || typeof color !== 'string') {
    return '#000000';
  }
  
  // Allow hex colors
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color;
  }
  
  if (/^#[0-9A-Fa-f]{3}$/.test(color)) {
    // Expand shorthand hex
    const r = color[1];
    const g = color[2];
    const b = color[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  
  // Allow safe named colors
  const safeColors = [
    'black', 'white', 'red', 'green', 'blue', 'yellow', 
    'cyan', 'magenta', 'gray', 'grey', 'transparent'
  ];
  
  if (safeColors.includes(color.toLowerCase())) {
    return color.toLowerCase();
  }
  
  return '#000000';
}

// =============================================================================
// Filename Sanitization
// =============================================================================

/**
 * Sanitize a filename to prevent path traversal and other attacks
 */
export function sanitizeFilename(filename: string, maxLength: number = 255): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed';
  }
  
  // Remove path traversal attempts
  let sanitized = filename.replace(/\.\./g, '');
  
  // Remove absolute path indicators
  sanitized = sanitized.replace(/^[/\\]+/, '');
  sanitized = sanitized.replace(/^[A-Za-z]:/, '');
  
  // Remove null bytes
  sanitized = sanitized.replace(/\x00/g, '');
  
  // Only keep safe characters
  // Allow alphanumeric, dash, underscore, dot, space
  sanitized = sanitized.replace(/[^a-zA-Z0-9._\- ]/g, '_');
  
  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');
  
  // Limit length
  sanitized = sanitized.substring(0, maxLength);
  
  // Ensure we have something
  if (!sanitized) {
    return 'unnamed';
  }
  
  return sanitized;
}

/**
 * Get safe file extension
 */
export function getSafeExtension(filename: string): string {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  if (!match) {
    return '';
  }
  return match[1]!.toLowerCase();
}

// =============================================================================
// MIME Type Validation
// =============================================================================

const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // Video
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  // Archives (optional)
  'application/zip',
  'application/x-tar',
  'application/gzip',
]);

/**
 * Validate MIME type is allowed
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType?.toLowerCase() || '');
}

/**
 * Sanitize MIME type
 */
export function sanitizeMimeType(mimeType: string): string {
  if (!mimeType || typeof mimeType !== 'string') {
    return 'application/octet-stream';
  }
  
  const normalized = mimeType.toLowerCase().trim();
  
  if (ALLOWED_MIME_TYPES.has(normalized)) {
    return normalized;
  }
  
  return 'application/octet-stream';
}

// =============================================================================
// URL Sanitization
// =============================================================================

/**
 * Sanitize a URL to prevent XSS
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  // Remove whitespace
  const trimmed = url.trim();
  
  // Block dangerous protocols
  const dangerous = [
    'javascript:',
    'data:',
    'vbscript:',
    'file:',
  ];
  
  const lower = trimmed.toLowerCase();
  for (const protocol of dangerous) {
    if (lower.startsWith(protocol)) {
      return '';
    }
  }
  
  // Only allow http, https, and relative URLs
  if (trimmed.startsWith('http://') || 
      trimmed.startsWith('https://') || 
      trimmed.startsWith('/') ||
      !trimmed.includes(':')) {
    return trimmed;
  }
  
  return '';
}

// =============================================================================
// General String Sanitization
// =============================================================================

/**
 * Remove potential SQL injection patterns (defense in depth)
 * Note: Always use parameterized queries as primary defense
 */
export function sanitizeSqlString(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Remove common SQL injection patterns
  return text
    .replace(/['";]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b/gi, '');
}

/**
 * Sanitize a string for use in headers
 */
export function sanitizeHeaderValue(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  
  // Remove newlines and control characters that could enable header injection
  return value
    .replace(/[\r\n]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// =============================================================================
// Export
// =============================================================================

export default {
  escapeHtml,
  escapeXml,
  sanitizeSvgText,
  sanitizeWatermarkOptions,
  sanitizeColor,
  sanitizeFilename,
  getSafeExtension,
  isAllowedMimeType,
  sanitizeMimeType,
  sanitizeUrl,
  sanitizeSqlString,
  sanitizeHeaderValue,
};
