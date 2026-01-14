import {
  uuidParamSchema,
  createJurisdictionSchema,
  updateJurisdictionSchema,
  createTaxRateSchema,
  createCategorySchema,
  createExemptionSchema,
  calculateTaxSchema,
  configureProviderSchema,
  generateReportSchema,
  fileReportSchema,
  listQuerySchema,
} from '../../../src/validators/tax.schemas';

describe('Tax Schemas', () => {
  const validUuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  describe('uuidParamSchema', () => {
    it('should validate valid UUID parameters', () => {
      const { error } = uuidParamSchema.validate({
        jurisdictionId: validUuid,
        exemptionId: validUuid,
      });
      expect(error).toBeUndefined();
    });

    it('should accept empty object', () => {
      const { error } = uuidParamSchema.validate({});
      expect(error).toBeUndefined();
    });

    it('should reject invalid UUID format', () => {
      const { error } = uuidParamSchema.validate({ jurisdictionId: 'not-a-uuid' });
      expect(error).toBeDefined();
      expect(error?.message).toContain('fails to match the required pattern');
    });

    it('should reject unknown fields', () => {
      const { error } = uuidParamSchema.validate({ unknown: 'field' });
      expect(error).toBeDefined();
      expect(error?.message).toContain('not allowed');
    });
  });

  describe('createJurisdictionSchema', () => {
    const validJurisdiction = {
      name: 'California State Tax',
      code: 'CA',
      country: 'US',
      state: 'California',
      city: 'Los Angeles',
      isActive: true,
      priority: 10,
    };

    it('should validate valid jurisdiction', () => {
      const { error } = createJurisdictionSchema.validate(validJurisdiction);
      expect(error).toBeUndefined();
    });

    it('should require name', () => {
      const { error } = createJurisdictionSchema.validate({
        ...validJurisdiction,
        name: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"name" is required');
    });

    it('should enforce minimum name length', () => {
      const { error } = createJurisdictionSchema.validate({
        ...validJurisdiction,
        name: '',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('is not allowed to be empty');
    });

    it('should enforce maximum name length', () => {
      const { error } = createJurisdictionSchema.validate({
        ...validJurisdiction,
        name: 'a'.repeat(101),
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be less than or equal to 100');
    });

    it('should require code', () => {
      const { error } = createJurisdictionSchema.validate({
        ...validJurisdiction,
        code: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"code" is required');
    });

    it('should require country', () => {
      const { error } = createJurisdictionSchema.validate({
        ...validJurisdiction,
        country: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"country" is required');
    });

    it('should validate country as 2-letter code', () => {
      const { error } = createJurisdictionSchema.validate({
        ...validJurisdiction,
        country: 'USA',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('fails to match the required pattern');
    });

    it('should accept valid country codes', () => {
      const codes = ['US', 'CA', 'GB', 'FR', 'DE'];
      codes.forEach((country) => {
        const { error } = createJurisdictionSchema.validate({
          ...validJurisdiction,
          country,
        });
        expect(error).toBeUndefined();
      });
    });

    it('should accept null state', () => {
      const { error } = createJurisdictionSchema.validate({
        ...validJurisdiction,
        state: null,
      });
      expect(error).toBeUndefined();
    });

    it('should default isActive to true', () => {
      const { error, value } = createJurisdictionSchema.validate({
        name: 'Test',
        code: 'TEST',
        country: 'US',
      });
      expect(error).toBeUndefined();
      expect(value.isActive).toBe(true);
    });

    it('should default priority to 0', () => {
      const { error, value } = createJurisdictionSchema.validate({
        name: 'Test',
        code: 'TEST',
        country: 'US',
      });
      expect(error).toBeUndefined();
      expect(value.priority).toBe(0);
    });

    it('should enforce priority range', () => {
      const { error } = createJurisdictionSchema.validate({
        ...validJurisdiction,
        priority: 1001,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be less than or equal to 1000');
    });

    it('should reject unknown fields', () => {
      const { error } = createJurisdictionSchema.validate({
        ...validJurisdiction,
        unknown: 'field',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('not allowed');
    });
  });

  describe('updateJurisdictionSchema', () => {
    it('should accept partial updates', () => {
      const { error } = updateJurisdictionSchema.validate({ name: 'Updated Name' });
      expect(error).toBeUndefined();
    });

    it('should accept empty object', () => {
      const { error } = updateJurisdictionSchema.validate({});
      expect(error).toBeUndefined();
    });

    it('should reject unknown fields', () => {
      const { error } = updateJurisdictionSchema.validate({ unknown: 'field' });
      expect(error).toBeDefined();
    });
  });

  describe('createTaxRateSchema', () => {
    const validRate = {
      jurisdictionId: validUuid,
      name: 'State Sales Tax',
      rate: 8.25,
      isCompound: false,
      isInclusive: false,
    };

    it('should validate valid tax rate', () => {
      const { error } = createTaxRateSchema.validate(validRate);
      expect(error).toBeUndefined();
    });

    it('should require jurisdictionId', () => {
      const { error } = createTaxRateSchema.validate({
        ...validRate,
        jurisdictionId: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"jurisdictionId" is required');
    });

    it('should require name', () => {
      const { error } = createTaxRateSchema.validate({
        ...validRate,
        name: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"name" is required');
    });

    it('should require rate', () => {
      const { error } = createTaxRateSchema.validate({
        ...validRate,
        rate: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"rate" is required');
    });

    it('should enforce minimum rate of 0', () => {
      const { error } = createTaxRateSchema.validate({
        ...validRate,
        rate: -1,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be greater than or equal to 0');
    });

    it('should enforce maximum rate of 100', () => {
      const { error } = createTaxRateSchema.validate({
        ...validRate,
        rate: 101,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be less than or equal to 100');
    });

    it('should accept rate with 4 decimal places', () => {
      const { error } = createTaxRateSchema.validate({
        ...validRate,
        rate: 8.2575,
      });
      expect(error).toBeUndefined();
    });

    it('should default isCompound to false', () => {
      const { error, value } = createTaxRateSchema.validate({
        jurisdictionId: validUuid,
        name: 'Test',
        rate: 5,
      });
      expect(error).toBeUndefined();
      expect(value.isCompound).toBe(false);
    });

    it('should default isInclusive to false', () => {
      const { error, value } = createTaxRateSchema.validate({
        jurisdictionId: validUuid,
        name: 'Test',
        rate: 5,
      });
      expect(error).toBeUndefined();
      expect(value.isInclusive).toBe(false);
    });

    it('should accept ISO dates for effectiveFrom', () => {
      const { error } = createTaxRateSchema.validate({
        ...validRate,
        effectiveFrom: '2024-01-01T00:00:00.000Z',
      });
      expect(error).toBeUndefined();
    });
  });

  describe('createCategorySchema', () => {
    const validCategory = {
      name: 'Digital Goods',
      code: 'DIGITAL',
      description: 'Digital products and services',
      isDefault: false,
    };

    it('should validate valid category', () => {
      const { error } = createCategorySchema.validate(validCategory);
      expect(error).toBeUndefined();
    });

    it('should require name', () => {
      const { error } = createCategorySchema.validate({
        ...validCategory,
        name: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"name" is required');
    });

    it('should require code', () => {
      const { error } = createCategorySchema.validate({
        ...validCategory,
        code: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"code" is required');
    });

    it('should default isDefault to false', () => {
      const { error, value } = createCategorySchema.validate({
        name: 'Test',
        code: 'TEST',
      });
      expect(error).toBeUndefined();
      expect(value.isDefault).toBe(false);
    });
  });

  describe('createExemptionSchema', () => {
    const validExemption = {
      customerId: validUuid,
      jurisdictionId: validUuid,
      exemptionType: 'NONPROFIT',
      certificateNumber: 'CERT-12345',
    };

    it('should validate valid exemption', () => {
      const { error } = createExemptionSchema.validate(validExemption);
      expect(error).toBeUndefined();
    });

    it('should require customerId', () => {
      const { error } = createExemptionSchema.validate({
        ...validExemption,
        customerId: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"customerId" is required');
    });

    it('should require exemptionType', () => {
      const { error } = createExemptionSchema.validate({
        ...validExemption,
        exemptionType: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"exemptionType" is required');
    });

    it('should accept valid exemption types', () => {
      const types = ['NONPROFIT', 'GOVERNMENT', 'RESELLER', 'EDUCATIONAL', 'DIPLOMATIC', 'OTHER'];
      types.forEach((exemptionType) => {
        const { error } = createExemptionSchema.validate({
          ...validExemption,
          exemptionType,
        });
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid exemption type', () => {
      const { error } = createExemptionSchema.validate({
        ...validExemption,
        exemptionType: 'INVALID',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be one of');
    });

    it('should accept null jurisdictionId', () => {
      const { error } = createExemptionSchema.validate({
        ...validExemption,
        jurisdictionId: null,
      });
      expect(error).toBeUndefined();
    });

    it('should validate documentUrl as URI', () => {
      const { error } = createExemptionSchema.validate({
        ...validExemption,
        documentUrl: 'https://example.com/certificate.pdf',
      });
      expect(error).toBeUndefined();
    });
  });

  describe('calculateTaxSchema', () => {
    const validCalculation = {
      orderId: validUuid,
      customerId: validUuid,
      items: [
        {
          ticketTypeId: validUuid,
          quantity: 2,
          unitPriceCents: 5000,
        },
      ],
      billingAddress: {
        country: 'US',
        state: 'California',
        city: 'Los Angeles',
        postalCode: '90001',
      },
      currency: 'USD',
    };

    it('should validate valid tax calculation', () => {
      const { error } = calculateTaxSchema.validate(validCalculation);
      expect(error).toBeUndefined();
    });

    it('should require items', () => {
      const { error } = calculateTaxSchema.validate({
        ...validCalculation,
        items: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"items" is required');
    });

    it('should require at least one item', () => {
      const { error } = calculateTaxSchema.validate({
        ...validCalculation,
        items: [],
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must contain at least 1 items');
    });

    it('should validate item structure', () => {
      const { error } = calculateTaxSchema.validate({
        ...validCalculation,
        items: [
          {
            ticketTypeId: validUuid,
            quantity: 2,
            unitPriceCents: 5000,
            categoryId: validUuid,
          },
        ],
      });
      expect(error).toBeUndefined();
    });

    it('should require billingAddress', () => {
      const { error } = calculateTaxSchema.validate({
        ...validCalculation,
        billingAddress: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"billingAddress" is required');
    });

    it('should require country in billingAddress', () => {
      const { error } = calculateTaxSchema.validate({
        ...validCalculation,
        billingAddress: {
          state: 'California',
        },
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"country" is required');
    });

    it('should validate country as 2-letter code', () => {
      const { error } = calculateTaxSchema.validate({
        ...validCalculation,
        billingAddress: {
          ...validCalculation.billingAddress,
          country: 'USA',
        },
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('fails to match the required pattern');
    });

    it('should accept optional shippingAddress', () => {
      const { error } = calculateTaxSchema.validate({
        ...validCalculation,
        shippingAddress: {
          country: 'US',
          state: 'Nevada',
        },
      });
      expect(error).toBeUndefined();
    });

    it('should default currency to USD', () => {
      const calcWithoutCurrency = { ...validCalculation };
      delete (calcWithoutCurrency as any).currency;

      const { error, value } = calculateTaxSchema.validate(calcWithoutCurrency);
      expect(error).toBeUndefined();
      expect(value.currency).toBe('USD');
    });

    it('should validate currency as 3-letter code', () => {
      const { error } = calculateTaxSchema.validate({
        ...validCalculation,
        currency: 'US',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('fails to match the required pattern');
    });

    it('should enforce quantity limits', () => {
      const { error } = calculateTaxSchema.validate({
        ...validCalculation,
        items: [
          {
            ticketTypeId: validUuid,
            quantity: 101,
            unitPriceCents: 5000,
          },
        ],
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be less than or equal to 100');
    });

    it('should reject unknown fields in items', () => {
      const { error } = calculateTaxSchema.validate({
        ...validCalculation,
        items: [
          {
            ticketTypeId: validUuid,
            quantity: 2,
            unitPriceCents: 5000,
            unknown: 'field',
          },
        ],
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('not allowed');
    });
  });

  describe('configureProviderSchema', () => {
    const validConfig = {
      provider: 'avalara',
      apiKey: 'test-api-key',
      environment: 'sandbox',
      isEnabled: true,
    };

    it('should validate valid provider config', () => {
      const { error } = configureProviderSchema.validate(validConfig);
      expect(error).toBeUndefined();
    });

    it('should require provider', () => {
      const { error } = configureProviderSchema.validate({
        ...validConfig,
        provider: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"provider" is required');
    });

    it('should accept valid providers', () => {
      const providers = ['manual', 'avalara', 'taxjar', 'vertex'];
      providers.forEach((provider) => {
        const { error } = configureProviderSchema.validate({
          ...validConfig,
          provider,
          apiKey: provider === 'manual' ? undefined : 'key',
        });
        expect(error).toBeUndefined();
      });
    });

    it('should require apiKey for non-manual providers', () => {
      const { error } = configureProviderSchema.validate({
        provider: 'avalara',
        environment: 'sandbox',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"apiKey" is required');
    });

    it('should allow null apiKey for manual provider', () => {
      const { error } = configureProviderSchema.validate({
        provider: 'manual',
        apiKey: null,
        environment: 'sandbox',
      });
      expect(error).toBeUndefined();
    });

    it('should default environment to sandbox', () => {
      const { error, value } = configureProviderSchema.validate({
        provider: 'avalara',
        apiKey: 'key',
      });
      expect(error).toBeUndefined();
      expect(value.environment).toBe('sandbox');
    });

    it('should default isEnabled to true', () => {
      const { error, value } = configureProviderSchema.validate({
        provider: 'avalara',
        apiKey: 'key',
      });
      expect(error).toBeUndefined();
      expect(value.isEnabled).toBe(true);
    });
  });

  describe('generateReportSchema', () => {
    const validReport = {
      reportType: 'SALES_TAX_SUMMARY',
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2024-12-31T23:59:59.999Z',
      format: 'json',
    };

    it('should validate valid report request', () => {
      const { error } = generateReportSchema.validate(validReport);
      expect(error).toBeUndefined();
    });

    it('should require reportType', () => {
      const { error } = generateReportSchema.validate({
        ...validReport,
        reportType: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"reportType" is required');
    });

    it('should accept valid report types', () => {
      const types = [
        'SALES_TAX_SUMMARY',
        'SALES_TAX_DETAIL',
        'EXEMPTION_REPORT',
        'JURISDICTION_BREAKDOWN',
        'MONTHLY_FILING',
      ];
      types.forEach((reportType) => {
        const { error } = generateReportSchema.validate({
          ...validReport,
          reportType,
        });
        expect(error).toBeUndefined();
      });
    });

    it('should require startDate', () => {
      const { error } = generateReportSchema.validate({
        ...validReport,
        startDate: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"startDate" is required');
    });

    it('should require endDate', () => {
      const { error } = generateReportSchema.validate({
        ...validReport,
        endDate: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"endDate" is required');
    });

    it('should default format to json', () => {
      const reportWithoutFormat = { ...validReport };
      delete (reportWithoutFormat as any).format;

      const { error, value } = generateReportSchema.validate(reportWithoutFormat);
      expect(error).toBeUndefined();
      expect(value.format).toBe('json');
    });

    it('should accept valid formats', () => {
      const formats = ['json', 'csv', 'pdf'];
      formats.forEach((format) => {
        const { error } = generateReportSchema.validate({
          ...validReport,
          format,
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('fileReportSchema', () => {
    it('should validate valid filing', () => {
      const { error } = fileReportSchema.validate({
        filingDate: '2024-01-15T00:00:00.000Z',
        confirmationNumber: 'CONF-12345',
        notes: 'Filed with state authority',
      });
      expect(error).toBeUndefined();
    });

    it('should accept empty object', () => {
      const { error } = fileReportSchema.validate({});
      expect(error).toBeUndefined();
    });

    it('should accept null confirmationNumber', () => {
      const { error } = fileReportSchema.validate({
        confirmationNumber: null,
      });
      expect(error).toBeUndefined();
    });
  });

  describe('listQuerySchema', () => {
    it('should validate valid query', () => {
      const { error } = listQuerySchema.validate({
        limit: 50,
        offset: 10,
        isActive: true,
      });
      expect(error).toBeUndefined();
    });

    it('should default limit to 20', () => {
      const { error, value } = listQuerySchema.validate({});
      expect(error).toBeUndefined();
      expect(value.limit).toBe(20);
    });

    it('should default offset to 0', () => {
      const { error, value } = listQuerySchema.validate({});
      expect(error).toBeUndefined();
      expect(value.offset).toBe(0);
    });

    it('should enforce maximum limit', () => {
      const { error } = listQuerySchema.validate({ limit: 101 });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be less than or equal to 100');
    });

    it('should reject unknown fields', () => {
      const { error } = listQuerySchema.validate({ unknown: 'field' });
      expect(error).toBeDefined();
      expect(error?.message).toContain('not allowed');
    });
  });
});
