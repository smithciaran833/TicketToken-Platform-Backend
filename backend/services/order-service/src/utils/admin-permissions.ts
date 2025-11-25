import { AdminRole, AdminPermissions, ROLE_PERMISSIONS, AdminOverrideType } from '../types/admin.types';

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: AdminRole, permission: keyof AdminPermissions): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions[permission];
}

/**
 * Check if a role can perform a specific override type
 */
export function canPerformOverride(role: AdminRole, overrideType: AdminOverrideType): boolean {
  const requiresHighLevel = [
    AdminOverrideType.ADJUST_PRICE,
    AdminOverrideType.MANUAL_DISCOUNT
  ];

  const requiresManagerLevel = [
    AdminOverrideType.FORCE_CONFIRM,
    AdminOverrideType.FORCE_CANCEL,
    AdminOverrideType.WAIVE_CANCELLATION_FEE,
    AdminOverrideType.WAIVE_REFUND_FEE
  ];

  // Super admin and admin can do everything
  if (role === AdminRole.SUPER_ADMIN || role === AdminRole.ADMIN) {
    return true;
  }

  // Senior manager can do most things except manual discount
  if (role === AdminRole.SENIOR_MANAGER) {
    if (overrideType === AdminOverrideType.MANUAL_DISCOUNT) {
      return false;
    }
    return true;
  }

  // Manager can do manager-level overrides
  if (role === AdminRole.MANAGER) {
    return requiresManagerLevel.includes(overrideType) || 
           overrideType === AdminOverrideType.STATUS_CHANGE ||
           overrideType === AdminOverrideType.EXTEND_EXPIRATION;
  }

  // Support and viewers cannot perform overrides
  return false;
}

/**
 * Check if a role can approve an override
 */
export function canApproveOverride(role: AdminRole, overrideType: AdminOverrideType): boolean {
  if (!hasPermission(role, 'canApproveOverrides')) {
    return false;
  }

  // Different override types require different approval levels
  const criticalOverrides = [
    AdminOverrideType.ADJUST_PRICE,
    AdminOverrideType.MANUAL_DISCOUNT
  ];

  if (criticalOverrides.includes(overrideType)) {
    // Only senior manager and above can approve critical overrides
    return role === AdminRole.SUPER_ADMIN || 
           role === AdminRole.ADMIN || 
           role === AdminRole.SENIOR_MANAGER;
  }

  // All roles with approval permission can approve other overrides
  return true;
}

/**
 * Get minimum required role for an override type
 */
export function getMinimumRoleForOverride(overrideType: AdminOverrideType): AdminRole {
  const criticalOverrides = [AdminOverrideType.ADJUST_PRICE];
  const highLevelOverrides = [AdminOverrideType.MANUAL_DISCOUNT];
  const managerOverrides = [
    AdminOverrideType.FORCE_CONFIRM,
    AdminOverrideType.FORCE_CANCEL,
    AdminOverrideType.WAIVE_CANCELLATION_FEE,
    AdminOverrideType.WAIVE_REFUND_FEE
  ];

  if (criticalOverrides.includes(overrideType)) {
    return AdminRole.SENIOR_MANAGER;
  }

  if (highLevelOverrides.includes(overrideType)) {
    return AdminRole.ADMIN;
  }

  if (managerOverrides.includes(overrideType)) {
    return AdminRole.MANAGER;
  }

  return AdminRole.ADMIN;
}

/**
 * Check if an override requires approval
 */
export function requiresApproval(overrideType: AdminOverrideType, performerRole: AdminRole): boolean {
  // Super admins never need approval
  if (performerRole === AdminRole.SUPER_ADMIN) {
    return false;
  }

  const autoApprovedOverrides = [
    AdminOverrideType.STATUS_CHANGE,
    AdminOverrideType.EXTEND_EXPIRATION
  ];

  // These overrides don't require approval for admins
  if (performerRole === AdminRole.ADMIN && autoApprovedOverrides.includes(overrideType)) {
    return false;
  }

  // Critical overrides always require approval (except super admin)
  const criticalOverrides = [
    AdminOverrideType.ADJUST_PRICE,
    AdminOverrideType.MANUAL_DISCOUNT,
    AdminOverrideType.WAIVE_CANCELLATION_FEE,
    AdminOverrideType.WAIVE_REFUND_FEE
  ];

  return criticalOverrides.includes(overrideType);
}

/**
 * Validate admin action permissions
 */
export function validateAdminAction(
  role: AdminRole,
  action: keyof AdminPermissions,
  throwError: boolean = true
): boolean {
  const hasAccess = hasPermission(role, action);
  
  if (!hasAccess && throwError) {
    throw new Error(`Insufficient permissions: ${role} cannot perform ${action}`);
  }
  
  return hasAccess;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: AdminRole): AdminPermissions {
  return { ...ROLE_PERMISSIONS[role] };
}

/**
 * Check if role is admin level or higher
 */
export function isAdminLevel(role: AdminRole): boolean {
  return role === AdminRole.SUPER_ADMIN || 
         role === AdminRole.ADMIN || 
         role === AdminRole.SENIOR_MANAGER;
}

/**
 * Check if role is manager level or higher
 */
export function isManagerLevel(role: AdminRole): boolean {
  return isAdminLevel(role) || role === AdminRole.MANAGER;
}

/**
 * Get role hierarchy level (higher number = more permissions)
 */
export function getRoleLevel(role: AdminRole): number {
  const levels: Record<AdminRole, number> = {
    [AdminRole.SUPER_ADMIN]: 6,
    [AdminRole.ADMIN]: 5,
    [AdminRole.SENIOR_MANAGER]: 4,
    [AdminRole.MANAGER]: 3,
    [AdminRole.SUPPORT]: 2,
    [AdminRole.VIEWER]: 1
  };

  return levels[role];
}

/**
 * Check if one role has higher permissions than another
 */
export function hasHigherPermissionsThan(role1: AdminRole, role2: AdminRole): boolean {
  return getRoleLevel(role1) > getRoleLevel(role2);
}

/**
 * Get roles that can approve a specific override
 */
export function getApprovalRoles(overrideType: AdminOverrideType): AdminRole[] {
  const minRole = getMinimumRoleForOverride(overrideType);
  const minLevel = getRoleLevel(minRole);

  return Object.values(AdminRole).filter(role => {
    return getRoleLevel(role) >= minLevel && hasPermission(role, 'canApproveOverrides');
  });
}

/**
 * Format role for display
 */
export function formatRole(role: AdminRole): string {
  return role.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

/**
 * Parse role from string
 */
export function parseRole(roleString: string): AdminRole | null {
  const normalizedRole = roleString.toUpperCase().replace(/\s+/g, '_');
  
  if (Object.values(AdminRole).includes(normalizedRole as AdminRole)) {
    return normalizedRole as AdminRole;
  }
  
  return null;
}
