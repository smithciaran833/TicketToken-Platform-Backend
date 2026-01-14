import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

/**
 * Input validation and sanitization middleware
 * 
 * AUDIT FIXES:
 * - SEC8: Unicode normalization (NFC)
 * - XSS prevention
 * - SSRF prevention
 * - Date range validation
 */

/**
 * SEC8: Normalize Unicode strings to NFC form
 * Prevents Unicode-based attacks and ensures consistent string comparison
 */
export function normalizeUnicode(input: string): string {
  if (!input || typeof input !== 'string') return input;
  return input.normalize('NFC');
}

/**
 * XSS prevention: Strip HTML tags and dangerous characters
 * Also normalizes Unicode (SEC8)
 */
export function sanitizeString(input: string): string {
  if (!input) return input;

  // SEC8: Normalize Unicode first
  let sanitized = normalizeUnicode(input);

  return sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script> tags
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .trim();
}

/**
 * Validate and sanitize URLs to prevent SSRF
 */
export function validateUrl(url: string): boolean {
  if (!url) return false;

  try {
    // SEC8: Normalize Unicode in URL
    const normalizedUrl = normalizeUnicode(url);
    const parsed = new URL(normalizedUrl);

    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Block private/local IP addresses (SSRF prevention)
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    // Block private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Pattern);
    if (match) {
      const [, a, b, c, d] = match.map(Number);
      if (
        a === 10 || // 10.0.0.0/8
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
        (a === 192 && b === 168) || // 192.168.0.0/16
        (a === 169 && b === 254) // 169.254.0.0/16 (link-local)
      ) {
        return false;
      }
    }

    // Block .local domains
    if (hostname.endsWith('.local')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate date ranges
 */
export function validateDateRange(startDate: string | Date, endDate: string | Date): {
  valid: boolean;
  error?: string;
} {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check if dates are valid
    if (isNaN(start.getTime())) {
      return { valid: false, error: 'Invalid start date' };
    }
    if (isNaN(end.getTime())) {
      return { valid: false, error: 'Invalid end date' };
    }

    // End date must be after start date
    if (end <= start) {
      return { valid: false, error: 'End date must be after start date' };
    }

    // Dates cannot be in the past (except for admin operations)
    const now = new Date();
    if (start < now) {
      return { valid: false, error: 'Start date cannot be in the past' };
    }

    // Date range cannot exceed 2 years
    const twoYears = 2 * 365 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > twoYears) {
      return { valid: false, error: 'Date range cannot exceed 2 years' };
    }

    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: 'Invalid date format' };
  }
}

/**
 * Sanitize object recursively
 * SEC8: Normalizes all strings to NFC
 */
export function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // SEC8: Normalize keys as well
      const normalizedKey = normalizeUnicode(key);
      sanitized[normalizedKey] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Middleware to sanitize request body
 * SEC8: Applies Unicode normalization to all string inputs
 */
export async function sanitizeRequestBody(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (request.body && typeof request.body === 'object') {
    request.body = sanitizeObject(request.body);
  }
  
  // Also sanitize query parameters
  if (request.query && typeof request.query === 'object') {
    request.query = sanitizeObject(request.query) as typeof request.query;
  }
}

/**
 * Validate pagination parameters
 */
export function validatePagination(params: {
  limit?: number | string;
  offset?: number | string;
}): { valid: boolean; error?: string; limit?: number; offset?: number } {
  const limit = typeof params.limit === 'string' ? parseInt(params.limit, 10) : params.limit;
  const offset = typeof params.offset === 'string' ? parseInt(params.offset, 10) : params.offset;

  if (limit !== undefined) {
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return { valid: false, error: 'Limit must be between 1 and 100' };
    }
  }

  if (offset !== undefined) {
    if (isNaN(offset) || offset < 0) {
      return { valid: false, error: 'Offset must be >= 0' };
    }
  }

  return { valid: true, limit: limit || 20, offset: offset || 0 };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  // SEC8: Normalize before validation
  const normalized = normalizeUnicode(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(normalized);
}

/**
 * Validate UUID format
 */
export function validateUUID(uuid: string): boolean {
  // SEC8: Normalize before validation
  const normalized = normalizeUnicode(uuid);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(normalized);
}

/**
 * Normalize and validate a string field
 * Returns normalized string or null if invalid
 */
export function normalizeAndValidateString(
  input: string,
  options: {
    maxLength?: number;
    minLength?: number;
    pattern?: RegExp;
    allowEmpty?: boolean;
  } = {}
): { valid: boolean; value?: string; error?: string } {
  const { maxLength, minLength = 0, pattern, allowEmpty = false } = options;

  if (!input && !allowEmpty) {
    return { valid: false, error: 'Value is required' };
  }

  if (!input && allowEmpty) {
    return { valid: true, value: '' };
  }

  // SEC8: Normalize Unicode
  const normalized = normalizeUnicode(input);
  const sanitized = sanitizeString(normalized);

  if (sanitized.length < minLength) {
    return { valid: false, error: `Value must be at least ${minLength} characters` };
  }

  if (maxLength && sanitized.length > maxLength) {
    return { valid: false, error: `Value must not exceed ${maxLength} characters` };
  }

  if (pattern && !pattern.test(sanitized)) {
    return { valid: false, error: 'Value does not match required format' };
  }

  return { valid: true, value: sanitized };
}
