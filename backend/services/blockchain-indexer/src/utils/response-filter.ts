/**
 * Response Filter Utility
 * 
 * AUDIT FIX: INP-8 - Response field filtering
 * 
 * Provides utilities to filter and sanitize API responses,
 * removing sensitive fields and controlling what data is exposed.
 */

import logger from './logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Fields that should never be exposed in API responses
 */
const GLOBAL_BLOCKED_FIELDS = [
  '__v',           // MongoDB version key
  'password',
  'password_hash',
  'passwordHash',
  'secret',
  'apiKey',
  'api_key',
  'privateKey',
  'private_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'encryptedData',
  'encrypted_data'
];

/**
 * Fields that should be redacted (shown as "[REDACTED]")
 */
const REDACTED_FIELDS = [
  'ssn',
  'socialSecurityNumber',
  'creditCard',
  'credit_card',
  'cvv',
  'bankAccount',
  'bank_account'
];

/**
 * Entity-specific allowed fields (whitelist approach)
 */
const ENTITY_ALLOWED_FIELDS: Record<string, string[]> = {
  transaction: [
    'id', 'signature', 'slot', 'block_time', 'instruction_type',
    'processed_at', 'status', 'fee', 'fullData'
  ],
  walletActivity: [
    'id', 'walletAddress', 'activityType', 'assetId', 'amount',
    'timestamp', 'signature', 'from', 'to'
  ],
  marketplaceEvent: [
    'id', 'marketplace', 'eventType', 'price', 'seller', 'buyer',
    'assetId', 'timestamp', 'signature'
  ],
  discrepancy: [
    'id', 'assetId', 'discrepancyType', 'onChainOwner', 'databaseOwner',
    'resolved', 'resolvedAt', 'detectedAt', 'resolution'
  ],
  syncStatus: [
    'lastProcessedSlot', 'lastProcessedSignature', 'indexerVersion',
    'isRunning', 'startedAt', 'updatedAt'
  ]
};

// =============================================================================
// TYPES
// =============================================================================

export interface FilterOptions {
  /** Entity type for whitelist filtering */
  entityType?: keyof typeof ENTITY_ALLOWED_FIELDS;
  /** Additional fields to block */
  additionalBlockedFields?: string[];
  /** Additional fields to allow (overrides block list) */
  additionalAllowedFields?: string[];
  /** Whether to deep filter nested objects */
  deep?: boolean;
  /** Maximum depth for nested filtering */
  maxDepth?: number;
  /** Replace blocked fields with null instead of removing */
  nullifyBlocked?: boolean;
}

// =============================================================================
// FILTER FUNCTIONS
// =============================================================================

/**
 * Filter a single object's fields
 */
function filterObject(
  obj: Record<string, any>,
  options: FilterOptions,
  depth: number = 0
): Record<string, any> {
  const {
    entityType,
    additionalBlockedFields = [],
    additionalAllowedFields = [],
    deep = true,
    maxDepth = 5,
    nullifyBlocked = false
  } = options;

  // Don't go too deep
  if (depth > maxDepth) {
    return obj;
  }

  const result: Record<string, any> = {};
  const blockedFields = [...GLOBAL_BLOCKED_FIELDS, ...additionalBlockedFields];
  const allowedFields = entityType 
    ? [...ENTITY_ALLOWED_FIELDS[entityType], ...additionalAllowedFields]
    : null;

  for (const [key, value] of Object.entries(obj)) {
    // Check if field is globally blocked
    if (blockedFields.includes(key)) {
      if (nullifyBlocked) {
        result[key] = null;
      }
      continue;
    }

    // Check if field should be redacted
    if (REDACTED_FIELDS.includes(key)) {
      result[key] = '[REDACTED]';
      continue;
    }

    // If whitelist exists, check if field is allowed
    if (allowedFields && !allowedFields.includes(key)) {
      continue;
    }

    // Handle nested objects
    if (deep && value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = filterObject(value, { ...options, entityType: undefined }, depth + 1);
    }
    // Handle arrays
    else if (deep && Array.isArray(value)) {
      result[key] = value.map(item => 
        typeof item === 'object' && item !== null
          ? filterObject(item, { ...options, entityType: undefined }, depth + 1)
          : item
      );
    }
    // Handle primitive values
    else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Filter response data
 * 
 * @param data - The data to filter (object or array)
 * @param options - Filtering options
 * @returns Filtered data
 */
export function filterResponse<T>(data: T, options: FilterOptions = {}): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => 
      typeof item === 'object' && item !== null
        ? filterObject(item, options)
        : item
    ) as T;
  }

  if (typeof data === 'object') {
    return filterObject(data as Record<string, any>, options) as T;
  }

  return data;
}

/**
 * Create a type-safe response filter for a specific entity
 */
export function createEntityFilter<T>(
  entityType: keyof typeof ENTITY_ALLOWED_FIELDS,
  additionalOptions?: Partial<FilterOptions>
): (data: T) => T {
  return (data: T) => filterResponse(data, { entityType, ...additionalOptions });
}

// =============================================================================
// PRE-BUILT ENTITY FILTERS
// =============================================================================

/**
 * Filter transaction response
 */
export const filterTransaction = createEntityFilter<any>('transaction');

/**
 * Filter wallet activity response
 */
export const filterWalletActivity = createEntityFilter<any>('walletActivity');

/**
 * Filter marketplace event response
 */
export const filterMarketplaceEvent = createEntityFilter<any>('marketplaceEvent');

/**
 * Filter discrepancy response
 */
export const filterDiscrepancy = createEntityFilter<any>('discrepancy');

/**
 * Filter sync status response
 */
export const filterSyncStatus = createEntityFilter<any>('syncStatus');

// =============================================================================
// PAGINATION HELPERS
// =============================================================================

/**
 * Standard pagination response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Wrap array data in standard pagination format
 */
export function paginateResponse<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + data.length < total
    }
  };
}

// =============================================================================
// EXPLICIT FIELD SELECTION
// =============================================================================

/**
 * Select specific fields from an object
 * AUDIT FIX: INP-6/DB-7 - Alternative to SELECT *, select explicit fields
 */
export function selectFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};
  
  for (const field of fields) {
    if (field in obj) {
      result[field] = obj[field];
    }
  }
  
  return result;
}

/**
 * Select specific fields from an array of objects
 */
export function selectFieldsArray<T extends Record<string, any>>(
  arr: T[],
  fields: (keyof T)[]
): Partial<T>[] {
  return arr.map(obj => selectFields(obj, fields));
}
