import { EventAuditLogger } from '../../../src/utils/audit-logger';

jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('Event Audit Logger Utils', () => {
  let auditLogger: EventAuditLogger;
  let mockDb: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      insert: jest.fn().mockResolvedValue([]),
    };

    mockDb = jest.fn(() => mockQueryBuilder);
    auditLogger = new EventAuditLogger(mockDb as any);
  });

  describe('logEventAction', () => {
    it('should log event action successfully', async () => {
      await auditLogger.logEventAction('created', 'event-123', 'user-456', {
        eventData: { name: 'Test Event' },
      });

      expect(mockDb).toHaveBeenCalledWith('audit_logs');
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-456',
          action: 'event_created',
          resource_type: 'event',
          resource_id: 'event-123',
          status: 'success',
        })
      );
    });

    it('should handle metadata correctly', async () => {
      const metadata = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        eventData: { name: 'Test' },
      };

      await auditLogger.logEventAction('updated', 'event-123', 'user-456', metadata);

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
        })
      );
    });

    it('should not throw on database error', async () => {
      mockQueryBuilder.insert.mockRejectedValue(new Error('DB error'));

      await expect(
        auditLogger.logEventAction('created', 'event-123', 'user-456')
      ).resolves.not.toThrow();
    });
  });

  describe('logEventCreation', () => {
    it('should log event creation', async () => {
      await auditLogger.logEventCreation('user-123', 'event-456', { name: 'New Event' });

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'event_created',
          user_id: 'user-123',
          resource_id: 'event-456',
        })
      );
    });
  });

  describe('logEventUpdate', () => {
    it('should log event update', async () => {
      await auditLogger.logEventUpdate('user-123', 'event-456', { name: 'Updated' });

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'event_updated',
        })
      );
    });
  });

  describe('logEventDeletion', () => {
    it('should log event deletion', async () => {
      await auditLogger.logEventDeletion('user-123', 'event-456');

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'event_deleted',
        })
      );
    });
  });

  describe('logEventAccess', () => {
    it('should log allowed access', async () => {
      await auditLogger.logEventAccess('user-123', 'event-456', 'view', true);

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'event_access_view',
          status: 'success',
        })
      );
    });

    it('should log denied access', async () => {
      await auditLogger.logEventAccess('user-123', 'event-456', 'edit', false);

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'event_access_edit',
          status: 'failure',
        })
      );
    });

    it('should not throw on database error', async () => {
      mockQueryBuilder.insert.mockRejectedValue(new Error('DB error'));

      await expect(
        auditLogger.logEventAccess('user-123', 'event-456', 'view', true)
      ).resolves.not.toThrow();
    });
  });
});
