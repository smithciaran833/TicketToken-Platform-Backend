import { StaffModel } from '../../../src/models/staff.model';

describe('StaffModel', () => {
  let staffModel: StaffModel;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
    };

    mockDb = Object.assign(jest.fn().mockReturnValue(mockQueryBuilder), {
      _mockQueryBuilder: mockQueryBuilder,
    });

    staffModel = new StaffModel(mockDb);
  });

  // =============================================================================
  // constructor() - 1 test case
  // =============================================================================

  describe('constructor()', () => {
    it('should set table name to venue_staff', () => {
      expect((staffModel as any).tableName).toBe('venue_staff');
    });
  });

  // =============================================================================
  // findByVenueAndUser() - 2 test cases
  // =============================================================================

  describe('findByVenueAndUser()', () => {
    it('should find staff member by venue and user', async () => {
      const mockStaff = {
        id: 'staff-1',
        venue_id: 'venue-1',
        user_id: 'user-1',
        role: 'manager',
      };
      mockDb._mockQueryBuilder.first.mockResolvedValue(mockStaff);

      const result = await staffModel.findByVenueAndUser('venue-1', 'user-1');

      expect(result).toEqual(mockStaff);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({
        venue_id: 'venue-1',
        user_id: 'user-1',
      });
    });

    it('should return null if not found', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);

      const result = await staffModel.findByVenueAndUser('venue-1', 'user-1');

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // getVenueStaff() - 3 test cases
  // =============================================================================

  describe('getVenueStaff()', () => {
    const mockStaff = [
      { id: '1', role: 'owner', is_active: true },
      { id: '2', role: 'manager', is_active: true },
    ];

    it('should get all active staff for venue', async () => {
      mockDb._mockQueryBuilder.orderBy.mockResolvedValue(mockStaff);

      const result = await staffModel.getVenueStaff('venue-1');

      expect(result).toEqual(mockStaff);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ venue_id: 'venue-1' });
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ is_active: true });
    });

    it('should include inactive staff when requested', async () => {
      mockDb._mockQueryBuilder.orderBy.mockResolvedValue(mockStaff);

      await staffModel.getVenueStaff('venue-1', true);

      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ venue_id: 'venue-1' });
      // Should NOT filter by is_active when includeInactive is true
    });

    it('should order by created_at ascending', async () => {
      mockDb._mockQueryBuilder.orderBy.mockResolvedValue(mockStaff);

      await staffModel.getVenueStaff('venue-1');

      expect(mockDb._mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'asc');
    });
  });

  // =============================================================================
  // getStaffByRole() - 2 test cases
  // =============================================================================

  describe('getStaffByRole()', () => {
    it('should get staff by role', async () => {
      const mockManagers = [{ id: '1', role: 'manager' }];
      mockDb._mockQueryBuilder.orderBy.mockResolvedValue(mockManagers);

      const result = await staffModel.getStaffByRole('venue-1', 'manager');

      expect(result).toEqual(mockManagers);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({
        venue_id: 'venue-1',
        role: 'manager',
        is_active: true,
      });
    });

    it('should only return active staff', async () => {
      mockDb._mockQueryBuilder.orderBy.mockResolvedValue([]);

      await staffModel.getStaffByRole('venue-1', 'owner');

      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true })
      );
    });
  });

  // =============================================================================
  // addStaffMember() - 5 test cases
  // =============================================================================

  describe('addStaffMember()', () => {
    const newStaffData = {
      venue_id: 'venue-1',
      user_id: 'user-1',
      role: 'manager' as const,
    };

    it('should throw error if staff already exists and is active', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({
        id: 'existing',
        is_active: true,
      });

      await expect(staffModel.addStaffMember(newStaffData)).rejects.toThrow(
        'Staff member already exists for this venue'
      );
    });

    it('should reactivate if staff exists but is inactive', async () => {
      const existingStaff = {
        id: 'existing',
        is_active: false,
      };
      mockDb._mockQueryBuilder.first.mockResolvedValue(existingStaff);
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{
        ...existingStaff,
        is_active: true,
      }]);

      const result = await staffModel.addStaffMember(newStaffData);

      expect(result.is_active).toBe(true);
      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: true,
          role: 'manager',
        })
      );
    });

    it('should create new staff member if not exists', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{
        id: 'new-staff',
        ...newStaffData,
        is_active: true,
      }]);

      const result = await staffModel.addStaffMember(newStaffData);

      expect(result).toBeDefined();
      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalled();
    });

    it('should set default permissions based on role', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{
        id: 'new-staff',
        permissions: expect.any(Array),
      }]);

      await staffModel.addStaffMember(newStaffData);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: expect.any(Array),
        })
      );
    });

    it('should set is_active to true', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: 'new' }]);

      await staffModel.addStaffMember(newStaffData);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: true,
        })
      );
    });
  });

  // =============================================================================
  // updateRole() - 2 test cases
  // =============================================================================

  describe('updateRole()', () => {
    it('should update staff role and set default permissions', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{
        id: 'staff-1',
        role: 'manager',
      }]);

      await staffModel.updateRole('staff-1', 'manager');

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'manager',
          permissions: expect.any(Array),
        })
      );
    });

    it('should use custom permissions if provided', async () => {
      const customPermissions = ['custom:permission'];
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: 'staff-1' }]);

      await staffModel.updateRole('staff-1', 'manager', customPermissions);

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: customPermissions,
        })
      );
    });
  });

  // =============================================================================
  // deactivateStaffMember() - 1 test case
  // =============================================================================

  describe('deactivateStaffMember()', () => {
    it('should set is_active to false', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{
        id: 'staff-1',
        is_active: false,
      }]);

      const result = await staffModel.deactivateStaffMember('staff-1');

      expect(result).toBe(true);
    });
  });

  // =============================================================================
  // hasPermission() - 4 test cases
  // =============================================================================

  describe('hasPermission()', () => {
    it('should return true for owner role', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({
        role: 'owner',
        is_active: true,
      });

      const result = await staffModel.hasPermission('venue-1', 'user-1', 'any:permission');

      expect(result).toBe(true);
    });

    it('should return false if staff not found', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);

      const result = await staffModel.hasPermission('venue-1', 'user-1', 'events:create');

      expect(result).toBe(false);
    });

    it('should return false if staff is inactive', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({
        role: 'manager',
        is_active: false,
        permissions: ['events:create'],
      });

      const result = await staffModel.hasPermission('venue-1', 'user-1', 'events:create');

      expect(result).toBe(false);
    });

    it('should check permissions array for non-owner roles', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({
        role: 'manager',
        is_active: true,
        permissions: ['events:create', 'events:update'],
      });

      const result = await staffModel.hasPermission('venue-1', 'user-1', 'events:create');

      expect(result).toBe(true);
    });
  });

  // =============================================================================
  // validateStaffLimit() - 2 test cases
  // =============================================================================

  describe('validateStaffLimit()', () => {
    it('should return true if under limit', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: '10' });

      const result = await staffModel.validateStaffLimit('venue-1');

      expect(result.canAdd).toBe(true);
      expect(result.current).toBe(10);
      expect(result.limit).toBe(50);
    });

    it('should return false if at limit', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: '50' });

      const result = await staffModel.validateStaffLimit('venue-1');

      expect(result.canAdd).toBe(false);
      expect(result.current).toBe(50);
    });
  });
});
