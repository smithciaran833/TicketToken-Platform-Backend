/**
 * Response Filter Utility for Transfer Service
 *
 * AUDIT FIXES:
 * - ERR-M1: No response filtering → Added sensitive data filtering
 * - ERR-M2: Internal details leaked → Stack trace removal in production
 * - ERR-M3: No response sanitization → Output sanitization
 *
 * Features:
 * - Removes sensitive fields from responses
 * - Sanitizes error messages for production
 * - Removes internal implementation details
 * - Configurable filtering rules
 */

import logger from './logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

const FILTER_CONFIG = {
  // Fields to always remove from responses
  sensitiveFields: [
    'password',
    'passwordHash',
    'secret',
    'secretKey',
    'privateKey',
    'token',
    'accessToken',
    'refreshToken',
    'acceptanceCode',
    'acceptanceCodeHash',
    'apiKey',
    'webhookSecret',
    'internalSecret',
    'treasuryPrivateKey',
    'seedPhrase',
    'mnemonic'
  ],

  // Fields to remove in production only
  productionOnlyRemove: [
    'stack',
    'stackTrace',
    'cause',
    'query',
    'sql',
    'bindings',
    'internalMessage',
    'debugInfo'
  ],

  // Fields to mask (show partial value)
  maskFields: [
    'email',
    'wallet',
    'recipientEmail',
    'recipientWallet'
  ],

  // Maximum string length in responses
  maxStringLength: 10000,

  // Maximum array length in responses
  maxArrayLength: 1000,

  // Maximum object depth
  maxDepth: 10
};

const isProduction = process.env.NODE_ENV === 'production';

// =============================================================================
// MASKING HELPERS
// =============================================================================

/**
 * Mask email address (show first 3 chars and domain)
 */
function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return email;

  const parts = email.split('@');
  if (parts.length !== 2) return '***';

  const localPart = parts[0];
  const domain = parts[1];

  if (!localPart || localPart.length <= 3) {
    return `***@${domain}`;
  }

  return `${localPart.substring(0, 3)}***@${domain}`;
}

/**
 * Mask wallet address (show first 4 and last 4 chars)
 */
function maskWallet(wallet: string): string {
  if (!wallet || typeof wallet !== 'string') return wallet;

  if (wallet.length <= 8) {
    return '***';
  }

  return `${wallet.substring(0, 4)}...${wallet.substring(wallet.length - 4)}`;
}

/**
 * Mask a field value based on field name
 */
function maskFieldValue(fieldName: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const lowerFieldName = fieldName.toLowerCase();

  if (lowerFieldName.includes('email')) {
    return maskEmail(String(value));
  }

  if (lowerFieldName.includes('wallet') || lowerFieldName.includes('address')) {
    return maskWallet(String(value));
  }

  return '[MASKED]';
}

// =============================================================================
// FILTERING FUNCTIONS
// =============================================================================

/**
 * Check if a field should be removed
 */
function shouldRemoveField(fieldName: string): boolean {
  const lowerFieldName = fieldName.toLowerCase();

  // Always remove sensitive fields
  if (FILTER_CONFIG.sensitiveFields.some(f => lowerFieldName.includes(f.toLowerCase()))) {
    return true;
  }

  // Remove production-only fields in production
  if (isProduction && FILTER_CONFIG.productionOnlyRemove.some(f =>
    lowerFieldName.includes(f.toLowerCase())
  )) {
    return true;
  }

  return false;
}

/**
 * Check if a field should be masked
 */
function shouldMaskField(fieldName: string): boolean {
  const lowerFieldName = fieldName.toLowerCase();

  return FILTER_CONFIG.maskFields.some(f =>
    lowerFieldName.includes(f.toLowerCase())
  );
}

/**
 * Truncate string if too long
 */
function truncateString(value: string): string {
  if (value.length <= FILTER_CONFIG.maxStringLength) {
    return value;
  }

  return value.substring(0, FILTER_CONFIG.maxStringLength) + '...[truncated]';
}

/**
 * Recursively filter an object
 */
function filterObject(
  obj: unknown,
  depth: number = 0
): unknown {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle max depth
  if (depth > FILTER_CONFIG.maxDepth) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  // Handle primitives
  if (typeof obj === 'string') {
    return truncateString(obj);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    const filtered = obj
      .slice(0, FILTER_CONFIG.maxArrayLength)
      .map(item => filterObject(item, depth + 1));

    if (obj.length > FILTER_CONFIG.maxArrayLength) {
      filtered.push(`[...${obj.length - FILTER_CONFIG.maxArrayLength} more items]`);
    }

    return filtered;
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // Handle Error objects
  if (obj instanceof Error) {
    return filterError(obj);
  }

  // Handle regular objects
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip fields that should be removed
    if (shouldRemoveField(key)) {
      continue;
    }

    // Mask fields that should be masked
    if (shouldMaskField(key)) {
      filtered[key] = maskFieldValue(key, value);
      continue;
    }

    // Recursively filter nested objects
    filtered[key] = filterObject(value, depth + 1);
  }

  return filtered;
}

/**
 * Filter error object for safe response
 */
function filterError(error: Error): Record<string, unknown> {
  const filtered: Record<string, unknown> = {
    name: error.name,
    message: error.message
  };

  // Include code if available
  if ('code' in error) {
    filtered.code = (error as any).code;
  }

  // Include status if available
  if ('statusCode' in error) {
    filtered.statusCode = (error as any).statusCode;
  }

  // Include validation errors if available
  if ('errors' in error) {
    filtered.errors = filterObject((error as any).errors);
  }

  // Include stack trace only in development
  if (!isProduction && error.stack) {
    filtered.stack = error.stack;
  }

  return filtered;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Filter response data before sending to client
 */
export function filterResponse<T>(data: T): T {
  try {
    return filterObject(data) as T;
  } catch (error) {
    logger.error({ error }, 'Error filtering response');
    // Return empty object on error to prevent leaking sensitive data
    return {} as T;
  }
}

/**
 * Filter error for client response
 */
export function filterErrorResponse(error: Error | unknown): Record<string, unknown> {
  try {
    if (error instanceof Error) {
      return filterError(error);
    }

    if (typeof error === 'object' && error !== null) {
      return filterObject(error) as Record<string, unknown>;
    }

    return {
      message: String(error)
    };
  } catch (err) {
    logger.error({ err, originalError: error }, 'Error filtering error response');
    return {
      message: 'An error occurred'
    };
  }
}

/**
 * Create a safe error response following RFC 7807
 */
export function createErrorResponse(
  error: Error | unknown,
  requestId?: string
): Record<string, unknown> {
  const isAppError = error instanceof Error && 'statusCode' in error;

  const response: Record<string, unknown> = {
    type: 'about:blank',
    title: isAppError ? error.message : 'Internal Server Error',
    status: isAppError ? (error as any).statusCode : 500,
    detail: isProduction ? undefined : filterErrorResponse(error).message,
    instance: requestId ? `/requests/${requestId}` : undefined
  };

  // Include error code if available
  if (error instanceof Error && 'code' in error) {
    response.code = (error as any).code;
  }

  // Include validation errors if available
  if (error instanceof Error && 'errors' in error) {
    response.errors = filterObject((error as any).errors);
  }

  // Include stack in development
  if (!isProduction && error instanceof Error && error.stack) {
    response.stack = error.stack;
  }

  return response;
}

/**
 * Filter user data for public exposure
 */
export function filterUserData(user: Record<string, unknown>): Record<string, unknown> {
  const publicFields = [
    'id',
    'displayName',
    'avatar',
    'createdAt'
  ];

  const filtered: Record<string, unknown> = {};

  for (const field of publicFields) {
    if (field in user) {
      filtered[field] = user[field];
    }
  }

  // Mask email if present
  if (user.email) {
    filtered.email = maskEmail(String(user.email));
  }

  return filtered;
}

/**
 * Filter transfer data for public exposure
 */
export function filterTransferData(
  transfer: Record<string, unknown>,
  requestingUserId?: string
): Record<string, unknown> {
  const filtered = filterObject(transfer) as Record<string, unknown>;

  // Hide acceptance code unless user is sender
  if (filtered.senderId !== requestingUserId) {
    delete filtered.acceptanceCode;
    delete filtered.acceptanceCodeHash;
  }

  // Remove internal tracking fields
  delete filtered.internalNotes;
  delete filtered.adminNotes;
  delete filtered.auditLog;

  return filtered;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  filterResponse,
  filterErrorResponse,
  createErrorResponse,
  filterUserData,
  filterTransferData,
  maskEmail,
  maskWallet
};
