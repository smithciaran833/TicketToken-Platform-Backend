/**
 * Unit Tests for src/models/Reservation.ts
 */

import { ReservationModel, IReservation } from '../../../src/models/Reservation';

describe('models/Reservation', () => {
  let mockPool: any;
  let reservationModel: ReservationModel;

  const mockReservationRow = {
    id: 'reservation-123',
    tenant_id: 'tenant-456',
    event_id: 'event-789',
    ticket_type_id: 'type-abc',
    user_id: 'user-def',
    quantity: 2,
    total_quantity: 2,
    tickets: JSON.stringify([{ ticketTypeId: 'type-abc', quantity: 2 }]),
    type_name: 'VIP',
    status: 'pending',
    expires_at: new Date(Date.now() + 600000),
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
    reservationModel = new ReservationModel(mockPool);
  });

  describe('create()', () => {
    it('inserts reservation and returns result', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockReservationRow] });

      const input: IReservation = {
        tenant_id: 'tenant-456',
        event_id: 'event-789',
        ticket_type_id: 'type-abc',
        user_id: 'user-def',
        quantity: 2,
        total_quantity: 2,
        tickets: [{ ticketTypeId: 'type-abc', quantity: 2 }],
        status: 'pending',
        expires_at: new Date(Date.now() + 600000),
      };

      const result = await reservationModel.create(input);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reservations'),
        expect.any(Array)
      );
      expect(result.id).toBe('reservation-123');
    });

    it('stringifies tickets array', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockReservationRow] });

      const input: IReservation = {
        event_id: 'event-789',
        ticket_type_id: 'type-abc',
        user_id: 'user-def',
        quantity: 2,
        total_quantity: 2,
        tickets: [{ ticketTypeId: 'type-abc', quantity: 2 }],
        status: 'pending',
        expires_at: new Date(),
      };

      await reservationModel.create(input);

      const values = mockPool.query.mock.calls[0][1];
      expect(typeof values[6]).toBe('string'); // tickets should be JSON string
    });

    it('handles tickets as string', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockReservationRow] });

      const input: IReservation = {
        event_id: 'event-789',
        ticket_type_id: 'type-abc',
        user_id: 'user-def',
        quantity: 2,
        total_quantity: 2,
        tickets: '[]',
        status: 'pending',
        expires_at: new Date(),
      };

      await reservationModel.create(input);

      const values = mockPool.query.mock.calls[0][1];
      expect(values[6]).toBe('[]');
    });
  });

  describe('findById()', () => {
    it('returns reservation when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockReservationRow] });

      const result = await reservationModel.findById('reservation-123');

      expect(result?.id).toBe('reservation-123');
    });

    it('returns null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await reservationModel.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findActive()', () => {
    it('returns active reservations for user', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockReservationRow] });

      const result = await reservationModel.findActive('user-def');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'active'"),
        ['user-def']
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('update()', () => {
    it('updates allowed fields', async () => {
      const updatedRow = { ...mockReservationRow, status: 'confirmed' };
      mockPool.query.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await reservationModel.update('reservation-123', { status: 'confirmed' });

      expect(result?.status).toBe('confirmed');
    });

    it('throws error for no valid fields', async () => {
      await expect(
        reservationModel.update('reservation-123', { id: 'new-id' } as any)
      ).rejects.toThrow('No valid fields to update');
    });

    it('returns null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await reservationModel.update('nonexistent', { status: 'confirmed' });

      expect(result).toBeNull();
    });

    it('rejects disallowed fields', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockReservationRow] });

      // Only 'status' is in the update, 'created_at' should be ignored
      await reservationModel.update('reservation-123', { status: 'confirmed', created_at: new Date() } as any);

      const query = mockPool.query.mock.calls[0][0];
      expect(query).not.toContain('created_at');
    });
  });

  describe('expireOldReservations()', () => {
    it('expires all old active reservations', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 3 });

      const result = await reservationModel.expireOldReservations();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'active' AND expires_at < NOW()")
      );
      expect(result).toBe(3);
    });

    it('returns 0 when no reservations to expire', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await reservationModel.expireOldReservations();

      expect(result).toBe(0);
    });

    it('handles null rowCount', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: null });

      const result = await reservationModel.expireOldReservations();

      expect(result).toBe(0);
    });
  });
});
