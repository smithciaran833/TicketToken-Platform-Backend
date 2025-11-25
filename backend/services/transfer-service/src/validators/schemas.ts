import { z } from 'zod';

/**
 * TRANSFER SERVICE VALIDATION SCHEMAS
 * 
 * Zod schemas for all transfer-related API endpoints
 * Phase 1: Input Validation
 */

// ============================================================================
// COMMON VALIDATORS
// ============================================================================

/**
 * UUID v4 validation
 */
export const uuidSchema = z.string()
  .uuid('Invalid UUID format')
  .describe('UUID identifier');

/**
 * Email validation
 */
export const emailSchema = z.string()
  .email('Invalid email format')
  .max(255, 'Email too long')
  .describe('Email address');

/**
 * Acceptance code validation
 * 6-12 characters, alphanumeric
 */
export const acceptanceCodeSchema = z.string()
  .min(6, 'Acceptance code must be at least 6 characters')
  .max(12, 'Acceptance code must be at most 12 characters')
  .regex(/^[A-Z0-9]+$/, 'Acceptance code must be alphanumeric uppercase')
  .describe('Transfer acceptance code');

/**
 * Optional message validation
 */
export const messageSchema = z.string()
  .max(500, 'Message too long (max 500 characters)')
  .optional()
  .describe('Optional message to recipient');

// ============================================================================
// GIFT TRANSFER SCHEMAS
// ============================================================================

/**
 * Request body schema for initiating a gift transfer
 * Note: fromUserId is NOT included - it will come from JWT token
 */
export const giftTransferBodySchema = z.object({
  ticketId: uuidSchema.describe('ID of ticket to transfer'),
  toEmail: emailSchema.describe('Recipient email address'),
  message: messageSchema
}).strict(); // Reject additional properties

/**
 * Response schema for gift transfer creation
 */
export const giftTransferResponseSchema = z.object({
  transferId: uuidSchema,
  acceptanceCode: acceptanceCodeSchema,
  status: z.literal('PENDING'),
  expiresAt: z.date()
});

// ============================================================================
// ACCEPT TRANSFER SCHEMAS
// ============================================================================

/**
 * Request body schema for accepting a transfer
 * Note: userId will be removed in future - should come from JWT
 */
export const acceptTransferBodySchema = z.object({
  acceptanceCode: acceptanceCodeSchema.describe('Transfer acceptance code'),
  userId: uuidSchema.describe('User ID accepting the transfer')
}).strict();

/**
 * URL parameter schema for accept transfer
 */
export const acceptTransferParamsSchema = z.object({
  transferId: uuidSchema.describe('Transfer ID to accept')
});

/**
 * Response schema for transfer acceptance
 */
export const acceptTransferResponseSchema = z.object({
  success: z.boolean(),
  ticketId: uuidSchema,
  newOwnerId: uuidSchema
});

// ============================================================================
// QUERY PARAMETER SCHEMAS
// ============================================================================

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

/**
 * Transfer list query parameters
 */
export const transferListQuerySchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED'])
    .optional()
    .describe('Filter by transfer status'),
  ...paginationSchema.shape
});

/**
 * Transfer ID parameter
 */
export const transferIdParamSchema = z.object({
  transferId: uuidSchema
});

/**
 * Ticket ID parameter
 */
export const ticketIdParamSchema = z.object({
  ticketId: uuidSchema
});

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================

/**
 * Validates request body against schema
 * Returns validated data or throws validation error
 */
export function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Validates query parameters against schema
 */
export function validateQuery<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Validates URL parameters against schema
 */
export function validateParams<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 */
export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): 
  { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  return result.success 
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

/**
 * Format Zod errors into user-friendly messages
 */
export function formatZodError(error: z.ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  
  for (const issue of error.issues) {
    const field = issue.path.join('.');
    if (!formatted[field]) {
      formatted[field] = [];
    }
    formatted[field].push(issue.message);
  }
  
  return formatted;
}
