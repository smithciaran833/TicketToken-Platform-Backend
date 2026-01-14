/**
 * Unit tests for ReservationCleanupService
 * Tests background job for releasing expired reservations
 */

// Mock CapacityService
const mockReleaseExpiredReservations = jest.fn();

jest.mock('../../../src/services/capacity.service', () => ({
  CapacityService: jest.fn().mockImplementation(() => ({
    releaseExpiredReservations: mockReleaseExpiredReservations,
  })),
}));

jest.mock('pino', () => () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { ReservationCleanupService } from '../../../src/services/reservation-cleanup.service';
import { Knex } from 'knex';

describe('ReservationCleanupService', () => {
  let service: ReservationCleanupService;
  let mockDb: Knex;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    mockDb = {} as Knex;
    mockReleaseExpiredReservations.mockResolvedValue(0);
    
    service = new ReservationCleanupService(mockDb, 1);
  });

  afterEach(() => {
    service.stop();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create service with default interval', () => {
      const defaultService = new ReservationCleanupService(mockDb);
      expect(defaultService.getStatus().intervalMinutes).toBe(1);
      defaultService.stop();
    });

    it('should create service with custom interval', () => {
      const customService = new ReservationCleanupService(mockDb, 5);
      expect(customService.getStatus().intervalMinutes).toBe(5);
      customService.stop();
    });

    it('should not be running initially', () => {
      expect(service.getStatus().isRunning).toBe(false);
    });
  });

  describe('start', () => {
    it('should start the cleanup job', () => {
      service.start();

      expect(service.getStatus().isRunning).toBe(true);
    });

    it('should run cleanup immediately on start', () => {
      service.start();

      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(1);
    });

    it('should schedule interval cleanup', () => {
      service.start();
      
      // First call is immediate
      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(1);
      
      // Advance timer by interval
      jest.advanceTimersByTime(60 * 1000);
      
      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(2);
    });

    it('should not start if already running', () => {
      service.start();
      service.start(); // Second start should be ignored

      expect(service.getStatus().isRunning).toBe(true);
      // Should only have called once (from first start)
      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(1);
    });

    it('should run cleanup at configured interval', () => {
      const fiveMinService = new ReservationCleanupService(mockDb, 5);
      fiveMinService.start();

      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(1);

      // Advance by 1 minute - should not trigger
      jest.advanceTimersByTime(60 * 1000);
      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(1);

      // Advance by 4 more minutes - should trigger
      jest.advanceTimersByTime(4 * 60 * 1000);
      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(2);

      fiveMinService.stop();
    });
  });

  describe('stop', () => {
    it('should stop the cleanup job', () => {
      service.start();
      service.stop();

      expect(service.getStatus().isRunning).toBe(false);
    });

    it('should prevent further scheduled cleanups', () => {
      service.start();
      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(1);

      service.stop();
      
      // Advance timer - should not trigger new cleanup
      jest.advanceTimersByTime(60 * 1000);
      
      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(1);
    });

    it('should do nothing if not running', () => {
      // Should not throw
      service.stop();
      expect(service.getStatus().isRunning).toBe(false);
    });

    it('should allow restart after stop', () => {
      service.start();
      service.stop();
      service.start();

      expect(service.getStatus().isRunning).toBe(true);
      // Called twice: once per start
      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(2);
    });
  });

  describe('triggerCleanup', () => {
    it('should manually trigger cleanup', async () => {
      const result = await service.triggerCleanup();

      expect(mockReleaseExpiredReservations).toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('should return count of released reservations', async () => {
      mockReleaseExpiredReservations.mockResolvedValue(5);

      const result = await service.triggerCleanup();

      expect(result).toBe(5);
    });

    it('should work without starting the service', async () => {
      expect(service.getStatus().isRunning).toBe(false);

      const result = await service.triggerCleanup();

      expect(mockReleaseExpiredReservations).toHaveBeenCalled();
    });

    it('should work while service is running', async () => {
      service.start();
      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(1);

      await service.triggerCleanup();

      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(2);
    });
  });

  describe('getStatus', () => {
    it('should return running status', () => {
      expect(service.getStatus().isRunning).toBe(false);

      service.start();
      expect(service.getStatus().isRunning).toBe(true);

      service.stop();
      expect(service.getStatus().isRunning).toBe(false);
    });

    it('should return interval minutes', () => {
      const status = service.getStatus();

      expect(status.intervalMinutes).toBe(1);
    });

    it('should return correct interval for custom service', () => {
      const customService = new ReservationCleanupService(mockDb, 10);

      expect(customService.getStatus().intervalMinutes).toBe(10);
      
      customService.stop();
    });
  });

  describe('error handling', () => {
    it('should handle cleanup errors gracefully', async () => {
      mockReleaseExpiredReservations.mockRejectedValue(new Error('Database error'));

      service.start();

      // Should not throw
      jest.advanceTimersByTime(60 * 1000);

      // Service should still be running
      expect(service.getStatus().isRunning).toBe(true);
    });

    it('should continue cleanup after error', async () => {
      mockReleaseExpiredReservations
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValue(3);

      service.start();

      // First cleanup (immediate) fails
      jest.advanceTimersByTime(60 * 1000);

      // Second cleanup should still run
      expect(mockReleaseExpiredReservations).toHaveBeenCalledTimes(2);
    });

    it('should handle manual trigger error', async () => {
      mockReleaseExpiredReservations.mockRejectedValue(new Error('Manual error'));

      await expect(service.triggerCleanup()).rejects.toThrow('Manual error');
    });
  });

  describe('multiple instances', () => {
    it('should allow multiple independent services', () => {
      const service1 = new ReservationCleanupService(mockDb, 1);
      const service2 = new ReservationCleanupService(mockDb, 2);

      service1.start();
      service2.start();

      expect(service1.getStatus().isRunning).toBe(true);
      expect(service2.getStatus().isRunning).toBe(true);
      expect(service1.getStatus().intervalMinutes).toBe(1);
      expect(service2.getStatus().intervalMinutes).toBe(2);

      service1.stop();
      service2.stop();
    });
  });

  describe('cleanup results logging', () => {
    it('should complete with zero released reservations', async () => {
      mockReleaseExpiredReservations.mockResolvedValue(0);

      service.start();

      // Just verify it runs without error
      expect(mockReleaseExpiredReservations).toHaveBeenCalled();
    });

    it('should complete with multiple released reservations', async () => {
      mockReleaseExpiredReservations.mockResolvedValue(10);

      service.start();

      expect(mockReleaseExpiredReservations).toHaveBeenCalled();
    });
  });
});
