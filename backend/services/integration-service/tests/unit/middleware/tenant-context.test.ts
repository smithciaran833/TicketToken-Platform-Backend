// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  setTenantContext,
  tenantContext,
  requireTenantContext,
  requireVenueContext,
} from '../../../src/middleware/tenant-context';
import { logger } from '../../../src/utils/logger';

describe('tenant-context middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockCode: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSend = jest.fn().mockReturnThis();
    mockCode = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      code: mockCode,
    };

    mockRequest = {
      headers: {},
      id: 'test-request-id',
      tenantId: undefined,
      venueId: undefined,
    };
  });

  describe('setTenantContext', () => {
    it('should extract tenant ID from user object', async () => {
      (mockRequest as any).user = { tenantId: 'tenant-123' };

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenantId).toBe('tenant-123');
    });

    it('should extract tenant ID from header', async () => {
      mockRequest.headers = { 'x-tenant-id': 'tenant-456' };

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenantId).toBe('tenant-456');
    });

    it('should prefer header over user tenant ID', async () => {
      (mockRequest as any).user = { tenantId: 'tenant-from-user' };
      mockRequest.headers = { 'x-tenant-id': 'tenant-from-header' };

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenantId).toBe('tenant-from-header');
    });

    it('should extract venue ID from user object', async () => {
      (mockRequest as any).user = { venueId: 'venue-123' };

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.venueId).toBe('venue-123');
    });

    it('should extract venue ID from header', async () => {
      mockRequest.headers = { 'x-venue-id': 'venue-456' };

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.venueId).toBe('venue-456');
    });

    it('should prefer user venue ID over header', async () => {
      mockRequest.headers = { 'x-venue-id': 'venue-from-header' };
      (mockRequest as any).user = { venueId: 'venue-from-user' };

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.venueId).toBe('venue-from-user');
    });

    it('should set both tenant and venue IDs', async () => {
      (mockRequest as any).user = { tenantId: 'tenant-123', venueId: 'venue-456' };

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenantId).toBe('tenant-123');
      expect(mockRequest.venueId).toBe('venue-456');
    });

    it('should log when context is set', async () => {
      mockRequest.headers = {
        'x-tenant-id': 'tenant-123',
        'x-venue-id': 'venue-456',
      };

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'Tenant context set',
        expect.objectContaining({
          tenantId: 'tenant-123',
          venueId: 'venue-456',
          requestId: 'test-request-id',
        })
      );
    });

    it('should not log when no context is set', async () => {
      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      (mockRequest as any).user = {
        get tenantId() {
          throw new Error('Test error');
        },
      };

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to set tenant context',
        expect.objectContaining({
          error: 'Test error',
          requestId: 'test-request-id',
        })
      );
    });

    it('should handle non-string header values', async () => {
      mockRequest.headers = {
        'x-tenant-id': ['tenant-123', 'tenant-456'] as any,
      };

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenantId).toBeUndefined();
    });

    it('should handle undefined user', async () => {
      (mockRequest as any).user = undefined;

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenantId).toBeUndefined();
      expect(mockRequest.venueId).toBeUndefined();
    });

    it('should handle null user', async () => {
      (mockRequest as any).user = null;

      await setTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenantId).toBeUndefined();
      expect(mockRequest.venueId).toBeUndefined();
    });
  });

  describe('tenantContext', () => {
    it('should call setTenantContext and invoke done', (done) => {
      mockRequest.headers = { 'x-tenant-id': 'tenant-123' };

      tenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        () => {
          expect(mockRequest.tenantId).toBe('tenant-123');
          done();
        }
      );
    });

    it('should invoke done on error without failing', (done) => {
      (mockRequest as any).user = {
        get tenantId() {
          throw new Error('Test error');
        },
      };

      tenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        () => {
          expect(logger.error).toHaveBeenCalled();
          done();
        }
      );
    });
  });

  describe('requireTenantContext', () => {
    it('should pass when tenant ID is present from header', async () => {
      mockRequest.headers = { 'x-tenant-id': 'tenant-123' };

      await requireTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenantId).toBe('tenant-123');
      expect(mockCode).not.toHaveBeenCalled();
    });

    it('should pass when tenant ID is present from user', async () => {
      (mockRequest as any).user = { tenantId: 'tenant-456' };

      await requireTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenantId).toBe('tenant-456');
      expect(mockCode).not.toHaveBeenCalled();
    });

    it('should return 400 when tenant ID is missing', async () => {
      await requireTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Tenant context is required',
        statusCode: 400,
      });
    });

    it('should return 400 when tenant ID is undefined', async () => {
      mockRequest.tenantId = undefined;

      await requireTenantContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
    });
  });

  describe('requireVenueContext', () => {
    it('should pass when venue ID is present from header', async () => {
      mockRequest.headers = { 'x-venue-id': 'venue-123' };

      await requireVenueContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.venueId).toBe('venue-123');
      expect(mockCode).not.toHaveBeenCalled();
    });

    it('should pass when venue ID is present from user', async () => {
      (mockRequest as any).user = { venueId: 'venue-456' };

      await requireVenueContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.venueId).toBe('venue-456');
      expect(mockCode).not.toHaveBeenCalled();
    });

    it('should return 400 when venue ID is missing', async () => {
      await requireVenueContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Venue context is required',
        statusCode: 400,
      });
    });

    it('should return 400 when venue ID is undefined', async () => {
      mockRequest.venueId = undefined;

      await requireVenueContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
    });

    it('should set tenant context before checking venue', async () => {
      mockRequest.headers = { 'x-venue-id': 'venue-123' };

      await requireVenueContext(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.venueId).toBe('venue-123');
    });
  });
});
