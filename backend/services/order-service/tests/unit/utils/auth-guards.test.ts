import {
  UserRole,
  isAuthenticated,
  isAdmin,
  isVenueOwner,
  isCustomer,
  isSupport,
  hasAnyRole,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  canAccessTenant,
  canModifyOrders,
  canRefundOrders,
  canViewAllOrders,
  assertAuthenticated,
  assertRole,
  assertPermission,
} from '../../../src/utils/auth-guards';
import { AuthenticatedUser } from '../../../src/types/fastify';

describe('Auth Guards', () => {
  const validUser: AuthenticatedUser = {
    id: 'user-123',
    tenantId: 'tenant-456',
    email: 'user@example.com',
    role: UserRole.CUSTOMER,
  };

  const adminUser: AuthenticatedUser = {
    id: 'admin-123',
    tenantId: 'tenant-456',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    permissions: ['read', 'write', 'delete'],
  };

  const venueOwnerUser: AuthenticatedUser = {
    id: 'venue-123',
    tenantId: 'tenant-456',
    email: 'owner@example.com',
    role: UserRole.VENUE_OWNER,
    permissions: ['read', 'write'],
  };

  const supportUser: AuthenticatedUser = {
    id: 'support-123',
    tenantId: 'tenant-456',
    email: 'support@example.com',
    role: UserRole.SUPPORT,
    permissions: ['read'],
  };

  describe('User Roles Enum', () => {
    it('should have all required roles', () => {
      expect(UserRole.ADMIN).toBe('admin');
      expect(UserRole.VENUE_OWNER).toBe('venue_owner');
      expect(UserRole.CUSTOMER).toBe('customer');
      expect(UserRole.SUPPORT).toBe('support');
    });
  });

  describe('isAuthenticated', () => {
    it('should return true for valid authenticated user', () => {
      expect(isAuthenticated(validUser)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isAuthenticated(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAuthenticated(undefined)).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(isAuthenticated('string')).toBe(false);
      expect(isAuthenticated(123)).toBe(false);
      expect(isAuthenticated(true)).toBe(false);
    });

    it('should return false for object missing id', () => {
      expect(isAuthenticated({ tenantId: 'test', email: 'test@test.com', role: 'customer' })).toBe(false);
    });

    it('should return false for object missing tenantId', () => {
      expect(isAuthenticated({ id: 'test', email: 'test@test.com', role: 'customer' })).toBe(false);
    });

    it('should return false for object missing email', () => {
      expect(isAuthenticated({ id: 'test', tenantId: 'test', role: 'customer' })).toBe(false);
    });

    it('should return false for object missing role', () => {
      expect(isAuthenticated({ id: 'test', tenantId: 'test', email: 'test@test.com' })).toBe(false);
    });

    it('should return false when id is not a string', () => {
      expect(isAuthenticated({ id: 123, tenantId: 'test', email: 'test@test.com', role: 'customer' })).toBe(false);
    });

    it('should return false when tenantId is not a string', () => {
      expect(isAuthenticated({ id: 'test', tenantId: 123, email: 'test@test.com', role: ' customer' })).toBe(false);
    });

    it('should return false when email is not a string', () => {
      expect(isAuthenticated({ id: 'test', tenantId: 'test', email: 123, role: 'customer' })).toBe(false);
    });

    it('should return false when role is not a string', () => {
      expect(isAuthenticated({ id: 'test', tenantId: 'test', email: 'test@test.com', role: 123 })).toBe(false);
    });

    it('should return true even with additional properties', () => {
      const userWithExtra = { ...validUser, extraProp: 'value' };
      expect(isAuthenticated(userWithExtra)).toBe(true);
    });
  });

  describe('Role Checking Functions', () => {
    describe('isAdmin', () => {
      it('should return true for admin user', () => {
        expect(isAdmin(adminUser)).toBe(true);
      });

      it('should return false for non-admin user', () => {
        expect(isAdmin(validUser)).toBe(false);
        expect(isAdmin(venueOwnerUser)).toBe(false);
        expect(isAdmin(supportUser)).toBe(false);
      });
    });

    describe('isVenueOwner', () => {
      it('should return true for venue owner user', () => {
        expect(isVenueOwner(venueOwnerUser)).toBe(true);
      });

      it('should return false for non-venue-owner user', () => {
        expect(isVenueOwner(validUser)).toBe(false);
        expect(isVenueOwner(adminUser)).toBe(false);
        expect(isVenueOwner(supportUser)).toBe(false);
      });
    });

    describe('isCustomer', () => {
      it('should return true for customer user', () => {
        expect(isCustomer(validUser)).toBe(true);
      });

      it('should return false for non-customer user', () => {
        expect(isCustomer(adminUser)).toBe(false);
        expect(isCustomer(venueOwnerUser)).toBe(false);
        expect(isCustomer(supportUser)).toBe(false);
      });
    });

    describe('isSupport', () => {
      it('should return true for support user', () => {
        expect(isSupport(supportUser)).toBe(true);
      });

      it('should return false for non-support user', () => {
        expect(isSupport(validUser)).toBe(false);
        expect(isSupport(adminUser)).toBe(false);
        expect(isSupport(venueOwnerUser)).toBe(false);
      });
    });
  });

  describe('hasAnyRole', () => {
    it('should return true when user has one of specified roles', () => {
      expect(hasAnyRole(adminUser, [UserRole.ADMIN, UserRole.VENUE_OWNER])).toBe(true);
      expect(hasAnyRole(venueOwnerUser, [UserRole.VENUE_OWNER, UserRole.CUSTOMER])).toBe(true);
    });

    it('should return false when user does not have any of specified roles', () => {
      expect(hasAnyRole(validUser, [UserRole.ADMIN, UserRole.SUPPORT])).toBe(false);
    });

    it('should return true when checking single role in array', () => {
      expect(hasAnyRole(adminUser, [UserRole.ADMIN])).toBe(true);
    });

    it('should return false with empty roles array', () => {
      expect(hasAnyRole(adminUser, [])).toBe(false);
    });
  });

  describe('Permission Checking Functions', () => {
    describe('hasPermission', () => {
      it('should return true when user has the permission', () => {
        expect(hasPermission(adminUser, 'read')).toBe(true);
        expect(hasPermission(adminUser, 'write')).toBe(true);
        expect(hasPermission(adminUser, 'delete')).toBe(true);
      });

      it('should return false when user does not have the permission', () => {
        expect(hasPermission(adminUser, 'execute')).toBe(false);
      });

      it('should return false when permissions is undefined', () => {
        expect(hasPermission(validUser, 'read')).toBe(false);
      });

      it('should return false when permissions is not an array', () => {
        const userWithInvalidPerms = { ...validUser, permissions: 'not-an-array' as any };
        expect(hasPermission(userWithInvalidPerms, 'read')).toBe(false);
      });

      it('should return false when permissions is empty array', () => {
        const userWithNoPerms = { ...validUser, permissions: [] };
        expect(hasPermission(userWithNoPerms, 'read')).toBe(false);
      });
    });

    describe('hasAllPermissions', () => {
      it('should return true when user has all specified permissions', () => {
        expect(hasAllPermissions(adminUser, ['read', 'write'])).toBe(true);
        expect(hasAllPermissions(adminUser, ['read', 'write', 'delete'])).toBe(true);
      });

      it('should return false when user is missing one permission', () => {
        expect(hasAllPermissions(adminUser, ['read', 'write', 'execute'])).toBe(false);
      });

      it('should return true with empty permissions array', () => {
        expect(hasAllPermissions(adminUser, [])).toBe(true);
      });

      it('should return false when user permissions is undefined', () => {
        expect(hasAllPermissions(validUser, ['read'])).toBe(false);
      });
    });

    describe('hasAnyPermission', () => {
      it('should return true when user has at least one permission', () => {
        expect(hasAnyPermission(adminUser, ['read', 'execute'])).toBe(true);
        expect(hasAnyPermission(adminUser, ['execute', 'write'])).toBe(true);
      });

      it('should return false when user has none of the permissions', () => {
        expect(hasAnyPermission(adminUser, ['execute', 'admin'])).toBe(false);
      });

      it('should return false with empty permissions array', () => {
        expect(hasAnyPermission(adminUser, [])).toBe(false);
      });

      it('should return false when user permissions is undefined', () => {
        expect(hasAnyPermission(validUser, ['read'])).toBe(false);
      });
    });
  });

  describe('canAccessTenant', () => {
    it('should return true when admin accesses any tenant', () => {
      expect(canAccessTenant(adminUser, 'any-tenant-id')).toBe(true);
      expect(canAccessTenant(adminUser, 'different-tenant')).toBe(true);
    });

    it('should return true when support accesses any tenant', () => {
      expect(canAccessTenant(supportUser, 'any-tenant-id')).toBe(true);
      expect(canAccessTenant(supportUser, 'different-tenant')).toBe(true);
    });

    it('should return true when user accesses own tenant', () => {
      expect(canAccessTenant(validUser, 'tenant-456')).toBe(true);
      expect(canAccessTenant(venueOwnerUser, 'tenant-456')).toBe(true);
    });

    it('should return false when non-admin/support accesses different tenant', () => {
      expect(canAccessTenant(validUser, 'different-tenant')).toBe(false);
      expect(canAccessTenant(venueOwnerUser, 'different-tenant')).toBe(false);
    });
  });

  describe('canModifyOrders', () => {
    it('should return true for admin', () => {
      expect(canModifyOrders(adminUser)).toBe(true);
    });

    it('should return true for venue owner', () => {
      expect(canModifyOrders(venueOwnerUser)).toBe(true);
    });

    it('should return true for support', () => {
      expect(canModifyOrders(supportUser)).toBe(true);
    });

    it('should return false for customer', () => {
      expect(canModifyOrders(validUser)).toBe(false);
    });
  });

  describe('canRefundOrders', () => {
    it('should return true for admin', () => {
      expect(canRefundOrders(adminUser)).toBe(true);
    });

    it('should return true for venue owner', () => {
      expect(canRefundOrders(venueOwnerUser)).toBe(true);
    });

    it('should return false for support', () => {
      expect(canRefundOrders(supportUser)).toBe(false);
    });

    it('should return false for customer', () => {
      expect(canRefundOrders(validUser)).toBe(false);
    });
  });

  describe('canViewAllOrders', () => {
    it('should return true for admin', () => {
      expect(canViewAllOrders(adminUser)).toBe(true);
    });

    it('should return true for venue owner', () => {
      expect(canViewAllOrders(venueOwnerUser)).toBe(true);
    });

    it('should return true for support', () => {
      expect(canViewAllOrders(supportUser)).toBe(true);
    });

    it('should return false for customer', () => {
      expect(canViewAllOrders(validUser)).toBe(false);
    });
  });

  describe('Assertion Functions', () => {
    describe('assertAuthenticated', () => {
      it('should not throw for valid authenticated user', () => {
        expect(() => assertAuthenticated(validUser)).not.toThrow();
      });

      it('should throw for invalid user', () => {
        expect(() => assertAuthenticated(null)).toThrow('User is not properly authenticated');
        expect(() => assertAuthenticated(undefined)).toThrow('User is not properly authenticated');
        expect(() => assertAuthenticated({})).toThrow('User is not properly authenticated');
      });

      it('should throw for incomplete user object', () => {
        expect(() => assertAuthenticated({ id: 'test' })).toThrow('User is not properly authenticated');
      });
    });

    describe('assertRole', () => {
      it('should not throw when user has single required role', () => {
        expect(() => assertRole(adminUser, UserRole.ADMIN)).not.toThrow();
      });

      it('should not throw when user has one of multiple required roles', () => {
        expect(() => assertRole(adminUser, [UserRole.ADMIN, UserRole.VENUE_OWNER])).not.toThrow();
        expect(() => assertRole(venueOwnerUser, [UserRole.ADMIN, UserRole.VENUE_OWNER])).not.toThrow();
      });

      it('should throw when user does not have required role', () => {
        expect(() => assertRole(validUser, UserRole.ADMIN)).toThrow(
          'User does not have required role(s): admin'
        );
      });

      it('should throw when user does not have any of multiple required roles', () => {
        expect(() => assertRole(validUser, [UserRole.ADMIN, UserRole.SUPPORT])).toThrow(
          'User does not have required role(s): admin, support'
        );
      });
    });

    describe('assertPermission', () => {
      it('should not throw when user has permission', () => {
        expect(() => assertPermission(adminUser, 'read')).not.toThrow();
        expect(() => assertPermission(adminUser, 'write')).not.toThrow();
      });

      it('should throw when user does not have permission', () => {
        expect(() => assertPermission(adminUser, 'execute')).toThrow(
          'User does not have required permission: execute'
        );
      });

      it('should throw when user has no permissions', () => {
        expect(() => assertPermission(validUser, 'read')).toThrow(
          'User does not have required permission: read'
        );
      });
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle user with multiple roles correctly', () => {
      const multiRoleUser: AuthenticatedUser = {
        ...validUser,
        role: UserRole.ADMIN,
      };

      expect(isAdmin(multiRoleUser)).toBe(true);
      expect(canModifyOrders(multiRoleUser)).toBe(true);
      expect(canRefundOrders(multiRoleUser)).toBe(true);
      expect(canAccessTenant(multiRoleUser, 'any-tenant')).toBe(true);
    });

    it('should handle user with complex permissions', () => {
      const complexUser: AuthenticatedUser = {
        ...validUser,
        permissions: ['orders:read', 'orders:write', 'users:read', 'reports:view'],
      };

      expect(hasPermission(complexUser, 'orders:read')).toBe(true);
      expect(hasPermission(complexUser, 'orders:write')).toBe(true);
      expect(hasAllPermissions(complexUser, ['orders:read', 'orders:write'])).toBe(true);
      expect(hasAnyPermission(complexUser, ['orders:delete', 'orders:read'])).toBe(true);
      expect(hasPermission(complexUser, 'orders:delete')).toBe(false);
    });

    it('should properly check venue owner capabilities', () => {
      expect(isVenueOwner(venueOwnerUser)).toBe(true);
      expect(canModifyOrders(venueOwnerUser)).toBe(true);
      expect(canRefundOrders(venueOwnerUser)).toBe(true);
      expect(canViewAllOrders(venueOwnerUser)).toBe(true);
      expect(canAccessTenant(venueOwnerUser, venueOwnerUser.tenantId)).toBe(true);
      expect(canAccessTenant(venueOwnerUser, 'different-tenant')).toBe(false);
    });

    it('should properly check support capabilities', () => {
      expect(isSupport(supportUser)).toBe(true);
      expect(canModifyOrders(supportUser)).toBe(true);
      expect(canRefundOrders(supportUser)).toBe(false);
      expect(canViewAllOrders(supportUser)).toBe(true);
      expect(canAccessTenant(supportUser, 'any-tenant')).toBe(true);
    });

    it('should properly check customer limitations', () => {
      expect(isCustomer(validUser)).toBe(true);
      expect(canModifyOrders(validUser)).toBe(false);
      expect(canRefundOrders(validUser)).toBe(false);
      expect(canViewAllOrders(validUser)).toBe(false);
      expect(canAccessTenant(validUser, validUser.tenantId)).toBe(true);
      expect(canAccessTenant(validUser, 'different-tenant')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle user with null permissions', () => {
      const userWithNullPerms = { ...validUser, permissions: null as any };
      expect(hasPermission(userWithNullPerms, 'read')).toBe(false);
      expect(hasAllPermissions(userWithNullPerms, ['read'])).toBe(false);
      expect(hasAnyPermission(userWithNullPerms, ['read'])).toBe(false);
    });

    it('should handle empty string in role checks', () => {
      const emptyRoleUser = { ...validUser, role: '' };
      expect(isAdmin(emptyRoleUser)).toBe(false);
      expect(isCustomer(emptyRoleUser)).toBe(false);
    });

    it('should handle case-sensitive role matching', () => {
      const uppercaseRoleUser = { ...validUser, role: 'ADMIN' };
      expect(isAdmin(uppercaseRoleUser)).toBe(false);
    });

    it('should handle permission with special characters', () => {
      const specialPermsUser: AuthenticatedUser = {
        ...validUser,
        permissions: ['orders:*', 'users:read:self', 'reports.view.all'],
      };

      expect(hasPermission(specialPermsUser, 'orders:*')).toBe(true);
      expect(hasPermission(specialPermsUser, 'users:read:self')).toBe(true);
      expect(hasPermission(specialPermsUser, 'reports.view.all')).toBe(true);
    });
  });
});
