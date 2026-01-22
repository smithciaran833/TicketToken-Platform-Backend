import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IStaffMember {
  id?: string;
  venue_id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'box_office' | 'door_staff' | 'viewer';
  permissions?: string[];
  department?: string;
  job_title?: string;
  employment_type?: string;
  start_date?: Date;
  end_date?: Date;
  is_active?: boolean;
  access_areas?: string[];
  shift_schedule?: any;
  pin_code?: string;
  contact_email?: string;
  contact_phone?: string;
  emergency_contact?: any;
  hourly_rate?: number;
  commission_percentage?: number;
  added_by?: string;
  tenant_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface IStaffWithUser extends IStaffMember {
  user?: {
    id: string;
    email: string;
    name: string;
    phone?: string;
  };
}

/**
 * StaffModel - venue_staff table uses is_active for soft delete (NOT deleted_at)
 * 
 * This model overrides BaseModel methods because venue_staff uses a different
 * soft-delete pattern (is_active boolean) than the standard deleted_at timestamp.
 */
export class StaffModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_staff', db);
  }

  /**
   * Override: venue_staff uses is_active, not deleted_at
   */
  async findById(id: string, columns: string[] = ['*']) {
    return this.db(this.tableName)
      .where({ id })
      .select(columns)
      .first();
  }

  /**
   * Override: venue_staff uses is_active, not deleted_at
   */
  async update(id: string, data: any) {
    const [record] = await this.db(this.tableName)
      .where({ id })
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');

    return record;
  }

  /**
   * Override: venue_staff uses is_active instead of deleted_at
   */
  async delete(id: string) {
    return this.db(this.tableName)
      .where({ id })
      .update({
        is_active: false,
        updated_at: new Date()
      });
  }

  async findByVenueAndUser(venueId: string, userId: string): Promise<IStaffMember | null> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, user_id: userId })
      .first();
  }

  async getVenueStaff(venueId: string, includeInactive = false): Promise<IStaffMember[]> {
    let query = this.db(this.tableName)
      .where({ venue_id: venueId });

    if (!includeInactive) {
      query = query.where({ is_active: true });
    }

    return query.orderBy('created_at', 'asc');
  }

  async getStaffByRole(venueId: string, role: IStaffMember['role']): Promise<IStaffMember[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, role, is_active: true })
      .orderBy('created_at', 'asc');
  }

  async addStaffMember(staffData: Partial<IStaffMember>): Promise<IStaffMember> {
    return this.db.transaction(async (trx) => {
      const existing = await trx(this.tableName)
        .where({ venue_id: staffData.venue_id, user_id: staffData.user_id })
        .first();

      // Check if exists and is active
      if (existing && existing.is_active) {
        throw new Error('Staff member already exists for this venue');
      }

      // If exists but inactive, reactivate instead of creating new
      if (existing && !existing.is_active) {
        const permissions = staffData.permissions && staffData.permissions.length > 0
          ? staffData.permissions
          : this.getDefaultPermissions(staffData.role!);

        const [restored] = await trx(this.tableName)
          .where({ id: existing.id })
          .update({
            is_active: true,
            role: staffData.role,
            permissions: permissions,
            updated_at: new Date()
          })
          .returning('*');
        return restored;
      }

      // Create new staff member
      const permissions = staffData.permissions && staffData.permissions.length > 0
        ? staffData.permissions
        : this.getDefaultPermissions(staffData.role!);

      const [created] = await trx(this.tableName)
        .insert({
          ...staffData,
          permissions: permissions,
          is_active: true,
        })
        .returning('*');

      return created;
    });
  }

  async updateRole(id: string, role: IStaffMember['role'], permissions?: string[]): Promise<IStaffMember> {
    const updateData: any = { role };

    if (permissions) {
      updateData.permissions = permissions;
    } else {
      updateData.permissions = this.getDefaultPermissions(role);
    }

    return this.update(id, updateData);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db(this.tableName)
      .where({ id })
      .update({ updated_at: new Date() });
  }

  async getUserVenues(userId: string, tenantId: string): Promise<Array<{ venue_id: string; role: string }>> {
    // Validate tenant ID format
    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('Invalid tenant context');
    }

    // Join with venues table to filter by tenant_id
    return this.db(this.tableName)
      .join('venues', `${this.tableName}.venue_id`, 'venues.id')
      .where({
        [`${this.tableName}.user_id`]: userId,
        'venues.tenant_id': tenantId
      })
      .where(`${this.tableName}.is_active`, true)
      .whereNull('venues.deleted_at')
      .select(`${this.tableName}.venue_id`, `${this.tableName}.role`);
  }

  async hasPermission(venueId: string, userId: string, permission: string): Promise<boolean> {
    const staff = await this.findByVenueAndUser(venueId, userId);

    if (!staff || !staff.is_active) {
      return false;
    }

    if (staff.role === 'owner') {
      return true;
    }

    return staff.permissions?.includes(permission) || false;
  }

  /**
   * Deactivate a staff member (soft delete using is_active)
   */
  async deactivateStaffMember(id: string): Promise<boolean> {
    const [result] = await this.db(this.tableName)
      .where({ id })
      .update({
        is_active: false,
        updated_at: new Date()
      })
      .returning('*');

    return !!result;
  }

  /**
   * Reactivate a previously deactivated staff member
   */
  async reactivateStaffMember(id: string): Promise<boolean> {
    const [result] = await this.db(this.tableName)
      .where({ id })
      .update({
        is_active: true,
        updated_at: new Date()
      })
      .returning('*');

    return !!result;
  }

  private getDefaultPermissions(role: IStaffMember['role']): string[] {
    const permissionMap = {
      owner: ['*'],
      manager: [
        'venue:read',
        'venue:update',
        'events:create',
        'events:update',
        'events:delete',
        'tickets:view',
        'tickets:validate',
        'reports:view',
        'reports:export',
        'staff:view',
        'settings:view',
      ],
      box_office: [
        'tickets:sell',
        'tickets:view',
        'tickets:validate',
        'payments:process',
        'reports:daily',
        'customers:view',
      ],
      door_staff: [
        'tickets:validate',
        'tickets:view',
        'events:view',
      ],
      viewer: [
        'events:view',
        'reports:view',
      ],
    };

    return permissionMap[role] || [];
  }

  async validateStaffLimit(venueId: string): Promise<{ canAdd: boolean; limit: number; current: number }> {
    const result = await this.db(this.tableName)
      .where({ venue_id: venueId, is_active: true })
      .count('* as count')
      .first();

    const currentStaff = parseInt(String(result?.count || '0'), 10);
    const limit = parseInt(process.env.MAX_STAFF_PER_VENUE || '50', 10);

    return {
      canAdd: currentStaff < limit,
      limit,
      current: currentStaff,
    };
  }
}