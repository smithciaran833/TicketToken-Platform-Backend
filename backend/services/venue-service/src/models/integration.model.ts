import { BaseModel } from './base.model';
import { Knex } from 'knex';

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
}

export class IntegrationModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_integrations', db);
  }

  // Override findById to NOT filter by is_active
  // This allows finding inactive integrations for testing/deleting
  async findById(id: string, columns: string[] = ['*']) {
    return this.db(this.tableName)
      .where({ id })
      .select(columns)
      .first();
  }

  // Override update to not use deleted_at
  async update(id: string, data: any) {
    const mappedUpdates: any = {};

    if (data.config !== undefined) mappedUpdates.config_data = data.config;
    if (data.config_data !== undefined) mappedUpdates.config_data = data.config_data;
    if (data.status !== undefined) mappedUpdates.is_active = data.status === 'active';
    if (data.is_active !== undefined) mappedUpdates.is_active = data.is_active;

    const [updated] = await this.db(this.tableName)
      .where({ id })
      .update({
        ...mappedUpdates,
        updated_at: new Date()
      })
      .returning('*');

    return updated;
  }

  // Override delete to use is_active (soft delete)
  async delete(id: string) {
    return this.db(this.tableName)
      .where({ id })
      .update({
        is_active: false,
        updated_at: new Date()
      });
  }

  async findByVenue(venueId: string): Promise<IIntegration[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId })
      .where({ is_active: true });
  }

  async findByVenueAndType(venueId: string, type: string): Promise<IIntegration | undefined> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, integration_type: type })
      .where({ is_active: true })
      .first();
  }

  async create(data: any): Promise<IIntegration> {
    const integType = data.type || data.integration_type;

    const mappedData = {
      venue_id: data.venue_id,
      integration_type: integType,
      integration_name: data.name || data.integration_name || `${integType} Integration`,
      config_data: data.config || data.config_data || {},
      api_key_encrypted: data.encrypted_credentials?.apiKey || data.api_key_encrypted,
      api_secret_encrypted: data.encrypted_credentials?.secretKey || data.api_secret_encrypted,
      is_active: data.is_active !== undefined ? data.is_active : true
    };

    const [created] = await this.db(this.tableName)
      .insert(mappedData)
      .returning('*');

    return created;
  }
}
