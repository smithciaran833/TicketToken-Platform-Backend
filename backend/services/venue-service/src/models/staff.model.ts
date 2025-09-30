import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IStaffMember {
  id?: string;
  venue_id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'box_office' | 'door_staff' | 'viewer';
  permissions?: string[];
  is_active?: boolean;
  last_login_at?: Date;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
}

export interface IStaffWithUser extends IStaffMember {
  user?: {
    id: string;
    email: string;
    name: string;
    phone?: string;
  };
}

export class StaffModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_staff', db);
  }

  async findByVenueAndUser(venueId: string, userId: string): Promise<IStaffMember | null> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, user_id: userId })
      .whereNull('deleted_at')
      .first();
  }

  async getVenueStaff(venueId: string, includeInactive = false): Promise<IStaffMember[]> {
    let query = this.db(this.tableName)
      .where({ venue_id: venueId })
      .whereNull('deleted_at');

    if (!includeInactive) {
      query = query.where({ is_active: true });
    }

    return query.orderBy('created_at', 'asc');
  }

  async getStaffByRole(venueId: string, role: IStaffMember['role']): Promise<IStaffMember[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, role, is_active: true })
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc');
  }

  async addStaffMember(staffData: Partial<IStaffMember>): Promise<IStaffMember> {
    const existing = await this.findByVenueAndUser(staffData.venue_id!, staffData.user_id!);
    if (existing) {
      throw new Error('Staff member already exists for this venue');
    }

    const permissions = staffData.permissions || this.getDefaultPermissions(staffData.role!);

    return this.create({
      ...staffData,
      permissions: JSON.stringify(permissions),
      is_active: true,
    });
  }

  async updateRole(id: string, role: IStaffMember['role'], permissions?: string[]): Promise<IStaffMember> {
    const updateData: any = { role };

    if (permissions) {
      updateData.permissions = JSON.stringify(permissions);
    } else {
      updateData.permissions = JSON.stringify(this.getDefaultPermissions(role));
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
    await this.update(id, { last_login_at: new Date() });
  }

  async getUserVenues(userId: string): Promise<Array<{ venue_id: string; role: string }>> {
    return this.db(this.tableName)
      .where({ user_id: userId, is_active: true })
      .whereNull('deleted_at')
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
    const currentStaff = await this.count({ venue_id: venueId, is_active: true });
    const limit = 50;

    return {
      canAdd: currentStaff < limit,
      limit,
      current: currentStaff,
    };
  }
}
