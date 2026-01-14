/**
 * Unit tests for src/utils/audit-logger.ts
 * Tests audit logging for event operations
 */

import { EventAuditLogger } from '../../../src/utils/audit-logger';
import { createMockKnex, mockKnexInstance } from '../../__mocks__/knex.mock';

// Mock pino logger
jest.mock('pino', () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

describe('utils/audit-logger', () => {
  let auditLogger: EventAuditLogger;
  let mockDb: ReturnType<typeof createMockKnex>;
  let pinoMock: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockKnex();
    auditLogger = new EventAuditLogger(mockDb as any);
    pinoMock = require('pino')();
  });

  describe('EventAuditLogger class', () => {
    describe('constructor', () => {
      it('should create instance with db dependency', () => {
        expect(auditLogger).toBeDefined();
        expect(auditLogger).toBeInstanceOf(EventAuditLogger);
      });
    });

    describe('logEventAction()', () => {
      it('should insert audit log entry into database', async () => {
        await auditLogger.logEventAction(
          'test_action',
          'event-123',
          'user-456',
          { eventData: { name: 'Test Event' } }
        );

        expect(mockDb).toHaveBeenCalledWith('audit_logs');
        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            service: 'event-service',
            user_id: 'user-456',
            action: 'event_test_action',
            action_type: 'UPDATE',
            resource_type: 'event',
            resource_id: 'event-123',
            success: true,
          })
        );
      });

      it('should include metadata in audit entry', async () => {
        await auditLogger.logEventAction(
          'update',
          'event-789',
          'user-111',
          {
            eventData: { name: 'Concert' },
            updates: { status: 'PUBLISHED' },
            requestId: 'req-123',
          }
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              eventData: { name: 'Concert' },
              updates: { status: 'PUBLISHED' },
              requestId: 'req-123',
            }),
          })
        );
      });

      it('should include IP address from metadata', async () => {
        await auditLogger.logEventAction(
          'view',
          'event-123',
          'user-456',
          { ip: '192.168.1.1' }
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            ip_address: '192.168.1.1',
          })
        );
      });

      it('should include ipAddress from metadata (alternate key)', async () => {
        await auditLogger.logEventAction(
          'view',
          'event-123',
          'user-456',
          { ipAddress: '10.0.0.1' }
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            ip_address: '10.0.0.1',
          })
        );
      });

      it('should include user agent from metadata', async () => {
        await auditLogger.logEventAction(
          'access',
          'event-123',
          'user-456',
          { userAgent: 'Mozilla/5.0' }
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            user_agent: 'Mozilla/5.0',
          })
        );
      });

      it('should use custom action type when provided', async () => {
        await auditLogger.logEventAction(
          'create',
          'event-123',
          'user-456',
          {},
          'CREATE'
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            action_type: 'CREATE',
          })
        );
      });

      it('should log success after writing to database', async () => {
        await auditLogger.logEventAction(
          'test',
          'event-123',
          'user-456'
        );

        expect(pinoMock.info).toHaveBeenCalled();
      });

      it('should not throw when database insert fails', async () => {
        mockKnexInstance.insert.mockRejectedValueOnce(new Error('DB Error'));

        await expect(
          auditLogger.logEventAction('action', 'event-123', 'user-456')
        ).resolves.not.toThrow();
      });

      it('should log error when database insert fails', async () => {
        mockKnexInstance.insert.mockRejectedValueOnce(new Error('DB Error'));

        await auditLogger.logEventAction('action', 'event-123', 'user-456');

        expect(pinoMock.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
          }),
          expect.stringContaining('Failed to write audit log')
        );
      });
    });

    describe('logEventCreation()', () => {
      it('should log event creation with CREATE action type', async () => {
        await auditLogger.logEventCreation(
          'user-123',
          'event-456',
          { name: 'New Event', status: 'DRAFT' }
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'event_created',
            action_type: 'CREATE',
            resource_id: 'event-456',
            user_id: 'user-123',
          })
        );
      });

      it('should include event data in metadata', async () => {
        const eventData = {
          name: 'Concert',
          venue_id: 'venue-789',
          starts_at: '2026-03-15T19:00:00Z',
        };

        await auditLogger.logEventCreation('user-123', 'event-456', eventData);

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              eventData,
            }),
          })
        );
      });

      it('should include request info when provided', async () => {
        await auditLogger.logEventCreation(
          'user-123',
          'event-456',
          { name: 'Event' },
          { ip: '192.168.1.1', userAgent: 'TestAgent', requestId: 'req-789' }
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            ip_address: '192.168.1.1',
            user_agent: 'TestAgent',
          })
        );
      });
    });

    describe('logEventUpdate()', () => {
      it('should log event update with UPDATE action type', async () => {
        await auditLogger.logEventUpdate(
          'user-123',
          'event-456',
          { status: 'PUBLISHED' }
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'event_updated',
            action_type: 'UPDATE',
            resource_id: 'event-456',
            user_id: 'user-123',
          })
        );
      });

      it('should include changes in metadata', async () => {
        const changes = {
          status: 'PUBLISHED',
          name: 'Updated Event Name',
        };

        await auditLogger.logEventUpdate('user-123', 'event-456', changes);

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              updates: changes,
            }),
          })
        );
      });

      it('should include request info when provided', async () => {
        await auditLogger.logEventUpdate(
          'user-123',
          'event-456',
          { status: 'ON_SALE' },
          { requestId: 'req-update-123' }
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              requestId: 'req-update-123',
            }),
          })
        );
      });
    });

    describe('logEventDeletion()', () => {
      it('should log event deletion with DELETE action type', async () => {
        await auditLogger.logEventDeletion('user-123', 'event-456');

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'event_deleted',
            action_type: 'DELETE',
            resource_id: 'event-456',
            user_id: 'user-123',
          })
        );
      });

      it('should include request info when provided', async () => {
        await auditLogger.logEventDeletion(
          'user-123',
          'event-456',
          { ip: '10.0.0.1', reason: 'User requested' }
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            ip_address: '10.0.0.1',
          })
        );
      });
    });

    describe('logEventAccess()', () => {
      it('should log successful access with ACCESS action type', async () => {
        await auditLogger.logEventAccess(
          'user-123',
          'event-456',
          'view',
          true
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'event_access_view',
            action_type: 'ACCESS',
            resource_id: 'event-456',
            user_id: 'user-123',
            success: true,
          })
        );
      });

      it('should log denied access with success: false', async () => {
        await auditLogger.logEventAccess(
          'user-123',
          'event-456',
          'edit',
          false
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'event_access_edit',
            success: false,
            metadata: expect.objectContaining({
              allowed: false,
            }),
          })
        );
      });

      it('should include request info when provided', async () => {
        await auditLogger.logEventAccess(
          'user-123',
          'event-456',
          'admin',
          true,
          { ip: '192.168.1.100', userAgent: 'AdminClient', requestId: 'admin-req-1' }
        );

        expect(mockKnexInstance.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            ip_address: '192.168.1.100',
            user_agent: 'AdminClient',
            metadata: expect.objectContaining({
              requestId: 'admin-req-1',
              allowed: true,
            }),
          })
        );
      });

      it('should not throw when database insert fails', async () => {
        mockKnexInstance.insert.mockRejectedValueOnce(new Error('DB Error'));

        await expect(
          auditLogger.logEventAccess('user-123', 'event-456', 'view', true)
        ).resolves.not.toThrow();
      });

      it('should log error when database insert fails', async () => {
        mockKnexInstance.insert.mockRejectedValueOnce(new Error('DB Error'));

        await auditLogger.logEventAccess('user-123', 'event-456', 'view', true);

        expect(pinoMock.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
          }),
          expect.stringContaining('Failed to write audit log')
        );
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty metadata', async () => {
      await auditLogger.logEventAction('test', 'event-123', 'user-456', {});

      expect(mockKnexInstance.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ip_address: null,
          user_agent: null,
        })
      );
    });

    it('should handle undefined metadata', async () => {
      await auditLogger.logEventAction('test', 'event-123', 'user-456');

      expect(mockKnexInstance.insert).toHaveBeenCalled();
    });

    it('should handle special characters in event IDs', async () => {
      await auditLogger.logEventCreation(
        'user-123',
        'event-with-special/chars:test',
        { name: 'Test' }
      );

      expect(mockKnexInstance.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_id: 'event-with-special/chars:test',
        })
      );
    });

    it('should handle very long metadata', async () => {
      const longData = {
        description: 'A'.repeat(10000),
        tags: Array(100).fill('tag'),
      };

      await expect(
        auditLogger.logEventCreation('user-123', 'event-456', longData)
      ).resolves.not.toThrow();
    });
  });

  describe('Integration scenarios', () => {
    it('should log full event lifecycle', async () => {
      const userId = 'user-lifecycle';
      const eventId = 'event-lifecycle';

      // Create
      await auditLogger.logEventCreation(userId, eventId, {
        name: 'Lifecycle Event',
        status: 'DRAFT',
      });

      // Update
      await auditLogger.logEventUpdate(userId, eventId, {
        status: 'PUBLISHED',
      });

      // Access
      await auditLogger.logEventAccess(userId, eventId, 'view', true);

      // Delete
      await auditLogger.logEventDeletion(userId, eventId);

      // Verify all actions were logged
      expect(mockKnexInstance.insert).toHaveBeenCalledTimes(4);
    });
  });
});
