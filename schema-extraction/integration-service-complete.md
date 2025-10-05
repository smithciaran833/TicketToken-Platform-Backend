# COMPLETE DATABASE ANALYSIS: integration-service
Generated: Thu Oct  2 15:07:50 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/config/database.ts
```typescript
import knex from 'knex';
import { logger } from '../utils/logger';

export const db = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10
  }
});

export async function initializeDatabase() {
  try {
    await db.raw('SELECT 1');
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
}
```

### FILE: src/migrations/001_create_integration_tables.js
```typescript
exports.up = async function(knex) {
  // Integration configurations
  await knex.schema.createTable('integration_configs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.enum('status', ['disconnected', 'connecting', 'connected', 'error', 'suspended']).defaultTo('disconnected');
    table.timestamp('connected_at').nullable();
    table.timestamp('disconnected_at').nullable();
    table.timestamp('last_sync_at').nullable();
    table.timestamp('next_sync_at').nullable();
    table.jsonb('config').defaultTo('{}');
    table.jsonb('field_mappings').defaultTo('{}');
    table.uuid('template_id').nullable();
    table.timestamp('template_applied_at').nullable();
    table.enum('health_status', ['healthy', 'degraded', 'unhealthy', 'unknown']).defaultTo('unknown');
    table.timestamp('health_checked_at').nullable();
    table.integer('failure_count').defaultTo(0);
    table.text('last_error').nullable();
    table.timestamp('last_error_at').nullable();
    table.timestamps(true, true);
    
    table.unique(['venue_id', 'integration_type']);
    table.index('venue_id');
    table.index('status');
    table.index('health_status');
  });

  // OAuth tokens (encrypted)
  await knex.schema.createTable('oauth_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.text('encrypted_access_token').notNullable();
    table.text('encrypted_refresh_token').nullable();
    table.integer('encryption_key_version').defaultTo(1);
    table.specificType('scopes', 'text[]').nullable();
    table.string('token_type', 50).defaultTo('Bearer');
    table.timestamp('expires_at').nullable();
    table.integer('refresh_count').defaultTo(0);
    table.timestamp('last_refreshed_at').nullable();
    table.integer('refresh_failed_count').defaultTo(0);
    table.uuid('created_by').nullable();
    table.specificType('created_ip', 'inet').nullable();  // Fixed: use specificType for inet
    table.timestamp('last_used_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.unique(['venue_id', 'integration_type']);
    table.index('expires_at');
    table.index('venue_id');
  });

  // Venue API keys
  await knex.schema.createTable('venue_api_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.text('encrypted_api_key').notNullable();
    table.text('encrypted_api_secret').nullable();
    table.string('key_name').nullable();
    table.string('environment', 20).defaultTo('production');
    table.boolean('is_valid').defaultTo(true);
    table.timestamp('last_validated_at').nullable();
    table.text('validation_error').nullable();
    table.timestamps(true, true);
    
    table.unique(['venue_id', 'integration_type', 'environment']);
  });

  // Sync queue
  await knex.schema.createTable('sync_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.enum('operation_type', ['create', 'update', 'delete', 'sync', 'reconcile']).notNullable();
    table.string('entity_type', 50).notNullable();
    table.string('entity_id').nullable();
    table.jsonb('payload').notNullable();
    table.string('idempotency_key').nullable();
    table.enum('priority', ['CRITICAL', 'HIGH', 'NORMAL', 'LOW']).defaultTo('NORMAL');
    table.enum('status', ['pending', 'processing', 'completed', 'failed', 'dead_letter']).defaultTo('pending');
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(10);
    table.timestamp('next_retry_at').nullable();
    table.timestamp('queued_at').defaultTo(knex.fn.now());
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('expires_at').defaultTo(knex.raw("CURRENT_TIMESTAMP + INTERVAL '7 days'"));
    table.text('last_error').nullable();
    table.integer('error_count').defaultTo(0);
    table.string('correlation_id').nullable();
    
    table.index(['venue_id', 'status']);
    table.index(['priority', 'status']);
    table.index('next_retry_at');
    table.index('expires_at');
    table.unique('idempotency_key');
  });

  // Field mapping templates
  await knex.schema.createTable('field_mapping_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 100).notNullable();
    table.text('description').nullable();
    table.string('venue_type', 50).nullable();
    table.string('integration_type', 50).notNullable();
    table.jsonb('mappings').notNullable();
    table.jsonb('validation_rules').nullable();
    table.integer('usage_count').defaultTo(0);
    table.timestamp('last_used_at').nullable();
    table.boolean('is_default').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index('venue_type');
    table.index('integration_type');
    table.index('is_default');
  });

  // Webhook events
  await knex.schema.createTable('integration_webhooks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').nullable();
    table.string('integration_type', 50).notNullable();
    table.string('event_type', 100).notNullable();
    table.string('event_id').nullable();
    table.jsonb('headers').nullable();
    table.jsonb('payload').notNullable();
    table.string('signature', 500).nullable();
    table.enum('status', ['pending', 'processing', 'processed', 'failed', 'ignored']).defaultTo('pending');
    table.timestamp('processed_at').nullable();
    table.text('error').nullable();
    table.integer('retry_count').defaultTo(0);
    table.string('external_id').nullable();
    table.timestamp('received_at').defaultTo(knex.fn.now());
    
    table.index(['venue_id', 'status']);
    table.index('external_id');
    table.index('received_at');
    table.unique(['integration_type', 'external_id']);
  });

  // Sync logs
  await knex.schema.createTable('sync_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.uuid('sync_id').nullable();
    table.string('operation', 100).notNullable();
    table.string('entity_type', 50).nullable();
    table.integer('entity_count').nullable();
    table.string('status', 50).notNullable();
    table.integer('success_count').defaultTo(0);
    table.integer('error_count').defaultTo(0);
    table.integer('skip_count').defaultTo(0);
    table.integer('duration_ms').nullable();
    table.integer('api_calls_made').nullable();
    table.jsonb('details').nullable();
    table.jsonb('errors').nullable();
    table.timestamp('started_at').notNullable();
    table.timestamp('completed_at').nullable();
    
    table.index(['venue_id', 'started_at']);
    table.index('sync_id');
  });

  // Integration health metrics
  await knex.schema.createTable('integration_health', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.decimal('success_rate', 5, 2).nullable();
    table.integer('average_sync_time_ms').nullable();
    table.timestamp('last_success_at').nullable();
    table.timestamp('last_failure_at').nullable();
    table.integer('sync_count_24h').defaultTo(0);
    table.integer('success_count_24h').defaultTo(0);
    table.integer('failure_count_24h').defaultTo(0);
    table.integer('api_calls_24h').defaultTo(0);
    table.integer('api_quota_remaining').nullable();
    table.timestamp('api_quota_resets_at').nullable();
    table.integer('queue_depth').defaultTo(0);
    table.timestamp('oldest_queue_item_at').nullable();
    table.timestamp('calculated_at').defaultTo(knex.fn.now());
    
    table.unique(['venue_id', 'integration_type']);
    table.index('calculated_at');
  });

  // Integration costs
  await knex.schema.createTable('integration_costs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 50).notNullable();
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    table.integer('api_calls').defaultTo(0);
    table.decimal('data_synced_mb', 10, 2).nullable();
    table.decimal('base_cost', 10, 2).nullable();
    table.decimal('overage_cost', 10, 2).nullable();
    table.decimal('total_cost', 10, 2).nullable();
    table.boolean('included_in_plan').defaultTo(true);
    table.boolean('billed_to_venue').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.unique(['venue_id', 'integration_type', 'period_start']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('integration_costs');
  await knex.schema.dropTableIfExists('integration_health');
  await knex.schema.dropTableIfExists('sync_logs');
  await knex.schema.dropTableIfExists('integration_webhooks');
  await knex.schema.dropTableIfExists('field_mapping_templates');
  await knex.schema.dropTableIfExists('sync_queue');
  await knex.schema.dropTableIfExists('venue_api_keys');
  await knex.schema.dropTableIfExists('oauth_tokens');
  await knex.schema.dropTableIfExists('integration_configs');
};
```

### FILE: src/models/SyncLog.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface ISyncLog {
  id?: string;
  integration_id: string;
  status: 'success' | 'failed' | 'partial';
  records_synced?: number;
  errors?: any;
  started_at: Date;
  completed_at?: Date;
  created_at?: Date;
}

export class SyncLogModel {
  private db: Knex;
  private tableName = 'sync_logs';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ISyncLog): Promise<ISyncLog> {
    const [log] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return log;
  }

  async findById(id: string): Promise<ISyncLog | null> {
    const log = await this.db(this.tableName)
      .where({ id })
      .first();
    return log || null;
  }

  async findByIntegrationId(integrationId: string, limit = 10): Promise<ISyncLog[]> {
    return this.db(this.tableName)
      .where({ integration_id: integrationId })
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  async update(id: string, data: Partial<ISyncLog>): Promise<ISyncLog | null> {
    const [log] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return log || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default SyncLogModel;
```

### FILE: src/models/Webhook.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IWebhook {
  id?: string;
  integration_id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  last_triggered?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class WebhookModel {
  private db: Knex;
  private tableName = 'webhooks';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IWebhook): Promise<IWebhook> {
    const [webhook] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return webhook;
  }

  async findById(id: string): Promise<IWebhook | null> {
    const webhook = await this.db(this.tableName)
      .where({ id })
      .first();
    return webhook || null;
  }

  async findByIntegrationId(integrationId: string): Promise<IWebhook[]> {
    return this.db(this.tableName)
      .where({ integration_id: integrationId, active: true });
  }

  async update(id: string, data: Partial<IWebhook>): Promise<IWebhook | null> {
    const [webhook] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return webhook || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default WebhookModel;
```

### FILE: src/models/Connection.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IConnection {
  id?: string;
  integration_id: string;
  external_id: string;
  status: 'connected' | 'disconnected' | 'error';
  metadata?: any;
  last_activity?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class ConnectionModel {
  private db: Knex;
  private tableName = 'connections';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IConnection): Promise<IConnection> {
    const [connection] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return connection;
  }

  async findById(id: string): Promise<IConnection | null> {
    const connection = await this.db(this.tableName)
      .where({ id })
      .first();
    return connection || null;
  }

  async findByIntegrationId(integrationId: string): Promise<IConnection[]> {
    return this.db(this.tableName)
      .where({ integration_id: integrationId });
  }

  async update(id: string, data: Partial<IConnection>): Promise<IConnection | null> {
    const [connection] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return connection || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default ConnectionModel;
```

### FILE: src/models/Integration.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IIntegration {
  id?: string;
  name: string;
  provider: string;
  status: 'active' | 'inactive' | 'error';
  config?: any;
  credentials?: any;
  last_sync?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class IntegrationModel {
  private db: Knex;
  private tableName = 'integrations';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IIntegration): Promise<IIntegration> {
    const [integration] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return integration;
  }

  async findById(id: string): Promise<IIntegration | null> {
    const integration = await this.db(this.tableName)
      .where({ id })
      .first();
    return integration || null;
  }

  async findAll(filters: Partial<IIntegration> = {}): Promise<IIntegration[]> {
    return this.db(this.tableName).where(filters);
  }

  async update(id: string, data: Partial<IIntegration>): Promise<IIntegration | null> {
    const [integration] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return integration || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default IntegrationModel;
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    venueId?: string;
    role: string;
    permissions?: string[];
  };
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;

    req.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };

    next();
  } catch (error: any) {
    logger.error('Authentication failed:', error);
    
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ 
        success: false,
        error: 'Token expired' 
      });
      return;
    }
    
    res.status(401).json({ 
      success: false,
      error: 'Invalid token' 
    });
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt by user ${req.user.id} with role ${req.user.role}`);
      res.status(403).json({ 
        success: false,
        error: 'Insufficient permissions' 
      });
      return;
    }

    next();
  };
}

// Webhook signature verification
export function verifyWebhookSignature(provider: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signatures: Record<string, string | undefined> = {
      stripe: req.headers['stripe-signature'] as string,
      square: req.headers['x-square-signature'] as string,
      mailchimp: req.headers['x-mandrill-signature'] as string,
      quickbooks: req.headers['intuit-signature'] as string
    };

    const signature = signatures[provider];
    
    if (!signature) {
      logger.warn(`Missing webhook signature for ${provider}`);
      res.status(401).json({ 
        success: false,
        error: 'Invalid webhook signature' 
      });
      return;
    }

    // TODO: Implement actual signature verification per provider
    logger.info(`Webhook received from ${provider}`);
    next();
  };
}
```

### FILE: src/providers/provider.interface.ts
```typescript
export interface IntegrationProvider {
  name: string;
  initialize(credentials: any): Promise<void>;
  testConnection(): Promise<boolean>;
  
  // Sync operations
  syncProducts?(products: any[]): Promise<any>;
  syncCustomers?(customers: any[]): Promise<any>;
  syncTransactions?(transactions: any[]): Promise<any>;
  syncInventory?(inventory: any[]): Promise<any>;
  
  // Fetch operations
  fetchProducts?(): Promise<any[]>;
  fetchCustomers?(): Promise<any[]>;
  fetchTransactions?(startDate: Date, endDate: Date): Promise<any[]>;
  
  // Webhook handling
  handleWebhook?(event: any): Promise<void>;
  validateWebhookSignature?(payload: string, signature: string): boolean;
  
  // OAuth
  getOAuthUrl?(state: string): string;
  exchangeCodeForToken?(code: string): Promise<any>;
  refreshToken?(refreshToken: string): Promise<any>;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors?: any[];
  duration: number;
}

export interface ProviderConfig {
  venueId: string;
  credentials: any;
  settings?: any;
  mappings?: any;
}
```

### FILE: src/providers/quickbooks/quickbooks.provider.ts
```typescript
import { IntegrationProvider, SyncResult } from '../provider.interface';
import { logger } from '../../utils/logger';
import axios from 'axios';

export class QuickBooksProvider implements IntegrationProvider {
  name = 'quickbooks';
  private accessToken: string = '';
  private realmId: string = '';
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.QUICKBOOKS_SANDBOX === 'true'
      ? 'https://sandbox-quickbooks.api.intuit.com/v3'
      : 'https://quickbooks.api.intuit.com/v3';
  }

  async initialize(credentials: any): Promise<void> {
    this.accessToken = credentials.accessToken;
    this.realmId = credentials.realmId || '';
    logger.info('QuickBooks provider initialized');
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/company/${this.realmId}/companyinfo/${this.realmId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );
      return response.status === 200;
    } catch (error) {
      logger.error('QuickBooks connection test failed', error);
      return false;
    }
  }

  async syncProducts(products: any[]): Promise<SyncResult> {
    const startTime = Date.now();
    let syncedCount = 0;
    let failedCount = 0;
    const errors: any[] = [];

    for (const product of products) {
      try {
        const item = {
          Name: product.name,
          Type: 'Service',
          IncomeAccountRef: {
            value: '1' // Default income account
          },
          Description: product.description,
          UnitPrice: product.price,
          Sku: product.sku || product.id
        };

        await axios.post(
          `${this.baseUrl}/company/${this.realmId}/item`,
          item,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          }
        );

        syncedCount++;
      } catch (error: any) {
        failedCount++;
        errors.push({
          productId: product.id,
          error: error.message
        });
        logger.error('Failed to sync product to QuickBooks', {
          productId: product.id,
          error
        });
      }
    }

    return {
      success: failedCount === 0,
      syncedCount,
      failedCount,
      errors,
      duration: Date.now() - startTime
    };
  }

  async syncCustomers(customers: any[]): Promise<SyncResult> {
    const startTime = Date.now();
    let syncedCount = 0;
    let failedCount = 0;

    for (const customer of customers) {
      try {
        const qbCustomer = {
          DisplayName: customer.name,
          PrimaryEmailAddr: {
            Address: customer.email
          },
          PrimaryPhone: customer.phone ? {
            FreeFormNumber: customer.phone
          } : undefined,
          CompanyName: customer.company,
          BillAddr: customer.address ? {
            Line1: customer.address.line1,
            City: customer.address.city,
            CountrySubDivisionCode: customer.address.state,
            PostalCode: customer.address.zip
          } : undefined
        };

        await axios.post(
          `${this.baseUrl}/company/${this.realmId}/customer`,
          qbCustomer,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          }
        );

        syncedCount++;
      } catch (error) {
        failedCount++;
        logger.error('Failed to sync customer to QuickBooks', error);
      }
    }

    return {
      success: failedCount === 0,
      syncedCount,
      failedCount,
      duration: Date.now() - startTime
    };
  }

  async syncTransactions(transactions: any[]): Promise<SyncResult> {
    const startTime = Date.now();
    let syncedCount = 0;
    let failedCount = 0;

    for (const transaction of transactions) {
      try {
        const invoice = {
          Line: transaction.items.map((item: any) => ({
            Amount: item.amount,
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: {
              ItemRef: {
                value: item.itemId,
                name: item.name
              }
            }
          })),
          CustomerRef: {
            value: transaction.customerId
          },
          DueDate: transaction.dueDate
        };

        await axios.post(
          `${this.baseUrl}/company/${this.realmId}/invoice`,
          invoice,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          }
        );

        syncedCount++;
      } catch (error) {
        failedCount++;
        logger.error('Failed to sync transaction to QuickBooks', error);
      }
    }

    return {
      success: failedCount === 0,
      syncedCount,
      failedCount,
      duration: Date.now() - startTime
    };
  }

  async fetchTransactions(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      // SECURITY FIX: Use QuickBooks API parameters instead of building SQL-like query
      if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
        throw new Error('Invalid date parameters');
      }
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDateStr) || !dateRegex.test(endDateStr)) {
        throw new Error('Invalid date format');
      }
      
      // Use QuickBooks filter parameters directly - no string concatenation
      const response = await axios.get(
        `${this.baseUrl}/company/${this.realmId}/invoice`,
        {
          params: {
            mindate: startDateStr,
            maxdate: endDateStr
          },
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      return response.data.QueryResponse?.Invoice || [];
    } catch (error) {
      logger.error('Failed to fetch QuickBooks transactions', error);
      return [];
    }
  }

  getOAuthUrl(state: string): string {
    const clientId = process.env.QUICKBOOKS_CLIENT_ID;
    const redirectUri = `${process.env.API_URL}/api/v1/integrations/oauth/callback/quickbooks`;
    const scope = 'com.intuit.quickbooks.accounting';

    return `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&scope=${scope}&redirect_uri=${redirectUri}&response_type=code&state=${state}`;
  }

  async exchangeCodeForToken(code: string): Promise<any> {
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.API_URL}/api/v1/integrations/oauth/callback/quickbooks`
      }),
      {
        auth: {
          username: process.env.QUICKBOOKS_CLIENT_ID || '',
          password: process.env.QUICKBOOKS_CLIENT_SECRET || ''
        }
      }
    );

    return response.data;
  }

  async refreshToken(refreshToken: string): Promise<any> {
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        auth: {
          username: process.env.QUICKBOOKS_CLIENT_ID || '',
          password: process.env.QUICKBOOKS_CLIENT_SECRET || ''
        }
      }
    );

    return response.data;
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    const crypto = require('crypto');
    const webhookToken = process.env.QUICKBOOKS_WEBHOOK_TOKEN || '';

    const hash = crypto
      .createHmac('sha256', webhookToken)
      .update(payload)
      .digest('base64');

    return hash === signature;
  }

  async handleWebhook(event: any): Promise<void> {
    logger.info('Handling QuickBooks webhook', {
      eventType: event.eventNotifications?.[0]?.eventType
    });

    for (const notification of event.eventNotifications || []) {
      switch (notification.eventType) {
        case 'CREATE':
          // Handle entity creation
          break;
        case 'UPDATE':
          // Handle entity update
          break;
        case 'DELETE':
          // Handle entity deletion
          break;
      }
    }
  }
}
```

### FILE: src/services/monitoring.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { redisClient } from '../config/redis';

// Define the type for our metrics query result
interface MetricsResult {
  total: string | number;
  connected: string | number;
  healthy: string | number;
  degraded: string | number;
  unhealthy: string | number;
}

export class MonitoringService {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  async startHealthChecks() {
    logger.info('Starting health monitoring...');
    
    // Check health every minute
    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllIntegrations();
    }, 60000);

    // Calculate metrics every 5 minutes
    this.metricsInterval = setInterval(async () => {
      await this.calculateMetrics();
    }, 300000);

    // Run initial checks
    await this.checkAllIntegrations();
    await this.calculateMetrics();
  }

  private async checkAllIntegrations() {
    try {
      const integrations = await db('integration_configs')
        .where('status', 'connected');

      for (const integration of integrations) {
        await this.checkIntegrationHealth(integration);
      }
    } catch (error) {
      logger.error('Health check failed', error);
    }
  }

  private async checkIntegrationHealth(integration: any) {
    try {
      const startTime = Date.now();
      let isHealthy = true;
      let errorMessage = null;

      // Try to get credentials and test connection
      try {
        const provider = this.getProvider(integration.integration_type);
        const credentials = await this.getCredentials(
          integration.venue_id,
          integration.integration_type
        );
        
        if (provider && credentials) {
          await provider.initialize(credentials);
          isHealthy = await provider.testConnection();
        }
      } catch (error: any) {
        isHealthy = false;
        errorMessage = error.message;
      }

      const responseTime = Date.now() - startTime;

      // Calculate 24-hour metrics
      const metrics = await this.calculate24HourMetrics(
        integration.venue_id,
        integration.integration_type
      );

      // Update or insert health record
      await db('integration_health')
        .insert({
          venue_id: integration.venue_id,
          integration_type: integration.integration_type,
          success_rate: metrics.successRate,
          average_sync_time_ms: metrics.avgSyncTime,
          last_success_at: isHealthy ? new Date() : undefined,
          last_failure_at: !isHealthy ? new Date() : undefined,
          sync_count_24h: metrics.syncCount,
          success_count_24h: metrics.successCount,
          failure_count_24h: metrics.failureCount,
          api_calls_24h: metrics.apiCalls,
          queue_depth: await this.getQueueDepth(
            integration.venue_id,
            integration.integration_type
          ),
          calculated_at: new Date()
        })
        .onConflict(['venue_id', 'integration_type'])
        .merge();

      // Update integration status if health changed
      const newHealthStatus = this.determineHealthStatus(
        isHealthy,
        metrics.successRate,
        responseTime
      );

      if (integration.health_status !== newHealthStatus) {
        await db('integration_configs')
          .where('id', integration.id)
          .update({
            health_status: newHealthStatus,
            health_checked_at: new Date(),
            last_error: errorMessage,
            updated_at: new Date()
          });

        logger.info('Integration health status changed', {
          venueId: integration.venue_id,
          integration: integration.integration_type,
          oldStatus: integration.health_status,
          newStatus: newHealthStatus
        });
      }
    } catch (error) {
      logger.error('Failed to check integration health', {
        integrationId: integration.id,
        error
      });
    }
  }

  private async calculate24HourMetrics(venueId: string, integrationType: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const logs = await db('sync_logs')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .where('started_at', '>=', twentyFourHoursAgo);

    const syncCount = logs.length;
    const successCount = logs.filter((l: any) => l.status === 'completed').length;
    const failureCount = logs.filter((l: any) => l.status === 'failed').length;
    const successRate = syncCount > 0 ? (successCount / syncCount) * 100 : 100;
    
    const avgSyncTime = logs.length > 0
      ? logs.reduce((sum: number, log: any) => sum + (log.duration_ms || 0), 0) / logs.length
      : 0;

    const apiCalls = logs.reduce((sum: number, log: any) => sum + (log.api_calls_made || 0), 0);

    return {
      syncCount,
      successCount,
      failureCount,
      successRate,
      avgSyncTime,
      apiCalls
    };
  }

  private async getQueueDepth(venueId: string, integrationType: string): Promise<number> {
    const count = await db('sync_queue')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .where('status', 'pending')
      .count('id as count')
      .first();

    return parseInt(count?.count as string || '0');
  }

  private determineHealthStatus(
    isConnected: boolean,
    successRate: number,
    responseTime: number
  ): string {
    if (!isConnected) {
      return 'unhealthy';
    }
    
    if (successRate < 50 || responseTime > 10000) {
      return 'unhealthy';
    }
    
    if (successRate < 90 || responseTime > 5000) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  private async calculateMetrics() {
    try {
      // Properly typed query result
      const result = await db('integration_configs')
        .select(
          db.raw('COUNT(id) as total'),
          db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as connected', ['connected']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as healthy', ['healthy']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as degraded', ['degraded']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as unhealthy', ['unhealthy'])
        )
        .first() as unknown as MetricsResult;

      // Calculate queue metrics
      const queueMetrics = await db('sync_queue')
        .select('status')
        .count('id as count')
        .groupBy('status');

      // Store in Redis for quick access
      await redisClient.setex(
        'integration:metrics:platform',
        300, // 5 minutes
        JSON.stringify({
          integrations: result,
          queues: queueMetrics,
          timestamp: new Date()
        })
      );

      logger.info('Platform metrics calculated', {
        total: result?.total || 0,
        connected: result?.connected || 0,
        healthy: result?.healthy || 0
      });
    } catch (error) {
      logger.error('Failed to calculate metrics', error);
    }
  }

  private getProvider(integrationType: string) {
    const providers: Record<string, any> = {
      square: require('../providers/square/square.provider').SquareProvider,
      stripe: require('../providers/stripe/stripe.provider').StripeProvider,
      mailchimp: require('../providers/mailchimp/mailchimp.provider').MailchimpProvider,
      quickbooks: require('../providers/quickbooks/quickbooks.provider').QuickBooksProvider
    };

    const ProviderClass = providers[integrationType];
    return ProviderClass ? new ProviderClass() : null;
  }

  private async getCredentials(venueId: string, integrationType: string) {
    const tokenVault = require('./token-vault.service').tokenVault;
    
    // Try OAuth token first
    const token = await tokenVault.getToken(venueId, integrationType);
    if (token) {
      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token
      };
    }

    // Try API key
    const apiKey = await tokenVault.getApiKey(venueId, integrationType);
    if (apiKey) {
      return {
        apiKey: apiKey.api_key,
        apiSecret: apiKey.api_secret
      };
    }

    return null;
  }

  async stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    logger.info('Health monitoring stopped');
  }

  async getHealthSummary(): Promise<any> {
    try {
      // Get cached metrics from Redis
      const cached = await redisClient.get('integration:metrics:platform');
      if (cached) {
        return JSON.parse(cached);
      }

      // Calculate fresh if not cached
      await this.calculateMetrics();
      const fresh = await redisClient.get('integration:metrics:platform');
      return fresh ? JSON.parse(fresh) : null;
    } catch (error) {
      logger.error('Failed to get health summary', error);
      return null;
    }
  }
}

export const monitoringService = new MonitoringService();
```

### FILE: src/types/integration.types.ts
```typescript
export enum IntegrationType {
  SQUARE = 'square',
  STRIPE = 'stripe',
  MAILCHIMP = 'mailchimp',
  QUICKBOOKS = 'quickbooks'
}

export enum IntegrationStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  SUSPENDED = 'suspended'
}

export enum SyncDirection {
  TO_PROVIDER = 'to_provider',
  FROM_PROVIDER = 'from_provider',
  BIDIRECTIONAL = 'bidirectional'
}

export interface IntegrationConfig {
  id: string;
  venueId: string;
  integrationType: IntegrationType;
  status: IntegrationStatus;
  config: {
    syncEnabled: boolean;
    syncInterval: number;
    syncDirection: SyncDirection;
    filters?: any;
  };
  fieldMappings: Record<string, string>;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/models/SyncLog.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface ISyncLog {
  id?: string;
  integration_id: string;
  status: 'success' | 'failed' | 'partial';
  records_synced?: number;
  errors?: any;
  started_at: Date;
  completed_at?: Date;
  created_at?: Date;
}

export class SyncLogModel {
  private db: Knex;
  private tableName = 'sync_logs';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ISyncLog): Promise<ISyncLog> {
    const [log] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return log;
  }

  async findById(id: string): Promise<ISyncLog | null> {
    const log = await this.db(this.tableName)
      .where({ id })
      .first();
    return log || null;
  }

  async findByIntegrationId(integrationId: string, limit = 10): Promise<ISyncLog[]> {
    return this.db(this.tableName)
      .where({ integration_id: integrationId })
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  async update(id: string, data: Partial<ISyncLog>): Promise<ISyncLog | null> {
    const [log] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return log || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default SyncLogModel;
```

### FILE: src/models/Webhook.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IWebhook {
  id?: string;
  integration_id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  last_triggered?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class WebhookModel {
  private db: Knex;
  private tableName = 'webhooks';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IWebhook): Promise<IWebhook> {
    const [webhook] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return webhook;
  }

  async findById(id: string): Promise<IWebhook | null> {
    const webhook = await this.db(this.tableName)
      .where({ id })
      .first();
    return webhook || null;
  }

  async findByIntegrationId(integrationId: string): Promise<IWebhook[]> {
    return this.db(this.tableName)
      .where({ integration_id: integrationId, active: true });
  }

  async update(id: string, data: Partial<IWebhook>): Promise<IWebhook | null> {
    const [webhook] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return webhook || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default WebhookModel;
```

### FILE: src/models/Connection.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IConnection {
  id?: string;
  integration_id: string;
  external_id: string;
  status: 'connected' | 'disconnected' | 'error';
  metadata?: any;
  last_activity?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class ConnectionModel {
  private db: Knex;
  private tableName = 'connections';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IConnection): Promise<IConnection> {
    const [connection] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return connection;
  }

  async findById(id: string): Promise<IConnection | null> {
    const connection = await this.db(this.tableName)
      .where({ id })
      .first();
    return connection || null;
  }

  async findByIntegrationId(integrationId: string): Promise<IConnection[]> {
    return this.db(this.tableName)
      .where({ integration_id: integrationId });
  }

  async update(id: string, data: Partial<IConnection>): Promise<IConnection | null> {
    const [connection] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return connection || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default ConnectionModel;
```

### FILE: src/models/Integration.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IIntegration {
  id?: string;
  name: string;
  provider: string;
  status: 'active' | 'inactive' | 'error';
  config?: any;
  credentials?: any;
  last_sync?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class IntegrationModel {
  private db: Knex;
  private tableName = 'integrations';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IIntegration): Promise<IIntegration> {
    const [integration] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return integration;
  }

  async findById(id: string): Promise<IIntegration | null> {
    const integration = await this.db(this.tableName)
      .where({ id })
      .first();
    return integration || null;
  }

  async findAll(filters: Partial<IIntegration> = {}): Promise<IIntegration[]> {
    return this.db(this.tableName).where(filters);
  }

  async update(id: string, data: Partial<IIntegration>): Promise<IIntegration | null> {
    const [integration] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return integration || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default IntegrationModel;
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    venueId?: string;
    role: string;
    permissions?: string[];
  };
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;

    req.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };

    next();
  } catch (error: any) {
    logger.error('Authentication failed:', error);
    
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ 
        success: false,
        error: 'Token expired' 
      });
      return;
    }
    
    res.status(401).json({ 
      success: false,
      error: 'Invalid token' 
    });
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt by user ${req.user.id} with role ${req.user.role}`);
      res.status(403).json({ 
        success: false,
        error: 'Insufficient permissions' 
      });
      return;
    }

    next();
  };
}

// Webhook signature verification
export function verifyWebhookSignature(provider: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signatures: Record<string, string | undefined> = {
      stripe: req.headers['stripe-signature'] as string,
      square: req.headers['x-square-signature'] as string,
      mailchimp: req.headers['x-mandrill-signature'] as string,
      quickbooks: req.headers['intuit-signature'] as string
    };

    const signature = signatures[provider];
    
    if (!signature) {
      logger.warn(`Missing webhook signature for ${provider}`);
      res.status(401).json({ 
        success: false,
        error: 'Invalid webhook signature' 
      });
      return;
    }

    // TODO: Implement actual signature verification per provider
    logger.info(`Webhook received from ${provider}`);
    next();
  };
}
```

### FILE: src/providers/provider.interface.ts
```typescript
export interface IntegrationProvider {
  name: string;
  initialize(credentials: any): Promise<void>;
  testConnection(): Promise<boolean>;
  
  // Sync operations
  syncProducts?(products: any[]): Promise<any>;
  syncCustomers?(customers: any[]): Promise<any>;
  syncTransactions?(transactions: any[]): Promise<any>;
  syncInventory?(inventory: any[]): Promise<any>;
  
  // Fetch operations
  fetchProducts?(): Promise<any[]>;
  fetchCustomers?(): Promise<any[]>;
  fetchTransactions?(startDate: Date, endDate: Date): Promise<any[]>;
  
  // Webhook handling
  handleWebhook?(event: any): Promise<void>;
  validateWebhookSignature?(payload: string, signature: string): boolean;
  
  // OAuth
  getOAuthUrl?(state: string): string;
  exchangeCodeForToken?(code: string): Promise<any>;
  refreshToken?(refreshToken: string): Promise<any>;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors?: any[];
  duration: number;
}

export interface ProviderConfig {
  venueId: string;
  credentials: any;
  settings?: any;
  mappings?: any;
}
```

### FILE: src/services/monitoring.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { redisClient } from '../config/redis';

// Define the type for our metrics query result
interface MetricsResult {
  total: string | number;
  connected: string | number;
  healthy: string | number;
  degraded: string | number;
  unhealthy: string | number;
}

export class MonitoringService {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  async startHealthChecks() {
    logger.info('Starting health monitoring...');
    
    // Check health every minute
    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllIntegrations();
    }, 60000);

    // Calculate metrics every 5 minutes
    this.metricsInterval = setInterval(async () => {
      await this.calculateMetrics();
    }, 300000);

    // Run initial checks
    await this.checkAllIntegrations();
    await this.calculateMetrics();
  }

  private async checkAllIntegrations() {
    try {
      const integrations = await db('integration_configs')
        .where('status', 'connected');

      for (const integration of integrations) {
        await this.checkIntegrationHealth(integration);
      }
    } catch (error) {
      logger.error('Health check failed', error);
    }
  }

  private async checkIntegrationHealth(integration: any) {
    try {
      const startTime = Date.now();
      let isHealthy = true;
      let errorMessage = null;

      // Try to get credentials and test connection
      try {
        const provider = this.getProvider(integration.integration_type);
        const credentials = await this.getCredentials(
          integration.venue_id,
          integration.integration_type
        );
        
        if (provider && credentials) {
          await provider.initialize(credentials);
          isHealthy = await provider.testConnection();
        }
      } catch (error: any) {
        isHealthy = false;
        errorMessage = error.message;
      }

      const responseTime = Date.now() - startTime;

      // Calculate 24-hour metrics
      const metrics = await this.calculate24HourMetrics(
        integration.venue_id,
        integration.integration_type
      );

      // Update or insert health record
      await db('integration_health')
        .insert({
          venue_id: integration.venue_id,
          integration_type: integration.integration_type,
          success_rate: metrics.successRate,
          average_sync_time_ms: metrics.avgSyncTime,
          last_success_at: isHealthy ? new Date() : undefined,
          last_failure_at: !isHealthy ? new Date() : undefined,
          sync_count_24h: metrics.syncCount,
          success_count_24h: metrics.successCount,
          failure_count_24h: metrics.failureCount,
          api_calls_24h: metrics.apiCalls,
          queue_depth: await this.getQueueDepth(
            integration.venue_id,
            integration.integration_type
          ),
          calculated_at: new Date()
        })
        .onConflict(['venue_id', 'integration_type'])
        .merge();

      // Update integration status if health changed
      const newHealthStatus = this.determineHealthStatus(
        isHealthy,
        metrics.successRate,
        responseTime
      );

      if (integration.health_status !== newHealthStatus) {
        await db('integration_configs')
          .where('id', integration.id)
          .update({
            health_status: newHealthStatus,
            health_checked_at: new Date(),
            last_error: errorMessage,
            updated_at: new Date()
          });

        logger.info('Integration health status changed', {
          venueId: integration.venue_id,
          integration: integration.integration_type,
          oldStatus: integration.health_status,
          newStatus: newHealthStatus
        });
      }
    } catch (error) {
      logger.error('Failed to check integration health', {
        integrationId: integration.id,
        error
      });
    }
  }

  private async calculate24HourMetrics(venueId: string, integrationType: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const logs = await db('sync_logs')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .where('started_at', '>=', twentyFourHoursAgo);

    const syncCount = logs.length;
    const successCount = logs.filter((l: any) => l.status === 'completed').length;
    const failureCount = logs.filter((l: any) => l.status === 'failed').length;
    const successRate = syncCount > 0 ? (successCount / syncCount) * 100 : 100;
    
    const avgSyncTime = logs.length > 0
      ? logs.reduce((sum: number, log: any) => sum + (log.duration_ms || 0), 0) / logs.length
      : 0;

    const apiCalls = logs.reduce((sum: number, log: any) => sum + (log.api_calls_made || 0), 0);

    return {
      syncCount,
      successCount,
      failureCount,
      successRate,
      avgSyncTime,
      apiCalls
    };
  }

  private async getQueueDepth(venueId: string, integrationType: string): Promise<number> {
    const count = await db('sync_queue')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .where('status', 'pending')
      .count('id as count')
      .first();

    return parseInt(count?.count as string || '0');
  }

  private determineHealthStatus(
    isConnected: boolean,
    successRate: number,
    responseTime: number
  ): string {
    if (!isConnected) {
      return 'unhealthy';
    }
    
    if (successRate < 50 || responseTime > 10000) {
      return 'unhealthy';
    }
    
    if (successRate < 90 || responseTime > 5000) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  private async calculateMetrics() {
    try {
      // Properly typed query result
      const result = await db('integration_configs')
        .select(
          db.raw('COUNT(id) as total'),
          db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as connected', ['connected']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as healthy', ['healthy']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as degraded', ['degraded']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as unhealthy', ['unhealthy'])
        )
        .first() as unknown as MetricsResult;

      // Calculate queue metrics
      const queueMetrics = await db('sync_queue')
        .select('status')
        .count('id as count')
        .groupBy('status');

      // Store in Redis for quick access
      await redisClient.setex(
        'integration:metrics:platform',
        300, // 5 minutes
        JSON.stringify({
          integrations: result,
          queues: queueMetrics,
          timestamp: new Date()
        })
      );

      logger.info('Platform metrics calculated', {
        total: result?.total || 0,
        connected: result?.connected || 0,
        healthy: result?.healthy || 0
      });
    } catch (error) {
      logger.error('Failed to calculate metrics', error);
    }
  }

  private getProvider(integrationType: string) {
    const providers: Record<string, any> = {
      square: require('../providers/square/square.provider').SquareProvider,
      stripe: require('../providers/stripe/stripe.provider').StripeProvider,
      mailchimp: require('../providers/mailchimp/mailchimp.provider').MailchimpProvider,
      quickbooks: require('../providers/quickbooks/quickbooks.provider').QuickBooksProvider
    };

    const ProviderClass = providers[integrationType];
    return ProviderClass ? new ProviderClass() : null;
  }

  private async getCredentials(venueId: string, integrationType: string) {
    const tokenVault = require('./token-vault.service').tokenVault;
    
    // Try OAuth token first
    const token = await tokenVault.getToken(venueId, integrationType);
    if (token) {
      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token
      };
    }

    // Try API key
    const apiKey = await tokenVault.getApiKey(venueId, integrationType);
    if (apiKey) {
      return {
        apiKey: apiKey.api_key,
        apiSecret: apiKey.api_secret
      };
    }

    return null;
  }

  async stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    logger.info('Health monitoring stopped');
  }

  async getHealthSummary(): Promise<any> {
    try {
      // Get cached metrics from Redis
      const cached = await redisClient.get('integration:metrics:platform');
      if (cached) {
        return JSON.parse(cached);
      }

      // Calculate fresh if not cached
      await this.calculateMetrics();
      const fresh = await redisClient.get('integration:metrics:platform');
      return fresh ? JSON.parse(fresh) : null;
    } catch (error) {
      logger.error('Failed to get health summary', error);
      return null;
    }
  }
}

export const monitoringService = new MonitoringService();
```

### FILE: src/types/integration.types.ts
```typescript
export enum IntegrationType {
  SQUARE = 'square',
  STRIPE = 'stripe',
  MAILCHIMP = 'mailchimp',
  QUICKBOOKS = 'quickbooks'
}

export enum IntegrationStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  SUSPENDED = 'suspended'
}

export enum SyncDirection {
  TO_PROVIDER = 'to_provider',
  FROM_PROVIDER = 'from_provider',
  BIDIRECTIONAL = 'bidirectional'
}

export interface IntegrationConfig {
  id: string;
  venueId: string;
  integrationType: IntegrationType;
  status: IntegrationStatus;
  config: {
    syncEnabled: boolean;
    syncInterval: number;
    syncDirection: SyncDirection;
    filters?: any;
  };
  fieldMappings: Record<string, string>;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/integration-service//src/routes/mapping.routes.ts:13:mappingRoutes.put('/:provider/mappings', mappingController.updateMappings);
backend/services/integration-service//src/config/database.ts:15:    await db.raw('SELECT 1');
backend/services/integration-service//src/migrations/001_create_integration_tables.js:75:    table.enum('operation_type', ['create', 'update', 'delete', 'sync', 'reconcile']).notNullable();
backend/services/integration-service//src/controllers/admin.controller.ts:52:        .select(
backend/services/integration-service//src/controllers/admin.controller.ts:169:        .select('priority', 'status')
backend/services/integration-service//src/controllers/webhook.controller.ts:223:      // Update status
backend/services/integration-service//src/controllers/webhook.controller.ts:226:        .update({
backend/services/integration-service//src/controllers/sync.controller.ts:47:      // Update sync queue to pause
backend/services/integration-service//src/controllers/sync.controller.ts:54:        .update({
backend/services/integration-service//src/controllers/sync.controller.ts:56:          updated_at: new Date()
backend/services/integration-service//src/controllers/sync.controller.ts:93:        .select('status')
backend/services/integration-service//src/controllers/sync.controller.ts:164:      await query.update({
backend/services/integration-service//src/controllers/sync.controller.ts:167:        updated_at: new Date()
backend/services/integration-service//src/controllers/mapping.controller.ts:54:  async updateMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
backend/services/integration-service//src/controllers/mapping.controller.ts:71:        message: 'Mappings updated successfully'
backend/services/integration-service//src/controllers/health.controller.ts:64:        .select(
backend/services/integration-service//src/models/SyncLog.ts:44:  async update(id: string, data: Partial<ISyncLog>): Promise<ISyncLog | null> {
backend/services/integration-service//src/models/SyncLog.ts:47:      .update(data)
backend/services/integration-service//src/models/Webhook.ts:13:  updated_at?: Date;
backend/services/integration-service//src/models/Webhook.ts:43:  async update(id: string, data: Partial<IWebhook>): Promise<IWebhook | null> {
backend/services/integration-service//src/models/Webhook.ts:46:      .update({ ...data, updated_at: new Date() })
backend/services/integration-service//src/models/Connection.ts:12:  updated_at?: Date;
backend/services/integration-service//src/models/Connection.ts:42:  async update(id: string, data: Partial<IConnection>): Promise<IConnection | null> {
backend/services/integration-service//src/models/Connection.ts:45:      .update({ ...data, updated_at: new Date() })
backend/services/integration-service//src/models/Integration.ts:13:  updated_at?: Date;
backend/services/integration-service//src/models/Integration.ts:42:  async update(id: string, data: Partial<IIntegration>): Promise<IIntegration | null> {
backend/services/integration-service//src/models/Integration.ts:45:      .update({ ...data, updated_at: new Date() })
backend/services/integration-service//src/providers/mailchimp/mailchimp.provider.ts:197:    return crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
backend/services/integration-service//src/providers/stripe/stripe.provider.ts:46:          // Update existing
backend/services/integration-service//src/providers/stripe/stripe.provider.ts:47:          stripeProduct = await this.stripe.products.update(product.id, {
backend/services/integration-service//src/providers/stripe/stripe.provider.ts:66:        // Create or update price
backend/services/integration-service//src/providers/square/square.provider.ts:170:      .update(payload)
backend/services/integration-service//src/providers/square/square.provider.ts:183:      case 'inventory.count.updated':
backend/services/integration-service//src/providers/square/square.provider.ts:184:        // Handle inventory update
backend/services/integration-service//src/providers/square/square.provider.ts:186:      case 'catalog.version.updated':
backend/services/integration-service//src/providers/square/square.provider.ts:187:        // Handle catalog update
backend/services/integration-service//src/providers/quickbooks/quickbooks.provider.ts:285:      .update(payload)
backend/services/integration-service//src/providers/quickbooks/quickbooks.provider.ts:301:        case 'UPDATE':
backend/services/integration-service//src/providers/quickbooks/quickbooks.provider.ts:302:          // Handle entity update
backend/services/integration-service//src/services/monitoring.service.ts:80:      // Update or insert health record
backend/services/integration-service//src/services/monitoring.service.ts:102:      // Update integration status if health changed
backend/services/integration-service//src/services/monitoring.service.ts:112:          .update({
backend/services/integration-service//src/services/monitoring.service.ts:116:            updated_at: new Date()
backend/services/integration-service//src/services/monitoring.service.ts:198:        .select(
backend/services/integration-service//src/services/monitoring.service.ts:209:        .select('status')
backend/services/integration-service//src/services/integration.service.ts:30:      // Update status to connecting
backend/services/integration-service//src/services/integration.service.ts:31:      await this.updateIntegrationStatus(venueId, integrationType, IntegrationStatus.CONNECTING);
backend/services/integration-service//src/services/integration.service.ts:65:      // Update integration config
backend/services/integration-service//src/services/integration.service.ts:97:      await this.updateIntegrationStatus(
backend/services/integration-service//src/services/integration.service.ts:113:      // Update status
backend/services/integration-service//src/services/integration.service.ts:114:      await this.updateIntegrationStatus(
backend/services/integration-service//src/services/integration.service.ts:129:      // Update config
backend/services/integration-service//src/services/integration.service.ts:132:        .update({
backend/services/integration-service//src/services/integration.service.ts:135:          updated_at: new Date()
backend/services/integration-service//src/services/integration.service.ts:223:      // Update sync log
backend/services/integration-service//src/services/integration.service.ts:226:        .update({
backend/services/integration-service//src/services/integration.service.ts:235:      // Update last sync time
backend/services/integration-service//src/services/integration.service.ts:241:        .update({
backend/services/integration-service//src/services/integration.service.ts:243:          updated_at: new Date()
backend/services/integration-service//src/services/integration.service.ts:266:      .select('id', 'name', 'description', 'base_price as price');
backend/services/integration-service//src/services/integration.service.ts:288:      .select('id', 'email', 'first_name', 'last_name', 'phone');
backend/services/integration-service//src/services/integration.service.ts:313:      .select('id', 'order_id', 'price', 'purchased_at', 'customer_id');
backend/services/integration-service//src/services/integration.service.ts:437:  private async updateIntegrationStatus(
backend/services/integration-service//src/services/integration.service.ts:453:        .update({
backend/services/integration-service//src/services/integration.service.ts:457:          updated_at: new Date()
backend/services/integration-service//src/services/integration.service.ts:485:        .update({
backend/services/integration-service//src/services/integration.service.ts:487:          updated_at: new Date()
backend/services/integration-service//src/services/mapping.service.ts:27:        .update({
backend/services/integration-service//src/services/mapping.service.ts:31:          updated_at: new Date()
backend/services/integration-service//src/services/mapping.service.ts:70:      .update({
backend/services/integration-service//src/services/mapping.service.ts:73:        updated_at: new Date()
backend/services/integration-service//src/services/mapping.service.ts:266:      .update({
backend/services/integration-service//src/services/mapping.service.ts:268:        updated_at: new Date()
backend/services/integration-service//src/services/mapping.service.ts:356:          .update({
backend/services/integration-service//src/services/mapping.service.ts:358:            updated_at: new Date()
backend/services/integration-service//src/services/token-vault.service.ts:39:          .update({
backend/services/integration-service//src/services/token-vault.service.ts:45:            updated_at: new Date()
backend/services/integration-service//src/services/token-vault.service.ts:81:      // Update last used timestamp
backend/services/integration-service//src/services/token-vault.service.ts:84:        .update({ last_used_at: new Date() });
backend/services/integration-service//src/services/token-vault.service.ts:127:          .update({
backend/services/integration-service//src/services/token-vault.service.ts:131:            updated_at: new Date()
backend/services/integration-service//src/services/oauth.service.ts:89:      // Update integration status
backend/services/integration-service//src/services/oauth.service.ts:105:          updated_at: new Date()
backend/services/integration-service//src/services/oauth.service.ts:190:        .update({
backend/services/integration-service//src/services/oauth.service.ts:194:          updated_at: new Date()
backend/services/integration-service//src/services/recovery.service.ts:72:          .update({
backend/services/integration-service//src/services/recovery.service.ts:74:            updated_at: new Date()
backend/services/integration-service//src/services/recovery.service.ts:215:      .update({
backend/services/integration-service//src/services/recovery.service.ts:219:        updated_at: new Date()
backend/services/integration-service//src/services/recovery.service.ts:230:      .update({
backend/services/integration-service//src/services/recovery.service.ts:232:        updated_at: new Date()
backend/services/integration-service//src/services/recovery.service.ts:270:      .where('updated_at', '<', staleThreshold)
backend/services/integration-service//src/services/recovery.service.ts:271:      .update({
backend/services/integration-service//src/services/recovery.service.ts:274:        updated_at: new Date()

### All JOIN operations:
backend/services/integration-service//src/providers/square/square.provider.ts:206:    ].join(' ');
backend/services/integration-service//src/services/mapping.service.ts:61:      throw new Error(`Invalid mappings: ${validation.errors.join(', ')}`);

### All WHERE clauses:

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import knex from 'knex';
import { logger } from '../utils/logger';

export const db = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10
  }
});

export async function initializeDatabase() {
  try {
    await db.raw('SELECT 1');
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
}
```
### .env.example
```
# ================================================
# INTEGRATION-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: integration-service
# Port: 3009
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=integration-service           # Service identifier

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

### FILE: src/services/monitoring.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { redisClient } from '../config/redis';

// Define the type for our metrics query result
interface MetricsResult {
  total: string | number;
  connected: string | number;
  healthy: string | number;
  degraded: string | number;
  unhealthy: string | number;
}

export class MonitoringService {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  async startHealthChecks() {
    logger.info('Starting health monitoring...');
    
    // Check health every minute
    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllIntegrations();
    }, 60000);

    // Calculate metrics every 5 minutes
    this.metricsInterval = setInterval(async () => {
      await this.calculateMetrics();
    }, 300000);

    // Run initial checks
    await this.checkAllIntegrations();
    await this.calculateMetrics();
  }

  private async checkAllIntegrations() {
    try {
      const integrations = await db('integration_configs')
        .where('status', 'connected');

      for (const integration of integrations) {
        await this.checkIntegrationHealth(integration);
      }
    } catch (error) {
      logger.error('Health check failed', error);
    }
  }

  private async checkIntegrationHealth(integration: any) {
    try {
      const startTime = Date.now();
      let isHealthy = true;
      let errorMessage = null;

      // Try to get credentials and test connection
      try {
        const provider = this.getProvider(integration.integration_type);
        const credentials = await this.getCredentials(
          integration.venue_id,
          integration.integration_type
        );
        
        if (provider && credentials) {
          await provider.initialize(credentials);
          isHealthy = await provider.testConnection();
        }
      } catch (error: any) {
        isHealthy = false;
        errorMessage = error.message;
      }

      const responseTime = Date.now() - startTime;

      // Calculate 24-hour metrics
      const metrics = await this.calculate24HourMetrics(
        integration.venue_id,
        integration.integration_type
      );

      // Update or insert health record
      await db('integration_health')
        .insert({
          venue_id: integration.venue_id,
          integration_type: integration.integration_type,
          success_rate: metrics.successRate,
          average_sync_time_ms: metrics.avgSyncTime,
          last_success_at: isHealthy ? new Date() : undefined,
          last_failure_at: !isHealthy ? new Date() : undefined,
          sync_count_24h: metrics.syncCount,
          success_count_24h: metrics.successCount,
          failure_count_24h: metrics.failureCount,
          api_calls_24h: metrics.apiCalls,
          queue_depth: await this.getQueueDepth(
            integration.venue_id,
            integration.integration_type
          ),
          calculated_at: new Date()
        })
        .onConflict(['venue_id', 'integration_type'])
        .merge();

      // Update integration status if health changed
      const newHealthStatus = this.determineHealthStatus(
        isHealthy,
        metrics.successRate,
        responseTime
      );

      if (integration.health_status !== newHealthStatus) {
        await db('integration_configs')
          .where('id', integration.id)
          .update({
            health_status: newHealthStatus,
            health_checked_at: new Date(),
            last_error: errorMessage,
            updated_at: new Date()
          });

        logger.info('Integration health status changed', {
          venueId: integration.venue_id,
          integration: integration.integration_type,
          oldStatus: integration.health_status,
          newStatus: newHealthStatus
        });
      }
    } catch (error) {
      logger.error('Failed to check integration health', {
        integrationId: integration.id,
        error
      });
    }
  }

  private async calculate24HourMetrics(venueId: string, integrationType: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const logs = await db('sync_logs')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .where('started_at', '>=', twentyFourHoursAgo);

    const syncCount = logs.length;
    const successCount = logs.filter((l: any) => l.status === 'completed').length;
    const failureCount = logs.filter((l: any) => l.status === 'failed').length;
    const successRate = syncCount > 0 ? (successCount / syncCount) * 100 : 100;
    
    const avgSyncTime = logs.length > 0
      ? logs.reduce((sum: number, log: any) => sum + (log.duration_ms || 0), 0) / logs.length
      : 0;

    const apiCalls = logs.reduce((sum: number, log: any) => sum + (log.api_calls_made || 0), 0);

    return {
      syncCount,
      successCount,
      failureCount,
      successRate,
      avgSyncTime,
      apiCalls
    };
  }

  private async getQueueDepth(venueId: string, integrationType: string): Promise<number> {
    const count = await db('sync_queue')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .where('status', 'pending')
      .count('id as count')
      .first();

    return parseInt(count?.count as string || '0');
  }

  private determineHealthStatus(
    isConnected: boolean,
    successRate: number,
    responseTime: number
  ): string {
    if (!isConnected) {
      return 'unhealthy';
    }
    
    if (successRate < 50 || responseTime > 10000) {
      return 'unhealthy';
    }
    
    if (successRate < 90 || responseTime > 5000) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  private async calculateMetrics() {
    try {
      // Properly typed query result
      const result = await db('integration_configs')
        .select(
          db.raw('COUNT(id) as total'),
          db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as connected', ['connected']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as healthy', ['healthy']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as degraded', ['degraded']),
          db.raw('COUNT(CASE WHEN health_status = ? THEN 1 END) as unhealthy', ['unhealthy'])
        )
        .first() as unknown as MetricsResult;

      // Calculate queue metrics
      const queueMetrics = await db('sync_queue')
        .select('status')
        .count('id as count')
        .groupBy('status');

      // Store in Redis for quick access
      await redisClient.setex(
        'integration:metrics:platform',
        300, // 5 minutes
        JSON.stringify({
          integrations: result,
          queues: queueMetrics,
          timestamp: new Date()
        })
      );

      logger.info('Platform metrics calculated', {
        total: result?.total || 0,
        connected: result?.connected || 0,
        healthy: result?.healthy || 0
      });
    } catch (error) {
      logger.error('Failed to calculate metrics', error);
    }
  }

  private getProvider(integrationType: string) {
    const providers: Record<string, any> = {
      square: require('../providers/square/square.provider').SquareProvider,
      stripe: require('../providers/stripe/stripe.provider').StripeProvider,
      mailchimp: require('../providers/mailchimp/mailchimp.provider').MailchimpProvider,
      quickbooks: require('../providers/quickbooks/quickbooks.provider').QuickBooksProvider
    };

    const ProviderClass = providers[integrationType];
    return ProviderClass ? new ProviderClass() : null;
  }

  private async getCredentials(venueId: string, integrationType: string) {
    const tokenVault = require('./token-vault.service').tokenVault;
    
    // Try OAuth token first
    const token = await tokenVault.getToken(venueId, integrationType);
    if (token) {
      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token
      };
    }

    // Try API key
    const apiKey = await tokenVault.getApiKey(venueId, integrationType);
    if (apiKey) {
      return {
        apiKey: apiKey.api_key,
        apiSecret: apiKey.api_secret
      };
    }

    return null;
  }

  async stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    logger.info('Health monitoring stopped');
  }

  async getHealthSummary(): Promise<any> {
    try {
      // Get cached metrics from Redis
      const cached = await redisClient.get('integration:metrics:platform');
      if (cached) {
        return JSON.parse(cached);
      }

      // Calculate fresh if not cached
      await this.calculateMetrics();
      const fresh = await redisClient.get('integration:metrics:platform');
      return fresh ? JSON.parse(fresh) : null;
    } catch (error) {
      logger.error('Failed to get health summary', error);
      return null;
    }
  }
}

export const monitoringService = new MonitoringService();
```

### FILE: src/services/integration.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { tokenVault } from './token-vault.service';
import { SquareProvider } from '../providers/square/square.provider';
import { StripeProvider } from '../providers/stripe/stripe.provider';
import { MailchimpProvider } from '../providers/mailchimp/mailchimp.provider';
import { QuickBooksProvider } from '../providers/quickbooks/quickbooks.provider';
import { IntegrationProvider } from '../providers/provider.interface';
import { IntegrationType, IntegrationStatus } from '../types/integration.types';
import { v4 as uuidv4 } from 'uuid';

export class IntegrationService {
  private providers: Map<string, IntegrationProvider>;

  constructor() {
    this.providers = new Map<string, IntegrationProvider>([
      ['square', new SquareProvider()],
      ['stripe', new StripeProvider()],
      ['mailchimp', new MailchimpProvider()],
      ['quickbooks', new QuickBooksProvider()]
    ]);
  }

  async connectIntegration(
    venueId: string,
    integrationType: IntegrationType,
    credentials: any
  ): Promise<any> {
    try {
      // Update status to connecting
      await this.updateIntegrationStatus(venueId, integrationType, IntegrationStatus.CONNECTING);

      // Get provider
      const provider = this.providers.get(integrationType);
      if (!provider) {
        throw new Error(`Provider ${integrationType} not found`);
      }

      // Initialize provider with credentials
      await provider.initialize(credentials);

      // Test connection
      const isConnected = await provider.testConnection();
      if (!isConnected) {
        throw new Error('Connection test failed');
      }

      // Store credentials securely
      if (credentials.accessToken) {
        await tokenVault.storeToken(venueId, integrationType, {
          access_token: credentials.accessToken,
          refresh_token: credentials.refreshToken,
          expires_at: credentials.expiresAt,
          scopes: credentials.scopes
        });
      } else if (credentials.apiKey) {
        await tokenVault.storeApiKey(
          venueId,
          integrationType,
          credentials.apiKey,
          credentials.apiSecret
        );
      }

      // Update integration config
      await this.upsertIntegrationConfig(venueId, integrationType, {
        status: IntegrationStatus.CONNECTED,
        connected_at: new Date(),
        config: {
          syncEnabled: true,
          syncInterval: 300, // 5 minutes
          syncDirection: 'bidirectional',
          ...credentials.config
        }
      });

      // Schedule initial sync
      await this.scheduleSync(venueId, integrationType, 'initial');

      logger.info('Integration connected successfully', {
        venueId,
        integrationType
      });

      return {
        success: true,
        message: 'Integration connected successfully',
        integrationType
      };
    } catch (error: any) {
      logger.error('Failed to connect integration', {
        venueId,
        integrationType,
        error: error.message
      });

      await this.updateIntegrationStatus(
        venueId,
        integrationType,
        IntegrationStatus.ERROR,
        error.message
      );

      throw error;
    }
  }

  async disconnectIntegration(
    venueId: string,
    integrationType: IntegrationType
  ): Promise<void> {
    try {
      // Update status
      await this.updateIntegrationStatus(
        venueId,
        integrationType,
        IntegrationStatus.DISCONNECTED
      );

      // Clear stored credentials
      await db('oauth_tokens')
        .where({ venue_id: venueId, integration_type: integrationType })
        .delete();

      await db('venue_api_keys')
        .where({ venue_id: venueId, integration_type: integrationType })
        .delete();

      // Update config
      await db('integration_configs')
        .where({ venue_id: venueId, integration_type: integrationType })
        .update({
          disconnected_at: new Date(),
          status: IntegrationStatus.DISCONNECTED,
          updated_at: new Date()
        });

      logger.info('Integration disconnected', {
        venueId,
        integrationType
      });
    } catch (error) {
      logger.error('Failed to disconnect integration', {
        venueId,
        integrationType,
        error
      });
      throw error;
    }
  }

  async getIntegrationStatus(
    venueId: string,
    integrationType?: IntegrationType
  ): Promise<any> {
    const query = db('integration_configs')
      .where('venue_id', venueId);

    if (integrationType) {
      query.where('integration_type', integrationType);
    }

    const configs = await query;

    // Enrich with health data
    for (const config of configs) {
      const health = await db('integration_health')
        .where({
          venue_id: venueId,
          integration_type: config.integration_type
        })
        .first();

      config.health = health;
    }

    return integrationType ? configs[0] : configs;
  }

  async syncNow(
    venueId: string,
    integrationType: IntegrationType,
    options: any = {}
  ): Promise<any> {
    try {
      const syncId = uuidv4();

      // Log sync start
      await db('sync_logs').insert({
        id: syncId,
        venue_id: venueId,
        integration_type: integrationType,
        operation: options.operation || 'manual_sync',
        status: 'started',
        started_at: new Date()
      });

      // Get provider and credentials
      const provider = this.providers.get(integrationType);
      if (!provider) {
        throw new Error(`Provider ${integrationType} not found`);
      }

      const credentials = await this.getCredentials(venueId, integrationType);
      await provider.initialize(credentials);

      // Perform sync based on type
      let result;
      switch (options.syncType) {
        case 'products':
          result = await this.syncProducts(venueId, integrationType, provider);
          break;
        case 'customers':
          result = await this.syncCustomers(venueId, integrationType, provider);
          break;
        case 'transactions':
          result = await this.syncTransactions(venueId, integrationType, provider);
          break;
        default:
          result = await this.fullSync(venueId, integrationType, provider);
      }

      // Update sync log
      await db('sync_logs')
        .where('id', syncId)
        .update({
          status: 'completed',
          completed_at: new Date(),
          success_count: result.syncedCount,
          error_count: result.failedCount,
          duration_ms: result.duration,
          details: JSON.stringify(result)
        });

      // Update last sync time
      await db('integration_configs')
        .where({
          venue_id: venueId,
          integration_type: integrationType
        })
        .update({
          last_sync_at: new Date(),
          updated_at: new Date()
        });

      return result;
    } catch (error: any) {
      logger.error('Sync failed', {
        venueId,
        integrationType,
        error: error.message
      });
      throw error;
    }
  }

  private async syncProducts(
    venueId: string,
    integrationType: string,
    provider: IntegrationProvider
  ): Promise<any> {
    // Get products from database
    const products = await db('events')
      .where('venue_id', venueId)
      .where('is_active', true)
      .select('id', 'name', 'description', 'base_price as price');

    // Map fields based on configuration
    const config = await this.getIntegrationConfig(venueId, integrationType);
    const mappedProducts = this.applyFieldMappings(products, config.field_mappings);

    // Sync to provider
    if (provider.syncProducts) {
      return await provider.syncProducts(mappedProducts);
    }

    return { success: false, message: 'Provider does not support product sync' };
  }

  private async syncCustomers(
    venueId: string,
    integrationType: string,
    provider: IntegrationProvider
  ): Promise<any> {
    // Get customers from database
    const customers = await db('customers')
      .where('venue_id', venueId)
      .select('id', 'email', 'first_name', 'last_name', 'phone');

    // Map and sync
    const config = await this.getIntegrationConfig(venueId, integrationType);
    const mappedCustomers = this.applyFieldMappings(customers, config.field_mappings);

    if (provider.syncCustomers) {
      return await provider.syncCustomers(mappedCustomers);
    }

    return { success: false, message: 'Provider does not support customer sync' };
  }

  private async syncTransactions(
    venueId: string,
    integrationType: string,
    provider: IntegrationProvider
  ): Promise<any> {
    // Get recent transactions
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const transactions = await db('tickets')
      .where('venue_id', venueId)
      .where('purchased_at', '>=', startDate)
      .select('id', 'order_id', 'price', 'purchased_at', 'customer_id');

    // Map and sync
    const config = await this.getIntegrationConfig(venueId, integrationType);
    const mappedTransactions = this.applyFieldMappings(transactions, config.field_mappings);

    if (provider.syncTransactions) {
      return await provider.syncTransactions(mappedTransactions);
    }

    return { success: false, message: 'Provider does not support transaction sync' };
  }

  private async fullSync(
    venueId: string,
    integrationType: string,
    provider: IntegrationProvider
  ): Promise<any> {
    const results = {
      products: null as any,
      customers: null as any,
      transactions: null as any,
      overall: {
        success: true,
        syncedCount: 0,
        failedCount: 0,
        duration: 0
      }
    };

    const startTime = Date.now();

    // Sync products
    if (provider.syncProducts) {
      results.products = await this.syncProducts(venueId, integrationType, provider);
      results.overall.syncedCount += results.products.syncedCount || 0;
      results.overall.failedCount += results.products.failedCount || 0;
    }

    // Sync customers
    if (provider.syncCustomers) {
      results.customers = await this.syncCustomers(venueId, integrationType, provider);
      results.overall.syncedCount += results.customers.syncedCount || 0;
      results.overall.failedCount += results.customers.failedCount || 0;
    }

    // Sync transactions
    if (provider.syncTransactions) {
      results.transactions = await this.syncTransactions(venueId, integrationType, provider);
      results.overall.syncedCount += results.transactions.syncedCount || 0;
      results.overall.failedCount += results.transactions.failedCount || 0;
    }

    results.overall.duration = Date.now() - startTime;
    results.overall.success = results.overall.failedCount === 0;

    return results;
  }

  private async getCredentials(venueId: string, integrationType: string): Promise<any> {
    // Try OAuth token first
    const token = await tokenVault.getToken(venueId, integrationType);
    if (token) {
      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token
      };
    }

    // Try API key
    const apiKey = await tokenVault.getApiKey(venueId, integrationType);
    if (apiKey) {
      return {
        apiKey: apiKey.api_key,
        apiSecret: apiKey.api_secret
      };
    }

    throw new Error('No credentials found');
  }

  private async getIntegrationConfig(venueId: string, integrationType: string): Promise<any> {
    const config = await db('integration_configs')
      .where({
        venue_id: venueId,
        integration_type: integrationType
      })
      .first();

    return config || {
      field_mappings: {},
      config: {}
    };
  }

  private applyFieldMappings(data: any[], mappings: any): any[] {
    if (!mappings || Object.keys(mappings).length === 0) {
      return data;
    }

    return data.map(item => {
      const mapped: any = {};
      for (const [source, target] of Object.entries(mappings)) {
        const value = this.getNestedValue(item, source as string);
        this.setNestedValue(mapped, target as string, value);
      }
      return { ...item, ...mapped };
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    const last = parts.pop()!;
    const target = parts.reduce((acc, part) => {
      if (!acc[part]) acc[part] = {};
      return acc[part];
    }, obj);
    target[last] = value;
  }

  private async updateIntegrationStatus(
    venueId: string,
    integrationType: IntegrationType,
    status: IntegrationStatus,
    error?: string
  ): Promise<void> {
    const existing = await db('integration_configs')
      .where({
        venue_id: venueId,
        integration_type: integrationType
      })
      .first();

    if (existing) {
      await db('integration_configs')
        .where({ id: existing.id })
        .update({
          status,
          last_error: error,
          last_error_at: error ? new Date() : null,
          updated_at: new Date()
        });
    } else {
      await db('integration_configs').insert({
        venue_id: venueId,
        integration_type: integrationType,
        status,
        last_error: error,
        last_error_at: error ? new Date() : null
      });
    }
  }

  private async upsertIntegrationConfig(
    venueId: string,
    integrationType: string,
    data: any
  ): Promise<void> {
    const existing = await db('integration_configs')
      .where({
        venue_id: venueId,
        integration_type: integrationType
      })
      .first();

    if (existing) {
      await db('integration_configs')
        .where({ id: existing.id })
        .update({
          ...data,
          updated_at: new Date()
        });
    } else {
      await db('integration_configs').insert({
        venue_id: venueId,
        integration_type: integrationType,
        ...data
      });
    }
  }

  private async scheduleSync(
    venueId: string,
    integrationType: string,
    syncType: string
  ): Promise<void> {
    const { queues } = require('../config/queue');
    
    await queues.normal.add('sync', {
      venueId,
      integrationType,
      syncType,
      scheduledAt: new Date()
    }, {
      delay: syncType === 'initial' ? 5000 : 0
    });
  }
}

export const integrationService = new IntegrationService();
```

### FILE: src/services/mapping.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class MappingService {
  async applyTemplate(
    venueId: string,
    integration: string,
    templateId?: string
  ): Promise<void> {
    try {
      // Get template
      const template = templateId 
        ? await this.getTemplate(templateId)
        : await this.detectBestTemplate(venueId, integration);

      if (!template) {
        throw new Error('No suitable template found');
      }

      // Apply mappings
      await db('integration_configs')
        .where({
          venue_id: venueId,
          integration_type: integration
        })
        .update({
          field_mappings: template.mappings,
          template_id: template.id,
          template_applied_at: new Date(),
          updated_at: new Date()
        });

      // Track usage
      await this.incrementTemplateUsage(template.id);

      logger.info('Template applied', {
        venueId,
        integration,
        templateId: template.id
      });
    } catch (error) {
      logger.error('Failed to apply template', {
        venueId,
        integration,
        templateId,
        error
      });
      throw error;
    }
  }

  async createCustomMapping(
    venueId: string,
    integration: string,
    mappings: Record<string, string>
  ): Promise<void> {
    // Validate mappings
    const validation = await this.validateMappings(integration, mappings);
    if (!validation.valid) {
      throw new Error(`Invalid mappings: ${validation.errors.join(', ')}`);
    }

    // Save mappings
    await db('integration_configs')
      .where({
        venue_id: venueId,
        integration_type: integration
      })
      .update({
        field_mappings: mappings,
        template_id: null,
        updated_at: new Date()
      });

    logger.info('Custom mappings saved', {
      venueId,
      integration
    });
  }

  async getAvailableFields(integration: string): Promise<any> {
    // Define available fields for each integration
    const fields: Record<string, any> = {
      square: {
        source: [
          'event.name',
          'event.description',
          'event.price',
          'ticket.type',
          'ticket.price',
          'customer.email',
          'customer.name'
        ],
        target: [
          'item.name',
          'item.description',
          'item.variation.price',
          'customer.email_address',
          'customer.given_name',
          'customer.family_name'
        ]
      },
      stripe: {
        source: [
          'event.name',
          'event.price',
          'customer.email',
          'customer.id'
        ],
        target: [
          'product.name',
          'price.unit_amount',
          'customer.email',
          'customer.metadata.venue_id'
        ]
      },
      mailchimp: {
        source: [
          'customer.email',
          'customer.firstName',
          'customer.lastName',
          'customer.tags'
        ],
        target: [
          'email_address',
          'merge_fields.FNAME',
          'merge_fields.LNAME',
          'tags'
        ]
      },
      quickbooks: {
        source: [
          'event.name',
          'event.price',
          'customer.name',
          'customer.email',
          'transaction.amount'
        ],
        target: [
          'Item.Name',
          'Item.UnitPrice',
          'Customer.DisplayName',
          'Customer.PrimaryEmailAddr.Address',
          'Invoice.Line.Amount'
        ]
      }
    };

    return fields[integration] || { source: [], target: [] };
  }

  async createTemplate(template: {
    name: string;
    description?: string;
    venueType?: string;
    integrationType: string;
    mappings: any;
    validationRules?: any;
  }): Promise<string> {
    const id = uuidv4();

    await db('field_mapping_templates').insert({
      id,
      name: template.name,
      description: template.description,
      venue_type: template.venueType,
      integration_type: template.integrationType,
      mappings: JSON.stringify(template.mappings),
      validation_rules: template.validationRules ? 
        JSON.stringify(template.validationRules) : null,
      is_active: true
    });

    logger.info('Template created', {
      templateId: id,
      name: template.name
    });

    return id;
  }

  private async detectBestTemplate(
    venueId: string,
    integration: string
  ): Promise<any | null> {
    // Get venue details to detect type
    const venue = await db('venues')
      .where('id', venueId)
      .first();

    if (!venue) {
      return null;
    }

    // Detect venue type based on attributes
    const venueType = this.detectVenueType(venue);

    // Find matching template
    const template = await db('field_mapping_templates')
      .where({
        venue_type: venueType,
        integration_type: integration,
        is_active: true
      })
      .orderBy('usage_count', 'desc')
      .first();

    if (template) {
      template.mappings = JSON.parse(template.mappings);
      return template;
    }

    // Fallback to default template
    const defaultTemplate = await db('field_mapping_templates')
      .where({
        integration_type: integration,
        is_default: true,
        is_active: true
      })
      .first();

    if (defaultTemplate) {
      defaultTemplate.mappings = JSON.parse(defaultTemplate.mappings);
    }

    return defaultTemplate;
  }

  private detectVenueType(venue: any): string {
    // Simple detection logic based on venue attributes
    const name = venue.name?.toLowerCase() || '';
    
    if (name.includes('comedy') || name.includes('laugh')) {
      return 'comedy_club';
    }
    if (name.includes('music') || name.includes('concert')) {
      return 'music_venue';
    }
    if (name.includes('theater') || name.includes('theatre')) {
      return 'theater';
    }
    if (name.includes('festival')) {
      return 'festival';
    }
    
    return 'standard';
  }

  private async getTemplate(templateId: string): Promise<any | null> {
    const template = await db('field_mapping_templates')
      .where('id', templateId)
      .first();

    if (template) {
      template.mappings = JSON.parse(template.mappings);
    }

    return template;
  }

  private async incrementTemplateUsage(templateId: string): Promise<void> {
    await db('field_mapping_templates')
      .where('id', templateId)
      .increment('usage_count', 1)
      .update({
        last_used_at: new Date(),
        updated_at: new Date()
      });
  }

  private async validateMappings(
    integration: string,
    mappings: Record<string, string>
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const fields = await this.getAvailableFields(integration);

    // Check that target fields are valid
    for (const [_source, target] of Object.entries(mappings)) {
      if (!fields.target.includes(target)) {
        errors.push(`Invalid target field: ${target}`);
      }
    }

    // Check required fields based on integration
    const requiredMappings = this.getRequiredMappings(integration);
    for (const required of requiredMappings) {
      const hasMapping = Object.values(mappings).includes(required);
      if (!hasMapping) {
        errors.push(`Required field not mapped: ${required}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private getRequiredMappings(integration: string): string[] {
    const required: Record<string, string[]> = {
      square: ['item.name', 'item.variation.price'],
      stripe: ['product.name', 'price.unit_amount'],
      mailchimp: ['email_address'],
      quickbooks: ['Item.Name', 'Customer.DisplayName']
    };

    return required[integration] || [];
  }

  async healMapping(
    venueId: string,
    integration: string
  ): Promise<void> {
    try {
      const config = await db('integration_configs')
        .where({
          venue_id: venueId,
          integration_type: integration
        })
        .first();

      if (!config || !config.field_mappings) {
        return;
      }

      const mappings = config.field_mappings;
      const fields = await this.getAvailableFields(integration);
      const healed: Record<string, string> = {};
      const changes: string[] = [];

      // Check each mapping
      for (const [source, target] of Object.entries(mappings)) {
        if (fields.target.includes(target)) {
          healed[source] = target as string;
        } else {
          // Try to find alternative
          const alternative = this.findAlternativeField(target as string, fields.target);
          if (alternative) {
            healed[source] = alternative;
            changes.push(`${target} → ${alternative}`);
          } else {
            changes.push(`Removed: ${source} → ${target}`);
          }
        }
      }

      if (changes.length > 0) {
        // Save healed mappings
        await db('integration_configs')
          .where({
            venue_id: venueId,
            integration_type: integration
          })
          .update({
            field_mappings: healed,
            updated_at: new Date()
          });

        logger.info('Mappings healed', {
          venueId,
          integration,
          changes
        });
      }
    } catch (error) {
      logger.error('Failed to heal mappings', {
        venueId,
        integration,
        error
      });
    }
  }

  private findAlternativeField(original: string, availableFields: string[]): string | null {
    // Try to find similar field name
    const originalLower = original.toLowerCase();
    
    for (const field of availableFields) {
      const fieldLower = field.toLowerCase();
      
      // Exact match (case insensitive)
      if (fieldLower === originalLower) {
        return field;
      }
      
      // Partial match
      if (fieldLower.includes(originalLower) || originalLower.includes(fieldLower)) {
        return field;
      }
      
      // Similar ending (e.g., .name, .price)
      const originalEnd = original.split('.').pop()?.toLowerCase();
      const fieldEnd = field.split('.').pop()?.toLowerCase();
      if (originalEnd && fieldEnd && originalEnd === fieldEnd) {
        return field;
      }
    }
    
    return null;
  }
}

export const mappingService = new MappingService();
```

### FILE: src/services/sync-engine.service.ts
```typescript
import { logger } from '../utils/logger';
import { queues } from '../config/queue';

export class SyncEngineService {
  async initialize() {
    logger.info('Sync engine initializing...');
    this.setupQueueProcessors();
  }

  private setupQueueProcessors() {
    // Process critical queue
    queues.critical.process(async (job) => {
      logger.info('Processing critical job', { jobId: job.id });
      // Process job here
      return { success: true };
    });

    // Process other queues
    queues.high.process(async (job) => {
      logger.info('Processing high priority job', { jobId: job.id });
      return { success: true };
    });

    queues.normal.process(async (job) => {
      logger.info('Processing normal priority job', { jobId: job.id });
      return { success: true };
    });

    queues.low.process(async (job) => {
      logger.info('Processing low priority job', { jobId: job.id });
      return { success: true };
    });
  }

  async syncIntegration(venueId: string, integration: string, options: any = {}) {
    logger.info('Sync requested', { venueId, integration, options });
    
    // Add to queue
    await queues.normal.add('sync', {
      venueId,
      integration,
      options,
      timestamp: new Date()
    });

    return { success: true, message: 'Sync queued' };
  }
}
```

### FILE: src/services/token-vault.service.ts
```typescript
import CryptoJS from 'crypto-js';
import { db } from '../config/database';
import { logger } from '../utils/logger';

export class TokenVaultService {
  private encryptionKey: string;

  constructor() {
    // In production, this would use AWS KMS
    // For development, we use a local key
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'dev-encryption-key-32-characters';
    
    if (process.env.NODE_ENV === 'production' && process.env.MOCK_KMS === 'true') {
      logger.warn('Using mock KMS in production - this is not secure!');
    }
  }

  // Store OAuth token securely
  async storeToken(
    venueId: string,
    integration: string,
    token: any
  ): Promise<void> {
    try {
      // Encrypt tokens
      const encryptedAccessToken = this.encrypt(token.access_token);
      const encryptedRefreshToken = token.refresh_token 
        ? this.encrypt(token.refresh_token) 
        : null;

      // Upsert token record
      const existingToken = await db('oauth_tokens')
        .where({ venue_id: venueId, integration_type: integration })
        .first();

      if (existingToken) {
        await db('oauth_tokens')
          .where({ venue_id: venueId, integration_type: integration })
          .update({
            encrypted_access_token: encryptedAccessToken,
            encrypted_refresh_token: encryptedRefreshToken,
            expires_at: token.expires_at,
            scopes: token.scopes,
            last_refreshed_at: new Date(),
            updated_at: new Date()
          });
      } else {
        await db('oauth_tokens').insert({
          venue_id: venueId,
          integration_type: integration,
          encrypted_access_token: encryptedAccessToken,
          encrypted_refresh_token: encryptedRefreshToken,
          expires_at: token.expires_at,
          scopes: token.scopes,
          token_type: token.token_type || 'Bearer'
        });
      }

      logger.info('Token stored securely', { 
        venueId, 
        integration,
        hasRefreshToken: !!token.refresh_token 
      });
    } catch (error) {
      logger.error('Failed to store token', { error, venueId, integration });
      throw error;
    }
  }

  // Retrieve and decrypt token
  async getToken(venueId: string, integration: string): Promise<any> {
    try {
      const record = await db('oauth_tokens')
        .where({ venue_id: venueId, integration_type: integration })
        .first();

      if (!record) {
        return null;
      }

      // Update last used timestamp
      await db('oauth_tokens')
        .where({ id: record.id })
        .update({ last_used_at: new Date() });

      // Decrypt tokens
      const accessToken = this.decrypt(record.encrypted_access_token);
      const refreshToken = record.encrypted_refresh_token 
        ? this.decrypt(record.encrypted_refresh_token)
        : null;

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: record.expires_at,
        scopes: record.scopes,
        token_type: record.token_type
      };
    } catch (error) {
      logger.error('Failed to retrieve token', { error, venueId, integration });
      throw error;
    }
  }

  // Store API key securely
  async storeApiKey(
    venueId: string,
    integration: string,
    apiKey: string,
    apiSecret?: string
  ): Promise<void> {
    try {
      const encryptedKey = this.encrypt(apiKey);
      const encryptedSecret = apiSecret ? this.encrypt(apiSecret) : null;

      const existing = await db('venue_api_keys')
        .where({ 
          venue_id: venueId, 
          integration_type: integration,
          environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
        })
        .first();

      if (existing) {
        await db('venue_api_keys')
          .where({ id: existing.id })
          .update({
            encrypted_api_key: encryptedKey,
            encrypted_api_secret: encryptedSecret,
            is_valid: true,
            updated_at: new Date()
          });
      } else {
        await db('venue_api_keys').insert({
          venue_id: venueId,
          integration_type: integration,
          encrypted_api_key: encryptedKey,
          encrypted_api_secret: encryptedSecret,
          environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
          is_valid: true
        });
      }

      logger.info('API key stored securely', { venueId, integration });
    } catch (error) {
      logger.error('Failed to store API key', { error, venueId, integration });
      throw error;
    }
  }

  // Get API key
  async getApiKey(venueId: string, integration: string): Promise<any> {
    try {
      const record = await db('venue_api_keys')
        .where({ 
          venue_id: venueId, 
          integration_type: integration,
          environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
        })
        .first();

      if (!record) {
        return null;
      }

      return {
        api_key: this.decrypt(record.encrypted_api_key),
        api_secret: record.encrypted_api_secret 
          ? this.decrypt(record.encrypted_api_secret)
          : null
      };
    } catch (error) {
      logger.error('Failed to retrieve API key', { error, venueId, integration });
      throw error;
    }
  }

  // Refresh token if needed
  async refreshTokenIfNeeded(venueId: string, integration: string): Promise<any> {
    const token = await this.getToken(venueId, integration);
    
    if (!token || !token.expires_at) {
      return token;
    }

    const expiresIn = new Date(token.expires_at).getTime() - Date.now();
    
    // Refresh if expires in less than 5 minutes
    if (expiresIn < 5 * 60 * 1000) {
      logger.info('Token needs refresh', { venueId, integration, expiresIn });
      
      // This would call the provider's refresh method
      // For now, return the existing token
      return token;
    }

    return token;
  }

  // Mock encryption for development
  private encrypt(text: string): string {
    if (process.env.MOCK_KMS === 'true') {
      // Simple encryption for development
      return CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
    }
    
    // In production, this would use AWS KMS
    throw new Error('Real KMS not implemented yet');
  }

  // Mock decryption for development
  private decrypt(encryptedText: string): string {
    if (process.env.MOCK_KMS === 'true') {
      // Simple decryption for development
      const bytes = CryptoJS.AES.decrypt(encryptedText, this.encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    }
    
    // In production, this would use AWS KMS
    throw new Error('Real KMS not implemented yet');
  }
}

export const tokenVault = new TokenVaultService();
```

### FILE: src/services/oauth.service.ts
```typescript
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { tokenVault } from './token-vault.service';
import crypto from 'crypto';

export class OAuthService {
  private stateStore: Map<string, any> = new Map();

  async initiateOAuth(
    venueId: string,
    integrationType: string,
    userId: string
  ): Promise<string> {
    try {
      // Generate state token
      const state = this.generateStateToken();
      
      // Store state for verification
      this.stateStore.set(state, {
        venueId,
        integrationType,
        userId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });

      // Get OAuth URL based on provider
      const authUrl = this.getOAuthUrl(integrationType, state);

      // Log OAuth initiation
      await db('sync_logs').insert({
        venue_id: venueId,
        integration_type: integrationType,
        operation: 'oauth_initiated',
        status: 'pending',
        started_at: new Date()
      });

      logger.info('OAuth initiated', {
        venueId,
        integrationType,
        userId
      });

      return authUrl;
    } catch (error) {
      logger.error('Failed to initiate OAuth', {
        venueId,
        integrationType,
        error
      });
      throw error;
    }
  }

  async handleCallback(
    provider: string,
    code: string,
    state: string
  ): Promise<any> {
    try {
      // Verify state
      const stateData = this.stateStore.get(state);
      if (!stateData) {
        throw new Error('Invalid state token');
      }

      // Check expiration
      if (new Date() > stateData.expiresAt) {
        this.stateStore.delete(state);
        throw new Error('State token expired');
      }

      // Exchange code for token
      const tokens = await this.exchangeCodeForToken(provider, code);

      // Store tokens securely
      await tokenVault.storeToken(
        stateData.venueId,
        provider,
        {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: this.calculateExpiry(tokens.expires_in),
          scopes: tokens.scope?.split(' ') || []
        }
      );

      // Update integration status
      await db('integration_configs')
        .insert({
          venue_id: stateData.venueId,
          integration_type: provider,
          status: 'connected',
          connected_at: new Date(),
          config: {
            syncEnabled: true,
            syncInterval: 300
          }
        })
        .onConflict(['venue_id', 'integration_type'])
        .merge({
          status: 'connected',
          connected_at: new Date(),
          updated_at: new Date()
        });

      // Clean up state
      this.stateStore.delete(state);

      // Log success
      await db('sync_logs').insert({
        venue_id: stateData.venueId,
        integration_type: provider,
        operation: 'oauth_completed',
        status: 'completed',
        started_at: stateData.createdAt,
        completed_at: new Date()
      });

      logger.info('OAuth completed successfully', {
        venueId: stateData.venueId,
        provider
      });

      return {
        success: true,
        venueId: stateData.venueId,
        provider
      };
    } catch (error: any) {
      logger.error('OAuth callback failed', {
        provider,
        error: error.message
      });
      throw error;
    }
  }

  async refreshToken(venueId: string, integrationType: string): Promise<any> {
    try {
      const token = await tokenVault.getToken(venueId, integrationType);
      
      if (!token || !token.refresh_token) {
        throw new Error('No refresh token available');
      }

      let newTokens;
      switch (integrationType) {
        case 'square':
          newTokens = await this.refreshSquareToken(token.refresh_token);
          break;
        case 'quickbooks':
          newTokens = await this.refreshQuickBooksToken(token.refresh_token);
          break;
        case 'mailchimp':
          // Mailchimp tokens don't expire
          return token;
        default:
          throw new Error(`Refresh not supported for ${integrationType}`);
      }

      // Store new tokens
      await tokenVault.storeToken(venueId, integrationType, {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || token.refresh_token,
        expires_at: this.calculateExpiry(newTokens.expires_in),
        scopes: newTokens.scope?.split(' ') || token.scopes
      });

      logger.info('Token refreshed successfully', {
        venueId,
        integrationType
      });

      return newTokens;
    } catch (error) {
      logger.error('Token refresh failed', {
        venueId,
        integrationType,
        error
      });

      // Mark integration as needing reauth
      await db('integration_configs')
        .where({
          venue_id: venueId,
          integration_type: integrationType
        })
        .update({
          status: 'error',
          last_error: 'Token refresh failed',
          last_error_at: new Date(),
          updated_at: new Date()
        });

      throw error;
    }
  }

  private getOAuthUrl(integrationType: string, state: string): string {
    const baseUrls: Record<string, string> = {
      square: process.env.SQUARE_SANDBOX === 'true'
        ? 'https://connect.squareupsandbox.com'
        : 'https://connect.squareup.com',
      mailchimp: 'https://login.mailchimp.com',
      quickbooks: 'https://appcenter.intuit.com'
    };

    const params: Record<string, any> = {
      square: {
        client_id: process.env.SQUARE_APP_ID,
        scope: 'ITEMS_READ ITEMS_WRITE INVENTORY_READ INVENTORY_WRITE PAYMENTS_READ CUSTOMERS_READ',
        state
      },
      mailchimp: {
        response_type: 'code',
        client_id: process.env.MAILCHIMP_CLIENT_ID,
        state
      },
      quickbooks: {
        client_id: process.env.QUICKBOOKS_CLIENT_ID,
        scope: 'com.intuit.quickbooks.accounting',
        redirect_uri: `${process.env.API_URL}/api/v1/integrations/oauth/callback/quickbooks`,
        response_type: 'code',
        state
      }
    };

    const baseUrl = baseUrls[integrationType];
    const queryParams = new URLSearchParams(params[integrationType]);
    const path = integrationType === 'quickbooks' ? '/connect/oauth2' : '/oauth2/authorize';

    return `${baseUrl}${path}?${queryParams}`;
  }

  private async exchangeCodeForToken(provider: string, code: string): Promise<any> {
    
    switch (provider) {
      case 'square':
        return this.exchangeSquareCode(code);
      case 'mailchimp':
        return this.exchangeMailchimpCode(code);
      case 'quickbooks':
        return this.exchangeQuickBooksCode(code);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async exchangeSquareCode(code: string): Promise<any> {
    const axios = require('axios');
    const baseUrl = process.env.SQUARE_SANDBOX === 'true'
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';

    const response = await axios.post(`${baseUrl}/oauth2/token`, {
      client_id: process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      code,
      grant_type: 'authorization_code'
    });

    return response.data;
  }

  private async exchangeMailchimpCode(code: string): Promise<any> {
    const axios = require('axios');
    
    const response = await axios.post(
      'https://login.mailchimp.com/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.MAILCHIMP_CLIENT_ID || '',
        client_secret: process.env.MAILCHIMP_CLIENT_SECRET || '',
        code,
        redirect_uri: `${process.env.API_URL}/api/v1/integrations/oauth/callback/mailchimp`
      })
    );

    return response.data;
  }

  private async exchangeQuickBooksCode(code: string): Promise<any> {
    const axios = require('axios');
    
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.API_URL}/api/v1/integrations/oauth/callback/quickbooks`
      }),
      {
        auth: {
          username: process.env.QUICKBOOKS_CLIENT_ID || '',
          password: process.env.QUICKBOOKS_CLIENT_SECRET || ''
        }
      }
    );

    return response.data;
  }

  private async refreshSquareToken(refreshToken: string): Promise<any> {
    const axios = require('axios');
    const baseUrl = process.env.SQUARE_SANDBOX === 'true'
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';

    const response = await axios.post(`${baseUrl}/oauth2/token`, {
      client_id: process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    return response.data;
  }

  private async refreshQuickBooksToken(refreshToken: string): Promise<any> {
    const axios = require('axios');
    
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        auth: {
          username: process.env.QUICKBOOKS_CLIENT_ID || '',
          password: process.env.QUICKBOOKS_CLIENT_SECRET || ''
        }
      }
    );

    return response.data;
  }

  private generateStateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private calculateExpiry(expiresIn?: number): Date | null {
    if (!expiresIn) return null;
    return new Date(Date.now() + expiresIn * 1000);
  }

  cleanupExpiredStates(): void {
    const now = new Date();
    for (const [state, data] of this.stateStore.entries()) {
      if (data.expiresAt < now) {
        this.stateStore.delete(state);
      }
    }
  }
}

export const oauthService = new OAuthService();

// Clean up expired states every minute
setInterval(() => {
  oauthService.cleanupExpiredStates();
}, 60000);
```

### FILE: src/services/recovery.service.ts
```typescript
import { db } from '../config/database';
import { queues } from '../config/queue';
import { logger } from '../utils/logger';
// Removed unused: import { WebhookProcessor } from './webhook-processor';

export class RecoveryService {
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY_MS = 5000;
  // Removed unused: private webhookProcessor: WebhookProcessor;

  constructor() {
    // Removed unused: this.webhookProcessor = new WebhookProcessor();
  }

  async handleFailedSync(
    venueId: string,
    integrationType: string,
    error: any,
    context: any
  ): Promise<void> {
    try {
      await this.logFailure(venueId, integrationType, error, context);

      if (this.isRetryableError(error)) {
        await this.scheduleRetry(venueId, integrationType, context);
      } else if (this.isAuthError(error)) {
        await this.handleAuthFailure(venueId, integrationType);
      } else {
        await this.activateDegradedMode(venueId, integrationType);
      }
    } catch (recoveryError) {
      logger.error('Recovery process failed', {
        venueId,
        integrationType,
        originalError: error,
        recoveryError
      });
    }
  }

  async processDeadLetterQueue(): Promise<void> {
    try {
      const deadLetterItems = await db('sync_queue')
        .where('status', 'failed')
        .where('retry_count', '>=', this.MAX_RETRY_ATTEMPTS)
        .orderBy('created_at', 'asc')
        .limit(100);

      for (const item of deadLetterItems) {
        await this.attemptRecovery(item);
      }
    } catch (error) {
      logger.error('Failed to process dead letter queue', error);
    }
  }

  private async attemptRecovery(queueItem: any): Promise<void> {
    try {
      const health = await this.checkIntegrationHealth(
        queueItem.venue_id,
        queueItem.integration_type
      );

      if (health.isHealthy) {
        await queues.low.add('sync', {
          ...queueItem,
          isRecovery: true
        });

        await db('sync_queue')
          .where('id', queueItem.id)
          .update({
            status: 'recovering',
            updated_at: new Date()
          });

        logger.info('Queue item recovered', {
          queueId: queueItem.id,
          venueId: queueItem.venue_id
        });
      }
    } catch (error) {
      logger.error('Failed to recover queue item', {
        queueId: queueItem.id,
        error
      });
    }
  }

  private async checkIntegrationHealth(
    venueId: string,
    integrationType: string
  ): Promise<{ isHealthy: boolean; reason?: string }> {
    const integration = await db('integration_configs')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .first();

    if (!integration) {
      return { isHealthy: false, reason: 'Integration not found' };
    }

    if (integration.status !== 'active') {
      return { isHealthy: false, reason: 'Integration not active' };
    }

    return { isHealthy: true };
  }

  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'RATE_LIMIT',
      'SERVICE_UNAVAILABLE'
    ];

    return retryableErrors.some(code => 
      error.code === code || error.message?.includes(code)
    );
  }

  private isAuthError(error: any): boolean {
    const authErrors = [
      'UNAUTHORIZED',
      'INVALID_TOKEN',
      'TOKEN_EXPIRED',
      'AUTHENTICATION_FAILED'
    ];

    return authErrors.some(code => 
      error.code === code || 
      error.message?.includes(code) ||
      error.statusCode === 401
    );
  }

  private async scheduleRetry(
    venueId: string,
    integrationType: string,
    context: any
  ): Promise<void> {
    const retryCount = context.retryCount || 0;

    if (retryCount >= this.MAX_RETRY_ATTEMPTS) {
      await this.moveToDeadLetter(venueId, integrationType, context);
      return;
    }

    await db('sync_queue').insert({
      venue_id: venueId,
      integration_type: integrationType,
      operation: context.operation,
      data: JSON.stringify(context.data),
      status: 'pending',
      retry_count: retryCount + 1,
      scheduled_for: new Date(Date.now() + this.RETRY_DELAY_MS * Math.pow(2, retryCount)),
      created_at: new Date()
    });
  }

  private async handleAuthFailure(
    venueId: string,
    integrationType: string
  ): Promise<void> {
    // Try to refresh tokens
    const refreshed = await this.attemptTokenRefresh(venueId, integrationType);

    if (!refreshed) {
      await this.disableIntegration(venueId, integrationType, 'auth_failed');
      await this.notifyAuthFailure(venueId, integrationType);
    }
  }

  private async attemptTokenRefresh(
    _venueId: string,
    _integrationType: string
  ): Promise<boolean> {
    // Implementation depends on integration type
    try {
      // Attempt refresh logic here - placeholder
      // Parameters prefixed with _ since they're not used yet
      return false; 
    } catch {
      return false;
    }
  }

  private async moveToDeadLetter(
    venueId: string,
    integrationType: string,
    context: any
  ): Promise<void> {
    await db('sync_queue').insert({
      venue_id: venueId,
      integration_type: integrationType,
      operation: context.operation,
      data: JSON.stringify(context.data),
      status: 'failed',
      retry_count: this.MAX_RETRY_ATTEMPTS,
      error: context.lastError,
      created_at: new Date()
    });
  }

  private async disableIntegration(
    venueId: string,
    integrationType: string,
    reason: string
  ): Promise<void> {
    await db('integration_configs')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .update({
        status: 'disabled',
        disabled_reason: reason,
        disabled_at: new Date(),
        updated_at: new Date()
      });
  }

  private async activateDegradedMode(
    venueId: string,
    integrationType: string
  ): Promise<void> {
    await db('integration_configs')
      .where('venue_id', venueId)
      .where('integration_type', integrationType)
      .update({
        health_status: 'degraded',
        updated_at: new Date()
      });
  }

  private async notifyAuthFailure(
    venueId: string,
    integrationType: string
  ): Promise<void> {
    // Send notification to venue admin
    logger.warn('Auth failure notification sent', {
      venueId,
      integrationType
    });
  }

  private async logFailure(
    venueId: string,
    integrationType: string,
    error: any,
    context: any
  ): Promise<void> {
    await db('sync_logs').insert({
      venue_id: venueId,
      integration_type: integrationType,
      operation: context.operation,
      status: 'failed',
      error_message: error.message,
      error_stack: error.stack,
      context: JSON.stringify(context),
      created_at: new Date()
    });
  }

  async recoverStaleOperations(): Promise<void> {
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes

    const staleOps = await db('sync_queue')
      .where('status', 'processing')
      .where('updated_at', '<', staleThreshold)
      .update({
        status: 'pending',
        retry_count: db.raw('retry_count + 1'),
        updated_at: new Date()
      });

    if (staleOps > 0) {
      logger.info(`Recovered ${staleOps} stale operations`);
    }
  }
}

export const recoveryService = new RecoveryService();
```

