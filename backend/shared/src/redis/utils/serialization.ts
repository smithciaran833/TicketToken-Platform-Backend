/**
 * Redis Serialization Utility
 * 
 * Handles serialization and deserialization of data for Redis storage.
 * Supports JSON with enhanced handling for Dates, BigInts, and error recovery.
 */

/**
 * Serialize data for Redis storage
 * 
 * @param data - Data to serialize
 * @returns Serialized string
 */
export function serialize(data: any): string {
  if (data === null || data === undefined) {
    return '';
  }
  
  // If already a string, return as-is
  if (typeof data === 'string') {
    return data;
  }
  
  // For primitives, convert to string
  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }
  
  // For objects and arrays, use JSON with custom replacer
  return JSON.stringify(data, jsonReplacer);
}

/**
 * Deserialize data from Redis
 * 
 * @param data - Serialized string from Redis
 * @returns Deserialized data
 */
export function deserialize<T = any>(data: string | null): T | null {
  if (!data || data === '') {
    return null;
  }
  
  // Try to parse as JSON first
  try {
    return JSON.parse(data, jsonReviver) as T;
  } catch (error) {
    // If JSON parsing fails, return the string as-is
    // This handles cases where data is a plain string
    return data as unknown as T;
  }
}

/**
 * Safe deserialize that returns default value on error
 * 
 * @param data - Serialized string from Redis
 * @param defaultValue - Default value to return on error
 * @returns Deserialized data or default value
 */
export function deserializeSafe<T>(data: string | null, defaultValue: T): T {
  try {
    const result = deserialize<T>(data);
    return result !== null ? result : defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

/**
 * JSON replacer function for handling special types
 * 
 * Handles:
 * - Date objects (converts to ISO string with metadata)
 * - BigInt (converts to string with metadata)
 * - undefined (converts to null)
 * - NaN and Infinity (converts to null)
 */
function jsonReplacer(_key: string, value: any): any {
  // Handle Date objects
  if (value instanceof Date) {
    return {
      __type: 'Date',
      __value: value.toISOString(),
    };
  }
  
  // Handle BigInt
  if (typeof value === 'bigint') {
    return {
      __type: 'BigInt',
      __value: value.toString(),
    };
  }
  
  // Handle undefined (convert to null in JSON)
  if (value === undefined) {
    return null;
  }
  
  // Handle NaN and Infinity
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return null;
    }
    if (!Number.isFinite(value)) {
      return null;
    }
  }
  
  return value;
}

/**
 * JSON reviver function for restoring special types
 * 
 * Restores:
 * - Date objects from ISO strings
 * - BigInt from strings
 */
function jsonReviver(_key: string, value: any): any {
  // Check if this is a special type object
  if (
    value &&
    typeof value === 'object' &&
    '__type' in value &&
    '__value' in value
  ) {
    switch (value.__type) {
      case 'Date':
        return new Date(value.__value);
      
      case 'BigInt':
        return BigInt(value.__value);
      
      default:
        return value;
    }
  }
  
  return value;
}

/**
 * Check if data is serialized (looks like JSON)
 */
export function isSerialized(data: string): boolean {
  if (!data || data === '') {
    return false;
  }
  
  // Check if it starts with { or [ (JSON objects/arrays)
  const firstChar = data.trim()[0];
  return firstChar === '{' || firstChar === '[';
}

/**
 * Serialize with compression for large values
 * 
 * Note: Actual compression would require a compression library
 * This is a placeholder showing the pattern
 */
export function serializeCompressed(data: any, threshold: number = 1024): string {
  const serialized = serialize(data);
  
  // If data is smaller than threshold, return as-is
  if (serialized.length < threshold) {
    return serialized;
  }
  
  // TODO: Add actual compression here if needed (e.g., using zlib)
  // For now, just return serialized data
  // In a real implementation, you would:
  // 1. Compress the data
  // 2. Prepend a marker to indicate compression
  // 3. Return the compressed result
  
  return serialized;
}

/**
 * Deserialize compressed data
 */
export function deserializeCompressed<T = any>(data: string | null): T | null {
  if (!data) {
    return null;
  }
  
  // TODO: Check for compression marker and decompress if needed
  // For now, just deserialize normally
  
  return deserialize<T>(data);
}

/**
 * Batch serialize multiple values
 */
export function serializeBatch(items: any[]): string[] {
  return items.map(item => serialize(item));
}

/**
 * Batch deserialize multiple values
 */
export function deserializeBatch<T = any>(items: (string | null)[]): (T | null)[] {
  return items.map(item => deserialize<T>(item));
}

/**
 * Serialize to a format suitable for Redis Hash fields
 * 
 * Hash fields must be strings, so this ensures proper serialization
 */
export function serializeHashField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  // Primitives can be converted directly
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  // Complex types need JSON serialization
  return serialize(value);
}

/**
 * Deserialize from Redis Hash field
 */
export function deserializeHashField<T = any>(value: string): T {
  // Try to deserialize as JSON first
  try {
    return deserialize<T>(value) as T;
  } catch {
    // If that fails, return as-is
    return value as unknown as T;
  }
}

/**
 * Serialize object to Redis Hash
 * 
 * Converts an object to a Record<string, string> suitable for HMSET
 */
export function serializeToHash(obj: Record<string, any>): Record<string, string> {
  const hash: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    hash[key] = serializeHashField(value);
  }
  
  return hash;
}

/**
 * Deserialize Redis Hash to object
 * 
 * Converts Record<string, string> back to original object types
 */
export function deserializeFromHash<T = any>(hash: Record<string, string> | null): T | null {
  if (!hash) {
    return null;
  }
  
  const obj: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(hash)) {
    obj[key] = deserializeHashField(value);
  }
  
  return obj as T;
}

/**
 * Validate serialized data
 * 
 * Checks if data can be deserialized without errors
 */
export function validateSerialized(data: string): boolean {
  try {
    deserialize(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get size of serialized data in bytes
 */
export function getSerializedSize(data: any): number {
  const serialized = serialize(data);
  // Approximate byte size (works for ASCII, may vary for UTF-8)
  return new Blob([serialized]).size;
}

/**
 * Truncate serialized data to maximum size
 * 
 * Useful for preventing very large cache entries
 */
export function truncateSeralized(data: string, maxBytes: number): string {
  if (data.length <= maxBytes) {
    return data;
  }
  
  // Truncate and validate it's still valid
  const truncated = data.substring(0, maxBytes);
  
  // Try to find a valid JSON boundary if it's JSON
  if (isSerialized(truncated)) {
    // Find last complete JSON object/array
    for (let i = truncated.length - 1; i >= 0; i--) {
      const char = truncated[i];
      if (char === '}' || char === ']') {
        const candidate = truncated.substring(0, i + 1);
        if (validateSerialized(candidate)) {
          return candidate;
        }
      }
    }
  }
  
  return truncated;
}
