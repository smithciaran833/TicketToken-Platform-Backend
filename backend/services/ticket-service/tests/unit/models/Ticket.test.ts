// =============================================================================
// TEST SUITE - Ticket Model
// =============================================================================

import { Pool } from 'pg';
import { TicketModel, ITicket } from '../../../src/models/Ticket';

describe('TicketModel', () => {
  let model: TicketModel;
  let mockPool: jest.Mocked<Partial<Pool>>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };

    model = new TicketModel(mockPool as Pool);
  });

  describe('create()', () => {
    it('should create a ticket', async () => {
      const ticketData: ITicket = {
        event_id: 'event-123',
        ticket_type_id: 'type-123',
        user_id: 'user-123',
        status: 'AVAILABLE',
        price_cents: 5000,
      };

      const mockResult = {
        rows: [{ id: 'ticket-1', ...ticketData }],
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await model.create(ticketData);

      expect(result.id).toBe('ticket-1');
    });

    it('should default status to AVAILABLE', async () => {
      const ticketData: ITicket = {
        event_id: 'event-123',
        ticket_type_id: 'type-123',
        status: 'AVAILABLE',
        price_cents: 5000,
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.create(ticketData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][3]).toBe('AVAILABLE');
    });

    it('should handle optional fields', async () => {
      const ticketData: ITicket = {
        event_id: 'event-123',
        ticket_type_id: 'type-123',
        status: 'AVAILABLE',
        price_cents: 5000,
        seat_number: 'A12',
        section: 'VIP',
        row: '1',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [ticketData] });

      const result = await model.create(ticketData);

      expect(result.seat_number).toBe('A12');
      expect(result.section).toBe('VIP');
      expect(result.row).toBe('1');
    });

    it('should default metadata to empty object', async () => {
      const ticketData: ITicket = {
        event_id: 'event-123',
        ticket_type_id: 'type-123',
        status: 'AVAILABLE',
        price_cents: 5000,
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.create(ticketData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][9]).toEqual({});
    });
  });

  describe('findById()', () => {
    it('should find ticket by id', async () => {
      const mockTicket = {
        id: 'ticket-1',
        event_id: 'event-123',
        status: 'SOLD',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockTicket] });

      const result = await model.findById('ticket-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM tickets WHERE id = $1',
        ['ticket-1']
      );
      expect(result).toEqual(mockTicket);
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.findById('notfound');

      expect(result).toBeNull();
    });
  });

  describe('findByEventId()', () => {
    it('should find tickets by event id', async () => {
      const mockTickets = [
        { id: 'ticket-1', event_id: 'event-123' },
        { id: 'ticket-2', event_id: 'event-123' },
      ];

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: mockTickets });

      const result = await model.findByEventId('event-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE event_id = $1'),
        ['event-123']
      );
      expect(result).toEqual(mockTickets);
    });

    it('should order by created_at DESC', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await model.findByEventId('event-123');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('ORDER BY created_at DESC');
    });

    it('should return empty array if none found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.findByEventId('event-123');

      expect(result).toEqual([]);
    });
  });

  describe('update()', () => {
    it('should update ticket with valid fields', async () => {
      const mockUpdated = { id: 'ticket-1', status: 'SOLD' };
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockUpdated] });

      const result = await model.update('ticket-1', { status: 'SOLD' });

      expect(result).toEqual(mockUpdated);
    });

    it('should only update whitelisted fields', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('ticket-1', { status: 'SOLD' });

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('status = $2');
    });

    it('should reject non-whitelisted fields', async () => {
      await expect(
        model.update('ticket-1', { invalid_field: 'value' } as any)
      ).rejects.toThrow('No valid fields to update');
    });

    it('should update updated_at timestamp', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('ticket-1', { status: 'SOLD' });

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('updated_at = NOW()');
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.update('notfound', { status: 'SOLD' });

      expect(result).toBeNull();
    });

    it('should handle multiple valid fields', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('ticket-1', {
        status: 'SOLD',
        user_id: 'new-user',
        price_cents: 6000,
      });

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('status');
      expect(call).toContain('user_id');
      expect(call).toContain('price_cents');
    });

    it('should filter out invalid fields', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('ticket-1', {
        status: 'SOLD',
        invalid: 'field',
      } as any);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1]).toEqual(['ticket-1', 'SOLD']);
    });
  });

  describe('delete()', () => {
    it('should delete ticket', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      const result = await model.delete('ticket-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM tickets WHERE id = $1',
        ['ticket-1']
      );
      expect(result).toBe(true);
    });

    it('should return false if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 0 });

      const result = await model.delete('notfound');

      expect(result).toBe(false);
    });

    it('should handle null rowCount', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: null });

      const result = await model.delete('ticket-1');

      expect(result).toBe(false);
    });
  });
});
