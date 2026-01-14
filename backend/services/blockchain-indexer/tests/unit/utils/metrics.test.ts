/**
 * Comprehensive Unit Tests for src/utils/metrics.ts
 *
 * Tests Prometheus metrics and job metric helpers
 */

// Mock prom-client
const mockCounter = {
  inc: jest.fn(),
};

const mockHistogram = {
  observe: jest.fn(),
  startTimer: jest.fn(() => jest.fn()),
};

const mockGauge = {
  set: jest.fn(),
  inc: jest.fn(),
  dec: jest.fn(),
};

const mockRegistry = {
  registerMetric: jest.fn(),
};

const mockCollectDefaultMetrics = jest.fn();

jest.mock('prom-client', () => ({
  Counter: jest.fn(() => mockCounter),
  Histogram: jest.fn(() => mockHistogram),
  Gauge: jest.fn(() => mockGauge),
  Registry: jest.fn(() => mockRegistry),
  collectDefaultMetrics: mockCollectDefaultMetrics,
}));

import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

describe('src/utils/metrics.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  // =============================================================================
  // REGISTRY AND DEFAULT METRICS
  // =============================================================================

  describe('Registry and Default Metrics', () => {
    it('should create a registry', () => {
      // Re-import to trigger module execution
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Registry).toHaveBeenCalled();
      });
    });

    it('should collect default metrics', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(mockCollectDefaultMetrics).toHaveBeenCalledWith(
          expect.objectContaining({
            prefix: 'blockchain_indexer_',
          })
        );
      });
    });
  });

  // =============================================================================
  // INDEXING METRICS
  // =============================================================================

  describe('Indexing Metrics', () => {
    it('should create transactionsProcessedTotal counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_transactions_processed_total',
            help: 'Total number of transactions processed',
            labelNames: ['instruction_type', 'status'],
          })
        );
      });
    });

    it('should create blocksProcessedTotal counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_blocks_processed_total',
            help: 'Total number of blocks processed',
          })
        );
      });
    });

    it('should create currentSlot gauge', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Gauge).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_current_slot',
            help: 'Current Solana slot being processed',
          })
        );
      });
    });

    it('should create indexerLag gauge', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Gauge).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_lag_slots',
            help: 'Number of slots behind the current blockchain tip',
          })
        );
      });
    });

    it('should create lastProcessedSlot gauge', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Gauge).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_last_processed_slot',
            help: 'Last successfully processed slot',
          })
        );
      });
    });
  });

  // =============================================================================
  // PERFORMANCE METRICS
  // =============================================================================

  describe('Performance Metrics', () => {
    it('should create transactionProcessingDuration histogram', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Histogram).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_transaction_processing_duration_seconds',
            help: 'Time taken to process a transaction',
            labelNames: ['instruction_type'],
            buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
          })
        );
      });
    });

    it('should create rpcCallDuration histogram', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Histogram).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_rpc_call_duration_seconds',
            help: 'Duration of RPC calls to Solana',
            labelNames: ['method'],
            buckets: [0.1, 0.5, 1, 2, 5, 10],
          })
        );
      });
    });

    it('should create databaseWriteDuration histogram', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Histogram).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_database_write_duration_seconds',
            help: 'Duration of database write operations',
            labelNames: ['database', 'operation'],
            buckets: [0.01, 0.05, 0.1, 0.5, 1],
          })
        );
      });
    });
  });

  // =============================================================================
  // ERROR METRICS
  // =============================================================================

  describe('Error Metrics', () => {
    it('should create rpcErrorsTotal counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_rpc_errors_total',
            help: 'Total number of RPC errors',
            labelNames: ['error_type'],
          })
        );
      });
    });

    it('should create databaseErrorsTotal counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_database_errors_total',
            help: 'Total number of database errors',
            labelNames: ['database', 'operation'],
          })
        );
      });
    });

    it('should create processingErrorsTotal counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_processing_errors_total',
            help: 'Total number of transaction processing errors',
            labelNames: ['error_type'],
          })
        );
      });
    });
  });

  // =============================================================================
  // DATABASE METRICS
  // =============================================================================

  describe('Database Metrics', () => {
    it('should create mongodbWrites counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_mongodb_writes_total',
            help: 'Total number of MongoDB write operations',
            labelNames: ['collection', 'status'],
          })
        );
      });
    });

    it('should create postgresqlQueries counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_postgresql_queries_total',
            help: 'Total number of PostgreSQL queries',
            labelNames: ['operation', 'status'],
          })
        );
      });
    });
  });

  // =============================================================================
  // RECONCILIATION METRICS
  // =============================================================================

  describe('Reconciliation Metrics', () => {
    it('should create reconciliationRuns counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_reconciliation_runs_total',
            help: 'Total number of reconciliation runs',
            labelNames: ['status'],
          })
        );
      });
    });

    it('should create discrepanciesFound counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_discrepancies_found_total',
            help: 'Total number of discrepancies found during reconciliation',
            labelNames: ['discrepancy_type'],
          })
        );
      });
    });
  });

  // =============================================================================
  // HEALTH METRICS
  // =============================================================================

  describe('Health Metrics', () => {
    it('should create indexerUptime gauge', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Gauge).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_uptime_seconds',
            help: 'Time since indexer started',
          })
        );
      });
    });

    it('should create isHealthy gauge', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Gauge).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_is_healthy',
            help: 'Whether the indexer is healthy (1) or not (0)',
          })
        );
      });
    });
  });

  // =============================================================================
  // JOB METRICS
  // =============================================================================

  describe('Job Metrics', () => {
    it('should create jobsStarted counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_jobs_started_total',
            help: 'Total number of jobs started',
            labelNames: ['job_type'],
          })
        );
      });
    });

    it('should create jobsCompleted counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_jobs_completed_total',
            help: 'Total number of jobs completed',
            labelNames: ['job_type', 'status'],
          })
        );
      });
    });

    it('should create jobDuration histogram', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Histogram).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_job_duration_seconds',
            help: 'Duration of jobs in seconds',
            labelNames: ['job_type'],
            buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
          })
        );
      });
    });

    it('should create activeJobs gauge', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Gauge).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_active_jobs',
            help: 'Number of currently active jobs',
            labelNames: ['job_type'],
          })
        );
      });
    });

    it('should create jobRetries counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_job_retries_total',
            help: 'Total number of job retries',
            labelNames: ['job_type'],
          })
        );
      });
    });

    it('should create jobQueueSize gauge', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Gauge).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_job_queue_size',
            help: 'Number of jobs waiting in queue',
            labelNames: ['job_type'],
          })
        );
      });
    });

    it('should create jobDeadLetterQueue counter', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Counter).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_job_dlq_total',
            help: 'Total number of jobs sent to dead letter queue',
            labelNames: ['job_type', 'error_type'],
          })
        );
      });
    });

    it('should create jobProcessingLag gauge', () => {
      jest.isolateModules(() => {
        require('../../../src/utils/metrics');
        expect(Gauge).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'blockchain_indexer_job_processing_lag_seconds',
            help: 'Time between job creation and processing start',
            labelNames: ['job_type'],
          })
        );
      });
    });
  });

  // =============================================================================
  // UPDATE UPTIME METRIC
  // =============================================================================

  describe('updateUptimeMetric()', () => {
    it('should update uptime metric', () => {
      jest.isolateModules(() => {
        const { updateUptimeMetric } = require('../../../src/utils/metrics');
        updateUptimeMetric();
        
        expect(mockGauge.set).toHaveBeenCalledWith(expect.any(Number));
      });
    });

    it('should set uptime in seconds', () => {
      jest.isolateModules(() => {
        const { updateUptimeMetric } = require('../../../src/utils/metrics');
        
        // Wait a bit before updating
        const delay = 100;
        setTimeout(() => {
          updateUptimeMetric();
        }, delay);

        jest.advanceTimersByTime(delay);

        expect(mockGauge.set).toHaveBeenCalled();
        const uptimeSeconds = mockGauge.set.mock.calls[mockGauge.set.mock.calls.length - 1][0];
        expect(uptimeSeconds).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // =============================================================================
  // JOB METRICS HELPERS
  // =============================================================================

  describe('JobMetrics Helpers', () => {
    describe('recordJobStart()', () => {
      it('should increment job started counter', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          JobMetrics.recordJobStart('test-job');

          expect(mockCounter.inc).toHaveBeenCalledWith({ job_type: 'test-job' });
        });
      });

      it('should increment active jobs gauge', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          JobMetrics.recordJobStart('test-job');

          expect(mockGauge.inc).toHaveBeenCalledWith({ job_type: 'test-job' });
        });
      });
    });

    describe('recordJobComplete()', () => {
      it('should record successful job completion', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          JobMetrics.recordJobComplete('test-job', true, 5000);

          expect(mockGauge.dec).toHaveBeenCalledWith({ job_type: 'test-job' });
          expect(mockCounter.inc).toHaveBeenCalledWith({
            job_type: 'test-job',
            status: 'success',
          });
          expect(mockHistogram.observe).toHaveBeenCalledWith({ job_type: 'test-job' }, 5);
        });
      });

      it('should record failed job completion', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          JobMetrics.recordJobComplete('test-job', false, 3000);

          expect(mockGauge.dec).toHaveBeenCalledWith({ job_type: 'test-job' });
          expect(mockCounter.inc).toHaveBeenCalledWith({
            job_type: 'test-job',
            status: 'failure',
          });
          expect(mockHistogram.observe).toHaveBeenCalledWith({ job_type: 'test-job' }, 3);
        });
      });

      it('should convert milliseconds to seconds for histogram', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          JobMetrics.recordJobComplete('test-job', true, 1500);

          expect(mockHistogram.observe).toHaveBeenCalledWith({ job_type: 'test-job' }, 1.5);
        });
      });
    });

    describe('recordJobRetry()', () => {
      it('should increment retry counter', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          JobMetrics.recordJobRetry('test-job');

          expect(mockCounter.inc).toHaveBeenCalledWith({ job_type: 'test-job' });
        });
      });
    });

    describe('recordJobDLQ()', () => {
      it('should increment dead letter queue counter', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          JobMetrics.recordJobDLQ('test-job', 'timeout');

          expect(mockCounter.inc).toHaveBeenCalledWith({
            job_type: 'test-job',
            error_type: 'timeout',
          });
        });
      });
    });

    describe('updateQueueSize()', () => {
      it('should set queue size gauge', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          JobMetrics.updateQueueSize('test-job', 42);

          expect(mockGauge.set).toHaveBeenCalledWith({ job_type: 'test-job' }, 42);
        });
      });
    });

    describe('recordProcessingLag()', () => {
      it('should set processing lag gauge in seconds', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          JobMetrics.recordProcessingLag('test-job', 5000);

          expect(mockGauge.set).toHaveBeenCalledWith({ job_type: 'test-job' }, 5);
        });
      });
    });

    describe('startJobTimer()', () => {
      it('should record job start metrics', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          JobMetrics.startJobTimer('test-job');

          expect(mockCounter.inc).toHaveBeenCalledWith({ job_type: 'test-job' });
          expect(mockGauge.inc).toHaveBeenCalledWith({ job_type: 'test-job' });
        });
      });

      it('should return a completion function', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          const endTimer = JobMetrics.startJobTimer('test-job');

          expect(typeof endTimer).toBe('function');
        });
      });

      it('should record successful completion when called', () => {
        jest.useFakeTimers();
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          
          mockGauge.dec.mockClear();
          mockCounter.inc.mockClear();
          mockHistogram.observe.mockClear();

          const endTimer = JobMetrics.startJobTimer('test-job');
          
          jest.advanceTimersByTime(1000);
          endTimer(true);

          expect(mockGauge.dec).toHaveBeenCalledWith({ job_type: 'test-job' });
          expect(mockCounter.inc).toHaveBeenCalledWith({
            job_type: 'test-job',
            status: 'success',
          });
          expect(mockHistogram.observe).toHaveBeenCalled();
        });
        jest.useRealTimers();
      });

      it('should record failed completion when called with false', () => {
        jest.useFakeTimers();
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          
          mockCounter.inc.mockClear();

          const endTimer = JobMetrics.startJobTimer('test-job');
          
          jest.advanceTimersByTime(500);
          endTimer(false);

          expect(mockCounter.inc).toHaveBeenCalledWith(
            expect.objectContaining({
              status: 'failure',
            })
          );
        });
        jest.useRealTimers();
      });

      it('should default to success when called without parameter', () => {
        jest.isolateModules(() => {
          const { JobMetrics } = require('../../../src/utils/metrics');
          
          mockCounter.inc.mockClear();

          const endTimer = JobMetrics.startJobTimer('test-job');
          endTimer();

          expect(mockCounter.inc).toHaveBeenCalledWith(
            expect.objectContaining({
              status: 'success',
            })
          );
        });
      });
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export register', () => {
      jest.isolateModules(() => {
        const { register } = require('../../../src/utils/metrics');
        expect(register).toBeDefined();
      });
    });

    it('should export all metric instances', () => {
      jest.isolateModules(() => {
        const metrics = require('../../../src/utils/metrics');
        
        expect(metrics.transactionsProcessedTotal).toBeDefined();
        expect(metrics.blocksProcessedTotal).toBeDefined();
        expect(metrics.currentSlot).toBeDefined();
        expect(metrics.indexerLag).toBeDefined();
        expect(metrics.lastProcessedSlot).toBeDefined();
        expect(metrics.transactionProcessingDuration).toBeDefined();
        expect(metrics.rpcCallDuration).toBeDefined();
        expect(metrics.databaseWriteDuration).toBeDefined();
        expect(metrics.rpcErrorsTotal).toBeDefined();
        expect(metrics.databaseErrorsTotal).toBeDefined();
        expect(metrics.processingErrorsTotal).toBeDefined();
        expect(metrics.mongodbWrites).toBeDefined();
        expect(metrics.postgresqlQueries).toBeDefined();
        expect(metrics.reconciliationRuns).toBeDefined();
        expect(metrics.discrepanciesFound).toBeDefined();
        expect(metrics.indexerUptime).toBeDefined();
        expect(metrics.isHealthy).toBeDefined();
      });
    });

    it('should export all job metrics', () => {
      jest.isolateModules(() => {
        const metrics = require('../../../src/utils/metrics');
        
        expect(metrics.jobsStarted).toBeDefined();
        expect(metrics.jobsCompleted).toBeDefined();
        expect(metrics.jobDuration).toBeDefined();
        expect(metrics.activeJobs).toBeDefined();
        expect(metrics.jobRetries).toBeDefined();
        expect(metrics.jobQueueSize).toBeDefined();
        expect(metrics.jobDeadLetterQueue).toBeDefined();
        expect(metrics.jobProcessingLag).toBeDefined();
      });
    });

    it('should export updateUptimeMetric function', () => {
      jest.isolateModules(() => {
        const { updateUptimeMetric } = require('../../../src/utils/metrics');
        expect(typeof updateUptimeMetric).toBe('function');
      });
    });

    it('should export JobMetrics helper', () => {
      jest.isolateModules(() => {
        const { JobMetrics } = require('../../../src/utils/metrics');
        
        expect(JobMetrics).toBeDefined();
        expect(typeof JobMetrics.recordJobStart).toBe('function');
        expect(typeof JobMetrics.recordJobComplete).toBe('function');
        expect(typeof JobMetrics.recordJobRetry).toBe('function');
        expect(typeof JobMetrics.recordJobDLQ).toBe('function');
        expect(typeof JobMetrics.updateQueueSize).toBe('function');
        expect(typeof JobMetrics.recordProcessingLag).toBe('function');
        expect(typeof JobMetrics.startJobTimer).toBe('function');
      });
    });
  });
});
