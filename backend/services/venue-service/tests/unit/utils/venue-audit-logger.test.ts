import { VenueAuditLogger } from '../../../src/utils/venue-audit-logger';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123'),
}));

describe('Venue Audit Logger Utils', () => {
  let auditLogger: VenueAuditLogger;
  let mockDb: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      insert: jest.fn().mockResolvedValue([]),
    };

    mockDb = jest.fn(() => mockQueryBuilder);

    auditLogger = new VenueAuditLogger(mockDb as any);
  });

  // =============================================================================
  // log - 4 test cases
  // =============================================================================

  describe('log', () => {
    it('should log audit entry successfully', async () => {
      await auditLogger.log('venue_created', 'user-123', 'venue-456');

      expect(mockDb).toHaveBeenCalledWith('audit_logs');
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-123',
          action: 'venue_created',
          user_id: 'user-123',
          resource_type: 'venue',
          resource_id: 'venue-456',
          status: 'success',
        })
      );
    });

    it('should include additional data in audit log', async () => {
      const data = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        tenantId: 'tenant-789',
      };

      await auditLogger.log('venue_updated', 'user-123', 'venue-456', data);

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          metadata: data,
        })
      );
    });

    it('should handle missing data gracefully', async () => {
      await auditLogger.log('venue_deleted', 'user-123', 'venue-456');

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ip_address: null,
          user_agent: null,
          metadata: {},
        })
      );
    });

    it('should not throw on database error', async () => {
      mockQueryBuilder.insert.mockRejectedValue(new Error('DB error'));

      await expect(
        auditLogger.log('venue_created', 'user-123', 'venue-456')
      ).resolves.not.toThrow();
    });
  });
});
