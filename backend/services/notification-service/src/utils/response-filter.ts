/**
 * Response Filter Utility
 * 
 * AUDIT FIX SEC-M1: Filter sensitive data from API responses
 * AUDIT FIX PII-M1: Redact PII before sending responses
 */

import { FastifyReply } from 'fastify';

/**
 * Fields that should never appear in API responses
 */
const BLOCKED_FIELDS = [
  'password',
  'passwordHash',
  'password_hash',
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
  'internalId',
  'internal_id',
  '__v', // MongoDB version key
  '_raw', // Raw data fields
];

/**
 * Fields that should be masked (partial reveal)
 */
const MASKED_FIELDS: Record<string, (value: string) => string> = {
  email: (val) => {
    if (!val || typeof val !== 'string') return val;
    const [local, domain] = val.split('@');
    if (!domain) return '***@***';
    return `${local.slice(0, 2)}***@${domain}`;
  },
  phone: (val) => {
    if (!val || typeof val !== 'string') return val;
    return val.slice(0, 3) + '****' + val.slice(-4);
  },
  phoneNumber: (val) => MASKED_FIELDS.phone(val),
  phone_number: (val) => MASKED_FIELDS.phone(val),
  ssn: () => '***-**-****',
  socialSecurityNumber: () => '***-**-****',
  social_security_number: () => '***-**-****',
  creditCard: (val) => {
    if (!val || typeof val !== 'string') return val;
    return '**** **** **** ' + val.slice(-4);
  },
  credit_card: (val) => MASKED_FIELDS.creditCard(val),
  cardNumber: (val) => MASKED_FIELDS.creditCard(val),
  card_number: (val) => MASKED_FIELDS.creditCard(val),
  walletAddress: (val) => {
    if (!val || typeof val !== 'string') return val;
    return val.slice(0, 6) + '...' + val.slice(-4);
  },
  wallet_address: (val) => MASKED_FIELDS.walletAddress(val),
};

/**
 * Filter options
 */
export interface FilterOptions {
  /** Include these fields even if they would normally be blocked */
  allowFields?: string[];
  /** Additional fields to block */
  blockFields?: string[];
  /** Skip masking (show full values for allowed masked fields) */
  skipMasking?: boolean;
  /** Maximum depth to traverse */
  maxDepth?: number;
}

/**
 * Recursively filter sensitive data from an object
 */
export function filterResponse<T>(data: T, options: FilterOptions = {}): T {
  const {
    allowFields = [],
    blockFields = [],
    skipMasking = false,
    maxDepth = 20,
  } = options;

  const allBlockedFields = [...BLOCKED_FIELDS, ...blockFields];

  function filter(obj: any, depth: number): any {
    if (depth > maxDepth) return '[MAX_DEPTH_EXCEEDED]';
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    // Handle Date objects
    if (obj instanceof Date) return obj.toISOString();

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => filter(item, depth + 1));
    }

    const filtered: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip blocked fields (unless explicitly allowed)
      if (allBlockedFields.includes(key) && !allowFields.includes(key)) {
        continue;
      }

      // Apply masking for sensitive fields
      if (!skipMasking && key in MASKED_FIELDS && !allowFields.includes(key)) {
        filtered[key] = MASKED_FIELDS[key](value as string);
        continue;
      }

      // Recursively filter nested objects
      if (typeof value === 'object' && value !== null) {
        filtered[key] = filter(value, depth + 1);
      } else {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  return filter(data, 0);
}

/**
 * Create a filtered response object for notifications
 * Applies notification-specific filtering rules
 */
export function filterNotificationResponse(data: any): any {
  return filterResponse(data, {
    // Allow email to be partially visible in notification responses
    allowFields: [],
    blockFields: [
      'rawPayload',
      'raw_payload',
      'webhookSecret',
      'webhook_secret',
      'providerApiKey',
      'provider_api_key',
    ],
  });
}

/**
 * Create a filtered response object for user preferences
 * More relaxed filtering since user is viewing their own data
 */
export function filterPreferenceResponse(data: any, isOwnData: boolean = false): any {
  if (isOwnData) {
    return filterResponse(data, {
      skipMasking: true,
      blockFields: ['_internal', 'auditLog'],
    });
  }
  return filterResponse(data);
}

/**
 * Filter webhook payloads before logging
 */
export function filterWebhookPayload(payload: any): any {
  return filterResponse(payload, {
    blockFields: [
      'signature',
      'webhookSignature',
      'webhook_signature',
      'verificationToken',
      'verification_token',
    ],
  });
}

/**
 * Fastify reply decorator for filtered responses
 */
export function sendFilteredResponse(
  reply: FastifyReply,
  statusCode: number,
  data: any,
  options?: FilterOptions
): void {
  const filtered = filterResponse(data, options);
  reply.status(statusCode).send(filtered);
}

/**
 * Create standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    requestId?: string;
  };
}

/**
 * Create a success response
 */
export function successResponse<T>(
  data: T,
  meta?: ApiResponse<T>['meta']
): ApiResponse<T> {
  return {
    success: true,
    data: filterResponse(data),
    meta,
  };
}

/**
 * Create an error response
 */
export function errorResponse(
  code: string,
  message: string,
  details?: any
): ApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      details: details ? filterResponse(details) : undefined,
    },
  };
}

/**
 * Create a paginated response
 */
export function paginatedResponse<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
  requestId?: string
): ApiResponse<T[]> {
  return {
    success: true,
    data: data.map(item => filterResponse(item)),
    meta: {
      page,
      pageSize,
      total,
      requestId,
    },
  };
}
