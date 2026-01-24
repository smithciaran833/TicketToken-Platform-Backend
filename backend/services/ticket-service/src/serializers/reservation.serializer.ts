/**
 * RESERVATION SERIALIZER - Single Source of Truth for Safe Reservation Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning reservation data.
 *
 * NEVER ADD TO SAFE_RESERVATION_FIELDS:
 * - user_id (only for own reservations via serializeReservationForOwner)
 * - tickets (JSON may contain internal ticket data)
 * - tenant_id (multi-tenancy leak)
 *
 * Pattern for controllers:
 * 1. Import { serializeReservation, SAFE_RESERVATION_SELECT } from '../serializers'
 * 2. Use SAFE_RESERVATION_SELECT in SQL queries
 * 3. Use serializeReservation() before returning
 */

/**
 * SAFE_RESERVATION_FIELDS - The canonical list of fields safe to return to clients.
 *
 * These fields are carefully selected to:
 * - Provide necessary reservation information for UI display
 * - NOT expose internal ticket data
 * - NOT expose user tracking data
 */
export const SAFE_RESERVATION_FIELDS = [
  'id',
  'event_id',
  'ticket_type_id',
  'quantity',
  'total_quantity',
  'type_name',
  'status',
  'expires_at',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_RESERVATION_SELECT - SQL-ready comma-separated field list.
 * Use in Knex queries: db('reservations').select(db.raw(SAFE_RESERVATION_SELECT))
 * Use in raw SQL: `SELECT ${SAFE_RESERVATION_SELECT} FROM reservations WHERE ...`
 */
export const SAFE_RESERVATION_SELECT = SAFE_RESERVATION_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 * Used for testing and documentation purposes.
 */
export const FORBIDDEN_RESERVATION_FIELDS = [
  // HIGH RISK - User tracking (only expose to reservation owner)
  'user_id',

  // MEDIUM RISK - Internal ticket data (may contain sensitive info)
  'tickets',

  // MEDIUM RISK - Internal tracking
  'tenant_id',
  'released_at',
  'metadata',
  'created_by',
  'updated_by',
  'deleted_at',
  'version',
] as const;

/**
 * Type for a safely serialized reservation object.
 */
export type SafeReservation = {
  id: string;
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  totalQuantity: number;
  typeName?: string | null;
  status: string;
  expiresAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Type for reservation serialized for the owner (includes user_id).
 */
export type SafeReservationForOwner = SafeReservation & {
  userId: string;
};

/**
 * Serializes a reservation object to include ONLY safe fields.
 * This is the LAST LINE OF DEFENSE against data leakage.
 *
 * Even if a SQL query returns extra fields, this function
 * ensures only safe fields are included in the response.
 *
 * @param reservation - Raw reservation object from database
 * @returns SafeReservation with only allowed fields (camelCase keys)
 *
 * @example
 * const reservation = await db('reservations').where('id', reservationId).first();
 * return reply.send({ reservation: serializeReservation(reservation) });
 */
export function serializeReservation(reservation: Record<string, any>): SafeReservation {
  if (!reservation) {
    throw new Error('Cannot serialize null or undefined reservation');
  }

  return {
    id: reservation.id,
    eventId: reservation.event_id,
    ticketTypeId: reservation.ticket_type_id,
    quantity: reservation.quantity ?? 0,
    totalQuantity: reservation.total_quantity ?? reservation.quantity ?? 0,
    typeName: reservation.type_name ?? null,
    status: reservation.status || 'pending',
    expiresAt: reservation.expires_at,
    createdAt: reservation.created_at,
    updatedAt: reservation.updated_at,
  };
}

/**
 * Serializes a reservation for the owner - includes user_id.
 * Use this ONLY when returning reservation data to its owner.
 *
 * @param reservation - Raw reservation object from database
 * @returns SafeReservationForOwner with user_id included
 */
export function serializeReservationForOwner(reservation: Record<string, any>): SafeReservationForOwner {
  if (!reservation) {
    throw new Error('Cannot serialize null or undefined reservation');
  }

  return {
    ...serializeReservation(reservation),
    userId: reservation.user_id,
  };
}

/**
 * Serializes an array of reservations.
 *
 * @param reservations - Array of raw reservation objects from database
 * @returns Array of SafeReservation objects
 */
export function serializeReservations(reservations: Record<string, any>[]): SafeReservation[] {
  if (!reservations) {
    return [];
  }
  return reservations.map(serializeReservation);
}

/**
 * Serializes an array of reservations for the owner.
 *
 * @param reservations - Array of raw reservation objects from database
 * @returns Array of SafeReservationForOwner objects
 */
export function serializeReservationsForOwner(reservations: Record<string, any>[]): SafeReservationForOwner[] {
  if (!reservations) {
    return [];
  }
  return reservations.map(serializeReservationForOwner);
}

/**
 * Serializes a reservation for list/summary views with fewer fields.
 * Use this for index/search results where full details aren't needed.
 */
export function serializeReservationSummary(reservation: Record<string, any>): Pick<
  SafeReservation,
  'id' | 'eventId' | 'status' | 'totalQuantity' | 'expiresAt'
> {
  if (!reservation) {
    throw new Error('Cannot serialize null or undefined reservation');
  }

  return {
    id: reservation.id,
    eventId: reservation.event_id,
    status: reservation.status || 'pending',
    totalQuantity: reservation.total_quantity ?? reservation.quantity ?? 0,
    expiresAt: reservation.expires_at,
  };
}

/**
 * Validates that a response object contains no forbidden fields.
 * Use in tests to verify serialization is working correctly.
 *
 * @param obj - Object to check
 * @returns Array of forbidden fields found (empty if safe)
 */
export function findForbiddenReservationFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  // Check snake_case versions (from DB)
  for (const field of FORBIDDEN_RESERVATION_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  // Also check camelCase versions (from transformed response)
  const camelCaseForbidden = [
    'userId', 'tickets', 'tenantId', 'releasedAt',
    'metadata', 'createdBy', 'updatedBy', 'deletedAt', 'version',
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
export function findMissingSafeReservationFields(obj: Record<string, any>): string[] {
  const required = ['id', 'eventId', 'ticketTypeId', 'status', 'expiresAt'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
