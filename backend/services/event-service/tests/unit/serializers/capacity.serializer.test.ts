import {
  SAFE_CAPACITY_FIELDS,
  FORBIDDEN_CAPACITY_FIELDS,
  SAFE_CAPACITY_SELECT,
  serializeCapacity,
  serializeCapacities,
  findForbiddenCapacityFields,
  findMissingSafeCapacityFields,
  SafeCapacity,
} from '../../../src/serializers/capacity.serializer';

describe('Capacity Serializer', () => {
  // Mock raw capacity from database with ALL fields including sensitive ones
  const mockRawCapacity = {
    // Safe fields
    id: 'capacity-123',
    tenant_id: 'tenant-123',
    event_id: 'event-456',
    schedule_id: 'schedule-789',
    section_name: 'Floor Section A',
    section_code: 'FLOOR-A',
    tier: 'premium',
    total_capacity: 500,
    available_capacity: 350,
    reserved_capacity: 50,
    buffer_capacity: 20,
    sold_count: 100,
    pending_count: 10,
    is_active: true,
    is_visible: true,
    minimum_purchase: 1,
    maximum_purchase: 8,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',

    // FORBIDDEN fields that should be stripped
    locked_price_data: {
      pricing_id: 'pricing-123',
      locked_price: 150.00,
      locked_at: '2026-01-10T00:00:00Z',
      service_fee: 15.00,
    },
    reserved_at: '2026-01-10T00:00:00Z',
    reserved_expires_at: '2026-01-10T00:15:00Z',
    seat_map: {
      rows: ['A', 'B', 'C'],
      seats_per_row: 20,
      layout: 'concert',
    },
    row_config: {
      row_A: { seats: 20, price_tier: 'premium' },
      row_B: { seats: 20, price_tier: 'standard' },
    },
    created_by: 'user-123',
    updated_by: 'user-456',
    version: 7,
    deleted_at: null,
  };

  describe('SAFE_CAPACITY_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(SAFE_CAPACITY_FIELDS).toBeDefined();
      expect(SAFE_CAPACITY_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include essential capacity fields', () => {
      expect(SAFE_CAPACITY_FIELDS).toContain('id');
      expect(SAFE_CAPACITY_FIELDS).toContain('event_id');
      expect(SAFE_CAPACITY_FIELDS).toContain('section_name');
      expect(SAFE_CAPACITY_FIELDS).toContain('total_capacity');
      expect(SAFE_CAPACITY_FIELDS).toContain('available_capacity');
    });

    it('should NOT include forbidden fields', () => {
      for (const forbidden of FORBIDDEN_CAPACITY_FIELDS) {
        expect(SAFE_CAPACITY_FIELDS).not.toContain(forbidden);
      }
    });
  });

  describe('FORBIDDEN_CAPACITY_FIELDS', () => {
    it('should include internal pricing lock data', () => {
      expect(FORBIDDEN_CAPACITY_FIELDS).toContain('locked_price_data');
      expect(FORBIDDEN_CAPACITY_FIELDS).toContain('reserved_at');
      expect(FORBIDDEN_CAPACITY_FIELDS).toContain('reserved_expires_at');
    });

    it('should include internal layout data', () => {
      expect(FORBIDDEN_CAPACITY_FIELDS).toContain('seat_map');
      expect(FORBIDDEN_CAPACITY_FIELDS).toContain('row_config');
    });

    it('should include internal tracking fields', () => {
      expect(FORBIDDEN_CAPACITY_FIELDS).toContain('created_by');
      expect(FORBIDDEN_CAPACITY_FIELDS).toContain('updated_by');
      expect(FORBIDDEN_CAPACITY_FIELDS).toContain('version');
      expect(FORBIDDEN_CAPACITY_FIELDS).toContain('deleted_at');
    });
  });

  describe('SAFE_CAPACITY_SELECT', () => {
    it('should be a comma-separated string', () => {
      expect(typeof SAFE_CAPACITY_SELECT).toBe('string');
      expect(SAFE_CAPACITY_SELECT).toContain('id');
      expect(SAFE_CAPACITY_SELECT).toContain(',');
    });

    it('should NOT contain forbidden fields', () => {
      expect(SAFE_CAPACITY_SELECT).not.toContain('locked_price_data');
      expect(SAFE_CAPACITY_SELECT).not.toContain('seat_map');
      expect(SAFE_CAPACITY_SELECT).not.toContain('row_config');
    });
  });

  describe('serializeCapacity', () => {
    it('should return only safe fields', () => {
      const result = serializeCapacity(mockRawCapacity);

      expect(result.id).toBe(mockRawCapacity.id);
      expect(result.tenantId).toBe(mockRawCapacity.tenant_id);
      expect(result.eventId).toBe(mockRawCapacity.event_id);
      expect(result.sectionName).toBe(mockRawCapacity.section_name);
      expect(result.totalCapacity).toBe(500);
      expect(result.availableCapacity).toBe(350);
    });

    it('should strip forbidden fields', () => {
      const result = serializeCapacity(mockRawCapacity);

      expect((result as any).lockedPriceData).toBeUndefined();
      expect((result as any).locked_price_data).toBeUndefined();
      expect((result as any).seatMap).toBeUndefined();
      expect((result as any).seat_map).toBeUndefined();
      expect((result as any).rowConfig).toBeUndefined();
      expect((result as any).row_config).toBeUndefined();
      expect((result as any).createdBy).toBeUndefined();
      expect((result as any).version).toBeUndefined();
    });

    it('should convert snake_case to camelCase', () => {
      const result = serializeCapacity(mockRawCapacity);

      expect(result.tenantId).toBeDefined();
      expect(result.eventId).toBeDefined();
      expect(result.sectionName).toBeDefined();
      expect(result.totalCapacity).toBeDefined();
      expect(result.minimumPurchase).toBeDefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeCapacity(null as any)).toThrow('Cannot serialize null or undefined capacity');
    });
  });

  describe('serializeCapacities', () => {
    it('should serialize array of capacity objects', () => {
      const capacities = [mockRawCapacity, { ...mockRawCapacity, id: 'capacity-2', section_name: 'Floor B' }];
      const result = serializeCapacities(capacities);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(mockRawCapacity.id);
      expect(result[1].id).toBe('capacity-2');
    });

    it('should return empty array for null input', () => {
      expect(serializeCapacities(null as any)).toEqual([]);
    });

    it('should strip forbidden fields from all capacities', () => {
      const capacities = [mockRawCapacity, { ...mockRawCapacity, id: 'capacity-2' }];
      const result = serializeCapacities(capacities);

      for (const capacity of result) {
        expect((capacity as any).locked_price_data).toBeUndefined();
        expect((capacity as any).seat_map).toBeUndefined();
      }
    });
  });

  describe('findForbiddenCapacityFields', () => {
    it('should find forbidden fields in raw object', () => {
      const found = findForbiddenCapacityFields(mockRawCapacity);

      expect(found).toContain('locked_price_data');
      expect(found).toContain('seat_map');
      expect(found).toContain('row_config');
      expect(found).toContain('version');
    });

    it('should return empty array for safe object', () => {
      const safeCapacity = serializeCapacity(mockRawCapacity);
      const found = findForbiddenCapacityFields(safeCapacity);
      expect(found).toHaveLength(0);
    });
  });

  describe('findMissingSafeCapacityFields', () => {
    it('should return empty for complete serialized capacity', () => {
      const safeCapacity = serializeCapacity(mockRawCapacity);
      const missing = findMissingSafeCapacityFields(safeCapacity);
      expect(missing).toHaveLength(0);
    });

    it('should identify missing required fields', () => {
      const incomplete = { id: '123' };
      const missing = findMissingSafeCapacityFields(incomplete);

      expect(missing).toContain('tenantId');
      expect(missing).toContain('eventId');
      expect(missing).toContain('sectionName');
      expect(missing).toContain('totalCapacity');
    });
  });

  describe('Security validation', () => {
    it('should never leak internal seat map data', () => {
      const result = serializeCapacity(mockRawCapacity);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('seats_per_row');
      expect(jsonString).not.toContain('seatMap');
      expect(jsonString).not.toContain('rowConfig');
    });

    it('should never leak locked price data', () => {
      const result = serializeCapacity(mockRawCapacity);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('locked_price');
      expect(jsonString).not.toContain('lockedPriceData');
    });
  });
});
