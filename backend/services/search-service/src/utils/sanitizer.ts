export class SearchSanitizer {
  static sanitizeQuery(query: string): string {
    if (!query) return '';
    
    // Remove special characters that could break Elasticsearch
    return query
      .replace(/[<>]/g, '')
      .replace(/[{}[\]]/g, '')
      .replace(/\\/g, '')
      .trim()
      .substring(0, 200); // Max query length
  }

  static sanitizeFilters(filters: any): any {
    const cleaned: any = {};
    
    // Whitelist allowed filter fields
    const allowedFields = [
      'priceMin', 'priceMax',
      'dateFrom', 'dateTo',
      'categories', 'venues',
      'capacityMin', 'capacityMax'
    ];
    
    for (const field of allowedFields) {
      if (filters[field] !== undefined) {
        cleaned[field] = filters[field];
      }
    }
    
    return cleaned;
  }
}
