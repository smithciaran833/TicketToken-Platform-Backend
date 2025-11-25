import { AuthenticatedUser } from '../types/fastify';

/**
 * User roles in the system
 */
export enum UserRole {
  ADMIN = 'admin',
  VENUE_OWNER = 'venue_owner',
  CUSTOMER = 'customer',
  SUPPORT = 'support',
}

/**
 * Type guard to check if a user object is properly authenticated
 */
export function isAuthenticated(user: unknown): user is AuthenticatedUser {
  return (
    typeof user === 'object' &&
    user !== null &&
    'id' in user &&
    'tenantId' in user &&
    'email' in user &&
    'role' in user &&
    typeof (user as AuthenticatedUser).id === 'string' &&
    typeof (user as AuthenticatedUser).tenantId === 'string' &&
    typeof (user as AuthenticatedUser).email === 'string' &&
    typeof (user as AuthenticatedUser).role === 'string'
  );
}

/**
 * Type guard to check if user has admin role
 */
export function isAdmin(user: AuthenticatedUser): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
}

export function isSuperAdmin(user: AuthenticatedUser): boolean {
  return user.role === 'SUPER_ADMIN';
}

/**
 * Type guard to check if user has venue owner role
 */
export function isVenueOwner(user: AuthenticatedUser): boolean {
  return user.role === UserRole.VENUE_OWNER;
}

/**
 * Type guard to check if user has customer role
 */
export function isCustomer(user: AuthenticatedUser): boolean {
  return user.role === UserRole.CUSTOMER;
}

/**
 * Type guard to check if user has support role
 */
export function isSupport(user: AuthenticatedUser): boolean {
  return user.role === UserRole.SUPPORT;
}

/**
 * Type guard to check if user has any of the specified roles
 */
export function hasAnyRole(
  user: AuthenticatedUser,
  roles: UserRole[]
): boolean {
  return roles.includes(user.role as UserRole);
}

/**
 * Type guard to check if user has specific permission
 */
export function hasPermission(
  user: AuthenticatedUser,
  permission: string
): boolean {
  if (!user.permissions || !Array.isArray(user.permissions)) {
    return false;
  }
  return user.permissions.includes(permission);
}

/**
 * Type guard to check if user has all specified permissions
 */
export function hasAllPermissions(
  user: AuthenticatedUser,
  permissions: string[]
): boolean {
  if (!user.permissions || !Array.isArray(user.permissions)) {
    return false;
  }
  return permissions.every((permission) =>
    user.permissions!.includes(permission)
  );
}

/**
 * Type guard to check if user has any of the specified permissions
 */
export function hasAnyPermission(
  user: AuthenticatedUser,
  permissions: string[]
): boolean {
  if (!user.permissions || !Array.isArray(user.permissions)) {
    return false;
  }
  return permissions.some((permission) =>
    user.permissions!.includes(permission)
  );
}

/**
 * Check if user can access orders for a specific tenant
 */
export function canAccessTenant(
  user: AuthenticatedUser,
  tenantId: string
): boolean {
  // Admins can access all tenants
  if (isAdmin(user)) {
    return true;
  }

  // Support can access all tenants
  if (isSupport(user)) {
    return true;
  }

  // Others can only access their own tenant
  return user.tenantId === tenantId;
}

/**
 * Check if user can modify orders
 */
export function canModifyOrders(user: AuthenticatedUser): boolean {
  return hasAnyRole(user, [
    UserRole.ADMIN,
    UserRole.VENUE_OWNER,
    UserRole.SUPPORT,
  ]);
}

/**
 * Check if user can refund orders
 */
export function canRefundOrders(user: AuthenticatedUser): boolean {
  return hasAnyRole(user, [UserRole.ADMIN, UserRole.VENUE_OWNER]);
}

/**
 * Check if user can view all orders (not just their own)
 */
export function canViewAllOrders(user: AuthenticatedUser): boolean {
  return hasAnyRole(user, [UserRole.ADMIN, UserRole.VENUE_OWNER, UserRole.SUPPORT]);
}

/**
 * Assert that user is authenticated, throw error if not
 */
export function assertAuthenticated(
  user: unknown
): asserts user is AuthenticatedUser {
  if (!isAuthenticated(user)) {
    throw new Error('User is not properly authenticated');
  }
}

/**
 * Assert that user has required role, throw error if not
 */
export function assertRole(
  user: AuthenticatedUser,
  roles: UserRole | UserRole[]
): void {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  if (!hasAnyRole(user, roleArray)) {
    throw new Error(
      `User does not have required role(s): ${roleArray.join(', ')}`
    );
  }
}

/**
 * Assert that user has required permission, throw error if not
 */
export function assertPermission(
  user: AuthenticatedUser,
  permission: string
): void {
  if (!hasPermission(user, permission)) {
    throw new Error(`User does not have required permission: ${permission}`);
  }
}
