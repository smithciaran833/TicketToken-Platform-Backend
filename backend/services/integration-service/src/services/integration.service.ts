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
