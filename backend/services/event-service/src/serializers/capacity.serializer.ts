/**
 * CAPACITY SERIALIZER - Single Source of Truth for Safe Capacity Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning capacity data.
 *
 * NEVER ADD TO SAFE_CAPACITY_FIELDS:
 * - locked_price_data (internal pricing locks)
 * - seat_map, row_config (internal layout data)
 * - version, created_by, updated_by (internal tracking)
 *
 * Pattern for controllers:
 * 1. Import { serializeCapacity, SAFE_CAPACITY_SELECT } from '../serializers'
 * 2. Use SAFE_CAPACITY_SELECT in SQL queries
 * 3. Use serializeCapacity() before returning
 */

/**
 * SAFE_CAPACITY_FIELDS - The canonical list of fields safe to return to clients.
 */
export const SAFE_CAPACITY_FIELDS = [
  'id',
  'tenant_id',
  'event_id',
  'schedule_id',
  'section_name',
  'section_code',
  'tier',
  'total_capacity',
  'available_capacity',
  'reserved_capacity',
  'buffer_capacity',
  'sold_count',
  'pending_count',
  'is_active',
  'is_visible',
  'minimum_purchase',
  'maximum_purchase',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_CAPACITY_SELECT - SQL-ready comma-separated field list.
 */
export const SAFE_CAPACITY_SELECT = SAFE_CAPACITY_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 */
export const FORBIDDEN_CAPACITY_FIELDS = [
  // HIGH RISK - Internal pricing locks
  'locked_price_data',
  'reserved_at',
  'reserved_expires_at',

  // MEDIUM RISK - Internal layout data
  'seat_map',
  'row_config',

  // MEDIUM RISK - Internal tracking
  'created_by',
  'updated_by',
  'version',
  'deleted_at',
] as const;

/**
 * Type for a safely serialized capacity object.
 */
export type SafeCapacity = {
  id: string;
  tenantId: string;
  eventId: string;
  scheduleId?: string | null;
  sectionName: string;
  sectionCode?: string | null;
  tier?: string | null;
  totalCapacity: number;
  availableCapacity: number;
  reservedCapacity: number;
  bufferCapacity: number;
  soldCount: number;
  pendingCount: number;
  isActive: boolean;
  isVisible: boolean;
  minimumPurchase: number;
  maximumPurchase?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Serializes a capacity object to include ONLY safe fields.
 */
export function serializeCapacity(capacity: Record<string, any>): SafeCapacity {
  if (!capacity) {
    throw new Error('Cannot serialize null or undefined capacity');
  }

  return {
    id: capacity.id,
    tenantId: capacity.tenant_id,
    eventId: capacity.event_id,
    scheduleId: capacity.schedule_id ?? null,
    sectionName: capacity.section_name,
    sectionCode: capacity.section_code ?? null,
    tier: capacity.tier ?? null,
    totalCapacity: capacity.total_capacity ?? 0,
    availableCapacity: capacity.available_capacity ?? 0,
    reservedCapacity: capacity.reserved_capacity ?? 0,
    bufferCapacity: capacity.buffer_capacity ?? 0,
    soldCount: capacity.sold_count ?? 0,
    pendingCount: capacity.pending_count ?? 0,
    isActive: capacity.is_active ?? true,
    isVisible: capacity.is_visible ?? true,
    minimumPurchase: capacity.minimum_purchase ?? 1,
    maximumPurchase: capacity.maximum_purchase ?? null,
    createdAt: capacity.created_at,
    updatedAt: capacity.updated_at,
  };
}

/**
 * Serializes an array of capacity objects.
 */
export function serializeCapacities(capacities: Record<string, any>[]): SafeCapacity[] {
  if (!capacities) {
    return [];
  }
  return capacities.map(serializeCapacity);
}

/**
 * Validates that a response object contains no forbidden fields.
 */
export function findForbiddenCapacityFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  for (const field of FORBIDDEN_CAPACITY_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  // Also check camelCase versions
  const camelCaseForbidden = [
    'lockedPriceData', 'reservedAt', 'reservedExpiresAt',
    'seatMap', 'rowConfig',
    'createdBy', 'updatedBy', 'version', 'deletedAt',
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
export function findMissingSafeCapacityFields(obj: Record<string, any>): string[] {
  const required = ['id', 'tenantId', 'eventId', 'sectionName', 'totalCapacity'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
