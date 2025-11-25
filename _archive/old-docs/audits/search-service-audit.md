# DATABASE AUDIT: search-service
Generated: Thu Oct  2 15:05:55 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.0.1",
    "pg": "^8.16.3",
    "pino": "^8.21.0",
    "pino-pretty": "^10.2.0",
```

## 2. DATABASE CONFIGURATION FILES
### database.ts
```typescript
import knex from 'knex';
import { logger } from '../utils/logger';

export const dbConfig = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  pool: {
    min: 5,
    max: 20
  }
};

export const db = knex(dbConfig);

export async function connectDatabase(): Promise<void> {
  try {
    await db.raw('SELECT 1');
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}
```


## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/search-service//src/services/consistency.service.ts:80:        'SELECT id FROM index_queue WHERE idempotency_key = $1',
backend/services/search-service//src/services/consistency.service.ts:92:        INSERT INTO index_versions (entity_type, entity_id, version)
backend/services/search-service//src/services/consistency.service.ts:106:        INSERT INTO index_queue (
backend/services/search-service//src/services/consistency.service.ts:171:        UPDATE index_versions
backend/services/search-service//src/services/consistency.service.ts:190:        UPDATE index_versions
backend/services/search-service//src/services/consistency.service.ts:214:      SELECT version FROM index_versions
backend/services/search-service//src/services/consistency.service.ts:227:      INSERT INTO read_consistency_tokens (token, client_id, required_versions, expires_at)
backend/services/search-service//src/services/consistency.service.ts:250:      FROM read_consistency_tokens
backend/services/search-service//src/services/consistency.service.ts:287:          FROM index_versions
backend/services/search-service//src/services/consistency.service.ts:330:        SELECT * FROM index_queue
backend/services/search-service//src/services/consistency.service.ts:350:            UPDATE index_queue

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### autocomplete.service.ts
First 100 lines:
```typescript
import { Client } from '@elastic/elasticsearch';
import pino from 'pino';

export class AutocompleteService {
  private elasticsearch: Client;
  private logger: pino.Logger;

  constructor({ elasticsearch, logger }: any) {
    this.elasticsearch = elasticsearch;
    this.logger = logger;
  }

  async getSuggestions(query: string) {
    if (!query || query.length < 2) return [];

    try {
      const response = await this.elasticsearch.search({
        index: ['venues', 'events'],
        size: 10,
        body: {
          query: {
            match_phrase_prefix: {
              name: {
                query: query,
                max_expansions: 10
              }
            }
          },
          _source: ['name']
        }
      });

      return response.hits.hits.map((hit: any) => hit._source.name);
    } catch (error) {
      this.logger.error({ error }, 'Autocomplete failed');
      return [];
    }
  }
}
```

### sync.service.ts
First 100 lines:
```typescript
import { Client } from '@elastic/elasticsearch';
import pino from 'pino';
import { ConsistencyService } from './consistency.service';

export class SyncService {
  private elasticsearch: Client;
  private logger: pino.Logger;
  private consistencyService: ConsistencyService;

  constructor({ elasticsearch, logger, consistencyService }: any) {
    this.elasticsearch = elasticsearch;
    this.logger = logger;
    this.consistencyService = consistencyService;
  }

  async processMessage(routingKey: string, content: any, clientId?: string) {
    this.logger.info({ routingKey, content }, 'Processing sync message');

    const [entity, action] = routingKey.split('.');

    try {
      let consistencyToken;

      switch (entity) {
        case 'venue':
          consistencyToken = await this.syncVenue(action, content, clientId);
          break;
        case 'event':
          consistencyToken = await this.syncEvent(action, content, clientId);
          break;
        case 'ticket':
          consistencyToken = await this.syncTicket(action, content, clientId);
          break;
      }

      return consistencyToken;
    } catch (error) {
      this.logger.error({ error, routingKey, content }, 'Sync failed');
      throw error;
    }
  }

  private async syncVenue(action: string, venue: any, clientId?: string) {
    const operation = {
      entityType: 'venue',
      entityId: venue.id,
      operation: action === 'deleted' ? 'DELETE' as const : 'UPDATE' as const,
      payload: action !== 'deleted' ? {
        id: venue.id,
        name: venue.name,
        type: venue.type,
        capacity: venue.capacity,
        address: venue.address?.street || '',
        city: venue.address?.city || '',
        state: venue.address?.state || '',
        slug: venue.slug,
        is_active: venue.is_active,
        updated_at: new Date()
      } : {},
      priority: 9 // High priority for immediate consistency
    };

    const token = await this.consistencyService.indexWithConsistency(operation, clientId);

    this.logger.info('Venue synced with consistency token', {
      venueId: venue.id,
      token: token.token
    });

    return token;
  }

  private async syncEvent(action: string, event: any, clientId?: string) {
    const operation = {
      entityType: 'event',
      entityId: event.id,
      operation: action === 'deleted' ? 'DELETE' as const : 'UPDATE' as const,
      payload: action !== 'deleted' ? {
        id: event.id,
        venue_id: event.venue_id,
        name: event.name || event.title,
        description: event.description,
        date: event.date || event.event_date,
        status: event.status,
        updated_at: new Date()
      } : {},
      priority: 9 // High priority for immediate consistency
    };

    const token = await this.consistencyService.indexWithConsistency(operation, clientId);

    this.logger.info('Event synced with consistency token', {
      eventId: event.id,
      token: token.token
    });

    return token;
  }

  private async syncTicket(_action: string, ticket: any, clientId?: string) {
```

### search.service.ts
First 100 lines:
```typescript
import { Client } from '@elastic/elasticsearch';
import pino from 'pino';
import { ConsistencyService } from './consistency.service';

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

      const response = await this.elasticsearch.search({
        index: indices,
        size: limit,
        body: {
          query: query ? {
            multi_match: {
              query: query,
              fields: ['name^2', 'description', 'city', 'venue_name'],
              fuzziness: 'AUTO'
            }
          } : {
            match_all: {}
          },
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
```

### professional-search.service.ts
First 100 lines:
```typescript
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
```

### consistency.service.ts
First 100 lines:
```typescript
import { Client } from '@elastic/elasticsearch';
import { Pool } from 'pg';
import pino from 'pino';
import crypto from 'crypto';

export interface ConsistencyToken {
  token: string;
  versions: Map<string, Map<string, number>>;
  expiresAt: Date;
}

interface IndexOperation {
  entityType: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  version?: number;
  priority?: number;
}

export class ConsistencyService {
  private elasticsearch: Client;
  private pool: Pool;
  private logger: pino.Logger;
  private indexingInProgress: Map<string, Promise<void>> = new Map();

  constructor({ elasticsearch, pool, logger }: any) {
    this.elasticsearch = elasticsearch;
    this.pool = pool;
    this.logger = logger.child({ component: 'ConsistencyService' });

    // Start background processor
    this.startBackgroundProcessor();
  }

  /**
   * Index with consistency tracking
   */
  async indexWithConsistency(
    operation: IndexOperation,
    clientId?: string
  ): Promise<ConsistencyToken> {
    const key = `${operation.entityType}:${operation.entityId}`;

    // Avoid concurrent indexing of same entity
    if (this.indexingInProgress.has(key)) {
      await this.indexingInProgress.get(key);
    }

    const indexPromise = this.doIndex(operation);
    this.indexingInProgress.set(key, indexPromise);

    try {
      await indexPromise;

      // Generate consistency token
      const token = await this.generateConsistencyToken(
        operation.entityType,
        operation.entityId,
        clientId
      );

      return token;
    } finally {
      this.indexingInProgress.delete(key);
    }
  }

  private async doIndex(operation: IndexOperation): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Generate idempotency key
      const idempotencyKey = this.generateIdempotencyKey(operation);

      // Check if already processed
      const existing = await client.query(
        'SELECT id FROM index_queue WHERE idempotency_key = $1',
        [idempotencyKey]
      );

      if (existing.rows.length > 0) {
        this.logger.debug('Operation already queued', { operation });
        await client.query('COMMIT');
        return;
      }

      // Get next version number
      const versionResult = await client.query(`
        INSERT INTO index_versions (entity_type, entity_id, version)
        VALUES ($1, $2, 1)
        ON CONFLICT (entity_type, entity_id)
        DO UPDATE SET
          version = index_versions.version + 1,
          index_status = 'PENDING',
          updated_at = NOW()
        RETURNING version
      `, [operation.entityType, operation.entityId]);
```

### ab-testing.service.ts
First 100 lines:
```typescript
export class ABTestingService {
  private tests: Map<string, any> = new Map();

  constructor() {
    // Define active tests
    this.tests.set('search_algorithm', {
      name: 'Search Algorithm Test',
      variants: {
        control: { algorithm: 'standard', weight: 0.5 },
        treatment: { algorithm: 'ml_boosted', weight: 0.5 }
      }
    });
  }

  getVariant(testName: string, _userId?: string): string {
    const test = this.tests.get(testName);
    if (!test) return 'control';
    
    // Simple random assignment (in production, use consistent hashing)
    const random = Math.random();
    let accumulator = 0;
    
    for (const [variant, config] of Object.entries(test.variants)) {
      accumulator += (config as any).weight;
      if (random < accumulator) {
        return variant;
      }
    }
    
    return 'control';
  }

  trackConversion(testName: string, variant: string, metric: string, value: number) {
    // Track test results (would go to analytics service)
    console.log(`A/B Test: ${testName}, Variant: ${variant}, ${metric}: ${value}`);
  }
}
```


## 6. ENVIRONMENT VARIABLES
```
# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

