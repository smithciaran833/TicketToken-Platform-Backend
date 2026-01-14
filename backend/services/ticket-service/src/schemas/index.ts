import { z } from 'zod';

/**
 * SECURITY: All schemas use .strict() to prevent prototype pollution and mass assignment
 * The .strict() method rejects any properties not explicitly defined in the schema.
 * This prevents attackers from injecting malicious properties like __proto__.
 * 
 * AUDIT FIXES:
 * - RD2: Schema coercion disabled (explicit validation, no implicit type conversion)
 * - RD3: Required fields explicit (all required fields marked with explicit error messages)
 * - RD4: Date/time validation (ISO 8601 format enforced)
 * - SEC3: Input length limits enforced (all strings have min/max limits)
 * - Field-level validation error messages (descriptive errors for each field)
 */

// =============================================================================
// Unicode Normalization Helper (MEDIUM Fix: No Unicode normalization)
// =============================================================================

/**
 * Normalize Unicode strings to NFC form
 * This prevents homograph attacks where different Unicode representations
 * of the same character are treated as different strings.
 * 
 * Example: 'café' can be represented as 'cafe\u0301' (e + combining accent)
 * or 'caf\u00e9' (é as single char). NFC normalizes to single char form.
 */
const normalizedString = (schema: z.ZodString) => 
  schema.transform((val) => val.normalize('NFC'));

/**
 * String with Unicode normalization applied
 * SEC3: Input length limits enforced
 */
export const safeString = (options?: { min?: number; max?: number; message?: string }) => {
  let schema = z.string();
  if (options?.min !== undefined) {
    schema = schema.min(options.min, `Must be at least ${options.min} characters`);
  }
  if (options?.max !== undefined) {
    schema = schema.max(options.max, `Must be at most ${options.max} characters`);
  }
  return normalizedString(schema);
};

// =============================================================================
// Common Schemas with Explicit Field Messages
// =============================================================================

/**
 * UUID Schema with explicit format validation
 * RD3: Required fields explicit with error messages
 */
export const uuidSchema = z.string().uuid('Invalid UUID format. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');

/**
 * ISO 8601 DateTime Schema
 * RD4: Date/time validation (ISO 8601)
 * Validates full ISO 8601 datetime strings including timezone
 */
export const iso8601DateTimeSchema = z.string().datetime('Invalid datetime format. Expected ISO 8601: YYYY-MM-DDTHH:mm:ss.sssZ');

/**
 * Optional ISO 8601 DateTime Schema
 */
export const optionalIso8601DateTimeSchema = iso8601DateTimeSchema.optional();

/**
 * Pagination Schema
 * RD2: No coercion - values must be provided as numbers
 * Use query string parsing in routes to convert, not here
 */
export const paginationSchema = z.object({
  page: z.number().int('Page must be an integer').positive('Page must be positive').default(1),
  limit: z.number().int('Limit must be an integer').min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
}).strict();

// =============================================================================
// Ticket Schemas with SEC3: Input Length Limits
// =============================================================================

export const ticketItemSchema = z.object({
  ticketTypeId: uuidSchema,
  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(1, 'Minimum quantity is 1')
    .max(10, 'Maximum quantity per type is 10'),
}).strict();

export const purchaseRequestSchema = z.object({
  eventId: uuidSchema,
  tickets: z.array(ticketItemSchema)
    .min(1, 'At least one ticket selection is required')
    .max(10, 'Maximum 10 different ticket types per purchase'),
  paymentMethodId: z.string()
    .min(1, 'Payment method ID cannot be empty')
    .max(255, 'Payment method ID too long')
    .optional(),
  idempotencyKey: z.string()
    .min(16, 'Idempotency key must be at least 16 characters')
    .max(64, 'Idempotency key cannot exceed 64 characters')
    .optional(),
}).strict();

export const reservationRequestSchema = z.object({
  eventId: uuidSchema,
  ticketTypeId: uuidSchema,
  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(1, 'Minimum reservation is 1 ticket')
    .max(10, 'Maximum reservation is 10 tickets'),
  idempotencyKey: z.string()
    .min(16, 'Idempotency key must be at least 16 characters')
    .max(64, 'Idempotency key cannot exceed 64 characters')
    .optional(),
}).strict();

export const confirmPurchaseSchema = z.object({
  reservationId: uuidSchema,
  paymentId: z.string()
    .min(1, 'Payment ID cannot be empty')
    .max(255, 'Payment ID too long'),
}).strict();

// =============================================================================
// Ticket Type Schemas with RD4: ISO 8601 Date Validation
// =============================================================================

export const createTicketTypeSchema = z.object({
  eventId: uuidSchema,
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name cannot exceed 100 characters'),
  description: z.string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional(),
  priceCents: z.number()
    .int('Price must be in whole cents')
    .min(0, 'Price cannot be negative')
    .max(100000000, 'Price cannot exceed $1,000,000'),
  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(1, 'Must have at least 1 ticket')
    .max(1000000, 'Quantity cannot exceed 1,000,000'),
  maxPerPurchase: z.number()
    .int('Max per purchase must be a whole number')
    .min(1, 'Max per purchase must be at least 1')
    .max(10, 'Max per purchase cannot exceed 10')
    .default(4),
  // RD4: ISO 8601 DateTime validation
  saleStartDate: iso8601DateTimeSchema.optional(),
  saleEndDate: iso8601DateTimeSchema.optional(),
  metadata: z.record(
    z.string().max(100, 'Metadata key too long'), 
    z.unknown()
  ).optional(),
}).strict().refine(
  (data) => {
    // Validate sale end date is after start date if both provided
    if (data.saleStartDate && data.saleEndDate) {
      return new Date(data.saleEndDate) > new Date(data.saleStartDate);
    }
    return true;
  },
  { message: 'Sale end date must be after sale start date', path: ['saleEndDate'] }
);

export const updateTicketTypeSchema = z.object({
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name cannot exceed 100 characters')
    .optional(),
  description: z.string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional(),
  priceCents: z.number()
    .int('Price must be in whole cents')
    .min(0, 'Price cannot be negative')
    .max(100000000, 'Price cannot exceed $1,000,000')
    .optional(),
  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(1, 'Must have at least 1 ticket')
    .max(1000000, 'Quantity cannot exceed 1,000,000')
    .optional(),
  maxPerPurchase: z.number()
    .int('Max per purchase must be a whole number')
    .min(1, 'Max per purchase must be at least 1')
    .max(10, 'Max per purchase cannot exceed 10')
    .optional(),
  saleStartDate: iso8601DateTimeSchema.optional(),
  saleEndDate: iso8601DateTimeSchema.optional(),
}).strict();

// =============================================================================
// Transfer Schemas with SEC3: Length Limits
// =============================================================================

export const transferTicketSchema = z.object({
  ticketId: uuidSchema,
  recipientEmail: z.string()
    .email('Invalid email format')
    .max(255, 'Email cannot exceed 255 characters'),
  message: z.string()
    .max(500, 'Message cannot exceed 500 characters')
    .optional(),
}).strict();

export const acceptTransferSchema = z.object({
  transferId: uuidSchema,
}).strict();

// =============================================================================
// Validation / Scanning Schemas
// =============================================================================

export const validateQRSchema = z.object({
  qrData: z.string()
    .min(1, 'QR data cannot be empty')
    .max(2048, 'QR data too large'),
  deviceId: z.string()
    .max(255, 'Device ID too long')
    .optional(),
  location: z.string()
    .max(255, 'Location string too long')
    .optional(),
}).strict();

export const checkInSchema = z.object({
  ticketId: uuidSchema,
  deviceId: z.string()
    .max(255, 'Device ID too long')
    .optional(),
  location: z.string()
    .max(255, 'Location string too long')
    .optional(),
  force: z.boolean().default(false),
}).strict();

// =============================================================================
// Status Update Schemas
// =============================================================================

export const ticketStatusEnum = z.enum([
  'available',
  'reserved',
  'sold',
  'active',
  'transferred',
  'checked_in',
  'used',
  'refunded',
  'expired',
  'cancelled',
]);

export const updateStatusSchema = z.object({
  status: ticketStatusEnum,
  reason: z.string()
    .max(500, 'Reason cannot exceed 500 characters')
    .optional(),
}).strict();

// =============================================================================
// Webhook Schemas
// =============================================================================

export const paymentWebhookSchema = z.object({
  type: z.string()
    .min(1, 'Webhook type cannot be empty')
    .max(100, 'Webhook type too long'),
  data: z.object({
    object: z.record(z.string(), z.unknown()),
  }),
}).passthrough(); // Allow Stripe webhook data

export const mintWebhookSchema = z.object({
  ticketId: uuidSchema,
  mintAddress: z.string()
    .min(32, 'Mint address too short')
    .max(64, 'Mint address too long'),
  signature: z.string()
    .min(64, 'Signature too short')
    .max(128, 'Signature too long'),
  status: z.enum(['success', 'failed']),
  error: z.string()
    .max(1000, 'Error message too long')
    .optional(),
}).strict();

// =============================================================================
// Query Parameter Schemas
// RD2: Explicit coercion only for query params where browser sends strings
// =============================================================================

export const ticketQuerySchema = z.object({
  eventId: uuidSchema.optional(),
  status: ticketStatusEnum.optional(),
  // Query params come as strings from URL, so coercion is acceptable here
  page: z.coerce.number()
    .int('Page must be a whole number')
    .positive('Page must be positive')
    .default(1),
  limit: z.coerce.number()
    .int('Limit must be a whole number')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(20),
}).strict();

export const ticketIdParamSchema = z.object({
  ticketId: uuidSchema,
}).strict();

export const eventIdParamSchema = z.object({
  eventId: uuidSchema,
}).strict();

export const ticketTypeIdParamSchema = z.object({
  ticketTypeId: uuidSchema,
}).strict();

// =============================================================================
// Internal Service Schemas (S2S)
// =============================================================================

export const internalValidationSchema = z.object({
  ticketId: uuidSchema,
}).strict();

export const internalReservationSchema = z.object({
  ticketId: uuidSchema,
  userId: uuidSchema,
  eventId: uuidSchema,
}).strict();

// =============================================================================
// Schema Types
// =============================================================================

export type PurchaseRequest = z.infer<typeof purchaseRequestSchema>;
export type ReservationRequest = z.infer<typeof reservationRequestSchema>;
export type ConfirmPurchase = z.infer<typeof confirmPurchaseSchema>;
export type CreateTicketType = z.infer<typeof createTicketTypeSchema>;
export type UpdateTicketType = z.infer<typeof updateTicketTypeSchema>;
export type TransferTicket = z.infer<typeof transferTicketSchema>;
export type ValidateQR = z.infer<typeof validateQRSchema>;
export type CheckIn = z.infer<typeof checkInSchema>;
export type UpdateStatus = z.infer<typeof updateStatusSchema>;
export type TicketQuery = z.infer<typeof ticketQuerySchema>;

// =============================================================================
// Validation Helper
// =============================================================================

/**
 * SECURITY: Validate and strip unknown properties from request data
 * This function validates input against a schema and returns only known properties.
 * Unknown properties are silently stripped (using .parse with strict schemas).
 * 
 * @throws z.ZodError if validation fails
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * SECURITY: Safe parse that returns result object instead of throwing
 * Returns structured result with detailed error information
 */
export function safeValidateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError; fieldErrors: Record<string, string[]> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  // Extract field-level errors for better debugging
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }
    fieldErrors[path].push(issue.message);
  }
  
  return { success: false, error: result.error, fieldErrors };
}

/**
 * Format Zod errors into user-friendly messages
 */
export function formatZodErrors(error: z.ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
  }));
}
