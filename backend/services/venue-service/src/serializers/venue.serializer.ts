/**
 * VENUE SERIALIZER - Single Source of Truth for Safe Venue Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning venue data.
 *
 * NEVER ADD TO SAFE_VENUE_FIELDS:
 * - tax_id, business_registration, stripe_connect_account_id
 * - bank account info, payout details
 * - internal tracking metrics
 *
 * Pattern for controllers:
 * 1. Import { serializeVenue, SAFE_VENUE_SELECT } from '../serializers/venue.serializer'
 * 2. Use SAFE_VENUE_SELECT in SQL queries: db('venues').select(db.raw(SAFE_VENUE_SELECT))
 * 3. Use serializeVenue() before returning: reply.send({ venue: serializeVenue(venue) })
 */

/**
 * SAFE_VENUE_FIELDS - The canonical list of fields safe to return to clients.
 *
 * These fields are carefully selected to:
 * - Provide necessary venue information for UI display
 * - NOT expose financial/tax data
 * - NOT expose internal tracking data
 * - NOT expose payment processor credentials
 */
export const SAFE_VENUE_FIELDS = [
  'id',
  'tenant_id',
  'name',
  'slug',
  'description',
  'short_description',
  'address_line1',
  'address_line2',
  'city',
  'state_province',
  'country_code',
  'postal_code',
  'latitude',
  'longitude',
  'timezone',
  'max_capacity',
  'status',
  'is_verified',
  'logo_url',
  'cover_image_url',
  'email',
  'phone',
  'website',
  'social_links',
  'amenities',
  'accessibility_features',
  'parking_info',
  'public_transit_info',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_VENUE_SELECT - SQL-ready comma-separated field list.
 * Use in Knex queries: db('venues').select(db.raw(SAFE_VENUE_SELECT))
 * Use in raw SQL: `SELECT ${SAFE_VENUE_SELECT} FROM venues WHERE ...`
 */
export const SAFE_VENUE_SELECT = SAFE_VENUE_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 * Used for testing and documentation purposes.
 */
export const FORBIDDEN_VENUE_FIELDS = [
  // CRITICAL - Financial/Tax data
  'tax_id',
  'business_registration',
  'stripe_connect_account_id',
  'stripe_customer_id',
  'stripe_account_status',
  'payout_schedule',
  'payout_method',
  'bank_account_last4',
  'bank_routing_last4',

  // HIGH RISK - Internal business metrics
  'total_revenue',
  'total_events',
  'total_tickets_sold',
  'average_ticket_price',
  'commission_rate',
  'platform_fee_rate',
  'chargeback_rate',
  'chargeback_count',

  // MEDIUM RISK - Internal system fields
  'created_by',
  'updated_by',
  'deleted_at',
  'deleted_by',
  'internal_notes',
  'admin_notes',
  'compliance_status',
  'compliance_notes',
  'verification_date',
  'verification_notes',
  'last_audit_date',
  'risk_score',
  'fraud_flags',

  // Wallet/blockchain fields (internal use only)
  'wallet_address',
  'wallet_type',
  'blockchain_verified',
] as const;

/**
 * Type for a safely serialized venue object.
 */
export type SafeVenue = {
  id: string;
  tenantId: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  maxCapacity?: number | null;
  status: string;
  isVerified: boolean;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  socialLinks?: Record<string, string> | null;
  amenities?: string[] | null;
  accessibilityFeatures?: string[] | null;
  parkingInfo?: string | null;
  publicTransitInfo?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Serializes a venue object to include ONLY safe fields.
 * This is the LAST LINE OF DEFENSE against data leakage.
 *
 * Even if a SQL query returns extra fields, this function
 * ensures only safe fields are included in the response.
 *
 * @param venue - Raw venue object from database
 * @returns SafeVenue with only allowed fields (camelCase keys)
 *
 * @example
 * const venue = await db('venues').where('id', venueId).first();
 * return reply.send({ venue: serializeVenue(venue) });
 */
export function serializeVenue(venue: Record<string, any>): SafeVenue {
  if (!venue) {
    throw new Error('Cannot serialize null or undefined venue');
  }

  return {
    id: venue.id,
    tenantId: venue.tenant_id,
    name: venue.name,
    slug: venue.slug ?? null,
    description: venue.description ?? null,
    shortDescription: venue.short_description ?? null,
    addressLine1: venue.address_line1 ?? null,
    addressLine2: venue.address_line2 ?? null,
    city: venue.city ?? null,
    stateProvince: venue.state_province ?? null,
    countryCode: venue.country_code ?? null,
    postalCode: venue.postal_code ?? null,
    latitude: venue.latitude ?? null,
    longitude: venue.longitude ?? null,
    timezone: venue.timezone ?? null,
    maxCapacity: venue.max_capacity ?? null,
    status: venue.status || 'draft',
    isVerified: venue.is_verified ?? false,
    logoUrl: venue.logo_url ?? null,
    coverImageUrl: venue.cover_image_url ?? null,
    email: venue.email ?? null,
    phone: venue.phone ?? null,
    website: venue.website ?? null,
    socialLinks: venue.social_links ?? null,
    amenities: venue.amenities ?? null,
    accessibilityFeatures: venue.accessibility_features ?? null,
    parkingInfo: venue.parking_info ?? null,
    publicTransitInfo: venue.public_transit_info ?? null,
    createdAt: venue.created_at,
    updatedAt: venue.updated_at,
  };
}

/**
 * Serializes an array of venues.
 *
 * @param venues - Array of raw venue objects from database
 * @returns Array of SafeVenue objects
 */
export function serializeVenues(venues: Record<string, any>[]): SafeVenue[] {
  if (!venues) {
    return [];
  }
  return venues.map(serializeVenue);
}

/**
 * Serializes a venue for list/summary views with fewer fields.
 * Use this for index/search results where full details aren't needed.
 */
export function serializeVenueSummary(venue: Record<string, any>): Pick<
  SafeVenue,
  'id' | 'tenantId' | 'name' | 'slug' | 'city' | 'stateProvince' | 'countryCode' | 'status' | 'isVerified' | 'logoUrl' | 'maxCapacity'
> {
  if (!venue) {
    throw new Error('Cannot serialize null or undefined venue');
  }

  return {
    id: venue.id,
    tenantId: venue.tenant_id,
    name: venue.name,
    slug: venue.slug ?? null,
    city: venue.city ?? null,
    stateProvince: venue.state_province ?? null,
    countryCode: venue.country_code ?? null,
    status: venue.status || 'draft',
    isVerified: venue.is_verified ?? false,
    logoUrl: venue.logo_url ?? null,
    maxCapacity: venue.max_capacity ?? null,
  };
}

/**
 * Validates that a response object contains no forbidden fields.
 * Use in tests to verify serialization is working correctly.
 *
 * @param obj - Object to check
 * @returns Array of forbidden fields found (empty if safe)
 */
export function findForbiddenVenueFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  // Check snake_case versions (from DB)
  for (const field of FORBIDDEN_VENUE_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  // Also check camelCase versions (from transformed response)
  const camelCaseForbidden = [
    'taxId', 'businessRegistration', 'stripeConnectAccountId',
    'stripeCustomerId', 'stripeAccountStatus', 'payoutSchedule',
    'payoutMethod', 'bankAccountLast4', 'bankRoutingLast4',
    'totalRevenue', 'totalEvents', 'totalTicketsSold',
    'averageTicketPrice', 'commissionRate', 'platformFeeRate',
    'chargebackRate', 'chargebackCount', 'createdBy', 'updatedBy',
    'deletedAt', 'deletedBy', 'internalNotes', 'adminNotes',
    'complianceStatus', 'complianceNotes', 'verificationDate',
    'verificationNotes', 'lastAuditDate', 'riskScore', 'fraudFlags',
    'walletAddress', 'walletType', 'blockchainVerified',
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
export function findMissingSafeVenueFields(obj: Record<string, any>): string[] {
  const required = ['id', 'tenantId', 'name', 'status', 'isVerified'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
