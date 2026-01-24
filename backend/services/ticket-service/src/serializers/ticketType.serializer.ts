/**
 * TICKET TYPE SERIALIZER - Single Source of Truth for Safe TicketType Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning ticket type data.
 *
 * NEVER ADD TO SAFE_TICKET_TYPE_FIELDS:
 * - sold_quantity (business intelligence)
 * - reserved_quantity (business intelligence)
 * - cost_basis (internal pricing)
 * - profit_margin (business confidential)
 *
 * Pattern for controllers:
 * 1. Import { serializeTicketType, SAFE_TICKET_TYPE_SELECT } from '../serializers'
 * 2. Use SAFE_TICKET_TYPE_SELECT in SQL queries
 * 3. Use serializeTicketType() before returning
 */

/**
 * SAFE_TICKET_TYPE_FIELDS - The canonical list of fields safe to return to clients.
 *
 * These fields are carefully selected to:
 * - Provide necessary ticket type information for UI display
 * - NOT expose internal sales metrics
 * - NOT expose cost/profit data
 */
export const SAFE_TICKET_TYPE_FIELDS = [
  'id',
  'event_id',
  'name',
  'description',
  'category',
  'price',
  'quantity',
  'available_quantity',
  'min_purchase',
  'max_purchase',
  'sale_start',
  'sale_end',
  'is_active',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_TICKET_TYPE_SELECT - SQL-ready comma-separated field list.
 * Use in Knex queries: db('ticket_types').select(db.raw(SAFE_TICKET_TYPE_SELECT))
 * Use in raw SQL: `SELECT ${SAFE_TICKET_TYPE_SELECT} FROM ticket_types WHERE ...`
 */
export const SAFE_TICKET_TYPE_SELECT = SAFE_TICKET_TYPE_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 * Used for testing and documentation purposes.
 */
export const FORBIDDEN_TICKET_TYPE_FIELDS = [
  // HIGH RISK - Business intelligence
  'sold_quantity',
  'reserved_quantity',

  // HIGH RISK - Internal pricing
  'cost_basis',
  'profit_margin',
  'commission_rate',
  'platform_fee_cents',

  // MEDIUM RISK - Internal tracking
  'tenant_id',
  'metadata',
  'created_by',
  'updated_by',
  'deleted_at',
  'version',
] as const;

/**
 * Type for a safely serialized ticket type object.
 */
export type SafeTicketType = {
  id: string;
  eventId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price: number;
  quantity: number;
  availableQuantity: number;
  minPurchase: number;
  maxPurchase: number;
  saleStart?: Date | string | null;
  saleEnd?: Date | string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Serializes a ticket type object to include ONLY safe fields.
 * This is the LAST LINE OF DEFENSE against data leakage.
 *
 * Even if a SQL query returns extra fields, this function
 * ensures only safe fields are included in the response.
 *
 * @param ticketType - Raw ticket type object from database
 * @returns SafeTicketType with only allowed fields (camelCase keys)
 *
 * @example
 * const ticketType = await db('ticket_types').where('id', ticketTypeId).first();
 * return reply.send({ ticketType: serializeTicketType(ticketType) });
 */
export function serializeTicketType(ticketType: Record<string, any>): SafeTicketType {
  if (!ticketType) {
    throw new Error('Cannot serialize null or undefined ticket type');
  }

  return {
    id: ticketType.id,
    eventId: ticketType.event_id,
    name: ticketType.name,
    description: ticketType.description ?? null,
    category: ticketType.category ?? null,
    price: Number(ticketType.price) || 0,
    quantity: ticketType.quantity ?? 0,
    availableQuantity: ticketType.available_quantity ?? 0,
    minPurchase: ticketType.min_purchase ?? 1,
    maxPurchase: ticketType.max_purchase ?? 10,
    saleStart: ticketType.sale_start ?? null,
    saleEnd: ticketType.sale_end ?? null,
    isActive: ticketType.is_active ?? true,
    createdAt: ticketType.created_at,
    updatedAt: ticketType.updated_at,
  };
}

/**
 * Serializes an array of ticket types.
 *
 * @param ticketTypes - Array of raw ticket type objects from database
 * @returns Array of SafeTicketType objects
 */
export function serializeTicketTypes(ticketTypes: Record<string, any>[]): SafeTicketType[] {
  if (!ticketTypes) {
    return [];
  }
  return ticketTypes.map(serializeTicketType);
}

/**
 * Serializes a ticket type for list/summary views with fewer fields.
 * Use this for index/search results where full details aren't needed.
 */
export function serializeTicketTypeSummary(ticketType: Record<string, any>): Pick<
  SafeTicketType,
  'id' | 'eventId' | 'name' | 'price' | 'availableQuantity' | 'isActive'
> {
  if (!ticketType) {
    throw new Error('Cannot serialize null or undefined ticket type');
  }

  return {
    id: ticketType.id,
    eventId: ticketType.event_id,
    name: ticketType.name,
    price: Number(ticketType.price) || 0,
    availableQuantity: ticketType.available_quantity ?? 0,
    isActive: ticketType.is_active ?? true,
  };
}

/**
 * Validates that a response object contains no forbidden fields.
 * Use in tests to verify serialization is working correctly.
 *
 * @param obj - Object to check
 * @returns Array of forbidden fields found (empty if safe)
 */
export function findForbiddenTicketTypeFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  // Check snake_case versions (from DB)
  for (const field of FORBIDDEN_TICKET_TYPE_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  // Also check camelCase versions (from transformed response)
  const camelCaseForbidden = [
    'soldQuantity', 'reservedQuantity', 'costBasis', 'profitMargin',
    'commissionRate', 'platformFeeCents', 'tenantId', 'metadata',
    'createdBy', 'updatedBy', 'deletedAt', 'version',
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
export function findMissingSafeTicketTypeFields(obj: Record<string, any>): string[] {
  const required = ['id', 'eventId', 'name', 'price', 'availableQuantity'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
