/**
 * Unit Tests for Scheduler Service
 */

// All mocks BEFORE imports
const mockAuthServiceClient = {
  getAdminUsers: jest.fn<any>()
};

const mockVenueServiceClient = {
  batchGetVenueNames: jest.fn<any>()
};

jest.mock('@tickettoken/shared/clients', () => ({
  authServiceClient: mockAuthServiceClient,
  venueServiceClient: mockVenueServiceClient
}));

jest.mock('@tickettoken/shared/http-client/base-service-client', () => ({
  RequestContext: {}
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger
}));

jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: jest.fn()
  }
}));

jest.mock('../../../src/services/batch.service', () => ({
  batchService: {
    dailyComplianceChecks: jest.fn(),
    generateYear1099Forms: jest.fn()
  }
}));

jest.mock('../../../src/services/ofac-real.service', () => ({
  realOFACService: {
    downloadAndUpdateOFACList: jest.fn()
  }
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn()
}));

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { SchedulerService, schedulerService } from '../../../src/services/scheduler.service';
import { db } from '../../../src/services/database.service';
import { logger } from '../../../src/utils/logger';
import { batchService } from '../../../src/services/batch.service';
import { realOFACService } from '../../../src/services/ofac-real.service';
import * as fs from 'fs';

describe('SchedulerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup default mock returns
    (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 0 });
    (batchService.dailyComplianceChecks as jest.Mock<any>).mockResolvedValue(undefined);
    (batchService.generateYear1099Forms as jest.Mock<any>).mockResolvedValue(undefined);
    (realOFACService.downloadAndUpdateOFACList as jest.Mock<any>).mockResolvedValue(undefined);
    mockAuthServiceClient.getAdminUsers.mockResolvedValue([]);
    mockVenueServiceClient.batchGetVenueNames.mockResolvedValue({ venues: {} });
    (fs.existsSync as jest.Mock<any>).mockReturnValue(true);
  });

  afterEach(() => {
    schedulerService.stopAllJobs();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('startScheduledJobs', () => {
    it('should schedule all jobs', () => {
      schedulerService.startScheduledJobs();

      expect(logger.info).toHaveBeenCalledWith('Starting scheduled compliance jobs...');
      expect(logger.info).toHaveBeenCalledWith('Scheduled jobs started successfully');
    });

    it('should schedule OFAC update job', () => {
      schedulerService.startScheduledJobs();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Scheduled ofac-update')
      );
    });

    it('should schedule compliance checks job', () => {
      schedulerService.startScheduledJobs();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Scheduled compliance-checks')
      );
    });

    it('should schedule weekly report job', () => {
      schedulerService.startScheduledJobs();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Scheduled weekly-report')
      );
    });

    it('should schedule 1099 generation job', () => {
      schedulerService.startScheduledJobs();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Scheduled 1099-generation')
      );
    });
  });

  describe('stopAllJobs', () => {
    it('should stop all scheduled jobs', () => {
      schedulerService.startScheduledJobs();
      schedulerService.stopAllJobs();

      expect(logger.info).toHaveBeenCalledWith('Stopped job: ofac-update');
      expect(logger.info).toHaveBeenCalledWith('Stopped job: compliance-checks');
      expect(logger.info).toHaveBeenCalledWith('Stopped job: weekly-report');
      expect(logger.info).toHaveBeenCalledWith('Stopped job: 1099-generation');
    });

    it('should handle stop when no jobs running', () => {
      expect(() => schedulerService.stopAllJobs()).not.toThrow();
    });

    it('should clear jobs map', () => {
      schedulerService.startScheduledJobs();
      schedulerService.stopAllJobs();

      // Starting again should work without issues
      expect(() => schedulerService.startScheduledJobs()).not.toThrow();
    });
  });

  describe('scheduled job execution', () => {
    it('should run OFAC update when timer fires', async () => {
      await realOFACService.downloadAndUpdateOFACList();

      expect(realOFACService.downloadAndUpdateOFACList).toHaveBeenCalled();
    });

    it('should run daily compliance checks when timer fires', async () => {
      await batchService.dailyComplianceChecks('system');

      expect(batchService.dailyComplianceChecks).toHaveBeenCalledWith('system');
    });
  });

  describe('generateWeeklyComplianceReport', () => {
    beforeEach(() => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ verified: '10', pending: '5', rejected: '2' }] })
        .mockResolvedValueOnce({ rows: [{ total_screenings: '100', matches: '3' }] })
        .mockResolvedValueOnce({ rows: [{ created: '8', resolved: '5' }] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [], rowCount: 1 });
    });

    it('should collect report data from database', async () => {
      const service = new SchedulerService();
      await (service as any).generateWeeklyComplianceReport();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('venue_verifications'),
        expect.any(Array)
      );

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ofac_screenings'),
        expect.any(Array)
      );

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('risk_flags'),
        expect.any(Array)
      );
    });

    it('should create reports directory if not exists', async () => {
      (fs.existsSync as jest.Mock<any>).mockReturnValue(false);

      const service = new SchedulerService();
      await (service as any).generateWeeklyComplianceReport();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      );
    });

    it('should write JSON and text report files', async () => {
      const service = new SchedulerService();
      await (service as any).generateWeeklyComplianceReport();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        expect.any(String)
      );

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.txt'),
        expect.any(String)
      );
    });

    it('should store report record in database', async () => {
      const service = new SchedulerService();
      await (service as any).generateWeeklyComplianceReport();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO compliance_reports'),
        expect.any(Array)
      );
    });

    it('should notify admins of report', async () => {
      mockAuthServiceClient.getAdminUsers.mockResolvedValue([
        { email: 'admin@example.com', firstName: 'Admin', lastName: 'User' }
      ]);

      const service = new SchedulerService();
      await (service as any).generateWeeklyComplianceReport();

      expect(mockAuthServiceClient.getAdminUsers).toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notification_queue'),
        expect.arrayContaining(['admin@example.com'])
      );
    });

    it('should handle venue service failure gracefully', async () => {
      // Don't clear all mocks - just reset what we need
      mockVenueServiceClient.batchGetVenueNames.mockReset();
      (db.query as jest.Mock<any>).mockReset();

      // Setup: Make venueServiceClient reject
      mockVenueServiceClient.batchGetVenueNames.mockRejectedValue(
        new Error('Service unavailable')
      );

      // Setup: Mock db.query responses in correct order
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ verified: '1', pending: '0', rejected: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total_screenings: '1', matches: '0' }] })
        .mockResolvedValueOnce({ rows: [{ created: '0', resolved: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'v-1', tenant_id: 't-1', status: 'approved', verified_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [], rowCount: 1 });

      const service = new SchedulerService();

      await expect((service as any).generateWeeklyComplianceReport()).resolves.not.toThrow();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to get venue names, using fallback'
      );
    });

    it('should handle report generation failure', async () => {
      // Don't clear all mocks - just reset what we need
      (db.query as jest.Mock<any>).mockReset();

      // Setup: Make the first db.query fail
      (db.query as jest.Mock<any>).mockRejectedValueOnce(new Error('Database error'));

      const service = new SchedulerService();

      await (service as any).generateWeeklyComplianceReport();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to generate weekly compliance report'
      );
    });
  });

  describe('generateTextReport', () => {
    it('should generate human-readable report', () => {
      const service = new SchedulerService();
      const reportData = {
        period: { start: new Date('2025-01-01'), end: new Date('2025-01-07') },
        summary: {
          totalVenuesVerified: 10,
          totalVenuesPending: 5,
          totalVenuesRejected: 2,
          totalOFACScreenings: 100,
          ofacMatches: 3,
          riskFlagsCreated: 8,
          riskFlagsResolved: 5,
          highRiskVenues: 2
        },
        venueVerifications: [],
        ofacAlerts: [
          { tenantId: 't-1', entityName: 'Test Entity', matchType: 'potential_match', matchScore: 85, screenedAt: new Date() }
        ],
        riskFlags: [
          { tenantId: 't-1', venueId: 'v-1', reason: 'High transaction volume', resolved: false, createdAt: new Date() }
        ]
      };

      const text = (service as any).generateTextReport(reportData);

      expect(text).toContain('TICKETTOKEN WEEKLY COMPLIANCE REPORT');
      expect(text).toContain('Approved: 10');
      expect(text).toContain('Pending: 5');
      expect(text).toContain('OFAC ALERTS REQUIRING ATTENTION');
      expect(text).toContain('Test Entity');
      expect(text).toContain('NEW RISK FLAGS');
      expect(text).toContain('High transaction volume');
    });

    it('should omit OFAC section when no matches', () => {
      const service = new SchedulerService();
      const reportData = {
        period: { start: new Date(), end: new Date() },
        summary: {
          totalVenuesVerified: 5,
          totalVenuesPending: 0,
          totalVenuesRejected: 0,
          totalOFACScreenings: 50,
          ofacMatches: 0,
          riskFlagsCreated: 0,
          riskFlagsResolved: 0,
          highRiskVenues: 0
        },
        venueVerifications: [],
        ofacAlerts: [],
        riskFlags: []
      };

      const text = (service as any).generateTextReport(reportData);

      expect(text).not.toContain('OFAC ALERTS REQUIRING ATTENTION');
    });
  });

  describe('exported singleton', () => {
    it('should export schedulerService instance', () => {
      expect(schedulerService).toBeDefined();
      expect(schedulerService.startScheduledJobs).toBeInstanceOf(Function);
      expect(schedulerService.stopAllJobs).toBeInstanceOf(Function);
    });
  });
});
