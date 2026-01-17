/**
 * Response Filter for Compliance Service
 *
 * Filters sensitive data from API responses to prevent
 * accidental exposure of PII, credentials, and internal data.
 */

import { logger } from './logger';

// =============================================================================
// SENSITIVE FIELDS
// =============================================================================

const SENSITIVE_FIELDS = new Set([
  // PII - Tax/Financial
  'ein',
  'ssn',
  'taxId',
  'tax_id',
  'socialSecurityNumber',
  'social_security_number',

  // Bank Information
  'accountNumber',
  'account_number',
  'routingNumber',
  'routing_number',
  'bankAccount',
  'bank_account',
  'iban',
  'swiftCode',
  'swift_code',

  // Personal Information
  'dateOfBirth',
  'date_of_birth',
  'dob',
  'driversLicense',
  'drivers_license',

  // Credentials
  'password',
  'secret',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'private_key',

  // Internal
  'internalId',
  'internal_id',
  'plaidAccessToken',
  'plaid_access_token',
  'stripeSecretKey',
  'stripe_secret_key'
]);

// Fields that should be partially redacted
const PARTIAL_REDACT_FIELDS: Record<string, (value: string) => string> = {
  email: (v) => v.replace(/^(.{1,2}).*(@.*)$/, '$1***$2'),
  phone: (v) => v.replace(/^(.{3}).*(.{4})$/, '$1****$2'),
  phoneNumber: (v) => v.replace(/^(.{3}).*(.{4})$/, '$1****$2'),
  phone_number: (v) => v.replace(/^(.{3}).*(.{4})$/, '$1****$2')
};

// =============================================================================
// FILTER FUNCTIONS
// =============================================================================

/**
 * Filter sensitive data from a response object
 */
export function filterResponse<T>(data: T, options?: {
  /** Additional fields to redact */
  additionalFields?: string[];
  /** Fields to exclude from filtering */
  excludeFields?: string[];
  /** Whether to log redactions */
  logRedactions?: boolean;
}): T {
  if (data === null || data === undefined) {
    return data;
  }

  const additionalFields = new Set(options?.additionalFields || []);
  const excludeFields = new Set(options?.excludeFields || []);
  const logRedactions = options?.logRedactions ?? false;

  return filterRecursive(data, additionalFields, excludeFields, logRedactions, '');
}

function filterRecursive<T>(
  data: T,
  additionalFields: Set<string>,
  excludeFields: Set<string>,
  logRedactions: boolean,
  path: string
): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item, index) =>
      filterRecursive(item, additionalFields, excludeFields, logRedactions, `${path}[${index}]`)
    ) as T;
  }

  if (typeof data === 'object' && data !== null) {
    const filtered: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Skip excluded fields
      if (excludeFields.has(key)) {
        filtered[key] = value;
        continue;
      }

      // Check if field should be fully redacted
      if (SENSITIVE_FIELDS.has(key) || additionalFields.has(key)) {
        if (logRedactions && value !== undefined && value !== null) {
          logger.debug({ field: currentPath }, 'Redacted sensitive field from response');
        }
        filtered[key] = '[REDACTED]';
        continue;
      }

      // Check if field should be partially redacted
      if (key in PARTIAL_REDACT_FIELDS && typeof value === 'string') {
        filtered[key] = PARTIAL_REDACT_FIELDS[key](value);
        continue;
      }

      // Recursively filter nested objects
      filtered[key] = filterRecursive(value, additionalFields, excludeFields, logRedactions, currentPath);
    }

    return filtered as T;
  }

  return data;
}

// =============================================================================
// COMPLIANCE-SPECIFIC FILTERS
// =============================================================================

/**
 * Filter W9 response data
 */
export function filterW9Response(data: any): any {
  return filterResponse(data, {
    additionalFields: ['einFull', 'einOriginal']
  });
}

/**
 * Filter tax record response
 */
export function filterTaxResponse(data: any): any {
  return filterResponse(data, {
    additionalFields: ['internalTaxId', 'irsSubmissionId']
  });
}

/**
 * Filter bank verification response
 */
export function filterBankResponse(data: any): any {
  return filterResponse(data, {
    additionalFields: ['plaidItemId', 'processorToken', 'fullAccountNumber']
  });
}

/**
 * Filter GDPR export response (keep some PII for export)
 */
export function filterGDPRExportResponse(data: any): any {
  // GDPR exports should include user's own data
  // Only filter credentials and internal system data
  return filterResponse(data, {
    excludeFields: ['email', 'phone', 'phoneNumber', 'dateOfBirth'],
    additionalFields: ['internalProcessId', 'systemNotes']
  });
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Express middleware to filter all JSON responses
 */
export function responseFilterMiddleware(options?: {
  additionalFields?: string[];
  excludeFields?: string[];
}) {
  return (req: any, res: any, next: any) => {
    const originalJson = res.json.bind(res);

    res.json = (data: any) => {
      const filtered = filterResponse(data, {
        additionalFields: options?.additionalFields,
        excludeFields: options?.excludeFields
      });
      return originalJson(filtered);
    };

    next();
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  filterResponse,
  filterW9Response,
  filterTaxResponse,
  filterBankResponse,
  filterGDPRExportResponse,
  responseFilterMiddleware
};
