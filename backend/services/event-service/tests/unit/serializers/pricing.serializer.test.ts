import {
  SAFE_PRICING_FIELDS,
  FORBIDDEN_PRICING_FIELDS,
  SAFE_PRICING_SELECT,
  serializePricing,
  serializePricings,
  findForbiddenPricingFields,
  findMissingSafePricingFields,
  SafePricing,
} from '../../../src/serializers/pricing.serializer';

describe('Pricing Serializer', () => {
  // Mock raw pricing from database with ALL fields including sensitive ones
  const mockRawPricing = {
    // Safe fields
    id: 'pricing-123',
    tenant_id: 'tenant-123',
    event_id: 'event-456',
    schedule_id: 'schedule-789',
    capacity_id: 'capacity-abc',
    name: 'VIP Tier',
    description: 'VIP access with backstage pass',
    tier: 'vip',
    base_price: '150.00',
    service_fee: '15.00',
    facility_fee: '5.00',
    tax_rate: '0.08',
    is_dynamic: true,
    min_price: '100.00',
    max_price: '200.00',
    current_price: '155.00',
    early_bird_price: '125.00',
    early_bird_ends_at: '2026-05-01T00:00:00Z',
    last_minute_price: '175.00',
    last_minute_starts_at: '2026-06-14T00:00:00Z',
    group_size_min: 5,
    group_discount_percentage: '10.00',
    currency: 'USD',
    sales_start_at: '2026-04-01T00:00:00Z',
    sales_end_at: '2026-06-15T18:00:00Z',
    max_per_order: 8,
    max_per_customer: 10,
    is_active: true,
    is_visible: true,
    display_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',

    // FORBIDDEN fields that should be stripped
    price_adjustment_rules: {
      demand_factor: 1.5,
      time_factor: 0.8,
      algorithm: 'secret-pricing-algo',
    },
    created_by: 'user-123',
    updated_by: 'user-456',
    version: 3,
    deleted_at: null,
  };

  describe('SAFE_PRICING_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(SAFE_PRICING_FIELDS).toBeDefined();
      expect(SAFE_PRICING_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include essential pricing fields', () => {
      expect(SAFE_PRICING_FIELDS).toContain('id');
      expect(SAFE_PRICING_FIELDS).toContain('event_id');
      expect(SAFE_PRICING_FIELDS).toContain('name');
      expect(SAFE_PRICING_FIELDS).toContain('base_price');
      expect(SAFE_PRICING_FIELDS).toContain('current_price');
    });

    it('should NOT include forbidden fields', () => {
      for (const forbidden of FORBIDDEN_PRICING_FIELDS) {
        expect(SAFE_PRICING_FIELDS).not.toContain(forbidden);
      }
    });
  });

  describe('FORBIDDEN_PRICING_FIELDS', () => {
    it('should include pricing algorithm field', () => {
      expect(FORBIDDEN_PRICING_FIELDS).toContain('price_adjustment_rules');
    });

    it('should include internal tracking fields', () => {
      expect(FORBIDDEN_PRICING_FIELDS).toContain('created_by');
      expect(FORBIDDEN_PRICING_FIELDS).toContain('updated_by');
      expect(FORBIDDEN_PRICING_FIELDS).toContain('version');
      expect(FORBIDDEN_PRICING_FIELDS).toContain('deleted_at');
    });
  });

  describe('SAFE_PRICING_SELECT', () => {
    it('should be a comma-separated string', () => {
      expect(typeof SAFE_PRICING_SELECT).toBe('string');
      expect(SAFE_PRICING_SELECT).toContain('id');
      expect(SAFE_PRICING_SELECT).toContain(',');
    });

    it('should NOT contain forbidden fields', () => {
      expect(SAFE_PRICING_SELECT).not.toContain('price_adjustment_rules');
      expect(SAFE_PRICING_SELECT).not.toContain('created_by');
    });
  });

  describe('serializePricing', () => {
    it('should return only safe fields', () => {
      const result = serializePricing(mockRawPricing);

      expect(result.id).toBe(mockRawPricing.id);
      expect(result.tenantId).toBe(mockRawPricing.tenant_id);
      expect(result.eventId).toBe(mockRawPricing.event_id);
      expect(result.name).toBe(mockRawPricing.name);
      expect(result.basePrice).toBe(150.0);
    });

    it('should strip forbidden fields', () => {
      const result = serializePricing(mockRawPricing);

      expect((result as any).priceAdjustmentRules).toBeUndefined();
      expect((result as any).price_adjustment_rules).toBeUndefined();
      expect((result as any).createdBy).toBeUndefined();
      expect((result as any).created_by).toBeUndefined();
      expect((result as any).version).toBeUndefined();
    });

    it('should parse string prices to numbers', () => {
      const result = serializePricing(mockRawPricing);

      expect(typeof result.basePrice).toBe('number');
      expect(typeof result.serviceFee).toBe('number');
      expect(typeof result.currentPrice).toBe('number');
      expect(result.basePrice).toBe(150.0);
      expect(result.serviceFee).toBe(15.0);
    });

    it('should convert snake_case to camelCase', () => {
      const result = serializePricing(mockRawPricing);

      expect(result.tenantId).toBeDefined();
      expect(result.eventId).toBeDefined();
      expect(result.basePrice).toBeDefined();
      expect(result.salesStartAt).toBeDefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializePricing(null as any)).toThrow('Cannot serialize null or undefined pricing');
    });
  });

  describe('serializePricings', () => {
    it('should serialize array of pricing objects', () => {
      const pricings = [mockRawPricing, { ...mockRawPricing, id: 'pricing-2', name: 'GA Tier' }];
      const result = serializePricings(pricings);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(mockRawPricing.id);
      expect(result[1].id).toBe('pricing-2');
    });

    it('should return empty array for null input', () => {
      expect(serializePricings(null as any)).toEqual([]);
    });

    it('should strip forbidden fields from all pricings', () => {
      const pricings = [mockRawPricing, { ...mockRawPricing, id: 'pricing-2' }];
      const result = serializePricings(pricings);

      for (const pricing of result) {
        expect((pricing as any).price_adjustment_rules).toBeUndefined();
        expect((pricing as any).priceAdjustmentRules).toBeUndefined();
      }
    });
  });

  describe('findForbiddenPricingFields', () => {
    it('should find forbidden fields in raw object', () => {
      const found = findForbiddenPricingFields(mockRawPricing);

      expect(found).toContain('price_adjustment_rules');
      expect(found).toContain('created_by');
      expect(found).toContain('version');
    });

    it('should return empty array for safe object', () => {
      const safePricing = serializePricing(mockRawPricing);
      const found = findForbiddenPricingFields(safePricing);
      expect(found).toHaveLength(0);
    });
  });

  describe('findMissingSafePricingFields', () => {
    it('should return empty for complete serialized pricing', () => {
      const safePricing = serializePricing(mockRawPricing);
      const missing = findMissingSafePricingFields(safePricing);
      expect(missing).toHaveLength(0);
    });

    it('should identify missing required fields', () => {
      const incomplete = { id: '123' };
      const missing = findMissingSafePricingFields(incomplete);

      expect(missing).toContain('tenantId');
      expect(missing).toContain('eventId');
      expect(missing).toContain('name');
      expect(missing).toContain('basePrice');
    });
  });

  describe('Security validation', () => {
    it('should never leak pricing algorithm', () => {
      const result = serializePricing(mockRawPricing);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('secret-pricing-algo');
      expect(jsonString).not.toContain('demand_factor');
      expect(jsonString).not.toContain('time_factor');
      expect(jsonString).not.toContain('priceAdjustmentRules');
    });
  });
});
