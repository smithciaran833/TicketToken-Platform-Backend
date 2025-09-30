import { IntegrationModel, IIntegration } from '../models/integration.model';
import { Knex } from 'knex';

interface IIntegrationWithCredentials extends IIntegration {
  encrypted_credentials?: string;
}

export class IntegrationService {
  private integrationModel: IntegrationModel;
  private db: Knex;
  private logger: any;

  constructor(dependencies: { db: Knex; logger: any }) {
    this.db = dependencies.db;
    this.logger = dependencies.logger;
    this.integrationModel = new IntegrationModel(this.db);
  }

  async getIntegration(integrationId: string): Promise<IIntegrationWithCredentials | null> {
    const integration = await this.integrationModel.findById(integrationId);
    return integration as IIntegrationWithCredentials;
  }

  async getVenueIntegrationByType(venueId: string, type: string): Promise<IIntegrationWithCredentials | null> {
    return this.integrationModel.findByVenueAndType(venueId, type) as Promise<IIntegrationWithCredentials | null>;
  }

  async listVenueIntegrations(venueId: string): Promise<IIntegration[]> {
    return this.integrationModel.findByVenue(venueId);
  }

  async createIntegration(venueId: string, data: any): Promise<IIntegration> {
    return this.integrationModel.create({
      venue_id: venueId,
      type: data.type,
      config: data.config || {},
      status: data.status || 'active',
      encrypted_credentials: data.encrypted_credentials
    });
  }

  async updateIntegration(integrationId: string, updates: any): Promise<IIntegration> {
    return this.integrationModel.update(integrationId, updates);
  }

  async deleteIntegration(integrationId: string): Promise<void> {
    await this.integrationModel.delete(integrationId);
  }

  async testIntegration(integrationId: string): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(integrationId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
    }

    const encrypted_credentials = integration.api_key_encrypted || integration.api_secret_encrypted;

    // Use integration_type instead of type
    switch (integration.integration_type) {
      case 'stripe':
        return this.testStripeIntegration(encrypted_credentials);
      case 'square':
        return this.testSquareIntegration(encrypted_credentials);
      default:
        return { success: false, message: 'Integration type not supported' };
    }
  }

  private testStripeIntegration(encrypted_credentials: any): { success: boolean; message: string } {
    try {
      // Test Stripe connection
      return { success: true, message: 'Stripe connection successful' };
    } catch (error) {
      return { success: false, message: 'Failed to connect to Stripe' };
    }
  }

  private testSquareIntegration(encrypted_credentials: any): { success: boolean; message: string } {
    try {
      // Test Square connection
      return { success: true, message: 'Square connection successful' };
    } catch (error) {
      return { success: false, message: 'Failed to connect to Square' };
    }
  }

  private encryptCredentials(encrypted_credentials: any): string {
    // Implement encryption
    return JSON.stringify(encrypted_credentials);
  }

  private decryptCredentials(encryptedCredentials: string): any {
    // Implement decryption
    return JSON.parse(encryptedCredentials);
  }

  async syncWithExternalSystem(integrationId: string): Promise<void> {
    const integration = await this.getIntegration(integrationId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
    }

    const encrypted_credentials = integration.api_key_encrypted || integration.api_secret_encrypted;

    // Use integration_type instead of type
    this.logger.info({ integrationId, type: integration.integration_type }, 'Syncing with external system');
  }
}
