# DATABASE AUDIT: integration-service
Generated: Thu Oct  2 15:05:55 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^2.5.1",
    "morgan": "^1.10.0",
    "node-cron": "^3.0.2",
--
    "pg": "^8.11.1",
    "prom-client": "^15.1.3",
    "redis": "^4.7.1",
```

## 2. DATABASE CONFIGURATION FILES
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


## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### monitoring.service.ts
First 100 lines:
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
```

### integration.service.ts
First 100 lines:
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
```

### mapping.service.ts
First 100 lines:
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
```

### sync-engine.service.ts
First 100 lines:
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

### token-vault.service.ts
First 100 lines:
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
```

### oauth.service.ts
First 100 lines:
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
```

### recovery.service.ts
First 100 lines:
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

