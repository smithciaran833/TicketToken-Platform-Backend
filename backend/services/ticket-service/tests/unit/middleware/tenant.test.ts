import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: jest.fn(),
  },
}));

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

jest.mock('../../../src/utils/errors', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
  ValidationError: class ValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
}));

import {
  tenantMiddleware,
  optionalTenantMiddleware,
  getTenantId,
  validateResourceTenant,
} from '../../../src/middleware/tenant';
import { DatabaseService } from '../../../src/services/databaseService';
import { UnauthorizedError, ValidationError } from '../../../src/utils/errors';

describe('Tenant Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;

  const validUUID = '123e4567-e89b-42d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();

    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      status: mockStatus,
      send: mockSend,
    };

    mockRequest = {
      url: '/api/test',
      method: 'GET',
      headers: {},
      body: {},
    } as any;

    (DatabaseService.query as jest.Mock).mockResolvedValue({ rows: [] });
  });

  describe('tenantMiddleware', () => {
    it('should throw UnauthorizedError if no user on request', async () => {
      (mockRequest as any).user = undefined;

      await expect(
        tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError if user has no tenantId', async () => {
      (mockRequest as any).user = { id: 'user-123' };

      await expect(
        tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw ValidationError for invalid UUID format', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        tenantId: 'invalid-uuid',
      };

      await expect(
        tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ValidationError);
    });

    it('should set tenantId on request from JWT tenantId', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        tenantId: validUUID,
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBe(validUUID);
    });

    it('should set tenantId on request from JWT tenant_id', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        tenant_id: validUUID,
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBe(validUUID);
    });

    it('should call setRLSContext with tenant ID', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        tenantId: validUUID,
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(DatabaseService.query).toHaveBeenCalledWith(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        [validUUID]
      );
    });

    it('should ignore mismatched header tenant ID', async () => {
      const differentUUID = '987fcdeb-51a2-43d7-9012-345678901234';
      (mockRequest as any).user = {
        id: 'user-123',
        tenantId: validUUID,
      };
      mockRequest.headers = { 'x-tenant-id': differentUUID };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBe(validUUID);
    });

    it('should ignore mismatched body tenant ID', async () => {
      const differentUUID = '987fcdeb-51a2-43d7-9012-345678901234';
      (mockRequest as any).user = {
        id: 'user-123',
        tenantId: validUUID,
      };
      mockRequest.body = { tenantId: differentUUID };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBe(validUUID);
    });

    it('should not fail if RLS context setting fails', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        tenantId: validUUID,
      };

      (DatabaseService.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBe(validUUID);
    });
  });

  describe('optionalTenantMiddleware', () => {
    it('should not throw if no user on request', async () => {
      (mockRequest as any).user = undefined;

      await expect(
        optionalTenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should set tenant if user is authenticated with valid tenant', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        tenantId: validUUID,
      };

      await optionalTenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBe(validUUID);
    });

    it('should not set tenant if user has invalid UUID', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        tenantId: 'invalid-uuid',
      };

      await optionalTenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBeUndefined();
    });

    it('should not set tenant if user has no tenant ID', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
      };

      await optionalTenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBeUndefined();
    });

    it('should not fail if RLS context setting fails', async () => {
      (mockRequest as any).user = {
        id: 'user-123',
        tenantId: validUUID,
      };

      (DatabaseService.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      await optionalTenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockRequest as any).tenantId).toBe(validUUID);
    });
  });

  describe('getTenantId', () => {
    it('should return tenant ID from request', () => {
      (mockRequest as any).tenantId = validUUID;

      const result = getTenantId(mockRequest as FastifyRequest);

      expect(result).toBe(validUUID);
    });

    it('should throw UnauthorizedError if no tenant ID', () => {
      (mockRequest as any).tenantId = undefined;

      expect(() => getTenantId(mockRequest as FastifyRequest)).toThrow(UnauthorizedError);
    });

    it('should throw ValidationError for invalid UUID', () => {
      (mockRequest as any).tenantId = 'invalid-uuid';

      expect(() => getTenantId(mockRequest as FastifyRequest)).toThrow(ValidationError);
    });
  });

  describe('validateResourceTenant', () => {
    it('should not throw for matching tenant IDs', () => {
      expect(() => {
        validateResourceTenant(validUUID, validUUID, 'ticket');
      }).not.toThrow();
    });

    it('should throw Error for mismatched tenant IDs', () => {
      const differentUUID = '987fcdeb-51a2-43d7-9012-345678901234';

      expect(() => {
        validateResourceTenant(validUUID, differentUUID, 'ticket');
      }).toThrow('ticket not found');
    });

    it('should use default resource type in error message', () => {
      const differentUUID = '987fcdeb-51a2-43d7-9012-345678901234';

      expect(() => {
        validateResourceTenant(validUUID, differentUUID);
      }).toThrow('resource not found');
    });
  });
});
