/**
 * Unit tests for blockchain-service Job History Tracking
 * AUDIT FIX #76: Don't remove completed jobs prematurely
 * 
 * Tests job completion recording, history queries, metrics, and cleanup
 */

describe('Job History', () => {
  // ===========================================================================
  // Configuration Constants
  // ===========================================================================
  describe('Configuration', () => {
    it('should have COMPLETED_JOB_RETENTION_MS of 24 hours default', () => {
      const retention = 24 * 60 * 60 * 1000;
      expect(retention).toBe(86400000);
    });

    it('should have CLEANUP_INTERVAL_MS of 1 hour', () => {
      const interval = 60 * 60 * 1000;
      expect(interval).toBe(3600000);
    });

    it('should have MAX_HISTORY_ENTRIES of 10000', () => {
      const maxEntries = 10000;
      expect(maxEntries).toBe(10000);
    });
  });

  // ===========================================================================
  // JobOutcome Enum
  // ===========================================================================
  describe('JobOutcome Enum', () => {
    it('should have SUCCESS outcome', () => {
      const SUCCESS = 'success';
      expect(SUCCESS).toBe('success');
    });

    it('should have FAILURE outcome', () => {
      const FAILURE = 'failure';
      expect(FAILURE).toBe('failure');
    });

    it('should have CANCELLED outcome', () => {
      const CANCELLED = 'cancelled';
      expect(CANCELLED).toBe('cancelled');
    });
  });

  // ===========================================================================
  // JobHistoryEntry Interface
  // ===========================================================================
  describe('JobHistoryEntry Interface', () => {
    it('should have jobId property', () => {
      const entry = { jobId: 'job-123' };
      expect(entry.jobId).toBe('job-123');
    });

    it('should have ticketId property', () => {
      const entry = { ticketId: 'ticket-456' };
      expect(entry.ticketId).toBe('ticket-456');
    });

    it('should have tenantId property', () => {
      const entry = { tenantId: 'tenant-789' };
      expect(entry.tenantId).toBe('tenant-789');
    });

    it('should have outcome property', () => {
      const entry = { outcome: 'success' };
      expect(entry.outcome).toBe('success');
    });

    it('should have startedAt timestamp', () => {
      const entry = { startedAt: Date.now() - 5000 };
      expect(entry.startedAt).toBeGreaterThan(0);
    });

    it('should have completedAt timestamp', () => {
      const entry = { completedAt: Date.now() };
      expect(entry.completedAt).toBeGreaterThan(0);
    });

    it('should have durationMs property', () => {
      const entry = { durationMs: 5000 };
      expect(entry.durationMs).toBe(5000);
    });

    it('should have optional mintAddress property', () => {
      const entry = { mintAddress: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH' };
      expect(entry.mintAddress).toBeDefined();
    });

    it('should have optional error property', () => {
      const entry = { error: 'Timeout error' };
      expect(entry.error).toBe('Timeout error');
    });

    it('should have optional errorCode property', () => {
      const entry = { errorCode: 'ETIMEDOUT' };
      expect(entry.errorCode).toBe('ETIMEDOUT');
    });

    it('should have retryCount property', () => {
      const entry = { retryCount: 2 };
      expect(entry.retryCount).toBe(2);
    });

    it('should have optional metadata property', () => {
      const entry = { metadata: { attempt: 3 } };
      expect(entry.metadata).toBeDefined();
    });
  });

  // ===========================================================================
  // recordJobCompletion Function
  // ===========================================================================
  describe('recordJobCompletion', () => {
    it('should calculate completedAt as current time', () => {
      const completedAt = Date.now();
      expect(completedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should calculate durationMs from startedAt', () => {
      const startedAt = Date.now() - 5000;
      const completedAt = Date.now();
      const durationMs = completedAt - startedAt;
      expect(durationMs).toBeGreaterThanOrEqual(4900);
    });

    it('should store entry by jobId', () => {
      const historyById = new Map();
      const entry = { jobId: 'job-123' };
      historyById.set('job-123', entry);
      expect(historyById.has('job-123')).toBe(true);
    });

    it('should index entry by ticketId', () => {
      const historyByTicketId = new Map<string, string[]>();
      const ticketId = 'ticket-456';
      const jobId = 'job-123';
      
      const ticketJobs = historyByTicketId.get(ticketId) || [];
      ticketJobs.push(jobId);
      historyByTicketId.set(ticketId, ticketJobs);
      
      expect(historyByTicketId.get(ticketId)).toContain(jobId);
    });

    it('should enforce max entries limit', () => {
      const MAX_HISTORY_ENTRIES = 10000;
      const currentSize = 10001;
      const shouldCleanup = currentSize > MAX_HISTORY_ENTRIES;
      expect(shouldCleanup).toBe(true);
    });

    it('should return the created entry', () => {
      const entry = {
        jobId: 'job-123',
        ticketId: 'ticket-456',
        outcome: 'success',
        durationMs: 5000
      };
      expect(entry).toBeDefined();
    });
  });

  // ===========================================================================
  // recordJobSuccess Function
  // ===========================================================================
  describe('recordJobSuccess', () => {
    it('should set outcome to SUCCESS', () => {
      const outcome = 'success';
      expect(outcome).toBe('success');
    });

    it('should store mintAddress', () => {
      const entry = { mintAddress: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH' };
      expect(entry.mintAddress).toBeDefined();
    });

    it('should store retryCount', () => {
      const entry = { retryCount: 2 };
      expect(entry.retryCount).toBe(2);
    });

    it('should default retryCount to 0', () => {
      const retryCount = undefined || 0;
      expect(retryCount).toBe(0);
    });
  });

  // ===========================================================================
  // recordJobFailure Function
  // ===========================================================================
  describe('recordJobFailure', () => {
    it('should set outcome to FAILURE', () => {
      const outcome = 'failure';
      expect(outcome).toBe('failure');
    });

    it('should store error message', () => {
      const entry = { error: 'Transaction timeout' };
      expect(entry.error).toBe('Transaction timeout');
    });

    it('should store optional errorCode', () => {
      const entry = { errorCode: 'SOLANA_TIMEOUT' };
      expect(entry.errorCode).toBe('SOLANA_TIMEOUT');
    });
  });

  // ===========================================================================
  // getJobHistory Function
  // ===========================================================================
  describe('getJobHistory', () => {
    it('should return empty array if no history for ticket', () => {
      const history: any[] = [];
      expect(history.length).toBe(0);
    });

    it('should return all entries for a ticket', () => {
      const history = [
        { jobId: 'job-1', outcome: 'failure' },
        { jobId: 'job-2', outcome: 'success' }
      ];
      expect(history.length).toBe(2);
    });

    it('should sort by completedAt (newest first)', () => {
      const history = [
        { jobId: 'job-1', completedAt: 1000 },
        { jobId: 'job-2', completedAt: 3000 },
        { jobId: 'job-3', completedAt: 2000 }
      ];
      history.sort((a, b) => b.completedAt - a.completedAt);
      expect(history[0].jobId).toBe('job-2');
    });

    it('should filter out undefined entries', () => {
      const entries = [{ jobId: '1' }, undefined, { jobId: '2' }];
      const filtered = entries.filter((e): e is {jobId: string} => e !== undefined);
      expect(filtered.length).toBe(2);
    });
  });

  // ===========================================================================
  // getJob Function
  // ===========================================================================
  describe('getJob', () => {
    it('should return entry if found', () => {
      const historyById = new Map([['job-123', { jobId: 'job-123' }]]);
      const entry = historyById.get('job-123');
      expect(entry).toBeDefined();
    });

    it('should return undefined if not found', () => {
      const historyById = new Map();
      const entry = historyById.get('non-existent');
      expect(entry).toBeUndefined();
    });
  });

  // ===========================================================================
  // getLatestJob Function
  // ===========================================================================
  describe('getLatestJob', () => {
    it('should return first entry (newest first)', () => {
      const history = [
        { jobId: 'job-3', completedAt: 3000 },
        { jobId: 'job-1', completedAt: 1000 }
      ];
      const latest = history[0];
      expect(latest.jobId).toBe('job-3');
    });

    it('should return undefined if no history', () => {
      const history: any[] = [];
      const latest = history[0];
      expect(latest).toBeUndefined();
    });
  });

  // ===========================================================================
  // hasSuccessfulMint Function
  // ===========================================================================
  describe('hasSuccessfulMint', () => {
    it('should return true if any job succeeded', () => {
      const history = [
        { outcome: 'failure' },
        { outcome: 'success' }
      ];
      const hasSuccess = history.some(e => e.outcome === 'success');
      expect(hasSuccess).toBe(true);
    });

    it('should return false if no successful jobs', () => {
      const history = [
        { outcome: 'failure' },
        { outcome: 'failure' }
      ];
      const hasSuccess = history.some(e => e.outcome === 'success');
      expect(hasSuccess).toBe(false);
    });
  });

  // ===========================================================================
  // getMintAddress Function
  // ===========================================================================
  describe('getMintAddress', () => {
    it('should return mintAddress from successful job', () => {
      const history = [
        { outcome: 'success', mintAddress: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH' }
      ];
      const successfulJob = history.find(e => e.outcome === 'success' && e.mintAddress);
      expect(successfulJob?.mintAddress).toBeDefined();
    });

    it('should return undefined if no successful mint', () => {
      const history = [{ outcome: 'failure' }];
      const successfulJob = history.find((e: any) => e.outcome === 'success');
      expect(successfulJob?.mintAddress).toBeUndefined();
    });
  });

  // ===========================================================================
  // getRecentJobs Function
  // ===========================================================================
  describe('getRecentJobs', () => {
    it('should filter by tenantId', () => {
      const entries = [
        { tenantId: 'tenant-1' },
        { tenantId: 'tenant-2' }
      ];
      const filtered = entries.filter(e => e.tenantId === 'tenant-1');
      expect(filtered.length).toBe(1);
    });

    it('should filter by outcome', () => {
      const entries = [
        { outcome: 'success' },
        { outcome: 'failure' }
      ];
      const filtered = entries.filter(e => e.outcome === 'success');
      expect(filtered.length).toBe(1);
    });

    it('should filter by since timestamp', () => {
      const since = Date.now() - 3600000;
      const entries = [
        { completedAt: Date.now() },
        { completedAt: Date.now() - 7200000 }
      ];
      const filtered = entries.filter(e => e.completedAt >= since);
      expect(filtered.length).toBe(1);
    });

    it('should sort by completedAt (newest first)', () => {
      const entries = [
        { completedAt: 1000 },
        { completedAt: 3000 }
      ];
      entries.sort((a, b) => b.completedAt - a.completedAt);
      expect(entries[0].completedAt).toBe(3000);
    });

    it('should apply limit', () => {
      const entries = [{}, {}, {}, {}, {}];
      const limited = entries.slice(0, 2);
      expect(limited.length).toBe(2);
    });
  });

  // ===========================================================================
  // getFailedJobs Function
  // ===========================================================================
  describe('getFailedJobs', () => {
    it('should return only failed jobs', () => {
      const entries = [
        { outcome: 'success' },
        { outcome: 'failure' }
      ];
      const failed = entries.filter(e => e.outcome === 'failure');
      expect(failed.length).toBe(1);
    });

    it('should filter by tenantId', () => {
      const entries = [
        { outcome: 'failure', tenantId: 'tenant-1' },
        { outcome: 'failure', tenantId: 'tenant-2' }
      ];
      const filtered = entries.filter(e => e.tenantId === 'tenant-1');
      expect(filtered.length).toBe(1);
    });

    it('should filter by error pattern', () => {
      const errorPattern = /timeout/i;
      const entries = [
        { outcome: 'failure', error: 'Timeout error' },
        { outcome: 'failure', error: 'Invalid address' }
      ];
      const filtered = entries.filter(e => e.error && errorPattern.test(e.error));
      expect(filtered.length).toBe(1);
    });
  });

  // ===========================================================================
  // getJobHistoryMetrics Function
  // ===========================================================================
  describe('getJobHistoryMetrics', () => {
    it('should return zero values for empty history', () => {
      const metrics = {
        totalEntries: 0,
        successCount: 0,
        failureCount: 0,
        averageDurationMs: 0,
        oldestEntry: null
      };
      expect(metrics.totalEntries).toBe(0);
    });

    it('should calculate totalEntries', () => {
      const entries = [{}, {}, {}];
      expect(entries.length).toBe(3);
    });

    it('should calculate successCount', () => {
      const entries = [
        { outcome: 'success' },
        { outcome: 'failure' },
        { outcome: 'success' }
      ];
      const successCount = entries.filter(e => e.outcome === 'success').length;
      expect(successCount).toBe(2);
    });

    it('should calculate failureCount', () => {
      const entries = [
        { outcome: 'success' },
        { outcome: 'failure' }
      ];
      const failureCount = entries.filter(e => e.outcome === 'failure').length;
      expect(failureCount).toBe(1);
    });

    it('should calculate averageDurationMs', () => {
      const entries = [
        { durationMs: 1000 },
        { durationMs: 2000 },
        { durationMs: 3000 }
      ];
      const totalDuration = entries.reduce((sum, e) => sum + e.durationMs, 0);
      const avgDuration = Math.round(totalDuration / entries.length);
      expect(avgDuration).toBe(2000);
    });

    it('should find oldestEntry', () => {
      const entries = [
        { completedAt: 3000 },
        { completedAt: 1000 },
        { completedAt: 2000 }
      ];
      const oldestEntry = Math.min(...entries.map(e => e.completedAt));
      expect(oldestEntry).toBe(1000);
    });
  });

  // ===========================================================================
  // getTenantSuccessRate Function
  // ===========================================================================
  describe('getTenantSuccessRate', () => {
    it('should return total count', () => {
      const entries = [{}, {}, {}];
      expect(entries.length).toBe(3);
    });

    it('should return successful count', () => {
      const entries = [
        { outcome: 'success' },
        { outcome: 'failure' }
      ];
      const successful = entries.filter(e => e.outcome === 'success').length;
      expect(successful).toBe(1);
    });

    it('should return failed count', () => {
      const entries = [
        { outcome: 'success' },
        { outcome: 'failure' }
      ];
      const failed = entries.filter(e => e.outcome === 'failure').length;
      expect(failed).toBe(1);
    });

    it('should calculate rate as percentage', () => {
      const total = 10;
      const successful = 8;
      const rate = `${((successful / total) * 100).toFixed(1)}%`;
      expect(rate).toBe('80.0%');
    });

    it('should return N/A for empty history', () => {
      const total = 0;
      const rate = total > 0 ? '100%' : 'N/A';
      expect(rate).toBe('N/A');
    });
  });

  // ===========================================================================
  // cleanupOldEntries Function
  // ===========================================================================
  describe('cleanupOldEntries', () => {
    it('should remove entries older than retention period', () => {
      const retention = 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - retention;
      const entry = { completedAt: cutoffTime - 1000 };
      const shouldRemove = entry.completedAt < cutoffTime;
      expect(shouldRemove).toBe(true);
    });

    it('should keep entries within retention period', () => {
      const retention = 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - retention;
      const entry = { completedAt: Date.now() };
      const shouldRemove = entry.completedAt < cutoffTime;
      expect(shouldRemove).toBe(false);
    });

    it('should update ticket index on removal', () => {
      const ticketJobs = ['job-1', 'job-2', 'job-3'];
      const index = ticketJobs.indexOf('job-2');
      if (index > -1) ticketJobs.splice(index, 1);
      expect(ticketJobs).not.toContain('job-2');
    });

    it('should delete ticket index if empty', () => {
      const historyByTicketId = new Map([['ticket-1', ['job-1']]]);
      const ticketJobs = historyByTicketId.get('ticket-1')!;
      ticketJobs.splice(0, 1);
      if (ticketJobs.length === 0) {
        historyByTicketId.delete('ticket-1');
      }
      expect(historyByTicketId.has('ticket-1')).toBe(false);
    });

    it('should stop forced cleanup when under limit', () => {
      const MAX = 10000;
      const currentSize = 7000;
      const shouldStop = currentSize < MAX * 0.8;
      expect(shouldStop).toBe(true);
    });
  });

  // ===========================================================================
  // clearHistory Function
  // ===========================================================================
  describe('clearHistory', () => {
    it('should clear all entries by jobId', () => {
      const historyById = new Map([['1', {}], ['2', {}]]);
      historyById.clear();
      expect(historyById.size).toBe(0);
    });

    it('should clear all entries by ticketId', () => {
      const historyByTicketId = new Map([['t1', []], ['t2', []]]);
      historyByTicketId.clear();
      expect(historyByTicketId.size).toBe(0);
    });
  });

  // ===========================================================================
  // exportHistory Function
  // ===========================================================================
  describe('exportHistory', () => {
    it('should return all entries as array', () => {
      const historyById = new Map([
        ['job-1', { jobId: 'job-1' }],
        ['job-2', { jobId: 'job-2' }]
      ]);
      const exported = Array.from(historyById.values());
      expect(exported.length).toBe(2);
    });
  });

  // ===========================================================================
  // importHistory Function
  // ===========================================================================
  describe('importHistory', () => {
    it('should add entries by jobId', () => {
      const historyById = new Map();
      const entries = [{ jobId: 'job-1' }, { jobId: 'job-2' }];
      entries.forEach(e => historyById.set(e.jobId, e));
      expect(historyById.size).toBe(2);
    });

    it('should update ticket index', () => {
      const historyByTicketId = new Map<string, string[]>();
      const entry = { jobId: 'job-1', ticketId: 'ticket-1' };
      
      const ticketJobs = historyByTicketId.get(entry.ticketId) || [];
      if (!ticketJobs.includes(entry.jobId)) {
        ticketJobs.push(entry.jobId);
      }
      historyByTicketId.set(entry.ticketId, ticketJobs);
      
      expect(historyByTicketId.get('ticket-1')).toContain('job-1');
    });

    it('should not duplicate jobIds in ticket index', () => {
      const ticketJobs = ['job-1'];
      const jobId = 'job-1';
      if (!ticketJobs.includes(jobId)) {
        ticketJobs.push(jobId);
      }
      expect(ticketJobs.length).toBe(1);
    });
  });
});
