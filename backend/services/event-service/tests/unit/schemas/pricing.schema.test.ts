/**
 * Unit tests for src/schemas/pricing.schema.ts
 * Tests pricing-related JSON schema definitions
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import {
  pricingIdParamSchema,
  eventIdParamSchema,
  createPricingBodySchema,
  updatePricingBodySchema,
  calculatePriceBodySchema,
  pricingResponseSchema,
  pricingListResponseSchema,
  priceCalculationResponseSchema,
  pricingRouteResponses,
  pricingListRouteResponses,
  priceCalculationRouteResponses,
} from '../../../src/schemas/pricing.schema';

describe('schemas/pricing.schema', () => {
  let ajv: Ajv;

  beforeAll(() => {
    ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
  });

  describe('Parameter Schemas', () => {
    describe('pricingIdParamSchema', () => {
      it('should have correct structure', () => {
        expect(pricingIdParamSchema.type).toBe('object');
        expect(pricingIdParamSchema.required).toContain('id');
        expect(pricingIdParamSchema.additionalProperties).toBe(false);
      });

      it('should validate valid UUID id', () => {
        const validate = ajv.compile(pricingIdParamSchema);
        
        expect(validate({ id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(true);
      });

      it('should reject missing id', () => {
        const validate = ajv.compile(pricingIdParamSchema);
        
        expect(validate({})).toBe(false);
      });

      it('should reject invalid UUID', () => {
        const validate = ajv.compile(pricingIdParamSchema);
        
        expect(validate({ id: 'not-a-uuid' })).toBe(false);
      });

      it('should reject additional properties', () => {
        const validate = ajv.compile(pricingIdParamSchema);
        
        expect(validate({ id: '550e8400-e29b-41d4-a716-446655440000', extra: 'field' })).toBe(false);
      });
    });

    describe('eventIdParamSchema', () => {
      it('should have correct structure', () => {
        expect(eventIdParamSchema.type).toBe('object');
        expect(eventIdParamSchema.required).toContain('eventId');
        expect(eventIdParamSchema.additionalProperties).toBe(false);
      });

      it('should validate valid eventId', () => {
        const validate = ajv.compile(eventIdParamSchema);
        
        expect(validate({ eventId: '550e8400-e29b-41d4-a716-446655440000' })).toBe(true);
      });
    });
  });

  describe('Create Pricing Body Schema', () => {
    describe('createPricingBodySchema', () => {
      it('should have correct structure', () => {
        expect(createPricingBodySchema.type).toBe('object');
        expect(createPricingBodySchema.required).toContain('name');
        expect(createPricingBodySchema.required).toContain('base_price');
        expect(createPricingBodySchema.additionalProperties).toBe(false);
      });

      it('should validate valid pricing creation', () => {
        const validate = ajv.compile(createPricingBodySchema);
        
        const validPricing = {
          name: 'General Admission',
          base_price: 50.00
        };
        
        expect(validate(validPricing)).toBe(true);
      });

      it('should validate with all optional fields', () => {
        const validate = ajv.compile(createPricingBodySchema);
        
        const fullPricing = {
          name: 'VIP Pass',
          description: 'Includes backstage access',
          tier: 'premium',
          base_price: 199.99,
          service_fee: 15.00,
          facility_fee: 5.00,
          tax_rate: 0.08,
          is_dynamic: true,
          min_price: 150.00,
          max_price: 300.00,
          price_adjustment_rules: {
            demand_factor: 1.5,
            time_factor: 0.8
          },
          early_bird_price: 149.99,
          early_bird_ends_at: '2024-05-01T00:00:00Z',
          last_minute_price: 249.99,
          last_minute_starts_at: '2024-06-14T00:00:00Z',
          group_size_min: 10,
          group_discount_percentage: 15.0,
          currency: 'USD',
          sales_start_at: '2024-01-01T00:00:00Z',
          sales_end_at: '2024-06-15T18:00:00Z',
          max_per_order: 10,
          max_per_customer: 50,
          schedule_id: '550e8400-e29b-41d4-a716-446655440000',
          capacity_id: '550e8400-e29b-41d4-a716-446655440001',
          is_active: true,
          is_visible: true,
          display_order: 1
        };
        
        expect(validate(fullPricing)).toBe(true);
      });

      describe('name validation', () => {
        it('should reject empty name', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: '', base_price: 50 })).toBe(false);
        });

        it('should reject name over 100 characters', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          const longName = 'X'.repeat(101);
          expect(validate({ name: longName, base_price: 50 })).toBe(false);
        });
      });

      describe('base_price validation', () => {
        it('should accept zero price (free tickets)', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Free', base_price: 0 })).toBe(true);
        });

        it('should reject negative price', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: -1 })).toBe(false);
        });

        it('should reject price greater than 9,999,999.99', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 10000000 })).toBe(false);
        });

        it('should accept maximum valid price', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 9999999.99 })).toBe(true);
        });
      });

      describe('tax_rate validation', () => {
        it('should accept valid tax rates', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, tax_rate: 0 })).toBe(true);
          expect(validate({ name: 'Test', base_price: 50, tax_rate: 0.08 })).toBe(true);
          expect(validate({ name: 'Test', base_price: 50, tax_rate: 1 })).toBe(true);
        });

        it('should reject tax_rate greater than 1', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, tax_rate: 1.5 })).toBe(false);
        });
      });

      describe('price_adjustment_rules validation', () => {
        it('should validate valid adjustment rules', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          const data = {
            name: 'Test',
            base_price: 50,
            price_adjustment_rules: {
              demand_factor: 2.0,
              time_factor: 0.5
            }
          };
          
          expect(validate(data)).toBe(true);
        });

        it('should reject demand_factor greater than 10', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          const data = {
            name: 'Test',
            base_price: 50,
            price_adjustment_rules: {
              demand_factor: 11
            }
          };
          
          expect(validate(data)).toBe(false);
        });
      });

      describe('group_discount_percentage validation', () => {
        it('should accept valid percentages', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, group_discount_percentage: 0 })).toBe(true);
          expect(validate({ name: 'Test', base_price: 50, group_discount_percentage: 50 })).toBe(true);
          expect(validate({ name: 'Test', base_price: 50, group_discount_percentage: 100 })).toBe(true);
        });

        it('should reject percentage greater than 100', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, group_discount_percentage: 101 })).toBe(false);
        });
      });

      describe('currency validation', () => {
        it('should accept valid currency codes', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, currency: 'USD' })).toBe(true);
          expect(validate({ name: 'Test', base_price: 50, currency: 'EUR' })).toBe(true);
          expect(validate({ name: 'Test', base_price: 50, currency: 'GBP' })).toBe(true);
        });

        it('should reject invalid currency codes', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, currency: 'usd' })).toBe(false);
          expect(validate({ name: 'Test', base_price: 50, currency: 'USDD' })).toBe(false);
          expect(validate({ name: 'Test', base_price: 50, currency: 'US' })).toBe(false);
        });
      });

      describe('date-time validation', () => {
        it('should accept valid ISO 8601 date-times', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          const data = {
            name: 'Test',
            base_price: 50,
            early_bird_ends_at: '2024-05-01T00:00:00Z',
            sales_start_at: '2024-01-01T00:00:00Z',
            sales_end_at: '2024-06-15T23:59:59Z'
          };
          
          expect(validate(data)).toBe(true);
        });

        it('should reject invalid date-time formats', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, sales_start_at: 'invalid-date' })).toBe(false);
        });
      });

      describe('purchase limits validation', () => {
        it('should accept valid max_per_order', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, max_per_order: 1 })).toBe(true);
          expect(validate({ name: 'Test', base_price: 50, max_per_order: 100 })).toBe(true);
        });

        it('should reject max_per_order greater than 100', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, max_per_order: 101 })).toBe(false);
        });

        it('should reject max_per_customer greater than 1000', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, max_per_customer: 1001 })).toBe(false);
        });
      });

      describe('display_order validation', () => {
        it('should accept valid display_order', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, display_order: 0 })).toBe(true);
          expect(validate({ name: 'Test', base_price: 50, display_order: 500 })).toBe(true);
          expect(validate({ name: 'Test', base_price: 50, display_order: 1000 })).toBe(true);
        });

        it('should reject display_order greater than 1000', () => {
          const validate = ajv.compile(createPricingBodySchema);
          
          expect(validate({ name: 'Test', base_price: 50, display_order: 1001 })).toBe(false);
        });
      });
    });
  });

  describe('Update Pricing Body Schema', () => {
    describe('updatePricingBodySchema', () => {
      it('should have correct structure', () => {
        expect(updatePricingBodySchema.type).toBe('object');
        expect(updatePricingBodySchema.additionalProperties).toBe(false);
        // Update schema should not have required fields
        expect(updatePricingBodySchema.required).toBeUndefined();
      });

      it('should accept empty object (no updates)', () => {
        const validate = ajv.compile(updatePricingBodySchema);
        
        expect(validate({})).toBe(true);
      });

      it('should accept partial updates', () => {
        const validate = ajv.compile(updatePricingBodySchema);
        
        expect(validate({ name: 'New Name' })).toBe(true);
        expect(validate({ base_price: 75.00 })).toBe(true);
        expect(validate({ is_active: false })).toBe(true);
      });

      it('should validate fields when provided', () => {
        const validate = ajv.compile(updatePricingBodySchema);
        
        expect(validate({ name: '' })).toBe(false);
        expect(validate({ base_price: -1 })).toBe(false);
        expect(validate({ tax_rate: 1.5 })).toBe(false);
      });
    });
  });

  describe('Calculate Price Body Schema', () => {
    describe('calculatePriceBodySchema', () => {
      it('should have correct structure', () => {
        expect(calculatePriceBodySchema.type).toBe('object');
        expect(calculatePriceBodySchema.required).toContain('quantity');
        expect(calculatePriceBodySchema.additionalProperties).toBe(false);
      });

      it('should validate valid calculation request', () => {
        const validate = ajv.compile(calculatePriceBodySchema);
        
        expect(validate({ quantity: 2 })).toBe(true);
      });

      it('should validate with optional fields', () => {
        const validate = ajv.compile(calculatePriceBodySchema);
        
        const data = {
          quantity: 5,
          apply_group_discount: true,
          promo_code: 'SAVE10'
        };
        
        expect(validate(data)).toBe(true);
      });

      it('should reject quantity less than 1', () => {
        const validate = ajv.compile(calculatePriceBodySchema);
        
        expect(validate({ quantity: 0 })).toBe(false);
      });

      it('should reject quantity greater than 100', () => {
        const validate = ajv.compile(calculatePriceBodySchema);
        
        expect(validate({ quantity: 101 })).toBe(false);
      });

      it('should reject promo_code over 50 characters', () => {
        const validate = ajv.compile(calculatePriceBodySchema);
        
        const data = {
          quantity: 1,
          promo_code: 'X'.repeat(51)
        };
        
        expect(validate(data)).toBe(false);
      });
    });
  });

  describe('Response Schemas', () => {
    describe('pricingResponseSchema', () => {
      it('should have correct structure', () => {
        expect(pricingResponseSchema.type).toBe('object');
        expect(pricingResponseSchema.additionalProperties).toBe(false);
      });

      it('should have all required fields', () => {
        const { properties } = pricingResponseSchema;
        expect(properties.id).toBeDefined();
        expect(properties.tenant_id).toBeDefined();
        expect(properties.event_id).toBeDefined();
        expect(properties.name).toBeDefined();
        expect(properties.base_price).toBeDefined();
        expect(properties.currency).toBeDefined();
        expect(properties.is_active).toBeDefined();
        expect(properties.is_visible).toBeDefined();
        expect(properties.display_order).toBeDefined();
      });

      it('should have price fields with proper constraints', () => {
        const { properties } = pricingResponseSchema;
        expect(properties.base_price.minimum).toBe(0);
        expect(properties.base_price.maximum).toBe(9999999.99);
      });

      it('should have date-time fields with proper format', () => {
        const { properties } = pricingResponseSchema;
        expect(properties.early_bird_ends_at.format).toBe('date-time');
        expect(properties.last_minute_starts_at.format).toBe('date-time');
        expect(properties.sales_start_at.format).toBe('date-time');
        expect(properties.sales_end_at.format).toBe('date-time');
      });

      it('should have price_adjustment_rules with additionalProperties: false', () => {
        const { price_adjustment_rules } = pricingResponseSchema.properties;
        expect(price_adjustment_rules.type).toBe('object');
        expect(price_adjustment_rules.additionalProperties).toBe(false);
      });

      it('should have timestamp and version fields', () => {
        const { properties } = pricingResponseSchema;
        expect(properties.created_at).toBeDefined();
        expect(properties.updated_at).toBeDefined();
        expect(properties.deleted_at).toBeDefined();
        expect(properties.version.type).toBe('integer');
      });
    });

    describe('pricingListResponseSchema', () => {
      it('should have correct structure', () => {
        expect(pricingListResponseSchema.type).toBe('object');
        expect(pricingListResponseSchema.additionalProperties).toBe(false);
      });

      it('should have pricing array and pagination', () => {
        const { properties } = pricingListResponseSchema;
        expect(properties.pricing.type).toBe('array');
        expect(properties.pricing.items).toEqual(pricingResponseSchema);
        expect(properties.pagination).toBeDefined();
      });
    });

    describe('priceCalculationResponseSchema', () => {
      it('should have correct structure', () => {
        expect(priceCalculationResponseSchema.type).toBe('object');
        expect(priceCalculationResponseSchema.additionalProperties).toBe(false);
      });

      it('should have all calculation result fields', () => {
        const { properties } = priceCalculationResponseSchema;
        expect(properties.pricing_id).toBeDefined();
        expect(properties.quantity.type).toBe('integer');
        expect(properties.unit_price).toBeDefined();
        expect(properties.subtotal).toBeDefined();
        expect(properties.service_fee_total).toBeDefined();
        expect(properties.facility_fee_total).toBeDefined();
        expect(properties.tax_amount).toBeDefined();
        expect(properties.discount_amount).toBeDefined();
        expect(properties.total).toBeDefined();
        expect(properties.currency).toBeDefined();
      });

      it('should have price_type enum', () => {
        const { price_type } = priceCalculationResponseSchema.properties;
        expect(price_type.enum).toEqual(['regular', 'early_bird', 'last_minute', 'group']);
      });

      it('should have discount_applied boolean', () => {
        const { discount_applied } = priceCalculationResponseSchema.properties;
        expect(discount_applied.type).toBe('boolean');
      });

      it('should validate valid calculation response', () => {
        const validate = ajv.compile(priceCalculationResponseSchema);
        
        const validResponse = {
          pricing_id: '550e8400-e29b-41d4-a716-446655440000',
          quantity: 2,
          unit_price: 50.00,
          subtotal: 100.00,
          service_fee_total: 10.00,
          facility_fee_total: 4.00,
          tax_amount: 9.12,
          discount_amount: 0,
          total: 123.12,
          currency: 'USD',
          discount_applied: false,
          price_type: 'regular'
        };
        
        expect(validate(validResponse)).toBe(true);
      });

      it('should reject invalid price_type', () => {
        const validate = ajv.compile(priceCalculationResponseSchema);
        
        const invalidResponse = {
          pricing_id: '550e8400-e29b-41d4-a716-446655440000',
          quantity: 1,
          unit_price: 50.00,
          subtotal: 50.00,
          service_fee_total: 5.00,
          facility_fee_total: 2.00,
          tax_amount: 4.56,
          discount_amount: 0,
          total: 61.56,
          currency: 'USD',
          discount_applied: false,
          price_type: 'invalid_type'
        };
        
        expect(validate(invalidResponse)).toBe(false);
      });
    });
  });

  describe('Route Response Schemas', () => {
    describe('pricingRouteResponses', () => {
      it('should have all HTTP status codes', () => {
        expect(pricingRouteResponses[200]).toBeDefined();
        expect(pricingRouteResponses[201]).toBeDefined();
        expect(pricingRouteResponses[400]).toBeDefined();
        expect(pricingRouteResponses[401]).toBeDefined();
        expect(pricingRouteResponses[404]).toBeDefined();
      });

      it('should have correct descriptions', () => {
        expect(pricingRouteResponses[200].description).toBe('Successful operation');
        expect(pricingRouteResponses[201].description).toBe('Pricing created successfully');
        expect(pricingRouteResponses[400].description).toBe('Bad Request - validation error');
        expect(pricingRouteResponses[401].description).toBe('Unauthorized');
        expect(pricingRouteResponses[404].description).toBe('Pricing not found');
      });
    });

    describe('pricingListRouteResponses', () => {
      it('should have list-specific HTTP status codes', () => {
        expect(pricingListRouteResponses[200]).toBeDefined();
        expect(pricingListRouteResponses[400]).toBeDefined();
        expect(pricingListRouteResponses[401]).toBeDefined();
      });

      it('should have correct 200 description', () => {
        expect(pricingListRouteResponses[200].description).toBe('List of pricing options');
      });
    });

    describe('priceCalculationRouteResponses', () => {
      it('should have calculation-specific HTTP status codes', () => {
        expect(priceCalculationRouteResponses[200]).toBeDefined();
        expect(priceCalculationRouteResponses[400]).toBeDefined();
        expect(priceCalculationRouteResponses[404]).toBeDefined();
      });

      it('should have correct 200 description', () => {
        expect(priceCalculationRouteResponses[200].description).toBe('Price calculation result');
      });
    });
  });

  describe('Security: additionalProperties (SEC1)', () => {
    it('all body schemas should have additionalProperties: false', () => {
      expect(createPricingBodySchema.additionalProperties).toBe(false);
      expect(updatePricingBodySchema.additionalProperties).toBe(false);
      expect(calculatePriceBodySchema.additionalProperties).toBe(false);
    });

    it('all response schemas should have additionalProperties: false', () => {
      expect(pricingResponseSchema.additionalProperties).toBe(false);
      expect(pricingListResponseSchema.additionalProperties).toBe(false);
      expect(priceCalculationResponseSchema.additionalProperties).toBe(false);
    });

    it('nested price_adjustment_rules should have additionalProperties: false', () => {
      expect(createPricingBodySchema.properties.price_adjustment_rules.additionalProperties).toBe(false);
      expect(pricingResponseSchema.properties.price_adjustment_rules.additionalProperties).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle boundary values for prices', () => {
      const validate = ajv.compile(createPricingBodySchema);
      
      // Minimum valid (0 - free)
      expect(validate({ name: 'Test', base_price: 0 })).toBe(true);
      
      // Maximum valid
      expect(validate({ name: 'Test', base_price: 9999999.99 })).toBe(true);
      
      // Below minimum
      expect(validate({ name: 'Test', base_price: -0.01 })).toBe(false);
      
      // Above maximum
      expect(validate({ name: 'Test', base_price: 10000000 })).toBe(false);
    });

    it('should handle boundary values for tax_rate', () => {
      const validate = ajv.compile(createPricingBodySchema);
      
      // Minimum (0%)
      expect(validate({ name: 'Test', base_price: 50, tax_rate: 0 })).toBe(true);
      
      // Maximum (100%)
      expect(validate({ name: 'Test', base_price: 50, tax_rate: 1 })).toBe(true);
      
      // Typical rate
      expect(validate({ name: 'Test', base_price: 50, tax_rate: 0.0875 })).toBe(true);
    });

    it('should handle boundary values for group_size_min', () => {
      const validate = ajv.compile(createPricingBodySchema);
      
      // Minimum (1)
      expect(validate({ name: 'Test', base_price: 50, group_size_min: 1 })).toBe(true);
      
      // Maximum (1000)
      expect(validate({ name: 'Test', base_price: 50, group_size_min: 1000 })).toBe(true);
      
      // Below minimum
      expect(validate({ name: 'Test', base_price: 50, group_size_min: 0 })).toBe(false);
      
      // Above maximum
      expect(validate({ name: 'Test', base_price: 50, group_size_min: 1001 })).toBe(false);
    });

    it('should handle decimal precision for prices', () => {
      const validate = ajv.compile(createPricingBodySchema);
      
      // Two decimal places
      expect(validate({ name: 'Test', base_price: 49.99 })).toBe(true);
      
      // More decimal places (should still validate as numbers)
      expect(validate({ name: 'Test', base_price: 49.999 })).toBe(true);
    });

    it('should validate dynamic pricing scenario', () => {
      const validate = ajv.compile(createPricingBodySchema);
      
      const dynamicPricing = {
        name: 'Dynamic GA',
        base_price: 75.00,
        is_dynamic: true,
        min_price: 50.00,
        max_price: 150.00,
        price_adjustment_rules: {
          demand_factor: 1.2,
          time_factor: 0.9
        }
      };
      
      expect(validate(dynamicPricing)).toBe(true);
    });

    it('should validate early bird pricing scenario', () => {
      const validate = ajv.compile(createPricingBodySchema);
      
      const earlyBirdPricing = {
        name: 'Early Bird Special',
        base_price: 100.00,
        early_bird_price: 75.00,
        early_bird_ends_at: '2024-05-01T00:00:00Z',
        sales_start_at: '2024-01-01T00:00:00Z',
        sales_end_at: '2024-06-15T18:00:00Z'
      };
      
      expect(validate(earlyBirdPricing)).toBe(true);
    });
  });
});
