import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

/**
 * Input validation and sanitization middleware
 * Prevents XSS, SSRF, and validates date ranges
 */

// XSS prevention: Strip HTML tags and dangerous characters
export function sanitizeString(input: string): string {
  if (!input) return input;
  
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script> tags
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
    .trim();
}

// Validate and sanitize URLs to prevent SSRF
export function validateUrl(url: string): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    
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

// Validate date ranges
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

// Sanitize object recursively
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
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

// Middleware to sanitize request body
export async function sanitizeRequestBody(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (request.body && typeof request.body === 'object') {
    request.body = sanitizeObject(request.body);
  }
}

// Validate pagination parameters
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

// Validate email format
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate UUID format
export function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
