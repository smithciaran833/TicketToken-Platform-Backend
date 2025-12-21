import { logger, createContextLogger } from '../utils/logger';
import { retry, RetryOptions } from '../utils/retry';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { withLock } from '../utils/distributed-lock';
// import { jobMetricsService } from '../services/job-metrics.service';
// import { jobAlertingService } from '../services/job-alerting.service';

// Stub services (not implemented)
const jobMetricsService = {
  recordSkipped: async (name: string) => {},
  recordCircuitOpen: async (name: string) => {},
  recordExecution: async (name: string, result: any) => {},
  getConsecutiveFailures: async (name: string) => 0,
};
const jobAlertingService = {
  alertSlowExecution: async (name: string, duration: number, timeout: number) => {},
  alertJobFailure: async (name: string, error: string, failures: number) => {},
};

export enum JobStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  STOPPED = 'STOPPED',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN'
}

export interface JobConfig {
  name: string;
  enabled?: boolean;
  intervalSeconds?: number;
  enableRetry?: boolean;
  retryOptions?: RetryOptions;
  enableCircuitBreaker?: boolean;
  circuitBreakerOptions?: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
    timeoutMs?: number;
  };
  enableDistributedLock?: boolean;
  lockTTLMs?: number;
  timeoutMs?: number;
}

export interface JobExecutionResult {
  success: boolean;
  duration: number;
  error?: Error;
  metadata?: Record<string, any>;
}

/**
 * Base class for all background jobs
 * Provides consistent monitoring, retry, circuit breaking, and locking
 */
export abstract class JobExecutor {
  protected config: Required<JobConfig>;
  protected status: JobStatus = JobStatus.IDLE;
  protected intervalId: NodeJS.Timeout | null = null;
  protected circuitBreaker: CircuitBreaker | null = null;
  protected jobLogger: ReturnType<typeof createContextLogger>;
  private runningExecution: Promise<void> | null = null;

  constructor(config: JobConfig) {
    // Set defaults
    this.config = {
      name: config.name,
      enabled: config.enabled ?? true,
      intervalSeconds: config.intervalSeconds ?? 300, // 5 minutes default
      enableRetry: config.enableRetry ?? true,
      retryOptions: config.retryOptions ?? {
        maxAttempts: 3,
        delayMs: 5000,
        backoffMultiplier: 2,
        maxDelayMs: 60000,
      },
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
      circuitBreakerOptions: config.circuitBreakerOptions ?? {
        failureThreshold: 5,
        resetTimeoutMs: 300000, // 5 minutes
        timeoutMs: 300000, // 5 minutes
      },
      enableDistributedLock: config.enableDistributedLock ?? true,
      lockTTLMs: config.lockTTLMs ?? 300000, // 5 minutes
      timeoutMs: config.timeoutMs ?? 600000, // 10 minutes
    };

    this.jobLogger = createContextLogger({ context: this.config.name });

    // Initialize circuit breaker if enabled
    if (this.config.enableCircuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(
        this.config.name,
        {
          timeout: this.config.circuitBreakerOptions.timeoutMs!,
          failureThreshold: this.config.circuitBreakerOptions.failureThreshold!,
          resetTimeout: this.config.circuitBreakerOptions.resetTimeoutMs!,
          successThreshold: 2,
        }
      );
    }
  }

  /**
   * Start the job with scheduled interval
   */
  start(): void {
    if (!this.config.enabled) {
      this.jobLogger.info('Job disabled via configuration');
      return;
    }

    if (this.intervalId) {
      this.jobLogger.warn('Job already running');
      return;
    }

    this.jobLogger.info(`Starting job (interval: ${this.config.intervalSeconds}s)`, {
      retry: this.config.enableRetry,
      circuitBreaker: this.config.enableCircuitBreaker,
      distributedLock: this.config.enableDistributedLock,
    });

    // Run immediately on start
    this.executeWithMonitoring().catch(error => {
      this.jobLogger.error('Error in initial job execution', { error });
    });

    // Schedule periodic execution
    this.intervalId = setInterval(
      () => {
        this.executeWithMonitoring().catch(error => {
          this.jobLogger.error('Error in scheduled job execution', { error });
        });
      },
      this.config.intervalSeconds * 1000
    );

    this.status = JobStatus.IDLE;
  }

  /**
   * Stop the job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.status = JobStatus.STOPPED;
      this.jobLogger.info('Job stopped');
    }
  }

  /**
   * Execute the job with full monitoring stack
   */
  private async executeWithMonitoring(): Promise<void> {
    // Skip if already running
    if (this.status === JobStatus.RUNNING) {
      this.jobLogger.warn('Job already running, skipping execution');
      await jobMetricsService.recordSkipped(this.config.name);
      return;
    }

    // Check circuit breaker
    if (this.circuitBreaker && this.circuitBreaker.isOpen()) {
      this.jobLogger.warn('Circuit breaker is open, skipping execution');
      this.status = JobStatus.CIRCUIT_OPEN;
      await jobMetricsService.recordCircuitOpen(this.config.name);
      return;
    }

    const startTime = Date.now();
    this.status = JobStatus.RUNNING;

    try {
      // Create execution promise for graceful shutdown tracking
      this.runningExecution = this.executeJob();
      await this.runningExecution;
      this.runningExecution = null;

      const duration = Date.now() - startTime;
      this.status = JobStatus.SUCCESS;

      // Record success metrics
      await jobMetricsService.recordExecution(this.config.name, {
        success: true,
        duration,
      });

      // Check if we should alert on slow execution
      if (this.config.timeoutMs && duration > this.config.timeoutMs * 0.8) {
        await jobAlertingService.alertSlowExecution(
          this.config.name,
          duration,
          this.config.timeoutMs
        );
      }

      this.jobLogger.debug('Job executed successfully', { duration: `${duration}ms` });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.status = JobStatus.FAILED;
      this.runningExecution = null;

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Record failure metrics
      await jobMetricsService.recordExecution(this.config.name, {
        success: false,
        duration,
        error: errorMessage,
      });

      // Alert on failure
      await jobAlertingService.alertJobFailure(
        this.config.name,
        errorMessage,
        await jobMetricsService.getConsecutiveFailures(this.config.name)
      );

      this.jobLogger.error('Job execution failed', { error, duration: `${duration}ms` });
    } finally {
      this.status = JobStatus.IDLE;
    }
  }

  /**
   * Execute the job with retry, circuit breaker, and locking
   */
  private async executeJob(): Promise<void> {
    const executeWithOptionalFeatures = async () => {
      // Wrap in distributed lock if enabled
      if (this.config.enableDistributedLock) {
        await withLock(
          `job:${this.config.name}`,
          () => this.executeCore(),
          { ttl: this.config.lockTTLMs }
        );
      } else {
        await this.executeCore();
      }
    };

    // Wrap in circuit breaker if enabled
    const executeWithCircuitBreaker = async () => {
      if (this.circuitBreaker) {
        await this.circuitBreaker.execute(() => executeWithOptionalFeatures());
      } else {
        await executeWithOptionalFeatures();
      }
    };

    // Wrap in retry if enabled
    if (this.config.enableRetry) {
      await retry(executeWithCircuitBreaker, this.config.retryOptions);
    } else {
      await executeWithCircuitBreaker();
    }
  }

  /**
   * Core job execution logic - must be implemented by subclass
   */
  protected abstract executeCore(): Promise<void>;

  /**
   * Get current job status
   */
  getStatus(): {
    name: string;
    status: JobStatus;
    enabled: boolean;
    circuitOpen: boolean;
  } {
    return {
      name: this.config.name,
      status: this.status,
      enabled: this.config.enabled,
      circuitOpen: this.circuitBreaker?.isOpen() ?? false,
    };
  }

  /**
   * Wait for running execution to complete (for graceful shutdown)
   */
  async waitForCompletion(timeoutMs: number = 30000): Promise<void> {
    if (!this.runningExecution) {
      return;
    }

    await Promise.race([
      this.runningExecution,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Job execution timeout during shutdown')), timeoutMs)
      ),
    ]);
  }
}
