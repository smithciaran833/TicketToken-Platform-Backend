/**
 * Unit Tests for Enhanced Audit Service
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: jest.fn<any>()
  }
}));

describe('EnhancedAuditService', () => {
  let db: any;
  let logger: any;
  let EnhancedAuditService: any;
  let enhancedAudit: any;

  const mockAuditRow = {
    id: 'audit-123',
    tenant_id: 'tenant-1',
    venue_id: 'venue-1',
    user_id: 'user-1',
    action: 'CREATE',
    resource: 'document',
    resource_id: 'doc-123',
    changes: '{"field":"value"}',
    metadata: '{"key":"data"}',
    ip_address: '192.168.1.1',
    user_agent: 'Mozilla/5.0',
    severity: 'medium',
    created_at: new Date('2025-01-15T10:00:00Z')
  };

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    const dbModule = await import('../../../src/services/database.service');
    db = dbModule.db;

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 0 });

    const module = await import('../../../src/services/enhanced-audit.service');
    EnhancedAuditService = module.EnhancedAuditService;
    enhancedAudit = module.enhancedAudit;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should insert audit entry into database', async () => {
      const entry = {
        tenantId: 'tenant-1',
        venueId: 'venue-1',
        userId: 'user-1',
        action: 'CREATE',
        resource: 'document',
        resourceId: 'doc-123',
        changes: { field: 'new_value' },
        metadata: { source: 'api' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        severity: 'medium' as const
      };

      await enhancedAudit.log(entry);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO compliance_audit_log'),
        [
          'tenant-1',
          'venue-1',
          'user-1',
          'CREATE',
          'document',
          'doc-123',
          '{"field":"new_value"}',
          '{"source":"api"}',
          '192.168.1.1',
          'Mozilla/5.0',
          'medium'
        ]
      );
    });

    it('should log info message after insert', async () => {
      const entry = {
        tenantId: 'tenant-1',
        action: 'DELETE',
        resource: 'user',
        metadata: {},
        severity: 'high' as const
      };

      await enhancedAudit.log(entry);

      expect(logger.info).toHaveBeenCalledWith(
        { entry },
        'Audit log: DELETE on user'
      );
    });

    it('should handle missing optional fields', async () => {
      const entry = {
        tenantId: 'tenant-1',
        action: 'VIEW',
        resource: 'report',
        metadata: { viewed: true },
        severity: 'low' as const
      };

      await enhancedAudit.log(entry);

      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'tenant-1',
          undefined, // venueId
          undefined, // userId
          'VIEW',
          'report',
          undefined, // resourceId
          '{}', // empty changes
          '{"viewed":true}',
          undefined, // ipAddress
          undefined, // userAgent
          'low'
        ])
      );
    });

    it('should propagate database errors', async () => {
      (db.query as jest.Mock<any>).mockRejectedValue(new Error('DB connection lost'));

      const entry = {
        tenantId: 'tenant-1',
        action: 'CREATE',
        resource: 'test',
        metadata: {},
        severity: 'low' as const
      };

      await expect(enhancedAudit.log(entry)).rejects.toThrow('DB connection lost');
    });
  });

  describe('getAuditTrail', () => {
    it('should query audit trail with default options', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [mockAuditRow] });

      const result = await enhancedAudit.getAuditTrail('document', 'doc-123', 'tenant-1');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE resource = $1 AND resource_id = $2 AND tenant_id = $3'),
        ['document', 'doc-123', 'tenant-1', 100, 0]
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('audit-123');
    });

    it('should respect limit and offset options', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [] });

      await enhancedAudit.getAuditTrail('venue', 'v-1', 'tenant-1', { limit: 50, offset: 100 });

      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        ['venue', 'v-1', 'tenant-1', 50, 100]
      );
    });

    it('should map database rows to AuditEntry objects', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [mockAuditRow] });

      const result = await enhancedAudit.getAuditTrail('document', 'doc-123', 'tenant-1');

      expect(result[0]).toEqual({
        id: 'audit-123',
        tenantId: 'tenant-1',
        venueId: 'venue-1',
        userId: 'user-1',
        action: 'CREATE',
        resource: 'document',
        resourceId: 'doc-123',
        changes: { field: 'value' },
        metadata: { key: 'data' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        timestamp: new Date('2025-01-15T10:00:00Z'),
        severity: 'medium'
      });
    });

    it('should return empty array when no results', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [] });

      const result = await enhancedAudit.getAuditTrail('nonexistent', 'id', 'tenant-1');

      expect(result).toEqual([]);
    });
  });

  describe('getSecurityEvents', () => {
    it('should query security events with severity filter', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [mockAuditRow] });

      await enhancedAudit.getSecurityEvents('tenant-1', ['high', 'critical']);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('severity = ANY($2)'),
        expect.arrayContaining(['tenant-1', ['high', 'critical']])
      );
    });

    it('should use default 24 hour window when since not provided', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [] });

      const before = Date.now();
      await enhancedAudit.getSecurityEvents('tenant-1', ['critical']);
      const after = Date.now();

      const callArgs = (db.query as jest.Mock<any>).mock.calls[0][1] as any[];
      const sinceDate = callArgs[2] as Date;

      // Should be approximately 24 hours ago
      const expectedTime = before - 24 * 60 * 60 * 1000;
      expect(sinceDate.getTime()).toBeGreaterThanOrEqual(expectedTime - 1000);
      expect(sinceDate.getTime()).toBeLessThanOrEqual(after - 24 * 60 * 60 * 1000 + 1000);
    });

    it('should respect custom since date', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [] });
      const customSince = new Date('2025-01-01');

      await enhancedAudit.getSecurityEvents('tenant-1', ['high'], { since: customSince });

      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([customSince])
      );
    });

    it('should respect custom limit', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [] });

      await enhancedAudit.getSecurityEvents('tenant-1', ['high'], { limit: 50 });

      const callArgs = (db.query as jest.Mock<any>).mock.calls[0][1] as any[];
      expect(callArgs[3]).toBe(50);
    });
  });

  describe('searchAuditLogs', () => {
    it('should search with tenant filter only', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({ rows: [mockAuditRow] });

      const result = await enhancedAudit.searchAuditLogs('tenant-1', {});

      expect(result.total).toBe(5);
      expect(result.entries).toHaveLength(1);
    });

    it('should apply action filter', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await enhancedAudit.searchAuditLogs('tenant-1', { action: 'DELETE' });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('action = $2'),
        expect.arrayContaining(['tenant-1', 'DELETE'])
      );
    });

    it('should apply resource filter', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await enhancedAudit.searchAuditLogs('tenant-1', { resource: 'venue' });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('resource = $'),
        expect.arrayContaining(['venue'])
      );
    });

    it('should apply userId filter', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await enhancedAudit.searchAuditLogs('tenant-1', { userId: 'user-123' });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('user_id = $'),
        expect.arrayContaining(['user-123'])
      );
    });

    it('should apply venueId filter', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '7' }] })
        .mockResolvedValueOnce({ rows: [] });

      await enhancedAudit.searchAuditLogs('tenant-1', { venueId: 'venue-456' });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('venue_id = $'),
        expect.arrayContaining(['venue-456'])
      );
    });

    it('should apply date range filters', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '15' }] })
        .mockResolvedValueOnce({ rows: [] });

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      await enhancedAudit.searchAuditLogs('tenant-1', { startDate, endDate });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('created_at >= $'),
        expect.arrayContaining([startDate, endDate])
      );
    });

    it('should apply multiple filters', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [mockAuditRow] });

      await enhancedAudit.searchAuditLogs('tenant-1', {
        action: 'UPDATE',
        resource: 'document',
        userId: 'user-1'
      });

      const query = (db.query as jest.Mock<any>).mock.calls[0][0];
      expect(query).toContain('action = $');
      expect(query).toContain('resource = $');
      expect(query).toContain('user_id = $');
    });

    it('should respect limit and offset', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ total: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      await enhancedAudit.searchAuditLogs('tenant-1', {}, { limit: 25, offset: 50 });

      const selectQuery = (db.query as jest.Mock<any>).mock.calls[1][0];
      expect(selectQuery).toContain('LIMIT $');
      expect(selectQuery).toContain('OFFSET $');

      const params = (db.query as jest.Mock<any>).mock.calls[1][1];
      expect(params).toContain(25);
      expect(params).toContain(50);
    });
  });

  describe('generateAuditReport', () => {
    const mockSummary = {
      total_events: '150',
      unique_users: '10',
      unique_venues: '5',
      high_severity_events: '3'
    };

    const mockActions = [
      { action: 'CREATE', count: '50' },
      { action: 'UPDATE', count: '40' },
      { action: 'DELETE', count: '10' }
    ];

    const mockUsers = [
      { user_id: 'user-1', count: '30' },
      { user_id: 'user-2', count: '25' }
    ];

    beforeEach(() => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [mockSummary] })
        .mockResolvedValueOnce({ rows: mockActions })
        .mockResolvedValueOnce({ rows: mockUsers });
    });

    it('should generate report with summary stats', async () => {
      const report = await enhancedAudit.generateAuditReport(
        'tenant-1',
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(report.summary).toEqual(mockSummary);
    });

    it('should include top actions', async () => {
      const report = await enhancedAudit.generateAuditReport(
        'tenant-1',
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(report.topActions).toEqual([
        { action: 'CREATE', count: 50 },
        { action: 'UPDATE', count: 40 },
        { action: 'DELETE', count: 10 }
      ]);
    });

    it('should include top users', async () => {
      const report = await enhancedAudit.generateAuditReport(
        'tenant-1',
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(report.topUsers).toEqual([
        { userId: 'user-1', count: 30 },
        { userId: 'user-2', count: 25 }
      ]);
    });

    it('should include security events count', async () => {
      const report = await enhancedAudit.generateAuditReport(
        'tenant-1',
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(report.securityEvents).toBe(3);
    });

    it('should query with correct date range', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      await enhancedAudit.generateAuditReport('tenant-1', startDate, endDate);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('created_at BETWEEN $2 AND $3'),
        ['tenant-1', startDate, endDate]
      );
    });
  });

  describe('mapRowToAuditEntry (private, tested via public methods)', () => {
    it('should handle null changes gracefully', async () => {
      const rowWithNullChanges = { ...mockAuditRow, changes: null };
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [rowWithNullChanges] });

      const result = await enhancedAudit.getAuditTrail('doc', 'id', 'tenant-1');

      expect(result[0].changes).toEqual({});
    });

    it('should handle null metadata gracefully', async () => {
      const rowWithNullMetadata = { ...mockAuditRow, metadata: null };
      (db.query as jest.Mock<any>).mockResolvedValue({ rows: [rowWithNullMetadata] });

      const result = await enhancedAudit.getAuditTrail('doc', 'id', 'tenant-1');

      expect(result[0].metadata).toEqual({});
    });
  });

  describe('exported singleton', () => {
    it('should export enhancedAudit instance', () => {
      expect(enhancedAudit).toBeDefined();
      expect(enhancedAudit.log).toBeInstanceOf(Function);
      expect(enhancedAudit.getAuditTrail).toBeInstanceOf(Function);
      expect(enhancedAudit.getSecurityEvents).toBeInstanceOf(Function);
      expect(enhancedAudit.searchAuditLogs).toBeInstanceOf(Function);
      expect(enhancedAudit.generateAuditReport).toBeInstanceOf(Function);
    });
  });
});
