// =============================================================================
// TEST SUITE - Reservation Model
// =============================================================================

import { Pool } from 'pg';
import { ReservationModel, IReservation } from '../../../src/models/Reservation';

describe('ReservationModel', () => {
  let model: ReservationModel;
  let mockPool: jest.Mocked<Partial<Pool>>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };

    model = new ReservationModel(mockPool as Pool);
  });

  describe('create()', () => {
    it('should create a reservation', async () => {
      const reservationData: IReservation = {
        user_id: 'user-123',
        ticket_id: 'ticket-123',
        expires_at: new Date('2024-12-31'),
        status: 'active',
      };

      const mockResult = {
        rows: [{ id: 'reservation-1', ...reservationData }],
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await model.create(reservationData);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reservations'),
        ['user-123', 'ticket-123', reservationData.expires_at, 'active']
      );
      expect(result.id).toBe('reservation-1');
    });

    it('should default status to active', async () => {
      const reservationData: IReservation = {
        user_id: 'user-123',
        ticket_id: 'ticket-123',
        expires_at: new Date('2024-12-31'),
        status: 'active',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.create(reservationData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][3]).toBe('active');
    });

    it('should return created reservation', async () => {
      const mockReservation = {
        id: 'reservation-1',
        user_id: 'user-123',
        status: 'active',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockReservation] });

      const result = await model.create(mockReservation as IReservation);

      expect(result).toEqual(mockReservation);
    });
  });

  describe('findById()', () => {
    it('should find reservation by id', async () => {
      const mockReservation = {
        id: 'reservation-1',
        user_id: 'user-123',
        status: 'active',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockReservation] });

      const result = await model.findById('reservation-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM reservations WHERE id = $1',
        ['reservation-1']
      );
      expect(result).toEqual(mockReservation);
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.findById('notfound');

      expect(result).toBeNull();
    });
  });

  describe('findActive()', () => {
    it('should find active reservations for user', async () => {
      const mockReservations = [
        { id: 'r1', user_id: 'user-123', status: 'active' },
        { id: 'r2', user_id: 'user-123', status: 'active' },
      ];

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: mockReservations });

      const result = await model.findActive('user-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['user-123']
      );
      expect(result).toEqual(mockReservations);
    });

    it('should only return active status', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await model.findActive('user-123');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain("status = 'active'");
    });

    it('should only return unexpired reservations', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await model.findActive('user-123');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('expires_at > NOW()');
    });

    it('should order by created_at DESC', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await model.findActive('user-123');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('ORDER BY created_at DESC');
    });

    it('should return empty array if none found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.findActive('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('update()', () => {
    it('should update reservation with valid fields', async () => {
      const mockUpdated = { id: 'reservation-1', status: 'completed' };
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockUpdated] });

      const result = await model.update('reservation-1', { status: 'completed' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE reservations'),
        ['reservation-1', 'completed']
      );
      expect(result).toEqual(mockUpdated);
    });

    it('should only update whitelisted fields', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('reservation-1', { status: 'expired' });

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('status = $2');
    });

    it('should reject non-whitelisted fields', async () => {
      await expect(
        model.update('reservation-1', { invalid_field: 'value' } as any)
      ).rejects.toThrow('No valid fields to update');
    });

    it('should update updated_at timestamp', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('reservation-1', { status: 'completed' });

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('updated_at = NOW()');
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.update('notfound', { status: 'completed' });

      expect(result).toBeNull();
    });

    it('should handle multiple valid fields', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('reservation-1', {
        status: 'completed',
        user_id: 'new-user',
      });

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('status');
      expect(call).toContain('user_id');
    });

    it('should filter out invalid fields', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('reservation-1', {
        status: 'completed',
        invalid: 'field',
      } as any);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1]).toEqual(['reservation-1', 'completed']);
    });
  });

  describe('expireOldReservations()', () => {
    it('should expire old reservations', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 5 });

      const result = await model.expireOldReservations();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE reservations')
      );
      expect(result).toBe(5);
    });

    it('should set status to expired', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      await model.expireOldReservations();

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain("status = 'expired'");
    });

    it('should update updated_at timestamp', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      await model.expireOldReservations();

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('updated_at = NOW()');
    });

    it('should only expire active reservations', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      await model.expireOldReservations();

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain("status = 'active'");
    });

    it('should only expire past expiry date', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      await model.expireOldReservations();

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('expires_at < NOW()');
    });

    it('should return 0 if no rows updated', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 0 });

      const result = await model.expireOldReservations();

      expect(result).toBe(0);
    });

    it('should handle null rowCount', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: null });

      const result = await model.expireOldReservations();

      expect(result).toBe(0);
    });
  });
});
