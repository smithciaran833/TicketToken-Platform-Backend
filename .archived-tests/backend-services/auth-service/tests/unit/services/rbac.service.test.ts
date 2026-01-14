import { RBACService } from '../../../src/services/rbac.service';
import { AuthorizationError } from '../../../src/errors';

// Mock database
jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    orWhereNull: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    select: jest.fn(),
  })),
}));

import { db } from '../../../src/config/database';

describe('RBACService', () => {
  let service: RBACService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = db as jest.MockedFunction<typeof db>;
    service = new RBACService();
    jest.clearAllMocks();
  });

  describe('getUserPermissions', () => {
    const userId = 'user-123';
    const venueId = 'venue-456';

    it('should return customer permissions by default', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue([]),
      };
      mockDb.mockReturnValue(mockQuery);

      const permissions = await service.getUserPermissions(userId);

      expect(permissions).toContain('tickets:purchase');
      expect(permissions).toContain('tickets:view-own');
    });

    it('should return venue-specific permissions', async () => {
      const venueRoles = [
        { role: 'venue-manager', is_active: true }
      ];

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue(venueRoles),
      };
      mockDb.mockReturnValue(mockQuery);

      const permissions = await service.getUserPermissions(userId, venueId);

      expect(permissions).toContain('events:create');
      expect(permissions).toContain('events:update');
      expect(permissions).toContain('tickets:view');
    });

    it('should include wildcard permission for venue-owner', async () => {
      const venueRoles = [
        { role: 'venue-owner', is_active: true }
      ];

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue(venueRoles),
      };
      mockDb.mockReturnValue(mockQuery);

      const permissions = await service.getUserPermissions(userId, venueId);

      expect(permissions).toContain('*');
    });

    it('should combine multiple role permissions', async () => {
      const venueRoles = [
        { role: 'venue-manager', is_active: true },
        { role: 'box-office', is_active: true }
      ];

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue(venueRoles),
      };
      mockDb.mockReturnValue(mockQuery);

      const permissions = await service.getUserPermissions(userId, venueId);

      expect(permissions).toContain('events:create');
      expect(permissions).toContain('tickets:sell');
      expect(permissions).toContain('payments:process');
    });

    it('should handle door-staff role permissions', async () => {
      const venueRoles = [
        { role: 'door-staff', is_active: true }
      ];

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue(venueRoles),
      };
      mockDb.mockReturnValue(mockQuery);

      const permissions = await service.getUserPermissions(userId, venueId);

      expect(permissions).toContain('tickets:validate');
      expect(permissions).toContain('tickets:view');
    });
  });

  describe('checkPermission', () => {
    const userId = 'user-123';
    const venueId = 'venue-456';

    it('should return true for wildcard permission', async () => {
      const venueRoles = [
        { role: 'venue-owner', is_active: true }
      ];

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue(venueRoles),
      };
      mockDb.mockReturnValue(mockQuery);

      const hasPermission = await service.checkPermission(userId, 'any:permission', venueId);

      expect(hasPermission).toBe(true);
    });

    it('should return true when user has specific permission', async () => {
      const venueRoles = [
        { role: 'venue-manager', is_active: true }
      ];

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue(venueRoles),
      };
      mockDb.mockReturnValue(mockQuery);

      const hasPermission = await service.checkPermission(userId, 'events:create', venueId);

      expect(hasPermission).toBe(true);
    });

    it('should return false when user lacks permission', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue([]),
      };
      mockDb.mockReturnValue(mockQuery);

      const hasPermission = await service.checkPermission(userId, 'events:delete', venueId);

      expect(hasPermission).toBe(false);
    });

    it('should allow customer permissions without venue', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue([]),
      };
      mockDb.mockReturnValue(mockQuery);

      const hasPermission = await service.checkPermission(userId, 'tickets:purchase');

      expect(hasPermission).toBe(true);
    });
  });

  describe('requirePermission', () => {
    const userId = 'user-123';
    const venueId = 'venue-456';

    it('should not throw when user has permission', async () => {
      const venueRoles = [
        { role: 'venue-manager', is_active: true }
      ];

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue(venueRoles),
      };
      mockDb.mockReturnValue(mockQuery);

      await expect(
        service.requirePermission(userId, 'events:create', venueId)
      ).resolves.not.toThrow();
    });

    it('should throw AuthorizationError when user lacks permission', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue([]),
      };
      mockDb.mockReturnValue(mockQuery);

      await expect(
        service.requirePermission(userId, 'events:delete', venueId)
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw with correct error message', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue([]),
      };
      mockDb.mockReturnValue(mockQuery);

      try {
        await service.requirePermission(userId, 'events:delete', venueId);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthorizationError);
        expect((error as Error).message).toContain('events:delete');
      }
    });
  });

  describe('grantVenueRole', () => {
    const userId = 'user-123';
    const venueId = 'venue-456';
    const grantedBy = 'admin-789';
    const role = 'venue-manager';

    it('should grant new venue role', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue([{ role: 'venue-owner' }]),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue([1]),
      };
      mockDb.mockReturnValue(mockQuery);

      await service.grantVenueRole(userId, venueId, role, grantedBy);

      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: userId,
          venue_id: venueId,
          role: role,
          granted_by: grantedBy,
        })
      );
    });

    it('should grant role with expiration date', async () => {
      const expiresAt = new Date('2025-12-31');
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue([{ role: 'venue-owner' }]),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue([1]),
      };
      mockDb.mockReturnValue(mockQuery);

      await service.grantVenueRole(userId, venueId, role, grantedBy, expiresAt);

      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_at: expiresAt,
        })
      );
    });

    it('should update existing role expiration', async () => {
      const expiresAt = new Date('2025-12-31');
      const existingRole = { id: 'role-123', user_id: userId, role: role };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue([{ role: 'venue-owner' }]),
        first: jest.fn().mockResolvedValue(existingRole),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      await service.grantVenueRole(userId, venueId, role, grantedBy, expiresAt);

      expect(mockQuery.update).toHaveBeenCalledWith({ expires_at: expiresAt });
    });

    it('should throw error for invalid role', async () => {
      await expect(
        service.grantVenueRole(userId, venueId, 'invalid-role', grantedBy)
      ).rejects.toThrow('Invalid role: invalid-role');
    });

    it('should require roles:manage permission', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue([]),
      };
      mockDb.mockReturnValue(mockQuery);

      await expect(
        service.grantVenueRole(userId, venueId, role, grantedBy)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('revokeVenueRole', () => {
    const userId = 'user-123';
    const venueId = 'venue-456';
    const revokedBy = 'admin-789';
    const role = 'venue-manager';

    it('should revoke venue role', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue([{ role: 'venue-owner' }]),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      await service.revokeVenueRole(userId, venueId, role, revokedBy);

      expect(mockQuery.update).toHaveBeenCalledWith({ is_active: false });
    });

    it('should require roles:manage permission', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockResolvedValue([]),
      };
      mockDb.mockReturnValue(mockQuery);

      await expect(
        service.revokeVenueRole(userId, venueId, role, revokedBy)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('getUserVenueRoles', () => {
    const userId = 'user-123';

    it('should return active venue roles', async () => {
      const venueRoles = [
        { venue_id: 'venue-1', role: 'venue-manager', granted_at: new Date(), expires_at: null },
        { venue_id: 'venue-2', role: 'box-office', granted_at: new Date(), expires_at: null },
      ];

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(venueRoles),
      };
      mockDb.mockReturnValue(mockQuery);

      const roles = await service.getUserVenueRoles(userId);

      expect(roles).toHaveLength(2);
      expect(roles[0].venue_id).toBe('venue-1');
      expect(roles[1].role).toBe('box-office');
    });

    it('should return empty array when no roles', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orWhereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]),
      };
      mockDb.mockReturnValue(mockQuery);

      const roles = await service.getUserVenueRoles(userId);

      expect(roles).toHaveLength(0);
    });
  });
});
