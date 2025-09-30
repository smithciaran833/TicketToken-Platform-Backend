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
