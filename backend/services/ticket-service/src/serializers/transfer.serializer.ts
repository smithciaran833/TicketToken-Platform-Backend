/**
 * TRANSFER SERIALIZER - Single Source of Truth for Safe Transfer Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning transfer data.
 *
 * NEVER ADD TO SAFE_TRANSFER_FIELDS:
 * - acceptance_code (transfer authorization secret)
 * - transfer_code (transfer authorization secret)
 * - to_email (PII - recipient email)
 * - from_user_id, to_user_id (user tracking)
 *
 * Pattern for controllers:
 * 1. Import { serializeTransfer, SAFE_TRANSFER_SELECT } from '../serializers'
 * 2. Use SAFE_TRANSFER_SELECT in SQL queries: db('ticket_transfers').select(db.raw(SAFE_TRANSFER_SELECT))
 * 3. Use serializeTransfer() before returning: reply.send({ transfer: serializeTransfer(transfer) })
 */

/**
 * SAFE_TRANSFER_FIELDS - The canonical list of fields safe to return to clients.
 *
 * These fields are carefully selected to:
 * - Provide necessary transfer information for UI display
 * - NOT expose transfer authorization codes
 * - NOT expose recipient PII (email)
 * - NOT expose user IDs for tracking
 */
export const SAFE_TRANSFER_FIELDS = [
  'id',
  'ticket_id',
  'status',
  'transfer_type',
  'transfer_method',
  'is_gift',
  'expires_at',
  'transferred_at',
  'blockchain_transferred_at',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_TRANSFER_SELECT - SQL-ready comma-separated field list.
 * Use in Knex queries: db('ticket_transfers').select(db.raw(SAFE_TRANSFER_SELECT))
 * Use in raw SQL: `SELECT ${SAFE_TRANSFER_SELECT} FROM ticket_transfers WHERE ...`
 */
export const SAFE_TRANSFER_SELECT = SAFE_TRANSFER_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 * Used for testing and documentation purposes.
 */
export const FORBIDDEN_TRANSFER_FIELDS = [
  // CRITICAL - Transfer authorization secrets
  'acceptance_code',
  'transfer_code',

  // HIGH RISK - PII
  'to_email',

  // HIGH RISK - User tracking
  'from_user_id',
  'to_user_id',

  // MEDIUM RISK - Private messages
  'message',
  'notes',
  'cancellation_reason',

  // MEDIUM RISK - Financial data
  'price_cents',
  'currency',

  // MEDIUM RISK - Internal tracking
  'tenant_id',
  'accepted_at',
  'cancelled_at',
] as const;

/**
 * Type for a safely serialized transfer object.
 */
export type SafeTransfer = {
  id: string;
  ticketId: string;
  status: string;
  transferType?: string | null;
  transferMethod: string;
  isGift: boolean;
  expiresAt: Date | string;
  transferredAt?: Date | string | null;
  blockchainTransferredAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Type for transfer serialized for the sender (includes masked email).
 */
export type SafeTransferForSender = SafeTransfer & {
  recipientEmailMasked?: string | null;
};

/**
 * Serializes a transfer object to include ONLY safe fields.
 * This is the LAST LINE OF DEFENSE against data leakage.
 *
 * Even if a SQL query returns extra fields, this function
 * ensures only safe fields are included in the response.
 *
 * @param transfer - Raw transfer object from database
 * @returns SafeTransfer with only allowed fields (camelCase keys)
 *
 * @example
 * const transfer = await db('ticket_transfers').where('id', transferId).first();
 * return reply.send({ transfer: serializeTransfer(transfer) });
 */
export function serializeTransfer(transfer: Record<string, any>): SafeTransfer {
  if (!transfer) {
    throw new Error('Cannot serialize null or undefined transfer');
  }

  return {
    id: transfer.id,
    ticketId: transfer.ticket_id,
    status: transfer.status || 'pending',
    transferType: transfer.transfer_type ?? null,
    transferMethod: transfer.transfer_method || 'direct',
    isGift: transfer.is_gift ?? true,
    expiresAt: transfer.expires_at,
    transferredAt: transfer.transferred_at ?? null,
    blockchainTransferredAt: transfer.blockchain_transferred_at ?? null,
    createdAt: transfer.created_at,
    updatedAt: transfer.updated_at,
  };
}

/**
 * Serializes a transfer for the sender - includes masked recipient email.
 * Use this ONLY when returning transfer data to its sender.
 *
 * @param transfer - Raw transfer object from database
 * @returns SafeTransferForSender with masked email included
 */
export function serializeTransferForSender(transfer: Record<string, any>): SafeTransferForSender {
  if (!transfer) {
    throw new Error('Cannot serialize null or undefined transfer');
  }

  return {
    ...serializeTransfer(transfer),
    recipientEmailMasked: transfer.to_email ? maskEmail(transfer.to_email) : null,
  };
}

/**
 * Serializes an array of transfers.
 *
 * @param transfers - Array of raw transfer objects from database
 * @returns Array of SafeTransfer objects
 */
export function serializeTransfers(transfers: Record<string, any>[]): SafeTransfer[] {
  if (!transfers) {
    return [];
  }
  return transfers.map(serializeTransfer);
}

/**
 * Serializes an array of transfers for the sender.
 *
 * @param transfers - Array of raw transfer objects from database
 * @returns Array of SafeTransferForSender objects
 */
export function serializeTransfersForSender(transfers: Record<string, any>[]): SafeTransferForSender[] {
  if (!transfers) {
    return [];
  }
  return transfers.map(serializeTransferForSender);
}

/**
 * Serializes a transfer for list/summary views with fewer fields.
 * Use this for index/search results where full details aren't needed.
 */
export function serializeTransferSummary(transfer: Record<string, any>): Pick<
  SafeTransfer,
  'id' | 'ticketId' | 'status' | 'isGift' | 'createdAt'
> {
  if (!transfer) {
    throw new Error('Cannot serialize null or undefined transfer');
  }

  return {
    id: transfer.id,
    ticketId: transfer.ticket_id,
    status: transfer.status || 'pending',
    isGift: transfer.is_gift ?? true,
    createdAt: transfer.created_at,
  };
}

/**
 * Masks an email address for display.
 * Example: "john.doe@example.com" becomes "jo*****@example.com"
 */
export function maskEmail(email: string): string {
  if (!email) return '';

  const [local, domain] = email.split('@');
  if (!domain) return '***';

  const maskedLocal = local.length > 2
    ? local.substring(0, 2) + '*'.repeat(Math.min(local.length - 2, 5))
    : '**';

  return `${maskedLocal}@${domain}`;
}

/**
 * Validates that a response object contains no forbidden fields.
 * Use in tests to verify serialization is working correctly.
 *
 * @param obj - Object to check
 * @returns Array of forbidden fields found (empty if safe)
 */
export function findForbiddenTransferFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  // Check snake_case versions (from DB)
  for (const field of FORBIDDEN_TRANSFER_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  // Also check camelCase versions (from transformed response)
  const camelCaseForbidden = [
    'acceptanceCode', 'transferCode', 'toEmail', 'fromUserId',
    'toUserId', 'message', 'notes', 'cancellationReason',
    'priceCents', 'currency', 'tenantId', 'acceptedAt', 'cancelledAt',
  ];

  for (const field of camelCaseForbidden) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  return found;
}

/**
 * Validates that a response object contains all required safe fields.
 * Use in tests to verify serialization is working correctly.
 *
 * @param obj - Object to check
 * @returns Array of missing required fields (empty if complete)
 */
export function findMissingSafeTransferFields(obj: Record<string, any>): string[] {
  const required = ['id', 'ticketId', 'status', 'transferMethod'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
