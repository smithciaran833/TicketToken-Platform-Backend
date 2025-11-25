import { z } from 'zod';

/**
 * COMPLIANCE SERVICE VALIDATION SCHEMAS
 * 
 * Comprehensive Zod schemas for all API endpoints
 * Phase 4: Input Validation & API Hardening
 */

// ============================================================================
// COMMON VALIDATORS
// ============================================================================

/**
 * EIN format: XX-XXXXXXX (2 digits, dash, 7 digits)
 */
export const einSchema = z.string()
  .regex(/^\d{2}-\d{7}$/, 'EIN must be in format XX-XXXXXXX')
  .describe('Employer Identification Number');

/**
 * Email validation
 */
export const emailSchema = z.string()
  .email('Invalid email format')
  .max(255, 'Email too long');

/**
 * Phone number validation (US format)
 */
export const phoneSchema = z.string()
  .regex(/^\+?1?\d{10,15}$/, 'Invalid phone number format')
  .optional();

/**
 * Currency amount - must be non-negative
 */
export const currencySchema = z.number()
  .min(0, 'Amount cannot be negative')
  .max(1000000000, 'Amount exceeds maximum')
  .describe('Currency amount in cents');

/**
 * UUID v4 validation
 */
export const uuidSchema = z.string()
  .uuid('Invalid UUID format');

/**
 * Year validation (19

00-2100)
 */
export const yearSchema = z.number()
  .int('Year must be an integer')
  .min(1900, 'Year too early')
  .max(2100, 'Year too far in future');

/**
 * Venue ID validation
 */
export const venueIdSchema = z.string()
  .min(1, 'Venue ID required')
  .max(100, 'Venue ID too long');

/**
 * Account number validation (6-17 digits)
 */
export const accountNumberSchema = z.string()
  .regex(/^\d{6,17}$/, 'Account number must be 6-17 digits');

/**
 * Routing number validation (9 digits)
 */
export const routingNumberSchema = z.string()
  .regex(/^\d{9}$/, 'Routing number must be 9 digits');

/**
 * Address validation
 */
export const addressSchema = z.object({
  street: z.string().min(1).max(255),
  city: z.string().min(1).max(100),
  state: z.string().length(2, 'State must be 2-letter code'),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  country: z.string().length(2, 'Country must be ISO 2-letter code').default('US')
});

// ============================================================================
// VENUE VERIFICATION SCHEMAS
// ============================================================================

export const startVerificationSchema = z.object({
  venueId: venueIdSchema,
  businessName: z.string().min(1).max(255),
  ein: einSchema,
  businessAddress: addressSchema,
  representativeName: z.string().min(1).max(255),
  representativeEmail: emailSchema,
  representativePhone: phoneSchema
});

export const uploadW9Schema = z.object({
  venueId: venueIdSchema,
  ein: einSchema
  // File is handled separately by multipart
});

export const updateStatusSchema = z.object({
  venueId: venueIdSchema,
  status: z.enum(['pending', 'verified', 'rejected']),
  rejectionReason: z.string().max(1000).optional()
});

// ============================================================================
// TAX REPORTING SCHEMAS
// ============================================================================

export const trackSaleSchema = z.object({
  venueId: venueIdSchema,
  amount: currencySchema,
  ticketId: z.string().min(1).max(100)
});

export const taxSummaryQuerySchema = z.object({
  year: yearSchema.optional()
});

export const calculateTaxSchema = z.object({
  amount: currencySchema,
  venueId: venueIdSchema,
  taxRate: z.number().min(0).max(1).optional()
});

export const generate1099Schema = z.object({
  year: yearSchema.optional()
});

// ============================================================================
// OFAC SCREENING SCHEMAS
// ============================================================================

export const ofacCheckSchema = z.object({
  name: z.string().min(1).max(255),
  venueId: venueIdSchema.optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  address: addressSchema.optional()
});

// ============================================================================
// RISK ASSESSMENT SCHEMAS
// ============================================================================

export const calculateRiskSchema = z.object({
  venueId: venueIdSchema
});

export const flagVenueSchema = z.object({
  venueId: venueIdSchema,
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000)
});

export const resolveFlagSchema = z.object({
  resolution: z.string().min(10, 'Resolution must be at least 10 characters').max(1000)
});

// ============================================================================
// BANK VERIFICATION SCHEMAS
// ============================================================================

export const verifyBankAccountSchema = z.object({
  venueId: venueIdSchema,
  accountNumber: accountNumberSchema,
  routingNumber: routingNumberSchema
});

export const createPayoutMethodSchema = z.object({
  venueId: venueIdSchema,
  accountToken: z.string().min(1).max(255)
});

// ============================================================================
// DOCUMENT SCHEMAS
// ============================================================================

export const uploadDocumentSchema = z.object({
  venueId: venueIdSchema,
  documentType: z.enum(['W9', 'ID', 'PROOF_OF_ADDRESS', 'BUSINESS_LICENSE', 'OTHER'])
});

export const getDocumentSchema = z.object({
  documentId: z.string().min(1).max(100)
});

// ============================================================================
// GDPR SCHEMAS
// ============================================================================

export const gdprDeletionSchema = z.object({
  userId: z.string().min(1).max(100),
  reason: z.string().min(10).max(1000).optional(),
  requestedBy: emailSchema
});

export const gdprExportSchema = z.object({
  userId: z.string().min(1).max(100),
  format: z.enum(['json', 'csv']).default('json')
});

// ============================================================================
// ADMIN SCHEMAS
// ============================================================================

export const updateComplianceSettingsSchema = z.object({
  settingKey: z.string().min(1).max(100),
  settingValue: z.any(), // Flexible value type
  description: z.string().max(500).optional()
});

export const getAllNonCompliantVenuesQuerySchema = z.object({
  status: z.enum(['all', 'pending', 'rejected']).optional()
});

// ============================================================================
// BATCH JOB SCHEMAS
// ============================================================================

export const batchJobQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20)
});

// ============================================================================
// PAGINATION SCHEMAS
// ============================================================================

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20)
});

// ============================================================================
// QUERY PARAMETER SCHEMAS
// ============================================================================

export const venueIdParamSchema = z.object({
  venueId: venueIdSchema
});

export const yearParamSchema = z.object({
  year: yearSchema.transform(String) // URL params come as strings
});

export const documentIdParamSchema = z.object({
  documentId: z.string().min(1).max(100)
});

export const flagIdParamSchema = z.object({
  flagId: z.string().regex(/^\d+$/, 'Flag ID must be numeric').transform(Number)
});

// ============================================================================
// WEBHOOK SCHEMAS
// ============================================================================

export const plaidWebhookSchema = z.object({
  webhook_type: z.string(),
  webhook_code: z.string(),
  item_id: z.string().optional(),
  error: z.any().optional()
});

export const stripeWebhookSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.any()
});

export const sendgridWebhookSchema = z.array(z.object({
  email: emailSchema,
  event: z.string(),
  timestamp: z.number().optional(),
  sg_event_id: z.string().optional(),
  sg_message_id: z.string().optional()
}));

// ============================================================================
// HEALTH CHECK SCHEMAS
// ============================================================================

export const healthCheckQuerySchema = z.object({
  detailed: z.enum(['true', 'false']).transform(val => val === 'true').optional()
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
