import { Client } from '@elastic/elasticsearch';
import pino from 'pino';
import { ConsistencyService } from './consistency.service';
import { addTenantFilter, canAccessCrossTenant } from '../utils/tenant-filter';

export class SearchService {
  private elasticsearch: Client;
  private logger: pino.Logger;
  private consistencyService: ConsistencyService;

  constructor({ elasticsearch, logger, consistencyService }: any) {
    this.elasticsearch = elasticsearch;
    this.logger = logger;
    this.consistencyService = consistencyService;
  }

  async search(
    query: string, 
    type?: string, 
    limit: number = 20,
    options?: {
      consistencyToken?: string;
      waitForConsistency?: boolean;
      userId?: string;
      venueId?: string;
      userRole?: string;
    }
  ) {
    this.logger.info({ query, type, options }, 'Searching');

    // Wait for consistency if token provided
    if (options?.consistencyToken && options?.waitForConsistency !== false) {
      const consistent = await this.consistencyService.waitForConsistency(
        options.consistencyToken,
        5000 // Max 5 seconds wait
      );

      if (!consistent) {
        this.logger.warn('Search performed without full consistency', {
          token: options.consistencyToken
        });
      }
    }

    try {
      const indices = type ? [type] : ['venues', 'events'];

      // Build base query
      let esQuery: any = query ? {
        multi_match: {
          query: query,
          fields: ['name^2', 'description', 'city', 'venue_name'],
          fuzziness: 'AUTO'
        }
      } : {
        match_all: {}
      };

      // SECURITY: Add tenant isolation filter
      // Only allow cross-tenant access for admin roles
      if (options?.venueId) {
        const allowCrossTenant = !!(options?.userRole && canAccessCrossTenant(options.userRole));
        esQuery = addTenantFilter(esQuery, {
          venueId: options.venueId,
          allowCrossTenant
        });
      }

      const response = await this.elasticsearch.search({
        index: indices,
        size: limit,
        body: {
          query: esQuery,
          // Add version-based filtering if needed
          ...(options?.consistencyToken ? {
            min_score: 0.01,
            track_total_hits: true
          } : {})
        },
        // Use preference for session stickiness
        preference: options?.userId || options?.consistencyToken || undefined
      });

      const results = {
        success: true,
        query,
        total: (response.hits.total as any)?.value || 0,
        results: response.hits.hits.map((hit: any) => ({
          type: hit._index,
          id: hit._id,
          score: hit._score,
          data: hit._source,
          version: hit._source._version
        })),
        consistency: options?.consistencyToken ? 'checked' : 'none'
      };

      // Track the search
      await this.trackSearch(query, results.total, options?.userId);

      return results;
    } catch (error) {
      this.logger.error({ error }, 'Search failed');
      return {
        success: false,
        query,
        results: [],
        total: 0,
        error: 'Search failed',
        consistency: 'error'
      };
    }
  }

  async searchVenues(query: string, options?: any) {
    return this.search(query, 'venues', 20, options);
  }

  async searchEvents(query: string, options?: any) {
    return this.search(query, 'events', 20, options);
  }

  async searchEventsByDate(dateFrom?: string, dateTo?: string, options?: any) {
    // Wait for consistency if needed
    if (options?.consistencyToken) {
      await this.consistencyService.waitForConsistency(options.consistencyToken);
    }

    const mustClauses = [];

    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom) range.gte = dateFrom;
      if (dateTo) range.lte = dateTo;
      mustClauses.push({ range: { date: range } });
    }

    try {
      // Build base query with date filters
      let esQuery: any = {
        bool: {
          must: mustClauses.length ? mustClauses : [{ match_all: {} }]
        }
      };

      // SECURITY: Add tenant isolation filter
      if (options?.venueId) {
        const allowCrossTenant = !!(options?.userRole && canAccessCrossTenant(options.userRole));
        esQuery = addTenantFilter(esQuery, {
          venueId: options.venueId,
          allowCrossTenant
        });
      }

      const response = await this.elasticsearch.search({
        index: 'events',
        body: {
          query: esQuery,
          sort: [{ date: 'asc' }]
        },
        preference: options?.userId || options?.consistencyToken
      });

      return {
        success: true,
        total: (response.hits.total as any)?.value || 0,
        results: response.hits.hits.map((hit: any) => ({
          id: hit._id,
          ...hit._source
        })),
        consistency: options?.consistencyToken ? 'checked' : 'none'
      };
    } catch (error) {
      this.logger.error({ error }, 'Date search failed');
      return { success: false, results: [], consistency: 'error' };
    }
  }

  async trackSearch(query: string, resultsCount: number, userId?: string) {
    try {
      await this.elasticsearch.index({
        index: 'search_analytics',
        body: {
          query,
          results_count: resultsCount,
          user_id: userId || null,
          timestamp: new Date()
        }
      });
    } catch (error) {
      // Silent fail - don't break search if analytics fails
      this.logger.debug({ error }, 'Failed to track search');
    }
  }

  async getPopularSearches(limit: number = 10) {
    try {
      const response = await this.elasticsearch.search({
        index: 'search_analytics',
        size: 0,
        body: {
          aggs: {
            popular_queries: {
              terms: {
                field: 'query.keyword',
                size: limit
              }
            }
          }
        }
      });

      return (response.aggregations?.popular_queries as any)?.buckets || [];
    } catch (error) {
      this.logger.error({ error }, 'Failed to get popular searches');
      return [];
    }
  }
}
