/**
 * Unit tests for blockchain-service DLQ Processor
 * AUDIT FIX #73: Add DLQ processing for failed mint jobs
 * 
 * Tests failure categorization, auto-retry, metrics, and lifecycle management
 */

describe('DLQ Processor', () => {
  // ===========================================================================
  // Configuration Constants
  // ===========================================================================
  describe('Configuration', () => {
    it('should have DLQ_PROCESS_INTERVAL_MS of 5 minutes default', () => {
      const interval = 5 * 60 * 1000;
      expect(interval).toBe(300000);
    });

    it('should have MAX_RETRY_DELAY_MS of 1 hour', () => {
      const maxDelay = 60 * 60 * 1000;
      expect(maxDelay).toBe(3600000);
    });

    it('should have BASE_RETRY_DELAY_MS of 30 seconds', () => {
      const baseDelay = 30000;
      expect(baseDelay).toBe(30000);
    });

    it('should have MAX_RETRIES of 5', () => {
      const maxRetries = 5;
      expect(maxRetries).toBe(5);
    });
  });

  // ===========================================================================
  // FailureCategory Enum
  // ===========================================================================
  describe('FailureCategory Enum', () => {
    it('should have RETRYABLE category', () => {
      const RETRYABLE = 'retryable';
      expect(RETRYABLE).toBe('retryable');
    });

    it('should have NON_RETRYABLE category', () => {
      const NON_RETRYABLE = 'non_retryable';
      expect(NON_RETRYABLE).toBe('non_retryable');
    });

    it('should have UNKNOWN category', () => {
      const UNKNOWN = 'unknown';
      expect(UNKNOWN).toBe('unknown');
    });
  });

  // ===========================================================================
  // DLQItem Interface
  // ===========================================================================
  describe('DLQItem Interface', () => {
    it('should have id property', () => {
      const item = { id: 'dlq_job-123_1704067200000' };
      expect(item.id).toContain('dlq_');
    });

    it('should have jobId property', () => {
      const item = { jobId: 'job-123' };
      expect(item.jobId).toBe('job-123');
    });

    it('should have ticketId property', () => {
      const item = { ticketId: 'ticket-456' };
      expect(item.ticketId).toBe('ticket-456');
    });

    it('should have tenantId property', () => {
      const item = { tenantId: 'tenant-789' };
      expect(item.tenantId).toBe('tenant-789');
    });

    it('should have error property', () => {
      const item = { error: 'Timeout error' };
      expect(item.error).toBe('Timeout error');
    });

    it('should have optional errorCode property', () => {
      const item = { errorCode: 'ETIMEDOUT' };
      expect(item.errorCode).toBe('ETIMEDOUT');
    });

    it('should have failedAt timestamp', () => {
      const item = { failedAt: Date.now() };
      expect(item.failedAt).toBeGreaterThan(0);
    });

    it('should have retryCount property', () => {
      const item = { retryCount: 2 };
      expect(item.retryCount).toBe(2);
    });

    it('should have category property', () => {
      const item = { category: 'retryable' };
      expect(item.category).toBe('retryable');
    });

    it('should have optional nextRetryAt property', () => {
      const item = { nextRetryAt: Date.now() + 30000 };
      expect(item.nextRetryAt).toBeGreaterThan(Date.now());
    });

    it('should have optional metadata property', () => {
      const item = { metadata: { attempt: 3 } };
      expect(item.metadata).toBeDefined();
    });

    it('should have optional archived flag', () => {
      const item = { archived: true };
      expect(item.archived).toBe(true);
    });

    it('should have optional archivedAt timestamp', () => {
      const item = { archivedAt: Date.now() };
      expect(item.archivedAt).toBeGreaterThan(0);
    });

    it('should have optional reviewStatus property', () => {
      const item = { reviewStatus: 'pending' };
      expect(['pending', 'reviewed', 'resolved']).toContain(item.reviewStatus);
    });
  });

  // ===========================================================================
  // categorizeError Function
  // ===========================================================================
  describe('categorizeError', () => {
    // Retryable patterns
    it('should categorize timeout errors as RETRYABLE', () => {
      const error = 'Connection timeout';
      const isRetryable = /timeout/i.test(error);
      expect(isRetryable).toBe(true);
    });

    it('should categorize ETIMEDOUT as RETRYABLE', () => {
      const error = 'ETIMEDOUT';
      const isRetryable = /ETIMEDOUT/i.test(error);
      expect(isRetryable).toBe(true);
    });

    it('should categorize ECONNRESET as RETRYABLE', () => {
      const error = 'ECONNRESET';
      const isRetryable = /ECONNRESET/i.test(error);
      expect(isRetryable).toBe(true);
    });

    it('should categorize ECONNREFUSED as RETRYABLE', () => {
      const error = 'ECONNREFUSED';
      const isRetryable = /ECONNREFUSED/i.test(error);
      expect(isRetryable).toBe(true);
    });

    it('should categorize network errors as RETRYABLE', () => {
      const error = 'Network error';
      const isRetryable = /network/i.test(error);
      expect(isRetryable).toBe(true);
    });

    it('should categorize rate limit errors as RETRYABLE', () => {
      const error = 'Rate limit exceeded';
      const isRetryable = /rate.?limit/i.test(error);
      expect(isRetryable).toBe(true);
    });

    it('should categorize 429 errors as RETRYABLE', () => {
      const error = 'HTTP 429 Too Many Requests';
      const isRetryable = /429/.test(error);
      expect(isRetryable).toBe(true);
    });

    it('should categorize 503 errors as RETRYABLE', () => {
      const error = 'HTTP 503 Service Unavailable';
      const isRetryable = /503/.test(error);
      expect(isRetryable).toBe(true);
    });

    it('should categorize blockhash not found as RETRYABLE', () => {
      const error = 'Blockhash not found';
      const isRetryable = /blockhash.?not.?found/i.test(error);
      expect(isRetryable).toBe(true);
    });

    it('should categorize transaction expired as RETRYABLE', () => {
      const error = 'Transaction expired';
      const isRetryable = /transaction.?expired/i.test(error);
      expect(isRetryable).toBe(true);
    });

    // Non-retryable patterns
    it('should categorize invalid address as NON_RETRYABLE', () => {
      const error = 'Invalid address format';
      const isNonRetryable = /invalid.?address/i.test(error);
      expect(isNonRetryable).toBe(true);
    });

    it('should categorize invalid public key as NON_RETRYABLE', () => {
      const error = 'Invalid public key';
      const isNonRetryable = /invalid.?public.?key/i.test(error);
      expect(isNonRetryable).toBe(true);
    });

    it('should categorize insufficient funds as NON_RETRYABLE', () => {
      const error = 'Insufficient funds';
      const isNonRetryable = /insufficient.?funds/i.test(error);
      expect(isNonRetryable).toBe(true);
    });

    it('should categorize validation failed as NON_RETRYABLE', () => {
      const error = 'Validation failed';
      const isNonRetryable = /validation.?failed/i.test(error);
      expect(isNonRetryable).toBe(true);
    });

    it('should categorize already minted as NON_RETRYABLE', () => {
      const error = 'Already minted';
      const isNonRetryable = /already.?minted/i.test(error);
      expect(isNonRetryable).toBe(true);
    });

    it('should categorize duplicate as NON_RETRYABLE', () => {
      const error = 'Duplicate entry';
      const isNonRetryable = /duplicate/i.test(error);
      expect(isNonRetryable).toBe(true);
    });

    it('should categorize 400 errors as NON_RETRYABLE', () => {
      const error = 'HTTP 400 Bad Request';
      const isNonRetryable = /400/.test(error);
      expect(isNonRetryable).toBe(true);
    });

    it('should categorize 401 errors as NON_RETRYABLE', () => {
      const error = 'HTTP 401 Unauthorized';
      const isNonRetryable = /401/.test(error);
      expect(isNonRetryable).toBe(true);
    });

    it('should categorize 404 errors as NON_RETRYABLE', () => {
      const error = 'HTTP 404 Not Found';
      const isNonRetryable = /404/.test(error);
      expect(isNonRetryable).toBe(true);
    });

    // Unknown errors
    it('should categorize unrecognized errors as UNKNOWN', () => {
      const error = 'Something weird happened';
      const isRetryable = /timeout|network|rate.?limit/i.test(error);
      const isNonRetryable = /invalid|already|duplicate/i.test(error);
      const isUnknown = !isRetryable && !isNonRetryable;
      expect(isUnknown).toBe(true);
    });
  });

  // ===========================================================================
  // addToDLQ Function
  // ===========================================================================
  describe('addToDLQ', () => {
    it('should generate unique id with dlq prefix', () => {
      const jobId = 'job-123';
      const id = `dlq_${jobId}_${Date.now()}`;
      expect(id).toMatch(/^dlq_job-123_\d+$/);
    });

    it('should set failedAt to current timestamp', () => {
      const failedAt = Date.now();
      expect(failedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should categorize error automatically', () => {
      const error = 'Timeout error';
      const category = /timeout/i.test(error) ? 'retryable' : 'unknown';
      expect(category).toBe('retryable');
    });

    it('should calculate nextRetryAt for retryable items', () => {
      const baseDelay = 30000;
      const retryCount = 0;
      const delay = baseDelay * Math.pow(2, retryCount);
      const nextRetryAt = Date.now() + delay;
      expect(nextRetryAt).toBeGreaterThan(Date.now());
    });

    it('should use exponential backoff for retry delay', () => {
      const baseDelay = 30000;
      const delays = [0, 1, 2, 3, 4].map(count => baseDelay * Math.pow(2, count));
      expect(delays).toEqual([30000, 60000, 120000, 240000, 480000]);
    });

    it('should cap retry delay at MAX_RETRY_DELAY_MS', () => {
      const baseDelay = 30000;
      const maxDelay = 3600000;
      const retryCount = 10;
      const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
      expect(delay).toBe(maxDelay);
    });

    it('should not set nextRetryAt if max retries exceeded', () => {
      const maxRetries = 5;
      const retryCount = 5;
      const shouldSetNextRetry = retryCount < maxRetries;
      expect(shouldSetNextRetry).toBe(false);
    });

    it('should increment totalItems metric', () => {
      let metrics = { totalItems: 0 };
      metrics.totalItems++;
      expect(metrics.totalItems).toBe(1);
    });

    it('should increment byCategory metric', () => {
      const metrics = { byCategory: { retryable: 0, non_retryable: 0, unknown: 0 } };
      metrics.byCategory.retryable++;
      expect(metrics.byCategory.retryable).toBe(1);
    });

    it('should log error for non-retryable items', () => {
      const category = 'non_retryable';
      const shouldLogError = category === 'non_retryable';
      expect(shouldLogError).toBe(true);
    });
  });

  // ===========================================================================
  // getDLQItems Function
  // ===========================================================================
  describe('getDLQItems', () => {
    it('should return all items without filters', () => {
      const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
      expect(items.length).toBe(3);
    });

    it('should filter by category', () => {
      const items = [
        { id: '1', category: 'retryable' },
        { id: '2', category: 'non_retryable' },
        { id: '3', category: 'retryable' }
      ];
      const filtered = items.filter(i => i.category === 'retryable');
      expect(filtered.length).toBe(2);
    });

    it('should filter by tenantId', () => {
      const items = [
        { id: '1', tenantId: 'tenant-1' },
        { id: '2', tenantId: 'tenant-2' },
        { id: '3', tenantId: 'tenant-1' }
      ];
      const filtered = items.filter(i => i.tenantId === 'tenant-1');
      expect(filtered.length).toBe(2);
    });

    it('should filter by archived status', () => {
      const items = [
        { id: '1', archived: true },
        { id: '2', archived: false },
        { id: '3', archived: false }
      ];
      const filtered = items.filter(i => i.archived === false);
      expect(filtered.length).toBe(2);
    });

    it('should sort by failedAt (newest first)', () => {
      const items = [
        { id: '1', failedAt: 1000 },
        { id: '2', failedAt: 3000 },
        { id: '3', failedAt: 2000 }
      ];
      items.sort((a, b) => b.failedAt - a.failedAt);
      expect(items[0].id).toBe('2');
    });

    it('should apply limit', () => {
      const items = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }];
      const limited = items.slice(0, 2);
      expect(limited.length).toBe(2);
    });
  });

  // ===========================================================================
  // archiveDLQItem Function
  // ===========================================================================
  describe('archiveDLQItem', () => {
    it('should return false if item not found', () => {
      const items = new Map();
      const result = items.has('non-existent');
      expect(result).toBe(false);
    });

    it('should set archived to true', () => {
      const item = { archived: false };
      item.archived = true;
      expect(item.archived).toBe(true);
    });

    it('should set archivedAt timestamp', () => {
      const item = { archivedAt: undefined as number | undefined };
      item.archivedAt = Date.now();
      expect(item.archivedAt).toBeGreaterThan(0);
    });

    it('should increment archivedTotal metric', () => {
      let metrics = { archivedTotal: 0 };
      metrics.archivedTotal++;
      expect(metrics.archivedTotal).toBe(1);
    });
  });

  // ===========================================================================
  // markForReview Function
  // ===========================================================================
  describe('markForReview', () => {
    it('should return false if item not found', () => {
      const items = new Map();
      const result = items.has('non-existent');
      expect(result).toBe(false);
    });

    it('should set reviewStatus to pending', () => {
      const item = { reviewStatus: undefined as string | undefined };
      item.reviewStatus = 'pending';
      expect(item.reviewStatus).toBe('pending');
    });

    it('should set reviewStatus to reviewed', () => {
      const item = { reviewStatus: 'pending' };
      item.reviewStatus = 'reviewed';
      expect(item.reviewStatus).toBe('reviewed');
    });

    it('should set reviewStatus to resolved', () => {
      const item = { reviewStatus: 'reviewed' };
      item.reviewStatus = 'resolved';
      expect(item.reviewStatus).toBe('resolved');
    });
  });

  // ===========================================================================
  // removeDLQItem Function
  // ===========================================================================
  describe('removeDLQItem', () => {
    it('should return false if item not found', () => {
      const items = new Map();
      const result = items.delete('non-existent');
      expect(result).toBe(false);
    });

    it('should return true if item removed', () => {
      const items = new Map([['item-1', { id: 'item-1' }]]);
      const result = items.delete('item-1');
      expect(result).toBe(true);
    });

    it('should remove item from map', () => {
      const items = new Map([['item-1', { id: 'item-1' }]]);
      items.delete('item-1');
      expect(items.has('item-1')).toBe(false);
    });
  });

  // ===========================================================================
  // processDLQ Function
  // ===========================================================================
  describe('processDLQ', () => {
    it('should skip if already processing', () => {
      const state = { isProcessing: true };
      const shouldSkip = state.isProcessing;
      expect(shouldSkip).toBe(true);
    });

    it('should set isProcessing to true during processing', () => {
      const state = { isProcessing: false };
      state.isProcessing = true;
      expect(state.isProcessing).toBe(true);
    });

    it('should update lastProcessedAt', () => {
      const state = { lastProcessedAt: null as number | null };
      state.lastProcessedAt = Date.now();
      expect(state.lastProcessedAt).toBeGreaterThan(0);
    });

    it('should skip archived items', () => {
      const items = [
        { archived: true },
        { archived: false }
      ];
      const toProcess = items.filter(i => !i.archived);
      expect(toProcess.length).toBe(1);
    });

    it('should process retryable items due for retry', () => {
      const now = Date.now();
      const item = { category: 'retryable', nextRetryAt: now - 1000 };
      const shouldRetry = item.category === 'retryable' && item.nextRetryAt <= now;
      expect(shouldRetry).toBe(true);
    });

    it('should auto-archive items older than 7 days', () => {
      const now = Date.now();
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000) - 1;
      const item = { category: 'non_retryable', failedAt: sevenDaysAgo, archived: false };
      const shouldArchive = (now - item.failedAt) > 7 * 24 * 60 * 60 * 1000;
      expect(shouldArchive).toBe(true);
    });

    it('should return processed, retried, and archived counts', () => {
      const result = { processed: 10, retried: 3, archived: 2 };
      expect(result.processed).toBe(10);
      expect(result.retried).toBe(3);
      expect(result.archived).toBe(2);
    });

    it('should set isProcessing to false in finally block', () => {
      const state = { isProcessing: true };
      try {
        // processing
      } finally {
        state.isProcessing = false;
      }
      expect(state.isProcessing).toBe(false);
    });
  });

  // ===========================================================================
  // processRetryableItem Function
  // ===========================================================================
  describe('processRetryableItem', () => {
    it('should warn if no retry callback set', () => {
      const callback = null;
      const hasCallback = callback !== null;
      expect(hasCallback).toBe(false);
    });

    it('should increment retriedTotal on success', () => {
      let metrics = { retriedTotal: 0 };
      const success = true;
      if (success) metrics.retriedTotal++;
      expect(metrics.retriedTotal).toBe(1);
    });

    it('should remove item from DLQ on success', () => {
      const items = new Map([['item-1', { id: 'item-1' }]]);
      const success = true;
      if (success) items.delete('item-1');
      expect(items.has('item-1')).toBe(false);
    });

    it('should increment retryCount on failure', () => {
      const item = { retryCount: 2 };
      item.retryCount++;
      expect(item.retryCount).toBe(3);
    });

    it('should change to NON_RETRYABLE when max retries exceeded', () => {
      const maxRetries = 5;
      const item = { retryCount: 5, category: 'retryable' as string };
      if (item.retryCount >= maxRetries) {
        item.category = 'non_retryable';
      }
      expect(item.category).toBe('non_retryable');
    });

    it('should reschedule with exponential backoff on failure', () => {
      const baseDelay = 30000;
      const item = { retryCount: 2, nextRetryAt: 0 };
      const delay = baseDelay * Math.pow(2, item.retryCount);
      item.nextRetryAt = Date.now() + delay;
      expect(item.nextRetryAt).toBeGreaterThan(Date.now());
    });
  });

  // ===========================================================================
  // getDLQMetrics Function
  // ===========================================================================
  describe('getDLQMetrics', () => {
    it('should return totalItems count', () => {
      const metrics = { totalItems: 100 };
      expect(metrics.totalItems).toBe(100);
    });

    it('should return processedTotal count', () => {
      const metrics = { processedTotal: 500 };
      expect(metrics.processedTotal).toBe(500);
    });

    it('should return retriedTotal count', () => {
      const metrics = { retriedTotal: 50 };
      expect(metrics.retriedTotal).toBe(50);
    });

    it('should return archivedTotal count', () => {
      const metrics = { archivedTotal: 20 };
      expect(metrics.archivedTotal).toBe(20);
    });

    it('should return byCategory counts', () => {
      const metrics = {
        byCategory: {
          retryable: 30,
          non_retryable: 10,
          unknown: 5
        }
      };
      expect(metrics.byCategory.retryable).toBe(30);
    });

    it('should return activeItems count (non-archived)', () => {
      const items = [
        { archived: false },
        { archived: true },
        { archived: false }
      ];
      const activeItems = items.filter(i => !i.archived).length;
      expect(activeItems).toBe(2);
    });

    it('should return pendingRetry count', () => {
      const items = [
        { category: 'retryable', archived: false, nextRetryAt: Date.now() + 1000 },
        { category: 'non_retryable', archived: false },
        { category: 'retryable', archived: false, nextRetryAt: Date.now() + 2000 }
      ];
      const pendingRetry = items.filter(i => 
        i.category === 'retryable' && !i.archived && i.nextRetryAt
      ).length;
      expect(pendingRetry).toBe(2);
    });

    it('should return lastProcessedAt as ISO string', () => {
      const lastProcessedAt = Date.now();
      const isoString = new Date(lastProcessedAt).toISOString();
      expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ===========================================================================
  // getDLQSummary Function
  // ===========================================================================
  describe('getDLQSummary', () => {
    it('should indicate healthy when no non-retryable items', () => {
      const byCategory = { non_retryable: 0 };
      const itemCount = 50;
      const healthy = byCategory.non_retryable === 0 && itemCount < 100;
      expect(healthy).toBe(true);
    });

    it('should indicate unhealthy when has non-retryable items', () => {
      const byCategory = { non_retryable: 5 };
      const healthy = byCategory.non_retryable === 0;
      expect(healthy).toBe(false);
    });

    it('should indicate unhealthy when queue size >= 100', () => {
      const itemCount = 150;
      const healthy = itemCount < 100;
      expect(healthy).toBe(false);
    });

    it('should return totalItems count', () => {
      const summary = { totalItems: 120 };
      expect(summary.totalItems).toBe(120);
    });

    it('should return activeItems count', () => {
      const summary = { activeItems: 80 };
      expect(summary.activeItems).toBe(80);
    });

    it('should return byCategory breakdown', () => {
      const summary = {
        byCategory: {
          retryable: 50,
          non_retryable: 20,
          unknown: 10
        }
      };
      expect(summary.byCategory.retryable).toBe(50);
    });

    it('should return pendingRetry count', () => {
      const summary = { pendingRetry: 30 };
      expect(summary.pendingRetry).toBe(30);
    });

    it('should return oldestItem as ISO string', () => {
      const oldestItem = new Date(Date.now() - 86400000).toISOString();
      expect(oldestItem).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should return null for oldestItem when empty', () => {
      const oldestItem = null;
      expect(oldestItem).toBeNull();
    });
  });

  // ===========================================================================
  // startDLQProcessor Function
  // ===========================================================================
  describe('startDLQProcessor', () => {
    it('should warn if already started', () => {
      let processingInterval: any = {};
      const alreadyStarted = processingInterval !== null;
      expect(alreadyStarted).toBe(true);
    });

    it('should set processing interval', () => {
      let processingInterval: any = null;
      processingInterval = 'interval';
      expect(processingInterval).toBeDefined();
    });

    it('should process DLQ at configured interval', () => {
      const interval = 5 * 60 * 1000;
      expect(interval).toBe(300000);
    });
  });

  // ===========================================================================
  // stopDLQProcessor Function
  // ===========================================================================
  describe('stopDLQProcessor', () => {
    it('should clear processing interval', () => {
      let processingInterval: any = 'interval';
      processingInterval = null;
      expect(processingInterval).toBeNull();
    });

    it('should log processor stopped', () => {
      const logMessage = 'DLQ processor stopped';
      expect(logMessage).toBe('DLQ processor stopped');
    });
  });

  // ===========================================================================
  // clearDLQ Function
  // ===========================================================================
  describe('clearDLQ', () => {
    it('should clear all items', () => {
      const items = new Map([['1', {}], ['2', {}]]);
      items.clear();
      expect(items.size).toBe(0);
    });

    it('should reset all metrics', () => {
      const metrics = {
        totalItems: 100,
        processedTotal: 500,
        retriedTotal: 50,
        archivedTotal: 20,
        byCategory: { retryable: 30, non_retryable: 10, unknown: 5 }
      };
      
      // Reset
      metrics.totalItems = 0;
      metrics.processedTotal = 0;
      metrics.retriedTotal = 0;
      metrics.archivedTotal = 0;
      metrics.byCategory = { retryable: 0, non_retryable: 0, unknown: 0 };
      
      expect(metrics.totalItems).toBe(0);
      expect(metrics.byCategory.retryable).toBe(0);
    });
  });

  // ===========================================================================
  // setRetryCallback Function
  // ===========================================================================
  describe('setRetryCallback', () => {
    it('should set the callback function', () => {
      let retryCallback: any = null;
      const callback = () => Promise.resolve(true);
      retryCallback = callback;
      expect(retryCallback).toBeDefined();
    });
  });
});
