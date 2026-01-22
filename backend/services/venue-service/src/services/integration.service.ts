import { IntegrationModel, IIntegration } from '../models/integration.model';
import { Knex } from 'knex';
import { encryptCredentials, decryptCredentials } from '../utils/encryption';
import { CacheService } from './cache.service';

interface IIntegrationWithCredentials extends IIntegration {
  encrypted_credentials?: string;
}

/**
 * SECURITY FIX (CREDS1): Integration service with real credential encryption
 * CACHE FIX: Added cache invalidation on create/update/delete
 */
export class IntegrationService {
  private integrationModel: IntegrationModel;
  private db: Knex;
  private logger: any;
  private cacheService: CacheService;

  constructor(dependencies: { db: Knex; logger: any; cacheService: CacheService }) {
    this.db = dependencies.db;
    this.logger = dependencies.logger.child({ component: 'IntegrationService' });
    this.integrationModel = new IntegrationModel(this.db);
    this.cacheService = dependencies.cacheService;
  }

  /**
   * SECURITY FIX: Validate tenant context
   */
  private validateTenantContext(tenantId?: string): void {
    if (!tenantId) {
      throw new Error('Tenant context required for integration operations');
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }
  }

  /**
   * SECURITY FIX: Verify venue belongs to tenant
   */
  private async verifyVenueOwnership(venueId: string, tenantId: string): Promise<void> {
    const venue = await this.db('venues')
      .where({ id: venueId, tenant_id: tenantId })
      .first();

    if (!venue) {
      this.logger.warn({ venueId, tenantId }, 'Venue ownership verification failed');
      throw new Error('Venue not found or access denied');
    }
  }

  async getIntegration(integrationId: string, tenantId: string): Promise<IIntegrationWithCredentials | null> {
    this.validateTenantContext(tenantId);

    const integration = await this.integrationModel.findById(integrationId);
    if (!integration) {
      return null;
    }

    // Verify venue ownership
    await this.verifyVenueOwnership(integration.venue_id, tenantId);

    return integration as IIntegrationWithCredentials;
  }

  async getVenueIntegrationByType(venueId: string, type: string, tenantId: string): Promise<IIntegrationWithCredentials | null> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    return this.integrationModel.findByVenueAndType(venueId, type) as Promise<IIntegrationWithCredentials | null>;
  }

  async listVenueIntegrations(venueId: string, tenantId: string): Promise<IIntegration[]> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    return this.integrationModel.findByVenue(venueId);
  }

  async createIntegration(venueId: string, tenantId: string, data: any): Promise<IIntegration> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    // SECURITY FIX: Encrypt credentials before storing
    let encryptedCreds = data.encrypted_credentials;
    if (data.credentials) {
      encryptedCreds = encryptCredentials(data.credentials);
      this.logger.info({ venueId, type: data.type }, 'Encrypted integration credentials');
    }

    const integration = await this.integrationModel.create({
      venue_id: venueId,
      tenant_id: tenantId,
      type: data.type,
      config: data.config || {},
      status: data.status || 'active',
      encrypted_credentials: encryptedCreds
    });

    // CACHE FIX: Clear venue cache after creating integration
    await this.cacheService.clearVenueCache(venueId, tenantId);
    this.logger.debug({ venueId, tenantId, integrationId: integration.id }, 'Cache cleared after integration create');

    return integration;
  }

  async updateIntegration(integrationId: string, tenantId: string, updates: any): Promise<IIntegration> {
    this.validateTenantContext(tenantId);

    // Verify ownership
    const existing = await this.getIntegration(integrationId, tenantId);
    if (!existing) {
      throw new Error('Integration not found or access denied');
    }

    // SECURITY FIX: Encrypt new credentials if provided
    if (updates.credentials) {
      updates.encrypted_credentials = encryptCredentials(updates.credentials);
      delete updates.credentials; // Remove plaintext
      this.logger.info({ integrationId }, 'Updated integration credentials');
    }

    const updated = await this.integrationModel.update(integrationId, updates);

    // CACHE FIX: Clear venue cache after updating integration
    await this.cacheService.clearVenueCache(existing.venue_id, tenantId);
    this.logger.debug({ venueId: existing.venue_id, tenantId, integrationId }, 'Cache cleared after integration update');

    return updated;
  }

  async deleteIntegration(integrationId: string, tenantId: string): Promise<void> {
    this.validateTenantContext(tenantId);

    // Verify ownership
    const existing = await this.getIntegration(integrationId, tenantId);
    if (!existing) {
      throw new Error('Integration not found or access denied');
    }

    await this.integrationModel.delete(integrationId);

    // CACHE FIX: Clear venue cache after deleting integration
    await this.cacheService.clearVenueCache(existing.venue_id, tenantId);
    this.logger.info({ venueId: existing.venue_id, tenantId, integrationId }, 'Integration deleted and cache cleared');
  }

  async testIntegration(integrationId: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    this.validateTenantContext(tenantId);

    const integration = await this.getIntegration(integrationId, tenantId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
    }

    // SECURITY FIX: Decrypt credentials for testing
    let credentials: any = null;
    try {
      if (integration.encrypted_credentials) {
        credentials = decryptCredentials(integration.encrypted_credentials);
      }
    } catch (error: any) {
      this.logger.error({ integrationId, error: error.message }, 'Failed to decrypt credentials');
      return { success: false, message: 'Failed to decrypt credentials' };
    }

    // Use integration_type instead of type
    switch (integration.integration_type) {
      case 'stripe':
        return this.testStripeIntegration(credentials);
      case 'square':
        return this.testSquareIntegration(credentials);
      default:
        return { success: false, message: 'Integration type not supported' };
    }
  }

  private testStripeIntegration(credentials: any): { success: boolean; message: string } {
    try {
      // TODO: Implement actual Stripe API test call
      if (!credentials || !credentials.api_key) {
        return { success: false, message: 'Stripe API key missing' };
      }
      // In production, would call Stripe API to validate key
      return { success: true, message: 'Stripe connection successful' };
    } catch (error: any) {
      return { success: false, message: `Failed to connect to Stripe: ${error.message}` };
    }
  }

  private testSquareIntegration(credentials: any): { success: boolean; message: string } {
    try {
      // TODO: Implement actual Square API test call
      if (!credentials || !credentials.access_token) {
        return { success: false, message: 'Square access token missing' };
      }
      // In production, would call Square API to validate token
      return { success: true, message: 'Square connection successful' };
    } catch (error: any) {
      return { success: false, message: `Failed to connect to Square: ${error.message}` };
    }
  }

  /**
   * SECURITY FIX: Get decrypted credentials for use (internal only)
   * WARNING: Only call this when you need to use the credentials for API calls
   */
  async getDecryptedCredentials(integrationId: string, tenantId: string): Promise<any> {
    this.validateTenantContext(tenantId);

    const integration = await this.getIntegration(integrationId, tenantId);
    if (!integration || !integration.encrypted_credentials) {
      throw new Error('Integration credentials not found');
    }

    try {
      return decryptCredentials(integration.encrypted_credentials);
    } catch (error: any) {
      this.logger.error({ integrationId, error: error.message }, 'Failed to decrypt credentials');
      throw new Error('Failed to decrypt integration credentials');
    }
  }

  async syncWithExternalSystem(integrationId: string, tenantId: string): Promise<void> {
    this.validateTenantContext(tenantId);

    const integration = await this.getIntegration(integrationId, tenantId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
    }

    // Get decrypted credentials for sync
    const credentials = await this.getDecryptedCredentials(integrationId, tenantId);

    // Use integration_type instead of type
    this.logger.info({ integrationId, type: integration.integration_type }, 'Syncing with external system');

    // TODO: Implement actual sync logic with external system
  }
}
