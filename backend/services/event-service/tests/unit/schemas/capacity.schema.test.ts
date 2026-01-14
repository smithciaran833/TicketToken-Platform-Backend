/**
 * Unit tests for src/schemas/capacity.schema.ts
 * Tests capacity-related JSON schema definitions
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import {
  capacityIdParamSchema,
  eventIdParamSchema,
  createCapacityBodySchema,
  updateCapacityBodySchema,
  checkAvailabilityBodySchema,
  reserveCapacityBodySchema,
  capacityResponseSchema,
  capacityListResponseSchema,
  availabilityResponseSchema,
  reservationResponseSchema,
  capacityRouteResponses,
  capacityListRouteResponses,
  availabilityRouteResponses,
  reservationRouteResponses,
} from '../../../src/schemas/capacity.schema';

describe('schemas/capacity.schema', () => {
  let ajv: Ajv;

  beforeAll(() => {
    ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
  });

  describe('Parameter Schemas', () => {
    describe('capacityIdParamSchema', () => {
      it('should have correct structure', () => {
        expect(capacityIdParamSchema.type).toBe('object');
        expect(capacityIdParamSchema.required).toContain('id');
        expect(capacityIdParamSchema.additionalProperties).toBe(false);
      });

      it('should validate valid UUID id', () => {
        const validate = ajv.compile(capacityIdParamSchema);
        
        expect(validate({ id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(true);
      });

      it('should reject missing id', () => {
        const validate = ajv.compile(capacityIdParamSchema);
        
        expect(validate({})).toBe(false);
      });

      it('should reject invalid UUID', () => {
        const validate = ajv.compile(capacityIdParamSchema);
        
        expect(validate({ id: 'not-a-uuid' })).toBe(false);
      });

      it('should reject additional properties', () => {
        const validate = ajv.compile(capacityIdParamSchema);
        
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

      it('should reject missing eventId', () => {
        const validate = ajv.compile(eventIdParamSchema);
        
        expect(validate({})).toBe(false);
      });
    });
  });

  describe('Create Capacity Body Schema', () => {
    describe('createCapacityBodySchema', () => {
      it('should have correct structure', () => {
        expect(createCapacityBodySchema.type).toBe('object');
        expect(createCapacityBodySchema.required).toContain('section_name');
        expect(createCapacityBodySchema.required).toContain('total_capacity');
        expect(createCapacityBodySchema.additionalProperties).toBe(false);
      });

      it('should validate valid capacity creation', () => {
        const validate = ajv.compile(createCapacityBodySchema);
        
        const validCapacity = {
          section_name: 'Orchestra',
          total_capacity: 500
        };
        
        expect(validate(validCapacity)).toBe(true);
      });

      it('should validate with all optional fields', () => {
        const validate = ajv.compile(createCapacityBodySchema);
        
        const fullCapacity = {
          section_name: 'VIP Section',
          section_code: 'VIP-A',
          tier: 'premium',
          total_capacity: 100,
          available_capacity: 100,
          reserved_capacity: 0,
          buffer_capacity: 5,
          schedule_id: '550e8400-e29b-41d4-a716-446655440000',
          row_config: {
            rows: 10,
            seats_per_row: 10,
            row_labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
          },
          seat_map: {
            type: 'grid',
            data: {}
          },
          is_active: true,
          is_visible: true,
          minimum_purchase: 1,
          maximum_purchase: 10
        };
        
        expect(validate(fullCapacity)).toBe(true);
      });

      describe('section_name validation', () => {
        it('should reject empty section_name', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          expect(validate({ section_name: '', total_capacity: 100 })).toBe(false);
        });

        it('should reject section_name over 100 characters', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          const longName = 'X'.repeat(101);
          expect(validate({ section_name: longName, total_capacity: 100 })).toBe(false);
        });
      });

      describe('total_capacity validation', () => {
        it('should reject capacity less than 1', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          expect(validate({ section_name: 'Test', total_capacity: 0 })).toBe(false);
        });

        it('should reject capacity greater than 1,000,000', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          expect(validate({ section_name: 'Test', total_capacity: 1000001 })).toBe(false);
        });

        it('should accept maximum valid capacity', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          expect(validate({ section_name: 'Test', total_capacity: 1000000 })).toBe(true);
        });
      });

      describe('row_config validation', () => {
        it('should validate valid row_config', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          const data = {
            section_name: 'Test',
            total_capacity: 100,
            row_config: {
              rows: 10,
              seats_per_row: 10,
              row_labels: ['A', 'B', 'C']
            }
          };
          
          expect(validate(data)).toBe(true);
        });

        it('should reject rows less than 1', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          const data = {
            section_name: 'Test',
            total_capacity: 100,
            row_config: {
              rows: 0,
              seats_per_row: 10
            }
          };
          
          expect(validate(data)).toBe(false);
        });

        it('should reject rows greater than 1000', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          const data = {
            section_name: 'Test',
            total_capacity: 100,
            row_config: {
              rows: 1001,
              seats_per_row: 10
            }
          };
          
          expect(validate(data)).toBe(false);
        });

        it('should reject row_labels array exceeding 1000 items', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          const data = {
            section_name: 'Test',
            total_capacity: 100,
            row_config: {
              rows: 10,
              seats_per_row: 10,
              row_labels: Array(1001).fill('A')
            }
          };
          
          expect(validate(data)).toBe(false);
        });
      });

      describe('seat_map validation', () => {
        it('should accept valid seat_map types', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          const types = ['grid', 'custom', 'ga'];
          types.forEach(type => {
            const data = {
              section_name: 'Test',
              total_capacity: 100,
              seat_map: { type, data: {} }
            };
            expect(validate(data)).toBe(true);
          });
        });

        it('should reject invalid seat_map type', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          const data = {
            section_name: 'Test',
            total_capacity: 100,
            seat_map: { type: 'invalid', data: {} }
          };
          
          expect(validate(data)).toBe(false);
        });
      });

      describe('purchase limits validation', () => {
        it('should accept valid minimum/maximum purchase', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          const data = {
            section_name: 'Test',
            total_capacity: 100,
            minimum_purchase: 2,
            maximum_purchase: 8
          };
          
          expect(validate(data)).toBe(true);
        });

        it('should reject minimum_purchase less than 1', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          const data = {
            section_name: 'Test',
            total_capacity: 100,
            minimum_purchase: 0
          };
          
          expect(validate(data)).toBe(false);
        });

        it('should reject maximum_purchase greater than 100', () => {
          const validate = ajv.compile(createCapacityBodySchema);
          
          const data = {
            section_name: 'Test',
            total_capacity: 100,
            maximum_purchase: 101
          };
          
          expect(validate(data)).toBe(false);
        });
      });
    });
  });

  describe('Update Capacity Body Schema', () => {
    describe('updateCapacityBodySchema', () => {
      it('should have correct structure', () => {
        expect(updateCapacityBodySchema.type).toBe('object');
        expect(updateCapacityBodySchema.additionalProperties).toBe(false);
        // Update schema should not have required fields
        expect(updateCapacityBodySchema.required).toBeUndefined();
      });

      it('should accept empty object (no updates)', () => {
        const validate = ajv.compile(updateCapacityBodySchema);
        
        expect(validate({})).toBe(true);
      });

      it('should accept partial updates', () => {
        const validate = ajv.compile(updateCapacityBodySchema);
        
        expect(validate({ section_name: 'New Name' })).toBe(true);
        expect(validate({ total_capacity: 200 })).toBe(true);
        expect(validate({ is_active: false })).toBe(true);
      });

      it('should validate section_name when provided', () => {
        const validate = ajv.compile(updateCapacityBodySchema);
        
        expect(validate({ section_name: '' })).toBe(false);
        expect(validate({ section_name: 'Valid Name' })).toBe(true);
      });
    });
  });

  describe('Check Availability Body Schema', () => {
    describe('checkAvailabilityBodySchema', () => {
      it('should have correct structure', () => {
        expect(checkAvailabilityBodySchema.type).toBe('object');
        expect(checkAvailabilityBodySchema.required).toContain('quantity');
        expect(checkAvailabilityBodySchema.additionalProperties).toBe(false);
      });

      it('should validate valid availability check', () => {
        const validate = ajv.compile(checkAvailabilityBodySchema);
        
        expect(validate({ quantity: 2 })).toBe(true);
      });

      it('should validate with seat_ids', () => {
        const validate = ajv.compile(checkAvailabilityBodySchema);
        
        const data = {
          quantity: 3,
          seat_ids: ['A1', 'A2', 'A3']
        };
        
        expect(validate(data)).toBe(true);
      });

      it('should reject quantity less than 1', () => {
        const validate = ajv.compile(checkAvailabilityBodySchema);
        
        expect(validate({ quantity: 0 })).toBe(false);
      });

      it('should reject quantity greater than 100', () => {
        const validate = ajv.compile(checkAvailabilityBodySchema);
        
        expect(validate({ quantity: 101 })).toBe(false);
      });

      it('should reject seat_ids array exceeding 100 items', () => {
        const validate = ajv.compile(checkAvailabilityBodySchema);
        
        const data = {
          quantity: 10,
          seat_ids: Array(101).fill('A1')
        };
        
        expect(validate(data)).toBe(false);
      });
    });
  });

  describe('Reserve Capacity Body Schema', () => {
    describe('reserveCapacityBodySchema', () => {
      it('should have correct structure', () => {
        expect(reserveCapacityBodySchema.type).toBe('object');
        expect(reserveCapacityBodySchema.required).toContain('quantity');
        expect(reserveCapacityBodySchema.additionalProperties).toBe(false);
      });

      it('should validate valid reservation', () => {
        const validate = ajv.compile(reserveCapacityBodySchema);
        
        expect(validate({ quantity: 4 })).toBe(true);
      });

      it('should validate with all optional fields', () => {
        const validate = ajv.compile(reserveCapacityBodySchema);
        
        const data = {
          quantity: 2,
          seat_ids: ['B1', 'B2'],
          reservation_duration_minutes: 30,
          pricing_id: '550e8400-e29b-41d4-a716-446655440000'
        };
        
        expect(validate(data)).toBe(true);
      });

      it('should reject reservation_duration_minutes less than 1', () => {
        const validate = ajv.compile(reserveCapacityBodySchema);
        
        const data = {
          quantity: 1,
          reservation_duration_minutes: 0
        };
        
        expect(validate(data)).toBe(false);
      });

      it('should reject reservation_duration_minutes greater than 60', () => {
        const validate = ajv.compile(reserveCapacityBodySchema);
        
        const data = {
          quantity: 1,
          reservation_duration_minutes: 61
        };
        
        expect(validate(data)).toBe(false);
      });

      it('should validate pricing_id as UUID', () => {
        const validate = ajv.compile(reserveCapacityBodySchema);
        
        expect(validate({ 
          quantity: 1, 
          pricing_id: '550e8400-e29b-41d4-a716-446655440000' 
        })).toBe(true);
        
        expect(validate({ 
          quantity: 1, 
          pricing_id: 'not-a-uuid' 
        })).toBe(false);
      });
    });
  });

  describe('Response Schemas', () => {
    describe('capacityResponseSchema', () => {
      it('should have correct structure', () => {
        expect(capacityResponseSchema.type).toBe('object');
        expect(capacityResponseSchema.additionalProperties).toBe(false);
      });

      it('should have all required fields', () => {
        const { properties } = capacityResponseSchema;
        expect(properties.id).toBeDefined();
        expect(properties.tenant_id).toBeDefined();
        expect(properties.event_id).toBeDefined();
        expect(properties.section_name).toBeDefined();
        expect(properties.total_capacity).toBeDefined();
        expect(properties.available_capacity).toBeDefined();
        expect(properties.reserved_capacity).toBeDefined();
        expect(properties.sold_capacity).toBeDefined();
        expect(properties.buffer_capacity).toBeDefined();
      });

      it('should have row_config with additionalProperties: false', () => {
        const { row_config } = capacityResponseSchema.properties;
        expect(row_config.type).toBe('object');
        expect(row_config.additionalProperties).toBe(false);
      });

      it('should have seat_map with enum type', () => {
        const { seat_map } = capacityResponseSchema.properties;
        expect(seat_map.type).toBe('object');
        expect(seat_map.properties.type.enum).toEqual(['grid', 'custom', 'ga']);
      });

      it('should have timestamp and version fields', () => {
        const { properties } = capacityResponseSchema;
        expect(properties.created_at).toBeDefined();
        expect(properties.updated_at).toBeDefined();
        expect(properties.deleted_at).toBeDefined();
        expect(properties.version.type).toBe('integer');
      });
    });

    describe('capacityListResponseSchema', () => {
      it('should have correct structure', () => {
        expect(capacityListResponseSchema.type).toBe('object');
        expect(capacityListResponseSchema.additionalProperties).toBe(false);
      });

      it('should have capacities array and pagination', () => {
        const { properties } = capacityListResponseSchema;
        expect(properties.capacities.type).toBe('array');
        expect(properties.capacities.items).toEqual(capacityResponseSchema);
        expect(properties.pagination).toBeDefined();
      });
    });

    describe('availabilityResponseSchema', () => {
      it('should have correct structure', () => {
        expect(availabilityResponseSchema.type).toBe('object');
        expect(availabilityResponseSchema.additionalProperties).toBe(false);
      });

      it('should have all availability check fields', () => {
        const { properties } = availabilityResponseSchema;
        expect(properties.capacity_id).toBeDefined();
        expect(properties.is_available.type).toBe('boolean');
        expect(properties.requested_quantity.type).toBe('integer');
        expect(properties.available_quantity.type).toBe('integer');
        expect(properties.seats_available.type).toBe('array');
        expect(properties.seats_unavailable.type).toBe('array');
      });

      it('should validate valid availability response', () => {
        const validate = ajv.compile(availabilityResponseSchema);
        
        const validResponse = {
          capacity_id: '550e8400-e29b-41d4-a716-446655440000',
          is_available: true,
          requested_quantity: 3,
          available_quantity: 50,
          seats_available: ['A1', 'A2', 'A3'],
          seats_unavailable: []
        };
        
        expect(validate(validResponse)).toBe(true);
      });
    });

    describe('reservationResponseSchema', () => {
      it('should have correct structure', () => {
        expect(reservationResponseSchema.type).toBe('object');
        expect(reservationResponseSchema.additionalProperties).toBe(false);
      });

      it('should have all reservation fields', () => {
        const { properties } = reservationResponseSchema;
        expect(properties.reservation_id).toBeDefined();
        expect(properties.capacity_id).toBeDefined();
        expect(properties.pricing_id).toBeDefined();
        expect(properties.quantity.type).toBe('integer');
        expect(properties.seat_ids.type).toBe('array');
        expect(properties.expires_at.format).toBe('date-time');
        expect(properties.status.enum).toEqual(['active', 'expired', 'converted', 'cancelled']);
      });

      it('should validate valid reservation response', () => {
        const validate = ajv.compile(reservationResponseSchema);
        
        const validResponse = {
          reservation_id: '550e8400-e29b-41d4-a716-446655440000',
          capacity_id: '550e8400-e29b-41d4-a716-446655440001',
          quantity: 2,
          seat_ids: ['C1', 'C2'],
          expires_at: '2024-06-15T19:15:00Z',
          status: 'active'
        };
        
        expect(validate(validResponse)).toBe(true);
      });

      it('should reject invalid status', () => {
        const validate = ajv.compile(reservationResponseSchema);
        
        const invalidResponse = {
          reservation_id: '550e8400-e29b-41d4-a716-446655440000',
          capacity_id: '550e8400-e29b-41d4-a716-446655440001',
          quantity: 2,
          seat_ids: [],
          expires_at: '2024-06-15T19:15:00Z',
          status: 'invalid_status'
        };
        
        expect(validate(invalidResponse)).toBe(false);
      });
    });
  });

  describe('Route Response Schemas', () => {
    describe('capacityRouteResponses', () => {
      it('should have all HTTP status codes', () => {
        expect(capacityRouteResponses[200]).toBeDefined();
        expect(capacityRouteResponses[201]).toBeDefined();
        expect(capacityRouteResponses[400]).toBeDefined();
        expect(capacityRouteResponses[401]).toBeDefined();
        expect(capacityRouteResponses[404]).toBeDefined();
      });

      it('should have correct descriptions', () => {
        expect(capacityRouteResponses[200].description).toBe('Successful operation');
        expect(capacityRouteResponses[201].description).toBe('Capacity created successfully');
        expect(capacityRouteResponses[400].description).toBe('Bad Request - validation error');
        expect(capacityRouteResponses[401].description).toBe('Unauthorized');
        expect(capacityRouteResponses[404].description).toBe('Capacity not found');
      });
    });

    describe('capacityListRouteResponses', () => {
      it('should have list-specific HTTP status codes', () => {
        expect(capacityListRouteResponses[200]).toBeDefined();
        expect(capacityListRouteResponses[400]).toBeDefined();
        expect(capacityListRouteResponses[401]).toBeDefined();
      });

      it('should have correct 200 description', () => {
        expect(capacityListRouteResponses[200].description).toBe('List of capacity configurations');
      });
    });

    describe('availabilityRouteResponses', () => {
      it('should have availability-specific HTTP status codes', () => {
        expect(availabilityRouteResponses[200]).toBeDefined();
        expect(availabilityRouteResponses[400]).toBeDefined();
        expect(availabilityRouteResponses[404]).toBeDefined();
      });

      it('should have correct 200 description', () => {
        expect(availabilityRouteResponses[200].description).toBe('Availability check result');
      });
    });

    describe('reservationRouteResponses', () => {
      it('should have reservation-specific HTTP status codes', () => {
        expect(reservationRouteResponses[201]).toBeDefined();
        expect(reservationRouteResponses[400]).toBeDefined();
        expect(reservationRouteResponses[404]).toBeDefined();
        expect(reservationRouteResponses[409]).toBeDefined();
      });

      it('should have correct descriptions', () => {
        expect(reservationRouteResponses[201].description).toBe('Reservation created successfully');
        expect(reservationRouteResponses[400].description).toBe('Bad Request - validation error or insufficient capacity');
        expect(reservationRouteResponses[404].description).toBe('Capacity not found');
        expect(reservationRouteResponses[409].description).toBe('Conflict - seats already reserved');
      });
    });
  });

  describe('Security: additionalProperties (SEC1)', () => {
    it('all body schemas should have additionalProperties: false', () => {
      expect(createCapacityBodySchema.additionalProperties).toBe(false);
      expect(updateCapacityBodySchema.additionalProperties).toBe(false);
      expect(checkAvailabilityBodySchema.additionalProperties).toBe(false);
      expect(reserveCapacityBodySchema.additionalProperties).toBe(false);
    });

    it('all response schemas should have additionalProperties: false', () => {
      expect(capacityResponseSchema.additionalProperties).toBe(false);
      expect(capacityListResponseSchema.additionalProperties).toBe(false);
      expect(availabilityResponseSchema.additionalProperties).toBe(false);
      expect(reservationResponseSchema.additionalProperties).toBe(false);
    });

    it('nested objects should have additionalProperties: false', () => {
      expect(createCapacityBodySchema.properties.row_config.additionalProperties).toBe(false);
      expect(createCapacityBodySchema.properties.seat_map.additionalProperties).toBe(false);
      expect(capacityResponseSchema.properties.row_config.additionalProperties).toBe(false);
      expect(capacityResponseSchema.properties.seat_map.additionalProperties).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle boundary values for capacity', () => {
      const validate = ajv.compile(createCapacityBodySchema);
      
      // Minimum valid
      expect(validate({ section_name: 'Test', total_capacity: 1 })).toBe(true);
      
      // Maximum valid
      expect(validate({ section_name: 'Test', total_capacity: 1000000 })).toBe(true);
      
      // Below minimum
      expect(validate({ section_name: 'Test', total_capacity: 0 })).toBe(false);
      
      // Above maximum
      expect(validate({ section_name: 'Test', total_capacity: 1000001 })).toBe(false);
    });

    it('should handle boundary values for row_labels length', () => {
      const validate = ajv.compile(createCapacityBodySchema);
      
      // Maximum valid (1000)
      const validData = {
        section_name: 'Test',
        total_capacity: 100,
        row_config: {
          rows: 10,
          seats_per_row: 10,
          row_labels: Array(1000).fill('A')
        }
      };
      expect(validate(validData)).toBe(true);
      
      // Above maximum (1001)
      const invalidData = {
        ...validData,
        row_config: {
          ...validData.row_config,
          row_labels: Array(1001).fill('A')
        }
      };
      expect(validate(invalidData)).toBe(false);
    });
  });
});
