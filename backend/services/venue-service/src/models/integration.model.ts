import { BaseModel } from './base.model';
import { Knex } from 'knex';
import { encryptCredentials, decryptCredentials } from '../utils/encryption';

// Valid integration types
const VALID_INTEGRATION_TYPES = [
  'stripe',
  'square',
  'paypal',
  'shopify',
  'eventbrite',
  'ticketmaster',
  'mailchimp',
  'sendgrid',
  'twilio',
  'zoom',
  'google_calendar',
  'zapier',
  'webhook'
] as const;

export interface IIntegration {
  id?: string;
  venue_id: string;
  integration_type: string;
  integration_name?: string;
  config_data: Record<string, any>;
  is_active?: boolean;
  api_key_encrypted?: string;
  api_secret_encrypted?: string;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
}

export class IntegrationModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_integrations', db);
  }

  async update(id: string, data: any) {
    const mappedUpdates: any = {};

    if (data.config !== undefined) mappedUpdates.config_data = data.config;
    if (data.config_data !== undefined) mappedUpdates.config_data = data.config_data;
    
    // Encrypt credentials if being updated
    if (data.apiKey || data.api_key) {
      mappedUpdates.api_key_encrypted = encryptCredentials(data.apiKey || data.api_key);
    }
    
    if (data.apiSecret || data.api_secret || data.secretKey) {
      mappedUpdates.api_secret_encrypted = encryptCredentials(data.apiSecret || data.api_secret || data.secretKey);
    }

    const [updated] = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({
        ...mappedUpdates,
        updated_at: new Date()
      })
      .returning('*');

    return updated;
  }

  async findByVenue(venueId: string): Promise<IIntegration[]> {
    return this.findAllByVenue(venueId, false);
  }

  /**
   * SECURITY FIX (M4): Explicit column selection - excludes encrypted credentials
   */
  async findAllByVenue(venueId: string, includeDeleted: boolean = false): Promise<IIntegration[]> {
    let query = this.db(this.tableName)
      .select([
        'id',
        'venue_id',
        'integration_type',
        'integration_name',
        'config_data',
        'is_active',
        'created_at',
        'updated_at',
        // NOTE: api_key_encrypted, api_secret_encrypted, encrypted_credentials excluded
      ])
      .where({ venue_id: venueId });

    if (!includeDeleted) {
      query = query.whereNull('deleted_at');
    }

    return query;
  }

  /**
   * SECURITY FIX (M4): Explicit column selection - excludes encrypted credentials
   */
  async findByVenueAndType(venueId: string, type: string): Promise<IIntegration | undefined> {
    return this.db(this.tableName)
      .select([
        'id',
        'venue_id',
        'integration_type',
        'integration_name',
        'config_data',
        'is_active',
        'created_at',
        'updated_at',
        // NOTE: api_key_encrypted, api_secret_encrypted, encrypted_credentials excluded
      ])
      .where({ venue_id: venueId, integration_type: type })
      .whereNull('deleted_at')
      .first();
  }

  /**
   * Get integration credentials with decryption
   * Returns null if integration not found or credentials don't exist
   */
  async getDecryptedCredentials(id: string): Promise<{ apiKey?: string; apiSecret?: string } | null> {
    const integration = await this.findById(id);
    
    if (!integration) {
      return null;
    }
    
    const credentials: { apiKey?: string; apiSecret?: string } = {};
    
    if (integration.api_key_encrypted) {
      try {
        credentials.apiKey = decryptCredentials(integration.api_key_encrypted);
      } catch (error) {
        // Log error but don't expose encryption failure details
        throw new Error('Failed to decrypt API key');
      }
    }
    
    if (integration.api_secret_encrypted) {
      try {
        credentials.apiSecret = decryptCredentials(integration.api_secret_encrypted);
      } catch (error) {
        throw new Error('Failed to decrypt API secret');
      }
    }
    
    return Object.keys(credentials).length > 0 ? credentials : null;
  }

  async create(data: any): Promise<IIntegration> {
    const integType = data.type || data.integration_type;

    // Validate integration type
    if (integType && !VALID_INTEGRATION_TYPES.includes(integType)) {
      throw new Error(`Invalid integration type: ${integType}. Valid types: ${VALID_INTEGRATION_TYPES.join(', ')}`);
    }

    // Encrypt credentials if provided
    let encryptedApiKey: string | undefined;
    let encryptedSecret: string | undefined;
    
    if (data.apiKey || data.api_key) {
      encryptedApiKey = encryptCredentials(data.apiKey || data.api_key);
    }
    
    if (data.apiSecret || data.api_secret || data.secretKey) {
      encryptedSecret = encryptCredentials(data.apiSecret || data.api_secret || data.secretKey);
    }

    const mappedData = {
      venue_id: data.venue_id,
      tenant_id: data.tenant_id,  // ADD THIS
      integration_type: integType,
      integration_name: data.name || data.integration_name || `${integType} Integration`,
      config_data: data.config || data.config_data || {},
      api_key_encrypted: encryptedApiKey,
      api_secret_encrypted: encryptedSecret,
      encrypted_credentials: data.encrypted_credentials,  // ADD THIS
    };

    const [created] = await this.db(this.tableName)
      .insert(mappedData)
      .returning('*');

    return created;
  }
}
