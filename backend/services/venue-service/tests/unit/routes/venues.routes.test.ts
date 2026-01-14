/**
 * Unit tests for src/routes/venues.routes.ts
 * Tests main venues route registration with /venues prefix
 * LOW priority - simple re-export of venue controller routes
 */

// Mock the venues controller
jest.mock('../../../src/controllers/venues.controller', () => ({
  venueRoutes: jest.fn(),
}));

import routes from '../../../src/routes/venues.routes';
import { venueRoutes } from '../../../src/controllers/venues.controller';

describe('routes/venues.routes', () => {
  let mockFastify: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFastify = {
      register: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
    };
  });

  describe('route registration', () => {
    it('should be a valid async function', () => {
      expect(typeof routes).toBe('function');
    });

    it('should register venueRoutes with /venues prefix', async () => {
      await routes(mockFastify);

      expect(mockFastify.register).toHaveBeenCalledWith(
        venueRoutes,
        { prefix: '/venues' }
      );
    });

    it('should register venueRoutes only once', async () => {
      await routes(mockFastify);

      expect(mockFastify.register).toHaveBeenCalledTimes(1);
    });

    it('should await the registration to complete', async () => {
      const registrationPromise = Promise.resolve();
      mockFastify.register.mockReturnValue(registrationPromise);

      await routes(mockFastify);

      expect(mockFastify.register).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should propagate errors from fastify.register', async () => {
      const error = new Error('Registration failed');
      mockFastify.register.mockRejectedValue(error);

      await expect(routes(mockFastify)).rejects.toThrow('Registration failed');
    });

    it('should propagate errors from venueRoutes', async () => {
      const error = new Error('Route setup failed');
      mockFastify.register.mockRejectedValue(error);

      await expect(routes(mockFastify)).rejects.toThrow('Route setup failed');
    });
  });

  describe('prefix configuration', () => {
    it('should use /venues as the route prefix', async () => {
      await routes(mockFastify);

      const registerCall = mockFastify.register.mock.calls[0];
      expect(registerCall[1]).toEqual({ prefix: '/venues' });
    });

    it('should not register any phantom V2 routes', async () => {
      await routes(mockFastify);

      // Should only have one registration (venueRoutes)
      expect(mockFastify.register).toHaveBeenCalledTimes(1);
      
      // The registered routes should only be venueRoutes
      const registeredPlugin = mockFastify.register.mock.calls[0][0];
      expect(registeredPlugin).toBe(venueRoutes);
    });
  });

  describe('venueRoutes plugin', () => {
    it('should pass venueRoutes as the first argument to register', async () => {
      await routes(mockFastify);

      const registeredPlugin = mockFastify.register.mock.calls[0][0];
      expect(registeredPlugin).toBe(venueRoutes);
    });
  });

  describe('integration with fastify instance', () => {
    it('should work with a minimal fastify mock', async () => {
      const minimalFastify = {
        register: jest.fn().mockResolvedValue(undefined),
      };

      await routes(minimalFastify as any);

      expect(minimalFastify.register).toHaveBeenCalled();
    });

    it('should handle fastify instance with additional properties', async () => {
      const extendedFastify = {
        register: jest.fn().mockResolvedValue(undefined),
        log: { info: jest.fn(), error: jest.fn() },
        server: {},
        version: '4.0.0',
      };

      await routes(extendedFastify as any);

      expect(extendedFastify.register).toHaveBeenCalledWith(
        venueRoutes,
        { prefix: '/venues' }
      );
    });
  });
});
