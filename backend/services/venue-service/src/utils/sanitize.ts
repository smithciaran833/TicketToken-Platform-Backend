/**
 * Input sanitization utilities
 * 
 * Security Fixes:
 * - SEC1: Prototype pollution protection
 * - SEC8: Unicode normalization for comparisons
 */

/**
 * SECURITY FIX (SEC1): Dangerous prototype pollution keys
 */
const DANGEROUS_KEYS = [
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
];

/**
 * SECURITY FIX (SEC1): Check if a key is a dangerous prototype pollution key
 */
export function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.includes(key);
}

/**
 * SECURITY FIX (SEC1): Recursively sanitize an object to prevent prototype pollution
 * Removes dangerous keys like __proto__, constructor, prototype
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item)) as unknown as T;
  }

  const sanitized: Record<string, any> = {};

  for (const key of Object.keys(obj)) {
    // Skip dangerous keys
    if (isDangerousKey(key)) {
      continue;
    }

    const value = obj[key];
    
    // Recursively sanitize nested objects
    if (value !== null && typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

/**
 * SECURITY FIX (SEC8): Normalize Unicode string for consistent comparisons
 * Uses NFC (Canonical Decomposition, followed by Canonical Composition)
 */
export function normalizeUnicode(str: string): string {
  if (typeof str !== 'string') {
    return str;
  }
  return str.normalize('NFC');
}

/**
 * SECURITY FIX (SEC8): Normalize and lowercase for case-insensitive comparisons
 */
export function normalizeForComparison(str: string): string {
  if (typeof str !== 'string') {
    return str;
  }
  return str.normalize('NFC').toLowerCase().trim();
}

/**
 * SECURITY FIX (SEC8): Create a slug from a string with Unicode normalization
 */
export function createSlug(str: string): string {
  if (typeof str !== 'string') {
    return '';
  }
  
  return str
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
    .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * SECURITY FIX (SEC8): Safe string comparison with Unicode normalization
 */
export function safeStringCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  return normalizeUnicode(a) === normalizeUnicode(b);
}

/**
 * SECURITY FIX (SEC8): Safe slug comparison with normalization
 */
export function safeSlugCompare(a: string, b: string): boolean {
  return createSlug(a) === createSlug(b);
}

/**
 * Sanitize request body - combine prototype pollution protection and Unicode normalization
 */
export function sanitizeRequestBody<T extends Record<string, any>>(body: T): T {
  // First remove dangerous keys
  const sanitized = sanitizeObject(body);
  
  // Then normalize string values
  return normalizeStringValues(sanitized);
}

/**
 * Recursively normalize all string values in an object
 */
function normalizeStringValues<T extends Record<string, any>>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'string') {
        return normalizeUnicode(item);
      }
      if (item !== null && typeof item === 'object') {
        return normalizeStringValues(item);
      }
      return item;
    }) as unknown as T;
  }

  const normalized: Record<string, any> = {};

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    
    if (typeof value === 'string') {
      normalized[key] = normalizeUnicode(value);
    } else if (value !== null && typeof value === 'object') {
      normalized[key] = normalizeStringValues(value);
    } else {
      normalized[key] = value;
    }
  }

  return normalized as T;
}

/**
 * Create sanitization middleware for Fastify
 */
export function createSanitizationMiddleware() {
  return async (request: any, reply: any) => {
    if (request.body && typeof request.body === 'object') {
      request.body = sanitizeRequestBody(request.body);
    }
    if (request.query && typeof request.query === 'object') {
      request.query = sanitizeObject(request.query);
    }
    if (request.params && typeof request.params === 'object') {
      request.params = sanitizeObject(request.params);
    }
  };
}

/**
 * Validate that a string doesn't contain control characters
 */
export function hasControlCharacters(str: string): boolean {
  if (typeof str !== 'string') {
    return false;
  }
  // Match control characters (except common whitespace)
  return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str);
}

/**
 * Remove control characters from a string
 */
export function removeControlCharacters(str: string): string {
  if (typeof str !== 'string') {
    return str;
  }
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
