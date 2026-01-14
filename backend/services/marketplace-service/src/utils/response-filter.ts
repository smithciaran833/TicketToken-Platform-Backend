/**
 * Response Filter Utility for Marketplace Service
 * 
 * Issues Fixed:
 * - ERR-H1: Sensitive data in responses → Field filtering
 * - ERR-H2: Stack traces exposed → Production sanitization
 * - ERR-H3: Internal IDs leaked → ID obfuscation
 * - ERR-H4: Inconsistent error formats → Standardized responses
 * 
 * Features:
 * - Environment-aware sanitization
 * - Field whitelisting/blacklisting
 * - Consistent error response format
 * - PII protection
 */

import { logger } from './logger';

const log = logger.child({ component: 'ResponseFilter' });

const isProduction = process.env.NODE_ENV === 'production';

// Fields to always remove from responses
const BLACKLISTED_FIELDS = new Set([
  'password',
  'password_hash',
  'passwordHash',
  'secret',
  'secretKey',
  'secret_key',
  'privateKey',
  'private_key',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'stripeSecretKey',
  'stripe_secret_key',
  'webhookSecret',
  'webhook_secret',
  'encryptionKey',
  'encryption_key',
  'salt',
  'ssn',
  'socialSecurityNumber',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'bankAccount',
  'bank_account',
  'routingNumber',
  'routing_number',
]);

// Fields to partially mask (show last 4 chars)
const MASKED_FIELDS = new Set([
  'email',
  'phone',
  'phoneNumber',
  'phone_number',
  'stripeCustomerId',
  'stripe_customer_id',
  'walletAddress',
  'wallet_address',
]);

// Internal fields to remove in production
const INTERNAL_FIELDS = new Set([
  'internalId',
  'internal_id',
  'dbId',
  'db_id',
  'createdBy',
  'created_by',
  'modifiedBy',
  'modified_by',
  'tenantId', // Only exposed when needed
  'tenant_id',
  'ownerId',
  'owner_id',
]);

/**
 * Standard error response format
 */
export interface StandardErrorResponse {
  error: string;
  message: string;
  code?: string;
  requestId?: string;
  details?: any[];
  timestamp?: string;
}

/**
 * Standard success response format
 */
export interface StandardSuccessResponse<T = any> {
  success: boolean;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

/**
 * AUDIT FIX ERR-H1: Sanitize object by removing sensitive fields
 */
export function sanitizeObject(obj: any, depth: number = 0): any {
  if (depth > 10) return '[Max depth exceeded]';
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }
  
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip blacklisted fields entirely
    if (BLACKLISTED_FIELDS.has(key)) {
      continue;
    }
    
    // Remove internal fields in production
    if (isProduction && INTERNAL_FIELDS.has(key)) {
      continue;
    }
    
    // Mask certain fields
    if (MASKED_FIELDS.has(key) && typeof value === 'string') {
      sanitized[key] = maskValue(value);
      continue;
    }
    
    // Recursively sanitize nested objects
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Mask a value showing only last 4 characters
 */
function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

/**
 * AUDIT FIX ERR-H2: Sanitize error for response
 */
export function sanitizeError(error: any, requestId?: string): StandardErrorResponse {
  // Base response
  const response: StandardErrorResponse = {
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  };
  
  if (requestId) {
    response.requestId = requestId;
  }
  
  // Handle known error types
  if (error?.statusCode || error?.status) {
    const statusCode = error.statusCode || error.status;
    
    if (statusCode === 400) {
      response.error = 'Bad Request';
      response.message = isProduction 
        ? 'Invalid request data' 
        : error.message || 'Invalid request data';
    } else if (statusCode === 401) {
      response.error = 'Unauthorized';
      response.message = 'Authentication required';
    } else if (statusCode === 403) {
      response.error = 'Forbidden';
      response.message = 'Access denied';
    } else if (statusCode === 404) {
      response.error = 'Not Found';
      response.message = error.message || 'Resource not found';
    } else if (statusCode === 409) {
      response.error = 'Conflict';
      response.message = error.message || 'Resource conflict';
    } else if (statusCode === 422) {
      response.error = 'Unprocessable Entity';
      response.message = error.message || 'Validation failed';
    } else if (statusCode === 429) {
      response.error = 'Too Many Requests';
      response.message = 'Rate limit exceeded';
    }
  }
  
  // Add error code if available
  if (error?.code) {
    response.code = error.code;
  }
  
  // Add validation details if available (safe to expose)
  if (error?.details && Array.isArray(error.details)) {
    response.details = error.details.map((detail: any) => ({
      field: detail.field || detail.path?.join('.'),
      message: detail.message
    }));
  }
  
  // In development, include more details
  if (!isProduction) {
    if (error?.stack) {
      (response as any).stack = error.stack.split('\n').slice(0, 5);
    }
    if (error?.originalError) {
      (response as any).originalError = error.originalError.message;
    }
  }
  
  return response;
}

/**
 * AUDIT FIX ERR-H4: Create standard success response
 */
export function createSuccessResponse<T>(
  data: T,
  meta?: StandardSuccessResponse['meta']
): StandardSuccessResponse<T> {
  const sanitizedData = sanitizeObject(data);
  
  const response: StandardSuccessResponse<T> = {
    success: true,
    data: sanitizedData
  };
  
  if (meta) {
    response.meta = meta;
  }
  
  return response;
}

/**
 * AUDIT FIX ERR-H4: Create paginated response
 */
export function createPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): StandardSuccessResponse<T[]> {
  return createSuccessResponse(data, {
    page,
    limit,
    total,
    hasMore: page * limit < total
  });
}

/**
 * AUDIT FIX ERR-H3: Filter response fields by whitelist
 */
export function filterFields<T extends Record<string, any>>(
  obj: T,
  allowedFields: string[]
): Partial<T> {
  const filtered: Partial<T> = {};
  
  for (const field of allowedFields) {
    if (field in obj) {
      filtered[field as keyof T] = obj[field];
    }
  }
  
  return sanitizeObject(filtered);
}

/**
 * Listing response fields
 */
export const ListingResponseFields = [
  'id',
  'ticketId',
  'eventId',
  'price',
  'status',
  'description',
  'createdAt',
  'updatedAt',
  'expiresAt',
  'sellerDisplayName'
];

/**
 * Transfer response fields
 */
export const TransferResponseFields = [
  'id',
  'listingId',
  'status',
  'totalAmount',
  'platformFee',
  'createdAt',
  'completedAt'
];

/**
 * User response fields (public)
 */
export const UserPublicFields = [
  'id',
  'displayName',
  'avatarUrl',
  'verified',
  'rating'
];

/**
 * Fastify error handler hook
 */
export function errorHandlerHook(error: any, request: any, reply: any) {
  const requestId = request.headers['x-request-id'] || request.id;
  
  // Log the full error internally
  log.error('Request error', {
    requestId,
    error: error.message,
    stack: error.stack,
    statusCode: error.statusCode || 500,
    path: request.url,
    method: request.method
  });
  
  // Send sanitized response
  const statusCode = error.statusCode || error.status || 500;
  const sanitized = sanitizeError(error, requestId);
  
  reply.status(statusCode).send(sanitized);
}

/**
 * Fastify response serializer hook
 */
export function responseSerializerHook(payload: any, statusCode: number) {
  // Only sanitize success responses (2xx)
  if (statusCode >= 200 && statusCode < 300) {
    return sanitizeObject(payload);
  }
  return payload;
}
