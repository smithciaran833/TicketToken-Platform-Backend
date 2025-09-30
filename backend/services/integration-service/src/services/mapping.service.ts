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
