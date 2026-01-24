/**
 * PRICING SERIALIZER - Single Source of Truth for Safe Pricing Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return to clients.
 * All controllers MUST use this serializer before returning pricing data.
 *
 * NEVER ADD TO SAFE_PRICING_FIELDS:
 * - price_adjustment_rules (pricing algorithm/business logic)
 * - version, created_by, updated_by (internal tracking)
 *
 * Pattern for controllers:
 * 1. Import { serializePricing, SAFE_PRICING_SELECT } from '../serializers'
 * 2. Use SAFE_PRICING_SELECT in SQL queries
 * 3. Use serializePricing() before returning
 */

/**
 * SAFE_PRICING_FIELDS - The canonical list of fields safe to return to clients.
 */
export const SAFE_PRICING_FIELDS = [
  'id',
  'tenant_id',
  'event_id',
  'schedule_id',
  'capacity_id',
  'name',
  'description',
  'tier',
  'base_price',
  'service_fee',
  'facility_fee',
  'tax_rate',
  'is_dynamic',
  'min_price',
  'max_price',
  'current_price',
  'early_bird_price',
  'early_bird_ends_at',
  'last_minute_price',
  'last_minute_starts_at',
  'group_size_min',
  'group_discount_percentage',
  'currency',
  'sales_start_at',
  'sales_end_at',
  'max_per_order',
  'max_per_customer',
  'is_active',
  'is_visible',
  'display_order',
  'created_at',
  'updated_at',
] as const;

/**
 * SAFE_PRICING_SELECT - SQL-ready comma-separated field list.
 */
export const SAFE_PRICING_SELECT = SAFE_PRICING_FIELDS.join(', ');

/**
 * Fields that should NEVER be included in external responses.
 */
export const FORBIDDEN_PRICING_FIELDS = [
  // HIGH RISK - Pricing algorithm/business logic
  'price_adjustment_rules',

  // MEDIUM RISK - Internal tracking
  'created_by',
  'updated_by',
  'version',
  'deleted_at',
] as const;

/**
 * Type for a safely serialized pricing object.
 */
export type SafePricing = {
  id: string;
  tenantId: string;
  eventId: string;
  scheduleId?: string | null;
  capacityId?: string | null;
  name: string;
  description?: string | null;
  tier?: string | null;
  basePrice: number;
  serviceFee: number;
  facilityFee: number;
  taxRate: number;
  isDynamic: boolean;
  minPrice?: number | null;
  maxPrice?: number | null;
  currentPrice?: number | null;
  earlyBirdPrice?: number | null;
  earlyBirdEndsAt?: Date | string | null;
  lastMinutePrice?: number | null;
  lastMinuteStartsAt?: Date | string | null;
  groupSizeMin?: number | null;
  groupDiscountPercentage?: number | null;
  currency: string;
  salesStartAt?: Date | string | null;
  salesEndAt?: Date | string | null;
  maxPerOrder?: number | null;
  maxPerCustomer?: number | null;
  isActive: boolean;
  isVisible: boolean;
  displayOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/**
 * Serializes a pricing object to include ONLY safe fields.
 */
export function serializePricing(pricing: Record<string, any>): SafePricing {
  if (!pricing) {
    throw new Error('Cannot serialize null or undefined pricing');
  }

  return {
    id: pricing.id,
    tenantId: pricing.tenant_id,
    eventId: pricing.event_id,
    scheduleId: pricing.schedule_id ?? null,
    capacityId: pricing.capacity_id ?? null,
    name: pricing.name,
    description: pricing.description ?? null,
    tier: pricing.tier ?? null,
    basePrice: parseFloat(pricing.base_price) || 0,
    serviceFee: parseFloat(pricing.service_fee) || 0,
    facilityFee: parseFloat(pricing.facility_fee) || 0,
    taxRate: parseFloat(pricing.tax_rate) || 0,
    isDynamic: pricing.is_dynamic ?? false,
    minPrice: pricing.min_price ? parseFloat(pricing.min_price) : null,
    maxPrice: pricing.max_price ? parseFloat(pricing.max_price) : null,
    currentPrice: pricing.current_price ? parseFloat(pricing.current_price) : null,
    earlyBirdPrice: pricing.early_bird_price ? parseFloat(pricing.early_bird_price) : null,
    earlyBirdEndsAt: pricing.early_bird_ends_at ?? null,
    lastMinutePrice: pricing.last_minute_price ? parseFloat(pricing.last_minute_price) : null,
    lastMinuteStartsAt: pricing.last_minute_starts_at ?? null,
    groupSizeMin: pricing.group_size_min ?? null,
    groupDiscountPercentage: pricing.group_discount_percentage ? parseFloat(pricing.group_discount_percentage) : null,
    currency: pricing.currency || 'USD',
    salesStartAt: pricing.sales_start_at ?? null,
    salesEndAt: pricing.sales_end_at ?? null,
    maxPerOrder: pricing.max_per_order ?? null,
    maxPerCustomer: pricing.max_per_customer ?? null,
    isActive: pricing.is_active ?? true,
    isVisible: pricing.is_visible ?? true,
    displayOrder: pricing.display_order ?? 0,
    createdAt: pricing.created_at,
    updatedAt: pricing.updated_at,
  };
}

/**
 * Serializes an array of pricing objects.
 */
export function serializePricings(pricings: Record<string, any>[]): SafePricing[] {
  if (!pricings) {
    return [];
  }
  return pricings.map(serializePricing);
}

/**
 * Validates that a response object contains no forbidden fields.
 */
export function findForbiddenPricingFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  for (const field of FORBIDDEN_PRICING_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  // Also check camelCase versions
  const camelCaseForbidden = [
    'priceAdjustmentRules', 'createdBy', 'updatedBy', 'version', 'deletedAt',
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
export function findMissingSafePricingFields(obj: Record<string, any>): string[] {
  const required = ['id', 'tenantId', 'eventId', 'name', 'basePrice'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  return missing;
}
