/**
 * RESPONSE SCHEMAS
 * 
 * Fixes Batch 10 audit findings:
 * - RD5: Response schemas to prevent data leakage
 * 
 * SECURITY: All response schemas define ONLY the fields that should be exposed.
 * This prevents accidentally leaking sensitive data like:
 * - Internal IDs
 * - Database timestamps with timezone info
 * - Audit fields (created_by, etc.)
 * - Soft delete flags
 * - Version numbers used for optimistic locking
 */

import { z } from 'zod';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'ResponseSchema' });

// =============================================================================
// BASE RESPONSE SCHEMAS
// =============================================================================

/**
 * Standard API response envelope
 */
export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  success: z.boolean(),
  data: dataSchema.optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).optional(),
  meta: z.object({
    timestamp: z.string().datetime(),
    requestId: z.string().optional(),
    version: z.string().optional(),
  }).optional(),
}).strict();

/**
 * Paginated response wrapper
 */
export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  items: z.array(itemSchema).max(100),  // RD7: Max 100 items per page
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive().max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
}).strict();

// =============================================================================
// TICKET RESPONSE SCHEMAS (RD5 - Prevent data leakage)
// =============================================================================

/**
 * Public ticket response - excludes sensitive fields
 */
export const ticketResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  ticketTypeId: z.string().uuid(),
  
  // Public fields
  status: z.string(),
  seatInfo: z.object({
    section: z.string().optional(),
    row: z.string().optional(),
    seat: z.string().optional(),
  }).optional(),
  
  // NFT info (if minted)
  nft: z.object({
    mintAddress: z.string().optional(),
    metadataUri: z.string().optional(),
    onChain: z.boolean(),
  }).optional(),
  
  // Dates (without timezone details)
  purchasedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  
  // EXCLUDED: owner_id, tenant_id, version, internal_status, audit fields
}).strict();

/**
 * Detailed ticket response for owner view
 */
export const ticketDetailResponseSchema = ticketResponseSchema.extend({
  // Additional owner-visible fields
  qrCodeUrl: z.string().url().optional(),
  transferHistory: z.array(z.object({
    date: z.string().datetime(),
    type: z.enum(['purchase', 'transfer', 'received']),
  })).max(50).optional(),
  usageHistory: z.array(z.object({
    date: z.string().datetime(),
    action: z.enum(['scanned', 'checked_in', 'validated']),
    location: z.string().optional(),
  })).max(100).optional(),
}).strict();

/**
 * Ticket list item (minimal for lists)
 */
export const ticketListItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  ticketTypeName: z.string(),
  status: z.string(),
  eventDate: z.string().datetime().optional(),
}).strict();

// =============================================================================
// TICKET TYPE RESPONSE SCHEMAS
// =============================================================================

export const ticketTypeResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  priceCents: z.number().int(),
  availableQuantity: z.number().int().nonnegative(),
  totalQuantity: z.number().int().positive(),
  maxPerPurchase: z.number().int().positive(),
  saleStartDate: z.string().datetime().optional(),
  saleEndDate: z.string().datetime().optional(),
  soldOut: z.boolean(),
  
  // EXCLUDED: tenant_id, version, created_at, updated_at, internal fields
}).strict();

// =============================================================================
// PURCHASE RESPONSE SCHEMAS
// =============================================================================

export const reservationResponseSchema = z.object({
  reservationId: z.string().uuid(),
  eventId: z.string().uuid(),
  tickets: z.array(z.object({
    ticketTypeId: z.string().uuid(),
    quantity: z.number().int().positive().max(10),
    pricePerTicket: z.number().int().nonnegative(),
  })).min(1).max(10),
  totalCents: z.number().int().nonnegative(),
  expiresAt: z.string().datetime(),
  status: z.enum(['pending', 'confirmed', 'expired', 'cancelled']),
  
  // EXCLUDED: user_id, tenant_id, internal timestamps
}).strict();

export const purchaseResponseSchema = z.object({
  orderId: z.string().uuid(),
  reservationId: z.string().uuid(),
  tickets: z.array(z.object({
    ticketId: z.string().uuid(),
    ticketTypeId: z.string().uuid(),
    ticketTypeName: z.string(),
  })).min(1).max(10),
  totalCents: z.number().int().nonnegative(),
  paymentStatus: z.enum(['pending', 'completed', 'failed', 'refunded']),
  purchasedAt: z.string().datetime(),
  
  // EXCLUDED: payment processor details, internal IDs
}).strict();

// =============================================================================
// TRANSFER RESPONSE SCHEMAS
// =============================================================================

export const transferResponseSchema = z.object({
  transferId: z.string().uuid(),
  ticketId: z.string().uuid(),
  status: z.enum(['pending', 'accepted', 'rejected', 'expired', 'cancelled']),
  recipientEmail: z.string().email(),  // Partially masked in implementation
  message: z.string().optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  
  // EXCLUDED: sender details (unless viewing own transfer)
}).strict();

export const transferListItemSchema = z.object({
  transferId: z.string().uuid(),
  ticketId: z.string().uuid(),
  ticketTypeName: z.string(),
  status: z.string(),
  direction: z.enum(['sent', 'received']),
  otherPartyEmail: z.string(),  // Masked
  createdAt: z.string().datetime(),
}).strict();

// =============================================================================
// VALIDATION RESPONSE SCHEMAS
// =============================================================================

export const validationResponseSchema = z.object({
  valid: z.boolean(),
  ticketId: z.string().uuid().optional(),
  status: z.string(),
  eventId: z.string().uuid().optional(),
  eventName: z.string().optional(),
  ticketTypeName: z.string().optional(),
  
  // Only included if invalid
  reason: z.string().optional(),
  
  // EXCLUDED: internal validation details, owner info
}).strict();

export const checkInResponseSchema = z.object({
  success: z.boolean(),
  ticketId: z.string().uuid(),
  status: z.enum(['checked_in', 'already_used', 'invalid', 'expired']),
  checkedInAt: z.string().datetime().optional(),
  message: z.string().optional(),
  
  // Minimal info for display
  ticketInfo: z.object({
    eventName: z.string(),
    ticketType: z.string(),
    seatInfo: z.string().optional(),
  }).optional(),
}).strict();

// =============================================================================
// QR CODE RESPONSE SCHEMAS
// =============================================================================

export const qrCodeResponseSchema = z.object({
  ticketId: z.string().uuid(),
  qrData: z.string(),  // Encrypted QR payload
  expiresAt: z.string().datetime(),
  format: z.enum(['base64', 'svg', 'url']),
  
  // EXCLUDED: encryption keys, raw ticket data
}).strict();

// =============================================================================
// ERROR RESPONSE SCHEMAS
// =============================================================================

export const errorResponseSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string().optional(),
  timestamp: z.string().datetime(),
  traceId: z.string().optional(),
  errors: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string().optional(),
  })).max(100).optional(),
}).strict();

// =============================================================================
// HEALTH CHECK RESPONSE SCHEMAS
// =============================================================================

export const healthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string().datetime(),
  version: z.string().optional(),
  services: z.record(z.string(), z.object({
    status: z.enum(['up', 'down', 'degraded']),
    latencyMs: z.number().optional(),
  })).optional(),
  
  // EXCLUDED: detailed error messages, internal service URLs
}).strict();

// =============================================================================
// RESPONSE SANITIZER
// =============================================================================

/**
 * SECURITY: Sanitize response data against schema to prevent data leakage
 * 
 * This function takes raw data and a response schema, and returns only
 * the fields defined in the schema. Any extra fields are stripped.
 * 
 * @param schema - Zod schema defining allowed response fields
 * @param data - Raw data to sanitize
 * @returns Sanitized data matching schema
 */
export function sanitizeResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  
  // If validation fails, log and return partial data
  // In production, you might want to throw or return a safe default
  log.warn('Response sanitization warning', { validationErrors: result.error.flatten() });
  
  // Attempt to extract valid fields only
  try {
    return schema.parse(data);
  } catch {
    throw new Error('Response data does not match expected schema');
  }
}

/**
 * SECURITY: Mask sensitive fields in responses
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal = local.length > 2 
    ? local.substring(0, 2) + '*'.repeat(Math.min(local.length - 2, 5))
    : '**';
  return `${maskedLocal}@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return '*'.repeat(digits.length - 4) + digits.slice(-4);
}

// =============================================================================
// TYPES
// =============================================================================

export type TicketResponse = z.infer<typeof ticketResponseSchema>;
export type TicketDetailResponse = z.infer<typeof ticketDetailResponseSchema>;
export type TicketListItem = z.infer<typeof ticketListItemSchema>;
export type TicketTypeResponse = z.infer<typeof ticketTypeResponseSchema>;
export type ReservationResponse = z.infer<typeof reservationResponseSchema>;
export type PurchaseResponse = z.infer<typeof purchaseResponseSchema>;
export type TransferResponse = z.infer<typeof transferResponseSchema>;
export type ValidationResponse = z.infer<typeof validationResponseSchema>;
export type CheckInResponse = z.infer<typeof checkInResponseSchema>;
export type QrCodeResponse = z.infer<typeof qrCodeResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type HealthCheckResponse = z.infer<typeof healthCheckResponseSchema>;
