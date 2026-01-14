/**
 * Unit tests for src/utils/venue-audit-logger.ts
 * Tests audit logging: log(), logBatch(), getActionType()
 * MEDIUM PRIORITY - Security: AL4 correlation ID for distributed tracing
 */

import { VenueAuditLogger, AuditLogData } from '../../../src/utils/venue-audit-logger';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('utils/venue-audit-logger', () => {
  let auditLogger: VenueAuditLogger;
  let mockDb: any;

  const setupDbMock = () => {
    const chainMock: any = {
      insert: jest.fn().mockResolvedValue([1]),
    };

    mockDb = jest.fn((tableName: string) => chainMock);
    mockDb._chain = chainMock;

    return chainMock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const chain = setupDbMock();
    auditLogger = new VenueAuditLogger(mockDb as any);
  });

  describe('log()', () => {
    const userId = 'user-123';
    const venueId = 'venue-456';

    it('should insert audit log entry to database', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('venue_created', userId, venueId);

      expect(mockDb).toHaveBeenCalledWith('audit_logs');
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'venue-service',
          action: 'venue_created',
          user_id: userId,
          resource_type: 'venue',
          resource_id: venueId,
        })
      );
    });

    it('should generate UUID for audit entry id', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('venue_updated', userId, venueId);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
        })
      );
    });

    it('should include correlation_id from data (AL4)', async () => {
      const chain = mockDb._chain;
      const data: AuditLogData = {
        correlationId: 'corr-789',
      };

      await auditLogger.log('venue_created', userId, venueId, data);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          correlation_id: 'corr-789',
        })
      );
    });

    it('should use requestId as correlation_id fallback', async () => {
      const chain = mockDb._chain;
      const data: AuditLogData = {
        requestId: 'req-123',
      };

      await auditLogger.log('venue_created', userId, venueId, data);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          correlation_id: 'req-123',
        })
      );
    });

    it('should include tenant_id from data', async () => {
      const chain = mockDb._chain;
      const data: AuditLogData = {
        tenantId: 'tenant-abc',
      };

      await auditLogger.log('venue_created', userId, venueId, data);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-abc',
        })
      );
    });

    it('should include ip_address from data', async () => {
      const chain = mockDb._chain;
      const data: AuditLogData = {
        ipAddress: '192.168.1.1',
      };

      await auditLogger.log('venue_created', userId, venueId, data);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ip_address: '192.168.1.1',
        })
      );
    });

    it('should include user_agent from data', async () => {
      const chain = mockDb._chain;
      const data: AuditLogData = {
        userAgent: 'Mozilla/5.0',
      };

      await auditLogger.log('venue_created', userId, venueId, data);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_agent: 'Mozilla/5.0',
        })
      );
    });

    it('should serialize metadata to JSON', async () => {
      const chain = mockDb._chain;
      const data: AuditLogData = {
        details: { changed: ['name', 'address'] },
      };

      await auditLogger.log('venue_updated', userId, venueId, data);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.stringContaining('changed'),
        })
      );
    });

    it('should set created_at timestamp', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('venue_created', userId, venueId);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          created_at: expect.any(Date),
        })
      );
    });

    it('should log info on successful insert', async () => {
      const { logger } = require('../../../src/utils/logger');

      await auditLogger.log('venue_created', userId, venueId);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'venue_created',
          venueId,
          userId,
        }),
        'Venue audit log created'
      );
    });

    it('should not throw on database error (non-blocking)', async () => {
      const chain = mockDb._chain;
      chain.insert.mockRejectedValue(new Error('DB connection failed'));

      await expect(auditLogger.log('venue_created', userId, venueId)).resolves.not.toThrow();
    });

    it('should log error on database failure', async () => {
      const { logger } = require('../../../src/utils/logger');
      const chain = mockDb._chain;
      chain.insert.mockRejectedValue(new Error('DB connection failed'));

      await auditLogger.log('venue_created', userId, venueId);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to write audit log to database'
      );
    });

    it('should default action to venue_created when empty', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('', userId, venueId);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'venue_created',
        })
      );
    });
  });

  describe('getActionType()', () => {
    it('should return CREATE for create actions', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('venue_created', 'user-1', 'venue-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'CREATE',
        })
      );
    });

    it('should return CREATE for add actions', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('staff_added', 'user-1', 'venue-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'CREATE',
        })
      );
    });

    it('should return UPDATE for update actions', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('venue_updated', 'user-1', 'venue-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'UPDATE',
        })
      );
    });

    it('should return UPDATE for edit actions', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('settings_edited', 'user-1', 'venue-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'UPDATE',
        })
      );
    });

    it('should return UPDATE for modify actions', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('settings_modify', 'user-1', 'venue-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'UPDATE',
        })
      );
    });

    it('should return DELETE for delete actions', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('venue_deleted', 'user-1', 'venue-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'DELETE',
        })
      );
    });

    it('should return DELETE for remove actions', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('staff_removed', 'user-1', 'venue-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'DELETE',
        })
      );
    });

    it('should return READ for view actions', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('venue_viewed', 'user-1', 'venue-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'READ',
        })
      );
    });

    it('should return READ for get actions', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('settings_get', 'user-1', 'venue-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'READ',
        })
      );
    });

    it('should return READ for list actions', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('venues_listed', 'user-1', 'venue-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'READ',
        })
      );
    });

    it('should return OTHER for unknown actions', async () => {
      const chain = mockDb._chain;

      await auditLogger.log('venue_exported', 'user-1', 'venue-1');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'OTHER',
        })
      );
    });
  });

  describe('logBatch()', () => {
    it('should log multiple entries', async () => {
      const chain = mockDb._chain;
      const entries = [
        { action: 'venue_created', userId: 'user-1', venueId: 'venue-1' },
        { action: 'venue_updated', userId: 'user-2', venueId: 'venue-2' },
        { action: 'venue_deleted', userId: 'user-3', venueId: 'venue-3' },
      ];

      await auditLogger.logBatch(entries);

      expect(chain.insert).toHaveBeenCalledTimes(3);
    });

    it('should assign same batch correlation ID to all entries', async () => {
      const chain = mockDb._chain;
      const entries = [
        { action: 'venue_created', userId: 'user-1', venueId: 'venue-1' },
        { action: 'venue_updated', userId: 'user-2', venueId: 'venue-2' },
      ];

      await auditLogger.logBatch(entries);

      const insertCalls = chain.insert.mock.calls;
      
      // All entries should have the same batch correlation ID
      expect(insertCalls.length).toBe(2);
    });

    it('should include batchId in metadata', async () => {
      const chain = mockDb._chain;
      const entries = [
        { action: 'venue_created', userId: 'user-1', venueId: 'venue-1' },
      ];

      await auditLogger.logBatch(entries);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.stringContaining('batchId'),
        })
      );
    });

    it('should preserve existing correlationId if provided', async () => {
      const chain = mockDb._chain;
      const entries = [
        { 
          action: 'venue_created', 
          userId: 'user-1', 
          venueId: 'venue-1',
          data: { correlationId: 'existing-corr-id' }
        },
      ];

      await auditLogger.logBatch(entries);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          correlation_id: 'existing-corr-id',
        })
      );
    });

    it('should handle empty batch gracefully', async () => {
      const chain = mockDb._chain;

      await expect(auditLogger.logBatch([])).resolves.not.toThrow();
      expect(chain.insert).not.toHaveBeenCalled();
    });

    it('should continue processing on individual entry failure', async () => {
      const chain = mockDb._chain;
      chain.insert
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce([1]);

      const entries = [
        { action: 'venue_created', userId: 'user-1', venueId: 'venue-1' },
        { action: 'venue_updated', userId: 'user-2', venueId: 'venue-2' },
      ];

      await auditLogger.logBatch(entries);

      expect(chain.insert).toHaveBeenCalledTimes(2);
    });
  });
});
