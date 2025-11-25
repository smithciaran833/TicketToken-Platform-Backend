import { SessionController } from '../../../src/controllers/session.controller';
import { db } from '../../../src/config/database';

// Mock dependencies
jest.mock('../../../src/config/database', () => ({
  db: jest.fn()
}));

describe('SessionController', () => {
  let sessionController: SessionController;
  let mockRequest: any;
  let mockRes: any;

  beforeEach(() => {
    jest.clearAllMocks();

    sessionController = new SessionController();

    mockRequest = {
      user: { id: 'user-123', email: 'test@example.com', tenant_id: 'tenant-123' },
      params: {},
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'Test Agent',
        authorization: 'Bearer current-token-123'
      },
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
  // GROUP 1: listSessions() - 6 test cases
  // =============================================================================

  describe('listSessions()', () => {
    it('should successfully return list of active sessions', async () => {
      // Arrange
      const mockSessions = [
        {
          id: 'session-1',
          ip_address: '127.0.0.1',
          user_agent: 'Chrome',
          created_at: new Date(),
          expires_at: new Date(),
          is_current: true
        },
        {
          id: 'session-2',
          ip_address: '192.168.1.1',
          user_agent: 'Firefox',
          created_at: new Date(),
          expires_at: new Date(),
          is_current: false
        }
      ];

      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockSessions)
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);
      (db as any).raw = jest.fn((sql, params) => ({ sql, params }));

      // Act
      await sessionController.listSessions(mockRequest, mockRes);

      // Assert
      expect(db).toHaveBeenCalledWith('user_sessions');
      expect(mockDbQuery.where).toHaveBeenCalledWith({ user_id: 'user-123' });
      expect(mockDbQuery.whereNull).toHaveBeenCalledWith('revoked_at');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockSessions
      });
    });

    it('should filter out revoked sessions', async () => {
      // Arrange
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([])
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);
      (db as any).raw = jest.fn();

      // Act
      await sessionController.listSessions(mockRequest, mockRes);

      // Assert
      expect(mockDbQuery.whereNull).toHaveBeenCalledWith('revoked_at');
    });

    it('should filter out expired sessions', async () => {
      // Arrange
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([])
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);
      (db as any).raw = jest.fn();

      // Act
      await sessionController.listSessions(mockRequest, mockRes);

      // Assert
      expect(mockDbQuery.where).toHaveBeenCalledWith('expires_at', '>', expect.any(Date));
    });

    it('should mark current session in response', async () => {
      // Arrange
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([{ is_current: true }])
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);
      (db as any).raw = jest.fn();

      // Act
      await sessionController.listSessions(mockRequest, mockRes);

      // Assert
      expect(db.raw).toHaveBeenCalled();
    });

    it('should order sessions by created_at descending', async () => {
      // Arrange
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([])
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);
      (db as any).raw = jest.fn();

      // Act
      await sessionController.listSessions(mockRequest, mockRes);

      // Assert
      expect(mockDbQuery.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('should handle database errors', async () => {
      // Arrange
      const mockDbQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockDbQuery as any);
      (db as any).raw = jest.fn();

      // Act
      await sessionController.listSessions(mockRequest, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve sessions',
        code: 'INTERNAL_ERROR'
      });
    });
  });

  // =============================================================================
  // GROUP 2: revokeSession() - 7 test cases
  // =============================================================================

  describe('revokeSession()', () => {
    it('should successfully revoke a session', async () => {
      // Arrange
      mockRequest.params = { sessionId: 'session-456' };

      const mockSession = {
        id: 'session-456',
        user_id: 'user-123',
        ip_address: '192.168.1.1',
        user_agent: 'Firefox'
      };

      const mockSelectQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockSession)
      };

      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockSelectQuery as any)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      // Act
      await sessionController.revokeSession(mockRequest, mockRes);

      // Assert
      expect(mockUpdateQuery.where).toHaveBeenCalledWith({ id: 'session-456' });
      expect(mockUpdateQuery.update).toHaveBeenCalledWith({ revoked_at: expect.any(Date) });
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Session revoked successfully'
      });
    });

    it('should return 404 when session not found', async () => {
      // Arrange
      mockRequest.params = { sessionId: 'nonexistent-session' };

      const mockSelectQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockSelectQuery as any);

      // Act
      await sessionController.revokeSession(mockRequest, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    });

    it('should verify session belongs to user', async () => {
      // Arrange
      mockRequest.params = { sessionId: 'session-789' };

      const mockSelectQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockSelectQuery as any);

      // Act
      await sessionController.revokeSession(mockRequest, mockRes);

      // Assert
      expect(mockSelectQuery.where).toHaveBeenCalledWith({
        id: 'session-789',
        user_id: 'user-123'
      });
    });

    it('should not revoke already revoked session', async () => {
      // Arrange
      mockRequest.params = { sessionId: 'revoked-session' };

      const mockSelectQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null) // Already revoked
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockSelectQuery as any);

      // Act
      await sessionController.revokeSession(mockRequest, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should create audit log after revoking session', async () => {
      // Arrange
      mockRequest.params = { sessionId: 'session-123' };

      const mockSession = {
        id: 'session-123',
        user_id: 'user-123',
        ip_address: '10.0.0.1',
        user_agent: 'Safari'
      };

      const mockSelectQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockSession)
      };

      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockSelectQuery as any)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      // Act
      await sessionController.revokeSession(mockRequest, mockRes);

      // Assert
      expect(mockAuditQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          action: 'session_revoked',
          resource_type: 'session',
          resource_id: 'session-123',
          status: 'success'
        })
      );
    });

    it('should include revoked session metadata in audit log', async () => {
      // Arrange
      mockRequest.params = { sessionId: 'session-999' };

      const mockSession = {
        id: 'session-999',
        user_id: 'user-123',
        ip_address: '172.16.0.1',
        user_agent: 'Edge'
      };

      const mockSelectQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockSession)
      };

      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockSelectQuery as any)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      // Act
      await sessionController.revokeSession(mockRequest, mockRes);

      // Assert
      expect(mockAuditQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            revoked_session_ip: '172.16.0.1',
            revoked_session_user_agent: 'Edge'
          }
        })
      );
    });

    it('should handle database errors', async () => {
      // Arrange
      mockRequest.params = { sessionId: 'session-error' };

      const mockSelectQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockSelectQuery as any);

      // Act
      await sessionController.revokeSession(mockRequest, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to revoke session',
        code: 'INTERNAL_ERROR'
      });
    });
  });

  // =============================================================================
  // GROUP 3: invalidateAllSessions() - 6 test cases
  // =============================================================================

  describe('invalidateAllSessions()', () => {
    it('should successfully invalidate all sessions except current', async () => {
      // Arrange
      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        whereNot: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(3) // 3 sessions revoked
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      // Act
      await sessionController.invalidateAllSessions(mockRequest, mockRes);

      // Assert
      expect(mockUpdateQuery.where).toHaveBeenCalledWith({ user_id: 'user-123' });
      expect(mockUpdateQuery.whereNull).toHaveBeenCalledWith('revoked_at');
      expect(mockUpdateQuery.whereNot).toHaveBeenCalledWith('session_token', 'current-token-123');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: '3 sessions invalidated',
        sessions_revoked: 3
      });
    });

    it('should preserve current session', async () => {
      // Arrange
      mockRequest.headers.authorization = 'Bearer my-current-token';

      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        whereNot: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(2)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      // Act
      await sessionController.invalidateAllSessions(mockRequest, mockRes);

      // Assert
      expect(mockUpdateQuery.whereNot).toHaveBeenCalledWith('session_token', 'my-current-token');
    });

    it('should handle case with no other sessions', async () => {
      // Arrange
      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        whereNot: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(0) // No sessions revoked
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      // Act
      await sessionController.invalidateAllSessions(mockRequest, mockRes);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: '0 sessions invalidated',
        sessions_revoked: 0
      });
    });

    it('should create audit log with session count', async () => {
      // Arrange
      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        whereNot: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(5)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      // Act
      await sessionController.invalidateAllSessions(mockRequest, mockRes);

      // Assert
      expect(mockAuditQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          action: 'all_sessions_invalidated',
          metadata: {
            sessions_revoked: 5,
            kept_current_session: true
          }
        })
      );
    });

    it('should only revoke non-revoked sessions', async () => {
      // Arrange
      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        whereNot: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(2)
      };

      const mockAuditQuery = {
        insert: jest.fn().mockResolvedValue([1])
      };

      (db as jest.MockedFunction<typeof db>)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockAuditQuery as any);

      // Act
      await sessionController.invalidateAllSessions(mockRequest, mockRes);

      // Assert
      expect(mockUpdateQuery.whereNull).toHaveBeenCalledWith('revoked_at');
    });

    it('should handle database errors', async () => {
      // Arrange
      const mockUpdateQuery = {
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        whereNot: jest.fn().mockReturnThis(),
        update: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      (db as jest.MockedFunction<typeof db>).mockReturnValue(mockUpdateQuery as any);

      // Act
      await sessionController.invalidateAllSessions(mockRequest, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to invalidate sessions',
        code: 'INTERNAL_ERROR'
      });
    });
  });
});
