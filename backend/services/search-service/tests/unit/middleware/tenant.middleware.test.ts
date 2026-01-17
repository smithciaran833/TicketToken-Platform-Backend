// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/middleware/tenant.middleware.ts
 */

jest.mock('../../../src/utils/tenant-filter');

describe('src/middleware/tenant.middleware.ts - Comprehensive Unit Tests', () => {
  let validateVenueId: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock tenant-filter
    validateVenueId = require('../../../src/utils/tenant-filter').validateVenueId;
    validateVenueId.mockImplementation(() => true);

    // Mock request
    mockRequest = {
      user: undefined
    };

    // Mock reply
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  // =============================================================================
  // requireTenant() - Success Cases
  // =============================================================================

  describe('requireTenant() - Success Cases', () => {
    it('should allow request with valid venueId', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'venue-123' };

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should validate venueId format', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'venue-123' };

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(validateVenueId).toHaveBeenCalledWith('venue-123');
    });

    it('should continue to route handler on success', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'venue-123' };

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should handle UUID format venueId', async () => {
      mockRequest.user = {
        id: 'user-1',
        venueId: '550e8400-e29b-41d4-a716-446655440000'
      };

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(validateVenueId).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  // =============================================================================
  // requireTenant() - Authentication Errors
  // =============================================================================

  describe('requireTenant() - Authentication Errors', () => {
    it('should return 401 when user not authenticated', async () => {
      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should check authentication before tenant', async () => {
      mockRequest.user = null;

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(validateVenueId).not.toHaveBeenCalled();
    });

    it('should handle undefined user', async () => {
      mockRequest.user = undefined;

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  // =============================================================================
  // requireTenant() - Missing Tenant Errors
  // =============================================================================

  describe('requireTenant() - Missing Tenant Errors', () => {
    it('should return 403 when venueId missing', async () => {
      mockRequest.user = { id: 'user-1', role: 'admin' };

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Tenant information missing',
        message: 'User must be associated with a venue'
      });
    });

    it('should not validate when venueId missing', async () => {
      mockRequest.user = { id: 'user-1' };

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(validateVenueId).not.toHaveBeenCalled();
    });

    it('should handle null venueId', async () => {
      mockRequest.user = { id: 'user-1', venueId: null };

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should handle undefined venueId', async () => {
      mockRequest.user = { id: 'user-1', venueId: undefined };

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should handle empty string venueId', async () => {
      mockRequest.user = { id: 'user-1', venueId: '' };

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  // =============================================================================
  // requireTenant() - Validation Errors
  // =============================================================================

  describe('requireTenant() - Validation Errors', () => {
    it('should return 400 for invalid venueId format', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'invalid-id' };
      validateVenueId.mockImplementation(() => {
        throw new Error('Invalid venue ID format');
      });

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid tenant information',
        message: 'Invalid venue ID format'
      });
    });

    it('should include validation error message', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'bad-format' };
      validateVenueId.mockImplementation(() => {
        throw new Error('VenueId must be a valid UUID');
      });

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'VenueId must be a valid UUID'
        })
      );
    });

    it('should catch validateVenueId exceptions', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'test' };
      validateVenueId.mockImplementation(() => {
        throw new Error('Validation failed');
      });

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle malformed UUID', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'not-a-uuid' };
      validateVenueId.mockImplementation(() => {
        throw new Error('Invalid UUID');
      });

      const { requireTenant } = require('../../../src/middleware/tenant.middleware');
      await requireTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  // =============================================================================
  // optionalTenant() - Success Cases
  // =============================================================================

  describe('optionalTenant() - Success Cases', () => {
    it('should allow request without user', async () => {
      const { optionalTenant } = require('../../../src/middleware/tenant.middleware');
      await optionalTenant(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow request without venueId', async () => {
      mockRequest.user = { id: 'user-1', role: 'user' };

      const { optionalTenant } = require('../../../src/middleware/tenant.middleware');
      await optionalTenant(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should validate venueId when present', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'venue-123' };

      const { optionalTenant } = require('../../../src/middleware/tenant.middleware');
      await optionalTenant(mockRequest, mockReply);

      expect(validateVenueId).toHaveBeenCalledWith('venue-123');
    });

    it('should allow valid venueId', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'venue-123' };

      const { optionalTenant } = require('../../../src/middleware/tenant.middleware');
      await optionalTenant(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should not validate when user is null', async () => {
      mockRequest.user = null;

      const { optionalTenant } = require('../../../src/middleware/tenant.middleware');
      await optionalTenant(mockRequest, mockReply);

      expect(validateVenueId).not.toHaveBeenCalled();
    });

    it('should not validate when venueId is null', async () => {
      mockRequest.user = { id: 'user-1', venueId: null };

      const { optionalTenant } = require('../../../src/middleware/tenant.middleware');
      await optionalTenant(mockRequest, mockReply);

      expect(validateVenueId).not.toHaveBeenCalled();
    });

    it('should not validate when venueId is undefined', async () => {
      mockRequest.user = { id: 'user-1', venueId: undefined };

      const { optionalTenant } = require('../../../src/middleware/tenant.middleware');
      await optionalTenant(mockRequest, mockReply);

      expect(validateVenueId).not.toHaveBeenCalled();
    });

    it('should not validate when venueId is empty string', async () => {
      mockRequest.user = { id: 'user-1', venueId: '' };

      const { optionalTenant } = require('../../../src/middleware/tenant.middleware');
      await optionalTenant(mockRequest, mockReply);

      expect(validateVenueId).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // optionalTenant() - Validation Errors
  // =============================================================================

  describe('optionalTenant() - Validation Errors', () => {
    it('should return 400 for invalid venueId', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'invalid' };
      validateVenueId.mockImplementation(() => {
        throw new Error('Invalid venue ID');
      });

      const { optionalTenant } = require('../../../src/middleware/tenant.middleware');
      await optionalTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should include error message in response', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'bad-id' };
      validateVenueId.mockImplementation(() => {
        throw new Error('VenueId validation failed');
      });

      const { optionalTenant } = require('../../../src/middleware/tenant.middleware');
      await optionalTenant(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid tenant information',
        message: 'VenueId validation failed'
      });
    });

    it('should catch validation exceptions', async () => {
      mockRequest.user = { id: 'user-1', venueId: 'test' };
      validateVenueId.mockImplementation(() => {
        throw new Error('Validation error');
      });

      const { optionalTenant } = require('../../../src/middleware/tenant.middleware');
      await optionalTenant(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export requireTenant function', () => {
      const module = require('../../../src/middleware/tenant.middleware');

      expect(module.requireTenant).toBeDefined();
      expect(typeof module.requireTenant).toBe('function');
    });

    it('should export optionalTenant function', () => {
      const module = require('../../../src/middleware/tenant.middleware');

      expect(module.optionalTenant).toBeDefined();
      expect(typeof module.optionalTenant).toBe('function');
    });

    it('should be async functions', () => {
      const { requireTenant, optionalTenant } = require('../../../src/middleware/tenant.middleware');

      expect(requireTenant.constructor.name).toBe('AsyncFunction');
      expect(optionalTenant.constructor.name).toBe('AsyncFunction');
    });
  });
});
