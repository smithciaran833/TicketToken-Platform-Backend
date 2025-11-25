// Mock venue-service.client BEFORE any imports to avoid ESM issues
jest.mock('../../../src/services/venue-service.client', () => ({
  VenueServiceClient: jest.fn().mockImplementation(() => ({
    validateVenueAccess: jest.fn(),
    getVenue: jest.fn(),
  })),
}));

jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  })),
}));

import { ReservationCleanupService } from '../../../src/services/reservation-cleanup.service';
import { CapacityService } from '../../../src/services/capacity.service';

describe('ReservationCleanupService', () => {
  let cleanupService: ReservationCleanupService;
  let mockDb: any;
  let mockCapacityService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockDb = jest.fn();

    cleanupService = new ReservationCleanupService(mockDb as any, 1);

    // Mock the capacity service instance's releaseExpiredReservations method
    mockCapacityService = (cleanupService as any).capacityService;
    mockCapacityService.releaseExpiredReservations = jest.fn().mockResolvedValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default interval', () => {
      const service = new ReservationCleanupService(mockDb as any);
      const status = service.getStatus();

      expect(status.intervalMinutes).toBe(1);
      expect(status.isRunning).toBe(false);
    });

    it('should initialize with custom interval', () => {
      const service = new ReservationCleanupService(mockDb as any, 5);
      const status = service.getStatus();

      expect(status.intervalMinutes).toBe(5);
    });
  });

  describe('start', () => {
    it('should start the cleanup job', async () => {
      mockCapacityService.releaseExpiredReservations.mockResolvedValue(5);

      cleanupService.start();

      // Wait for immediate cleanup to complete
      await Promise.resolve();

      expect(cleanupService.getStatus().isRunning).toBe(true);
      expect(mockCapacityService.releaseExpiredReservations).toHaveBeenCalledTimes(1);
    });

    it('should run cleanup on interval', async () => {
      mockCapacityService.releaseExpiredReservations.mockResolvedValue(3);

      cleanupService.start();
      await Promise.resolve();

      // Fast-forward 1 minute
      jest.advanceTimersByTime(60 * 1000);
      await Promise.resolve();

      expect(mockCapacityService.releaseExpiredReservations).toHaveBeenCalledTimes(2);
    });

    it('should not start if already running', async () => {
      cleanupService.start();
      await Promise.resolve();

      cleanupService.start();
      await Promise.resolve();

      expect(mockCapacityService.releaseExpiredReservations).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should stop the cleanup job', async () => {
      cleanupService.start();
      await Promise.resolve();

      cleanupService.stop();

      expect(cleanupService.getStatus().isRunning).toBe(false);
    });

    it('should clear the interval', async () => {
      mockCapacityService.releaseExpiredReservations.mockResolvedValue(2);

      cleanupService.start();
      await Promise.resolve();

      cleanupService.stop();

      // Advance time and verify no more calls
      const callsBefore = mockCapacityService.releaseExpiredReservations.mock.calls.length;
      jest.advanceTimersByTime(60 * 1000);
      await Promise.resolve();

      expect(mockCapacityService.releaseExpiredReservations).toHaveBeenCalledTimes(callsBefore);
    });

    it('should warn if not running', () => {
      cleanupService.stop();
      // Just verify it doesn't throw
      expect(cleanupService.getStatus().isRunning).toBe(false);
    });
  });

  describe('triggerCleanup', () => {
    it('should manually trigger cleanup', async () => {
      mockCapacityService.releaseExpiredReservations.mockResolvedValue(10);

      const result = await cleanupService.triggerCleanup();

      expect(result).toBe(10);
      expect(mockCapacityService.releaseExpiredReservations).toHaveBeenCalledTimes(1);
    });

    it('should return count of released reservations', async () => {
      mockCapacityService.releaseExpiredReservations.mockResolvedValue(7);

      const result = await cleanupService.triggerCleanup();

      expect(result).toBe(7);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = cleanupService.getStatus();

      expect(status).toEqual({
        isRunning: false,
        intervalMinutes: 1,
      });
    });

    it('should reflect running status', async () => {
      cleanupService.start();
      await Promise.resolve();

      const status = cleanupService.getStatus();

      expect(status.isRunning).toBe(true);
    });
  });

  describe('runCleanup (error handling)', () => {
    it('should handle errors gracefully', async () => {
      mockCapacityService.releaseExpiredReservations.mockRejectedValue(
        new Error('Database error')
      );

      cleanupService.start();
      await Promise.resolve();

      // Should not throw - error is caught and logged
      expect(cleanupService.getStatus().isRunning).toBe(true);
    });
  });
});
