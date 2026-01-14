/**
 * Response Filter for Integration Service
 * 
 * AUDIT FIX ERR-1: Controllers use `as any` casts → Type-safe response filtering
 * 
 * Features:
 * - Type-safe response builders
 * - Sensitive data filtering
 * - Consistent response structure
 * - RFC 7807 error formatting
 */

import { isProduction } from '../config/index';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: ResponseMeta;
  error?: ErrorResponse;
}

/**
 * Response metadata
 */
export interface ResponseMeta {
  requestId?: string;
  timestamp: string;
  version?: string;
  pagination?: PaginationMeta;
  tenant?: string;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Error response (RFC 7807 compliant)
 */
export interface ErrorResponse {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: ValidationError[];
}

/**
 * Validation error detail
 */
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

// =============================================================================
// SENSITIVE FIELD FILTERING
// =============================================================================

/**
 * Fields that should never be exposed in responses
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'secret',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'api_key',
  'clientSecret',
  'client_secret',
  'privateKey',
  'private_key',
  'signingSecret',
  'signing_secret',
  'webhookSecret',
  'webhook_secret',
  'encryptionKey',
  'encryption_key',
  'stripeSecretKey',
  'stripe_secret_key',
  'squareAccessToken',
  'square_access_token',
  'mailchimpApiKey',
  'mailchimp_api_key',
  'quickbooksRefreshToken',
  'quickbooks_refresh_token',
]);

/**
 * Fields to mask (show partial)
 */
const MASKED_FIELDS = new Set([
  'email',
  'phone',
  'ssn',
  'accountNumber',
  'account_number',
  'cardNumber',
  'card_number',
]);

/**
 * Filter sensitive fields from object
 */
export function filterSensitiveFields<T extends Record<string, any>>(
  obj: T,
  depth = 0
): T {
  if (depth > 10) return obj;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => filterSensitiveFields(item, depth + 1)) as unknown as T;
  }
  
  const filtered: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Remove sensitive fields entirely
    if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
      continue; // Skip this field
    }
    
    // Mask partial sensitive fields
    if (MASKED_FIELDS.has(key) || MASKED_FIELDS.has(lowerKey)) {
      if (typeof value === 'string' && value.length > 4) {
        filtered[key] = maskString(value);
      } else {
        filtered[key] = '[MASKED]';
      }
      continue;
    }
    
    // Recursively filter nested objects
    if (typeof value === 'object' && value !== null) {
      filtered[key] = filterSensitiveFields(value, depth + 1);
    } else {
      filtered[key] = value;
    }
  }
  
  return filtered as T;
}

/**
 * Mask a string showing only first/last characters
 */
function maskString(str: string): string {
  if (str.length <= 4) return '****';
  if (str.length <= 8) return str.slice(0, 2) + '****';
  return str.slice(0, 2) + '****' + str.slice(-2);
}

// =============================================================================
// RESPONSE BUILDERS
// =============================================================================

/**
 * Build a successful response
 */
export function buildSuccessResponse<T>(
  data: T,
  options?: {
    requestId?: string;
    pagination?: PaginationMeta;
    tenant?: string;
  }
): ApiResponse<T> {
  const filteredData = filterSensitiveFields(data as Record<string, any>) as T;
  
  return {
    success: true,
    data: filteredData,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: options?.requestId,
      pagination: options?.pagination,
      tenant: options?.tenant,
      version: '1.0.0'
    }
  };
}

/**
 * Build a paginated response
 */
export function buildPaginatedResponse<T>(
  items: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
  },
  options?: {
    requestId?: string;
    tenant?: string;
  }
): ApiResponse<T[]> {
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  
  const filteredItems = items.map(item => 
    filterSensitiveFields(item as Record<string, any>)
  ) as T[];
  
  return {
    success: true,
    data: filteredItems,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: options?.requestId,
      tenant: options?.tenant,
      version: '1.0.0',
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages,
        hasNext: pagination.page < totalPages,
        hasPrevious: pagination.page > 1
      }
    }
  };
}

/**
 * Build an error response (RFC 7807)
 */
export function buildErrorResponse(
  status: number,
  title: string,
  options?: {
    type?: string;
    detail?: string;
    instance?: string;
    errors?: ValidationError[];
  }
): ApiResponse<never> {
  return {
    success: false,
    error: {
      type: options?.type || `urn:error:integration-service:${status}`,
      title,
      status,
      detail: options?.detail,
      instance: options?.instance,
      errors: options?.errors
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: options?.instance,
      version: '1.0.0'
    }
  };
}

/**
 * Build validation error response
 */
export function buildValidationErrorResponse(
  errors: ValidationError[],
  requestId?: string
): ApiResponse<never> {
  return buildErrorResponse(400, 'Validation Failed', {
    type: 'urn:error:integration-service:validation_error',
    detail: `${errors.length} validation error(s) occurred`,
    instance: requestId,
    errors
  });
}

// =============================================================================
// TYPE-SAFE RESPONSE HELPERS
// =============================================================================

/**
 * Integration response type
 */
export interface IntegrationResponse {
  id: string;
  tenantId: string;
  provider: string;
  name: string;
  description?: string;
  enabled: boolean;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  config?: Record<string, unknown>;
  lastSyncAt?: Date | string | null;
}

/**
 * Filter integration for response (remove sensitive OAuth tokens)
 */
export function filterIntegrationResponse(
  integration: Record<string, any>
): IntegrationResponse {
  return {
    id: integration.id,
    tenantId: integration.tenant_id || integration.tenantId,
    provider: integration.provider,
    name: integration.name,
    description: integration.description,
    enabled: integration.enabled,
    status: integration.status,
    createdAt: integration.created_at || integration.createdAt,
    updatedAt: integration.updated_at || integration.updatedAt,
    config: filterSensitiveFields(integration.config || {}),
    lastSyncAt: integration.last_sync_at || integration.lastSyncAt
  };
}

/**
 * Webhook response type
 */
export interface WebhookResponse {
  id: string;
  integrationId: string;
  provider: string;
  events: string[];
  status: string;
  createdAt: Date | string;
  lastReceivedAt?: Date | string | null;
}

/**
 * Filter webhook for response
 */
export function filterWebhookResponse(
  webhook: Record<string, any>
): WebhookResponse {
  return {
    id: webhook.id,
    integrationId: webhook.integration_id || webhook.integrationId,
    provider: webhook.provider,
    events: webhook.events || [],
    status: webhook.status,
    createdAt: webhook.created_at || webhook.createdAt,
    lastReceivedAt: webhook.last_received_at || webhook.lastReceivedAt
  };
}

/**
 * Sync job response type
 */
export interface SyncJobResponse {
  id: string;
  integrationId: string;
  syncType: string;
  status: string;
  progress: number;
  recordsProcessed: number;
  recordsFailed: number;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  errorMessage?: string | null;
}

/**
 * Filter sync job for response
 */
export function filterSyncJobResponse(
  job: Record<string, any>
): SyncJobResponse {
  return {
    id: job.id,
    integrationId: job.integration_id || job.integrationId,
    syncType: job.sync_type || job.syncType,
    status: job.status,
    progress: job.progress || 0,
    recordsProcessed: job.records_processed || job.recordsProcessed || 0,
    recordsFailed: job.records_failed || job.recordsFailed || 0,
    startedAt: job.started_at || job.startedAt,
    completedAt: job.completed_at || job.completedAt,
    // Only include error message in non-production or for admins
    errorMessage: !isProduction() ? (job.error_message || job.errorMessage) : undefined
  };
}

/**
 * Field mapping response type
 */
export interface FieldMappingResponse {
  id: string;
  integrationId: string;
  sourceField: string;
  targetField: string;
  transformer: string;
  required: boolean;
  enabled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Filter field mapping for response
 */
export function filterFieldMappingResponse(
  mapping: Record<string, any>
): FieldMappingResponse {
  return {
    id: mapping.id,
    integrationId: mapping.integration_id || mapping.integrationId,
    sourceField: mapping.source_field || mapping.sourceField,
    targetField: mapping.target_field || mapping.targetField,
    transformer: mapping.transformer,
    required: mapping.required,
    enabled: mapping.enabled,
    createdAt: mapping.created_at || mapping.createdAt,
    updatedAt: mapping.updated_at || mapping.updatedAt
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  filterSensitiveFields,
  buildSuccessResponse,
  buildPaginatedResponse,
  buildErrorResponse,
  buildValidationErrorResponse,
  filterIntegrationResponse,
  filterWebhookResponse,
  filterSyncJobResponse,
  filterFieldMappingResponse
};
