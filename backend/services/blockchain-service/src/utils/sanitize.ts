/**
 * Input Sanitization Utilities
 * 
 * AUDIT FIX #5: Implement sanitizeString for user inputs
 * AUDIT FIX #6: Add Unicode normalization
 * 
 * Features:
 * - String sanitization with configurable options
 * - HTML tag stripping
 * - Unicode normalization (NFC)
 * - Problematic Unicode character removal
 * - Object-level batch sanitization
 */

import { logger } from './logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_MAX_LENGTH = 1000;
const DEFAULT_ALLOWED_CHARS_PATTERN = /[^\p{L}\p{N}\p{P}\p{Z}\p{S}]/gu;

// Problematic Unicode characters to remove
const PROBLEMATIC_UNICODE = [
  '\u200B', // Zero-width space
  '\u200C', // Zero-width non-joiner
  '\u200D', // Zero-width joiner
  '\u200E', // Left-to-right mark
  '\u200F', // Right-to-left mark
  '\u202A', // Left-to-right embedding
  '\u202B', // Right-to-left embedding
  '\u202C', // Pop directional formatting
  '\u202D', // Left-to-right override
  '\u202E', // Right-to-left override
  '\u2060', // Word joiner
  '\u2061', // Function application
  '\u2062', // Invisible times
  '\u2063', // Invisible separator
  '\u2064', // Invisible plus
  '\u206A', // Inhibit symmetric swapping
  '\u206B', // Activate symmetric swapping
  '\u206C', // Inhibit Arabic form shaping
  '\u206D', // Activate Arabic form shaping
  '\u206E', // National digit shapes
  '\u206F', // Nominal digit shapes
  '\uFEFF', // Byte order mark / Zero-width no-break space
  '\uFFF9', // Interlinear annotation anchor
  '\uFFFA', // Interlinear annotation separator
  '\uFFFB', // Interlinear annotation terminator
];

// Regex for problematic Unicode
const PROBLEMATIC_UNICODE_REGEX = new RegExp(`[${PROBLEMATIC_UNICODE.join('')}]`, 'g');

// HTML tag pattern
const HTML_TAG_REGEX = /<[^>]*>/g;

// Script injection patterns
const SCRIPT_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /data:/gi,
];

// =============================================================================
// SANITIZE OPTIONS INTERFACE
// =============================================================================

export interface SanitizeOptions {
  /** Maximum length after sanitization (default: 1000) */
  maxLength?: number;
  /** Whether to strip HTML tags (default: true) */
  stripHtml?: boolean;
  /** Whether to trim whitespace (default: true) */
  trim?: boolean;
  /** Whether to normalize Unicode (default: true) */
  normalizeUnicode?: boolean;
  /** Whether to remove problematic Unicode (default: true) */
  removeProblematicUnicode?: boolean;
  /** Custom allowed characters regex pattern */
  allowedCharsPattern?: RegExp;
  /** Whether to collapse multiple whitespace to single space */
  collapseWhitespace?: boolean;
  /** Replacement for stripped content (default: '') */
  replacement?: string;
  /** Field name for logging purposes */
  fieldName?: string;
}

const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  maxLength: DEFAULT_MAX_LENGTH,
  stripHtml: true,
  trim: true,
  normalizeUnicode: true,
  removeProblematicUnicode: true,
  allowedCharsPattern: DEFAULT_ALLOWED_CHARS_PATTERN,
  collapseWhitespace: true,
  replacement: '',
  fieldName: 'unknown'
};

// =============================================================================
// UNICODE NORMALIZATION - AUDIT FIX #6
// =============================================================================

/**
 * Normalize Unicode string using NFC normalization
 * AUDIT FIX #6: Consistent Unicode handling
 */
export function normalizeUnicode(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  try {
    // NFC: Canonical Decomposition, followed by Canonical Composition
    return input.normalize('NFC');
  } catch (error) {
    logger.warn('Unicode normalization failed', {
      error: (error as Error).message,
      inputLength: input.length
    });
    return input;
  }
}

/**
 * Remove problematic Unicode characters
 * AUDIT FIX #6: Prevent Unicode-based attacks
 */
export function removeProblematicUnicode(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  const cleaned = input.replace(PROBLEMATIC_UNICODE_REGEX, '');
  
  if (cleaned.length !== input.length) {
    logger.debug('Removed problematic Unicode characters', {
      originalLength: input.length,
      cleanedLength: cleaned.length,
      removedCount: input.length - cleaned.length
    });
  }
  
  return cleaned;
}

/**
 * Check if string contains homograph attack characters
 * Characters that look similar but are different Unicode code points
 */
export function containsHomographs(input: string): boolean {
  // Common homograph pairs
  const homographPatterns = [
    /[а-яА-Я]/, // Cyrillic characters that look like Latin
    /[ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]/, // Greek capitals
    /[\u0430-\u044f]/, // Cyrillic lowercase
  ];
  
  // Check if string mixes scripts suspiciously
  const hasLatin = /[a-zA-Z]/.test(input);
  const hasCyrillic = /[а-яА-Я]/.test(input);
  const hasGreek = /[\u0370-\u03FF]/.test(input);
  
  // Suspicious if mixing Latin with lookalike scripts
  return (hasLatin && hasCyrillic) || (hasLatin && hasGreek);
}

// =============================================================================
// STRING SANITIZATION - AUDIT FIX #5
// =============================================================================

/**
 * Strip HTML tags from string
 */
function stripHtmlTags(input: string): string {
  let result = input;
  
  // Remove script tags and content
  for (const pattern of SCRIPT_PATTERNS) {
    result = result.replace(pattern, '');
  }
  
  // Remove remaining HTML tags
  result = result.replace(HTML_TAG_REGEX, '');
  
  // Decode common HTML entities
  result = result
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
  
  return result;
}

/**
 * Sanitize a string input
 * AUDIT FIX #5: Comprehensive string sanitization
 * 
 * @param input - The string to sanitize
 * @param options - Sanitization options
 * @returns Sanitized string
 */
export function sanitizeString(
  input: string | undefined | null,
  options?: SanitizeOptions
): string {
  // Handle null/undefined
  if (input === null || input === undefined) {
    return '';
  }
  
  // Ensure input is a string
  if (typeof input !== 'string') {
    logger.warn('sanitizeString received non-string input', {
      type: typeof input,
      fieldName: options?.fieldName
    });
    return '';
  }
  
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let result = input;
  
  // Step 1: Unicode normalization
  if (opts.normalizeUnicode) {
    result = normalizeUnicode(result);
  }
  
  // Step 2: Remove problematic Unicode
  if (opts.removeProblematicUnicode) {
    result = removeProblematicUnicode(result);
  }
  
  // Step 3: Strip HTML tags
  if (opts.stripHtml) {
    result = stripHtmlTags(result);
  }
  
  // Step 4: Trim whitespace
  if (opts.trim) {
    result = result.trim();
  }
  
  // Step 5: Collapse multiple whitespace
  if (opts.collapseWhitespace) {
    result = result.replace(/\s+/g, ' ');
  }
  
  // Step 6: Truncate to max length
  if (opts.maxLength && result.length > opts.maxLength) {
    result = result.substring(0, opts.maxLength);
    logger.debug('String truncated', {
      fieldName: opts.fieldName,
      originalLength: input.length,
      maxLength: opts.maxLength
    });
  }
  
  return result;
}

/**
 * Sanitize string with strict settings (for identifiers, names)
 */
export function sanitizeStrict(
  input: string | undefined | null,
  maxLength: number = 100
): string {
  return sanitizeString(input, {
    maxLength,
    stripHtml: true,
    trim: true,
    normalizeUnicode: true,
    removeProblematicUnicode: true,
    collapseWhitespace: true
  });
}

/**
 * Sanitize string for labels (wallet names, etc.)
 */
export function sanitizeLabel(input: string | undefined | null): string {
  return sanitizeString(input, {
    maxLength: 50,
    stripHtml: true,
    trim: true,
    fieldName: 'label'
  });
}

/**
 * Sanitize string for descriptions (metadata, etc.)
 */
export function sanitizeDescription(input: string | undefined | null): string {
  return sanitizeString(input, {
    maxLength: 500,
    stripHtml: true,
    trim: true,
    fieldName: 'description'
  });
}

// =============================================================================
// OBJECT SANITIZATION
// =============================================================================

export interface SanitizeObjectOptions {
  /** Fields to apply sanitization to */
  fields?: string[];
  /** Fields to skip sanitization */
  skipFields?: string[];
  /** Custom options per field */
  fieldOptions?: Record<string, SanitizeOptions>;
  /** Whether to sanitize nested objects */
  deep?: boolean;
  /** Maximum depth for nested sanitization */
  maxDepth?: number;
}

/**
 * Sanitize all string fields in an object
 * AUDIT FIX #5: Batch sanitization for request bodies
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  options?: SanitizeObjectOptions
): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const opts: Required<SanitizeObjectOptions> = {
    fields: options?.fields || [],
    skipFields: options?.skipFields || [],
    fieldOptions: options?.fieldOptions || {},
    deep: options?.deep ?? true,
    maxDepth: options?.maxDepth ?? 5
  };
  
  return sanitizeObjectRecursive(obj, opts, 0);
}

function sanitizeObjectRecursive<T extends Record<string, any>>(
  obj: T,
  options: Required<SanitizeObjectOptions>,
  depth: number
): T {
  if (depth > options.maxDepth) {
    return obj;
  }
  
  const result: Record<string, any> = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip specified fields
    if (options.skipFields.includes(key)) {
      result[key] = value;
      continue;
    }
    
    // Only process specified fields if list is provided
    if (options.fields.length > 0 && !options.fields.includes(key)) {
      result[key] = value;
      continue;
    }
    
    if (typeof value === 'string') {
      const fieldOpts = options.fieldOptions[key] || { fieldName: key };
      result[key] = sanitizeString(value, fieldOpts);
    } else if (Array.isArray(value) && options.deep) {
      result[key] = value.map(item => {
        if (typeof item === 'string') {
          return sanitizeString(item, { fieldName: `${key}[]` });
        } else if (typeof item === 'object' && item !== null) {
          return sanitizeObjectRecursive(item, options, depth + 1);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null && options.deep) {
      result[key] = sanitizeObjectRecursive(value, options, depth + 1);
    } else {
      result[key] = value;
    }
  }
  
  return result as T;
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if string is safe (no dangerous content)
 */
export function isStringSafe(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return true;
  }
  
  // Check for script injection
  for (const pattern of SCRIPT_PATTERNS) {
    if (pattern.test(input)) {
      return false;
    }
  }
  
  // Check for problematic Unicode
  if (PROBLEMATIC_UNICODE_REGEX.test(input)) {
    return false;
  }
  
  // Check for homographs
  if (containsHomographs(input)) {
    return false;
  }
  
  return true;
}

/**
 * Validate and sanitize, returning result with safety flag
 */
export function validateAndSanitize(
  input: string | undefined | null,
  options?: SanitizeOptions
): { value: string; wasSanitized: boolean; wasUnsafe: boolean } {
  const original = input || '';
  const wasUnsafe = !isStringSafe(original);
  const sanitized = sanitizeString(input, options);
  const wasSanitized = original !== sanitized;
  
  return {
    value: sanitized,
    wasSanitized,
    wasUnsafe
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  PROBLEMATIC_UNICODE,
  DEFAULT_MAX_LENGTH
};
