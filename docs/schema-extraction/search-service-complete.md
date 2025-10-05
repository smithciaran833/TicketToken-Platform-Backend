# COMPLETE DATABASE ANALYSIS: search-service
Generated: Thu Oct  2 15:07:55 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/health.routes.ts
```typescript
import { Router } from 'express';
import { db } from '../config/database';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'search-service' });
});

router.get('/health/db', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'search-service' 
    });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'search-service'
    });
  }
});

export default router;
```

### FILE: src/config/database.ts
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

### FILE: src/middleware/auth.middleware.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    venueId?: string;
    role: string;
    permissions?: string[];
  };
}

export async function authenticate(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.status(401).send({ 
        error: 'Authentication required' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    
    request.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };
    
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({ 
        error: 'Token expired' 
      });
    }
    return reply.status(401).send({ 
      error: 'Invalid token' 
    });
  }
}

export function authorize(...roles: string[]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ 
        error: 'Authentication required' 
      });
    }

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ 
        error: 'Insufficient permissions' 
      });
    }
  };
}
```

### FILE: src/services/sync.service.ts
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
    // Update event with ticket availability
    if (ticket.event_id) {
      this.logger.info({ ticket }, 'Ticket update - refreshing event');

      // Trigger event re-index with high priority
      const operation = {
        entityType: 'event',
        entityId: ticket.event_id,
        operation: 'UPDATE' as const,
        payload: {
          tickets_available: ticket.available_quantity,
          updated_at: new Date()
        },
        priority: 8
      };

      const token = await this.consistencyService.indexWithConsistency(operation, clientId);
      return token;
    }
    
    // Return undefined if no event_id
    return undefined;
  }
}
```

### FILE: src/services/consistency.service.ts
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

      const version = versionResult.rows[0].version;

      // Queue the operation
      await client.query(`
        INSERT INTO index_queue (
          entity_type,
          entity_id,
          operation,
          payload,
          priority,
          version,
          idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        operation.entityType,
        operation.entityId,
        operation.operation,
        JSON.stringify(operation.payload),
        operation.priority || 5,
        version,
        idempotencyKey
      ]);

      await client.query('COMMIT');

      // Process immediately if high priority
      if (operation.priority && operation.priority >= 9) {
        await this.processIndexOperation(operation, version);
      }

    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to queue index operation', { error, operation });
      throw error;
    } finally {
      client.release();
    }
  }

  private async processIndexOperation(operation: IndexOperation, version: number): Promise<void> {
    try {
      const index = `${operation.entityType}s`; // events, venues, etc.

      switch (operation.operation) {
        case 'DELETE':
          await this.elasticsearch.delete({
            index,
            id: operation.entityId,
            refresh: 'wait_for' // Wait for operation to be searchable
          });
          break;

        case 'CREATE':
        case 'UPDATE':
          await this.elasticsearch.index({
            index,
            id: operation.entityId,
            body: {
              ...operation.payload,
              _version: version,
              _indexed_at: new Date()
            },
            refresh: 'wait_for' // Wait for operation to be searchable
          });
          break;
      }

      // Update index status
      await this.pool.query(`
        UPDATE index_versions
        SET index_status = 'INDEXED',
            indexed_at = NOW(),
            retry_count = 0,
            last_error = NULL
        WHERE entity_type = $1 AND entity_id = $2
      `, [operation.entityType, operation.entityId]);

      this.logger.info('Entity indexed successfully', {
        entityType: operation.entityType,
        entityId: operation.entityId,
        version
      });

    } catch (error: any) {
      this.logger.error('Failed to index entity', { error, operation });

      // Update retry count
      await this.pool.query(`
        UPDATE index_versions
        SET retry_count = retry_count + 1,
            last_error = $3,
            updated_at = NOW()
        WHERE entity_type = $1 AND entity_id = $2
      `, [operation.entityType, operation.entityId, error.message]);

      throw error;
    }
  }

  /**
   * Generate a consistency token for the client
   */
  private async generateConsistencyToken(
    entityType: string,
    entityId: string,
    clientId?: string
  ): Promise<ConsistencyToken> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60000); // 1 minute

    // Get current version
    const result = await this.pool.query(`
      SELECT version FROM index_versions
      WHERE entity_type = $1 AND entity_id = $2
    `, [entityType, entityId]);

    const version = result.rows[0]?.version || 1;

    const versions = new Map<string, Map<string, number>>();
    const entityVersions = new Map<string, number>();
    entityVersions.set(entityId, version);
    versions.set(`${entityType}s`, entityVersions);

    // Store token in database
    await this.pool.query(`
      INSERT INTO read_consistency_tokens (token, client_id, required_versions, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [
      token,
      clientId || 'anonymous',
      JSON.stringify(Object.fromEntries(
        Array.from(versions.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
      )),
      expiresAt
    ]);

    return { token, versions, expiresAt };
  }

  /**
   * Wait for consistency before searching
   */
  async waitForConsistency(token: string, maxWaitMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    // Get token requirements
    const result = await this.pool.query(`
      SELECT required_versions, expires_at
      FROM read_consistency_tokens
      WHERE token = $1
    `, [token]);

    if (result.rows.length === 0) {
      this.logger.debug('Consistency token not found', { token });
      return true; // Allow read without consistency check
    }

    const { required_versions, expires_at } = result.rows[0];

    if (new Date(expires_at) < new Date()) {
      this.logger.debug('Consistency token expired', { token });
      return true; // Token expired, allow read
    }

    // Check if all required versions are indexed
    while (Date.now() - startTime < maxWaitMs) {
      const allIndexed = await this.checkVersionsIndexed(required_versions);

      if (allIndexed) {
        return true;
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.warn('Consistency wait timeout', { token, required_versions });
    return false; // Timeout waiting for consistency
  }

  private async checkVersionsIndexed(requiredVersions: any): Promise<boolean> {
    for (const [entityType, entities] of Object.entries(requiredVersions)) {
      for (const [entityId, requiredVersion] of Object.entries(entities as any)) {
        const result = await this.pool.query(`
          SELECT version, index_status
          FROM index_versions
          WHERE entity_type = $1 AND entity_id = $2
        `, [entityType.slice(0, -1), entityId]); // Remove 's' from entityType

        if (result.rows.length === 0) {
          return false; // Entity not found
        }

        const { version, index_status } = result.rows[0];

        if (version < (requiredVersion as number) || index_status !== 'INDEXED') {
          return false; // Not yet at required version or not indexed
        }
      }
    }

    return true;
  }

  private generateIdempotencyKey(operation: IndexOperation): string {
    const data = `${operation.entityType}-${operation.entityId}-${operation.operation}-${JSON.stringify(operation.payload)}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Background processor for queued index operations
   */
  private startBackgroundProcessor(): void {
    setInterval(async () => {
      try {
        await this.processQueuedOperations();
      } catch (error) {
        this.logger.error('Background processor error', error);
      }
    }, 1000); // Process every second
  }

  private async processQueuedOperations(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Get unprocessed operations
      const operations = await client.query(`
        SELECT * FROM index_queue
        WHERE processed_at IS NULL
        ORDER BY priority DESC, created_at ASC
        LIMIT 10
      `);

      for (const row of operations.rows) {
        try {
          await this.processIndexOperation(
            {
              entityType: row.entity_type,
              entityId: row.entity_id,
              operation: row.operation,
              payload: row.payload
            },
            row.version
          );

          // Mark as processed
          await client.query(`
            UPDATE index_queue
            SET processed_at = NOW()
            WHERE id = $1
          `, [row.id]);

        } catch (error) {
          this.logger.error('Failed to process queued operation', { error, operation: row });
        }
      }

    } finally {
      client.release();
    }
  }

  /**
   * Force refresh of specific indices
   */
  async forceRefresh(indices?: string[]): Promise<void> {
    if (indices && indices.length > 0) {
      await this.elasticsearch.indices.refresh({ index: indices });
    } else {
      await this.elasticsearch.indices.refresh({ index: ['events', 'venues'] });
    }
  }
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/middleware/auth.middleware.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    venueId?: string;
    role: string;
    permissions?: string[];
  };
}

export async function authenticate(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.status(401).send({ 
        error: 'Authentication required' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    
    request.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };
    
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({ 
        error: 'Token expired' 
      });
    }
    return reply.status(401).send({ 
      error: 'Invalid token' 
    });
  }
}

export function authorize(...roles: string[]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ 
        error: 'Authentication required' 
      });
    }

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ 
        error: 'Insufficient permissions' 
      });
    }
  };
}
```

### FILE: src/services/consistency.service.ts
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

      const version = versionResult.rows[0].version;

      // Queue the operation
      await client.query(`
        INSERT INTO index_queue (
          entity_type,
          entity_id,
          operation,
          payload,
          priority,
          version,
          idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        operation.entityType,
        operation.entityId,
        operation.operation,
        JSON.stringify(operation.payload),
        operation.priority || 5,
        version,
        idempotencyKey
      ]);

      await client.query('COMMIT');

      // Process immediately if high priority
      if (operation.priority && operation.priority >= 9) {
        await this.processIndexOperation(operation, version);
      }

    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to queue index operation', { error, operation });
      throw error;
    } finally {
      client.release();
    }
  }

  private async processIndexOperation(operation: IndexOperation, version: number): Promise<void> {
    try {
      const index = `${operation.entityType}s`; // events, venues, etc.

      switch (operation.operation) {
        case 'DELETE':
          await this.elasticsearch.delete({
            index,
            id: operation.entityId,
            refresh: 'wait_for' // Wait for operation to be searchable
          });
          break;

        case 'CREATE':
        case 'UPDATE':
          await this.elasticsearch.index({
            index,
            id: operation.entityId,
            body: {
              ...operation.payload,
              _version: version,
              _indexed_at: new Date()
            },
            refresh: 'wait_for' // Wait for operation to be searchable
          });
          break;
      }

      // Update index status
      await this.pool.query(`
        UPDATE index_versions
        SET index_status = 'INDEXED',
            indexed_at = NOW(),
            retry_count = 0,
            last_error = NULL
        WHERE entity_type = $1 AND entity_id = $2
      `, [operation.entityType, operation.entityId]);

      this.logger.info('Entity indexed successfully', {
        entityType: operation.entityType,
        entityId: operation.entityId,
        version
      });

    } catch (error: any) {
      this.logger.error('Failed to index entity', { error, operation });

      // Update retry count
      await this.pool.query(`
        UPDATE index_versions
        SET retry_count = retry_count + 1,
            last_error = $3,
            updated_at = NOW()
        WHERE entity_type = $1 AND entity_id = $2
      `, [operation.entityType, operation.entityId, error.message]);

      throw error;
    }
  }

  /**
   * Generate a consistency token for the client
   */
  private async generateConsistencyToken(
    entityType: string,
    entityId: string,
    clientId?: string
  ): Promise<ConsistencyToken> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60000); // 1 minute

    // Get current version
    const result = await this.pool.query(`
      SELECT version FROM index_versions
      WHERE entity_type = $1 AND entity_id = $2
    `, [entityType, entityId]);

    const version = result.rows[0]?.version || 1;

    const versions = new Map<string, Map<string, number>>();
    const entityVersions = new Map<string, number>();
    entityVersions.set(entityId, version);
    versions.set(`${entityType}s`, entityVersions);

    // Store token in database
    await this.pool.query(`
      INSERT INTO read_consistency_tokens (token, client_id, required_versions, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [
      token,
      clientId || 'anonymous',
      JSON.stringify(Object.fromEntries(
        Array.from(versions.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
      )),
      expiresAt
    ]);

    return { token, versions, expiresAt };
  }

  /**
   * Wait for consistency before searching
   */
  async waitForConsistency(token: string, maxWaitMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    // Get token requirements
    const result = await this.pool.query(`
      SELECT required_versions, expires_at
      FROM read_consistency_tokens
      WHERE token = $1
    `, [token]);

    if (result.rows.length === 0) {
      this.logger.debug('Consistency token not found', { token });
      return true; // Allow read without consistency check
    }

    const { required_versions, expires_at } = result.rows[0];

    if (new Date(expires_at) < new Date()) {
      this.logger.debug('Consistency token expired', { token });
      return true; // Token expired, allow read
    }

    // Check if all required versions are indexed
    while (Date.now() - startTime < maxWaitMs) {
      const allIndexed = await this.checkVersionsIndexed(required_versions);

      if (allIndexed) {
        return true;
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.warn('Consistency wait timeout', { token, required_versions });
    return false; // Timeout waiting for consistency
  }

  private async checkVersionsIndexed(requiredVersions: any): Promise<boolean> {
    for (const [entityType, entities] of Object.entries(requiredVersions)) {
      for (const [entityId, requiredVersion] of Object.entries(entities as any)) {
        const result = await this.pool.query(`
          SELECT version, index_status
          FROM index_versions
          WHERE entity_type = $1 AND entity_id = $2
        `, [entityType.slice(0, -1), entityId]); // Remove 's' from entityType

        if (result.rows.length === 0) {
          return false; // Entity not found
        }

        const { version, index_status } = result.rows[0];

        if (version < (requiredVersion as number) || index_status !== 'INDEXED') {
          return false; // Not yet at required version or not indexed
        }
      }
    }

    return true;
  }

  private generateIdempotencyKey(operation: IndexOperation): string {
    const data = `${operation.entityType}-${operation.entityId}-${operation.operation}-${JSON.stringify(operation.payload)}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Background processor for queued index operations
   */
  private startBackgroundProcessor(): void {
    setInterval(async () => {
      try {
        await this.processQueuedOperations();
      } catch (error) {
        this.logger.error('Background processor error', error);
      }
    }, 1000); // Process every second
  }

  private async processQueuedOperations(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Get unprocessed operations
      const operations = await client.query(`
        SELECT * FROM index_queue
        WHERE processed_at IS NULL
        ORDER BY priority DESC, created_at ASC
        LIMIT 10
      `);

      for (const row of operations.rows) {
        try {
          await this.processIndexOperation(
            {
              entityType: row.entity_type,
              entityId: row.entity_id,
              operation: row.operation,
              payload: row.payload
            },
            row.version
          );

          // Mark as processed
          await client.query(`
            UPDATE index_queue
            SET processed_at = NOW()
            WHERE id = $1
          `, [row.id]);

        } catch (error) {
          this.logger.error('Failed to process queued operation', { error, operation: row });
        }
      }

    } finally {
      client.release();
    }
  }

  /**
   * Force refresh of specific indices
   */
  async forceRefresh(indices?: string[]): Promise<void> {
    if (indices && indices.length > 0) {
      await this.elasticsearch.indices.refresh({ index: indices });
    } else {
      await this.elasticsearch.indices.refresh({ index: ['events', 'venues'] });
    }
  }
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/search-service//src/routes/health.routes.ts:12:    await db.raw('SELECT 1');
backend/services/search-service//src/scripts/optimize-indices.ts:20:      // Update refresh interval for better performance
backend/services/search-service//src/scripts/update-indices.ts:9:async function updateIndices() {
backend/services/search-service//src/scripts/update-indices.ts:82:    logger.info('✅ All indices updated successfully');
backend/services/search-service//src/scripts/update-indices.ts:85:    logger.error('Failed to update indices:', error);
backend/services/search-service//src/scripts/update-indices.ts:90:updateIndices();
backend/services/search-service//src/scripts/sync-data.ts:14:    const venues = await db('venues').select('*');
backend/services/search-service//src/scripts/sync-data.ts:38:    const events = await db('events').select('*');
backend/services/search-service//src/config/database.ts:23:    await db.raw('SELECT 1');
backend/services/search-service//src/migrations/001_index_versioning.sql:12:    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
backend/services/search-service//src/migrations/001_index_versioning.sql:24:    operation VARCHAR(20) NOT NULL, -- CREATE, UPDATE, DELETE
backend/services/search-service//src/services/sync.service.ts:47:      operation: action === 'deleted' ? 'DELETE' as const : 'UPDATE' as const,
backend/services/search-service//src/services/sync.service.ts:58:        updated_at: new Date()
backend/services/search-service//src/services/sync.service.ts:77:      operation: action === 'deleted' ? 'DELETE' as const : 'UPDATE' as const,
backend/services/search-service//src/services/sync.service.ts:85:        updated_at: new Date()
backend/services/search-service//src/services/sync.service.ts:101:    // Update event with ticket availability
backend/services/search-service//src/services/sync.service.ts:103:      this.logger.info({ ticket }, 'Ticket update - refreshing event');
backend/services/search-service//src/services/sync.service.ts:109:        operation: 'UPDATE' as const,
backend/services/search-service//src/services/sync.service.ts:112:          updated_at: new Date()
backend/services/search-service//src/services/consistency.service.ts:15:  operation: 'CREATE' | 'UPDATE' | 'DELETE';
backend/services/search-service//src/services/consistency.service.ts:80:        'SELECT id FROM index_queue WHERE idempotency_key = $1',
backend/services/search-service//src/services/consistency.service.ts:92:        INSERT INTO index_versions (entity_type, entity_id, version)
backend/services/search-service//src/services/consistency.service.ts:95:        DO UPDATE SET
backend/services/search-service//src/services/consistency.service.ts:98:          updated_at = NOW()
backend/services/search-service//src/services/consistency.service.ts:106:        INSERT INTO index_queue (
backend/services/search-service//src/services/consistency.service.ts:155:        case 'UPDATE':
backend/services/search-service//src/services/consistency.service.ts:169:      // Update index status
backend/services/search-service//src/services/consistency.service.ts:171:        UPDATE index_versions
backend/services/search-service//src/services/consistency.service.ts:188:      // Update retry count
backend/services/search-service//src/services/consistency.service.ts:190:        UPDATE index_versions
backend/services/search-service//src/services/consistency.service.ts:193:            updated_at = NOW()
backend/services/search-service//src/services/consistency.service.ts:214:      SELECT version FROM index_versions
backend/services/search-service//src/services/consistency.service.ts:227:      INSERT INTO read_consistency_tokens (token, client_id, required_versions, expires_at)
backend/services/search-service//src/services/consistency.service.ts:249:      SELECT required_versions, expires_at
backend/services/search-service//src/services/consistency.service.ts:286:          SELECT version, index_status
backend/services/search-service//src/services/consistency.service.ts:308:    return crypto.createHash('sha256').update(data).digest('hex');
backend/services/search-service//src/services/consistency.service.ts:330:        SELECT * FROM index_queue
backend/services/search-service//src/services/consistency.service.ts:350:            UPDATE index_queue

### All JOIN operations:
backend/services/search-service//src/scripts/optimize-indices.ts:36:      index: indices.join(',')

### All WHERE clauses:
backend/services/search-service//src/migrations/001_index_versioning.sql:33:CREATE INDEX idx_index_queue_unprocessed ON index_queue(processed_at) WHERE processed_at IS NULL;
backend/services/search-service//src/migrations/001_index_versioning.sql:34:CREATE INDEX idx_index_queue_priority ON index_queue(priority DESC, created_at ASC) WHERE processed_at IS NULL;
backend/services/search-service//src/services/consistency.service.ts:80:        'SELECT id FROM index_queue WHERE idempotency_key = $1',
backend/services/search-service//src/services/consistency.service.ts:176:        WHERE entity_type = $1 AND entity_id = $2
backend/services/search-service//src/services/consistency.service.ts:194:        WHERE entity_type = $1 AND entity_id = $2
backend/services/search-service//src/services/consistency.service.ts:215:      WHERE entity_type = $1 AND entity_id = $2
backend/services/search-service//src/services/consistency.service.ts:251:      WHERE token = $1
backend/services/search-service//src/services/consistency.service.ts:288:          WHERE entity_type = $1 AND entity_id = $2
backend/services/search-service//src/services/consistency.service.ts:331:        WHERE processed_at IS NULL
backend/services/search-service//src/services/consistency.service.ts:352:            WHERE id = $1

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

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
### .env.example
```
# ================================================
# SEARCH-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: search-service
# Port: 3012
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=search-service           # Service identifier

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

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Elasticsearch Configuration ====
ELASTICSEARCH_URL=http://localhost:9200        # Elasticsearch URL
ELASTICSEARCH_INDEX_PREFIX=tickettoken_       # Index prefix
ELASTICSEARCH_USER=<ES_USER>                  # Elasticsearch user
ELASTICSEARCH_PASSWORD=<ES_PASSWORD>          # Elasticsearch password

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/services/autocomplete.service.ts
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

### FILE: src/services/sync.service.ts
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
    // Update event with ticket availability
    if (ticket.event_id) {
      this.logger.info({ ticket }, 'Ticket update - refreshing event');

      // Trigger event re-index with high priority
      const operation = {
        entityType: 'event',
        entityId: ticket.event_id,
        operation: 'UPDATE' as const,
        payload: {
          tickets_available: ticket.available_quantity,
          updated_at: new Date()
        },
        priority: 8
      };

      const token = await this.consistencyService.indexWithConsistency(operation, clientId);
      return token;
    }
    
    // Return undefined if no event_id
    return undefined;
  }
}
```

### FILE: src/services/search.service.ts
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
      const response = await this.elasticsearch.search({
        index: 'events',
        body: {
          query: {
            bool: {
              must: mustClauses.length ? mustClauses : { match_all: {} }
            }
          },
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
```

### FILE: src/services/professional-search.service.ts
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
      if (filters.capacityMin || filters.capacityMax) {
        const capacityRange: any = {};
        if (filters.capacityMin) capacityRange.gte = filters.capacityMin;
        if (filters.capacityMax) capacityRange.lte = filters.capacityMax;
        filter.push({ range: { capacity: capacityRange } });
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
      avgPrice: aggregations.avg_price?.value || 0
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
```

### FILE: src/services/consistency.service.ts
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

      const version = versionResult.rows[0].version;

      // Queue the operation
      await client.query(`
        INSERT INTO index_queue (
          entity_type,
          entity_id,
          operation,
          payload,
          priority,
          version,
          idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        operation.entityType,
        operation.entityId,
        operation.operation,
        JSON.stringify(operation.payload),
        operation.priority || 5,
        version,
        idempotencyKey
      ]);

      await client.query('COMMIT');

      // Process immediately if high priority
      if (operation.priority && operation.priority >= 9) {
        await this.processIndexOperation(operation, version);
      }

    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to queue index operation', { error, operation });
      throw error;
    } finally {
      client.release();
    }
  }

  private async processIndexOperation(operation: IndexOperation, version: number): Promise<void> {
    try {
      const index = `${operation.entityType}s`; // events, venues, etc.

      switch (operation.operation) {
        case 'DELETE':
          await this.elasticsearch.delete({
            index,
            id: operation.entityId,
            refresh: 'wait_for' // Wait for operation to be searchable
          });
          break;

        case 'CREATE':
        case 'UPDATE':
          await this.elasticsearch.index({
            index,
            id: operation.entityId,
            body: {
              ...operation.payload,
              _version: version,
              _indexed_at: new Date()
            },
            refresh: 'wait_for' // Wait for operation to be searchable
          });
          break;
      }

      // Update index status
      await this.pool.query(`
        UPDATE index_versions
        SET index_status = 'INDEXED',
            indexed_at = NOW(),
            retry_count = 0,
            last_error = NULL
        WHERE entity_type = $1 AND entity_id = $2
      `, [operation.entityType, operation.entityId]);

      this.logger.info('Entity indexed successfully', {
        entityType: operation.entityType,
        entityId: operation.entityId,
        version
      });

    } catch (error: any) {
      this.logger.error('Failed to index entity', { error, operation });

      // Update retry count
      await this.pool.query(`
        UPDATE index_versions
        SET retry_count = retry_count + 1,
            last_error = $3,
            updated_at = NOW()
        WHERE entity_type = $1 AND entity_id = $2
      `, [operation.entityType, operation.entityId, error.message]);

      throw error;
    }
  }

  /**
   * Generate a consistency token for the client
   */
  private async generateConsistencyToken(
    entityType: string,
    entityId: string,
    clientId?: string
  ): Promise<ConsistencyToken> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60000); // 1 minute

    // Get current version
    const result = await this.pool.query(`
      SELECT version FROM index_versions
      WHERE entity_type = $1 AND entity_id = $2
    `, [entityType, entityId]);

    const version = result.rows[0]?.version || 1;

    const versions = new Map<string, Map<string, number>>();
    const entityVersions = new Map<string, number>();
    entityVersions.set(entityId, version);
    versions.set(`${entityType}s`, entityVersions);

    // Store token in database
    await this.pool.query(`
      INSERT INTO read_consistency_tokens (token, client_id, required_versions, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [
      token,
      clientId || 'anonymous',
      JSON.stringify(Object.fromEntries(
        Array.from(versions.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
      )),
      expiresAt
    ]);

    return { token, versions, expiresAt };
  }

  /**
   * Wait for consistency before searching
   */
  async waitForConsistency(token: string, maxWaitMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    // Get token requirements
    const result = await this.pool.query(`
      SELECT required_versions, expires_at
      FROM read_consistency_tokens
      WHERE token = $1
    `, [token]);

    if (result.rows.length === 0) {
      this.logger.debug('Consistency token not found', { token });
      return true; // Allow read without consistency check
    }

    const { required_versions, expires_at } = result.rows[0];

    if (new Date(expires_at) < new Date()) {
      this.logger.debug('Consistency token expired', { token });
      return true; // Token expired, allow read
    }

    // Check if all required versions are indexed
    while (Date.now() - startTime < maxWaitMs) {
      const allIndexed = await this.checkVersionsIndexed(required_versions);

      if (allIndexed) {
        return true;
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.warn('Consistency wait timeout', { token, required_versions });
    return false; // Timeout waiting for consistency
  }

  private async checkVersionsIndexed(requiredVersions: any): Promise<boolean> {
    for (const [entityType, entities] of Object.entries(requiredVersions)) {
      for (const [entityId, requiredVersion] of Object.entries(entities as any)) {
        const result = await this.pool.query(`
          SELECT version, index_status
          FROM index_versions
          WHERE entity_type = $1 AND entity_id = $2
        `, [entityType.slice(0, -1), entityId]); // Remove 's' from entityType

        if (result.rows.length === 0) {
          return false; // Entity not found
        }

        const { version, index_status } = result.rows[0];

        if (version < (requiredVersion as number) || index_status !== 'INDEXED') {
          return false; // Not yet at required version or not indexed
        }
      }
    }

    return true;
  }

  private generateIdempotencyKey(operation: IndexOperation): string {
    const data = `${operation.entityType}-${operation.entityId}-${operation.operation}-${JSON.stringify(operation.payload)}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Background processor for queued index operations
   */
  private startBackgroundProcessor(): void {
    setInterval(async () => {
      try {
        await this.processQueuedOperations();
      } catch (error) {
        this.logger.error('Background processor error', error);
      }
    }, 1000); // Process every second
  }

  private async processQueuedOperations(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Get unprocessed operations
      const operations = await client.query(`
        SELECT * FROM index_queue
        WHERE processed_at IS NULL
        ORDER BY priority DESC, created_at ASC
        LIMIT 10
      `);

      for (const row of operations.rows) {
        try {
          await this.processIndexOperation(
            {
              entityType: row.entity_type,
              entityId: row.entity_id,
              operation: row.operation,
              payload: row.payload
            },
            row.version
          );

          // Mark as processed
          await client.query(`
            UPDATE index_queue
            SET processed_at = NOW()
            WHERE id = $1
          `, [row.id]);

        } catch (error) {
          this.logger.error('Failed to process queued operation', { error, operation: row });
        }
      }

    } finally {
      client.release();
    }
  }

  /**
   * Force refresh of specific indices
   */
  async forceRefresh(indices?: string[]): Promise<void> {
    if (indices && indices.length > 0) {
      await this.elasticsearch.indices.refresh({ index: indices });
    } else {
      await this.elasticsearch.indices.refresh({ index: ['events', 'venues'] });
    }
  }
}
```

### FILE: src/services/ab-testing.service.ts
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

