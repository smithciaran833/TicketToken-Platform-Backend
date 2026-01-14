/**
 * XSS Prevention Utilities
 * 
 * Batch 25 fix:
 * - SEC-EXT3: XSS prevention - HTML encoding, sanitization functions
 * 
 * Provides comprehensive XSS protection for user-generated content
 */

import { logger } from './logger';

const log = logger.child({ component: 'XSSPrevention' });

// =============================================================================
// HTML ENTITY ENCODING
// =============================================================================

/**
 * HTML entities that must be escaped
 */
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

/**
 * Reverse HTML entities for decoding
 */
const HTML_ENTITIES_REVERSE: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#x2F;': '/',
  '&#x60;': '`',
  '&#x3D;': '=',
  '&#39;': "'",  // Alternative single quote encoding
  '&#47;': '/',  // Alternative slash encoding
};

/**
 * Encode HTML entities to prevent XSS
 * 
 * @param input - String to encode
 * @returns Encoded string safe for HTML output
 */
export function encodeHtml(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  return input.replace(/[&<>"'`=\/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Decode HTML entities back to original characters
 * Use only for display purposes when you know the source is safe
 * 
 * @param input - Encoded string
 * @returns Decoded string
 */
export function decodeHtml(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  return input.replace(/&(?:amp|lt|gt|quot|#x27|#x2F|#x60|#x3D|#39|#47);/g, 
    (entity) => HTML_ENTITIES_REVERSE[entity] || entity
  );
}

// =============================================================================
// ATTRIBUTE ENCODING
// =============================================================================

/**
 * Encode a value for safe use in HTML attributes
 * More aggressive than HTML encoding
 */
export function encodeAttribute(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Encode all non-alphanumeric characters
  return input.replace(/[^a-zA-Z0-9]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code < 256) {
      return `&#x${code.toString(16).padStart(2, '0')};`;
    }
    return `&#x${code.toString(16)};`;
  });
}

/**
 * Encode a value for safe use in JavaScript strings
 */
export function encodeJavaScript(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  return input.replace(/[\\'"<>&\r\n\u2028\u2029]/g, (char) => {
    const escapes: Record<string, string> = {
      '\\': '\\\\',
      "'": "\\'",
      '"': '\\"',
      '<': '\\u003C',
      '>': '\\u003E',
      '&': '\\u0026',
      '\r': '\\r',
      '\n': '\\n',
      '\u2028': '\\u2028',  // Line separator
      '\u2029': '\\u2029',  // Paragraph separator
    };
    return escapes[char] || char;
  });
}

/**
 * Encode a value for safe use in URLs
 */
export function encodeUrl(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  return encodeURIComponent(input);
}

/**
 * Encode a value for safe use in CSS
 */
export function encodeCss(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Escape all non-alphanumeric characters with backslash
  return input.replace(/[^a-zA-Z0-9]/g, (char) => {
    const code = char.charCodeAt(0);
    return `\\${code.toString(16)} `;
  });
}

// =============================================================================
// HTML SANITIZATION
// =============================================================================

/**
 * Configuration for HTML sanitization
 */
export interface SanitizeConfig {
  /** Allowed HTML tags */
  allowedTags: string[];
  /** Allowed attributes per tag (or '*' for all tags) */
  allowedAttributes: Record<string, string[]>;
  /** Allowed URL schemes */
  allowedSchemes: string[];
  /** Strip all tags (only return text content) */
  stripAllTags: boolean;
  /** Max string length (0 for no limit) */
  maxLength: number;
}

/**
 * Default sanitization config - restrictive
 */
const DEFAULT_SANITIZE_CONFIG: SanitizeConfig = {
  allowedTags: ['b', 'i', 'u', 'strong', 'em', 'p', 'br', 'span'],
  allowedAttributes: {
    '*': ['class'],  // Allow class on all permitted tags
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  stripAllTags: false,
  maxLength: 0,
};

/**
 * Strict sanitization config - strips all HTML
 */
export const STRICT_SANITIZE_CONFIG: SanitizeConfig = {
  allowedTags: [],
  allowedAttributes: {},
  allowedSchemes: [],
  stripAllTags: true,
  maxLength: 10000,
};

/**
 * Permissive config for rich text content
 */
export const RICH_TEXT_SANITIZE_CONFIG: SanitizeConfig = {
  allowedTags: [
    'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'blockquote', 'code', 'pre',
  ],
  allowedAttributes: {
    '*': ['class', 'id'],
    'a': ['href', 'title', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  stripAllTags: false,
  maxLength: 50000,
};

/**
 * Sanitize HTML content to prevent XSS
 * 
 * @param input - Potentially dangerous HTML string
 * @param config - Sanitization configuration
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(
  input: string,
  config: Partial<SanitizeConfig> = {}
): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  const cfg = { ...DEFAULT_SANITIZE_CONFIG, ...config };
  
  // Apply max length
  let result = cfg.maxLength > 0 ? input.slice(0, cfg.maxLength) : input;
  
  // If stripping all tags, just encode everything
  if (cfg.stripAllTags || cfg.allowedTags.length === 0) {
    return stripHtmlTags(result);
  }
  
  // Remove script tags and their content
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove style tags and their content
  result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove event handlers (onclick, onerror, etc.)
  result = result.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  result = result.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: and data: URLs
  result = result.replace(/javascript\s*:/gi, 'blocked:');
  result = result.replace(/data\s*:/gi, 'blocked:');
  result = result.replace(/vbscript\s*:/gi, 'blocked:');
  
  // Process allowed tags
  const allowedTagsLower = cfg.allowedTags.map(t => t.toLowerCase());
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  
  result = result.replace(tagRegex, (match, tagName, attributes) => {
    const tagLower = tagName.toLowerCase();
    
    // If tag is not allowed, encode it
    if (!allowedTagsLower.includes(tagLower)) {
      return encodeHtml(match);
    }
    
    // Process attributes for allowed tags
    const sanitizedAttrs = sanitizeAttributes(tagLower, attributes, cfg);
    
    // Return sanitized tag
    if (match.startsWith('</')) {
      return `</${tagLower}>`;
    }
    return sanitizedAttrs ? `<${tagLower} ${sanitizedAttrs}>` : `<${tagLower}>`;
  });
  
  return result;
}

/**
 * Sanitize HTML attributes
 */
function sanitizeAttributes(
  tagName: string,
  attributes: string,
  config: SanitizeConfig
): string {
  if (!attributes.trim()) {
    return '';
  }
  
  // Get allowed attributes for this tag
  const tagAllowed = config.allowedAttributes[tagName] || [];
  const globalAllowed = config.allowedAttributes['*'] || [];
  const allowedAttrs = [...new Set([...tagAllowed, ...globalAllowed])].map(a => a.toLowerCase());
  
  if (allowedAttrs.length === 0) {
    return '';
  }
  
  const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/g;
  const sanitizedAttrs: string[] = [];
  
  let match;
  while ((match = attrRegex.exec(attributes)) !== null) {
    const attrName = match[1].toLowerCase();
    const attrValue = match[2] || match[3] || match[4] || '';
    
    if (!allowedAttrs.includes(attrName)) {
      continue;
    }
    
    // Special handling for href/src attributes
    if (attrName === 'href' || attrName === 'src') {
      const sanitizedUrl = sanitizeUrl(attrValue, config.allowedSchemes);
      if (sanitizedUrl) {
        sanitizedAttrs.push(`${attrName}="${encodeHtml(sanitizedUrl)}"`);
      }
    } else {
      // Encode attribute value
      sanitizedAttrs.push(`${attrName}="${encodeHtml(attrValue)}"`);
    }
  }
  
  return sanitizedAttrs.join(' ');
}

/**
 * Sanitize a URL to ensure it uses an allowed scheme
 */
export function sanitizeUrl(url: string, allowedSchemes: string[] = ['http', 'https']): string {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  const trimmed = url.trim().toLowerCase();
  
  // Block javascript: and data: URLs
  if (trimmed.startsWith('javascript:') || 
      trimmed.startsWith('data:') || 
      trimmed.startsWith('vbscript:')) {
    log.warn('Blocked dangerous URL scheme', { url: url.substring(0, 50) });
    return '';
  }
  
  // Check for allowed schemes
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(url);
  if (hasScheme) {
    const scheme = url.split(':')[0].toLowerCase();
    if (!allowedSchemes.includes(scheme)) {
      log.warn('Blocked disallowed URL scheme', { scheme, url: url.substring(0, 50) });
      return '';
    }
  }
  
  // Allow relative URLs and fragment identifiers
  if (url.startsWith('/') || url.startsWith('#') || url.startsWith('?')) {
    return url;
  }
  
  // URL with allowed scheme
  return url;
}

/**
 * Strip all HTML tags from a string
 */
export function stripHtmlTags(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Remove all HTML tags
  let result = input.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  result = decodeHtml(result);
  
  // Re-encode to prevent any XSS that might have been in entity form
  return encodeHtml(result);
}

// =============================================================================
// JSON SANITIZATION
// =============================================================================

/**
 * Sanitize a JSON object by encoding all string values
 */
export function sanitizeJson<T>(obj: T, options: { deep?: boolean } = {}): T {
  const { deep = true } = options;
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return encodeHtml(obj) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return (deep 
      ? obj.map(item => sanitizeJson(item, options))
      : obj) as unknown as T;
  }
  
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize the key too
      const safeKey = encodeHtml(key);
      result[safeKey] = deep ? sanitizeJson(value, options) : value;
    }
    return result as unknown as T;
  }
  
  return obj;
}

// =============================================================================
// INPUT VALIDATION HELPERS
// =============================================================================

/**
 * Check if a string contains potentially dangerous HTML/script content
 */
export function containsDangerousContent(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }
  
  const dangerousPatterns = [
    /<script\b/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe\b/i,
    /<object\b/i,
    /<embed\b/i,
    /<form\b/i,
    /data:/i,
    /vbscript:/i,
    /expression\s*\(/i,  // CSS expression
    /url\s*\(\s*["']?\s*javascript/i,  // CSS url with javascript
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(input));
}

/**
 * Validate and sanitize user input
 * Returns null if input is dangerous and should be rejected
 */
export function validateAndSanitize(
  input: string,
  options: {
    maxLength?: number;
    allowHtml?: boolean;
    htmlConfig?: Partial<SanitizeConfig>;
  } = {}
): string | null {
  const {
    maxLength = 10000,
    allowHtml = false,
    htmlConfig = {},
  } = options;
  
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Check length
  if (input.length > maxLength) {
    log.warn('Input exceeds maximum length', { length: input.length, maxLength });
    return null;
  }
  
  // Check for dangerous content
  if (!allowHtml && containsDangerousContent(input)) {
    log.warn('Input contains dangerous content', { 
      preview: input.substring(0, 100) 
    });
    return null;
  }
  
  // Sanitize
  if (allowHtml) {
    return sanitizeHtml(input, htmlConfig);
  }
  
  return encodeHtml(input);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  encodeHtml,
  decodeHtml,
  encodeAttribute,
  encodeJavaScript,
  encodeUrl,
  encodeCss,
  sanitizeHtml,
  sanitizeUrl,
  stripHtmlTags,
  sanitizeJson,
  containsDangerousContent,
  validateAndSanitize,
  STRICT_SANITIZE_CONFIG,
  RICH_TEXT_SANITIZE_CONFIG,
};
