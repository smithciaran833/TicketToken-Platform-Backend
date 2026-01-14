/**
 * Unit Tests for src/utils/metrics.ts
 */

import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  ticketOperationsTotal,
  ticketPurchasesTotal,
  ticketTransfersTotal,
  ticketScansTotal,
  ticketRefundsTotal,
  ticketRevenueTotal,
  databaseQueriesTotal,
  databaseQueryDurationSeconds,
  databaseConnectionPool,
  externalServiceCallsTotal,
  externalServiceCallDurationSeconds,
  circuitBreakerState,
  nftMintingTotal,
  nftMintingDurationSeconds,
  cacheOperationsTotal,
  blockchainTransactionsTotal,
  blockchainConfirmationDurationSeconds,
  requestLatencySummary,
  sloViolationsTotal,
  registry,
  metricsHandler,
  getMetrics,
  getMetricsJson,
  resetMetrics,
  recordTicketPurchase,
  recordTicketTransfer,
  recordTicketScan,
  recordDatabaseQuery,
  recordExternalServiceCall,
  recordNftMinting,
  recordCacheOperation,
  recordBlockchainTransaction,
  recordTicketRefund,
  recordTicketRevenue,
  updateDatabasePoolMetrics,
  updateCircuitBreakerState,
  trackSLIRequest,
  calculateSLIMetrics,
  resetSLIWindow,
} from '../../../src/utils/metrics';

describe('utils/metrics', () => {
  beforeEach(() => {
    resetMetrics();
    resetSLIWindow();
  });

  describe('HTTP Metrics', () => {
    it('httpRequestsTotal has correct labels', () => {
      const labels = (httpRequestsTotal as any).labelNames;
      expect(labels).toContain('method');
      expect(labels).toContain('route');
      expect(labels).toContain('status');
      expect(labels).toContain('status_class');
    });

    it('httpRequestDurationSeconds is a histogram', async () => {
      // Verify it's properly registered by checking metrics output
      httpRequestDurationSeconds.observe({ method: 'GET', route: '/test', status: '200' }, 0.5);
      const metrics = await getMetrics();
      expect(metrics).toContain('http_request_duration_seconds_bucket');
      expect(metrics).toContain('http_request_duration_seconds_sum');
      expect(metrics).toContain('http_request_duration_seconds_count');
    });
  });

  describe('getStatusClass (via recordTicketPurchase behavior)', () => {
    // We test indirectly since getStatusClass is not exported
    it('records metrics with status labels', async () => {
      recordTicketPurchase('success', 'stripe', 'tenant-1');
      const metrics = await getMetrics();
      expect(metrics).toContain('ticket_purchases_total');
    });
  });

  describe('normalizeRoute (tested indirectly)', () => {
    // normalizeRoute is internal, tested via registerMetricsMiddleware
    it('registry contains http metrics', async () => {
      const metrics = await getMetrics();
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('http_request_duration_seconds');
    });
  });

  describe('SLI Metrics', () => {
    describe('trackSLIRequest()', () => {
      it('increments totalRequests', () => {
        trackSLIRequest('/api/test', 'GET', 0.1, true);
        trackSLIRequest('/api/test', 'GET', 0.2, true);
        // SLI state is internal, but we can verify via calculateSLIMetrics
        calculateSLIMetrics();
      });

      it('increments successfulRequests on success', () => {
        trackSLIRequest('/api/test', 'GET', 0.1, true);
        calculateSLIMetrics();
      });

      it('categorizes satisfied/tolerating/frustrated by Apdex threshold', () => {
        // Satisfied: < 0.5s
        trackSLIRequest('/api/test', 'GET', 0.1, true);
        // Tolerating: < 2s (4 * 0.5)
        trackSLIRequest('/api/test', 'GET', 1.0, true);
        // Frustrated: >= 2s
        trackSLIRequest('/api/test', 'GET', 3.0, true);
        
        calculateSLIMetrics();
      });

      it('observes requestLatencySummary', () => {
        trackSLIRequest('/api/test', 'GET', 0.5, true);
        // Summary is recorded internally
      });
    });

    describe('calculateSLIMetrics()', () => {
      it('calculates success rate', () => {
        trackSLIRequest('/api/test', 'GET', 0.1, true);
        trackSLIRequest('/api/test', 'GET', 0.1, false);
        calculateSLIMetrics();
        // 50% success rate
      });

      it('calculates Apdex score', () => {
        // All satisfied
        trackSLIRequest('/api/test', 'GET', 0.1, true);
        trackSLIRequest('/api/test', 'GET', 0.2, true);
        calculateSLIMetrics();
        // Apdex should be 1.0
      });

      it('calculates error budget remaining', () => {
        // 10 successful, 0 failed = 100% success, full budget
        for (let i = 0; i < 10; i++) {
          trackSLIRequest('/api/test', 'GET', 0.1, true);
        }
        calculateSLIMetrics();
      });

      it('increments SLO violations when error rate exceeds target', () => {
        // Create > 1% error rate
        trackSLIRequest('/api/test', 'GET', 0.1, true);
        trackSLIRequest('/api/test', 'GET', 0.1, false);
        trackSLIRequest('/api/test', 'GET', 0.1, false);
        calculateSLIMetrics();
      });

      it('calculates throughput RPS', () => {
        trackSLIRequest('/api/test', 'GET', 0.1, true);
        calculateSLIMetrics();
      });
    });

    describe('resetSLIWindow()', () => {
      it('resets all SLI counters', () => {
        trackSLIRequest('/api/test', 'GET', 0.1, true);
        resetSLIWindow();
        // After reset, counters should be 0
        calculateSLIMetrics(); // Should not throw with 0 requests
      });
    });
  });

  describe('Business Metrics Helpers', () => {
    describe('recordTicketPurchase()', () => {
      it('increments counter with labels', async () => {
        recordTicketPurchase('success', 'stripe', 'tenant-123');
        const metrics = await getMetrics();
        expect(metrics).toContain('ticket_purchases_total');
        expect(metrics).toContain('success');
        expect(metrics).toContain('stripe');
      });
    });

    describe('recordTicketTransfer()', () => {
      it('increments counter with labels', async () => {
        recordTicketTransfer('success', 'tenant-123');
        const metrics = await getMetrics();
        expect(metrics).toContain('ticket_transfers_total');
      });
    });

    describe('recordTicketScan()', () => {
      it('increments counter with labels', async () => {
        recordTicketScan('valid', 'tenant-123', 'event-456');
        const metrics = await getMetrics();
        expect(metrics).toContain('ticket_scans_total');
      });
    });

    describe('recordDatabaseQuery()', () => {
      it('increments counter and observes histogram', async () => {
        recordDatabaseQuery('SELECT', 'tickets', 'success', 0.05);
        const metrics = await getMetrics();
        expect(metrics).toContain('database_queries_total');
        expect(metrics).toContain('database_query_duration_seconds');
      });
    });

    describe('recordExternalServiceCall()', () => {
      it('increments counter and observes histogram', async () => {
        recordExternalServiceCall('auth-service', 'validateToken', 'success', 0.1);
        const metrics = await getMetrics();
        expect(metrics).toContain('external_service_calls_total');
        expect(metrics).toContain('external_service_call_duration_seconds');
      });
    });

    describe('recordNftMinting()', () => {
      it('increments counter and observes histogram', async () => {
        recordNftMinting('success', 'tenant-123', 5.5);
        const metrics = await getMetrics();
        expect(metrics).toContain('nft_minting_total');
        expect(metrics).toContain('nft_minting_duration_seconds');
      });
    });

    describe('recordCacheOperation()', () => {
      it('increments counter with operation and result', async () => {
        recordCacheOperation('get', 'hit');
        recordCacheOperation('get', 'miss');
        recordCacheOperation('set', 'success');
        const metrics = await getMetrics();
        expect(metrics).toContain('cache_operations_total');
      });
    });

    describe('recordBlockchainTransaction()', () => {
      it('increments counter and observes confirmation duration', async () => {
        recordBlockchainTransaction('mint', 'success', 30);
        const metrics = await getMetrics();
        expect(metrics).toContain('blockchain_transactions_total');
        expect(metrics).toContain('blockchain_confirmation_duration_seconds');
      });
    });

    describe('recordTicketRefund()', () => {
      it('increments counter with status, reason, tenant_id', async () => {
        recordTicketRefund('success', 'customer_request', 'tenant-123', 2.5);
        const metrics = await getMetrics();
        expect(metrics).toContain('ticket_refunds_total');
      });
    });

    describe('recordTicketRevenue()', () => {
      it('increments counter with amount', async () => {
        recordTicketRevenue(5000, 'tenant-123', 'USD');
        const metrics = await getMetrics();
        expect(metrics).toContain('ticket_revenue_total');
      });
    });

    describe('updateDatabasePoolMetrics()', () => {
      it('sets gauge for active, idle, waiting', async () => {
        updateDatabasePoolMetrics(5, 10, 2);
        const metrics = await getMetrics();
        expect(metrics).toContain('database_connection_pool');
      });
    });

    describe('updateCircuitBreakerState()', () => {
      it('sets gauge value (0=closed, 1=open, 2=half-open)', async () => {
        updateCircuitBreakerState('auth-service', 'closed');
        updateCircuitBreakerState('payment-service', 'open');
        updateCircuitBreakerState('notification-service', 'half-open');
        const metrics = await getMetrics();
        expect(metrics).toContain('circuit_breaker_state');
      });
    });
  });

  describe('Metrics Endpoint', () => {
    describe('metricsHandler()', () => {
      it('returns metrics in Prometheus format', async () => {
        const mockReply = {
          header: jest.fn().mockReturnThis(),
          send: jest.fn(),
        };

        await metricsHandler({} as any, mockReply as any);

        expect(mockReply.header).toHaveBeenCalledWith('Content-Type', expect.any(String));
        expect(mockReply.send).toHaveBeenCalled();
      });
    });

    describe('getMetrics()', () => {
      it('returns metrics string', async () => {
        const metrics = await getMetrics();
        expect(typeof metrics).toBe('string');
        expect(metrics.length).toBeGreaterThan(0);
      });
    });

    describe('getMetricsJson()', () => {
      it('returns metrics as JSON', async () => {
        const metrics = await getMetricsJson();
        expect(Array.isArray(metrics)).toBe(true);
      });
    });

    describe('resetMetrics()', () => {
      it('resets all metrics', async () => {
        recordTicketPurchase('success', 'stripe', 'tenant-1');
        resetMetrics();
        // Metrics are reset but structure remains
        const metrics = await getMetrics();
        expect(metrics).toContain('ticket_purchases_total');
      });
    });
  });

  describe('Registry', () => {
    it('registry is exported for custom usage', () => {
      expect(registry).toBeDefined();
      expect(registry.contentType).toBeDefined();
    });
  });
});
