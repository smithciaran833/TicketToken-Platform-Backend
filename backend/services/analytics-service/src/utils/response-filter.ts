/**
 * Response Filter Utility
 * AUDIT FIX: SEC-6 - Prevent sensitive data leakage in responses
 */

// Sensitive field patterns to remove from responses
const SENSITIVE_FIELDS = [
  'password', 'secret', 'token', 'api_key', 'apiKey', 'private_key', 'privateKey',
  'ssn', 'social_security', 'credit_card', 'creditCard', 'cvv', 'pin',
  'auth_token', 'authToken', 'refresh_token', 'refreshToken', 'access_token',
  'encryption_key', 'encryptionKey', 'signing_key', 'signingKey',
  'salt', 'hash', 'internal_id', 'internalId', '_id', '__v'
];

// Fields to mask partially (show last 4 characters)
const PARTIAL_MASK_FIELDS = ['phone', 'email', 'account_number', 'wallet_address'];

/**
 * Deep filter sensitive fields from an object
 */
export function filterResponse<T>(data: T, depth = 0): T {
  if (depth > 10) return data; // Prevent infinite recursion
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map(item => filterResponse(item, depth + 1)) as unknown as T;
  }

  if (typeof data === 'object') {
    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      const lowerKey = key.toLowerCase();
      
      // Remove sensitive fields entirely
      if (SENSITIVE_FIELDS.some(f => lowerKey.includes(f.toLowerCase()))) {
        continue; // Skip this field
      }
      
      // Partially mask certain fields
      if (typeof value === 'string' && PARTIAL_MASK_FIELDS.some(f => lowerKey.includes(f))) {
        filtered[key] = maskString(value);
      } else if (typeof value === 'object') {
        filtered[key] = filterResponse(value, depth + 1);
      } else {
        filtered[key] = value;
      }
    }
    return filtered as T;
  }

  return data;
}

/**
 * Mask a string, showing only last 4 characters
 */
function maskString(value: string): string {
  if (value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

/**
 * Filter stack traces in production
 */
export function filterError(error: any, isProduction: boolean): any {
  if (!isProduction) return error;
  
  const filtered: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(error)) {
    // Remove stack traces and internal details in production
    if (['stack', 'stackTrace', 'cause', 'originalError'].includes(key)) {
      continue;
    }
    filtered[key] = value;
  }
  
  return filtered;
}

/**
 * Create a safe response object
 */
export function safeResponse<T>(data: T, options?: { includeNull?: boolean }): T {
  const filtered = filterResponse(data);
  
  // Optionally remove null/undefined values
  if (!options?.includeNull && typeof filtered === 'object' && filtered !== null) {
    return removeNullValues(filtered);
  }
  
  return filtered;
}

function removeNullValues<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.filter(v => v !== null && v !== undefined).map(removeNullValues) as unknown as T;
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj as Record<string, any>)) {
      if (value !== null && value !== undefined) {
        result[key] = removeNullValues(value);
      }
    }
    return result as T;
  }
  
  return obj;
}

export default { filterResponse, filterError, safeResponse };
