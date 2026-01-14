import { fieldMappingService, FieldMappingService } from '../../../src/services/field-mapping.service';

describe('FieldMappingService', () => {
  let service: FieldMappingService;

  beforeEach(() => {
    service = new FieldMappingService();
  });

  describe('Customer mapping - Mailchimp', () => {
    it('should map data to Mailchimp format', () => {
      const input = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        tags: ['vip', 'newsletter'],
      };

      const result = service.transform(input, 'customer', 'mailchimp', 'to_provider');

      expect(result).toEqual({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        tags: ['vip', 'newsletter'],
      });
    });

    it('should map data from Mailchimp format', () => {
      const input = {
        email_address: 'test@example.com',
        merge_fields: {
          FNAME: 'John',
          LNAME: 'Doe',
          PHONE: '+1234567890',
        },
        tags: [{ name: 'vip' }, { name: 'newsletter' }],
      };

      const result = service.transform(input, 'customer', 'mailchimp', 'from_provider');

      expect(result).toEqual({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        tags: ['vip', 'newsletter'],
      });
    });

    it('should handle missing optional fields', () => {
      const input = {
        email: 'test@example.com',
      };

      const result = service.transform(input, 'customer', 'mailchimp', 'to_provider');

      expect(result.email).toBe('test@example.com');
      expect(result.firstName).toBeUndefined();
    });
  });

  describe('Customer mapping - QuickBooks', () => {
    it('should map data to QuickBooks format', () => {
      const input = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Test Corp',
        phone: '+1234567890',
      };

      const result = service.transform(input, 'customer', 'quickbooks', 'to_provider');

      expect(result).toEqual({
        primaryEmailAddr: 'test@example.com',
        givenName: 'John',
        familyName: 'Doe',
        companyName: 'Test Corp',
        primaryPhone: '+1234567890',
        displayName: 'John Doe',
      });
    });

    it('should generate displayName from firstName and lastName', () => {
      const input = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = service.transform(input, 'customer', 'quickbooks', 'to_provider');

      expect(result.displayName).toBe('John Doe');
    });

    it('should use provided name if available', () => {
      const input = {
        email: 'test@example.com',
        name: 'Custom Name',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = service.transform(input, 'customer', 'quickbooks', 'to_provider');

      expect(result.displayName).toBe('Custom Name');
    });

    it('should map data from QuickBooks format', () => {
      const input = {
        PrimaryEmailAddr: { Address: 'test@example.com' },
        GivenName: 'John',
        FamilyName: 'Doe',
        CompanyName: 'Test Corp',
        PrimaryPhone: { FreeFormNumber: '+1234567890' },
        DisplayName: 'John Doe',
      };

      const result = service.transform(input, 'customer', 'quickbooks', 'from_provider');

      expect(result).toEqual({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Test Corp',
        phone: '+1234567890',
        name: 'John Doe',
      });
    });
  });

  describe('Customer mapping - Square', () => {
    it('should map data to Square format', () => {
      const input = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Test Corp',
        phone: '+1234567890',
        notes: 'VIP customer',
      };

      const result = service.transform(input, 'customer', 'square', 'to_provider');

      expect(result).toEqual({
        emailAddress: 'test@example.com',
        givenName: 'John',
        familyName: 'Doe',
        companyName: 'Test Corp',
        phoneNumber: '+1234567890',
        note: 'VIP customer',
      });
    });

    it('should map data from Square format', () => {
      const input = {
        email_address: 'test@example.com',
        given_name: 'John',
        family_name: 'Doe',
        company_name: 'Test Corp',
        phone_number: '+1234567890',
        note: 'VIP customer',
      };

      const result = service.transform(input, 'customer', 'square', 'from_provider');

      expect(result).toEqual({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Test Corp',
        phone: '+1234567890',
        notes: 'VIP customer',
      });
    });
  });

  describe('Customer mapping - Stripe', () => {
    it('should map data to Stripe format', () => {
      const input = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        description: 'Premium customer',
      };

      const result = service.transform(input, 'customer', 'stripe', 'to_provider');

      expect(result).toEqual({
        email: 'test@example.com',
        name: 'John Doe',
        phone: '+1234567890',
        description: 'Premium customer',
      });
    });

    it('should generate name from firstName and lastName', () => {
      const input = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = service.transform(input, 'customer', 'stripe', 'to_provider');

      expect(result.name).toBe('John Doe');
    });

    it('should use provided name if available', () => {
      const input = {
        email: 'test@example.com',
        name: 'Custom Name',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = service.transform(input, 'customer', 'stripe', 'to_provider');

      expect(result.name).toBe('Custom Name');
    });

    it('should map data from Stripe format', () => {
      const input = {
        email: 'test@example.com',
        name: 'John Doe',
        phone: '+1234567890',
        description: 'Premium customer',
      };

      const result = service.transform(input, 'customer', 'stripe', 'from_provider');

      expect(result).toEqual({
        email: 'test@example.com',
        name: 'John Doe',
        phone: '+1234567890',
        description: 'Premium customer',
      });
    });
  });

  describe('Batch transformation', () => {
    it('should transform array of records', () => {
      const input = [
        { email: 'test1@example.com', firstName: 'John', lastName: 'Doe' },
        { email: 'test2@example.com', firstName: 'Jane', lastName: 'Smith' },
      ];

      const result = service.transform(input, 'customer', 'stripe', 'to_provider');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        email: 'test1@example.com',
        name: 'John Doe',
      });
      expect(result[1]).toEqual({
        email: 'test2@example.com',
        name: 'Jane Smith',
      });
    });
  });

  describe('Validation', () => {
    it('should validate data successfully', () => {
      const input = {
        email: 'test@example.com',
        firstName: 'John',
      };

      const result = service.validate(input, 'customer', 'mailchimp', 'to_provider');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const input = {
        firstName: 'John',
        // email is required but missing
      };

      const result = service.validate(input, 'customer', 'mailchimp', 'to_provider');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Record 0: Required field email is missing');
    });

    it('should validate array of records', () => {
      const input = [
        { email: 'test1@example.com' },
        { firstName: 'Jane' }, // missing email
      ];

      const result = service.validate(input, 'customer', 'mailchimp', 'to_provider');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Record 1');
    });
  });

  describe('Custom field mappings', () => {
    it('should allow registering custom configurations', () => {
      const customConfig = {
        entityType: 'order',
        provider: 'custom',
        direction: 'to_provider' as const,
        mappings: [
          { sourceField: 'orderId', targetField: 'id', required: true },
          { sourceField: 'totalAmount', targetField: 'total', required: true },
        ],
      };

      service.registerConfiguration(customConfig);

      const config = service.getConfiguration('order', 'custom', 'to_provider');
      expect(config).toBeDefined();
      expect(config?.mappings).toHaveLength(2);
    });

    it('should transform using custom configuration', () => {
      const customConfig = {
        entityType: 'order',
        provider: 'custom',
        direction: 'to_provider' as const,
        mappings: [
          { sourceField: 'orderId', targetField: 'id', required: true },
          { sourceField: 'totalAmount', targetField: 'total', required: true },
        ],
      };

      service.registerConfiguration(customConfig);

      const input = {
        orderId: '12345',
        totalAmount: 99.99,
      };

      const result = service.transform(input, 'order', 'custom', 'to_provider');

      expect(result).toEqual({
        id: '12345',
        total: 99.99,
      });
    });
  });

  describe('Error handling', () => {
    it('should throw error for unknown configuration', () => {
      const input = { test: 'data' };

      expect(() => {
        service.transform(input, 'unknown', 'unknown', 'to_provider');
      }).toThrow('No mapping configuration found');
    });

    it('should throw error for missing required field without default', () => {
      const input = {
        firstName: 'John', // email is required but missing
      };

      expect(() => {
        service.transform(input, 'customer', 'mailchimp', 'to_provider');
      }).toThrow('Required field email is missing');
    });
  });

  describe('Nested field support', () => {
    it('should handle nested field extraction', () => {
      const input = {
        email_address: 'test@example.com',
        merge_fields: {
          FNAME: 'John',
          LNAME: 'Doe',
        },
      };

      const result = service.transform(input, 'customer', 'mailchimp', 'from_provider');

      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
    });

    it('should handle nested field setting', () => {
      const input = {
        PrimaryEmailAddr: { Address: 'test@example.com' },
      };

      const result = service.transform(input, 'customer', 'quickbooks', 'from_provider');

      expect(result.email).toBe('test@example.com');
    });
  });

  describe('Transformation functions', () => {
    it('should apply transformation functions', () => {
      const input = {
        email_address: 'test@example.com',
        tags: [{ name: 'vip' }, { name: 'newsletter' }],
      };

      const result = service.transform(input, 'customer', 'mailchimp', 'from_provider');

      // Tags should be transformed from objects to strings
      expect(result.tags).toEqual(['vip', 'newsletter']);
    });

    it('should handle empty arrays in transformations', () => {
      const input = {
        email: 'test@example.com',
        tags: null,
      };

      const result = service.transform(input, 'customer', 'mailchimp', 'to_provider');

      // Transformation should convert null to empty array
      expect(result.tags).toEqual([]);
    });
  });
});
