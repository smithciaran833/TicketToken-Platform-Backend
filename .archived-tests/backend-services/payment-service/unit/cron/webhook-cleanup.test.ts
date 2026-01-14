import { Pool } from 'pg';
import { WebhookCleanup } from '../../../src/cron/webhook-cleanup';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('WebhookCleanup', () => {
  let webhookCleanup: WebhookCleanup;
  let mockPool: any;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    mockPool = {
      query: jest.fn(),
    };

    webhookCleanup = new WebhookCleanup(mockPool as Pool);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ===========================================================================
  // run() - Delete Processed Webhooks - 5 test cases
  // ===========================================================================

  describe('run() - Delete Processed Webhooks', () => {
    it('should delete processed webhooks older than 30 days', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 10 });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await webhookCleanup.run();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM webhook_inbox')
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('processed = true')
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '30 days'")
      );
    });

    it('should log start of cleanup process', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 5 });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await webhookCleanup.run();

      expect(consoleSpy).toHaveBeenCalledWith('Starting webhook cleanup...');
    });

    it('should log number of deleted webhooks', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 15 });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await webhookCleanup.run();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Deleted'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('15'));
    });

    it('should handle zero deleted webhooks', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await webhookCleanup.run();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('0'));
    });

    it('should execute DELETE query before SELECT query', async () => {
      const callOrder: string[] = [];
      mockPool.query.mockImplementation((query: string) => {
        if (query.includes('DELETE')) {
          callOrder.push('DELETE');
          return Promise.resolve({ rowCount: 5 });
        } else {
          callOrder.push('SELECT');
          return Promise.resolve({ rows: [] });
        }
      });

      await webhookCleanup.run();

      expect(callOrder).toEqual(['DELETE', 'SELECT']);
    });
  });

  // ===========================================================================
  // run() - Archive Failed Webhooks - 6 test cases
  // ===========================================================================

  describe('run() - Archive Failed Webhooks', () => {
    it('should query for failed webhooks older than 7 days', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await webhookCleanup.run();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM webhook_inbox')
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('processed = false')
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('retry_count >= 5')
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '7 days'")
      );
    });

    it('should log when failed webhooks are found', async () => {
      const failedWebhooks = [
        { id: 'wh-1', retry_count: 5 },
        { id: 'wh-2', retry_count: 6 },
        { id: 'wh-3', retry_count: 7 },
      ];

      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: failedWebhooks });

      await webhookCleanup.run();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('failed webhooks'));
    });

    it('should not log when no failed webhooks found', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await webhookCleanup.run();

      const archiveLog = consoleSpy.mock.calls.find(call =>
        call[0]?.includes('failed webhooks to archive')
      );
      expect(archiveLog).toBeUndefined();
    });

    it('should handle single failed webhook', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'wh-1' }] });

      await webhookCleanup.run();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1'));
    });

    it('should handle large number of failed webhooks', async () => {
      const failedWebhooks = Array(100).fill(null).map((_, i) => ({ id: `wh-${i}` }));

      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: failedWebhooks });

      await webhookCleanup.run();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('100'));
    });

    it('should query for webhooks with retry count >= 5', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await webhookCleanup.run();

      const selectCall = mockPool.query.mock.calls.find((call: any) =>
        call[0].includes('SELECT')
      );
      expect(selectCall).toBeDefined();
      expect(selectCall![0]).toContain('retry_count >= 5');
    });
  });

  // ===========================================================================
  // run() - Error Handling - 3 test cases
  // ===========================================================================

  describe('run() - Error Handling', () => {
    it('should propagate database errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Database connection failed'));

      await expect(webhookCleanup.run()).rejects.toThrow('Database connection failed');
    });

    it('should fail on DELETE query error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DELETE failed'));

      await expect(webhookCleanup.run()).rejects.toThrow('DELETE failed');
    });

    it('should fail on SELECT query error', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
      mockPool.query.mockRejectedValueOnce(new Error('SELECT failed'));

      await expect(webhookCleanup.run()).rejects.toThrow('SELECT failed');
    });
  });
});
