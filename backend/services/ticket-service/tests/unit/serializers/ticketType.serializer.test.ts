import {
  SAFE_TICKET_TYPE_FIELDS,
  FORBIDDEN_TICKET_TYPE_FIELDS,
  SAFE_TICKET_TYPE_SELECT,
  serializeTicketType,
  serializeTicketTypes,
  serializeTicketTypeSummary,
  findForbiddenTicketTypeFields,
  findMissingSafeTicketTypeFields,
  SafeTicketType,
} from '../../../src/serializers/ticketType.serializer';

describe('TicketType Serializer', () => {
  // Mock raw ticket type from database with ALL fields including sensitive ones
  const mockRawTicketType = {
    // Safe fields
    id: '123e4567-e89b-12d3-a456-426614174000',
    event_id: 'event-123',
    name: 'VIP Pass',
    description: 'Full access VIP experience',
    category: 'premium',
    price: 150.00,
    quantity: 100,
    available_quantity: 75,
    min_purchase: 1,
    max_purchase: 4,
    sale_start: '2026-01-01T00:00:00Z',
    sale_end: '2026-06-01T00:00:00Z',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',

    // FORBIDDEN fields that should be stripped
    sold_quantity: 25, // HIGH - Business intelligence
    reserved_quantity: 5, // HIGH - Business intelligence
    cost_basis: 50.00, // HIGH - Internal pricing
    profit_margin: 66.67, // HIGH - Business confidential
    commission_rate: 0.10,
    platform_fee_cents: 500,
    tenant_id: 'tenant-secret-abc', // MEDIUM - Multi-tenancy
    metadata: { internal_note: 'High margin item' }, // MEDIUM
    created_by: 'admin-123',
    updated_by: 'admin-456',
    deleted_at: null,
    version: 3,
  };

  describe('SAFE_TICKET_TYPE_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(SAFE_TICKET_TYPE_FIELDS).toBeDefined();
      expect(SAFE_TICKET_TYPE_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include essential public fields', () => {
      expect(SAFE_TICKET_TYPE_FIELDS).toContain('id');
      expect(SAFE_TICKET_TYPE_FIELDS).toContain('event_id');
      expect(SAFE_TICKET_TYPE_FIELDS).toContain('name');
      expect(SAFE_TICKET_TYPE_FIELDS).toContain('price');
      expect(SAFE_TICKET_TYPE_FIELDS).toContain('available_quantity');
      expect(SAFE_TICKET_TYPE_FIELDS).toContain('created_at');
    });

    it('should NOT include forbidden fields', () => {
      for (const forbidden of FORBIDDEN_TICKET_TYPE_FIELDS) {
        expect(SAFE_TICKET_TYPE_FIELDS).not.toContain(forbidden);
      }
    });
  });

  describe('FORBIDDEN_TICKET_TYPE_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(FORBIDDEN_TICKET_TYPE_FIELDS).toBeDefined();
      expect(FORBIDDEN_TICKET_TYPE_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include business intelligence fields', () => {
      expect(FORBIDDEN_TICKET_TYPE_FIELDS).toContain('sold_quantity');
      expect(FORBIDDEN_TICKET_TYPE_FIELDS).toContain('reserved_quantity');
    });

    it('should include internal pricing fields', () => {
      expect(FORBIDDEN_TICKET_TYPE_FIELDS).toContain('cost_basis');
      expect(FORBIDDEN_TICKET_TYPE_FIELDS).toContain('profit_margin');
      expect(FORBIDDEN_TICKET_TYPE_FIELDS).toContain('commission_rate');
    });

    it('should include internal tracking fields', () => {
      expect(FORBIDDEN_TICKET_TYPE_FIELDS).toContain('tenant_id');
      expect(FORBIDDEN_TICKET_TYPE_FIELDS).toContain('metadata');
      expect(FORBIDDEN_TICKET_TYPE_FIELDS).toContain('deleted_at');
    });
  });

  describe('SAFE_TICKET_TYPE_SELECT', () => {
    it('should be a comma-separated string of safe fields', () => {
      expect(typeof SAFE_TICKET_TYPE_SELECT).toBe('string');
      expect(SAFE_TICKET_TYPE_SELECT).toContain('id');
      expect(SAFE_TICKET_TYPE_SELECT).toContain('name');
      expect(SAFE_TICKET_TYPE_SELECT).toContain(',');
    });

    it('should NOT contain forbidden fields', () => {
      expect(SAFE_TICKET_TYPE_SELECT).not.toContain('sold_quantity');
      expect(SAFE_TICKET_TYPE_SELECT).not.toContain('cost_basis');
      expect(SAFE_TICKET_TYPE_SELECT).not.toContain('profit_margin');
    });
  });

  describe('serializeTicketType', () => {
    it('should return only safe fields', () => {
      const result = serializeTicketType(mockRawTicketType);

      // Check safe fields are present
      expect(result.id).toBe(mockRawTicketType.id);
      expect(result.eventId).toBe(mockRawTicketType.event_id);
      expect(result.name).toBe(mockRawTicketType.name);
      expect(result.price).toBe(mockRawTicketType.price);
      expect(result.availableQuantity).toBe(mockRawTicketType.available_quantity);
    });

    it('should strip forbidden fields', () => {
      const result = serializeTicketType(mockRawTicketType);

      // Check forbidden fields are NOT present
      expect((result as any).soldQuantity).toBeUndefined();
      expect((result as any).sold_quantity).toBeUndefined();
      expect((result as any).reservedQuantity).toBeUndefined();
      expect((result as any).reserved_quantity).toBeUndefined();
      expect((result as any).costBasis).toBeUndefined();
      expect((result as any).cost_basis).toBeUndefined();
      expect((result as any).profitMargin).toBeUndefined();
      expect((result as any).profit_margin).toBeUndefined();
      expect((result as any).tenantId).toBeUndefined();
      expect((result as any).tenant_id).toBeUndefined();
      expect((result as any).metadata).toBeUndefined();
    });

    it('should convert snake_case to camelCase', () => {
      const result = serializeTicketType(mockRawTicketType);

      expect(result.eventId).toBeDefined();
      expect(result.availableQuantity).toBeDefined();
      expect(result.minPurchase).toBeDefined();
      expect(result.maxPurchase).toBeDefined();
      expect(result.saleStart).toBeDefined();
      expect(result.saleEnd).toBeDefined();
      expect(result.isActive).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeTicketType(null as any)).toThrow('Cannot serialize null or undefined ticket type');
    });

    it('should throw error for undefined input', () => {
      expect(() => serializeTicketType(undefined as any)).toThrow('Cannot serialize null or undefined ticket type');
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalTicketType = {
        id: '123',
        event_id: 'event-1',
        name: 'Basic',
        price: 50,
        available_quantity: 100,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = serializeTicketType(minimalTicketType);
      expect(result.id).toBe('123');
      expect(result.description).toBeNull();
      expect(result.category).toBeNull();
    });
  });

  describe('serializeTicketTypes', () => {
    it('should serialize array of ticket types', () => {
      const ticketTypes = [mockRawTicketType, { ...mockRawTicketType, id: 'type-2', name: 'General' }];
      const result = serializeTicketTypes(ticketTypes);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(mockRawTicketType.id);
      expect(result[1].id).toBe('type-2');
    });

    it('should return empty array for null input', () => {
      const result = serializeTicketTypes(null as any);
      expect(result).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      const result = serializeTicketTypes(undefined as any);
      expect(result).toEqual([]);
    });

    it('should strip forbidden fields from all ticket types', () => {
      const ticketTypes = [mockRawTicketType, { ...mockRawTicketType, id: 'type-2' }];
      const result = serializeTicketTypes(ticketTypes);

      for (const ticketType of result) {
        expect((ticketType as any).sold_quantity).toBeUndefined();
        expect((ticketType as any).soldQuantity).toBeUndefined();
        expect((ticketType as any).cost_basis).toBeUndefined();
        expect((ticketType as any).costBasis).toBeUndefined();
      }
    });
  });

  describe('serializeTicketTypeSummary', () => {
    it('should return minimal fields for list views', () => {
      const result = serializeTicketTypeSummary(mockRawTicketType);

      expect(result.id).toBeDefined();
      expect(result.name).toBeDefined();
      expect(result.price).toBeDefined();
      expect(result.availableQuantity).toBeDefined();
      expect(result.isActive).toBeDefined();

      // Should NOT include detailed fields
      expect((result as any).description).toBeUndefined();
      expect((result as any).category).toBeUndefined();
      expect((result as any).saleStart).toBeUndefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeTicketTypeSummary(null as any)).toThrow('Cannot serialize null or undefined ticket type');
    });
  });

  describe('findForbiddenTicketTypeFields', () => {
    it('should find forbidden snake_case fields', () => {
      const found = findForbiddenTicketTypeFields(mockRawTicketType);

      expect(found).toContain('sold_quantity');
      expect(found).toContain('reserved_quantity');
      expect(found).toContain('cost_basis');
      expect(found).toContain('profit_margin');
      expect(found).toContain('tenant_id');
    });

    it('should find forbidden camelCase fields', () => {
      const objWithCamelCase = {
        id: '123',
        soldQuantity: 25,
        costBasis: 50,
        profitMargin: 66,
      };

      const found = findForbiddenTicketTypeFields(objWithCamelCase);
      expect(found).toContain('soldQuantity');
      expect(found).toContain('costBasis');
      expect(found).toContain('profitMargin');
    });

    it('should return empty array for safe object', () => {
      const safeTicketType = serializeTicketType(mockRawTicketType);
      const found = findForbiddenTicketTypeFields(safeTicketType);
      expect(found).toHaveLength(0);
    });
  });

  describe('findMissingSafeTicketTypeFields', () => {
    it('should return empty for complete serialized ticket type', () => {
      const safeTicketType = serializeTicketType(mockRawTicketType);
      const missing = findMissingSafeTicketTypeFields(safeTicketType);
      expect(missing).toHaveLength(0);
    });

    it('should identify missing required fields', () => {
      const incomplete = { id: '123' };
      const missing = findMissingSafeTicketTypeFields(incomplete);

      expect(missing).toContain('eventId');
      expect(missing).toContain('name');
      expect(missing).toContain('price');
      expect(missing).toContain('availableQuantity');
    });
  });

  describe('Security validation', () => {
    it('should ensure serialized output passes security check', () => {
      const result = serializeTicketType(mockRawTicketType);
      const forbidden = findForbiddenTicketTypeFields(result);
      const missing = findMissingSafeTicketTypeFields(result);

      expect(forbidden).toHaveLength(0);
      expect(missing).toHaveLength(0);
    });

    it('should NEVER leak sold quantity (business intelligence)', () => {
      const result = serializeTicketType(mockRawTicketType);
      const jsonString = JSON.stringify(result);

      // Should not contain the value 25 as sold_quantity
      expect(jsonString).not.toContain('"soldQuantity"');
      expect(jsonString).not.toContain('"sold_quantity"');
    });

    it('should NEVER leak cost basis (internal pricing)', () => {
      const result = serializeTicketType(mockRawTicketType);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('"costBasis"');
      expect(jsonString).not.toContain('"cost_basis"');
    });

    it('should NEVER leak profit margin (business confidential)', () => {
      const result = serializeTicketType(mockRawTicketType);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('66.67');
      expect(jsonString).not.toContain('"profitMargin"');
      expect(jsonString).not.toContain('"profit_margin"');
    });

    it('should NEVER leak tenant IDs', () => {
      const result = serializeTicketType(mockRawTicketType);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('tenant-secret-abc');
      expect(jsonString).not.toContain('"tenantId"');
      expect(jsonString).not.toContain('"tenant_id"');
    });
  });
});
