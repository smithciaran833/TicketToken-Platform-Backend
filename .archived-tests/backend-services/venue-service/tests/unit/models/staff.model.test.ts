import { StaffModel, IStaffMember } from '../../../src/models/staff.model';
import { v4 as uuidv4 } from 'uuid';

describe('Unit: Staff Model', () => {
  let mockDb: any;
  let staffModel: StaffModel;
  let mockQuery: any;

  beforeEach(() => {
    mockQuery = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{}]),
      select: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockReturnThis(),
    };

    mockDb = jest.fn(() => mockQuery);
    
    // Also add the methods directly to mockDb
    Object.keys(mockQuery).forEach(key => {
      if (typeof mockQuery[key] === 'function') {
        (mockDb as any)[key] = mockQuery[key];
      }
    });

    staffModel = new StaffModel(mockDb);
  });

  describe('findByVenueAndUser()', () => {
    it('should find staff by venue and user', async () => {
      const venueId = uuidv4();
      const userId = uuidv4();
      const mockStaff = {
        id: uuidv4(),
        venue_id: venueId,
        user_id: userId,
        role: 'manager' as const,
        is_active: true,
      };

      mockQuery.first.mockResolvedValue(mockStaff);

      const result = await staffModel.findByVenueAndUser(venueId, userId);

      expect(mockDb).toHaveBeenCalledWith('venue_staff');
      expect(mockQuery.where).toHaveBeenCalledWith({ venue_id: venueId, user_id: userId });
      expect(result).toEqual(mockStaff);
    });

    it('should return null if staff not found', async () => {
      mockQuery.first.mockResolvedValue(null);

      const result = await staffModel.findByVenueAndUser(uuidv4(), uuidv4());

      expect(result).toBeNull();
    });
  });

  describe('getVenueStaff()', () => {
    it('should get active staff by default', async () => {
      const venueId = uuidv4();
      mockQuery.orderBy.mockResolvedValue([]);

      await staffModel.getVenueStaff(venueId);

      expect(mockQuery.where).toHaveBeenCalledWith({ venue_id: venueId });
      expect(mockQuery.where).toHaveBeenCalledWith({ is_active: true });
      expect(mockQuery.orderBy).toHaveBeenCalledWith('created_at', 'asc');
    });

    it('should include inactive staff when requested', async () => {
      const venueId = uuidv4();
      mockQuery.orderBy.mockResolvedValue([]);

      await staffModel.getVenueStaff(venueId, true);

      expect(mockQuery.where).toHaveBeenCalledWith({ venue_id: venueId });
      expect(mockQuery.orderBy).toHaveBeenCalled();
    });
  });

  describe('getStaffByRole()', () => {
    it('should filter staff by role', async () => {
      const venueId = uuidv4();
      mockQuery.orderBy.mockResolvedValue([]);

      await staffModel.getStaffByRole(venueId, 'manager');

      expect(mockQuery.where).toHaveBeenCalledWith({
        venue_id: venueId,
        role: 'manager',
        is_active: true
      });
    });
  });

  describe('addStaffMember()', () => {
    it('should add new staff member with default permissions', async () => {
      const venueId = uuidv4();
      const userId = uuidv4();

      mockQuery.first.mockResolvedValue(null); // No existing staff
      mockQuery.returning.mockResolvedValue([{
        id: uuidv4(),
        venue_id: venueId,
        user_id: userId,
        role: 'manager',
        is_active: true,
      }]);

      const result = await staffModel.addStaffMember({
        venue_id: venueId,
        user_id: userId,
        role: 'manager',
      });

      expect(result).toBeDefined();
      expect(mockQuery.insert).toHaveBeenCalled();
    });

    it('should throw error if active staff already exists', async () => {
      const venueId = uuidv4();
      const userId = uuidv4();

      mockQuery.first.mockResolvedValue({
        id: uuidv4(),
        venue_id: venueId,
        user_id: userId,
        is_active: true,
      });

      await expect(staffModel.addStaffMember({
        venue_id: venueId,
        user_id: userId,
        role: 'manager',
      })).rejects.toThrow('Staff member already exists');
    });

    it('should reactivate inactive staff member', async () => {
      const existingId = uuidv4();
      const venueId = uuidv4();
      const userId = uuidv4();

      mockQuery.first.mockResolvedValue({
        id: existingId,
        venue_id: venueId,
        user_id: userId,
        is_active: false,
      });

      mockQuery.returning.mockResolvedValue([{
        id: existingId,
        venue_id: venueId,
        user_id: userId,
        role: 'manager',
        is_active: true,
      }]);

      const result = await staffModel.addStaffMember({
        venue_id: venueId,
        user_id: userId,
        role: 'manager',
      });

      expect(mockQuery.update).toHaveBeenCalled();
      expect(result.is_active).toBe(true);
    });
  });

  describe('updateRole()', () => {
    it('should update staff role and permissions', async () => {
      const staffId = uuidv4();
      mockQuery.returning.mockResolvedValue([{
        id: staffId,
        role: 'box_office',
        permissions: ['tickets:sell', 'tickets:view'],
      }]);

      await staffModel.updateRole(staffId, 'box_office');

      expect(mockQuery.where).toHaveBeenCalled();
      expect(mockQuery.update).toHaveBeenCalled();
    });

    it('should use custom permissions if provided', async () => {
      const staffId = uuidv4();
      const customPermissions = ['custom:permission'];

      mockQuery.returning.mockResolvedValue([{
        id: staffId,
        role: 'manager',
        permissions: customPermissions,
      }]);

      await staffModel.updateRole(staffId, 'manager', customPermissions);

      expect(mockQuery.update).toHaveBeenCalled();
    });
  });

  describe('hasPermission()', () => {
    it('should return true for owner role', async () => {
      mockQuery.first.mockResolvedValue({
        role: 'owner',
        is_active: true,
        permissions: ['*']
      });

      const result = await staffModel.hasPermission(uuidv4(), uuidv4(), 'any:permission');

      expect(result).toBe(true);
    });

    it('should check specific permission for non-owner', async () => {
      mockQuery.first.mockResolvedValue({
        role: 'manager',
        is_active: true,
        permissions: ['venue:read', 'venue:update']
      });

      const result = await staffModel.hasPermission(uuidv4(), uuidv4(), 'venue:read');

      expect(result).toBe(true);
    });

    it('should return false if permission not granted', async () => {
      mockQuery.first.mockResolvedValue({
        role: 'viewer',
        is_active: true,
        permissions: ['events:view']
      });

      const result = await staffModel.hasPermission(uuidv4(), uuidv4(), 'venue:update');

      expect(result).toBe(false);
    });

    it('should return false if staff inactive', async () => {
      mockQuery.first.mockResolvedValue({
        role: 'manager',
        is_active: false,
        permissions: ['venue:read']
      });

      const result = await staffModel.hasPermission(uuidv4(), uuidv4(), 'venue:read');

      expect(result).toBe(false);
    });

    it('should return false if staff not found', async () => {
      mockQuery.first.mockResolvedValue(null);

      const result = await staffModel.hasPermission(uuidv4(), uuidv4(), 'any:permission');

      expect(result).toBe(false);
    });
  });

  describe('getUserVenues()', () => {
    it('should return venues for user', async () => {
      const userId = uuidv4();
      const mockVenues = [
        { venue_id: uuidv4(), role: 'owner' },
        { venue_id: uuidv4(), role: 'manager' },
      ];

      mockQuery.select.mockResolvedValue(mockVenues);

      const result = await staffModel.getUserVenues(userId);

      expect(mockQuery.where).toHaveBeenCalledWith({ user_id: userId, is_active: true });
      expect(mockQuery.select).toHaveBeenCalledWith('venue_id', 'role');
      expect(result).toEqual(mockVenues);
    });
  });

  describe('validateStaffLimit()', () => {
    it('should return can add if under limit', async () => {
      mockQuery.first.mockResolvedValue({ count: '10' });

      const result = await staffModel.validateStaffLimit(uuidv4());

      expect(result.canAdd).toBe(true);
      expect(result.current).toBe(10);
      expect(result.limit).toBe(50);
    });

    it('should return cannot add if at limit', async () => {
      mockQuery.first.mockResolvedValue({ count: '50' });

      const result = await staffModel.validateStaffLimit(uuidv4());

      expect(result.canAdd).toBe(false);
      expect(result.current).toBe(50);
    });
  });
});
