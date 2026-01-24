/**
 * EVENT SERIALIZER - Single Source of Truth for Safe Event Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning event data.
 *
 * NEVER ADD TO SAFE_EVENT_FIELDS:
 * - mint_authority, artist_wallet, event_pda (blockchain internals)
 * - artist_percentage, venue_percentage (business confidential)
 * - streaming_config (may contain API keys)
 * - created_by, updated_by, version, deleted_at (internal tracking)
 *
 * Pattern for controllers:
 * 1. Import { serializeEvent, SAFE_EVENT_SELECT } from '../serializers'
 * 2. Use SAFE_EVENT_SELECT in SQL queries: db('events').select(db.raw(SAFE_EVENT_SELECT))
 * 3. Use serializeEvent() before returning: reply.send({ event: serializeEvent(event) })
 */

/**
 * SAFE_EVENT_FIELDS - The canonical list of fields safe to return to clients.
 *
 * These fields are carefully selected to:
 * - Provide necessary event information for UI display
 * - NOT expose blockchain signing keys or wallet addresses
 * - NOT expose business-confidential royalty splits
 * - NOT expose internal tracking data
 */
export const SAFE_EVENT_FIELDS = [
  'id',
  'tenant_id',
  'venue_id',
  'venue_layout_id',
  'name',
  'slug',
  'description',
  'short_description',
  'event_type',
  'primary_category_id',
  'secondary_category_ids',
  'tags',
  'status',
  'visibility',
  'is_featured',
  'priority_score',
  'banner_image_url',
  'thumbnail_image_url',
  'image_gallery',
  'video_url',
  'virtual_event_url',
  'age_restriction',
  'dress_code',
  'special_requirements',
  'accessibility_info',
  'is_virtual',
  'is_hybrid',
  'streaming_platform',
  'cancellation_policy',
  'refund_policy',
  'cancellation_deadline_hours',
  'start_date',
  'allow_transfers',
  'max_transfers_per_ticket',
  'transfer_blackout_start',
  'transfer_blackout_end',
  'require_identity_verification',
  'meta_title',
  'meta_description',
  'meta_keywords',
  'view_count',
  'interest_count',
  'share_count',
  'external_id',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_EVENT_SELECT - SQL-ready comma-separated field list.
 * Use in Knex queries: db('events').select(db.raw(SAFE_EVENT_SELECT))
 * Use in raw SQL: `SELECT ${SAFE_EVENT_SELECT} FROM events WHERE ...`
 */
export const SAFE_EVENT_SELECT = SAFE_EVENT_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 * Used for testing and documentation purposes.
 */
export const FORBIDDEN_EVENT_FIELDS = [
  // CRITICAL - Blockchain signing/wallet data
  'mint_authority',
  'artist_wallet',
  'event_pda',
  'collection_address',

  // HIGH RISK - Business confidential royalty splits
  'artist_percentage',
  'venue_percentage',
  'royalty_percentage',
  'blockchain_status',

  // HIGH RISK - May contain API keys/credentials
  'streaming_config',

  // MEDIUM RISK - Internal tracking
  'created_by',
  'updated_by',
  'version',
  'deleted_at',
  'status_reason',
  'status_changed_by',
  'status_changed_at',

  // MEDIUM RISK - Internal metadata
  'metadata',
] as const;

/**
 * Type for a safely serialized event object.
 */
export type SafeEvent = {
  id: string;
  tenantId: string;
  venueId: string;
  venueLayoutId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  shortDescription?: string | null;
  eventType: string;
  primaryCategoryId?: string | null;
  secondaryCategoryIds?: string[] | null;
  tags?: string[] | null;
  status: string;
  visibility: string;
  isFeatured: boolean;
  priorityScore: number;
  bannerImageUrl?: string | null;
  thumbnailImageUrl?: string | null;
  imageGallery?: any[] | null;
  videoUrl?: string | null;
  virtualEventUrl?: string | null;
  ageRestriction?: number | null;
  dressCode?: string | null;
  specialRequirements?: string[] | null;
  accessibilityInfo?: Record<string, any> | null;
  isVirtual: boolean;
  isHybrid: boolean;
  streamingPlatform?: string | null;
  cancellationPolicy?: string | null;
  refundPolicy?: string | null;
  cancellationDeadlineHours?: number | null;
  startDate?: Date | string | null;
  allowTransfers: boolean;
  maxTransfersPerTicket?: number | null;
  transferBlackoutStart?: Date | string | null;
  transferBlackoutEnd?: Date | string | null;
  requireIdentityVerification: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string[] | null;
  viewCount: number;
  interestCount: number;
  shareCount: number;
  externalId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Serializes an event object to include ONLY safe fields.
 * This is the LAST LINE OF DEFENSE against data leakage.
 *
 * Even if a SQL query returns extra fields, this function
 * ensures only safe fields are included in the response.
 *
 * @param event - Raw event object from database
 * @returns SafeEvent with only allowed fields (camelCase keys)
 *
 * @example
 * const event = await db('events').where('id', eventId).first();
 * return reply.send({ event: serializeEvent(event) });
 */
export function serializeEvent(event: Record<string, any>): SafeEvent {
  if (!event) {
    throw new Error('Cannot serialize null or undefined event');
  }

  return {
    id: event.id,
    tenantId: event.tenant_id,
    venueId: event.venue_id,
    venueLayoutId: event.venue_layout_id ?? null,
    name: event.name,
    slug: event.slug,
    description: event.description ?? null,
    shortDescription: event.short_description ?? null,
    eventType: event.event_type || 'single',
    primaryCategoryId: event.primary_category_id ?? null,
    secondaryCategoryIds: event.secondary_category_ids ?? null,
    tags: event.tags ?? null,
    status: event.status || 'DRAFT',
    visibility: event.visibility || 'PUBLIC',
    isFeatured: event.is_featured ?? false,
    priorityScore: event.priority_score ?? 0,
    bannerImageUrl: event.banner_image_url ?? null,
    thumbnailImageUrl: event.thumbnail_image_url ?? null,
    imageGallery: event.image_gallery ?? null,
    videoUrl: event.video_url ?? null,
    virtualEventUrl: event.virtual_event_url ?? null,
    ageRestriction: event.age_restriction ?? null,
    dressCode: event.dress_code ?? null,
    specialRequirements: event.special_requirements ?? null,
    accessibilityInfo: event.accessibility_info ?? null,
    isVirtual: event.is_virtual ?? false,
    isHybrid: event.is_hybrid ?? false,
    streamingPlatform: event.streaming_platform ?? null,
    cancellationPolicy: event.cancellation_policy ?? null,
    refundPolicy: event.refund_policy ?? null,
    cancellationDeadlineHours: event.cancellation_deadline_hours ?? null,
    startDate: event.start_date ?? null,
    allowTransfers: event.allow_transfers ?? true,
    maxTransfersPerTicket: event.max_transfers_per_ticket ?? null,
    transferBlackoutStart: event.transfer_blackout_start ?? null,
    transferBlackoutEnd: event.transfer_blackout_end ?? null,
    requireIdentityVerification: event.require_identity_verification ?? false,
    metaTitle: event.meta_title ?? null,
    metaDescription: event.meta_description ?? null,
    metaKeywords: event.meta_keywords ?? null,
    viewCount: event.view_count ?? 0,
    interestCount: event.interest_count ?? 0,
    shareCount: event.share_count ?? 0,
    externalId: event.external_id ?? null,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
}

/**
 * Serializes an array of events.
 *
 * @param events - Array of raw event objects from database
 * @returns Array of SafeEvent objects
 */
export function serializeEvents(events: Record<string, any>[]): SafeEvent[] {
  if (!events) {
    return [];
  }
  return events.map(serializeEvent);
}

/**
 * Serializes an event for list/summary views with fewer fields.
 * Use this for index/search results where full details aren't needed.
 */
export function serializeEventSummary(event: Record<string, any>): Pick<
  SafeEvent,
  'id' | 'tenantId' | 'venueId' | 'name' | 'slug' | 'status' | 'visibility' | 'startDate' | 'bannerImageUrl' | 'isFeatured'
> {
  if (!event) {
    throw new Error('Cannot serialize null or undefined event');
  }

  return {
    id: event.id,
    tenantId: event.tenant_id,
    venueId: event.venue_id,
    name: event.name,
    slug: event.slug,
    status: event.status || 'DRAFT',
    visibility: event.visibility || 'PUBLIC',
    startDate: event.start_date ?? null,
    bannerImageUrl: event.banner_image_url ?? null,
    isFeatured: event.is_featured ?? false,
  };
}

/**
 * Validates that a response object contains no forbidden fields.
 * Use in tests to verify serialization is working correctly.
 *
 * @param obj - Object to check
 * @returns Array of forbidden fields found (empty if safe)
 */
export function findForbiddenEventFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  // Check snake_case versions (from DB)
  for (const field of FORBIDDEN_EVENT_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  // Also check camelCase versions (from transformed response)
  const camelCaseForbidden = [
    'mintAuthority', 'artistWallet', 'eventPda', 'collectionAddress',
    'artistPercentage', 'venuePercentage', 'royaltyPercentage', 'blockchainStatus',
    'streamingConfig', 'createdBy', 'updatedBy', 'version', 'deletedAt',
    'statusReason', 'statusChangedBy', 'statusChangedAt', 'metadata',
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
export function findMissingSafeEventFields(obj: Record<string, any>): string[] {
  const required = ['id', 'tenantId', 'venueId', 'name', 'status'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
