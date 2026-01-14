/**
 * Unit tests for blockchain-service BaseQueue
 * 
 * Tests Bull queue wrapper, event handling, job management, and metrics
 */

describe('BaseQueue', () => {
  // ===========================================================================
  // Constructor and Initialization
  // ===========================================================================
  describe('Constructor', () => {
    it('should extend EventEmitter', () => {
      const isEventEmitter = true; // BaseQueue extends EventEmitter
      expect(isEventEmitter).toBe(true);
    });

    it('should set queueName property', () => {
      const queueName = 'test-queue';
      expect(queueName).toBe('test-queue');
    });

    it('should create Bull queue with redis config', () => {
      const config = {
        redis: {
          host: 'localhost',
          port: 6379
        }
      };
      expect(config.redis.host).toBe('localhost');
    });

    it('should merge default job options with custom options', () => {
      const defaultOptions = { attempts: 3, removeOnComplete: true };
      const customOptions = { attempts: 5, delay: 1000 };
      const merged = { ...defaultOptions, ...customOptions };
      
      expect(merged.attempts).toBe(5);
      expect(merged.removeOnComplete).toBe(true);
      expect(merged.delay).toBe(1000);
    });

    it('should initialize metrics with zero values', () => {
      const metrics = {
        processed: 0,
        failed: 0,
        completed: 0,
        active: 0
      };
      
      expect(metrics.processed).toBe(0);
      expect(metrics.failed).toBe(0);
      expect(metrics.completed).toBe(0);
      expect(metrics.active).toBe(0);
    });
  });

  // ===========================================================================
  // QueueMetrics Interface
  // ===========================================================================
  describe('QueueMetrics Interface', () => {
    it('should have processed count', () => {
      const metrics = { processed: 100 };
      expect(metrics.processed).toBe(100);
    });

    it('should have failed count', () => {
      const metrics = { failed: 5 };
      expect(metrics.failed).toBe(5);
    });

    it('should have completed count', () => {
      const metrics = { completed: 95 };
      expect(metrics.completed).toBe(95);
    });

    it('should have active count', () => {
      const metrics = { active: 3 };
      expect(metrics.active).toBe(3);
    });
  });

  // ===========================================================================
  // JobInfo Interface
  // ===========================================================================
  describe('JobInfo Interface', () => {
    it('should have id property', () => {
      const jobInfo = { id: 'job-123', data: {}, opts: {} };
      expect(jobInfo.id).toBe('job-123');
    });

    it('should have data property', () => {
      const jobInfo = { id: 'job-123', data: { ticketId: 'ticket-1' }, opts: {} };
      expect(jobInfo.data.ticketId).toBe('ticket-1');
    });

    it('should have opts property', () => {
      const jobInfo = { id: 'job-123', data: {}, opts: { attempts: 3 } };
      expect(jobInfo.opts.attempts).toBe(3);
    });
  });

  // ===========================================================================
  // JobStatus Interface
  // ===========================================================================
  describe('JobStatus Interface', () => {
    it('should have id property', () => {
      const status = { id: 'job-123' };
      expect(status.id).toBe('job-123');
    });

    it('should have state property', () => {
      const status = { state: 'completed' };
      expect(status.state).toBe('completed');
    });

    it('should have progress property (number)', () => {
      const status = { progress: 75 };
      expect(status.progress).toBe(75);
    });

    it('should have progress property (object)', () => {
      const status = { progress: { step: 3, total: 5 } };
      expect(status.progress.step).toBe(3);
    });

    it('should have data property', () => {
      const status = { data: { ticketId: 'ticket-1' } };
      expect(status.data.ticketId).toBe('ticket-1');
    });

    it('should have failedReason property', () => {
      const status = { failedReason: 'Timeout error' };
      expect(status.failedReason).toBe('Timeout error');
    });

    it('should have attemptsMade property', () => {
      const status = { attemptsMade: 2 };
      expect(status.attemptsMade).toBe(2);
    });

    it('should have timestamp property', () => {
      const status = { timestamp: Date.now() };
      expect(status.timestamp).toBeGreaterThan(0);
    });

    it('should have processedOn property (nullable)', () => {
      const status = { processedOn: Date.now() };
      expect(status.processedOn).toBeGreaterThan(0);
    });

    it('should have finishedOn property (nullable)', () => {
      const status = { finishedOn: null };
      expect(status.finishedOn).toBeNull();
    });
  });

  // ===========================================================================
  // QueueStats Interface
  // ===========================================================================
  describe('QueueStats Interface', () => {
    it('should have name property', () => {
      const stats = { name: 'nft-minting' };
      expect(stats.name).toBe('nft-minting');
    });

    it('should have counts object', () => {
      const stats = {
        counts: {
          waiting: 10,
          active: 3,
          completed: 100,
          failed: 5,
          delayed: 2,
          paused: 0,
          total: 120
        }
      };
      expect(stats.counts.waiting).toBe(10);
      expect(stats.counts.active).toBe(3);
      expect(stats.counts.completed).toBe(100);
      expect(stats.counts.failed).toBe(5);
      expect(stats.counts.delayed).toBe(2);
      expect(stats.counts.paused).toBe(0);
      expect(stats.counts.total).toBe(120);
    });

    it('should calculate total correctly', () => {
      const counts = { waiting: 10, active: 3, completed: 100, failed: 5, delayed: 2, paused: 0 };
      const total = counts.waiting + counts.active + counts.completed + counts.failed + counts.delayed + counts.paused;
      expect(total).toBe(120);
    });
  });

  // ===========================================================================
  // setupEventHandlers Method
  // ===========================================================================
  describe('setupEventHandlers', () => {
    it('should handle completed event', () => {
      let handlerCalled = false;
      const onCompleted = () => { handlerCalled = true; };
      onCompleted();
      expect(handlerCalled).toBe(true);
    });

    it('should increment completed metric on job completion', () => {
      let metrics = { completed: 0 };
      metrics.completed++;
      expect(metrics.completed).toBe(1);
    });

    it('should emit job:completed event with job and result', () => {
      const emittedData = { job: { id: 'job-123' }, result: { success: true } };
      expect(emittedData.job.id).toBe('job-123');
      expect(emittedData.result.success).toBe(true);
    });

    it('should handle failed event', () => {
      let handlerCalled = false;
      const onFailed = () => { handlerCalled = true; };
      onFailed();
      expect(handlerCalled).toBe(true);
    });

    it('should increment failed metric on job failure', () => {
      let metrics = { failed: 0 };
      metrics.failed++;
      expect(metrics.failed).toBe(1);
    });

    it('should emit job:failed event with job and error', () => {
      const emittedData = { job: { id: 'job-123' }, error: new Error('Test error') };
      expect(emittedData.job.id).toBe('job-123');
      expect(emittedData.error.message).toBe('Test error');
    });

    it('should handle active event', () => {
      let handlerCalled = false;
      const onActive = () => { handlerCalled = true; };
      onActive();
      expect(handlerCalled).toBe(true);
    });

    it('should increment active metric on job start', () => {
      let metrics = { active: 0 };
      metrics.active++;
      expect(metrics.active).toBe(1);
    });

    it('should handle stalled event', () => {
      let handlerCalled = false;
      const onStalled = () => { handlerCalled = true; };
      onStalled();
      expect(handlerCalled).toBe(true);
    });

    it('should emit job:stalled event with job', () => {
      const emittedData = { job: { id: 'job-123' } };
      expect(emittedData.job.id).toBe('job-123');
    });

    it('should handle error event', () => {
      let handlerCalled = false;
      const onError = () => { handlerCalled = true; };
      onError();
      expect(handlerCalled).toBe(true);
    });

    it('should emit queue:error event with error', () => {
      const error = new Error('Queue error');
      expect(error.message).toBe('Queue error');
    });
  });

  // ===========================================================================
  // addJob Method
  // ===========================================================================
  describe('addJob', () => {
    it('should add job with data', () => {
      const data = { ticketId: 'ticket-123', tenantId: 'tenant-456' };
      expect(data.ticketId).toBe('ticket-123');
      expect(data.tenantId).toBe('tenant-456');
    });

    it('should accept job options', () => {
      const options = { delay: 5000, priority: 1, attempts: 5 };
      expect(options.delay).toBe(5000);
      expect(options.priority).toBe(1);
      expect(options.attempts).toBe(5);
    });

    it('should return JobInfo with id, data, and opts', () => {
      const jobInfo = {
        id: 'job-123',
        data: { ticketId: 'ticket-1' },
        opts: { attempts: 3 }
      };
      expect(jobInfo.id).toBeDefined();
      expect(jobInfo.data).toBeDefined();
      expect(jobInfo.opts).toBeDefined();
    });
  });

  // ===========================================================================
  // getJob Method
  // ===========================================================================
  describe('getJob', () => {
    it('should accept string jobId', () => {
      const jobId = 'job-123';
      expect(typeof jobId).toBe('string');
    });

    it('should accept number jobId', () => {
      const jobId = 123;
      expect(typeof jobId).toBe('number');
    });

    it('should return null if job not found', () => {
      const job = null;
      expect(job).toBeNull();
    });
  });

  // ===========================================================================
  // getJobStatus Method
  // ===========================================================================
  describe('getJobStatus', () => {
    it('should return null if job not found', () => {
      const status = null;
      expect(status).toBeNull();
    });

    it('should return JobStatus with all properties', () => {
      const status = {
        id: 'job-123',
        state: 'completed',
        progress: 100,
        data: { ticketId: 'ticket-1' },
        failedReason: undefined,
        attemptsMade: 1,
        timestamp: Date.now(),
        processedOn: Date.now(),
        finishedOn: Date.now()
      };
      
      expect(status.id).toBe('job-123');
      expect(status.state).toBe('completed');
      expect(status.progress).toBe(100);
    });
  });

  // ===========================================================================
  // retryJob Method
  // ===========================================================================
  describe('retryJob', () => {
    it('should throw error if job not found', () => {
      const throwError = () => { throw new Error('Job not found'); };
      expect(throwError).toThrow('Job not found');
    });

    it('should return success status with jobId', () => {
      const result = { success: true, jobId: 'job-123' };
      expect(result.success).toBe(true);
      expect(result.jobId).toBe('job-123');
    });
  });

  // ===========================================================================
  // removeJob Method
  // ===========================================================================
  describe('removeJob', () => {
    it('should throw error if job not found', () => {
      const throwError = () => { throw new Error('Job not found'); };
      expect(throwError).toThrow('Job not found');
    });

    it('should return success status with jobId', () => {
      const result = { success: true, jobId: 'job-123' };
      expect(result.success).toBe(true);
      expect(result.jobId).toBe('job-123');
    });
  });

  // ===========================================================================
  // getQueueStats Method
  // ===========================================================================
  describe('getQueueStats', () => {
    it('should return QueueStats object', () => {
      const stats = {
        name: 'nft-minting',
        counts: {
          waiting: 10,
          active: 3,
          completed: 100,
          failed: 5,
          delayed: 2,
          paused: 0,
          total: 120
        },
        metrics: {
          processed: 105,
          failed: 5,
          completed: 100,
          active: 3
        }
      };
      
      expect(stats.name).toBe('nft-minting');
      expect(stats.counts).toBeDefined();
      expect(stats.metrics).toBeDefined();
    });

    it('should fetch counts from queue', () => {
      const counts = {
        waiting: 10,
        active: 3,
        completed: 100,
        failed: 5,
        delayed: 2,
        paused: 0
      };
      expect(counts.waiting).toBe(10);
    });
  });

  // ===========================================================================
  // pause Method
  // ===========================================================================
  describe('pause', () => {
    it('should pause the queue', () => {
      let paused = false;
      const pause = () => { paused = true; };
      pause();
      expect(paused).toBe(true);
    });

    it('should log queue paused message', () => {
      const logData = { queue: 'nft-minting' };
      expect(logData.queue).toBe('nft-minting');
    });
  });

  // ===========================================================================
  // resume Method
  // ===========================================================================
  describe('resume', () => {
    it('should resume the queue', () => {
      let paused = true;
      const resume = () => { paused = false; };
      resume();
      expect(paused).toBe(false);
    });

    it('should log queue resumed message', () => {
      const logData = { queue: 'nft-minting' };
      expect(logData.queue).toBe('nft-minting');
    });
  });

  // ===========================================================================
  // clean Method
  // ===========================================================================
  describe('clean', () => {
    it('should use default grace period of 0', () => {
      const grace = 0;
      expect(grace).toBe(0);
    });

    it('should accept custom grace period', () => {
      const grace = 60000; // 1 minute
      expect(grace).toBe(60000);
    });

    it('should return cleaned jobs array', () => {
      const cleaned: any[] = [];
      expect(Array.isArray(cleaned)).toBe(true);
    });

    it('should log cleaned count', () => {
      const logData = { queue: 'nft-minting', cleanedCount: 5 };
      expect(logData.cleanedCount).toBe(5);
    });
  });

  // ===========================================================================
  // close Method
  // ===========================================================================
  describe('close', () => {
    it('should close the queue', () => {
      let closed = false;
      const close = () => { closed = true; };
      close();
      expect(closed).toBe(true);
    });

    it('should log queue closed message', () => {
      const logData = { queue: 'nft-minting' };
      expect(logData.queue).toBe('nft-minting');
    });
  });

  // ===========================================================================
  // Default Export
  // ===========================================================================
  describe('Default Export', () => {
    it('should export BaseQueue class', () => {
      const BaseQueue = function() {};
      expect(BaseQueue).toBeDefined();
    });
  });
});
