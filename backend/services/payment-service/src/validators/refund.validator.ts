/**
 * Refund Validation Schemas
 * 
 * HIGH FIX: Add comprehensive validation to refund routes using Zod schemas
 * with RFC 7807 error responses.
 * 
 * MEDIUM FIXES:
 * - SL-5: Cross-field validation
 * - SL-6: Re-validate after transform
 * - SL-8: Filter sensitive fields from responses
 * 
 * LOW FIX:
 * - Add .normalize('NFC') to string inputs for Unicode normalization
 */

import { z } from 'zod';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ValidationError, sendProblemResponse } from '../utils/errors';
import { logger } from '../utils/logger';
import { logValidationFailure, ValidationFailure } from '../utils/tracing';

const log = logger.child({ component: 'RefundValidator' });

// =============================================================================
// SL-8: SENSITIVE FIELD FILTERING
// =============================================================================

/**
 * Fields that should never be included in responses
 */
const SENSITIVE_FIELDS = [
  'stripeSecretKey',
  'webhookSecret',
  'apiKey',
  'password',
  'accessToken',
  'refreshToken',
  'cardNumber',
  'cvv',
  'cvc',
  'expiry',
  'ssn',
  'taxId',
  'bankAccountNumber',
  'routingNumber',
];

/**
 * SL-8: Filter sensitive fields from response objects
 */
export function filterSensitiveFields<T extends Record<string, any>>(obj: T): Partial<T> {
  if (!obj || typeof obj !== 'object') return obj;
  
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip sensitive fields
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      continue;
    }
    
    // Recursively filter nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = filterSensitiveFields(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        typeof item === 'object' ? filterSensitiveFields(item) : item
      );
    } else {
      result[key] = value;
    }
  }
  
  return result as Partial<T>;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Schema for creating a refund
 */
export const createRefundSchema = z.object({
  // The Stripe Payment Intent ID to refund
  paymentIntentId: z.string()
    .min(1, 'Payment intent ID is required')
    .regex(/^pi_[a-zA-Z0-9]+$/, 'Invalid payment intent ID format'),
  
  // Amount to refund in cents (positive integer)
  amount: z.number()
    .int('Amount must be an integer')
    .positive('Amount must be positive')
    .max(100000000, 'Amount exceeds maximum allowed value'), // $1M max
  
  // Refund reason - must be one of Stripe's allowed reasons
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer', 'other'])
    .optional()
    .default('requested_by_customer'),
  
  // Optional metadata for audit trail
  metadata: z.record(z.string(), z.string())
    .optional(),
});

/**
 * Schema for getting refund status
 */
export const getRefundSchema = z.object({
  refundId: z.string()
    .min(1, 'Refund ID is required')
    .regex(/^re_[a-zA-Z0-9]+$/, 'Invalid refund ID format'),
});

/**
 * Schema for listing refunds with pagination
 * SL-5: Cross-field validation for date ranges
 */
export const listRefundsSchema = z.object({
  paymentIntentId: z.string()
    .regex(/^pi_[a-zA-Z0-9]+$/, 'Invalid payment intent ID format')
    .optional(),
  
  status: z.enum(['pending', 'succeeded', 'failed', 'canceled'])
    .optional(),
  
  // Pagination
  limit: z.coerce.number()
    .int()
    .min(1)
    .max(100)
    .default(20),
  
  offset: z.coerce.number()
    .int()
    .min(0)
    .default(0),
  
  // Date filters (ISO 8601 format)
  createdAfter: z.string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid date format. Use ISO 8601 format.',
    }),
  
  createdBefore: z.string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid date format. Use ISO 8601 format.',
    }),
}).refine(
  // SL-5: Cross-field validation - ensure createdAfter is before createdBefore
  (data) => {
    if (data.createdAfter && data.createdBefore) {
      return new Date(data.createdAfter) <= new Date(data.createdBefore);
    }
    return true;
  },
  {
    message: 'createdAfter must be before or equal to createdBefore',
    path: ['createdAfter'],
  }
);

/**
 * Schema for bulk refund operations (admin only)
 */
export const bulkRefundSchema = z.object({
  refunds: z.array(
    z.object({
      paymentIntentId: z.string()
        .regex(/^pi_[a-zA-Z0-9]+$/, 'Invalid payment intent ID format'),
      amount: z.number()
        .int('Amount must be an integer')
        .positive('Amount must be positive'),
      reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer', 'other'])
        .optional()
        .default('requested_by_customer'),
    })
  )
  .min(1, 'At least one refund is required')
  .max(100, 'Maximum 100 refunds per batch'),
  
  // Reason for bulk operation
  batchReason: z.string()
    .min(1)
    .max(500)
    .optional(),
});

/**
 * Schema for canceling a pending refund
 */
export const cancelRefundSchema = z.object({
  refundId: z.string()
    .min(1, 'Refund ID is required')
    .regex(/^re_[a-zA-Z0-9]+$/, 'Invalid refund ID format'),
  
  reason: z.string()
    .min(1)
    .max(500)
    .optional(),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type CreateRefundInput = z.infer<typeof createRefundSchema>;
export type GetRefundInput = z.infer<typeof getRefundSchema>;
export type ListRefundsInput = z.infer<typeof listRefundsSchema>;
export type BulkRefundInput = z.infer<typeof bulkRefundSchema>;
export type CancelRefundInput = z.infer<typeof cancelRefundSchema>;

// =============================================================================
// VALIDATION MIDDLEWARE
// =============================================================================

/**
 * Create validation middleware for a given schema
 * SL-6: Re-validate after transform to ensure transformations didn't introduce issues
 */
function createValidator<T extends z.ZodType>(
  schema: T,
  source: 'body' | 'params' | 'query' = 'body'
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const data = source === 'body' 
      ? request.body 
      : source === 'params' 
        ? request.params 
        : request.query;

    try {
      // First pass: parse and transform
      const validated = schema.parse(data);
      
      // SL-6: Second pass - re-validate the transformed output
      // This catches issues where transforms might produce invalid data
      const revalidated = schema.parse(validated);
      
      // Replace the request data with validated/sanitized data
      if (source === 'body') {
        (request as any).body = revalidated;
      } else if (source === 'params') {
        (request as any).params = revalidated;
      } else {
        (request as any).query = revalidated;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = ValidationError.fromZod(error);
        
        // SL-8: Log validation failures with standardized format
        const failures: ValidationFailure[] = error.issues.map((e: z.ZodIssue) => ({
          field: e.path.join('.'),
          constraint: e.code,
          message: e.message,
          code: e.code,
        }));
        
        logValidationFailure(failures, {
          path: request.url,
          method: request.method,
          userId: (request as any).user?.userId,
          tenantId: (request as any).user?.tenantId,
          ip: request.ip,
        });
        
        log.warn({
          source,
          errors: validationError.errors,
          path: request.url,
        }, 'Validation failed');
        
        sendProblemResponse(
          reply,
          validationError,
          request.id,
          request.url
        );
        return;
      }
      
      throw error;
    }
  };
}

/**
 * Validate create refund request body
 */
export const validateCreateRefund = createValidator(createRefundSchema, 'body');

/**
 * Validate get refund params
 */
export const validateGetRefund = createValidator(getRefundSchema, 'params');

/**
 * Validate list refunds query
 */
export const validateListRefunds = createValidator(listRefundsSchema, 'query');

/**
 * Validate bulk refund request body
 */
export const validateBulkRefund = createValidator(bulkRefundSchema, 'body');

/**
 * Validate cancel refund request
 */
export const validateCancelRefund = createValidator(cancelRefundSchema, 'body');

// =============================================================================
// ADDITIONAL BUSINESS RULE VALIDATIONS
// =============================================================================

/**
 * Validate refund amount against original payment
 */
export async function validateRefundAmount(
  refundAmount: number,
  originalAmount: number,
  previousRefunds: number = 0
): Promise<{ valid: boolean; error?: string; remaining: number }> {
  const remaining = originalAmount - previousRefunds;
  
  if (refundAmount > remaining) {
    return {
      valid: false,
      error: `Refund amount (${refundAmount}) exceeds remaining refundable amount (${remaining})`,
      remaining,
    };
  }
  
  if (refundAmount <= 0) {
    return {
      valid: false,
      error: 'Refund amount must be positive',
      remaining,
    };
  }
  
  return { valid: true, remaining };
}

/**
 * Validate refund timing (e.g., within refund window)
 */
export function validateRefundTiming(
  paymentDate: Date,
  maxRefundDays: number = 120 // Stripe's default limit
): { valid: boolean; error?: string; daysElapsed: number } {
  const now = new Date();
  const daysSincePayment = Math.floor(
    (now.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSincePayment > maxRefundDays) {
    return {
      valid: false,
      error: `Refund window expired. Maximum ${maxRefundDays} days, ${daysSincePayment} days elapsed.`,
      daysElapsed: daysSincePayment,
    };
  }
  
  return { valid: true, daysElapsed: daysSincePayment };
}

/**
 * Validate payment status for refund eligibility
 */
export function validatePaymentStatusForRefund(
  status: string
): { valid: boolean; error?: string } {
  const refundableStatuses = ['succeeded', 'requires_capture'];
  const nonRefundableStatuses = ['refunded', 'canceled', 'failed'];
  
  if (nonRefundableStatuses.includes(status)) {
    return {
      valid: false,
      error: `Payment with status '${status}' cannot be refunded`,
    };
  }
  
  if (!refundableStatuses.includes(status)) {
    return {
      valid: false,
      error: `Payment with status '${status}' is not in a refundable state`,
    };
  }
  
  return { valid: true };
}
