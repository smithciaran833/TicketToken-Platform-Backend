/**
 * Search Input Sanitizer
 * CRITICAL SECURITY: Sanitizes all user input before passing to Elasticsearch
 * Prevents query injection and malformed queries
 */

export interface SanitizedQuery {
  query: string;
  isValid: boolean;
  originalLength: number;
}

export class SearchSanitizer {
  private static readonly MAX_QUERY_LENGTH = 200;
  private static readonly MIN_QUERY_LENGTH = 0;
  
  /**
   * Sanitizes search query strings
   * Removes dangerous characters that could break or exploit Elasticsearch
   */
  static sanitizeQuery(query: string | any): string {
    // Handle null/undefined/non-string inputs
    if (!query || typeof query !== 'string') {
      return '';
    }
    
    // Remove special characters that could break Elasticsearch
    let sanitized = query
      .replace(/[<>]/g, '')           // HTML/XML tags
      .replace(/[{}[\]]/g, '')        // JSON/array brackets
      .replace(/\\/g, '')             // Escape characters
      .replace(/['"]/g, '')           // Quotes
      .replace(/[;|&$]/g, '')         // Command injection chars
      .replace(/\0/g, '')             // Null bytes
      .trim();
    
    // Limit length to prevent DoS
    sanitized = sanitized.substring(0, this.MAX_QUERY_LENGTH);
    
    return sanitized;
  }

  /**
   * Sanitizes and validates query with metadata
   */
  static sanitizeQueryWithValidation(query: string | any): SanitizedQuery {
    const originalLength = query ? String(query).length : 0;
    const sanitized = this.sanitizeQuery(query);
    
    return {
      query: sanitized,
      isValid: sanitized.length > this.MIN_QUERY_LENGTH,
      originalLength
    };
  }

  /**
   * Sanitizes filter objects
   * Only allows whitelisted fields to prevent injection
   */
  static sanitizeFilters(filters: any): any {
    if (!filters || typeof filters !== 'object') {
      return {};
    }
    
    const cleaned: any = {};
    
    // Whitelist allowed filter fields
    const allowedFields = [
      'priceMin', 'priceMax',
      'dateFrom', 'dateTo',
      'categories', 'venues',
      'capacityMin', 'capacityMax',
      'status', 'type'
    ];
    
    for (const field of allowedFields) {
      if (filters[field] !== undefined && filters[field] !== null) {
        // Sanitize string values
        if (typeof filters[field] === 'string') {
          cleaned[field] = this.sanitizeQuery(filters[field]);
        } else if (typeof filters[field] === 'number') {
          // Validate numbers
          if (Number.isFinite(filters[field])) {
            cleaned[field] = filters[field];
          }
        } else if (Array.isArray(filters[field])) {
          // Sanitize array elements
          cleaned[field] = filters[field]
            .filter(item => item !== null && item !== undefined)
            .map(item => typeof item === 'string' ? this.sanitizeQuery(item) : item)
            .slice(0, 50); // Limit array size
        } else {
          cleaned[field] = filters[field];
        }
      }
    }
    
    return cleaned;
  }

  /**
   * Sanitizes numeric inputs (limit, page, etc.)
   */
  static sanitizeNumber(value: any, defaultValue: number, min: number, max: number): number {
    const num = parseInt(String(value), 10);
    
    if (isNaN(num)) {
      return defaultValue;
    }
    
    // Clamp to min/max range
    return Math.max(min, Math.min(max, num));
  }

  /**
   * Sanitizes coordinate values for geo-search
   */
  static sanitizeCoordinate(value: any, type: 'lat' | 'lon'): number | null {
    const num = parseFloat(String(value));
    
    if (isNaN(num)) {
      return null;
    }
    
    // Validate coordinate ranges
    if (type === 'lat') {
      return num >= -90 && num <= 90 ? num : null;
    } else {
      return num >= -180 && num <= 180 ? num : null;
    }
  }
}
