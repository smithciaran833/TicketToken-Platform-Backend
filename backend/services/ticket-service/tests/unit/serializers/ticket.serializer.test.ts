import {
  SAFE_TICKET_FIELDS,
  FORBIDDEN_TICKET_FIELDS,
  SAFE_TICKET_SELECT,
  serializeTicket,
  serializeTicketForOwner,
  serializeTickets,
  serializeTicketsForOwner,
  serializeTicketSummary,
  findForbiddenTicketFields,
  findMissingSafeTicketFields,
  SafeTicket,
} from '../../../src/serializers/ticket.serializer';

describe('Ticket Serializer', () => {
  // Mock raw ticket from database with ALL fields including sensitive ones
  const mockRawTicket = {
    // Safe fields
    id: '123e4567-e89b-12d3-a456-426614174000',
    event_id: 'event-123',
    ticket_type_id: 'type-456',
    status: 'active',
    ticket_number: 'TKT-123456',
    section: 'A',
    row: '1',
    seat: '15',
    is_transferable: true,
    transfer_count: 0,
    is_nft: true,
    token_mint: 'TokenMint123ABC',
    purchased_at: '2026-01-15T10:00:00Z',
    purchase_date: '2026-01-15T10:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',

    // FORBIDDEN fields that should be stripped
    qr_code: 'QR-SECRET-CODE-12345-VALIDATION-TOKEN', // CRITICAL - Ticket forgery risk
    payment_id: 'pi_1234567890abcdef', // CRITICAL - Payment correlation
    user_id: 'user-secret-123', // HIGH - User tracking
    original_purchaser_id: 'user-original-789',
    validated_by: 'staff-456',
    price_cents: 5000, // HIGH - Financial data
    price: 50.00,
    face_value: 45.00,
    tenant_id: 'tenant-secret-abc', // MEDIUM - Multi-tenancy leak
    reservation_id: 'res-123',
    is_validated: true,
    validated_at: '2026-01-20T19:00:00Z',
    checked_in_at: '2026-01-20T19:05:00Z',
    metadata: { internal_note: 'VIP upgrade' },
    deleted_at: null,
  };

  describe('SAFE_TICKET_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(SAFE_TICKET_FIELDS).toBeDefined();
      expect(SAFE_TICKET_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include essential public fields', () => {
      expect(SAFE_TICKET_FIELDS).toContain('id');
      expect(SAFE_TICKET_FIELDS).toContain('event_id');
      expect(SAFE_TICKET_FIELDS).toContain('ticket_type_id');
      expect(SAFE_TICKET_FIELDS).toContain('status');
      expect(SAFE_TICKET_FIELDS).toContain('ticket_number');
      expect(SAFE_TICKET_FIELDS).toContain('created_at');
      expect(SAFE_TICKET_FIELDS).toContain('updated_at');
    });

    it('should NOT include forbidden fields', () => {
      for (const forbidden of FORBIDDEN_TICKET_FIELDS) {
        expect(SAFE_TICKET_FIELDS).not.toContain(forbidden);
      }
    });
  });

  describe('FORBIDDEN_TICKET_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(FORBIDDEN_TICKET_FIELDS).toBeDefined();
      expect(FORBIDDEN_TICKET_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include critical QR code field', () => {
      expect(FORBIDDEN_TICKET_FIELDS).toContain('qr_code');
    });

    it('should include payment data fields', () => {
      expect(FORBIDDEN_TICKET_FIELDS).toContain('payment_id');
      expect(FORBIDDEN_TICKET_FIELDS).toContain('price_cents');
    });

    it('should include user tracking fields', () => {
      expect(FORBIDDEN_TICKET_FIELDS).toContain('user_id');
      expect(FORBIDDEN_TICKET_FIELDS).toContain('original_purchaser_id');
      expect(FORBIDDEN_TICKET_FIELDS).toContain('validated_by');
    });

    it('should include internal tracking fields', () => {
      expect(FORBIDDEN_TICKET_FIELDS).toContain('tenant_id');
      expect(FORBIDDEN_TICKET_FIELDS).toContain('metadata');
      expect(FORBIDDEN_TICKET_FIELDS).toContain('deleted_at');
    });
  });

  describe('SAFE_TICKET_SELECT', () => {
    it('should be a comma-separated string of safe fields', () => {
      expect(typeof SAFE_TICKET_SELECT).toBe('string');
      expect(SAFE_TICKET_SELECT).toContain('id');
      expect(SAFE_TICKET_SELECT).toContain('ticket_number');
      expect(SAFE_TICKET_SELECT).toContain(',');
    });

    it('should NOT contain forbidden fields', () => {
      expect(SAFE_TICKET_SELECT).not.toContain('qr_code');
      expect(SAFE_TICKET_SELECT).not.toContain('payment_id');
      expect(SAFE_TICKET_SELECT).not.toContain('user_id');
    });
  });

  describe('serializeTicket', () => {
    it('should return only safe fields', () => {
      const result = serializeTicket(mockRawTicket);

      // Check safe fields are present
      expect(result.id).toBe(mockRawTicket.id);
      expect(result.eventId).toBe(mockRawTicket.event_id);
      expect(result.ticketTypeId).toBe(mockRawTicket.ticket_type_id);
      expect(result.status).toBe(mockRawTicket.status);
      expect(result.ticketNumber).toBe(mockRawTicket.ticket_number);
    });

    it('should strip forbidden fields', () => {
      const result = serializeTicket(mockRawTicket);

      // Check forbidden fields are NOT present - CRITICAL
      expect((result as any).qrCode).toBeUndefined();
      expect((result as any).qr_code).toBeUndefined();
      expect((result as any).paymentId).toBeUndefined();
      expect((result as any).payment_id).toBeUndefined();
      expect((result as any).userId).toBeUndefined();
      expect((result as any).user_id).toBeUndefined();
      expect((result as any).priceCents).toBeUndefined();
      expect((result as any).price_cents).toBeUndefined();
      expect((result as any).tenantId).toBeUndefined();
      expect((result as any).tenant_id).toBeUndefined();
      expect((result as any).metadata).toBeUndefined();
    });

    it('should convert snake_case to camelCase', () => {
      const result = serializeTicket(mockRawTicket);

      expect(result.eventId).toBeDefined();
      expect(result.ticketTypeId).toBeDefined();
      expect(result.ticketNumber).toBeDefined();
      expect(result.isTransferable).toBeDefined();
      expect(result.transferCount).toBeDefined();
      expect(result.isNft).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeTicket(null as any)).toThrow('Cannot serialize null or undefined ticket');
    });

    it('should throw error for undefined input', () => {
      expect(() => serializeTicket(undefined as any)).toThrow('Cannot serialize null or undefined ticket');
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalTicket = {
        id: '123',
        event_id: 'event-1',
        ticket_type_id: 'type-1',
        status: 'active',
        ticket_number: 'TKT-001',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = serializeTicket(minimalTicket);
      expect(result.id).toBe('123');
      expect(result.section).toBeNull();
      expect(result.row).toBeNull();
      expect(result.seat).toBeNull();
    });
  });

  describe('serializeTicketForOwner', () => {
    it('should include userId for ticket owner', () => {
      const result = serializeTicketForOwner(mockRawTicket);

      expect(result.userId).toBe(mockRawTicket.user_id);
      expect(result.id).toBe(mockRawTicket.id);
    });

    it('should still exclude other forbidden fields', () => {
      const result = serializeTicketForOwner(mockRawTicket);

      expect((result as any).qrCode).toBeUndefined();
      expect((result as any).qr_code).toBeUndefined();
      expect((result as any).paymentId).toBeUndefined();
      expect((result as any).priceCents).toBeUndefined();
      expect((result as any).metadata).toBeUndefined();
    });
  });

  describe('serializeTickets', () => {
    it('should serialize array of tickets', () => {
      const tickets = [mockRawTicket, { ...mockRawTicket, id: 'ticket-2', ticket_number: 'TKT-002' }];
      const result = serializeTickets(tickets);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(mockRawTicket.id);
      expect(result[1].id).toBe('ticket-2');
    });

    it('should return empty array for null input', () => {
      const result = serializeTickets(null as any);
      expect(result).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      const result = serializeTickets(undefined as any);
      expect(result).toEqual([]);
    });

    it('should strip forbidden fields from all tickets', () => {
      const tickets = [mockRawTicket, { ...mockRawTicket, id: 'ticket-2' }];
      const result = serializeTickets(tickets);

      for (const ticket of result) {
        expect((ticket as any).qr_code).toBeUndefined();
        expect((ticket as any).qrCode).toBeUndefined();
        expect((ticket as any).payment_id).toBeUndefined();
        expect((ticket as any).paymentId).toBeUndefined();
      }
    });
  });

  describe('serializeTicketSummary', () => {
    it('should return minimal fields for list views', () => {
      const result = serializeTicketSummary(mockRawTicket);

      expect(result.id).toBeDefined();
      expect(result.ticketNumber).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.isNft).toBeDefined();

      // Should NOT include detailed fields
      expect((result as any).section).toBeUndefined();
      expect((result as any).row).toBeUndefined();
      expect((result as any).seat).toBeUndefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeTicketSummary(null as any)).toThrow('Cannot serialize null or undefined ticket');
    });
  });

  describe('findForbiddenTicketFields', () => {
    it('should find forbidden snake_case fields', () => {
      const found = findForbiddenTicketFields(mockRawTicket);

      expect(found).toContain('qr_code');
      expect(found).toContain('payment_id');
      expect(found).toContain('user_id');
      expect(found).toContain('price_cents');
      expect(found).toContain('tenant_id');
    });

    it('should find forbidden camelCase fields', () => {
      const objWithCamelCase = {
        id: '123',
        qrCode: 'secret',
        paymentId: 'pi_123',
        userId: 'user-123',
        priceCents: 5000,
      };

      const found = findForbiddenTicketFields(objWithCamelCase);
      expect(found).toContain('qrCode');
      expect(found).toContain('paymentId');
      expect(found).toContain('userId');
      expect(found).toContain('priceCents');
    });

    it('should return empty array for safe object', () => {
      const safeTicket = serializeTicket(mockRawTicket);
      const found = findForbiddenTicketFields(safeTicket);
      expect(found).toHaveLength(0);
    });
  });

  describe('findMissingSafeTicketFields', () => {
    it('should return empty for complete serialized ticket', () => {
      const safeTicket = serializeTicket(mockRawTicket);
      const missing = findMissingSafeTicketFields(safeTicket);
      expect(missing).toHaveLength(0);
    });

    it('should identify missing required fields', () => {
      const incomplete = { id: '123' };
      const missing = findMissingSafeTicketFields(incomplete);

      expect(missing).toContain('eventId');
      expect(missing).toContain('ticketTypeId');
      expect(missing).toContain('status');
      expect(missing).toContain('ticketNumber');
    });
  });

  describe('Security validation', () => {
    it('should ensure serialized output passes security check', () => {
      const result = serializeTicket(mockRawTicket);
      const forbidden = findForbiddenTicketFields(result);
      const missing = findMissingSafeTicketFields(result);

      expect(forbidden).toHaveLength(0);
      expect(missing).toHaveLength(0);
    });

    it('should NEVER leak QR code validation secrets', () => {
      const result = serializeTicket(mockRawTicket);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('QR-SECRET-CODE');
      expect(jsonString).not.toContain('VALIDATION-TOKEN');
      expect(jsonString).not.toContain('"qrCode"');
      expect(jsonString).not.toContain('"qr_code"');
    });

    it('should NEVER leak payment IDs', () => {
      const result = serializeTicket(mockRawTicket);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('pi_1234567890');
      expect(jsonString).not.toContain('"paymentId"');
      expect(jsonString).not.toContain('"payment_id"');
    });

    it('should NEVER leak user IDs in standard serialization', () => {
      const result = serializeTicket(mockRawTicket);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('user-secret-123');
      expect(jsonString).not.toContain('"userId"');
      expect(jsonString).not.toContain('"user_id"');
    });

    it('should NEVER leak price data', () => {
      const result = serializeTicket(mockRawTicket);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('5000');
      expect(jsonString).not.toContain('"priceCents"');
      expect(jsonString).not.toContain('"price_cents"');
    });

    it('should NEVER leak tenant IDs', () => {
      const result = serializeTicket(mockRawTicket);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('tenant-secret-abc');
      expect(jsonString).not.toContain('"tenantId"');
      expect(jsonString).not.toContain('"tenant_id"');
    });
  });
});
