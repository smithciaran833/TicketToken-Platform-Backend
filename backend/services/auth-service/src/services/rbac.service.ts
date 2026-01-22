import { db } from '../config/database';
import { AuthorizationError } from '../errors';

interface Role {
  name: string;
  permissions: string[];
  venueScoped: boolean;
}

export class RBACService {
  private roles: Map<string, Role>;

  constructor() {
    this.roles = new Map([
      ['venue-owner', {
        name: 'venue-owner',
        permissions: ['*'], // All permissions for their venue
        venueScoped: true,
      }],
      ['venue-manager', {
        name: 'venue-manager',
        permissions: [
          'events:create', 'events:update', 'events:delete',
          'tickets:view', 'tickets:validate',
          'reports:view', 'reports:export',
        ],
        venueScoped: true,
      }],
      ['box-office', {
        name: 'box-office',
        permissions: [
          'tickets:sell', 'tickets:view', 'tickets:validate',
          'payments:process', 'reports:daily',
        ],
        venueScoped: true,
      }],
      ['door-staff', {
        name: 'door-staff',
        permissions: ['tickets:validate', 'tickets:view'],
        venueScoped: true,
      }],
      ['customer', {
        name: 'customer',
        permissions: [
          'tickets:purchase', 'tickets:view-own', 'tickets:transfer-own',
          'profile:update-own',
        ],
        venueScoped: false,
      }],
    ]);
  }

  async getUserPermissions(userId: string, tenantId: string, venueId?: string): Promise<string[]> {
    const permissions = new Set<string>();

    // Get user's venue roles if venueId provided
    if (venueId) {
      const venueRoles = await db('user_venue_roles')
        .where({
          user_id: userId,
          tenant_id: tenantId,
          venue_id: venueId,
          is_active: true,
        })
        .where(function() {
          this.where('expires_at', '>', new Date()).orWhereNull('expires_at');
        });

      for (const venueRole of venueRoles) {
        const role = this.roles.get(venueRole.role);
        if (role) {
          role.permissions.forEach(p => permissions.add(p));
        }
      }
    }

    // Add customer permissions by default
    const customerRole = this.roles.get('customer');
    if (customerRole) {
      customerRole.permissions.forEach(p => permissions.add(p));
    }

    return Array.from(permissions);
  }

  async checkPermission(userId: string, tenantId: string, permission: string, venueId?: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, tenantId, venueId);

    // Check for wildcard permission
    if (userPermissions.includes('*')) {
      return true;
    }

    // Check specific permission
    return userPermissions.includes(permission);
  }

  async requirePermission(userId: string, tenantId: string, permission: string, venueId?: string): Promise<void> {
    const hasPermission = await this.checkPermission(userId, tenantId, permission, venueId);

    if (!hasPermission) {
      throw new AuthorizationError(`Missing required permission: ${permission}`);
    }
  }

  async grantVenueRole(
    userId: string,
    tenantId: string,
    venueId: string,
    role: string,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    // Validate role
    if (!this.roles.has(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    // FIX: Validate user exists before trying to insert
    const userExists = await db('users')
      .where({ id: userId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (!userExists) {
      const error: any = new Error(`User not found: ${userId}`);
      error.statusCode = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    // Check if granter has permission to grant roles
    await this.requirePermission(grantedBy, tenantId, 'roles:manage', venueId);

    // Check for existing role
    const existing = await db('user_venue_roles')
      .where({
        user_id: userId,
        tenant_id: tenantId,
        venue_id: venueId,
        role: role,
        is_active: true,
      })
      .first();

    if (existing) {
      // Update expiration and granted_at when re-granting
      await db('user_venue_roles')
        .where('id', existing.id)
        .update({
          expires_at: expiresAt || null,
          granted_at: db.fn.now(),
        });
      return;
    }

    // Grant new role
    await db('user_venue_roles').insert({
      user_id: userId,
      tenant_id: tenantId,
      venue_id: venueId,
      role: role,
      granted_by: grantedBy,
      granted_at: db.fn.now(),
      expires_at: expiresAt || null,
      is_active: true,
    });
  }

  async revokeVenueRole(userId: string, tenantId: string, venueId: string, role: string, revokedBy: string): Promise<void> {
    // Check if revoker has permission
    await this.requirePermission(revokedBy, tenantId, 'roles:manage', venueId);

    await db('user_venue_roles')
      .where({
        user_id: userId,
        tenant_id: tenantId,
        venue_id: venueId,
        role: role,
        is_active: true,
      })
      .update({ is_active: false });
  }

  async revokeVenueRoles(userId: string, venueId: string): Promise<void> {
    await db('user_venue_roles')
      .where({
        user_id: userId,
        venue_id: venueId,
        is_active: true,
      })
      .update({ is_active: false });
  }

  async getUserVenueRoles(userId: string, tenantId: string): Promise<any[]> {
    return db('user_venue_roles')
      .where({
        user_id: userId,
        tenant_id: tenantId,
        is_active: true,
      })
      .where(function() {
        this.where('expires_at', '>', new Date()).orWhereNull('expires_at');
      })
      .select('venue_id', 'role', 'granted_at', 'expires_at');
  }

  async getVenueRoles(venueId: string): Promise<any[]> {
    const roles = await db('user_venue_roles')
      .where({
        venue_id: venueId,
        is_active: true,
      })
      .where(function() {
        this.where('expires_at', '>', new Date()).orWhereNull('expires_at');
      })
      .select('user_id', 'role', 'granted_at', 'expires_at', 'is_active', 'created_at');

    // Transform to camelCase for API response (matches response schema)
    return roles.map(role => ({
      userId: role.user_id,
      role: role.role,
      isActive: role.is_active,
      createdAt: role.created_at?.toISOString?.() || role.created_at,
      grantedAt: role.granted_at?.toISOString?.() || role.granted_at,
      expiresAt: role.expires_at?.toISOString?.() || role.expires_at || null,
    }));
  }
}
