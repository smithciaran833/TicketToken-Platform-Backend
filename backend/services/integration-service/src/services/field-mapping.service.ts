/**
 * Field Mapping Service
 * 
 * Handles data transformation between TicketToken and third-party providers.
 * Supports custom field mappings, data type conversions, and business logic transformations.
 */

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform?: (value: any, record: any) => any;
  defaultValue?: any;
  required?: boolean;
}

export interface MappingConfiguration {
  entityType: string; // e.g., 'customer', 'order', 'payment'
  provider: string; // e.g., 'mailchimp', 'quickbooks', 'square', 'stripe'
  direction: 'to_provider' | 'from_provider';
  mappings: FieldMapping[];
}

export class FieldMappingService {
  private configurations: Map<string, MappingConfiguration> = new Map();

  constructor() {
    this.initializeDefaultMappings();
  }

  /**
   * Initialize default field mappings for all providers
   */
  private initializeDefaultMappings(): void {
    // Mailchimp customer mappings
    this.registerConfiguration({
      entityType: 'customer',
      provider: 'mailchimp',
      direction: 'to_provider',
      mappings: [
        { sourceField: 'email', targetField: 'email', required: true },
        { sourceField: 'firstName', targetField: 'firstName' },
        { sourceField: 'lastName', targetField: 'lastName' },
        { sourceField: 'phone', targetField: 'phone' },
        {
          sourceField: 'tags',
          targetField: 'tags',
          transform: (tags: string[]) => tags || [],
        },
      ],
    });

    this.registerConfiguration({
      entityType: 'customer',
      provider: 'mailchimp',
      direction: 'from_provider',
      mappings: [
        { sourceField: 'email_address', targetField: 'email', required: true },
        { sourceField: 'merge_fields.FNAME', targetField: 'firstName' },
        { sourceField: 'merge_fields.LNAME', targetField: 'lastName' },
        { sourceField: 'merge_fields.PHONE', targetField: 'phone' },
        {
          sourceField: 'tags',
          targetField: 'tags',
          transform: (tags: any[]) => tags?.map((t: any) => t.name) || [],
        },
      ],
    });

    // QuickBooks customer mappings
    this.registerConfiguration({
      entityType: 'customer',
      provider: 'quickbooks',
      direction: 'to_provider',
      mappings: [
        {
          sourceField: 'email',
          targetField: 'primaryEmailAddr',
          required: true,
        },
        { sourceField: 'firstName', targetField: 'givenName' },
        { sourceField: 'lastName', targetField: 'familyName' },
        { sourceField: 'company', targetField: 'companyName' },
        { sourceField: 'phone', targetField: 'primaryPhone' },
        {
          sourceField: 'name',
          targetField: 'displayName',
          required: true,
          transform: (value: any, record: any) =>
            value || `${record.firstName || ''} ${record.lastName || ''}`.trim(),
        },
      ],
    });

    this.registerConfiguration({
      entityType: 'customer',
      provider: 'quickbooks',
      direction: 'from_provider',
      mappings: [
        { sourceField: 'PrimaryEmailAddr.Address', targetField: 'email' },
        { sourceField: 'GivenName', targetField: 'firstName' },
        { sourceField: 'FamilyName', targetField: 'lastName' },
        { sourceField: 'CompanyName', targetField: 'company' },
        { sourceField: 'PrimaryPhone.FreeFormNumber', targetField: 'phone' },
        { sourceField: 'DisplayName', targetField: 'name' },
      ],
    });

    // Square customer mappings
    this.registerConfiguration({
      entityType: 'customer',
      provider: 'square',
      direction: 'to_provider',
      mappings: [
        { sourceField: 'email', targetField: 'emailAddress' },
        { sourceField: 'firstName', targetField: 'givenName' },
        { sourceField: 'lastName', targetField: 'familyName' },
        { sourceField: 'company', targetField: 'companyName' },
        { sourceField: 'phone', targetField: 'phoneNumber' },
        { sourceField: 'notes', targetField: 'note' },
      ],
    });

    this.registerConfiguration({
      entityType: 'customer',
      provider: 'square',
      direction: 'from_provider',
      mappings: [
        { sourceField: 'email_address', targetField: 'email' },
        { sourceField: 'given_name', targetField: 'firstName' },
        { sourceField: 'family_name', targetField: 'lastName' },
        { sourceField: 'company_name', targetField: 'company' },
        { sourceField: 'phone_number', targetField: 'phone' },
        { sourceField: 'note', targetField: 'notes' },
      ],
    });

    // Stripe customer mappings
    this.registerConfiguration({
      entityType: 'customer',
      provider: 'stripe',
      direction: 'to_provider',
      mappings: [
        { sourceField: 'email', targetField: 'email' },
        {
          sourceField: 'name',
          targetField: 'name',
          transform: (value: any, record: any) =>
            value || `${record.firstName || ''} ${record.lastName || ''}`.trim(),
        },
        { sourceField: 'phone', targetField: 'phone' },
        { sourceField: 'description', targetField: 'description' },
      ],
    });

    this.registerConfiguration({
      entityType: 'customer',
      provider: 'stripe',
      direction: 'from_provider',
      mappings: [
        { sourceField: 'email', targetField: 'email' },
        { sourceField: 'name', targetField: 'name' },
        { sourceField: 'phone', targetField: 'phone' },
        { sourceField: 'description', targetField: 'description' },
      ],
    });

    // Order/Invoice mappings can be added here following the same pattern
  }

  /**
   * Register a mapping configuration
   */
  registerConfiguration(config: MappingConfiguration): void {
    const key = this.getConfigKey(config.entityType, config.provider, config.direction);
    this.configurations.set(key, config);
  }

  /**
   * Get mapping configuration
   */
  getConfiguration(
    entityType: string,
    provider: string,
    direction: 'to_provider' | 'from_provider'
  ): MappingConfiguration | undefined {
    const key = this.getConfigKey(entityType, provider, direction);
    return this.configurations.get(key);
  }

  /**
   * Transform data using configured mappings
   */
  transform(
    data: any,
    entityType: string,
    provider: string,
    direction: 'to_provider' | 'from_provider'
  ): any {
    const config = this.getConfiguration(entityType, provider, direction);

    if (!config) {
      throw new Error(
        `No mapping configuration found for ${entityType} ${provider} ${direction}`
      );
    }

    if (Array.isArray(data)) {
      return data.map((record) => this.transformRecord(record, config));
    }

    return this.transformRecord(data, config);
  }

  /**
   * Transform a single record
   */
  private transformRecord(record: any, config: MappingConfiguration): any {
    const result: any = {};

    for (const mapping of config.mappings) {
      const sourceValue = this.getNestedValue(record, mapping.sourceField);

      // Check required fields
      if (mapping.required && (sourceValue === undefined || sourceValue === null)) {
        if (mapping.defaultValue !== undefined) {
          result[mapping.targetField] = mapping.defaultValue;
        } else if (mapping.transform) {
          // Try to generate value from transform
          const transformedValue = mapping.transform(sourceValue, record);
          if (transformedValue !== undefined && transformedValue !== null) {
            result[mapping.targetField] = transformedValue;
          } else {
            throw new Error(
              `Required field ${mapping.sourceField} is missing and no default value provided`
            );
          }
        } else {
          throw new Error(
            `Required field ${mapping.sourceField} is missing and no default value provided`
          );
        }
        continue;
      }

      // Skip if source value doesn't exist and field is not required
      if (sourceValue === undefined || sourceValue === null) {
        if (mapping.defaultValue !== undefined) {
          result[mapping.targetField] = mapping.defaultValue;
        }
        continue;
      }

      // Apply transformation if defined
      let value = sourceValue;
      if (mapping.transform) {
        value = mapping.transform(sourceValue, record);
      }

      // Set the value using nested path if needed
      this.setNestedValue(result, mapping.targetField, value);
    }

    return result;
  }

  /**
   * Get nested object value using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => {
      return current?.[prop];
    }, obj);
  }

  /**
   * Set nested object value using dot notation
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    const last = parts.pop()!;

    const target = parts.reduce((current, prop) => {
      if (!current[prop]) {
        current[prop] = {};
      }
      return current[prop];
    }, obj);

    target[last] = value;
  }

  /**
   * Generate configuration key
   */
  private getConfigKey(
    entityType: string,
    provider: string,
    direction: 'to_provider' | 'from_provider'
  ): string {
    return `${entityType}:${provider}:${direction}`;
  }

  /**
   * Validate data against mapping configuration
   */
  validate(
    data: any,
    entityType: string,
    provider: string,
    direction: 'to_provider' | 'from_provider'
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = this.getConfiguration(entityType, provider, direction);

    if (!config) {
      return {
        valid: false,
        errors: [`No mapping configuration found for ${entityType} ${provider} ${direction}`],
      };
    }

    const records = Array.isArray(data) ? data : [data];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      for (const mapping of config.mappings) {
        if (mapping.required) {
          const value = this.getNestedValue(record, mapping.sourceField);

          if (value === undefined || value === null) {
            if (mapping.defaultValue === undefined && !mapping.transform) {
              errors.push(
                `Record ${i}: Required field ${mapping.sourceField} is missing`
              );
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const fieldMappingService = new FieldMappingService();
