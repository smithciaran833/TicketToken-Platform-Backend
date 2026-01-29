/**
 * TRANSACTION SERIALIZER - Single Source of Truth for Safe Transaction Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning transaction data.
 *
 * PCI-DSS COMPLIANCE:
 * - Payment method fingerprints and device fingerprints are NEVER exposed
 * - Stripe/PayPal identifiers are NEVER exposed to end users
 * - Internal fee calculations (platform_fee, venue_payout) are business secrets
 *
 * NEVER ADD TO SAFE_TRANSACTION_FIELDS:
 * - stripe_payment_intent_id, stripe_charge_id, paypal_order_id
 * - device_fingerprint, payment_method_fingerprint
 * - platform_fee, venue_payout, gas_fee_paid
 * - idempotency_key, metadata (unless filtered)
 *
 * Pattern for controllers:
 * 1. Import { serializeTransaction, SAFE_TRANSACTION_SELECT } from '../serializers/transaction.serializer'
 * 2. Use SAFE_TRANSACTION_SELECT in SQL queries: pool.query(`SELECT ${SAFE_TRANSACTION_SELECT} FROM payment_transactions`)
 * 3. Use serializeTransaction() before returning: reply.send({ transaction: serializeTransaction(transaction) })
 */

/**
 * SAFE_TRANSACTION_FIELDS - The canonical list of fields safe to return to clients.
 *
 * These fields are carefully selected to:
 * - Provide necessary transaction information for UI display
 * - NOT expose payment processor credentials (Stripe, PayPal)
 * - NOT expose device/fingerprint tracking data
 * - NOT expose internal fee calculations
 */
export const SAFE_TRANSACTION_FIELDS = [
  'id',
  'tenant_id',
  'user_id',
  'event_id',
  'order_id',
  'venue_id',
  'type',
  'amount',
  'currency',
  'status',
  'description',
  'tax_amount',
  'total_amount',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_TRANSACTION_SELECT - SQL-ready comma-separated field list.
 * Use in raw SQL: `SELECT ${SAFE_TRANSACTION_SELECT} FROM payment_transactions WHERE ...`
 */
export const SAFE_TRANSACTION_SELECT = SAFE_TRANSACTION_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 * Used for testing and documentation purposes.
 */
export const FORBIDDEN_TRANSACTION_FIELDS = [
  // CRITICAL - Payment Processor Data (PCI-DSS sensitive)
  'stripe_payment_intent_id',
  'stripe_charge_id',
  'paypal_order_id',

  // CRITICAL - Device/Fraud Tracking Data
  'device_fingerprint',
  'payment_method_fingerprint',

  // HIGH RISK - Internal Business Logic
  'platform_fee',
  'venue_payout',
  'gas_fee_paid',

  // HIGH RISK - Internal System Fields
  'idempotency_key',
  'metadata', // May contain sensitive internal data

  // MEDIUM RISK - Soft delete
  'deleted_at',
] as const;

/**
 * ADMIN_TRANSACTION_FIELDS - Extended fields for admin/internal use.
 * Still excludes device fingerprints and payment processor secrets.
 */
export const ADMIN_TRANSACTION_FIELDS = [
  ...SAFE_TRANSACTION_FIELDS,
  'platform_fee',
  'venue_payout',
  'gas_fee_paid',
  // Note: Still NOT including stripe_*, device_fingerprint, payment_method_fingerprint
] as const;

export const ADMIN_TRANSACTION_SELECT = ADMIN_TRANSACTION_FIELDS.join(', ');

/**
 * Type for a safely serialized transaction object.
 */
export type SafeTransaction = {
  id: string;
  tenantId: string;
  userId: string;
  eventId: string;
  orderId?: string | null;
  venueId: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description?: string | null;
  taxAmount?: number | null;
  totalAmount?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Type for admin transaction view (includes fees but not fingerprints)
 */
export type AdminTransaction = SafeTransaction & {
  platformFee: number;
  venuePayout: number;
  gasFeePaid?: number | null;
};

/**
 * Serializes a transaction object to include ONLY safe fields.
 * This is the LAST LINE OF DEFENSE against data leakage.
 *
 * Even if a SQL query returns extra fields, this function
 * ensures only safe fields are included in the response.
 *
 * @param transaction - Raw transaction object from database
 * @returns SafeTransaction with only allowed fields (camelCase keys)
 *
 * @example
 * const transaction = await pool.query('SELECT * FROM payment_transactions WHERE id = $1', [id]);
 * return reply.send({ transaction: serializeTransaction(transaction.rows[0]) });
 */
export function serializeTransaction(transaction: Record<string, any>): SafeTransaction {
  if (!transaction) {
    throw new Error('Cannot serialize null or undefined transaction');
  }

  return {
    id: transaction.id,
    tenantId: transaction.tenant_id,
    userId: transaction.user_id,
    eventId: transaction.event_id,
    orderId: transaction.order_id ?? null,
    venueId: transaction.venue_id,
    type: transaction.type,
    amount: typeof transaction.amount === 'string' ? parseInt(transaction.amount, 10) : transaction.amount,
    currency: transaction.currency || 'USD',
    status: transaction.status,
    description: transaction.description ?? null,
    taxAmount: transaction.tax_amount ? (typeof transaction.tax_amount === 'string' ? parseInt(transaction.tax_amount, 10) : transaction.tax_amount) : null,
    totalAmount: transaction.total_amount ? (typeof transaction.total_amount === 'string' ? parseInt(transaction.total_amount, 10) : transaction.total_amount) : null,
    createdAt: transaction.created_at,
    updatedAt: transaction.updated_at,
  };
}

/**
 * Serializes an array of transactions.
 *
 * @param transactions - Array of raw transaction objects from database
 * @returns Array of SafeTransaction objects
 */
export function serializeTransactions(transactions: Record<string, any>[]): SafeTransaction[] {
  if (!transactions) {
    return [];
  }
  return transactions.map(serializeTransaction);
}

/**
 * Serializes a transaction for admin/internal views.
 * Includes fee breakdown but still excludes fingerprints and Stripe IDs.
 *
 * @param transaction - Raw transaction object from database
 * @returns AdminTransaction with fee fields included
 */
export function serializeTransactionAdmin(transaction: Record<string, any>): AdminTransaction {
  if (!transaction) {
    throw new Error('Cannot serialize null or undefined transaction');
  }

  const safe = serializeTransaction(transaction);

  return {
    ...safe,
    platformFee: typeof transaction.platform_fee === 'string' ? parseInt(transaction.platform_fee, 10) : (transaction.platform_fee || 0),
    venuePayout: typeof transaction.venue_payout === 'string' ? parseInt(transaction.venue_payout, 10) : (transaction.venue_payout || 0),
    gasFeePaid: transaction.gas_fee_paid ? (typeof transaction.gas_fee_paid === 'string' ? parseInt(transaction.gas_fee_paid, 10) : transaction.gas_fee_paid) : null,
  };
}

/**
 * Serializes transactions for admin/internal views.
 *
 * @param transactions - Array of raw transaction objects
 * @returns Array of AdminTransaction objects
 */
export function serializeTransactionsAdmin(transactions: Record<string, any>[]): AdminTransaction[] {
  if (!transactions) {
    return [];
  }
  return transactions.map(serializeTransactionAdmin);
}

/**
 * Serializes a transaction for list/summary views with fewer fields.
 * Use this for transaction history lists where full details aren't needed.
 */
export function serializeTransactionSummary(transaction: Record<string, any>): Pick<
  SafeTransaction,
  'id' | 'type' | 'amount' | 'currency' | 'status' | 'createdAt'
> {
  if (!transaction) {
    throw new Error('Cannot serialize null or undefined transaction');
  }

  return {
    id: transaction.id,
    type: transaction.type,
    amount: typeof transaction.amount === 'string' ? parseInt(transaction.amount, 10) : transaction.amount,
    currency: transaction.currency || 'USD',
    status: transaction.status,
    createdAt: transaction.created_at,
  };
}

/**
 * Validates that a response object contains no forbidden fields.
 * Use in tests to verify serialization is working correctly.
 *
 * @param obj - Object to check
 * @returns Array of forbidden fields found (empty if safe)
 */
export function findForbiddenTransactionFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  // Check snake_case versions (from DB)
  for (const field of FORBIDDEN_TRANSACTION_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  // Also check camelCase versions (from transformed response)
  const camelCaseForbidden = [
    'stripePaymentIntentId',
    'stripeChargeId',
    'paypalOrderId',
    'deviceFingerprint',
    'paymentMethodFingerprint',
    'platformFee', // Only forbidden in public APIs, allowed in admin
    'venuePayout', // Only forbidden in public APIs, allowed in admin
    'gasFeePaid',  // Only forbidden in public APIs, allowed in admin
    'idempotencyKey',
    'metadata',
    'deletedAt',
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
export function findMissingSafeTransactionFields(obj: Record<string, any>): string[] {
  const required = ['id', 'tenantId', 'userId', 'eventId', 'venueId', 'type', 'amount', 'currency', 'status'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
