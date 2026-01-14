/**
 * Zod Validation Schemas for Transfer Service
 * 
 * AUDIT FIXES:
 * - VAL-M1: No Zod validation schemas → Created comprehensive schemas
 * - VAL-M2: Missing input validation → Strict validation
 * - VAL-M3: No UUID validation → UUIDv4 format validation
 * - VAL-M4: No pagination limits → Max limits enforced
 * - VAL-M5: No sanitization → Input sanitization
 */

import { z } from 'zod';

// =============================================================================
// BASE SCHEMAS
// =============================================================================

/**
 * UUID v4 format validation
 */
export const uuidSchema = z.string().uuid({ message: 'Invalid UUID format' });

/**
 * Solana public key validation (Base58, 32-44 chars)
 */
export const solanaPublicKeySchema = z.string()
  .min(32, 'Solana public key must be at least 32 characters')
  .max(44, 'Solana public key must be at most 44 characters')
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana public key format');

/**
 * Solana transaction signature (Base58, 87-88 chars)
 */
export const solanaSignatureSchema = z.string()
  .min(87, 'Invalid transaction signature')
  .max(88, 'Invalid transaction signature')
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid signature format');

/**
 * Email validation with normalization
 */
export const emailSchema = z.string()
  .email('Invalid email format')
  .toLowerCase()
  .max(255, 'Email must be at most 255 characters');

/**
 * Sanitized string (no script injection)
 */
export const sanitizedStringSchema = z.string()
  .transform(val => val.trim())
  .refine(val => !/<script/i.test(val), 'Invalid characters detected');

/**
 * Pagination parameters
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

// =============================================================================
// TRANSFER SCHEMAS
// =============================================================================

/**
 * Transfer status enum
 */
export const transferStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'completed',
  'expired',
  'failed'
]);

/**
 * Transfer type enum
 */
export const transferTypeSchema = z.enum([
  'gift',
  'sale',
  'refund',
  'admin',
  'system'
]);

/**
 * Initiate transfer request
 */
export const initiateTransferSchema = z.object({
  ticketId: uuidSchema,
  recipientEmail: emailSchema.optional(),
  recipientWallet: solanaPublicKeySchema.optional(),
  recipientUserId: uuidSchema.optional(),
  transferType: transferTypeSchema.default('gift'),
  message: z.string().max(500).optional(),
  expiresInHours: z.number().int().min(1).max(168).default(48), // Max 7 days
  metadata: z.record(z.string(), z.unknown()).optional()
}).refine(
  data => data.recipientEmail || data.recipientWallet || data.recipientUserId,
  { message: 'At least one recipient identifier is required' }
);

/**
 * Accept transfer request
 */
export const acceptTransferSchema = z.object({
  transferId: uuidSchema,
  acceptanceCode: z.string()
    .min(6, 'Acceptance code must be at least 6 characters')
    .max(64, 'Acceptance code must be at most 64 characters'),
  recipientWallet: solanaPublicKeySchema.optional()
});

/**
 * Cancel transfer request
 */
export const cancelTransferSchema = z.object({
  transferId: uuidSchema,
  reason: z.string().max(500).optional()
});

/**
 * Get transfer by ID
 */
export const getTransferSchema = z.object({
  transferId: uuidSchema
});

/**
 * List transfers query params
 */
export const listTransfersSchema = paginationSchema.extend({
  status: transferStatusSchema.optional(),
  type: transferTypeSchema.optional(),
  direction: z.enum(['sent', 'received']).optional(),
  ticketId: uuidSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional()
});

// =============================================================================
// BATCH TRANSFER SCHEMAS
// =============================================================================

/**
 * Single batch transfer item
 */
export const batchTransferItemSchema = z.object({
  ticketId: uuidSchema,
  recipientEmail: emailSchema.optional(),
  recipientWallet: solanaPublicKeySchema.optional(),
  recipientUserId: uuidSchema.optional(),
  message: z.string().max(500).optional()
}).refine(
  data => data.recipientEmail || data.recipientWallet || data.recipientUserId,
  { message: 'At least one recipient identifier is required' }
);

/**
 * Batch transfer request
 */
export const batchTransferSchema = z.object({
  transfers: z.array(batchTransferItemSchema)
    .min(1, 'At least one transfer is required')
    .max(50, 'Maximum 50 transfers per batch'),
  transferType: transferTypeSchema.default('gift'),
  expiresInHours: z.number().int().min(1).max(168).default(48)
});

// =============================================================================
// BLOCKCHAIN SCHEMAS
// =============================================================================

/**
 * Execute blockchain transfer
 */
export const executeBlockchainTransferSchema = z.object({
  transferId: uuidSchema,
  fromWallet: solanaPublicKeySchema,
  toWallet: solanaPublicKeySchema,
  nftMint: solanaPublicKeySchema,
  priorityFee: z.number().int().min(0).max(1000000).optional()
});

/**
 * Verify blockchain transfer
 */
export const verifyBlockchainTransferSchema = z.object({
  transferId: uuidSchema,
  signature: solanaSignatureSchema
});

/**
 * Get transfer history (blockchain)
 */
export const blockchainHistorySchema = z.object({
  nftMint: solanaPublicKeySchema,
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

// =============================================================================
// WEBHOOK SCHEMAS
// =============================================================================

/**
 * Webhook event types
 */
export const webhookEventTypeSchema = z.enum([
  'transfer.initiated',
  'transfer.accepted',
  'transfer.rejected',
  'transfer.cancelled',
  'transfer.completed',
  'transfer.expired',
  'transfer.failed',
  'blockchain.transfer.started',
  'blockchain.transfer.confirmed',
  'blockchain.transfer.failed'
]);

/**
 * Webhook payload
 */
export const webhookPayloadSchema = z.object({
  eventType: webhookEventTypeSchema,
  transferId: uuidSchema,
  timestamp: z.string().datetime(),
  data: z.record(z.string(), z.unknown())
});

/**
 * Configure webhook
 */
export const configureWebhookSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(webhookEventTypeSchema).min(1),
  secret: z.string().min(32).max(256).optional(),
  enabled: z.boolean().default(true)
});

// =============================================================================
// ADMIN SCHEMAS
// =============================================================================

/**
 * Admin force complete transfer
 */
export const adminForceCompleteSchema = z.object({
  transferId: uuidSchema,
  reason: z.string().min(10).max(1000),
  adminNote: z.string().max(2000).optional()
});

/**
 * Admin cancel transfer
 */
export const adminCancelTransferSchema = z.object({
  transferId: uuidSchema,
  reason: z.string().min(10).max(1000),
  refundRequired: z.boolean().default(false),
  adminNote: z.string().max(2000).optional()
});

/**
 * Admin search transfers
 */
export const adminSearchTransfersSchema = paginationSchema.extend({
  userId: uuidSchema.optional(),
  ticketId: uuidSchema.optional(),
  eventId: uuidSchema.optional(),
  status: transferStatusSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  searchTerm: z.string().max(255).optional()
});

// =============================================================================
// HEALTH CHECK SCHEMAS
// =============================================================================

export const healthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  timestamp: z.string().datetime(),
  version: z.string(),
  uptime: z.number(),
  checks: z.record(z.string(), z.object({
    status: z.enum(['healthy', 'unhealthy', 'degraded']),
    latencyMs: z.number().optional(),
    message: z.string().optional()
  }))
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type TransferStatus = z.infer<typeof transferStatusSchema>;
export type TransferType = z.infer<typeof transferTypeSchema>;
export type InitiateTransferInput = z.infer<typeof initiateTransferSchema>;
export type AcceptTransferInput = z.infer<typeof acceptTransferSchema>;
export type CancelTransferInput = z.infer<typeof cancelTransferSchema>;
export type ListTransfersInput = z.infer<typeof listTransfersSchema>;
export type BatchTransferInput = z.infer<typeof batchTransferSchema>;
export type ExecuteBlockchainTransferInput = z.infer<typeof executeBlockchainTransferSchema>;
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;
export type ConfigureWebhookInput = z.infer<typeof configureWebhookSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate and parse input with detailed errors
 */
export function validateInput<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): z.infer<T> {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code
    }));
    
    throw new ValidationError('Input validation failed', errors);
  }
  
  return result.data;
}

/**
 * Custom validation error
 */
export class ValidationError extends Error {
  public readonly errors: Array<{
    field: string;
    message: string;
    code: string;
  }>;
  
  constructor(
    message: string,
    errors: Array<{ field: string; message: string; code: string }>
  ) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Base schemas
  uuidSchema,
  solanaPublicKeySchema,
  solanaSignatureSchema,
  emailSchema,
  sanitizedStringSchema,
  paginationSchema,
  
  // Transfer schemas
  transferStatusSchema,
  transferTypeSchema,
  initiateTransferSchema,
  acceptTransferSchema,
  cancelTransferSchema,
  getTransferSchema,
  listTransfersSchema,
  
  // Batch schemas
  batchTransferItemSchema,
  batchTransferSchema,
  
  // Blockchain schemas
  executeBlockchainTransferSchema,
  verifyBlockchainTransferSchema,
  blockchainHistorySchema,
  
  // Webhook schemas
  webhookEventTypeSchema,
  webhookPayloadSchema,
  configureWebhookSchema,
  
  // Admin schemas
  adminForceCompleteSchema,
  adminCancelTransferSchema,
  adminSearchTransfersSchema,
  
  // Health check
  healthCheckResponseSchema,
  
  // Helpers
  validateInput,
  ValidationError
};
