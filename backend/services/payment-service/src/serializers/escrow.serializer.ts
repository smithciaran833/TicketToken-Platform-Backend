/**
 * ESCROW SERIALIZER - Single Source of Truth for Safe Escrow Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning escrow data.
 *
 * NEVER ADD TO SAFE_ESCROW_FIELDS:
 * - payment_intent_id (internal Stripe identifier)
 * - stripe_account_id (Stripe Connect identifier)
 * - release_conditions (internal business logic)
 *
 * Pattern for controllers:
 * 1. Import { serializeEscrow, SAFE_ESCROW_SELECT } from '../serializers/escrow.serializer'
 * 2. Use SAFE_ESCROW_SELECT in SQL queries
 * 3. Use serializeEscrow() before returning: reply.send({ escrow: serializeEscrow(escrow) })
 */

/**
 * SAFE_ESCROW_FIELDS - The canonical list of fields safe to return to clients.
 */
export const SAFE_ESCROW_FIELDS = [
  'id',
  'tenant_id',
  'order_id',
  'amount',
  'held_amount',
  'released_amount',
  'status',
  'hold_until',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_ESCROW_SELECT - SQL-ready comma-separated field list.
 */
export const SAFE_ESCROW_SELECT = SAFE_ESCROW_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 */
export const FORBIDDEN_ESCROW_FIELDS = [
  // CRITICAL - Payment Processor Data
  'payment_intent_id',
  'stripe_account_id',

  // HIGH RISK - Internal Business Logic
  'release_conditions',

  // MEDIUM RISK - Internal tracking
  'metadata',
] as const;

/**
 * ADMIN_ESCROW_FIELDS - Extended fields for admin/internal use.
 */
export const ADMIN_ESCROW_FIELDS = [
  ...SAFE_ESCROW_FIELDS,
  'payment_intent_id',
  'release_conditions',
] as const;

export const ADMIN_ESCROW_SELECT = ADMIN_ESCROW_FIELDS.join(', ');

/**
 * Type for a safely serialized escrow object.
 */
export type SafeEscrow = {
  id: string;
  tenantId: string;
  orderId: string;
  amount: number;
  heldAmount: number;
  releasedAmount: number;
  status: string;
  holdUntil: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Type for admin escrow view
 */
export type AdminEscrow = SafeEscrow & {
  paymentIntentId?: string | null;
  releaseConditions?: string[] | null;
};

/**
 * Serializes an escrow object to include ONLY safe fields.
 *
 * @param escrow - Raw escrow object from database
 * @returns SafeEscrow with only allowed fields (camelCase keys)
 */
export function serializeEscrow(escrow: Record<string, any>): SafeEscrow {
  if (!escrow) {
    throw new Error('Cannot serialize null or undefined escrow');
  }

  return {
    id: escrow.id,
    tenantId: escrow.tenant_id || escrow.tenantId,
    orderId: escrow.order_id || escrow.orderId,
    amount: typeof escrow.amount === 'string' ? parseInt(escrow.amount, 10) : escrow.amount,
    heldAmount: typeof escrow.held_amount === 'string' ? parseInt(escrow.held_amount, 10) : (escrow.held_amount || escrow.heldAmount || 0),
    releasedAmount: typeof escrow.released_amount === 'string' ? parseInt(escrow.released_amount, 10) : (escrow.released_amount || escrow.releasedAmount || 0),
    status: escrow.status,
    holdUntil: escrow.hold_until || escrow.holdUntil,
    createdAt: escrow.created_at || escrow.createdAt,
    updatedAt: escrow.updated_at || escrow.updatedAt,
  };
}

/**
 * Serializes an array of escrows.
 */
export function serializeEscrows(escrows: Record<string, any>[]): SafeEscrow[] {
  if (!escrows) {
    return [];
  }
  return escrows.map(serializeEscrow);
}

/**
 * Serializes an escrow for admin/internal views.
 */
export function serializeEscrowAdmin(escrow: Record<string, any>): AdminEscrow {
  if (!escrow) {
    throw new Error('Cannot serialize null or undefined escrow');
  }

  const safe = serializeEscrow(escrow);

  return {
    ...safe,
    paymentIntentId: escrow.payment_intent_id || escrow.paymentIntentId || null,
    releaseConditions: escrow.release_conditions || escrow.releaseConditions || null,
  };
}

/**
 * Serializes escrows for admin/internal views.
 */
export function serializeEscrowsAdmin(escrows: Record<string, any>[]): AdminEscrow[] {
  if (!escrows) {
    return [];
  }
  return escrows.map(serializeEscrowAdmin);
}

/**
 * Serializes an escrow for list/summary views.
 */
export function serializeEscrowSummary(escrow: Record<string, any>): Pick<
  SafeEscrow,
  'id' | 'orderId' | 'amount' | 'status' | 'holdUntil'
> {
  if (!escrow) {
    throw new Error('Cannot serialize null or undefined escrow');
  }

  return {
    id: escrow.id,
    orderId: escrow.order_id || escrow.orderId,
    amount: typeof escrow.amount === 'string' ? parseInt(escrow.amount, 10) : escrow.amount,
    status: escrow.status,
    holdUntil: escrow.hold_until || escrow.holdUntil,
  };
}

/**
 * Validates that a response object contains no forbidden fields.
 */
export function findForbiddenEscrowFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  for (const field of FORBIDDEN_ESCROW_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  const camelCaseForbidden = [
    'paymentIntentId',
    'stripeAccountId',
    'releaseConditions',
    'metadata',
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
export function findMissingSafeEscrowFields(obj: Record<string, any>): string[] {
  const required = ['id', 'tenantId', 'orderId', 'amount', 'status'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
