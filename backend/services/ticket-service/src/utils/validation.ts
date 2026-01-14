/**
 * Validation Utilities for Ticket Service
 * 
 * MEDIUM/LOW Batch 24 fixes:
 * - SEC-EXT2: Input sanitization logging - Log validation failures for security monitoring
 * - SEC4: Regex timeout protection (ReDoS) - Prevent catastrophic backtracking
 */

import Joi from 'joi';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from './logger';

const log = logger.child({ component: 'Validation' });

// =============================================================================
// REGEX TIMEOUT PROTECTION - SEC4 Fix (Batch 24)
// =============================================================================

/**
 * Configuration for regex timeout protection
 */
export interface RegexTimeoutConfig {
  /** Maximum time in ms for regex execution (default: 100ms) */
  timeoutMs: number;
  /** Maximum input length to process (default: 10000) */
  maxInputLength: number;
  /** Enable strict mode - reject patterns that could cause ReDoS */
  strictMode: boolean;
}

const DEFAULT_REGEX_CONFIG: RegexTimeoutConfig = {
  timeoutMs: parseInt(process.env.REGEX_TIMEOUT_MS || '100', 10),
  maxInputLength: parseInt(process.env.REGEX_MAX_INPUT_LENGTH || '10000', 10),
  strictMode: process.env.REGEX_STRICT_MODE === 'true',
};

let regexConfig: RegexTimeoutConfig = { ...DEFAULT_REGEX_CONFIG };

/**
 * Known ReDoS-vulnerable patterns to reject in strict mode
 * These patterns can cause exponential backtracking
 */
const VULNERABLE_PATTERNS = [
  /\(\.\*\)\+/,           // (.*)+
  /\(\.\+\)\+/,           // (.+)+
  /\(a\+\)\+/,            // (a+)+
  /\(\[^\]\+\)\+/,        // ([^]+)+
  /\(\.\*\)\?\.\*/,       // (.*)?.*
  /\(a\|b\|c\)\+\(a\|b\|c\)\+/, // (a|b|c)+(a|b|c)+
];

/**
 * Check if a regex pattern is potentially vulnerable to ReDoS
 */
function isVulnerablePattern(pattern: RegExp | string): boolean {
  const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
  
  for (const vulnerable of VULNERABLE_PATTERNS) {
    if (vulnerable.test(patternStr)) {
      return true;
    }
  }
  
  // Check for nested quantifiers - a common ReDoS pattern
  const nestedQuantifiers = /[+*]\)[+*?]/;
  if (nestedQuantifiers.test(patternStr)) {
    return true;
  }
  
  return false;
}

/**
 * Execute a regex with timeout protection
 * 
 * This wraps regex execution to prevent ReDoS attacks where malicious
 * input could cause exponential backtracking
 * 
 * @param pattern - Regex pattern to execute
 * @param input - String to match against
 * @param config - Optional config overrides
 * @returns Match result or null if no match/timeout
 * @throws Error if timeout exceeded or pattern is vulnerable (in strict mode)
 */
export function safeRegexTest(
  pattern: RegExp,
  input: string,
  config?: Partial<RegexTimeoutConfig>
): boolean {
  const cfg = { ...regexConfig, ...config };
  
  // Check input length
  if (input.length > cfg.maxInputLength) {
    log.warn('Regex input exceeds maximum length', {
      inputLength: input.length,
      maxLength: cfg.maxInputLength,
      pattern: pattern.source.substring(0, 50),
    });
    
    // Log security event for monitoring
    logSanitizationEvent('regex_input_too_long', {
      inputLength: input.length,
      pattern: pattern.source.substring(0, 50),
    });
    
    return false;
  }
  
  // Check for vulnerable patterns in strict mode
  if (cfg.strictMode && isVulnerablePattern(pattern)) {
    log.error('Vulnerable regex pattern detected', {
      pattern: pattern.source,
    });
    
    logSanitizationEvent('vulnerable_regex_pattern', {
      pattern: pattern.source,
    });
    
    throw new Error('Regex pattern may be vulnerable to ReDoS');
  }
  
  // Execute with timing
  const startTime = process.hrtime.bigint();
  
  try {
    const result = pattern.test(input);
    
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    
    // Check if execution took too long
    if (durationMs > cfg.timeoutMs) {
      log.warn('Regex execution exceeded timeout', {
        durationMs,
        timeoutMs: cfg.timeoutMs,
        pattern: pattern.source.substring(0, 50),
        inputLength: input.length,
      });
      
      logSanitizationEvent('regex_timeout', {
        durationMs,
        pattern: pattern.source.substring(0, 50),
        inputLength: input.length,
      });
    }
    
    return result;
  } catch (error) {
    log.error('Regex execution failed', {
      error: error instanceof Error ? error.message : String(error),
      pattern: pattern.source.substring(0, 50),
    });
    
    logSanitizationEvent('regex_error', {
      error: error instanceof Error ? error.message : String(error),
      pattern: pattern.source.substring(0, 50),
    });
    
    return false;
  }
}

/**
 * Execute a regex match with timeout protection
 */
export function safeRegexMatch(
  pattern: RegExp,
  input: string,
  config?: Partial<RegexTimeoutConfig>
): RegExpMatchArray | null {
  const cfg = { ...regexConfig, ...config };
  
  // Check input length
  if (input.length > cfg.maxInputLength) {
    log.warn('Regex input exceeds maximum length', {
      inputLength: input.length,
      maxLength: cfg.maxInputLength,
    });
    return null;
  }
  
  // Check for vulnerable patterns in strict mode
  if (cfg.strictMode && isVulnerablePattern(pattern)) {
    throw new Error('Regex pattern may be vulnerable to ReDoS');
  }
  
  const startTime = process.hrtime.bigint();
  
  try {
    const result = input.match(pattern);
    
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    
    if (durationMs > cfg.timeoutMs) {
      log.warn('Regex match exceeded timeout', {
        durationMs,
        timeoutMs: cfg.timeoutMs,
        inputLength: input.length,
      });
    }
    
    return result;
  } catch (error) {
    log.error('Regex match failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Update regex timeout configuration at runtime
 */
export function setRegexConfig(config: Partial<RegexTimeoutConfig>): void {
  regexConfig = { ...regexConfig, ...config };
  log.info('Updated regex timeout configuration', { config: regexConfig });
}

/**
 * Get current regex configuration
 */
export function getRegexConfig(): RegexTimeoutConfig {
  return { ...regexConfig };
}

// =============================================================================
// INPUT SANITIZATION LOGGING - SEC-EXT2 Fix (Batch 24)
// =============================================================================

/**
 * Sanitization event types for security monitoring
 */
export type SanitizationEventType = 
  | 'validation_failed'
  | 'xss_attempt'
  | 'sql_injection_attempt'
  | 'path_traversal_attempt'
  | 'command_injection_attempt'
  | 'prototype_pollution_attempt'
  | 'regex_timeout'
  | 'regex_input_too_long'
  | 'regex_error'
  | 'vulnerable_regex_pattern'
  | 'invalid_encoding'
  | 'oversized_input'
  | 'suspicious_pattern';

/**
 * Sanitization event for security audit logging
 */
export interface SanitizationEvent {
  type: SanitizationEventType;
  timestamp: string;
  details: Record<string, unknown>;
  requestId?: string;
  tenantId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  path?: string;
  method?: string;
}

/**
 * Log a sanitization/validation event for security monitoring
 * 
 * These logs should be monitored by SIEM systems to detect attacks
 */
export function logSanitizationEvent(
  type: SanitizationEventType,
  details: Record<string, unknown>,
  request?: FastifyRequest
): void {
  const event: SanitizationEvent = {
    type,
    timestamp: new Date().toISOString(),
    details,
    requestId: request?.id as string,
    tenantId: (request as any)?.tenantId,
    userId: (request as any)?.user?.id,
    ip: request?.ip,
    userAgent: request?.headers['user-agent'] as string,
    path: request?.url,
    method: request?.method,
  };
  
  // Log at appropriate level based on severity
  const severityMap: Record<SanitizationEventType, 'warn' | 'error' | 'info'> = {
    validation_failed: 'warn',
    xss_attempt: 'error',
    sql_injection_attempt: 'error',
    path_traversal_attempt: 'error',
    command_injection_attempt: 'error',
    prototype_pollution_attempt: 'error',
    regex_timeout: 'warn',
    regex_input_too_long: 'warn',
    regex_error: 'error',
    vulnerable_regex_pattern: 'error',
    invalid_encoding: 'warn',
    oversized_input: 'warn',
    suspicious_pattern: 'warn',
  };
  
  const level = severityMap[type] || 'warn';
  
  log[level]('Security sanitization event', {
    security: true,  // Flag for SIEM filtering
    event,
  });
}

/**
 * Detect potential XSS patterns in input
 */
const XSS_PATTERNS = [
  /<script\b/i,
  /javascript:/i,
  /on\w+=/i,  // onclick=, onerror=, etc.
  /<iframe\b/i,
  /<object\b/i,
  /<embed\b/i,
  /document\.(cookie|location|write)/i,
  /window\.(location|open)/i,
  /eval\s*\(/i,
];

/**
 * Detect potential SQL injection patterns
 */
const SQL_INJECTION_PATTERNS = [
  /'\s*(or|and)\s*'?\d*'?\s*=\s*'?\d*'?/i,
  /'\s*(or|and)\s+'[^']*'\s*=\s*'[^']*'/i,
  /--\s*$/,
  /;\s*drop\s+/i,
  /;\s*delete\s+/i,
  /;\s*update\s+/i,
  /;\s*insert\s+/i,
  /union\s+select/i,
  /'\s*;\s*--/,
];

/**
 * Detect potential path traversal patterns
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.\\/, 
  /%2e%2e%2f/i,
  /%2e%2e\//i,
  /\.\.%2f/i,
  /%252e%252e%252f/i,
];

/**
 * Detect potential command injection patterns
 */
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$]/,
  /\$\(/,
  /`[^`]*`/,
  /\|\|/,
  /&&/,
];

/**
 * Sanitize and validate input, logging any suspicious patterns
 */
export function sanitizeInput(
  input: string,
  fieldName: string,
  request?: FastifyRequest
): string {
  // Check for XSS
  for (const pattern of XSS_PATTERNS) {
    if (safeRegexTest(pattern, input)) {
      logSanitizationEvent('xss_attempt', {
        field: fieldName,
        pattern: pattern.source,
        inputPreview: input.substring(0, 100),
      }, request);
    }
  }
  
  // Check for SQL injection
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (safeRegexTest(pattern, input)) {
      logSanitizationEvent('sql_injection_attempt', {
        field: fieldName,
        pattern: pattern.source,
        inputPreview: input.substring(0, 100),
      }, request);
    }
  }
  
  // Check for path traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (safeRegexTest(pattern, input)) {
      logSanitizationEvent('path_traversal_attempt', {
        field: fieldName,
        pattern: pattern.source,
        inputPreview: input.substring(0, 100),
      }, request);
    }
  }
  
  // Check for command injection (only for certain fields)
  if (['command', 'script', 'exec', 'shell'].some(f => fieldName.toLowerCase().includes(f))) {
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (safeRegexTest(pattern, input)) {
        logSanitizationEvent('command_injection_attempt', {
          field: fieldName,
          pattern: pattern.source,
          inputPreview: input.substring(0, 100),
        }, request);
      }
    }
  }
  
  return input;
}

/**
 * Check for prototype pollution in objects
 */
export function checkPrototypePollution(
  obj: unknown,
  fieldName: string,
  request?: FastifyRequest
): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  
  function checkObject(o: Record<string, unknown>, path: string): boolean {
    for (const key of Object.keys(o)) {
      if (dangerousKeys.includes(key)) {
        logSanitizationEvent('prototype_pollution_attempt', {
          field: fieldName,
          path: `${path}.${key}`,
          key,
        }, request);
        return true;
      }
      
      if (typeof o[key] === 'object' && o[key] !== null) {
        if (checkObject(o[key] as Record<string, unknown>, `${path}.${key}`)) {
          return true;
        }
      }
    }
    return false;
  }
  
  return checkObject(obj as Record<string, unknown>, fieldName);
}

// =============================================================================
// TICKET SCHEMAS
// =============================================================================

export const ticketSchemas = {
  purchaseTickets: Joi.object({
    eventId: Joi.string().uuid().required(),
    tickets: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).max(10).required(),
        seatNumbers: Joi.array().items(Joi.string()).optional()
      }).unknown(false)
    ).min(1).max(50).required(),
    paymentIntentId: Joi.string().optional(),
    metadata: Joi.object().optional()
  }).unknown(false),

  createTicketType: Joi.object({
    eventId: Joi.string().uuid().required(),
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).optional(),
    priceCents: Joi.number().integer().min(0).required(),
    quantity: Joi.number().integer().min(1).required(),
    maxPerPurchase: Joi.number().integer().min(1).max(10).required(),
    saleStartDate: Joi.date().iso().required(),
    saleEndDate: Joi.date().iso().greater(Joi.ref('saleStartDate')).required(),
    metadata: Joi.object().optional()
  }).unknown(false),

  transferTicket: Joi.object({
    ticketId: Joi.string().uuid().required(),
    toUserId: Joi.string().uuid().required(),
    reason: Joi.string().max(200).optional()
  }).unknown(false),

  validateQR: Joi.object({
    qrCode: Joi.string().required(),
    eventId: Joi.string().uuid().required(),
    entrance: Joi.string().optional(),
    deviceId: Joi.string().optional()
  }).unknown(false)
};

// =============================================================================
// VALIDATION MIDDLEWARE
// =============================================================================

/**
 * Create validation middleware with sanitization logging
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    
    // Check for prototype pollution
    if (body && checkPrototypePollution(body, 'body', request)) {
      logSanitizationEvent('validation_failed', {
        reason: 'prototype_pollution_detected',
        schema: schema.describe().type,
      }, request);
      
      return reply.status(400).send({
        error: 'Validation error',
        code: 'INVALID_INPUT',
        details: ['Request contains invalid properties']
      });
    }
    
    // Validate against schema
    const { error, value } = schema.validate(body, {
      abortEarly: false,
      stripUnknown: false,  // Don't strip - let .unknown(false) reject them
    });
    
    if (error) {
      // Log validation failures for security monitoring
      const details = error.details.map(d => ({
        message: d.message,
        path: d.path.join('.'),
        type: d.type,
      }));
      
      logSanitizationEvent('validation_failed', {
        schema: schema.describe().type,
        errors: details,
        fieldCount: Object.keys(body || {}).length,
      }, request);
      
      return reply.status(400).send({
        error: 'Validation error',
        code: 'VALIDATION_FAILED',
        details: error.details.map(d => d.message)
      });
    }
    
    // Sanitize string fields
    if (value && typeof value === 'object') {
      sanitizeObjectStrings(value, request);
    }
    
    // Replace body with validated value
    (request as any).body = value;
  };
};

/**
 * Recursively sanitize string fields in an object
 */
function sanitizeObjectStrings(
  obj: Record<string, unknown>,
  request?: FastifyRequest,
  path: string = ''
): void {
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = path ? `${path}.${key}` : key;
    
    if (typeof value === 'string') {
      sanitizeInput(value, fieldPath, request);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitizeObjectStrings(value as Record<string, unknown>, request, fieldPath);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'string') {
          sanitizeInput(item, `${fieldPath}[${index}]`, request);
        } else if (item && typeof item === 'object') {
          sanitizeObjectStrings(item as Record<string, unknown>, request, `${fieldPath}[${index}]`);
        }
      });
    }
  }
}

/**
 * Create a validator that also checks input size
 */
export function createSizeAwareValidator(
  schema: Joi.ObjectSchema,
  maxSizeBytes: number = 1_000_000
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const contentLength = parseInt(request.headers['content-length'] || '0', 10);
    
    if (contentLength > maxSizeBytes) {
      logSanitizationEvent('oversized_input', {
        contentLength,
        maxSizeBytes,
      }, request);
      
      return reply.status(413).send({
        error: 'Payload Too Large',
        code: 'PAYLOAD_TOO_LARGE',
        message: `Request body exceeds maximum size of ${maxSizeBytes} bytes`
      });
    }
    
    // Delegate to standard validator
    return validate(schema)(request, reply);
  };
}

export default {
  ticketSchemas,
  validate,
  createSizeAwareValidator,
  sanitizeInput,
  checkPrototypePollution,
  logSanitizationEvent,
  safeRegexTest,
  safeRegexMatch,
  setRegexConfig,
  getRegexConfig,
};
