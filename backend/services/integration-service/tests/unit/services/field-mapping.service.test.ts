import { FieldMappingService, fieldMappingService, MappingConfiguration } from '../../../src/services/field-mapping.service';

describe('FieldMappingService', () => {
  let service: FieldMappingService;

  beforeEach(() => {
    service = new FieldMappingService();
  });

  describe('constructor', () => {
    it('should initialize with default mappings', () => {
      // Check mailchimp customer mappings exist
      const mailchimpTo = service.getConfiguration('customer', 'mailchimp', 'to_provider');
      const mailchimpFrom = service.getConfiguration('customer', 'mailchimp', 'from_provider');
      
      expect(mailchimpTo).toBeDefined();
      expect(mailchimpFrom).toBeDefined();
    });

    it('should have mappings for all four providers', () => {
      const providers = ['mailchimp', 'quickbooks', 'square', 'stripe'];
      
      for (const provider of providers) {
        const toProvider = service.getConfiguration('customer', provider, 'to_provider');
        const fromProvider = service.getConfiguration('customer', provider, 'from_provider');
        
        expect(toProvider).toBeDefined();
        expect(fromProvider).toBeDefined();
      }
    });
  });

  describe('registerConfiguration', () => {
    it('should register a new configuration', () => {
      const config: MappingConfiguration = {
        entityType: 'order',
        provider: 'custom',
        direction: 'to_provider',
        mappings: [
          { sourceField: 'id', targetField: 'orderId', required: true },
        ],
      };

      service.registerConfiguration(config);

      const retrieved = service.getConfiguration('order', 'custom', 'to_provider');
      expect(retrieved).toEqual(config);
    });

    it('should overwrite existing configuration', () => {
      const config1: MappingConfiguration = {
        entityType: 'test',
        provider: 'test',
        direction: 'to_provider',
        mappings: [{ sourceField: 'a', targetField: 'b' }],
      };

      const config2: MappingConfiguration = {
        entityType: 'test',
        provider: 'test',
        direction: 'to_provider',
        mappings: [{ sourceField: 'x', targetField: 'y' }],
      };

      service.registerConfiguration(config1);
      service.registerConfiguration(config2);

      const retrieved = service.getConfiguration('test', 'test', 'to_provider');
      expect(retrieved!.mappings[0].sourceField).toBe('x');
    });
  });

  describe('getConfiguration', () => {
    it('should return undefined for non-existent configuration', () => {
      const config = service.getConfiguration('nonexistent', 'provider', 'to_provider');
      
      expect(config).toBeUndefined();
    });

    it('should distinguish between to_provider and from_provider', () => {
      const toProvider = service.getConfiguration('customer', 'mailchimp', 'to_provider');
      const fromProvider = service.getConfiguration('customer', 'mailchimp', 'from_provider');

      expect(toProvider).not.toEqual(fromProvider);
    });
  });

  describe('transform', () => {
    describe('basic transformations', () => {
      it('should transform a single record', () => {
        const data = {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
        };

        const result = service.transform(data, 'customer', 'mailchimp', 'to_provider');

        expect(result.email).toBe('test@example.com');
        expect(result.firstName).toBe('John');
        expect(result.lastName).toBe('Doe');
      });

      it('should transform an array of records', () => {
        const data = [
          { email: 'test1@example.com', firstName: 'John' },
          { email: 'test2@example.com', firstName: 'Jane' },
        ];

        const result = service.transform(data, 'customer', 'mailchimp', 'to_provider');

        expect(result).toHaveLength(2);
        expect(result[0].email).toBe('test1@example.com');
        expect(result[1].email).toBe('test2@example.com');
      });

      it('should throw error for non-existent configuration', () => {
        expect(() => {
          service.transform({}, 'nonexistent', 'provider', 'to_provider');
        }).toThrow('No mapping configuration found for nonexistent provider to_provider');
      });
    });

    describe('nested field access', () => {
      it('should handle nested source fields (from_provider)', () => {
        const mailchimpData = {
          email_address: 'test@example.com',
          merge_fields: {
            FNAME: 'John',
            LNAME: 'Doe',
            PHONE: '555-1234',
          },
        };

        const result = service.transform(mailchimpData, 'customer', 'mailchimp', 'from_provider');

        expect(result.email).toBe('test@example.com');
        expect(result.firstName).toBe('John');
        expect(result.lastName).toBe('Doe');
        expect(result.phone).toBe('555-1234');
      });

      it('should handle deeply nested QuickBooks fields', () => {
        const qbData = {
          PrimaryEmailAddr: { Address: 'test@example.com' },
          GivenName: 'John',
          FamilyName: 'Doe',
          PrimaryPhone: { FreeFormNumber: '555-1234' },
        };

        const result = service.transform(qbData, 'customer', 'quickbooks', 'from_provider');

        expect(result.email).toBe('test@example.com');
        expect(result.firstName).toBe('John');
        expect(result.phone).toBe('555-1234');
      });
    });

    describe('transform functions', () => {
      it('should apply transform function to tags (mailchimp)', () => {
        const data = {
          email: 'test@example.com',
          tags: ['vip', 'subscriber'],
        };

        const result = service.transform(data, 'customer', 'mailchimp', 'to_provider');

        expect(result.tags).toEqual(['vip', 'subscriber']);
      });

      it('should not include field when source value is null (no transform applied)', () => {
        // The implementation skips null/undefined values without applying transform
        // Transform only runs when source value exists
        const data = {
          email: 'test@example.com',
          tags: null,
        };

        const result = service.transform(data, 'customer', 'mailchimp', 'to_provider');

        expect(result.tags).toBeUndefined();
      });

      it('should apply transform when source value exists (empty array)', () => {
        const data = {
          email: 'test@example.com',
          tags: [],
        };

        const result = service.transform(data, 'customer', 'mailchimp', 'to_provider');

        expect(result.tags).toEqual([]);
      });

      it('should extract tag names from mailchimp format', () => {
        const mailchimpData = {
          email_address: 'test@example.com',
          tags: [{ name: 'vip' }, { name: 'subscriber' }],
        };

        const result = service.transform(mailchimpData, 'customer', 'mailchimp', 'from_provider');

        expect(result.tags).toEqual(['vip', 'subscriber']);
      });

      it('should generate name from firstName/lastName for stripe when name provided', () => {
        // Transform only applies when source field (name) has a value
        // When name is missing, the field is skipped entirely
        const data = {
          email: 'test@example.com',
          name: '', // Empty string is a value, so transform runs
          firstName: 'John',
          lastName: 'Doe',
        };

        const result = service.transform(data, 'customer', 'stripe', 'to_provider');

        // Empty string triggers transform which generates from firstName/lastName
        expect(result.name).toBe('John Doe');
      });

      it('should not include name when source field is missing', () => {
        // When name field is undefined, transform doesn't run and field is skipped
        const data = {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
        };

        const result = service.transform(data, 'customer', 'stripe', 'to_provider');

        expect(result.name).toBeUndefined();
      });

      it('should use provided name over generated name', () => {
        const data = {
          email: 'test@example.com',
          name: 'Johnny D',
          firstName: 'John',
          lastName: 'Doe',
        };

        const result = service.transform(data, 'customer', 'stripe', 'to_provider');

        expect(result.name).toBe('Johnny D');
      });

      it('should generate displayName for quickbooks (required field with transform)', () => {
        // displayName is required, so transform is attempted even when value is missing
        const data = {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
        };

        const result = service.transform(data, 'customer', 'quickbooks', 'to_provider');

        expect(result.displayName).toBe('John Doe');
      });
    });

    describe('required fields', () => {
      it('should throw error when required field is missing', () => {
        const data = {
          firstName: 'John',
          // missing email which is required
        };

        expect(() => {
          service.transform(data, 'customer', 'mailchimp', 'to_provider');
        }).toThrow('Required field email is missing and no default value provided');
      });

      it('should use default value for missing required field', () => {
        service.registerConfiguration({
          entityType: 'test',
          provider: 'test',
          direction: 'to_provider',
          mappings: [
            { sourceField: 'status', targetField: 'status', required: true, defaultValue: 'active' },
          ],
        });

        const result = service.transform({}, 'test', 'test', 'to_provider');

        expect(result.status).toBe('active');
      });

      it('should use transform to generate required field value', () => {
        const data = {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          // name is missing but transform can generate it
        };

        const result = service.transform(data, 'customer', 'quickbooks', 'to_provider');

        expect(result.displayName).toBe('John Doe');
      });
    });

    describe('default values', () => {
      it('should apply default value when field is missing', () => {
        service.registerConfiguration({
          entityType: 'test',
          provider: 'test',
          direction: 'to_provider',
          mappings: [
            { sourceField: 'tier', targetField: 'tier', defaultValue: 'standard' },
          ],
        });

        const result = service.transform({}, 'test', 'test', 'to_provider');

        expect(result.tier).toBe('standard');
      });

      it('should not apply default value when field exists', () => {
        service.registerConfiguration({
          entityType: 'test',
          provider: 'test',
          direction: 'to_provider',
          mappings: [
            { sourceField: 'tier', targetField: 'tier', defaultValue: 'standard' },
          ],
        });

        const result = service.transform({ tier: 'premium' }, 'test', 'test', 'to_provider');

        expect(result.tier).toBe('premium');
      });
    });

    describe('all providers', () => {
      it('should transform square customer to_provider', () => {
        const data = {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          company: 'Acme Inc',
          phone: '555-1234',
          notes: 'VIP customer',
        };

        const result = service.transform(data, 'customer', 'square', 'to_provider');

        expect(result.emailAddress).toBe('test@example.com');
        expect(result.givenName).toBe('John');
        expect(result.familyName).toBe('Doe');
        expect(result.companyName).toBe('Acme Inc');
        expect(result.phoneNumber).toBe('555-1234');
        expect(result.note).toBe('VIP customer');
      });

      it('should transform square customer from_provider', () => {
        const squareData = {
          email_address: 'test@example.com',
          given_name: 'John',
          family_name: 'Doe',
          company_name: 'Acme Inc',
          phone_number: '555-1234',
          note: 'VIP customer',
        };

        const result = service.transform(squareData, 'customer', 'square', 'from_provider');

        expect(result.email).toBe('test@example.com');
        expect(result.firstName).toBe('John');
        expect(result.lastName).toBe('Doe');
        expect(result.company).toBe('Acme Inc');
        expect(result.phone).toBe('555-1234');
        expect(result.notes).toBe('VIP customer');
      });

      it('should transform stripe customer from_provider', () => {
        const stripeData = {
          email: 'test@example.com',
          name: 'John Doe',
          phone: '555-1234',
          description: 'Premium member',
        };

        const result = service.transform(stripeData, 'customer', 'stripe', 'from_provider');

        expect(result.email).toBe('test@example.com');
        expect(result.name).toBe('John Doe');
        expect(result.phone).toBe('555-1234');
        expect(result.description).toBe('Premium member');
      });
    });
  });

  describe('validate', () => {
    it('should return valid for complete data', () => {
      const data = {
        email: 'test@example.com',
        firstName: 'John',
      };

      const result = service.validate(data, 'customer', 'mailchimp', 'to_provider');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid when required field missing', () => {
      const data = {
        firstName: 'John',
        // missing email
      };

      const result = service.validate(data, 'customer', 'mailchimp', 'to_provider');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Record 0: Required field email is missing');
    });

    it('should validate array of records', () => {
      const data = [
        { email: 'valid@example.com' },
        { firstName: 'Missing Email' },
        { email: 'another@example.com' },
      ];

      const result = service.validate(data, 'customer', 'mailchimp', 'to_provider');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Record 1');
    });

    it('should return error for non-existent configuration', () => {
      const result = service.validate({}, 'nonexistent', 'provider', 'to_provider');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('No mapping configuration found');
    });

    it('should pass validation when required field has default value', () => {
      service.registerConfiguration({
        entityType: 'test',
        provider: 'test',
        direction: 'to_provider',
        mappings: [
          { sourceField: 'status', targetField: 'status', required: true, defaultValue: 'active' },
        ],
      });

      const result = service.validate({}, 'test', 'test', 'to_provider');

      expect(result.valid).toBe(true);
    });

    it('should pass validation when required field has transform', () => {
      service.registerConfiguration({
        entityType: 'test',
        provider: 'test',
        direction: 'to_provider',
        mappings: [
          {
            sourceField: 'name',
            targetField: 'name',
            required: true,
            transform: () => 'generated',
          },
        ],
      });

      const result = service.validate({}, 'test', 'test', 'to_provider');

      expect(result.valid).toBe(true);
    });
  });

  describe('singleton export', () => {
    it('should export a singleton instance', () => {
      expect(fieldMappingService).toBeInstanceOf(FieldMappingService);
    });
  });
});
