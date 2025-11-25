// =============================================================================
// TEST SUITE - rbac.ts
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { requirePermission, Permissions } from '../../../src/middleware/rbac';

describe('rbac middleware', () => {
  let mockRequest: any;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      user: null,
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  describe('requirePermission', () => {
    it('should return 401 if no user', () => {
      mockRequest.user = null;

      const middleware = requirePermission('ticket:read');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should allow user with admin:all permission', () => {
      mockRequest.user = { permissions: ['admin:all'] };

      const middleware = requirePermission('ticket:read');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow user with exact permission', () => {
      mockRequest.user = { permissions: ['ticket:read'] };

      const middleware = requirePermission('ticket:read');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow user with wildcard permission', () => {
      mockRequest.user = { permissions: ['ticket:*'] };

      const middleware = requirePermission('ticket:read');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 if permission missing', () => {
      mockRequest.user = { permissions: ['ticket:read'] };

      const middleware = requirePermission('ticket:delete');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        required: ['ticket:delete'],
      });
    });

    it('should handle multiple required permissions (OR logic)', () => {
      mockRequest.user = { permissions: ['ticket:read'] };

      const middleware = requirePermission(['ticket:read', 'ticket:write']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require at least one permission from array', () => {
      mockRequest.user = { permissions: ['other:permission'] };

      const middleware = requirePermission(['ticket:read', 'ticket:write']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    it('should handle user without permissions array', () => {
      mockRequest.user = { id: 'user-123' };

      const middleware = requirePermission('ticket:read');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    it('should handle empty permissions array', () => {
      mockRequest.user = { permissions: [] };

      const middleware = requirePermission('ticket:read');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    it('should match wildcard for different actions', () => {
      mockRequest.user = { permissions: ['venue:*'] };

      const middleware = requirePermission('venue:create');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should not match partial wildcards', () => {
      mockRequest.user = { permissions: ['ticket:*'] };

      const middleware = requirePermission('purchase:create');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    it('should handle permission as string', () => {
      mockRequest.user = { permissions: ['ticket:read'] };

      const middleware = requirePermission('ticket:read');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle permission as array', () => {
      mockRequest.user = { permissions: ['ticket:read'] };

      const middleware = requirePermission(['ticket:read']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return required permissions in error', () => {
      mockRequest.user = { permissions: [] };

      const middleware = requirePermission(['permission1', 'permission2']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const errorCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(errorCall.required).toEqual(['permission1', 'permission2']);
    });

    it('should handle case-sensitive permissions', () => {
      mockRequest.user = { permissions: ['Ticket:Read'] };

      const middleware = requirePermission('ticket:read');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Permissions constants', () => {
    it('should have ticket permissions', () => {
      expect(Permissions.TICKET_CREATE).toBe('ticket:create');
      expect(Permissions.TICKET_READ).toBe('ticket:read');
      expect(Permissions.TICKET_UPDATE).toBe('ticket:update');
      expect(Permissions.TICKET_DELETE).toBe('ticket:delete');
      expect(Permissions.TICKET_TRANSFER).toBe('ticket:transfer');
    });

    it('should have purchase permissions', () => {
      expect(Permissions.PURCHASE_CREATE).toBe('purchase:create');
      expect(Permissions.PURCHASE_REFUND).toBe('purchase:refund');
    });

    it('should have admin permissions', () => {
      expect(Permissions.ADMIN_FULL).toBe('admin:*');
      expect(Permissions.ADMIN_ALL).toBe('admin:all');
    });

    it('should have venue permissions', () => {
      expect(Permissions.VENUE_MANAGE).toBe('venue:manage');
      expect(Permissions.VENUE_ALL).toBe('venue:*');
    });

    it('should be immutable', () => {
      const original = Permissions.TICKET_CREATE;
      (Permissions as any).TICKET_CREATE = 'modified';
      
      expect(Permissions.TICKET_CREATE).toBe(original);
    });
  });
});
