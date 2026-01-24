import {
  SAFE_RESERVATION_FIELDS,
  FORBIDDEN_RESERVATION_FIELDS,
  SAFE_RESERVATION_SELECT,
  serializeReservation,
  serializeReservationForOwner,
  serializeReservations,
  serializeReservationsForOwner,
  serializeReservationSummary,
  findForbiddenReservationFields,
  findMissingSafeReservationFields,
  SafeReservation,
} from '../../../src/serializers/reservation.serializer';

describe('Reservation Serializer', () => {
  // Mock raw reservation from database with ALL fields including sensitive ones
  const mockRawReservation = {
    // Safe fields
    id: '123e4567-e89b-12d3-a456-426614174000',
    event_id: 'event-123',
    ticket_type_id: 'type-456',
    quantity: 2,
    total_quantity: 2,
    type_name: 'VIP Pass',
    status: 'pending',
    expires_at: '2026-01-20T15:00:00Z',
    created_at: '2026-01-20T14:45:00Z',
    updated_at: '2026-01-20T14:45:00Z',

    // FORBIDDEN fields that should be stripped
    user_id: 'user-secret-123', // HIGH - User tracking
    tickets: [ // MEDIUM - Internal ticket data
      { ticketTypeId: 'type-456', quantity: 2, price: 150 }
    ],
    tenant_id: 'tenant-secret-abc', // MEDIUM - Multi-tenancy
    released_at: null,
    metadata: { internal_note: 'Priority customer' },
    created_by: 'system',
    updated_by: 'system',
    deleted_at: null,
    version: 1,
  };

  describe('SAFE_RESERVATION_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(SAFE_RESERVATION_FIELDS).toBeDefined();
      expect(SAFE_RESERVATION_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include essential public fields', () => {
      expect(SAFE_RESERVATION_FIELDS).toContain('id');
      expect(SAFE_RESERVATION_FIELDS).toContain('event_id');
      expect(SAFE_RESERVATION_FIELDS).toContain('ticket_type_id');
      expect(SAFE_RESERVATION_FIELDS).toContain('status');
      expect(SAFE_RESERVATION_FIELDS).toContain('expires_at');
      expect(SAFE_RESERVATION_FIELDS).toContain('created_at');
    });

    it('should NOT include forbidden fields', () => {
      for (const forbidden of FORBIDDEN_RESERVATION_FIELDS) {
        expect(SAFE_RESERVATION_FIELDS).not.toContain(forbidden);
      }
    });
  });

  describe('FORBIDDEN_RESERVATION_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(FORBIDDEN_RESERVATION_FIELDS).toBeDefined();
      expect(FORBIDDEN_RESERVATION_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include user tracking fields', () => {
      expect(FORBIDDEN_RESERVATION_FIELDS).toContain('user_id');
    });

    it('should include internal ticket data', () => {
      expect(FORBIDDEN_RESERVATION_FIELDS).toContain('tickets');
    });

    it('should include internal tracking fields', () => {
      expect(FORBIDDEN_RESERVATION_FIELDS).toContain('tenant_id');
      expect(FORBIDDEN_RESERVATION_FIELDS).toContain('metadata');
      expect(FORBIDDEN_RESERVATION_FIELDS).toContain('deleted_at');
    });
  });

  describe('SAFE_RESERVATION_SELECT', () => {
    it('should be a comma-separated string of safe fields', () => {
      expect(typeof SAFE_RESERVATION_SELECT).toBe('string');
      expect(SAFE_RESERVATION_SELECT).toContain('id');
      expect(SAFE_RESERVATION_SELECT).toContain('status');
      expect(SAFE_RESERVATION_SELECT).toContain(',');
    });

    it('should NOT contain forbidden fields', () => {
      expect(SAFE_RESERVATION_SELECT).not.toContain('user_id');
      expect(SAFE_RESERVATION_SELECT).not.toContain('tickets');
      expect(SAFE_RESERVATION_SELECT).not.toContain('tenant_id');
    });
  });

  describe('serializeReservation', () => {
    it('should return only safe fields', () => {
      const result = serializeReservation(mockRawReservation);

      // Check safe fields are present
      expect(result.id).toBe(mockRawReservation.id);
      expect(result.eventId).toBe(mockRawReservation.event_id);
      expect(result.ticketTypeId).toBe(mockRawReservation.ticket_type_id);
      expect(result.status).toBe(mockRawReservation.status);
      expect(result.quantity).toBe(mockRawReservation.quantity);
    });

    it('should strip forbidden fields', () => {
      const result = serializeReservation(mockRawReservation);

      // Check forbidden fields are NOT present
      expect((result as any).userId).toBeUndefined();
      expect((result as any).user_id).toBeUndefined();
      expect((result as any).tickets).toBeUndefined();
      expect((result as any).tenantId).toBeUndefined();
      expect((result as any).tenant_id).toBeUndefined();
      expect((result as any).metadata).toBeUndefined();
      expect((result as any).releasedAt).toBeUndefined();
    });

    it('should convert snake_case to camelCase', () => {
      const result = serializeReservation(mockRawReservation);

      expect(result.eventId).toBeDefined();
      expect(result.ticketTypeId).toBeDefined();
      expect(result.totalQuantity).toBeDefined();
      expect(result.typeName).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeReservation(null as any)).toThrow('Cannot serialize null or undefined reservation');
    });

    it('should throw error for undefined input', () => {
      expect(() => serializeReservation(undefined as any)).toThrow('Cannot serialize null or undefined reservation');
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalReservation = {
        id: '123',
        event_id: 'event-1',
        ticket_type_id: 'type-1',
        quantity: 1,
        status: 'pending',
        expires_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = serializeReservation(minimalReservation);
      expect(result.id).toBe('123');
      expect(result.typeName).toBeNull();
    });
  });

  describe('serializeReservationForOwner', () => {
    it('should include userId for reservation owner', () => {
      const result = serializeReservationForOwner(mockRawReservation);

      expect(result.userId).toBe(mockRawReservation.user_id);
      expect(result.id).toBe(mockRawReservation.id);
    });

    it('should still exclude other forbidden fields', () => {
      const result = serializeReservationForOwner(mockRawReservation);

      expect((result as any).tickets).toBeUndefined();
      expect((result as any).tenantId).toBeUndefined();
      expect((result as any).metadata).toBeUndefined();
    });
  });

  describe('serializeReservations', () => {
    it('should serialize array of reservations', () => {
      const reservations = [mockRawReservation, { ...mockRawReservation, id: 'res-2' }];
      const result = serializeReservations(reservations);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(mockRawReservation.id);
      expect(result[1].id).toBe('res-2');
    });

    it('should return empty array for null input', () => {
      const result = serializeReservations(null as any);
      expect(result).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      const result = serializeReservations(undefined as any);
      expect(result).toEqual([]);
    });

    it('should strip forbidden fields from all reservations', () => {
      const reservations = [mockRawReservation, { ...mockRawReservation, id: 'res-2' }];
      const result = serializeReservations(reservations);

      for (const reservation of result) {
        expect((reservation as any).user_id).toBeUndefined();
        expect((reservation as any).userId).toBeUndefined();
        expect((reservation as any).tickets).toBeUndefined();
      }
    });
  });

  describe('serializeReservationSummary', () => {
    it('should return minimal fields for list views', () => {
      const result = serializeReservationSummary(mockRawReservation);

      expect(result.id).toBeDefined();
      expect(result.eventId).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.totalQuantity).toBeDefined();
      expect(result.expiresAt).toBeDefined();

      // Should NOT include detailed fields
      expect((result as any).ticketTypeId).toBeUndefined();
      expect((result as any).typeName).toBeUndefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeReservationSummary(null as any)).toThrow('Cannot serialize null or undefined reservation');
    });
  });

  describe('findForbiddenReservationFields', () => {
    it('should find forbidden snake_case fields', () => {
      const found = findForbiddenReservationFields(mockRawReservation);

      expect(found).toContain('user_id');
      expect(found).toContain('tickets');
      expect(found).toContain('tenant_id');
      expect(found).toContain('metadata');
    });

    it('should find forbidden camelCase fields', () => {
      const objWithCamelCase = {
        id: '123',
        userId: 'user-123',
        tickets: [],
        tenantId: 'tenant-123',
      };

      const found = findForbiddenReservationFields(objWithCamelCase);
      expect(found).toContain('userId');
      expect(found).toContain('tickets');
      expect(found).toContain('tenantId');
    });

    it('should return empty array for safe object', () => {
      const safeReservation = serializeReservation(mockRawReservation);
      const found = findForbiddenReservationFields(safeReservation);
      expect(found).toHaveLength(0);
    });
  });

  describe('findMissingSafeReservationFields', () => {
    it('should return empty for complete serialized reservation', () => {
      const safeReservation = serializeReservation(mockRawReservation);
      const missing = findMissingSafeReservationFields(safeReservation);
      expect(missing).toHaveLength(0);
    });

    it('should identify missing required fields', () => {
      const incomplete = { id: '123' };
      const missing = findMissingSafeReservationFields(incomplete);

      expect(missing).toContain('eventId');
      expect(missing).toContain('ticketTypeId');
      expect(missing).toContain('status');
      expect(missing).toContain('expiresAt');
    });
  });

  describe('Security validation', () => {
    it('should ensure serialized output passes security check', () => {
      const result = serializeReservation(mockRawReservation);
      const forbidden = findForbiddenReservationFields(result);
      const missing = findMissingSafeReservationFields(result);

      expect(forbidden).toHaveLength(0);
      expect(missing).toHaveLength(0);
    });

    it('should NEVER leak user IDs in standard serialization', () => {
      const result = serializeReservation(mockRawReservation);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('user-secret-123');
      expect(jsonString).not.toContain('"userId"');
      expect(jsonString).not.toContain('"user_id"');
    });

    it('should NEVER leak internal ticket data', () => {
      const result = serializeReservation(mockRawReservation);
      const jsonString = JSON.stringify(result);

      // "tickets" is the raw internal JSON array with quantities/prices - should be stripped
      expect(jsonString).not.toContain('"tickets"');
      // Note: ticketTypeId IS a safe field - users need to know which type they reserved
    });

    it('should NEVER leak tenant IDs', () => {
      const result = serializeReservation(mockRawReservation);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('tenant-secret-abc');
      expect(jsonString).not.toContain('"tenantId"');
      expect(jsonString).not.toContain('"tenant_id"');
    });

    it('should NEVER leak internal metadata', () => {
      const result = serializeReservation(mockRawReservation);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('Priority customer');
      expect(jsonString).not.toContain('"metadata"');
    });
  });
});
