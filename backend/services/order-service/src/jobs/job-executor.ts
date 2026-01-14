import { logger, createContextLogger } from '../utils/logger';
import { retry, RetryOptions } from '../utils/retry';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { withLock, extendLock } from '../utils/distributed-lock';
import { getRedis } from '../config/redis';
import { v4 as uuidv4 } from 'uuid';

// MEDIUM: Generate unique instance ID for this process
const INSTANCE_ID = `${process.env.HOSTNAME || 'local'}-${process.pid}-${uuidv4().slice(0, 8)}`;

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
  alertStallDetected: async (name: string, instanceId: string, lastHeartbeat: Date) => {},
};

export enum JobStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  STOPPED = 'STOPPED',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  STALLED = 'STALLED'
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
  // MEDIUM: Lock extension for long-running jobs
  enableLockExtension?: boolean;
  lockExtensionIntervalMs?: number;
  // MEDIUM: Stall detection
  enableStallDetection?: boolean;
  stallThresholdMs?: number;
  heartbeatIntervalMs?: number;
  // MEDIUM: Job persistence
  enablePersistence?: boolean;
}

export interface JobExecutionResult {
  success: boolean;
  duration: number;
  error?: Error;
  metadata?: Record<string, any>;
}

// MEDIUM: Job state for persistence
interface PersistedJobState {
  name: string;
  instanceId: string;
  status: JobStatus;
  lastHeartbeat: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
}

/**
 * Base class for all background jobs
 * Provides consistent monitoring, retry, circuit breaking, locking,
 * stall detection, lock extension, and job persistence
 */
export abstract class JobExecutor {
  protected config: Required<JobConfig>;
  protected status: JobStatus = JobStatus.IDLE;
  protected intervalId: NodeJS.Timeout | null = null;
  protected circuitBreaker: CircuitBreaker | null = null;
  protected jobLogger: ReturnType<typeof createContextLogger>;
  private runningExecution: Promise<void> | null = null;
  // MEDIUM: Lock extension interval
  private lockExtensionInterval: NodeJS.Timeout | null = null;
  private currentLockKey: string | null = null;
  // MEDIUM: Heartbeat interval for stall detection
  private heartbeatInterval: NodeJS.Timeout | null = null;
  // MEDIUM: Execution stats
  private executionCount = 0;
  private successCount = 0;
  private failureCount = 0;

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
      // MEDIUM: Lock extension defaults
      enableLockExtension: config.enableLockExtension ?? true,
      lockExtensionIntervalMs: config.lockExtensionIntervalMs ?? 60000, // 1 minute
      // MEDIUM: Stall detection defaults
      enableStallDetection: config.enableStallDetection ?? true,
      stallThresholdMs: config.stallThresholdMs ?? 600000, // 10 minutes
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30000, // 30 seconds
      // MEDIUM: Persistence defaults
      enablePersistence: config.enablePersistence ?? true,
    };

    this.jobLogger = createContextLogger({ 
      context: this.config.name,
      instanceId: INSTANCE_ID,
    });

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
   * MEDIUM: Get instance ID for this job executor
   */
  getInstanceId(): string {
    return INSTANCE_ID;
  }

  /**
   * Start the job with scheduled interval
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.jobLogger.info('Job disabled via configuration');
      return;
    }

    if (this.intervalId) {
      this.jobLogger.warn('Job already running');
      return;
    }

    this.jobLogger.info(`Starting job (interval: ${this.config.intervalSeconds}s)`, {
      instanceId: INSTANCE_ID,
      retry: this.config.enableRetry,
      circuitBreaker: this.config.enableCircuitBreaker,
      distributedLock: this.config.enableDistributedLock,
      lockExtension: this.config.enableLockExtension,
      stallDetection: this.config.enableStallDetection,
      persistence: this.config.enablePersistence,
    });

    // MEDIUM: Check for stalled jobs from other instances
    if (this.config.enableStallDetection) {
      await this.checkForStalledJobs();
    }

    // MEDIUM: Persist initial state
    if (this.config.enablePersistence) {
      await this.persistState();
    }

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
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Stop heartbeat
    this.stopHeartbeat();

    // Stop lock extension
    this.stopLockExtension();

    this.status = JobStatus.STOPPED;

    // MEDIUM: Persist final state
    if (this.config.enablePersistence) {
      await this.persistState();
    }

    this.jobLogger.info('Job stopped');
  }

  /**
   * MEDIUM: Start heartbeat for stall detection
   */
  private startHeartbeat(): void {
    if (!this.config.enableStallDetection || this.heartbeatInterval) {
      return;
    }

    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        this.jobLogger.error('Failed to send heartbeat', { error });
      }
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * MEDIUM: Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * MEDIUM: Send heartbeat to Redis
   */
  private async sendHeartbeat(): Promise<void> {
    const redis = getRedis();
    const key = `job:heartbeat:${this.config.name}:${INSTANCE_ID}`;
    
    await redis.set(key, JSON.stringify({
      instanceId: INSTANCE_ID,
      status: this.status,
      timestamp: new Date().toISOString(),
    }), 'EX', Math.ceil(this.config.stallThresholdMs / 1000));
  }

  /**
   * MEDIUM: Check for stalled jobs from other instances
   */
  private async checkForStalledJobs(): Promise<void> {
    try {
      const redis = getRedis();
      const pattern = `job:heartbeat:${this.config.name}:*`;
      const keys = await redis.keys(pattern);

      for (const key of keys) {
        const data = await redis.get(key);
        if (!data) continue;

        const heartbeat = JSON.parse(data);
        const lastHeartbeat = new Date(heartbeat.timestamp);
        const stalledMs = Date.now() - lastHeartbeat.getTime();

        if (stalledMs > this.config.stallThresholdMs && heartbeat.status === JobStatus.RUNNING) {
          this.jobLogger.warn('Detected stalled job from another instance', {
            stalledInstanceId: heartbeat.instanceId,
            lastHeartbeat: heartbeat.timestamp,
            stalledMs,
          });

          await jobAlertingService.alertStallDetected(
            this.config.name,
            heartbeat.instanceId,
            lastHeartbeat
          );

          // Clean up stalled heartbeat
          await redis.del(key);

          // Clean up stalled lock if exists
          const lockKey = `lock:job:${this.config.name}`;
          const lockOwner = await redis.get(lockKey);
          if (lockOwner === heartbeat.instanceId) {
            await redis.del(lockKey);
            this.jobLogger.info('Cleaned up stalled lock', { stalledInstanceId: heartbeat.instanceId });
          }
        }
      }
    } catch (error) {
      this.jobLogger.error('Failed to check for stalled jobs', { error });
    }
  }

  /**
   * MEDIUM: Start lock extension for long-running jobs
   */
  private startLockExtension(lockKey: string): void {
    if (!this.config.enableLockExtension || this.lockExtensionInterval) {
      return;
    }

    this.currentLockKey = lockKey;
    this.lockExtensionInterval = setInterval(async () => {
      try {
        if (this.currentLockKey && this.status === JobStatus.RUNNING) {
          const extended = await extendLock(
            this.currentLockKey,
            INSTANCE_ID,
            this.config.lockTTLMs
          );
          if (extended) {
            this.jobLogger.debug('Lock extended', { lockKey: this.currentLockKey });
          } else {
            this.jobLogger.warn('Failed to extend lock - lock may have been released');
          }
        }
      } catch (error) {
        this.jobLogger.error('Failed to extend lock', { error });
      }
    }, this.config.lockExtensionIntervalMs);
  }

  /**
   * MEDIUM: Stop lock extension
   */
  private stopLockExtension(): void {
    if (this.lockExtensionInterval) {
      clearInterval(this.lockExtensionInterval);
      this.lockExtensionInterval = null;
    }
    this.currentLockKey = null;
  }

  /**
   * MEDIUM: Persist job state to Redis
   */
  private async persistState(error?: string): Promise<void> {
    if (!this.config.enablePersistence) {
      return;
    }

    try {
      const redis = getRedis();
      const key = `job:state:${this.config.name}:${INSTANCE_ID}`;

      const state: PersistedJobState = {
        name: this.config.name,
        instanceId: INSTANCE_ID,
        status: this.status,
        lastHeartbeat: new Date().toISOString(),
        executionCount: this.executionCount,
        successCount: this.successCount,
        failureCount: this.failureCount,
        lastError: error,
      };

      // Keep state for 24 hours
      await redis.set(key, JSON.stringify(state), 'EX', 86400);
    } catch (error) {
      this.jobLogger.error('Failed to persist job state', { error });
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
    this.executionCount++;

    // MEDIUM: Start heartbeat
    this.startHeartbeat();

    // MEDIUM: Persist running state
    if (this.config.enablePersistence) {
      await this.persistState();
    }

    try {
      // Create execution promise for graceful shutdown tracking
      this.runningExecution = this.executeJob();
      await this.runningExecution;
      this.runningExecution = null;

      const duration = Date.now() - startTime;
      this.status = JobStatus.SUCCESS;
      this.successCount++;

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

      // MEDIUM: Persist success state
      if (this.config.enablePersistence) {
        await this.persistState();
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      this.status = JobStatus.FAILED;
      this.failureCount++;
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

      // MEDIUM: Persist failure state
      if (this.config.enablePersistence) {
        await this.persistState(errorMessage);
      }
    } finally {
      this.status = JobStatus.IDLE;

      // MEDIUM: Stop heartbeat and lock extension
      this.stopHeartbeat();
      this.stopLockExtension();
    }
  }

  /**
   * Execute the job with retry, circuit breaker, and locking
   */
  private async executeJob(): Promise<void> {
    const executeWithOptionalFeatures = async () => {
      // Wrap in distributed lock if enabled
      if (this.config.enableDistributedLock) {
        const lockKey = `job:${this.config.name}`;
        
        await withLock(
          lockKey,
          async () => {
            // MEDIUM: Start lock extension for long-running jobs
            this.startLockExtension(lockKey);
            try {
              await this.executeCore();
            } finally {
              this.stopLockExtension();
            }
          },
          { 
            ttl: this.config.lockTTLMs,
            // MEDIUM: Include instance ID in lock owner
            owner: INSTANCE_ID,
          }
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
    instanceId: string;
    executionCount: number;
    successCount: number;
    failureCount: number;
  } {
    return {
      name: this.config.name,
      status: this.status,
      enabled: this.config.enabled,
      circuitOpen: this.circuitBreaker?.isOpen() ?? false,
      instanceId: INSTANCE_ID,
      executionCount: this.executionCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
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
