/**
 * REFUND SERIALIZER - Single Source of Truth for Safe Refund Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning refund data.
 *
 * PCI-DSS COMPLIANCE:
 * - Stripe refund IDs are internal identifiers and should not be exposed
 * - Transaction mapping data should be filtered
 *
 * NEVER ADD TO SAFE_REFUND_FIELDS:
 * - stripe_refund_id (internal Stripe identifier)
 * - idempotency_key (internal system field)
 * - metadata (may contain sensitive internal data)
 *
 * Pattern for controllers:
 * 1. Import { serializeRefund, SAFE_REFUND_SELECT } from '../serializers/refund.serializer'
 * 2. Use SAFE_REFUND_SELECT in SQL queries
 * 3. Use serializeRefund() before returning: reply.send({ refund: serializeRefund(refund) })
 */

/**
 * SAFE_REFUND_FIELDS - The canonical list of fields safe to return to clients.
 */
export const SAFE_REFUND_FIELDS = [
  'id',
  'tenant_id',
  'transaction_id',
  'amount',
  'reason',
  'status',
  'created_at',
  'completed_at',
  'updated_at',
] as const;

/**
 * SAFE_REFUND_SELECT - SQL-ready comma-separated field list.
 */
export const SAFE_REFUND_SELECT = SAFE_REFUND_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 */
export const FORBIDDEN_REFUND_FIELDS = [
  // CRITICAL - Payment Processor Data
  'stripe_refund_id',

  // HIGH RISK - Internal System Fields
  'idempotency_key',
  'metadata',

  // MEDIUM RISK - Internal tracking
  'ticket_ids', // Internal tracking, not for public API
  'ticket_id',  // Internal tracking
] as const;

/**
 * ADMIN_REFUND_FIELDS - Extended fields for admin/internal use.
 */
export const ADMIN_REFUND_FIELDS = [
  ...SAFE_REFUND_FIELDS,
  'stripe_refund_id', // Admin can see Stripe ID for debugging
  'ticket_ids',
] as const;

export const ADMIN_REFUND_SELECT = ADMIN_REFUND_FIELDS.join(', ');

/**
 * Type for a safely serialized refund object.
 */
export type SafeRefund = {
  id: string;
  tenantId: string;
  transactionId: string;
  amount: number;
  reason?: string | null;
  status: string;
  createdAt: Date | string;
  completedAt?: Date | string | null;
  updatedAt: Date | string;
};

/**
 * Type for admin refund view
 */
export type AdminRefund = SafeRefund & {
  stripeRefundId?: string | null;
  ticketIds?: string[] | null;
};

/**
 * Serializes a refund object to include ONLY safe fields.
 *
 * @param refund - Raw refund object from database
 * @returns SafeRefund with only allowed fields (camelCase keys)
 */
export function serializeRefund(refund: Record<string, any>): SafeRefund {
  if (!refund) {
    throw new Error('Cannot serialize null or undefined refund');
  }

  return {
    id: refund.id,
    tenantId: refund.tenant_id,
    transactionId: refund.transaction_id,
    amount: typeof refund.amount === 'string' ? parseInt(refund.amount, 10) : refund.amount,
    reason: refund.reason ?? null,
    status: refund.status,
    createdAt: refund.created_at,
    completedAt: refund.completed_at ?? null,
    updatedAt: refund.updated_at,
  };
}

/**
 * Serializes an array of refunds.
 */
export function serializeRefunds(refunds: Record<string, any>[]): SafeRefund[] {
  if (!refunds) {
    return [];
  }
  return refunds.map(serializeRefund);
}

/**
 * Serializes a refund for admin/internal views.
 */
export function serializeRefundAdmin(refund: Record<string, any>): AdminRefund {
  if (!refund) {
    throw new Error('Cannot serialize null or undefined refund');
  }

  const safe = serializeRefund(refund);

  return {
    ...safe,
    stripeRefundId: refund.stripe_refund_id ?? null,
    ticketIds: refund.ticket_ids ?? null,
  };
}

/**
 * Serializes refunds for admin/internal views.
 */
export function serializeRefundsAdmin(refunds: Record<string, any>[]): AdminRefund[] {
  if (!refunds) {
    return [];
  }
  return refunds.map(serializeRefundAdmin);
}

/**
 * Serializes a refund for list/summary views.
 */
export function serializeRefundSummary(refund: Record<string, any>): Pick<
  SafeRefund,
  'id' | 'amount' | 'status' | 'createdAt'
> {
  if (!refund) {
    throw new Error('Cannot serialize null or undefined refund');
  }

  return {
    id: refund.id,
    amount: typeof refund.amount === 'string' ? parseInt(refund.amount, 10) : refund.amount,
    status: refund.status,
    createdAt: refund.created_at,
  };
}

/**
 * Validates that a response object contains no forbidden fields.
 */
export function findForbiddenRefundFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  for (const field of FORBIDDEN_REFUND_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  const camelCaseForbidden = [
    'stripeRefundId',
    'idempotencyKey',
    'metadata',
    'ticketIds',
    'ticketId',
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
 */
export function findMissingSafeRefundFields(obj: Record<string, any>): string[] {
  const required = ['id', 'tenantId', 'transactionId', 'amount', 'status'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
