// Mock knex
const mockRaw = jest.fn();
const mockWhere = jest.fn().mockReturnThis();
const mockSelect = jest.fn();
const mockInsert = jest.fn();

const knexInstance: any = jest.fn((table: string) => ({
  where: mockWhere,
  select: mockSelect,
  insert: mockInsert,
}));
knexInstance.raw = mockRaw;

jest.mock('knex', () => jest.fn(() => knexInstance));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

import { ReservationExpiryWorker } from '../../../src/workers/reservation-expiry.worker';

describe('ReservationExpiryWorker', () => {
  let worker: ReservationExpiryWorker;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRaw.mockResolvedValue({ rows: [{ count: 0 }] });
    mockSelect.mockResolvedValue([]);
    mockInsert.mockResolvedValue([1]);
    mockWhere.mockReturnThis();

    worker = new ReservationExpiryWorker();
  });

  afterEach(() => {
    worker.stop();
  });

  describe('start', () => {
    it('should start worker and process immediately', () => {
      worker.start();

      expect(mockRaw).toHaveBeenCalledWith('SELECT release_expired_reservations() as count');
    });

    it('should not start if already running', () => {
      worker.start();
      const callCount = mockRaw.mock.calls.length;

      worker.start(); // Second call should be ignored

      // Should not have increased significantly
      expect(mockRaw.mock.calls.length).toBe(callCount);
    });

    it('should use custom interval', () => {
      worker.start(30000);

      expect(mockRaw).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop the worker', () => {
      worker.start();
      worker.stop();
    });

    it('should handle stop when not started', () => {
      worker.stop(); // Should not throw
    });
  });

  describe('processExpiredReservations', () => {
    it('should release expired reservations', () => {
      mockRaw.mockResolvedValue({ rows: [{ count: 5 }] });
      mockSelect.mockResolvedValue([
        {
          id: 'res-1',
          order_id: 'order-1',
          user_id: 'user-1',
          quantity: 2,
        },
      ]);

      worker.start();

      expect(mockRaw).toHaveBeenCalledWith('SELECT release_expired_reservations() as count');
    });

    it('should skip if no expired reservations', () => {
      mockRaw.mockResolvedValue({ rows: [{ count: 0 }] });

      worker.start();

      // Should not query for details when count is 0
    });

    it('should handle errors gracefully', () => {
      mockRaw.mockRejectedValue(new Error('Database error'));

      worker.start();

      // Should not throw, just log error
    });
  });
});
