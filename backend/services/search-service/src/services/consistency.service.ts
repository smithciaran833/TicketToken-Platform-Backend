import { Client } from '@elastic/elasticsearch';
import { Knex } from 'knex';
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
  private db: Knex;
  private logger: pino.Logger;
  private indexingInProgress: Map<string, Promise<void>> = new Map();

  constructor({ elasticsearch, db, logger }: any) {
    this.elasticsearch = elasticsearch;
    this.db = db;
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
    const trx = await this.db.transaction();

    try {
      // Generate idempotency key
      const idempotencyKey = this.generateIdempotencyKey(operation);

      // Check if already processed
      const existing = await trx('index_queue')
        .where('idempotency_key', idempotencyKey)
        .first();

      if (existing) {
        this.logger.debug('Operation already queued', { operation });
        await trx.commit();
        return;
      }

      // Get next version number
      const versionResult = await trx.raw(`
        INSERT INTO index_versions (entity_type, entity_id, version)
        VALUES (?, ?, 1)
        ON CONFLICT (entity_type, entity_id)
        DO UPDATE SET
          version = index_versions.version + 1,
          index_status = 'PENDING',
          updated_at = NOW()
        RETURNING version
      `, [operation.entityType, operation.entityId]);

      const version = versionResult.rows[0].version;

      // Queue the operation
      await trx('index_queue').insert({
        entity_type: operation.entityType,
        entity_id: operation.entityId,
        operation: operation.operation,
        payload: JSON.stringify(operation.payload),
        priority: operation.priority || 5,
        version,
        idempotency_key: idempotencyKey
      });

      await trx.commit();

      // Process immediately if high priority
      if (operation.priority && operation.priority >= 9) {
        await this.processIndexOperation(operation, version);
      }

    } catch (error: any) {
      await trx.rollback();
      this.logger.error({
        error: error.message,
        stack: error.stack,
        operation
      }, 'Failed to queue index operation');
      throw error;
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
            refresh: 'wait_for'
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
            refresh: 'wait_for'
          });
          break;
      }

      // Update index status
      await this.db('index_versions')
        .where({ entity_type: operation.entityType, entity_id: operation.entityId })
        .update({
          index_status: 'INDEXED',
          indexed_at: this.db.fn.now(),
          retry_count: 0,
          last_error: null
        });

      this.logger.info('Entity indexed successfully', {
        entityType: operation.entityType,
        entityId: operation.entityId,
        version
      });

    } catch (error: any) {
      this.logger.error({
        error: error.message,
        stack: error.stack,
        operation
      }, 'Failed to index entity');

      // Update retry count
      await this.db('index_versions')
        .where({ entity_type: operation.entityType, entity_id: operation.entityId })
        .update({
          retry_count: this.db.raw('retry_count + 1'),
          last_error: error.message,
          updated_at: this.db.fn.now()
        });

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
    const result = await this.db('index_versions')
      .where({ entity_type: entityType, entity_id: entityId })
      .first();

    const version = result?.version || 1;

    const versions = new Map<string, Map<string, number>>();
    const entityVersions = new Map<string, number>();
    entityVersions.set(entityId, version);
    versions.set(`${entityType}s`, entityVersions);

    // Store token in database
    await this.db('read_consistency_tokens').insert({
      token,
      client_id: clientId || 'anonymous',
      required_versions: JSON.stringify(Object.fromEntries(
        Array.from(versions.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
      )),
      expires_at: expiresAt
    });

    return { token, versions, expiresAt };
  }

  /**
   * Wait for consistency before searching
   */
  async waitForConsistency(token: string, maxWaitMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Get token requirements
      const result = await this.db('read_consistency_tokens')
        .where('token', token)
        .first();

      if (!result) {
        this.logger.debug('Consistency token not found', { token });
        return true; // Allow read without consistency check
      }

      const { required_versions, expires_at } = result;

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
    } catch (error: any) {
      this.logger.error({
        error: error.message,
        stack: error.stack,
        token
      }, 'Error in waitForConsistency');
      return true; // On error, allow read anyway
    }
  }

  private async checkVersionsIndexed(requiredVersions: any): Promise<boolean> {
    try {
      const versions = typeof requiredVersions === 'string' 
        ? JSON.parse(requiredVersions) 
        : requiredVersions;

      for (const [entityType, entities] of Object.entries(versions)) {
        for (const [entityId, requiredVersion] of Object.entries(entities as any)) {
          const result = await this.db('index_versions')
            .where({ 
              entity_type: entityType.slice(0, -1), // Remove 's' from entityType
              entity_id: entityId 
            })
            .first();

          if (!result) {
            return false; // Entity not found
          }

          const { version, index_status } = result;

          if (version < (requiredVersion as number) || index_status !== 'INDEXED') {
            return false; // Not yet at required version or not indexed
          }
        }
      }

      return true;
    } catch (error: any) {
      this.logger.error({
        error: error.message,
        stack: error.stack
      }, 'Error in checkVersionsIndexed');
      return false;
    }
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
      } catch (error: any) {
        this.logger.error({
          error: error.message,
          stack: error.stack,
          code: error.code,
          detail: error.detail
        }, 'Background processor error');
      }
    }, 5000); // Process every 5 seconds (reduced frequency)
  }

  private async processQueuedOperations(): Promise<void> {
    try {
      // Get unprocessed operations
      const operations = await this.db('index_queue')
        .whereNull('processed_at')
        .orderBy('priority', 'desc')
        .orderBy('created_at', 'asc')
        .limit(10);

      for (const row of operations) {
        try {
          await this.processIndexOperation(
            {
              entityType: row.entity_type,
              entityId: row.entity_id,
              operation: row.operation,
              payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
            },
            row.version
          );

          // Mark as processed
          await this.db('index_queue')
            .where('id', row.id)
            .update({ processed_at: this.db.fn.now() });

        } catch (error: any) {
          this.logger.error({
            error: error.message,
            stack: error.stack,
            operation: row
          }, 'Failed to process queued operation');
        }
      }

    } catch (error: any) {
      this.logger.error({
        error: error.message,
        stack: error.stack,
        code: error.code
      }, 'Error in processQueuedOperations');
    }
  }

  /**
   * Force refresh of specific indices
   */
  async forceRefresh(indices?: string[]): Promise<void> {
    try {
      if (indices && indices.length > 0) {
        await this.elasticsearch.indices.refresh({ index: indices });
      } else {
        await this.elasticsearch.indices.refresh({ index: ['events', 'venues'] });
      }
    } catch (error: any) {
      this.logger.error({
        error: error.message,
        stack: error.stack
      }, 'Error in forceRefresh');
    }
  }
}
