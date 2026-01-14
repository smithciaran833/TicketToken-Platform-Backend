/**
 * Unit Tests for src/models/Ticket.ts
 */

import { TicketModel, ITicket } from '../../../src/models/Ticket';

describe('models/Ticket', () => {
  let mockPool: any;
  let ticketModel: TicketModel;

  const mockTicketRow = {
    id: 'ticket-123',
    tenant_id: 'tenant-456',
    event_id: 'event-789',
    ticket_type_id: 'type-abc',
    user_id: 'user-def',
    ticket_number: 'TKT-ABC123',
    qr_code: 'QR-xyz',
    price_cents: 5000,
    status: 'active',
    is_validated: false,
    is_transferable: true,
    transfer_count: 0,
    is_nft: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
    ticketModel = new TicketModel(mockPool);
  });

  describe('create()', () => {
    it('inserts ticket and returns mapped result', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTicketRow] });

      const input: ITicket = {
        tenant_id: 'tenant-456',
        event_id: 'event-789',
        ticket_type_id: 'type-abc',
        status: 'active',
      };

      const result = await ticketModel.create(input);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tickets'),
        expect.any(Array)
      );
      expect(result.id).toBe('ticket-123');
      expect(result.tenant_id).toBe('tenant-456');
    });

    it('generates ticket_number if not provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTicketRow] });

      const input: ITicket = {
        tenant_id: 'tenant-456',
        event_id: 'event-789',
        ticket_type_id: 'type-abc',
        status: 'active',
      };

      await ticketModel.create(input);

      const values = mockPool.query.mock.calls[0][1];
      expect(values[4]).toMatch(/^TKT-/); // Generated ticket number
    });

    it('generates qr_code if not provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTicketRow] });

      const input: ITicket = {
        tenant_id: 'tenant-456',
        event_id: 'event-789',
        ticket_type_id: 'type-abc',
        status: 'active',
      };

      await ticketModel.create(input);

      const values = mockPool.query.mock.calls[0][1];
      expect(values[5]).toMatch(/^QR-/); // Generated QR code
    });

    it('uses provided ticket_number and qr_code', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTicketRow] });

      const input: ITicket = {
        tenant_id: 'tenant-456',
        event_id: 'event-789',
        ticket_type_id: 'type-abc',
        status: 'active',
        ticket_number: 'CUSTOM-TKT',
        qr_code: 'CUSTOM-QR',
      };

      await ticketModel.create(input);

      const values = mockPool.query.mock.calls[0][1];
      expect(values[4]).toBe('CUSTOM-TKT');
      expect(values[5]).toBe('CUSTOM-QR');
    });
  });

  describe('findById()', () => {
    it('returns ticket when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTicketRow] });

      const result = await ticketModel.findById('ticket-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['ticket-123']
      );
      expect(result?.id).toBe('ticket-123');
    });

    it('returns null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await ticketModel.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('excludes soft-deleted tickets', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await ticketModel.findById('ticket-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });
  });

  describe('findByEventId()', () => {
    it('returns array of tickets', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTicketRow, { ...mockTicketRow, id: 'ticket-456' }] });

      const result = await ticketModel.findByEventId('event-789');

      expect(result).toHaveLength(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE event_id = $1'),
        ['event-789']
      );
    });
  });

  describe('findByUserId()', () => {
    it('returns array of user tickets', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTicketRow] });

      const result = await ticketModel.findByUserId('user-def');

      expect(result).toHaveLength(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['user-def']
      );
    });
  });

  describe('findByTicketNumber()', () => {
    it('returns ticket when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockTicketRow] });

      const result = await ticketModel.findByTicketNumber('TKT-ABC123');

      expect(result?.ticket_number).toBe('TKT-ABC123');
    });

    it('returns null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await ticketModel.findByTicketNumber('INVALID');

      expect(result).toBeNull();
    });
  });

  describe('update()', () => {
    it('updates allowed fields only', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...mockTicketRow, status: 'used' }] });

      const result = await ticketModel.update('ticket-123', { status: 'used' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tickets SET'),
        expect.arrayContaining(['ticket-123', 'used'])
      );
      expect(result?.status).toBe('used');
    });

    it('throws error when no valid fields provided', async () => {
      await expect(
        ticketModel.update('ticket-123', { id: 'new-id', created_at: new Date() } as any)
      ).rejects.toThrow('No valid fields to update');
    });

    it('returns null when ticket not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await ticketModel.update('nonexistent', { status: 'used' });

      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('soft deletes ticket', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await ticketModel.delete('ticket-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SET deleted_at = NOW()'),
        ['ticket-123']
      );
      expect(result).toBe(true);
    });

    it('returns false when ticket not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await ticketModel.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('hardDelete()', () => {
    it('permanently deletes ticket', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await ticketModel.hardDelete('ticket-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tickets'),
        ['ticket-123']
      );
      expect(result).toBe(true);
    });
  });

  describe('mapRowToTicket()', () => {
    it('converts numeric strings to numbers', async () => {
      const rowWithStrings = {
        ...mockTicketRow,
        price_cents: '5000',
        price: '50.00',
        face_value: '50.00',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [rowWithStrings] });

      const result = await ticketModel.findById('ticket-123');

      expect(typeof result?.price_cents).toBe('number');
      expect(result?.price_cents).toBe(5000);
    });
  });
});
