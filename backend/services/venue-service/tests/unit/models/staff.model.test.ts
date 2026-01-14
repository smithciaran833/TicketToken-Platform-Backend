/**
 * Unit tests for StaffModel
 * Tests staff management with role-based permissions
 * Note: Uses is_active for soft delete, NOT deleted_at
 */

import { createKnexMock, configureMockReturn } from '../../__mocks__/knex.mock';
import { StaffModel, IStaffMember } from '../../../src/models/staff.model';

describe('StaffModel', () => {
  let mockKnex: any;
  let staffModel: StaffModel;

  const sampleStaffMember: IStaffMember = {
    id: 'staff-123',
    venue_id: 'venue-456',
    user_id: 'user-789',
    role: 'manager',
    permissions: ['venue:read', 'events:create', 'events:update'],
    department: 'Operations',
    job_title: 'Venue Manager',
    employment_type: 'full_time',
    is_active: true,
    access_areas: ['main', 'backstage'],
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-06-01'),
  };

  beforeEach(() => {
    mockKnex = createKnexMock();
    staffModel = new StaffModel(mockKnex);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with venue_staff table name', () => {
      expect((staffModel as any).tableName).toBe('venue_staff');
    });
  });

  describe('findById (overridden - no deleted_at filter)', () => {
    it('should find staff by id without deleted_at filter', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleStaffMember);

      const result = await staffModel.findById('staff-123');

      expect(mockKnex).toHaveBeenCalledWith('venue_staff');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'staff-123' });
      expect(mockKnex._mockChain.whereNull).not.toHaveBeenCalledWith('deleted_at');
      expect(mockKnex._mockChain.select).toHaveBeenCalledWith(['*']);
      expect(mockKnex._mockChain.first).toHaveBeenCalled();
      expect(result).toEqual(sampleStaffMember);
    });

    it('should find staff with specific columns', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ id: 'staff-123', role: 'manager' });

      await staffModel.findById('staff-123', ['id', 'role']);

      expect(mockKnex._mockChain.select).toHaveBeenCalledWith(['id', 'role']);
    });

    it('should return null when staff not found', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await staffModel.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('update (overridden - no deleted_at filter)', () => {
    it('should update staff without deleted_at filter', async () => {
      const updatedStaff = { ...sampleStaffMember, role: 'owner' as const };
      mockKnex._mockChain.returning.mockResolvedValue([updatedStaff]);

      const result = await staffModel.update('staff-123', { role: 'owner' });

      expect(mockKnex).toHaveBeenCalledWith('venue_staff');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'staff-123' });
      expect(mockKnex._mockChain.whereNull).not.toHaveBeenCalledWith('deleted_at');
      expect(result.role).toBe('owner');
    });

    it('should set updated_at timestamp', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleStaffMember]);

      await staffModel.update('staff-123', { role: 'manager' });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('delete (overridden - uses is_active)', () => {
    it('should soft delete by setting is_active to false', async () => {
      mockKnex._mockChain.update.mockResolvedValue(1);

      await staffModel.delete('staff-123');

      expect(mockKnex).toHaveBeenCalledWith('venue_staff');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'staff-123' });
      expect(mockKnex._mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
        is_active: false,
        updated_at: expect.any(Date),
      }));
    });
  });

  describe('findByVenueAndUser', () => {
    it('should find staff by venue and user', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleStaffMember);

      const result = await staffModel.findByVenueAndUser('venue-456', 'user-789');

      expect(mockKnex).toHaveBeenCalledWith('venue_staff');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ venue_id: 'venue-456', user_id: 'user-789' });
      expect(result).toEqual(sampleStaffMember);
    });

    it('should return null when no matching staff', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await staffModel.findByVenueAndUser('venue-456', 'user-999');

      expect(result).toBeNull();
    });
  });

  describe('getVenueStaff', () => {
    it('should get active staff for venue by default', async () => {
      const staffList = [sampleStaffMember, { ...sampleStaffMember, id: 'staff-456' }];
      configureMockReturn(mockKnex, staffList);

      const result = await staffModel.getVenueStaff('venue-456');

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ venue_id: 'venue-456' });
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ is_active: true });
      expect(mockKnex._mockChain.orderBy).toHaveBeenCalledWith('created_at', 'asc');
      expect(result).toHaveLength(2);
    });

    it('should include inactive staff when requested', async () => {
      const staffList = [sampleStaffMember, { ...sampleStaffMember, id: 'staff-456', is_active: false }];
      configureMockReturn(mockKnex, staffList);

      const result = await staffModel.getVenueStaff('venue-456', true);

      // Should not filter by is_active when includeInactive is true
      expect(result).toHaveLength(2);
    });
  });

  describe('getStaffByRole', () => {
    it('should get active staff by role', async () => {
      configureMockReturn(mockKnex, [sampleStaffMember]);

      const result = await staffModel.getStaffByRole('venue-456', 'manager');

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ venue_id: 'venue-456', role: 'manager', is_active: true });
      expect(result).toHaveLength(1);
    });
  });

  describe('addStaffMember', () => {
    it('should create new staff member', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null); // No existing
      mockKnex._mockChain.returning.mockResolvedValue([sampleStaffMember]);

      const result = await staffModel.addStaffMember({
        venue_id: 'venue-456',
        user_id: 'user-new',
        role: 'manager',
      });

      expect(mockKnex._mockChain.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should assign default permissions when none provided', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);
      mockKnex._mockChain.returning.mockResolvedValue([sampleStaffMember]);

      await staffModel.addStaffMember({
        venue_id: 'venue-456',
        user_id: 'user-new',
        role: 'manager',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.permissions).toContain('venue:read');
      expect(insertCall.permissions).toContain('events:create');
    });

    it('should use provided permissions when given', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);
      mockKnex._mockChain.returning.mockResolvedValue([sampleStaffMember]);

      await staffModel.addStaffMember({
        venue_id: 'venue-456',
        user_id: 'user-new',
        role: 'manager',
        permissions: ['custom:permission'],
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.permissions).toEqual(['custom:permission']);
    });

    it('should throw error if active staff already exists', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ ...sampleStaffMember, is_active: true });

      await expect(
        staffModel.addStaffMember({
          venue_id: 'venue-456',
          user_id: 'user-789',
          role: 'manager',
        })
      ).rejects.toThrow('Staff member already exists for this venue');
    });

    it('should reactivate inactive staff instead of creating new', async () => {
      const inactiveStaff = { ...sampleStaffMember, is_active: false };
      mockKnex._mockChain.first.mockResolvedValue(inactiveStaff);
      mockKnex._mockChain.returning.mockResolvedValue([{ ...inactiveStaff, is_active: true }]);

      const result = await staffModel.addStaffMember({
        venue_id: 'venue-456',
        user_id: 'user-789',
        role: 'box_office',
      });

      expect(mockKnex._mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
        is_active: true,
        role: 'box_office',
      }));
      expect(result.is_active).toBe(true);
    });

    it('should set is_active to true for new staff', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);
      mockKnex._mockChain.returning.mockResolvedValue([sampleStaffMember]);

      await staffModel.addStaffMember({
        venue_id: 'venue-456',
        user_id: 'user-new',
        role: 'viewer',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.is_active).toBe(true);
    });
  });

  describe('updateRole', () => {
    it('should update role and assign default permissions', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{ ...sampleStaffMember, role: 'owner' }]);

      const result = await staffModel.updateRole('staff-123', 'owner');

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.role).toBe('owner');
      expect(updateCall.permissions).toContain('*');
      expect(result.role).toBe('owner');
    });

    it('should use provided permissions when given', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleStaffMember]);

      await staffModel.updateRole('staff-123', 'manager', ['custom:permission']);

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.permissions).toEqual(['custom:permission']);
    });
  });

  describe('deactivateStaffMember', () => {
    it('should set is_active to false', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{ ...sampleStaffMember, is_active: false }]);

      const result = await staffModel.deactivateStaffMember('staff-123');

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.is_active).toBe(false);
      expect(result).toBe(true);
    });

    it('should return false when staff not found', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([null]);

      const result = await staffModel.deactivateStaffMember('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('reactivateStaffMember', () => {
    it('should set is_active to true', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{ ...sampleStaffMember, is_active: true }]);

      const result = await staffModel.reactivateStaffMember('staff-123');

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.is_active).toBe(true);
      expect(result).toBe(true);
    });
  });

  describe('updateLastLogin', () => {
    it('should update updated_at timestamp', async () => {
      mockKnex._mockChain.update.mockResolvedValue(1);

      await staffModel.updateLastLogin('staff-123');

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'staff-123' });
      expect(mockKnex._mockChain.update).toHaveBeenCalledWith({
        updated_at: expect.any(Date),
      });
    });
  });

  describe('getUserVenues', () => {
    it('should return venues for user', async () => {
      const venues = [
        { venue_id: 'venue-1', role: 'owner' },
        { venue_id: 'venue-2', role: 'manager' },
      ];
      configureMockReturn(mockKnex, venues);

      const result = await staffModel.getUserVenues('user-789');

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ user_id: 'user-789', is_active: true });
      expect(mockKnex._mockChain.select).toHaveBeenCalledWith('venue_id', 'role');
      expect(result).toHaveLength(2);
    });
  });

  describe('hasPermission', () => {
    it('should return true for owner regardless of specific permission', async () => {
      const ownerStaff = { ...sampleStaffMember, role: 'owner' as const, is_active: true };
      mockKnex._mockChain.first.mockResolvedValue(ownerStaff);

      const result = await staffModel.hasPermission('venue-456', 'user-789', 'any:permission');

      expect(result).toBe(true);
    });

    it('should return true when user has specific permission', async () => {
      const managerStaff = { ...sampleStaffMember, permissions: ['events:create'], is_active: true };
      mockKnex._mockChain.first.mockResolvedValue(managerStaff);

      const result = await staffModel.hasPermission('venue-456', 'user-789', 'events:create');

      expect(result).toBe(true);
    });

    it('should return false when user lacks permission', async () => {
      const managerStaff = { ...sampleStaffMember, permissions: ['events:view'], is_active: true };
      mockKnex._mockChain.first.mockResolvedValue(managerStaff);

      const result = await staffModel.hasPermission('venue-456', 'user-789', 'events:delete');

      expect(result).toBe(false);
    });

    it('should return false when staff not found', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await staffModel.hasPermission('venue-456', 'user-999', 'events:view');

      expect(result).toBe(false);
    });

    it('should return false when staff is inactive', async () => {
      const inactiveStaff = { ...sampleStaffMember, is_active: false };
      mockKnex._mockChain.first.mockResolvedValue(inactiveStaff);

      const result = await staffModel.hasPermission('venue-456', 'user-789', 'events:view');

      expect(result).toBe(false);
    });

    it('should return false when permissions is undefined', async () => {
      const staffNoPermissions = { ...sampleStaffMember, permissions: undefined, role: 'viewer' as const, is_active: true };
      mockKnex._mockChain.first.mockResolvedValue(staffNoPermissions);

      const result = await staffModel.hasPermission('venue-456', 'user-789', 'events:view');

      expect(result).toBe(false);
    });
  });

  describe('getDefaultPermissions', () => {
    it('should return all permissions for owner', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);
      mockKnex._mockChain.returning.mockResolvedValue([sampleStaffMember]);

      await staffModel.addStaffMember({
        venue_id: 'venue-456',
        user_id: 'user-new',
        role: 'owner',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.permissions).toEqual(['*']);
    });

    it('should return manager permissions', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);
      mockKnex._mockChain.returning.mockResolvedValue([sampleStaffMember]);

      await staffModel.addStaffMember({
        venue_id: 'venue-456',
        user_id: 'user-new',
        role: 'manager',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.permissions).toContain('venue:read');
      expect(insertCall.permissions).toContain('venue:update');
      expect(insertCall.permissions).toContain('events:create');
      expect(insertCall.permissions).toContain('staff:view');
      expect(insertCall.permissions).toContain('settings:view');
    });

    it('should return box_office permissions', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);
      mockKnex._mockChain.returning.mockResolvedValue([sampleStaffMember]);

      await staffModel.addStaffMember({
        venue_id: 'venue-456',
        user_id: 'user-new',
        role: 'box_office',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.permissions).toContain('tickets:sell');
      expect(insertCall.permissions).toContain('tickets:view');
      expect(insertCall.permissions).toContain('payments:process');
      expect(insertCall.permissions).toContain('customers:view');
    });

    it('should return door_staff permissions', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);
      mockKnex._mockChain.returning.mockResolvedValue([sampleStaffMember]);

      await staffModel.addStaffMember({
        venue_id: 'venue-456',
        user_id: 'user-new',
        role: 'door_staff',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.permissions).toContain('tickets:validate');
      expect(insertCall.permissions).toContain('tickets:view');
      expect(insertCall.permissions).toContain('events:view');
    });

    it('should return viewer permissions', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);
      mockKnex._mockChain.returning.mockResolvedValue([sampleStaffMember]);

      await staffModel.addStaffMember({
        venue_id: 'venue-456',
        user_id: 'user-new',
        role: 'viewer',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.permissions).toContain('events:view');
      expect(insertCall.permissions).toContain('reports:view');
    });
  });

  describe('validateStaffLimit', () => {
    it('should return canAdd true when under 50 limit', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ count: '10' });

      const result = await staffModel.validateStaffLimit('venue-456');

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ venue_id: 'venue-456', is_active: true });
      expect(mockKnex._mockChain.count).toHaveBeenCalledWith('* as count');
      expect(result).toEqual({
        canAdd: true,
        limit: 50,
        current: 10,
      });
    });

    it('should return canAdd false when at 50 limit', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ count: '50' });

      const result = await staffModel.validateStaffLimit('venue-456');

      expect(result).toEqual({
        canAdd: false,
        limit: 50,
        current: 50,
      });
    });

    it('should return canAdd false when over 50 limit', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ count: '55' });

      const result = await staffModel.validateStaffLimit('venue-456');

      expect(result.canAdd).toBe(false);
      expect(result.current).toBe(55);
    });

    it('should handle zero staff', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ count: '0' });

      const result = await staffModel.validateStaffLimit('venue-456');

      expect(result).toEqual({
        canAdd: true,
        limit: 50,
        current: 0,
      });
    });

    it('should handle null count result', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await staffModel.validateStaffLimit('venue-456');

      expect(result).toEqual({
        canAdd: true,
        limit: 50,
        current: 0,
      });
    });
  });

  describe('withTransaction', () => {
    it('should create new instance with transaction', () => {
      const trxMock = createKnexMock();
      const transactionalModel = staffModel.withTransaction(trxMock);

      expect(transactionalModel).toBeInstanceOf(StaffModel);
      expect((transactionalModel as any).db).toBe(trxMock);
    });
  });
});
