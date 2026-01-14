/**
 * Response filtering utilities
 * Ensures only safe fields are returned in API responses
 */

// =============================================================================
// ALLOWED FIELDS FOR EACH ENTITY TYPE
// =============================================================================

/**
 * Fields allowed in mint responses
 */
export const MINT_RESPONSE_FIELDS = [
  'id',
  'ticket_id',
  'tenant_id',
  'status',
  'mint_address',
  'transaction_signature',
  'asset_id',
  'metadata_uri',
  'retry_count',
  'created_at',
  'updated_at',
  'completed_at'
] as const;

/**
 * Fields allowed in detailed mint responses (includes more info)
 */
export const MINT_DETAILED_RESPONSE_FIELDS = [
  ...MINT_RESPONSE_FIELDS,
  'blockchain',
  'merkle_tree',
  'owner_address',
  'event_id',
  'order_id'
] as const;

/**
 * Fields allowed in job responses
 */
export const JOB_RESPONSE_FIELDS = [
  'id',
  'name',
  'data',
  'opts',
  'progress',
  'delay',
  'timestamp',
  'attemptsMade',
  'finishedOn',
  'processedOn',
  'failedReason'
] as const;

/**
 * Fields allowed in queue stats responses
 */
export const QUEUE_STATS_FIELDS = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'paused'
] as const;

/**
 * Fields allowed in DLQ job responses
 */
export const DLQ_JOB_RESPONSE_FIELDS = [
  'id',
  'originalJobId',
  'data',
  'error',
  'failedAt',
  'attempts',
  'reason'
] as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Pick specified keys from an object
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specified keys from an object
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

// =============================================================================
// MINT RESPONSE FILTERS
// =============================================================================

/**
 * Filter a single mint response to include only safe fields
 */
export function filterMintResponse<T extends Record<string, any>>(mint: T): Partial<T> {
  return pick(mint, MINT_RESPONSE_FIELDS as unknown as (keyof T)[]);
}

/**
 * Filter a list of mint responses
 */
export function filterMintListResponse<T extends Record<string, any>>(mints: T[]): Partial<T>[] {
  return mints.map(filterMintResponse);
}

/**
 * Filter a detailed mint response
 */
export function filterDetailedMintResponse<T extends Record<string, any>>(mint: T): Partial<T> {
  return pick(mint, MINT_DETAILED_RESPONSE_FIELDS as unknown as (keyof T)[]);
}

/**
 * Filter a list of detailed mint responses
 */
export function filterDetailedMintListResponse<T extends Record<string, any>>(mints: T[]): Partial<T>[] {
  return mints.map(filterDetailedMintResponse);
}

// =============================================================================
// JOB RESPONSE FILTERS
// =============================================================================

/**
 * Filter a job response
 */
export function filterJobResponse<T extends Record<string, any>>(job: T): Partial<T> {
  return pick(job, JOB_RESPONSE_FIELDS as unknown as (keyof T)[]);
}

/**
 * Filter a list of job responses
 */
export function filterJobListResponse<T extends Record<string, any>>(jobs: T[]): Partial<T>[] {
  return jobs.map(filterJobResponse);
}

// =============================================================================
// DLQ RESPONSE FILTERS
// =============================================================================

/**
 * Filter a DLQ job response
 */
export function filterDLQJobResponse<T extends Record<string, any>>(job: T): Partial<T> {
  return pick(job, DLQ_JOB_RESPONSE_FIELDS as unknown as (keyof T)[]);
}

/**
 * Filter a list of DLQ job responses
 */
export function filterDLQJobListResponse<T extends Record<string, any>>(jobs: T[]): Partial<T>[] {
  return jobs.map(filterDLQJobResponse);
}

// =============================================================================
// SENSITIVE DATA REDACTION
// =============================================================================

/**
 * Fields that should never be exposed
 */
const SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'secret',
  'privateKey',
  'private_key',
  'api_key',
  'apiKey',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'jwt',
  'token',
  'credential',
  'ssn',
  'creditCard',
  'credit_card'
] as const;

/**
 * Redact sensitive fields from any object (recursive)
 */
export function redactSensitiveFields<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };
  
  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase();
    
    // Check if key matches any sensitive field
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
      result[key as keyof T] = '[REDACTED]' as any;
      continue;
    }
    
    // Recursively handle nested objects
    if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key as keyof T] = redactSensitiveFields(result[key]);
    }
    
    // Handle arrays of objects
    if (Array.isArray(result[key])) {
      result[key as keyof T] = result[key].map((item: any) => 
        typeof item === 'object' && item !== null ? redactSensitiveFields(item) : item
      ) as any;
    }
  }
  
  return result;
}

// =============================================================================
// PAGINATION RESPONSE WRAPPER
// =============================================================================

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
 * Wrap a list response with pagination info
 */
export function createPaginatedResponse<T>(
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
