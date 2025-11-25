/**
 * XSS Protection Middleware
 * Sanitizes request data to prevent cross-site scripting attacks
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { securityConfig } from '../config/security.config';
import { logger } from '../utils/logger';

/**
 * Sanitize string to remove potentially malicious HTML/JavaScript
 */
function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove script tags and their contents
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data:text\/html/gi, '');

  // Remove vbscript: protocol
  sanitized = sanitized.replace(/vbscript:/gi, '');

  // Encode special HTML characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  return sanitized;
}

/**
 * Recursively sanitize object/array values
 */
function sanitizeData(data: any, depth: number = 0): any {
  // Prevent infinite recursion
  if (depth > 10) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item, depth + 1));
  }

  if (data !== null && typeof data === 'object') {
    const sanitized: any = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        sanitized[key] = sanitizeData(data[key], depth + 1);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Check if string contains potential XSS patterns
 */
function containsXSS(input: string): boolean {
  if (typeof input !== 'string') {
    return false;
  }

  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /vbscript:/i,
    /data:text\/html/i,
    /<link.*rel=["']?stylesheet/i,
  ];

  return xssPatterns.some(pattern => pattern.test(input));
}

/**
 * Detect and log potential XSS attempts
 */
function detectXSSAttempt(data: any, path: string = ''): string | null {
  if (typeof data === 'string') {
    if (containsXSS(data)) {
      return path || 'root';
    }
    return null;
  }

  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const result = detectXSSAttempt(data[i], `${path}[${i}]`);
      if (result) return result;
    }
    return null;
  }

  if (data !== null && typeof data === 'object') {
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        const newPath = path ? `${path}.${key}` : key;
        const result = detectXSSAttempt(data[key], newPath);
        if (result) return result;
      }
    }
    return null;
  }

  return null;
}

/**
 * XSS Protection Middleware
 * Sanitizes request body, query, and params to prevent XSS attacks
 */
export async function xssProtectionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!securityConfig.xss.enabled) {
    return;
  }

  try {
    // Check for XSS attempts in request data
    const xssLocations: string[] = [];

    if (request.body) {
      const bodyXSS = detectXSSAttempt(request.body, 'body');
      if (bodyXSS) xssLocations.push(bodyXSS);
    }

    if (request.query) {
      const queryXSS = detectXSSAttempt(request.query, 'query');
      if (queryXSS) xssLocations.push(queryXSS);
    }

    if (request.params) {
      const paramsXSS = detectXSSAttempt(request.params, 'params');
      if (paramsXSS) xssLocations.push(paramsXSS);
    }

    // Log XSS attempts
    if (xssLocations.length > 0) {
      logger.warn('Potential XSS attempt detected', {
        ip: request.ip,
        path: request.url,
        method: request.method,
        locations: xssLocations,
        userAgent: request.headers['user-agent'],
      });
    }

    // Sanitize request data
    if (request.body) {
      request.body = sanitizeData(request.body);
    }

    if (request.query) {
      request.query = sanitizeData(request.query);
    }

    if (request.params) {
      request.params = sanitizeData(request.params);
    }

    // Add security headers
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');

    // Content Security Policy
    const cspDirectives = Object.entries(securityConfig.csp.directives)
      .map(([directive, values]) => {
        const kebabDirective = directive.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${kebabDirective} ${Array.isArray(values) ? values.join(' ') : values}`;
      })
      .join('; ');

    reply.header('Content-Security-Policy', cspDirectives);

  } catch (error) {
    logger.error('Error in XSS protection middleware', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: request.url,
    });
    // Don't block the request on middleware errors
  }
}

export default xssProtectionMiddleware;
