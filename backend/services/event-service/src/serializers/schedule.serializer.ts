/**
 * SCHEDULE SERIALIZER - Single Source of Truth for Safe Schedule Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning schedule data.
 *
 * NEVER ADD TO SAFE_SCHEDULE_FIELDS:
 * - metadata (may contain internal notes)
 * - version, created_by, updated_by (internal tracking)
 *
 * Pattern for controllers:
 * 1. Import { serializeSchedule, SAFE_SCHEDULE_SELECT } from '../serializers'
 * 2. Use SAFE_SCHEDULE_SELECT in SQL queries
 * 3. Use serializeSchedule() before returning
 */

/**
 * SAFE_SCHEDULE_FIELDS - The canonical list of fields safe to return to clients.
 */
export const SAFE_SCHEDULE_FIELDS = [
  'id',
  'tenant_id',
  'event_id',
  'starts_at',
  'ends_at',
  'doors_open_at',
  'is_recurring',
  'recurrence_rule',
  'recurrence_end_date',
  'occurrence_number',
  'timezone',
  'utc_offset',
  'status',
  'capacity_override',
  'check_in_opens_at',
  'check_in_closes_at',
  'notes',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_SCHEDULE_SELECT - SQL-ready comma-separated field list.
 */
export const SAFE_SCHEDULE_SELECT = SAFE_SCHEDULE_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 */
export const FORBIDDEN_SCHEDULE_FIELDS = [
  // MEDIUM RISK - May contain internal notes
  'metadata',
  'status_reason',

  // MEDIUM RISK - Internal tracking
  'created_by',
  'updated_by',
  'version',
  'deleted_at',
] as const;

/**
 * Type for a safely serialized schedule object.
 */
export type SafeSchedule = {
  id: string;
  tenantId: string;
  eventId: string;
  startsAt: Date | string;
  endsAt: Date | string;
  doorsOpenAt?: Date | string | null;
  isRecurring: boolean;
  recurrenceRule?: string | null;
  recurrenceEndDate?: Date | string | null;
  occurrenceNumber?: number | null;
  timezone: string;
  utcOffset?: number | null;
  status: string;
  capacityOverride?: number | null;
  checkInOpensAt?: Date | string | null;
  checkInClosesAt?: Date | string | null;
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Serializes a schedule object to include ONLY safe fields.
 */
export function serializeSchedule(schedule: Record<string, any>): SafeSchedule {
  if (!schedule) {
    throw new Error('Cannot serialize null or undefined schedule');
  }

  return {
    id: schedule.id,
    tenantId: schedule.tenant_id,
    eventId: schedule.event_id,
    startsAt: schedule.starts_at,
    endsAt: schedule.ends_at,
    doorsOpenAt: schedule.doors_open_at ?? null,
    isRecurring: schedule.is_recurring ?? false,
    recurrenceRule: schedule.recurrence_rule ?? null,
    recurrenceEndDate: schedule.recurrence_end_date ?? null,
    occurrenceNumber: schedule.occurrence_number ?? null,
    timezone: schedule.timezone || 'UTC',
    utcOffset: schedule.utc_offset ?? null,
    status: schedule.status || 'SCHEDULED',
    capacityOverride: schedule.capacity_override ?? null,
    checkInOpensAt: schedule.check_in_opens_at ?? null,
    checkInClosesAt: schedule.check_in_closes_at ?? null,
    notes: schedule.notes ?? null,
    createdAt: schedule.created_at,
    updatedAt: schedule.updated_at,
  };
}

/**
 * Serializes an array of schedule objects.
 */
export function serializeSchedules(schedules: Record<string, any>[]): SafeSchedule[] {
  if (!schedules) {
    return [];
  }
  return schedules.map(serializeSchedule);
}

/**
 * Validates that a response object contains no forbidden fields.
 */
export function findForbiddenScheduleFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  for (const field of FORBIDDEN_SCHEDULE_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  // Also check camelCase versions
  const camelCaseForbidden = [
    'metadata', 'statusReason', 'createdBy', 'updatedBy', 'version', 'deletedAt',
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
export function findMissingSafeScheduleFields(obj: Record<string, any>): string[] {
  const required = ['id', 'tenantId', 'eventId', 'startsAt', 'endsAt'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
