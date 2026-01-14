import { ProfileController } from '../../../src/controllers/profile.controller';
import { db } from '../../../src/config/database';
import { ValidationError } from '../../../src/errors';

// Mock dependencies
jest.mock('../../../src/config/database', () => ({
  db: jest.fn()
}));

describe('ProfileController', () => {
  let profileController: ProfileController;
  let mockRequest: any;
  let mockRes: any;

  beforeEach(() => {
    jest.clearAllMocks();

    profileController = new ProfileController();

    mockRequest = {
      user: { id: 'user-123', email: 'test@example.com', tenant_id: 'tenant-123' },
      body: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'Test Agent' },
      log: {
        error: jest.fn()
      }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  // =============================================================================
  // GROUP 1: getProfile() - 5 test cases
  // =============================================================================

  describe('getProfile()', () => {
    it('should successfully return user profile', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        phone: '555-0100',
        email_verified: true,
        mfa_enabled: false,
        role: 'user',
        created_at: new Date(),
        updated_at: new Date(),
        last_login_at: new Date(),
        password_changed_at: new Date()
      };

      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUser)
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);

      // Act
      await profileController.getProfile(mockRequest, mockRes);

      // Assert
      expect(db).toHaveBeenCalledWith('users');
      expect(mockDbQuery.where).toHaveBeenCalledWith({ id: 'user-123', tenant_id: 'tenant-123' });
      expect(mockDbQuery.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockUser
      });
    });

    it('should return 404 when user not found', async () => {
      // Arrange
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);

      // Act
      await profileController.getProfile(mockRequest, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    });

    it('should exclude soft-deleted users', async () => {
      // Arrange
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 'user-123' })
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);

      // Act
      await profileController.getProfile(mockRequest, mockRes);

      // Assert
      expect(mockDbQuery.whereNull).toHaveBeenCalledWith('deleted_at');
    });

    it('should only return whitelisted fields', async () => {
      // Arrange
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 'user-123' })
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);

      // Act
      await profileController.getProfile(mockRequest, mockRes);

      // Assert
      expect(mockDbQuery.select).toHaveBeenCalledWith(
        'id',
        'email',
        'first_name',
        'last_name',
        'phone',
        'email_verified',
        'mfa_enabled',
        'role',
        'created_at',
        'updated_at',
        'last_login_at',
        'password_changed_at'
      );
    });

    it('should handle database errors', async () => {
      // Arrange
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);

      // Act
      await profileController.getProfile(mockRequest, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve profile',
        code: 'INTERNAL_ERROR'
      });
    });
  });

  // =============================================================================
  // GROUP 2: updateProfile() - 8 test cases
  // =============================================================================

  describe('updateProfile()', () => {
    it('should successfully update profile with valid fields', async () => {
      // Arrange
      mockRequest.body = {
        first_name: 'Updated',
        last_name: 'Name',
        phone: '555-0200'
      };

      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      // Mock getProfile call
      profileController.getProfile = jest.fn().mockResolvedValue(undefined);

      // Act
      await profileController.updateProfile(mockRequest, mockRes);

      // Assert
      expect(mockUpdateQuery.where).toHaveBeenCalledWith({ id: 'user-123', tenant_id: 'tenant-123' });
      expect(mockUpdateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'Updated',
          last_name: 'Name',
          phone: '555-0200',
          updated_at: expect.any(Date)
        })
      );
      expect(profileController.getProfile).toHaveBeenCalled();
    });

    it('should only update allowed fields', async () => {
      // Arrange
      mockRequest.body = {
        first_name: 'Updated',
        email: 'hacker@evil.com', // not allowed
        role: 'admin', // not allowed
        password: 'hacked' // not allowed
      };

      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      profileController.getProfile = jest.fn().mockResolvedValue(undefined);

      // Act
      await profileController.updateProfile(mockRequest, mockRes);

      // Assert
      expect(mockUpdateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'Updated',
          updated_at: expect.any(Date)
        })
      );
      expect(mockUpdateQuery.update).toHaveBeenCalledWith(
        expect.not.objectContaining({
          email: expect.anything(),
          role: expect.anything(),
          password: expect.anything()
        })
      );
    });

    it('should reject update with no valid fields', async () => {
      // Arrange
      mockRequest.body = {
        invalid_field: 'value'
      };

      // Act
      await profileController.updateProfile(mockRequest, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR'
      });
    });

    it('should create audit log after successful update', async () => {
      // Arrange
      mockRequest.body = { first_name: 'Updated' };
      mockRequest.ip = '192.168.1.100';
      mockRequest.headers['user-agent'] = 'Mozilla/5.0';

      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      profileController.getProfile = jest.fn().mockResolvedValue(undefined);

      // Act
      await profileController.updateProfile(mockRequest, mockRes);

      // Assert
      expect(mockAuditQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          action: 'profile_updated',
          resource_type: 'user',
          resource_id: 'user-123',
          ip_address: '192.168.1.100',
          user_agent: 'Mozilla/5.0',
          status: 'success'
        })
      );
    });

    it('should update only first_name when provided', async () => {
      // Arrange
      mockRequest.body = { first_name: 'John' };

      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      profileController.getProfile = jest.fn().mockResolvedValue(undefined);

      // Act
      await profileController.updateProfile(mockRequest, mockRes);

      // Assert
      expect(mockUpdateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'John'
        })
      );
    });

    it('should update only last_name when provided', async () => {
      // Arrange
      mockRequest.body = { last_name: 'Doe' };

      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      profileController.getProfile = jest.fn().mockResolvedValue(undefined);

      // Act
      await profileController.updateProfile(mockRequest, mockRes);

      // Assert
      expect(mockUpdateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          last_name: 'Doe'
        })
      );
    });

    it('should update only phone when provided', async () => {
      // Arrange
      mockRequest.body = { phone: '555-1234' };

      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      profileController.getProfile = jest.fn().mockResolvedValue(undefined);

      // Act
      await profileController.updateProfile(mockRequest, mockRes);

      // Assert
      expect(mockUpdateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '555-1234'
        })
      );
    });

    it('should handle database errors during update', async () => {
      // Arrange
      mockRequest.body = { first_name: 'Updated' };

      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockUpdateQuery as any);

      // Act
      await profileController.updateProfile(mockRequest, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to update profile',
        code: 'INTERNAL_ERROR'
      });
    });
  });
});
