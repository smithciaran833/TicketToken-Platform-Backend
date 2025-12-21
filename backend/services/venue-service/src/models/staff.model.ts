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
 * StaffModel - venue_staff table uses is_active for soft delete, NOT deleted_at
 */
export class StaffModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_staff', db);
  }

  // Override: venue_staff has no deleted_at column
  async findById(id: string, columns: string[] = ['*']) {
    return this.db(this.tableName)
      .where({ id })
      .select(columns)
      .first();
  }

  // Override: venue_staff has no deleted_at column
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

  // Override: use is_active instead of deleted_at for soft delete
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
    const existing = await this.findByVenueAndUser(staffData.venue_id!, staffData.user_id!);
    if (existing && existing.is_active) {
      throw new Error('Staff member already exists for this venue');
    }

    // If exists but inactive, reactivate instead of creating new
    if (existing && !existing.is_active) {
      const permissions = staffData.permissions && staffData.permissions.length > 0
        ? staffData.permissions
        : this.getDefaultPermissions(staffData.role!);

      const [reactivated] = await this.db(this.tableName)
        .where({ id: existing.id })
        .update({
          is_active: true,
          role: staffData.role,
          permissions: permissions,
          updated_at: new Date()
        })
        .returning('*');
      return reactivated;
    }

    const permissions = staffData.permissions && staffData.permissions.length > 0
      ? staffData.permissions
      : this.getDefaultPermissions(staffData.role!);

    return this.create({
      ...staffData,
      permissions: permissions,
      is_active: true,
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

  async deactivateStaffMember(id: string): Promise<boolean> {
    const result = await this.update(id, { is_active: false });
    return !!result;
  }

  async reactivateStaffMember(id: string): Promise<boolean> {
    const result = await this.update(id, { is_active: true });
    return !!result;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db(this.tableName)
      .where({ id })
      .update({ updated_at: new Date() });
  }

  async getUserVenues(userId: string): Promise<Array<{ venue_id: string; role: string }>> {
    return this.db(this.tableName)
      .where({ user_id: userId, is_active: true })
      .select('venue_id', 'role');
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
    const limit = 50;

    return {
      canAdd: currentStaff < limit,
      limit,
      current: currentStaff,
    };
  }
}
