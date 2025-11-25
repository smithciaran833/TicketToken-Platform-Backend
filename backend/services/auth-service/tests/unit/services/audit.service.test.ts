import { AuditService, AuditEvent } from '../../../src/services/audit.service';
import { db } from '../../../src/config/database';
import { auditLogger } from '../../../src/config/logger';

// Mock the database and logger
jest.mock('../../../src/config/database', () => ({
  db: jest.fn()
}));

jest.mock('../../../src/config/logger', () => ({
  auditLogger: {
    info: jest.fn(),
    error: jest.fn()
  }
}));

describe('AuditService', () => {
  let auditService: AuditService;
  
  // Database mock setup
  const mockInsert = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup database mock
    const mockDb = db as jest.MockedFunction<typeof db>;
    mockDb.mockImplementation((tableName?: any) => {
      if (tableName === 'audit_logs') {
        return {
          insert: mockInsert
        } as any;
      }
      return {} as any;
    });

    // Create service instance
    auditService = new AuditService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('log()', () => {
    const mockEvent: AuditEvent = {
      userId: 'user-123',
      action: 'test.action',
      resourceType: 'test_resource',
      resourceId: 'resource-456',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      metadata: { key: 'value', nested: { data: 'test' } },
      status: 'success',
      errorMessage: undefined
    };

    it('should log event to database successfully', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);

      // Execute
      await auditService.log(mockEvent);

      // Verify
      expect(db).toHaveBeenCalledWith('audit_logs');
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: mockEvent.userId,
        action: mockEvent.action,
        resource_type: mockEvent.resourceType,
        resource_id: mockEvent.resourceId,
        ip_address: mockEvent.ipAddress,
        user_agent: mockEvent.userAgent,
        metadata: JSON.stringify(mockEvent.metadata),
        status: mockEvent.status,
        error_message: mockEvent.errorMessage,
        created_at: expect.any(Date)
      });
    });

    it('should log event to audit logger', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);

      // Execute
      await auditService.log(mockEvent);

      // Verify
      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockEvent,
          timestamp: expect.any(String)
        }),
        'Audit: test.action'
      );
    });

    it('should handle null metadata', async () => {
      // Setup
      const eventWithoutMetadata: AuditEvent = {
        ...mockEvent,
        metadata: undefined
      };
      mockInsert.mockResolvedValue([1]);

      // Execute
      await auditService.log(eventWithoutMetadata);

      // Verify
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: null
        })
      );
    });

    it('should handle failure status with error message', async () => {
      // Setup
      const failureEvent: AuditEvent = {
        ...mockEvent,
        status: 'failure',
        errorMessage: 'Something went wrong'
      };
      mockInsert.mockResolvedValue([1]);

      // Execute
      await auditService.log(failureEvent);

      // Verify
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failure',
          error_message: 'Something went wrong'
        })
      );
    });

    it('should not fail when database insert fails', async () => {
      // Setup
      const dbError = new Error('Database connection failed');
      mockInsert.mockRejectedValue(dbError);

      // Execute - should not throw
      await auditService.log(mockEvent);

      // Verify
      expect(auditLogger.error).toHaveBeenCalledWith(
        { error: dbError, event: mockEvent },
        'Failed to log audit event'
      );
    });

    it('should handle minimal event', async () => {
      // Setup
      const minimalEvent: AuditEvent = {
        action: 'minimal.action',
        status: 'success'
      };
      mockInsert.mockResolvedValue([1]);

      // Execute
      await auditService.log(minimalEvent);

      // Verify
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: undefined,
        action: 'minimal.action',
        resource_type: undefined,
        resource_id: undefined,
        ip_address: undefined,
        user_agent: undefined,
        metadata: null,
        status: 'success',
        error_message: undefined,
        created_at: expect.any(Date)
      });
    });
  });

  describe('logLogin()', () => {
    const mockUserId = 'user-123';
    const mockIpAddress = '192.168.1.1';
    const mockUserAgent = 'Mozilla/5.0';

    it('should log successful login', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);

      // Execute
      await auditService.logLogin(mockUserId, mockIpAddress, mockUserAgent, true);

      // Verify
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          action: 'user.login',
          ip_address: mockIpAddress,
          user_agent: mockUserAgent,
          status: 'success',
          error_message: undefined
        })
      );
      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          action: 'user.login',
          status: 'success'
        }),
        'Audit: user.login'
      );
    });

    it('should log failed login with error message', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);
      const errorMessage = 'Invalid credentials';

      // Execute
      await auditService.logLogin(mockUserId, mockIpAddress, mockUserAgent, false, errorMessage);

      // Verify
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          action: 'user.login',
          ip_address: mockIpAddress,
          user_agent: mockUserAgent,
          status: 'failure',
          error_message: errorMessage
        })
      );
      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failure',
          errorMessage
        }),
        'Audit: user.login'
      );
    });
  });

  describe('logRegistration()', () => {
    const mockUserId = 'user-123';
    const mockEmail = 'test@example.com';
    const mockIpAddress = '192.168.1.1';

    it('should log user registration', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);

      // Execute
      await auditService.logRegistration(mockUserId, mockEmail, mockIpAddress);

      // Verify
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          action: 'user.registration',
          ip_address: mockIpAddress,
          metadata: JSON.stringify({ email: mockEmail }),
          status: 'success'
        })
      );
      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          action: 'user.registration',
          metadata: { email: mockEmail }
        }),
        'Audit: user.registration'
      );
    });
  });

  describe('logPasswordChange()', () => {
    const mockUserId = 'user-123';
    const mockIpAddress = '192.168.1.1';

    it('should log password change', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);

      // Execute
      await auditService.logPasswordChange(mockUserId, mockIpAddress);

      // Verify
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          action: 'user.password_changed',
          ip_address: mockIpAddress,
          status: 'success'
        })
      );
      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          action: 'user.password_changed'
        }),
        'Audit: user.password_changed'
      );
    });
  });

  describe('logMFAEnabled()', () => {
    const mockUserId = 'user-123';

    it('should log MFA enablement', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);

      // Execute
      await auditService.logMFAEnabled(mockUserId);

      // Verify
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          action: 'user.mfa_enabled',
          status: 'success'
        })
      );
      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          action: 'user.mfa_enabled'
        }),
        'Audit: user.mfa_enabled'
      );
    });
  });

  describe('logTokenRefresh()', () => {
    const mockUserId = 'user-123';
    const mockIpAddress = '192.168.1.1';

    it('should log token refresh', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);

      // Execute
      await auditService.logTokenRefresh(mockUserId, mockIpAddress);

      // Verify
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          action: 'token.refreshed',
          ip_address: mockIpAddress,
          status: 'success'
        })
      );
      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          action: 'token.refreshed'
        }),
        'Audit: token.refreshed'
      );
    });
  });

  describe('logRoleGrant()', () => {
    const mockGrantedBy = 'admin-123';
    const mockUserId = 'user-456';
    const mockVenueId = 'venue-789';
    const mockRole = 'manager';

    it('should log role grant', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);

      // Execute
      await auditService.logRoleGrant(mockGrantedBy, mockUserId, mockVenueId, mockRole);

      // Verify
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockGrantedBy,
          action: 'role.granted',
          resource_type: 'venue',
          resource_id: mockVenueId,
          metadata: JSON.stringify({ targetUserId: mockUserId, role: mockRole }),
          status: 'success'
        })
      );
      expect(auditLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockGrantedBy,
          action: 'role.granted',
          resourceType: 'venue',
          resourceId: mockVenueId,
          metadata: { targetUserId: mockUserId, role: mockRole }
        }),
        'Audit: role.granted'
      );
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully in all convenience methods', async () => {
      // Setup
      const dbError = new Error('Database connection lost');
      mockInsert.mockRejectedValue(dbError);

      // Test all convenience methods - none should throw
      await auditService.logLogin('user-123', '192.168.1.1', 'Mozilla', true);
      expect(auditLogger.error).toHaveBeenCalled();

      jest.clearAllMocks();
      await auditService.logRegistration('user-123', 'test@example.com', '192.168.1.1');
      expect(auditLogger.error).toHaveBeenCalled();

      jest.clearAllMocks();
      await auditService.logPasswordChange('user-123', '192.168.1.1');
      expect(auditLogger.error).toHaveBeenCalled();

      jest.clearAllMocks();
      await auditService.logMFAEnabled('user-123');
      expect(auditLogger.error).toHaveBeenCalled();

      jest.clearAllMocks();
      await auditService.logTokenRefresh('user-123', '192.168.1.1');
      expect(auditLogger.error).toHaveBeenCalled();

      jest.clearAllMocks();
      await auditService.logRoleGrant('admin-123', 'user-456', 'venue-789', 'manager');
      expect(auditLogger.error).toHaveBeenCalled();
    });
  });
});
