import { z } from 'zod';

// =============================================================================
// COMMON VALIDATION PATTERNS
// =============================================================================

// UUID validation
const uuidSchema = z.string().uuid('Invalid UUID format');

// Common string length limits
const STRING_LIMITS = {
  SHORT: 50,       // Seat numbers, sections, etc.
  NAME: 100,       // Names, titles
  DESCRIPTION: 1000, // Descriptions
  URL: 2048,       // URLs
  DEFAULT: 255,    // Default string length
  SYMBOL: 10       // Token symbols
} as const;

// =============================================================================
// MINT DATA SCHEMAS
// =============================================================================

/**
 * Ticket metadata for minting
 */
export const ticketMetadataSchema = z.object({
  eventName: z.string().min(1).max(STRING_LIMITS.NAME).optional(),
  eventDate: z.string().max(STRING_LIMITS.SHORT).optional(),
  venue: z.string().max(STRING_LIMITS.NAME).optional(),
  tier: z.string().max(STRING_LIMITS.SHORT).optional(),
  seatNumber: z.string().max(STRING_LIMITS.SHORT).optional(),
  section: z.string().max(STRING_LIMITS.SHORT).optional(),
  row: z.string().max(STRING_LIMITS.SHORT).optional(),
  image: z.string().url().max(STRING_LIMITS.URL).optional()
}).strict();

/**
 * Single ticket for minting
 */
export const ticketMintDataSchema = z.object({
  ticketId: uuidSchema,
  tenantId: uuidSchema,
  orderId: uuidSchema.optional(),
  eventId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  ownerAddress: z.string().min(32).max(64).optional(), // Solana address
  metadata: ticketMetadataSchema.optional()
});

export type TicketMintData = z.infer<typeof ticketMintDataSchema>;

// =============================================================================
// ADMIN ROUTE SCHEMAS
// =============================================================================

/**
 * Batch mint request schema
 */
export const batchMintSchema = z.object({
  venueId: uuidSchema,
  tickets: z.array(z.object({
    id: uuidSchema,
    eventId: uuidSchema,
    userId: uuidSchema.optional(),
    ticketData: z.object({
      tier: z.string().max(STRING_LIMITS.SHORT).optional(),
      section: z.string().max(STRING_LIMITS.SHORT).optional(),
      row: z.string().max(STRING_LIMITS.SHORT).optional(),
      seat: z.string().max(STRING_LIMITS.SHORT).optional(),
      price: z.number().min(0).optional()
    }).passthrough().optional()
  })).min(1).max(100, 'Maximum 100 tickets per batch')
});

export type BatchMintRequest = z.infer<typeof batchMintSchema>;

/**
 * Mint query parameters schema
 */
export const mintQuerySchema = z.object({
  status: z.enum(['pending', 'minting', 'completed', 'failed']).optional(),
  tenant_id: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export type MintQueryParams = z.infer<typeof mintQuerySchema>;

/**
 * Reconciliation request schema
 */
export const reconcileSchema = z.object({
  ticketIds: z.array(uuidSchema).min(1).max(1000, 'Maximum 1000 tickets per reconciliation')
});

export type ReconcileRequest = z.infer<typeof reconcileSchema>;

/**
 * DLQ requeue request schema
 */
export const dlqRequeueSchema = z.object({
  jobIds: z.array(z.string().max(STRING_LIMITS.DEFAULT)).min(1).max(100)
});

export type DLQRequeueRequest = z.infer<typeof dlqRequeueSchema>;

// =============================================================================
// NFT METADATA SCHEMAS (Metaplex standard)
// =============================================================================

/**
 * NFT attribute schema
 */
export const nftAttributeSchema = z.object({
  trait_type: z.string().min(1).max(STRING_LIMITS.NAME),
  value: z.union([
    z.string().max(STRING_LIMITS.NAME),
    z.number()
  ]),
  display_type: z.string().max(STRING_LIMITS.SHORT).optional()
});

/**
 * NFT file schema
 */
export const nftFileSchema = z.object({
  uri: z.string().url().max(STRING_LIMITS.URL),
  type: z.string().max(STRING_LIMITS.SHORT),
  cdn: z.boolean().optional()
});

/**
 * NFT properties schema
 */
export const nftPropertiesSchema = z.object({
  files: z.array(nftFileSchema).max(10).optional(),
  category: z.string().max(STRING_LIMITS.SHORT).optional(),
  creators: z.array(z.object({
    address: z.string().min(32).max(64),
    share: z.number().int().min(0).max(100)
  })).max(5).optional()
});

/**
 * Full NFT metadata schema (Metaplex standard)
 */
export const nftMetadataSchema = z.object({
  name: z.string().min(1).max(STRING_LIMITS.NAME),
  symbol: z.string().min(1).max(STRING_LIMITS.SYMBOL),
  description: z.string().max(STRING_LIMITS.DESCRIPTION).optional(),
  image: z.string().url().max(STRING_LIMITS.URL),
  animation_url: z.string().url().max(STRING_LIMITS.URL).optional(),
  external_url: z.string().url().max(STRING_LIMITS.URL).optional(),
  attributes: z.array(nftAttributeSchema).max(50).optional(),
  properties: nftPropertiesSchema.optional(),
  seller_fee_basis_points: z.number().int().min(0).max(10000).optional(),
  collection: z.object({
    name: z.string().max(STRING_LIMITS.NAME).optional(),
    family: z.string().max(STRING_LIMITS.NAME).optional()
  }).optional()
});

export type NFTMetadata = z.infer<typeof nftMetadataSchema>;

// =============================================================================
// WEBHOOK SCHEMAS
// =============================================================================

/**
 * Webhook payload for mint events
 */
export const webhookMintPayloadSchema = z.object({
  event: z.enum(['ticket.purchased', 'ticket.minted', 'ticket.failed']),
  ticketId: uuidSchema,
  orderId: uuidSchema.optional(),
  eventId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  tenantId: uuidSchema,
  timestamp: z.string().datetime().optional()
});

export type WebhookMintPayload = z.infer<typeof webhookMintPayloadSchema>;

// =============================================================================
// INTERNAL MINT SCHEMAS
// =============================================================================

/**
 * Internal mint request schema
 */
export const internalMintRequestSchema = z.object({
  ticket_id: uuidSchema,
  order_id: uuidSchema.optional(),
  event_id: uuidSchema.optional(),
  user_id: uuidSchema.optional(),
  tenant_id: uuidSchema,
  owner_address: z.string().min(32).max(64).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  metadata: ticketMetadataSchema.optional()
});

export type InternalMintRequest = z.infer<typeof internalMintRequestSchema>;

// =============================================================================
// VALIDATION HELPER FUNCTIONS
// =============================================================================

/**
 * Validate and parse data with a schema, throwing on error
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validate data, returning result with success/error
 */
export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): z.SafeParseReturnType<unknown, T> {
  return schema.safeParse(data);
}

/**
 * Format Zod validation errors for API responses
 */
export function formatValidationErrors(error: z.ZodError): {
  field: string;
  message: string;
}[] {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message
  }));
}
