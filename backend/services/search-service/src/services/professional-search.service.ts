import { Client } from '@elastic/elasticsearch';
import pino from 'pino';
import Redis from 'ioredis';

export class ProfessionalSearchService {
  private elasticsearch: Client;
  private redis: Redis;
  private logger: pino.Logger;

  constructor({ elasticsearch, redis, logger }: any) {
    this.elasticsearch = elasticsearch;
    this.redis = redis;
    this.logger = logger;
  }

  // Main search with ALL features
  async search(params: {
    query?: string;
    type?: string;
    filters?: any;
    sort?: string;
    page?: number;
    limit?: number;
    userId?: string;
    location?: { lat: number; lon: number };
    distance?: string;
  }) {
    const {
      query = '',
      type,
      filters = {},
      sort = '_score',
      page = 1,
      limit = 20,
      userId,
      location,
      distance = '10km'
    } = params;

    // Check cache
    const cacheKey = `search:${JSON.stringify(params)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.info('Cache hit');
      return JSON.parse(cached);
    }

    try {
      const indices = type ? [type] : ['venues', 'events'];
      
      // Build query
      const must = [];
      const filter = [];
      const should: any[] = [];

      // Text search with synonyms
      if (query) {
        must.push({
          multi_match: {
            query: query,
            fields: ['name^3', 'description^2', 'artist^2', 'genre', 'city'],
            fuzziness: 'AUTO',
            prefix_length: 2,
            max_expansions: 50
          }
        });
      }

      // Geo-location filter
      if (location) {
        filter.push({
          geo_distance: {
            distance: distance,
            location: location
          }
        });
      }

      // Price range filter
      if (filters.priceMin || filters.priceMax) {
        const priceRange: any = {};
        if (filters.priceMin) priceRange.gte = filters.priceMin;
        if (filters.priceMax) priceRange.lte = filters.priceMax;
        filter.push({ range: { price: priceRange } });
      }

      // Date range filter
      if (filters.dateFrom || filters.dateTo) {
        const dateRange: any = {};
        if (filters.dateFrom) dateRange.gte = filters.dateFrom;
        if (filters.dateTo) dateRange.lte = filters.dateTo;
        filter.push({ range: { date: dateRange } });
      }

      // Category filter
      if (filters.categories?.length) {
        filter.push({ terms: { category: filters.categories } });
      }

      // Capacity filter
      if (filters.capacityMin || filters.capacityMax) {
        const capacityRange: any = {};
        if (filters.capacityMin) capacityRange.gte = filters.capacityMin;
        if (filters.capacityMax) capacityRange.lte = filters.capacityMax;
        filter.push({ range: { capacity: capacityRange } });
      }

      // NEW: Performer filter (nested query)
      if (filters.performer) {
        must.push({
          nested: {
            path: 'performers',
            query: {
              match: { 
                'performers.name': { 
                  query: filters.performer, 
                  fuzziness: 'AUTO' 
                } 
              }
            }
          }
        });
      }

      // NEW: Genre filter (nested query)
      if (filters.genre) {
        must.push({
          nested: {
            path: 'performers',
            query: { 
              match: { 'performers.genre': filters.genre } 
            }
          }
        });
      }

      // NEW: Amenities filter (venues)
      if (filters.amenities?.length) {
        filter.push({ 
          terms: { amenities: filters.amenities } 
        });
      }

      // NEW: Accessibility features filter (venues)
      if (filters.accessibility?.length) {
        filter.push({ 
          terms: { accessibilityFeatures: filters.accessibility } 
        });
      }

      // NEW: Minimum rating filter
      if (filters.minRating) {
        filter.push({ 
          range: { 'ratings.averageRating': { gte: filters.minRating } } 
        });
      }

      // Build sort
      const sortOptions = this.buildSort(sort, location);

      // Execute search
      const response = await this.elasticsearch.search(<any>{
        index: indices,
        from: (page - 1) * limit,
        size: limit,
        body: {
          query: {
            bool: {
              must: must.length ? must : { match_all: {} },
              filter,
              should,
              boost: 1.0
            }
          },
          sort: sortOptions,
          aggs: this.buildAggregations(),
          highlight: {
            fields: {
              name: { pre_tags: ['<mark>'], post_tags: ['</mark>'] },
              description: { pre_tags: ['<mark>'], post_tags: ['</mark>'] },
              artist: { pre_tags: ['<mark>'], post_tags: ['</mark>'] }
            }
          },
          suggest: query ? {
            text: query,
            simple_phrase: {
              phrase: {
                field: 'name',
                size: 1,
                gram_size: 3,
                direct_generator: [{
                  field: 'name',
                  suggest_mode: 'always'
                }]
              }
            }
          } : undefined
        }
      });

      // Format results
      const results = {
        success: true,
        query,
        total: (response.hits.total as any)?.value || 0,
        page,
        pages: Math.ceil((response.hits.total as any)?.value || 0 / limit),
        results: response.hits.hits.map((hit: any) => ({
          type: hit._index,
          id: hit._id,
          score: hit._score,
          distance: hit.sort?.[0],
          data: hit._source,
          highlights: hit.highlight
        })),
        facets: this.formatFacets(response.aggregations),
        suggestions: (response.suggest?.simple_phrase as any)?.[0]?.options?.[0]?.text
      };

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(results));

      // Track search
      await this.trackSearch(query, results.total, userId, filters);

      // Personalize results if user is logged in
      if (userId) {
        results.results = await this.personalizeResults(results.results, userId);
      }

      return results;
    } catch (error) {
      this.logger.error({ error }, 'Search failed');
      throw error;
    }
  }

  // Near me search
  async searchNearMe(lat: number, lon: number, distance: string = '10km', type?: string) {
    return this.search({
      location: { lat, lon },
      distance,
      type,
      sort: 'distance'
    });
  }

  // Trending searches
  async getTrending(limit: number = 10) {
    const cached = await this.redis.get('trending');
    if (cached) return JSON.parse(cached);

    try {
      const response = await this.elasticsearch.search({
        index: 'search_analytics',
        size: 0,
        body: {
          query: {
            range: {
              timestamp: {
                gte: 'now-7d'
              }
            }
          },
          aggs: {
            trending: {
              terms: {
                field: 'query.keyword',
                size: limit,
                order: { _count: 'desc' }
              }
            }
          }
        }
      });

      const trending = (response.aggregations?.trending as any)?.buckets || [];
      await this.redis.setex('trending', 3600, JSON.stringify(trending));
      return trending;
    } catch (error) {
      this.logger.error({ error }, 'Failed to get trending');
      return [];
    }
  }

  // Similar items (more like this)
  async findSimilar(index: string, id: string) {
    try {
      const response = await this.elasticsearch.search({
        index: index,
        body: {
          query: {
            more_like_this: {
              fields: ['name', 'description', 'category', 'genre'],
              like: [{ _index: index, _id: id }],
              min_term_freq: 1,
              max_query_terms: 12
            }
          }
        }
      });

      return response.hits.hits.map((hit: any) => ({
        id: hit._id,
        score: hit._score,
        ...hit._source
      }));
    } catch (error) {
      this.logger.error({ error }, 'Similar search failed');
      return [];
    }
  }

  private buildSort(sort: string, location?: any) {
    const sortOptions: any[] = [];

    switch (sort) {
      case 'distance':
        if (location) {
          sortOptions.push({
            _geo_distance: {
              location: location,
              order: 'asc',
              unit: 'km',
              distance_type: 'arc'
            }
          });
        }
        break;
      case 'date_asc':
        sortOptions.push({ date: 'asc' });
        break;
      case 'date_desc':
        sortOptions.push({ date: 'desc' });
        break;
      case 'price_asc':
        sortOptions.push({ price: 'asc' });
        break;
      case 'price_desc':
        sortOptions.push({ price: 'desc' });
        break;
      case 'popularity':
        sortOptions.push({ popularity_score: 'desc' });
        break;
      default:
        sortOptions.push('_score');
    }

    sortOptions.push({ created_at: 'desc' });
    return sortOptions;
  }

  private buildAggregations() {
    return {
      categories: {
        terms: { field: 'category.keyword', size: 20 }
      },
      price_ranges: {
        range: {
          field: 'price',
          ranges: [
            { key: 'Under $50', to: 50 },
            { key: '$50-$100', from: 50, to: 100 },
            { key: '$100-$200', from: 100, to: 200 },
            { key: '$200+', from: 200 }
          ]
        }
      },
      venues: {
        terms: { field: 'venue_name.keyword', size: 15 }
      },
      dates: {
        date_histogram: {
          field: 'date',
          calendar_interval: 'month',
          format: 'yyyy-MM'
        }
      },
      avg_price: {
        avg: { field: 'price' }
      },
      // NEW: Performer aggregation (nested)
      performers: {
        nested: { path: 'performers' },
        aggs: { 
          names: { 
            terms: { field: 'performers.name.keyword', size: 20 } 
          } 
        }
      },
      // NEW: Genre aggregation (nested)
      genres: {
        nested: { path: 'performers' },
        aggs: { 
          names: { 
            terms: { field: 'performers.genre.keyword', size: 20 } 
          } 
        }
      },
      // NEW: Amenities aggregation
      amenities: {
        terms: { field: 'amenities', size: 20 }
      },
      // NEW: Accessibility aggregation
      accessibility: {
        terms: { field: 'accessibilityFeatures', size: 20 }
      },
      // NEW: Ratings histogram
      ratings: {
        histogram: { 
          field: 'ratings.averageRating', 
          interval: 1,
          min_doc_count: 0
        }
      },
      // NEW: Average rating
      avgRating: {
        avg: { field: 'ratings.averageRating' }
      }
    };
  }

  private formatFacets(aggregations: any) {
    if (!aggregations) return {};

    return {
      categories: aggregations.categories?.buckets?.map((b: any) => ({
        name: b.key,
        count: b.doc_count
      })) || [],
      priceRanges: aggregations.price_ranges?.buckets?.map((b: any) => ({
        range: b.key,
        count: b.doc_count
      })) || [],
      venues: aggregations.venues?.buckets?.map((b: any) => ({
        name: b.key,
        count: b.doc_count
      })) || [],
      months: aggregations.dates?.buckets?.map((b: any) => ({
        month: b.key_as_string,
        count: b.doc_count
      })) || [],
      avgPrice: aggregations.avg_price?.value || 0,
      // NEW: Performer facets (nested aggregation)
      performers: aggregations.performers?.names?.buckets?.map((b: any) => ({
        name: b.key,
        count: b.doc_count
      })) || [],
      // NEW: Genre facets (nested aggregation)
      genres: aggregations.genres?.names?.buckets?.map((b: any) => ({
        name: b.key,
        count: b.doc_count
      })) || [],
      // NEW: Amenities facets
      amenities: aggregations.amenities?.buckets?.map((b: any) => ({
        name: b.key,
        count: b.doc_count
      })) || [],
      // NEW: Accessibility facets
      accessibility: aggregations.accessibility?.buckets?.map((b: any) => ({
        name: b.key,
        count: b.doc_count
      })) || [],
      // NEW: Ratings histogram
      ratingsDistribution: aggregations.ratings?.buckets?.map((b: any) => ({
        rating: b.key,
        count: b.doc_count
      })) || [],
      avgRating: aggregations.avgRating?.value || 0
    };
  }

  private async trackSearch(query: string, resultsCount: number, userId?: string, filters?: any) {
    try {
      await this.elasticsearch.index({
        index: 'search_analytics',
        body: {
          query,
          results_count: resultsCount,
          user_id: userId,
          filters,
          timestamp: new Date()
        }
      });
    } catch (error) {
      this.logger.debug({ error }, 'Failed to track search');
    }
  }

  private async personalizeResults(results: any[], _userId: string) {
    // Get user preferences from database
    // Boost results based on user history
    // This is a placeholder - implement based on your user model
    return results;
  }
}
