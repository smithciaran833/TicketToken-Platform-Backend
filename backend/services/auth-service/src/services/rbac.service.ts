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
      // Update expiration if needed
      if (expiresAt) {
        await db('user_venue_roles')
          .where('id', existing.id)
          .update({ expires_at: expiresAt });
      }
      return;
    }

    // Grant new role
    await db('user_venue_roles').insert({
      user_id: userId,
      tenant_id: tenantId,
      venue_id: venueId,
      role: role,
      granted_by: grantedBy,
      expires_at: expiresAt,
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
    return db('user_venue_roles')
      .where({
        venue_id: venueId,
        is_active: true,
      })
      .where(function() {
        this.where('expires_at', '>', new Date()).orWhereNull('expires_at');
      })
      .select('user_id', 'role', 'granted_at', 'expires_at');
  }
}
