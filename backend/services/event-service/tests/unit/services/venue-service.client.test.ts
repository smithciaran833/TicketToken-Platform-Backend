// Mock node-fetch and opossum BEFORE imports
jest.mock('node-fetch', () => jest.fn());
jest.mock('opossum');

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    services: {
      venueServiceUrl: 'http://test-venue-service:3002',
    },
  },
}));

import { VenueServiceClient } from '../../../src/services/venue-service.client';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../src/types';
import CircuitBreaker from 'opossum';

describe('VenueServiceClient', () => {
  let venueClient: VenueServiceClient;
  let mockCircuitBreakerFire: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the circuit breaker fire method
    mockCircuitBreakerFire = jest.fn();

    (CircuitBreaker as jest.MockedClass<typeof CircuitBreaker>).mockImplementation(
      (fn: any, options: any) => {
        return {
          fire: mockCircuitBreakerFire,
        } as any;
      }
    );

    venueClient = new VenueServiceClient();
  });

  describe('constructor', () => {
    it('should initialize circuit breaker with correct options', () => {
      expect(CircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          timeout: 5000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        })
      );
    });
  });

  describe('validateVenueAccess', () => {
    it('should return true when venue is accessible', async () => {
      const mockVenue = { id: 'venue-1', name: 'Test Venue' };
      mockCircuitBreakerFire.mockResolvedValue(mockVenue);

      const result = await venueClient.validateVenueAccess('venue-1', 'auth-token');

      expect(result).toBe(true);
      expect(mockCircuitBreakerFire).toHaveBeenCalledWith(
        '/api/v1/venues/venue-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'auth-token',
          }),
        })
      );
    });

    it('should throw NotFoundError for 404 status', async () => {
      const error: any = new Error('Venue service error: 404 - Not found');
      error.status = 404;
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(
        venueClient.validateVenueAccess('venue-999', 'auth-token')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when message includes 404', async () => {
      const error = new Error('Not found - 404');
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(
        venueClient.validateVenueAccess('venue-999', 'auth-token')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError for 403 status', async () => {
      const error: any = new Error('Venue service error: 403 - Forbidden');
      error.status = 403;
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(
        venueClient.validateVenueAccess('venue-1', 'bad-token')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when message includes 403', async () => {
      const error = new Error('Forbidden - 403');
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(
        venueClient.validateVenueAccess('venue-1', 'bad-token')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ValidationError for other errors', async () => {
      const error = new Error('Internal server error');
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(
        venueClient.validateVenueAccess('venue-1', 'auth-token')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getVenue', () => {
    it('should return venue details', async () => {
      const mockVenue = { 
        id: 'venue-1', 
        name: 'Test Venue',
        max_capacity: 1000,
      };
      mockCircuitBreakerFire.mockResolvedValue(mockVenue);

      const result = await venueClient.getVenue('venue-1', 'auth-token');

      expect(result).toEqual(mockVenue);
      expect(mockCircuitBreakerFire).toHaveBeenCalledWith(
        '/api/v1/venues/venue-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'auth-token',
          }),
        })
      );
    });

    it('should throw NotFoundError for 404 status', async () => {
      const error: any = new Error('Venue service error: 404 - Not found');
      error.status = 404;
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(
        venueClient.getVenue('venue-999', 'auth-token')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when message includes 404', async () => {
      const error = new Error('Error with 404 in message');
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(
        venueClient.getVenue('venue-999', 'auth-token')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError for 403 status', async () => {
      const error: any = new Error('Venue service error: 403 - Forbidden');
      error.status = 403;
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(
        venueClient.getVenue('venue-1', 'bad-token')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when message includes 403', async () => {
      const error = new Error('Access forbidden - 403');
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(
        venueClient.getVenue('venue-1', 'bad-token')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ValidationError for other errors', async () => {
      const error = new Error('Network error');
      mockCircuitBreakerFire.mockRejectedValue(error);

      await expect(
        venueClient.getVenue('venue-1', 'auth-token')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError with proper message', async () => {
      const error = new Error('Unexpected error');
      mockCircuitBreakerFire.mockRejectedValue(error);

      try {
        await venueClient.getVenue('venue-1', 'auth-token');
        fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.details[0].field).toBe('venue_id');
        expect(err.details[0].message).toBe('Failed to retrieve venue details');
      }
    });
  });
});
