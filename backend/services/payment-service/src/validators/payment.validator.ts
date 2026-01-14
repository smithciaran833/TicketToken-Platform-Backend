/**
 * Payment Validators
 * 
 * HIGH FIX: Adds comprehensive validation for all payment routes
 * including UUID validation for escrowId and proper schema definitions.
 */

import { z } from 'zod';
import { FastifyRequest, FastifyReply } from 'fastify';

// =============================================================================
// REGEX PATTERNS
// =============================================================================

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_PAYMENT_INTENT_PATTERN = /^pi_[a-zA-Z0-9]+$/;
const STRIPE_CUSTOMER_PATTERN = /^cus_[a-zA-Z0-9]+$/;
const STRIPE_PAYMENT_METHOD_PATTERN = /^pm_[a-zA-Z0-9]+$/;

// =============================================================================
// BASE SCHEMAS
// =============================================================================

const uuidSchema = z.string().regex(UUID_PATTERN, 'Must be a valid UUID');
const stripePaymentIntentSchema = z.string().regex(STRIPE_PAYMENT_INTENT_PATTERN, 'Must be a valid Stripe payment intent ID');
const stripeCustomerSchema = z.string().regex(STRIPE_CUSTOMER_PATTERN, 'Must be a valid Stripe customer ID');
const stripePaymentMethodSchema = z.string().regex(STRIPE_PAYMENT_METHOD_PATTERN, 'Must be a valid Stripe payment method ID');

// Amount in cents (min 50 cents, max $1,000,000)
const amountSchema = z.number()
  .int('Amount must be an integer')
  .min(50, 'Minimum amount is 50 cents')
  .max(100_000_000, 'Maximum amount is $1,000,000');

// Currency code (ISO 4217)
const currencySchema = z.string()
  .length(3, 'Currency must be 3 characters')
  .toUpperCase()
  .refine(
    (val) => ['USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(val),
    'Unsupported currency'
  );

// =============================================================================
// CREATE PAYMENT INTENT SCHEMA
// =============================================================================

export const createPaymentIntentSchema = z.object({
  orderId: uuidSchema,
  amount: amountSchema,
  currency: currencySchema.default('USD'),
  customerId: stripeCustomerSchema.optional(),
  paymentMethodId: stripePaymentMethodSchema.optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  description: z.string().max(500).optional(),
  receiptEmail: z.string().email().optional(),
  statementDescriptor: z.string().max(22).optional(),
  statementDescriptorSuffix: z.string().max(22).optional(),
});

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

// =============================================================================
// CONFIRM PAYMENT SCHEMA
// =============================================================================

export const confirmPaymentSchema = z.object({
  paymentIntentId: stripePaymentIntentSchema,
  paymentMethodId: stripePaymentMethodSchema.optional(),
  returnUrl: z.string().url().optional(),
});

export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;

// =============================================================================
// CAPTURE PAYMENT SCHEMA
// =============================================================================

export const capturePaymentSchema = z.object({
  paymentIntentId: stripePaymentIntentSchema,
  amountToCapture: amountSchema.optional(), // For partial capture
});

export type CapturePaymentInput = z.infer<typeof capturePaymentSchema>;

// =============================================================================
// CANCEL PAYMENT SCHEMA
// =============================================================================

export const cancelPaymentSchema = z.object({
  paymentIntentId: stripePaymentIntentSchema,
  cancellationReason: z.enum([
    'duplicate',
    'fraudulent',
    'requested_by_customer',
    'abandoned',
  ]).optional(),
});

export type CancelPaymentInput = z.infer<typeof cancelPaymentSchema>;

// =============================================================================
// ESCROW SCHEMAS
// =============================================================================

export const createEscrowSchema = z.object({
  orderId: uuidSchema,
  paymentIntentId: stripePaymentIntentSchema,
  amount: amountSchema,
  holdDays: z.number().int().min(1).max(90).default(7),
  releaseConditions: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type CreateEscrowInput = z.infer<typeof createEscrowSchema>;

export const escrowIdParamSchema = z.object({
  escrowId: uuidSchema, // HIGH FIX: Added UUID validation for escrowId
});

export type EscrowIdParam = z.infer<typeof escrowIdParamSchema>;

export const releaseEscrowSchema = z.object({
  escrowId: uuidSchema,
  releaseAmount: amountSchema.optional(), // For partial release
  releaseReason: z.string().max(500).optional(),
});

export type ReleaseEscrowInput = z.infer<typeof releaseEscrowSchema>;

// =============================================================================
// PAYOUT SCHEMAS
// =============================================================================

export const createPayoutSchema = z.object({
  connectedAccountId: z.string().regex(/^acct_[a-zA-Z0-9]+$/, 'Invalid connected account ID'),
  amount: amountSchema,
  currency: currencySchema.default('USD'),
  description: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type CreatePayoutInput = z.infer<typeof createPayoutSchema>;

// =============================================================================
// TRANSFER SCHEMAS
// =============================================================================

export const createTransferSchema = z.object({
  amount: amountSchema,
  destinationAccountId: z.string().regex(/^acct_[a-zA-Z0-9]+$/),
  sourcePaymentIntentId: stripePaymentIntentSchema.optional(),
  transferGroup: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;

// =============================================================================
// QUERY SCHEMAS
// =============================================================================

export const listPaymentsQuerySchema = z.object({
  orderId: uuidSchema.optional(),
  customerId: stripeCustomerSchema.optional(),
  status: z.enum(['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'canceled', 'succeeded']).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(['created_at', 'amount', 'status']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export const getPaymentParamSchema = z.object({
  paymentIntentId: stripePaymentIntentSchema,
});

export type GetPaymentParam = z.infer<typeof getPaymentParamSchema>;

// =============================================================================
// WEBHOOK SCHEMAS
// =============================================================================

export const webhookPayloadSchema = z.object({
  id: z.string(),
  object: z.literal('event'),
  type: z.string(),
  data: z.object({
    object: z.record(z.string(), z.any()),
  }),
  created: z.number(),
  livemode: z.boolean(),
  pending_webhooks: z.number().optional(),
  request: z.object({
    id: z.string().nullable(),
    idempotency_key: z.string().nullable(),
  }).optional(),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

// =============================================================================
// VALIDATION MIDDLEWARE FACTORIES
// =============================================================================

/**
 * Create validation middleware for request body
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const validated = schema.parse(request.body);
      (request as any).validatedBody = validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          type: 'https://api.tickettoken.io/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: 'Request body validation failed',
          errors: error.issues.map((e: z.ZodIssue) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
        });
        return;
      }
      throw error;
    }
  };
}

/**
 * Create validation middleware for request params
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const validated = schema.parse(request.params);
      (request as any).validatedParams = validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          type: 'https://api.tickettoken.io/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: 'Request parameters validation failed',
          errors: error.issues.map((e: z.ZodIssue) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
        });
        return;
      }
      throw error;
    }
  };
}

/**
 * Create validation middleware for query string
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const validated = schema.parse(request.query);
      (request as any).validatedQuery = validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          type: 'https://api.tickettoken.io/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: 'Query parameters validation failed',
          errors: error.issues.map((e: z.ZodIssue) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
        });
        return;
      }
      throw error;
    }
  };
}

// =============================================================================
// EXPORTED VALIDATION MIDDLEWARE
// =============================================================================

export const validateCreatePaymentIntent = validateBody(createPaymentIntentSchema);
export const validateConfirmPayment = validateBody(confirmPaymentSchema);
export const validateCapturePayment = validateBody(capturePaymentSchema);
export const validateCancelPayment = validateBody(cancelPaymentSchema);
export const validateCreateEscrow = validateBody(createEscrowSchema);
export const validateEscrowIdParam = validateParams(escrowIdParamSchema);
export const validateReleaseEscrow = validateBody(releaseEscrowSchema);
export const validateCreatePayout = validateBody(createPayoutSchema);
export const validateCreateTransfer = validateBody(createTransferSchema);
export const validateListPaymentsQuery = validateQuery(listPaymentsQuerySchema);
export const validateGetPaymentParam = validateParams(getPaymentParamSchema);
