/**
 * TICKET SERIALIZER - Single Source of Truth for Safe Ticket Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning ticket data.
 *
 * NEVER ADD TO SAFE_TICKET_FIELDS:
 * - qr_code (ticket forgery risk - validation secret)
 * - payment_id (payment system correlation)
 * - user_id (only for own tickets via serializeTicketForOwner)
 * - price_cents, face_value (internal pricing data)
 * - validated_by (internal tracking)
 *
 * Pattern for controllers:
 * 1. Import { serializeTicket, SAFE_TICKET_SELECT } from '../serializers'
 * 2. Use SAFE_TICKET_SELECT in SQL queries: db('tickets').select(db.raw(SAFE_TICKET_SELECT))
 * 3. Use serializeTicket() before returning: reply.send({ ticket: serializeTicket(ticket) })
 */

/**
 * SAFE_TICKET_FIELDS - The canonical list of fields safe to return to clients.
 *
 * These fields are carefully selected to:
 * - Provide necessary ticket information for UI display
 * - NOT expose QR code validation secrets
 * - NOT expose payment/financial data
 * - NOT expose internal tracking data
 */
export const SAFE_TICKET_FIELDS = [
  'id',
  'event_id',
  'ticket_type_id',
  'status',
  'ticket_number',
  'section',
  'row',
  'seat',
  'is_transferable',
  'transfer_count',
  'is_nft',
  'token_mint',
  'purchased_at',
  'purchase_date',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_TICKET_SELECT - SQL-ready comma-separated field list.
 * Use in Knex queries: db('tickets').select(db.raw(SAFE_TICKET_SELECT))
 * Use in raw SQL: `SELECT ${SAFE_TICKET_SELECT} FROM tickets WHERE ...`
 */
export const SAFE_TICKET_SELECT = SAFE_TICKET_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 * Used for testing and documentation purposes.
 */
export const FORBIDDEN_TICKET_FIELDS = [
  // CRITICAL - QR code validation secrets (ticket forgery risk)
  'qr_code',

  // CRITICAL - Payment system data
  'payment_id',

  // HIGH RISK - User tracking (only expose to ticket owner)
  'user_id',
  'original_purchaser_id',
  'validated_by',

  // HIGH RISK - Financial data
  'price_cents',
  'price',
  'face_value',

  // MEDIUM RISK - Internal tracking
  'tenant_id',
  'reservation_id',
  'is_validated',
  'validated_at',
  'checked_in_at',
  'metadata',
  'deleted_at',
] as const;

/**
 * Type for a safely serialized ticket object.
 */
export type SafeTicket = {
  id: string;
  eventId: string;
  ticketTypeId: string;
  status: string;
  ticketNumber: string;
  section?: string | null;
  row?: string | null;
  seat?: string | null;
  isTransferable: boolean;
  transferCount: number;
  isNft: boolean;
  tokenMint?: string | null;
  purchasedAt?: Date | string | null;
  purchaseDate?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Type for ticket serialized for the owner (includes user_id).
 */
export type SafeTicketForOwner = SafeTicket & {
  userId: string;
};

/**
 * Serializes a ticket object to include ONLY safe fields.
 * This is the LAST LINE OF DEFENSE against data leakage.
 *
 * Even if a SQL query returns extra fields, this function
 * ensures only safe fields are included in the response.
 *
 * @param ticket - Raw ticket object from database
 * @returns SafeTicket with only allowed fields (camelCase keys)
 *
 * @example
 * const ticket = await db('tickets').where('id', ticketId).first();
 * return reply.send({ ticket: serializeTicket(ticket) });
 */
export function serializeTicket(ticket: Record<string, any>): SafeTicket {
  if (!ticket) {
    throw new Error('Cannot serialize null or undefined ticket');
  }

  return {
    id: ticket.id,
    eventId: ticket.event_id,
    ticketTypeId: ticket.ticket_type_id,
    status: ticket.status || 'active',
    ticketNumber: ticket.ticket_number,
    section: ticket.section ?? ticket.seat_section ?? null,
    row: ticket.row ?? ticket.seat_row ?? null,
    seat: ticket.seat ?? ticket.seat_number ?? null,
    isTransferable: ticket.is_transferable ?? true,
    transferCount: ticket.transfer_count ?? 0,
    isNft: ticket.is_nft ?? false,
    tokenMint: ticket.token_mint ?? ticket.nft_token_id ?? null,
    purchasedAt: ticket.purchased_at ?? null,
    purchaseDate: ticket.purchase_date ?? null,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
  };
}

/**
 * Serializes a ticket for the owner - includes user_id.
 * Use this ONLY when returning ticket data to its owner.
 *
 * @param ticket - Raw ticket object from database
 * @returns SafeTicketForOwner with user_id included
 */
export function serializeTicketForOwner(ticket: Record<string, any>): SafeTicketForOwner {
  if (!ticket) {
    throw new Error('Cannot serialize null or undefined ticket');
  }

  return {
    ...serializeTicket(ticket),
    userId: ticket.user_id,
  };
}

/**
 * Serializes an array of tickets.
 *
 * @param tickets - Array of raw ticket objects from database
 * @returns Array of SafeTicket objects
 */
export function serializeTickets(tickets: Record<string, any>[]): SafeTicket[] {
  if (!tickets) {
    return [];
  }
  return tickets.map(serializeTicket);
}

/**
 * Serializes an array of tickets for the owner.
 *
 * @param tickets - Array of raw ticket objects from database
 * @returns Array of SafeTicketForOwner objects
 */
export function serializeTicketsForOwner(tickets: Record<string, any>[]): SafeTicketForOwner[] {
  if (!tickets) {
    return [];
  }
  return tickets.map(serializeTicketForOwner);
}

/**
 * Serializes a ticket for list/summary views with fewer fields.
 * Use this for index/search results where full details aren't needed.
 */
export function serializeTicketSummary(ticket: Record<string, any>): Pick<
  SafeTicket,
  'id' | 'eventId' | 'ticketTypeId' | 'status' | 'ticketNumber' | 'isNft'
> {
  if (!ticket) {
    throw new Error('Cannot serialize null or undefined ticket');
  }

  return {
    id: ticket.id,
    eventId: ticket.event_id,
    ticketTypeId: ticket.ticket_type_id,
    status: ticket.status || 'active',
    ticketNumber: ticket.ticket_number,
    isNft: ticket.is_nft ?? false,
  };
}

/**
 * Validates that a response object contains no forbidden fields.
 * Use in tests to verify serialization is working correctly.
 *
 * @param obj - Object to check
 * @returns Array of forbidden fields found (empty if safe)
 */
export function findForbiddenTicketFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  // Check snake_case versions (from DB)
  for (const field of FORBIDDEN_TICKET_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  // Also check camelCase versions (from transformed response)
  const camelCaseForbidden = [
    'qrCode', 'paymentId', 'userId', 'originalPurchaserId',
    'validatedBy', 'priceCents', 'faceValue', 'tenantId',
    'reservationId', 'isValidated', 'validatedAt', 'checkedInAt',
    'metadata', 'deletedAt',
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
export function findMissingSafeTicketFields(obj: Record<string, any>): string[] {
  const required = ['id', 'eventId', 'ticketTypeId', 'status', 'ticketNumber'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
