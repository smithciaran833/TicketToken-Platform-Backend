# COMPLETE DATABASE ANALYSIS: queue-service
Generated: Thu Oct  2 15:07:54 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/job.routes.ts
```typescript
import { Router } from 'express';
import { JobController, addJobSchema } from '../controllers/job.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';

const router = Router();
const jobController = new JobController();

// All job routes require authentication
router.use(authenticate);

// Add a new job
router.post(
  '/',
  validateBody(addJobSchema),
  jobController.addJob.bind(jobController)
);

// Get job details
router.get('/:id', jobController.getJob.bind(jobController));

// Retry a failed job
router.post(
  '/:id/retry',
  authorize('admin', 'venue_admin'),
  jobController.retryJob.bind(jobController)
);

// Cancel a job
router.delete(
  '/:id',
  authorize('admin', 'venue_admin'),
  jobController.cancelJob.bind(jobController)
);

// Add batch jobs
router.post(
  '/batch',
  authorize('admin', 'venue_admin'),
  jobController.addBatchJobs.bind(jobController)
);

export default router;
```

### FILE: src/config/workers.config.ts
```typescript
export interface WorkerConfig {
  name: string;
  concurrency: number;
  maxStalledCount: number;
  stalledInterval: number;
}

export const WORKER_CONFIGS: Record<string, WorkerConfig> = {
  'payment.process': {
    name: 'payment-processor',
    concurrency: 5,
    maxStalledCount: 3,
    stalledInterval: 30000
  },
  'payment.retry': {
    name: 'payment-retry',
    concurrency: 3,
    maxStalledCount: 2,
    stalledInterval: 60000
  },
  'order.fulfill': {
    name: 'order-fulfillment',
    concurrency: 10,
    maxStalledCount: 3,
    stalledInterval: 30000
  },
  'ticket.mint': {
    name: 'ticket-minting',
    concurrency: 3,
    maxStalledCount: 1,
    stalledInterval: 120000
  },
  'email.send': {
    name: 'email-sender',
    concurrency: 20,
    maxStalledCount: 5,
    stalledInterval: 15000
  },
  'webhook.process': {
    name: 'webhook-processor',
    concurrency: 10,
    maxStalledCount: 3,
    stalledInterval: 30000
  }
};

export function getWorkerConfig(queueName: string): WorkerConfig {
  return WORKER_CONFIGS[queueName] || {
    name: 'default-worker',
    concurrency: 5,
    maxStalledCount: 3,
    stalledInterval: 30000
  };
}
```

### FILE: src/config/rate-limits.config.ts
```typescript
export interface RateLimitConfig {
  maxPerSecond: number;
  maxConcurrent: number;
  burstSize?: number;
  cooldownMs?: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Payment providers
  stripe: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_STRIPE || '25'),
    maxConcurrent: 10,
    burstSize: 50,
    cooldownMs: 1000
  },
  square: {
    maxPerSecond: 8,
    maxConcurrent: 5,
    burstSize: 20,
    cooldownMs: 2000
  },
  
  // Communication providers
  sendgrid: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_SENDGRID || '5'),
    maxConcurrent: 20,
    burstSize: 100,
    cooldownMs: 1000
  },
  twilio: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_TWILIO || '1'),
    maxConcurrent: 5,
    burstSize: 10,
    cooldownMs: 5000
  },
  
  // Blockchain
  solana: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_SOLANA || '10'),
    maxConcurrent: 5,
    burstSize: 30,
    cooldownMs: 1000
  },
  
  // Accounting
  quickbooks: {
    maxPerSecond: 2,
    maxConcurrent: 3,
    burstSize: 10,
    cooldownMs: 3000
  },
  
  // Internal APIs (higher limits)
  internal: {
    maxPerSecond: 100,
    maxConcurrent: 50,
    burstSize: 200,
    cooldownMs: 100
  }
};

// Rate limit groups (providers that share limits)
export const RATE_LIMIT_GROUPS: Record<string, string[]> = {
  twilio: ['twilio-sms', 'twilio-voice', 'twilio-verify'],
  stripe: ['stripe-charges', 'stripe-refunds', 'stripe-payouts'],
  sendgrid: ['sendgrid-transactional', 'sendgrid-marketing']
};
```

### FILE: src/config/retry-strategies.config.ts
```typescript
export interface RetryStrategy {
  type: 'fixed' | 'exponential' | 'linear';
  attempts: number;
  delay: number;
  maxDelay?: number;
  factor?: number;
}

export const RETRY_STRATEGIES: Record<string, RetryStrategy> = {
  'payment': {
    type: 'exponential',
    attempts: 5,
    delay: 1000,
    maxDelay: 60000,
    factor: 2
  },
  'email': {
    type: 'exponential',
    attempts: 3,
    delay: 5000,
    maxDelay: 30000,
    factor: 2
  },
  'webhook': {
    type: 'exponential',
    attempts: 5,
    delay: 2000,
    maxDelay: 120000,
    factor: 3
  },
  'minting': {
    type: 'linear',
    attempts: 10,
    delay: 30000
  },
  'default': {
    type: 'exponential',
    attempts: 3,
    delay: 1000,
    maxDelay: 10000,
    factor: 2
  }
};

export function getRetryStrategy(jobType: string): RetryStrategy {
  const strategy = jobType.split('.')[0];
  return RETRY_STRATEGIES[strategy] || RETRY_STRATEGIES.default;
}

export function calculateBackoff(attempt: number, strategy: RetryStrategy): number {
  switch (strategy.type) {
    case 'fixed':
      return strategy.delay;
    case 'linear':
      return strategy.delay * attempt;
    case 'exponential':
      const delay = strategy.delay * Math.pow(strategy.factor || 2, attempt - 1);
      return Math.min(delay, strategy.maxDelay || delay);
  }
}
```

### FILE: src/config/persistence.config.ts
```typescript
export interface PersistenceConfig {
  provider: 'redis' | 'postgresql';
  retentionDays: number;
  archiveCompleted: boolean;
  archiveLocation?: string;
}

export const PERSISTENCE_CONFIGS: Record<string, PersistenceConfig> = {
  'payment': {
    provider: 'postgresql',
    retentionDays: 90,
    archiveCompleted: true,
    archiveLocation: 'payment_archive'
  },
  'webhook': {
    provider: 'postgresql',
    retentionDays: 30,
    archiveCompleted: true,
    archiveLocation: 'webhook_archive'
  },
  'email': {
    provider: 'redis',
    retentionDays: 7,
    archiveCompleted: false
  },
  'notification': {
    provider: 'redis',
    retentionDays: 7,
    archiveCompleted: false
  },
  'minting': {
    provider: 'postgresql',
    retentionDays: 365,
    archiveCompleted: true,
    archiveLocation: 'blockchain_archive'
  },
  'default': {
    provider: 'redis',
    retentionDays: 14,
    archiveCompleted: false
  }
};

export function getPersistenceConfig(queueName: string): PersistenceConfig {
  const category = queueName.split('.')[0];
  return PERSISTENCE_CONFIGS[category] || PERSISTENCE_CONFIGS.default;
}

export const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '0'),
  keyPrefix: 'queue:'
};

export const POSTGRES_CONFIG = {
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
};
```

### FILE: src/config/database.ts
```typescript
import knex from 'knex';

export const db = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  pool: { min: 2, max: 10 }
});

export default db;
```

### FILE: src/controllers/job.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import Joi from 'joi';
import { QueueFactory } from '../queues/factories/queue.factory';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth.middleware';
import { QUEUE_PRIORITIES, JOB_TYPES } from '../config/constants';

// Validation schemas
export const addJobSchema = Joi.object({
  queue: Joi.string().valid('money', 'communication', 'background').required(),
  type: Joi.string().required(),
  data: Joi.object().required(),
  options: Joi.object({
    priority: Joi.number().min(1).max(10),
    delay: Joi.number().min(0),
    attempts: Joi.number().min(1).max(10)
  }).optional()
});

// Batch job validation schema
export const batchJobSchema = Joi.object({
  type: Joi.string().required(),
  data: Joi.object().required(),
  options: Joi.object({
    priority: Joi.number().min(1).max(10),
    delay: Joi.number().min(0),
    attempts: Joi.number().min(1).max(10)
  }).optional()
});

export const addBatchJobsSchema = Joi.object({
  queue: Joi.string().valid('money', 'communication', 'background').required(),
  jobs: Joi.array().items(batchJobSchema).min(1).max(100).required(),
  options: Joi.object({
    stopOnError: Joi.boolean().default(false),
    validateAll: Joi.boolean().default(true)
  }).optional()
});

export class JobController {
  async addJob(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { queue, type, data, options } = req.body;

      // Add user context to job data
      const jobData = {
        ...data,
        userId: req.user?.id,
        venueId: req.user?.venueId,
        addedAt: new Date().toISOString()
      };

      // Get the appropriate queue
      const queueInstance = QueueFactory.getQueue(queue);

      // Set default options based on queue type
      const jobOptions = {
        priority: options?.priority ||
          (queue === 'money' ? QUEUE_PRIORITIES.HIGH : QUEUE_PRIORITIES.NORMAL),
        delay: options?.delay || 0,
        attempts: options?.attempts ||
          (queue === 'money' ? 10 : 3)
      };

      // Add the job
      const job = await queueInstance.add(type, jobData, jobOptions);

      logger.info(`Job added to ${queue} queue`, {
        jobId: job.id,
        type,
        userId: req.user?.id
      });

      res.status(201).json({
        jobId: job.id,
        queue,
        type,
        status: 'queued',
        options: jobOptions
      });
    } catch (error) {
      logger.error('Failed to add job:', error);
      res.status(500).json({ error: 'Failed to add job' });
    }
  }

  async getJob(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { queue } = req.query as { queue?: string };

      if (!queue) {
        res.status(400).json({ error: 'Queue parameter required' });
        return;
      }

      const queueInstance = QueueFactory.getQueue(queue as any);
      const job = await queueInstance.getJob(id);

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const state = await job.getState();

      res.json({
        id: job.id,
        queue: job.queue.name,
        type: job.name,
        data: job.data,
        state,
        progress: job.progress(),
        attempts: job.attemptsMade,
        createdAt: new Date(job.timestamp),
        processedAt: job.processedOn ? new Date(job.processedOn) : null,
        finishedAt: job.finishedOn ? new Date(job.finishedOn) : null
      });
    } catch (error) {
      logger.error('Failed to get job:', error);
      res.status(500).json({ error: 'Failed to get job' });
    }
  }

  async retryJob(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { queue } = req.body;

      const queueInstance = QueueFactory.getQueue(queue);
      const job = await queueInstance.getJob(id);

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      await job.retry();

      logger.info(`Job ${id} retried by user ${req.user?.id}`);

      res.json({
        jobId: job.id,
        status: 'retrying',
        message: 'Job has been queued for retry'
      });
    } catch (error) {
      logger.error('Failed to retry job:', error);
      res.status(500).json({ error: 'Failed to retry job' });
    }
  }

  async cancelJob(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { queue } = req.query as { queue?: string };

      if (!queue) {
        res.status(400).json({ error: 'Queue parameter required' });
        return;
      }

      const queueInstance = QueueFactory.getQueue(queue as any);
      const job = await queueInstance.getJob(id);

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      await job.remove();

      logger.info(`Job ${id} cancelled by user ${req.user?.id}`);

      res.json({
        jobId: id,
        status: 'cancelled',
        message: 'Job has been cancelled'
      });
    } catch (error) {
      logger.error('Failed to cancel job:', error);
      res.status(500).json({ error: 'Failed to cancel job' });
    }
  }

  async addBatchJobs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { queue, jobs, options = {} } = req.body;
      const { stopOnError = false, validateAll = true } = options;

      // Validate batch size
      if (!Array.isArray(jobs) || jobs.length === 0) {
        res.status(400).json({ error: 'No jobs provided' });
        return;
      }

      if (jobs.length > 100) {
        res.status(400).json({ error: 'Batch size exceeds maximum of 100 jobs' });
        return;
      }

      const queueInstance = QueueFactory.getQueue(queue);
      const results = [];
      const errors = [];
      const validatedJobs = [];

      // Pre-validate all jobs if requested
      if (validateAll) {
        for (let i = 0; i < jobs.length; i++) {
          const jobData = jobs[i];
          
          // Validate individual job structure
          const validation = batchJobSchema.validate(jobData);
          if (validation.error) {
            errors.push({
              index: i,
              type: jobData.type || 'unknown',
              error: validation.error.message
            });
            
            if (stopOnError) {
              res.status(400).json({
                error: 'Validation failed',
                failedAt: i,
                validationErrors: errors
              });
              return;
            }
          } else {
            // Additional business logic validation
            const businessValidation = await this.validateJobData(queue, jobData);
            if (!businessValidation.valid) {
              errors.push({
                index: i,
                type: jobData.type,
                error: businessValidation.error
              });
              
              if (stopOnError) {
                res.status(400).json({
                  error: 'Business validation failed',
                  failedAt: i,
                  validationErrors: errors
                });
                return;
              }
            } else {
              validatedJobs.push({ index: i, job: jobData });
            }
          }
        }
      } else {
        // No pre-validation, add all jobs to validated list
        jobs.forEach((job, index) => {
          validatedJobs.push({ index, job });
        });
      }

      // Process validated jobs
      for (const { index, job: jobData } of validatedJobs) {
        try {
          // Sanitize and enrich job data
          const sanitizedData = this.sanitizeJobData(jobData.data);
          
          const enrichedJobData = {
            ...sanitizedData,
            userId: req.user?.id,
            venueId: req.user?.venueId,
            batchId: req.headers['x-batch-id'] || null,
            batchIndex: index,
            addedAt: new Date().toISOString()
          };

          // Set appropriate options for the queue type
          const jobOptions = {
            priority: jobData.options?.priority ||
              (queue === 'money' ? QUEUE_PRIORITIES.HIGH : QUEUE_PRIORITIES.NORMAL),
            delay: jobData.options?.delay || 0,
            attempts: jobData.options?.attempts ||
              (queue === 'money' ? 10 : 3),
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          };

          const job = await queueInstance.add(
            jobData.type,
            enrichedJobData,
            jobOptions
          );

          results.push({
            index,
            jobId: job.id,
            type: jobData.type,
            status: 'queued'
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push({
            index,
            type: jobData.type,
            error: errorMessage
          });

          if (stopOnError) {
            // Remove already queued jobs if stopOnError is true
            for (const result of results) {
              try {
                const job = await queueInstance.getJob(result.jobId);
                if (job) await job.remove();
              } catch (removeError) {
                logger.error('Failed to remove job on batch error:', removeError);
              }
            }

            res.status(500).json({
              error: 'Batch processing failed',
              failedAt: index,
              processed: results.length,
              errors
            });
            return;
          }
        }
      }

      logger.info(`Batch of ${results.length} jobs added to ${queue} queue`, {
        userId: req.user?.id,
        successful: results.length,
        failed: errors.length
      });

      res.status(201).json({
        queue,
        total: jobs.length,
        successful: results.length,
        failed: errors.length,
        jobs: results,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      logger.error('Failed to add batch jobs:', error);
      res.status(500).json({ error: 'Failed to add batch jobs' });
    }
  }

  // Helper method to validate job data based on queue and type
  private async validateJobData(queue: string, jobData: any): Promise<{ valid: boolean; error?: string }> {
    // Queue-specific validation
    if (queue === 'money') {
      // Validate money-related jobs
      if (jobData.type === 'payment' && !jobData.data?.amount) {
        return { valid: false, error: 'Payment jobs require amount' };
      }
      if (jobData.data?.amount && (jobData.data.amount <= 0 || jobData.data.amount > 1000000)) {
        return { valid: false, error: 'Invalid amount value' };
      }
      if (jobData.type === 'refund' && !jobData.data?.transactionId) {
        return { valid: false, error: 'Refund jobs require transactionId' };
      }
    }

    if (queue === 'communication') {
      // Validate communication jobs
      if (jobData.type === 'email' && !jobData.data?.to) {
        return { valid: false, error: 'Email jobs require recipient' };
      }
      if (jobData.data?.to && !this.isValidEmail(jobData.data.to)) {
        return { valid: false, error: 'Invalid email address' };
      }
    }

    if (queue === 'background') {
      // Validate background jobs
      if (!jobData.data?.targetId) {
        return { valid: false, error: 'Background jobs require targetId' };
      }
    }

    // Check for required fields based on job type
    const requiredFields = this.getRequiredFieldsForJobType(jobData.type);
    for (const field of requiredFields) {
      if (!jobData.data?.[field]) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    return { valid: true };
  }

  // Sanitize job data to prevent injection or malicious content
  private sanitizeJobData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Skip potentially dangerous keys
      if (key.startsWith('__') || key.includes('prototype')) {
        continue;
      }

      // Recursively sanitize nested objects
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeJobData(value);
      } else if (typeof value === 'string') {
        // Remove any script tags or SQL-like content
        sanitized[key] = value
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)\b)/gi, '');
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private getRequiredFieldsForJobType(type: string): string[] {
    const requiredFieldsMap: Record<string, string[]> = {
      'payment': ['amount', 'currency', 'userId'],
      'refund': ['transactionId', 'amount', 'reason'],
      'email': ['to', 'subject', 'template'],
      'sms': ['to', 'message'],
      'analytics': ['eventType', 'targetId'],
      'nft-mint': ['ticketId', 'walletAddress']
    };

    return requiredFieldsMap[type] || [];
  }
}
```

### FILE: src/controllers/metrics.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { MonitoringService } from '../services/monitoring.service';
import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';

export class MetricsController {
  private monitoringService: MonitoringService;
  
  constructor() {
    this.monitoringService = MonitoringService.getInstance();
  }
  
  // Prometheus metrics endpoint
  async getPrometheusMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = this.monitoringService.getPrometheusMetrics();
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    } catch (error) {
      logger.error('Failed to get Prometheus metrics:', error);
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  }
  
  // JSON metrics summary
  async getMetricsSummary(req: Request, res: Response): Promise<void> {
    try {
      const summary = await this.monitoringService.getMetricsSummary();
      res.json(summary);
    } catch (error) {
      logger.error('Failed to get metrics summary:', error);
      res.status(500).json({ error: 'Failed to get metrics summary' });
    }
  }
  
  // Get queue throughput
  async getThroughput(req: Request, res: Response): Promise<void> {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT 
           queue_name,
           DATE_TRUNC('minute', captured_at) as minute,
           MAX(completed_count) - MIN(completed_count) as jobs_per_minute
         FROM queue_metrics
         WHERE captured_at > NOW() - INTERVAL '1 hour'
         GROUP BY queue_name, minute
         ORDER BY minute DESC`
      );
      
      res.json({
        throughput: result.rows,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to get throughput:', error);
      res.status(500).json({ error: 'Failed to get throughput' });
    }
  }
  
  // Get failure analysis
  async getFailureAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const pool = getPool();
      
      // Get failure trends
      const failures = await pool.query(
        `SELECT 
           queue_name,
           DATE_TRUNC('hour', captured_at) as hour,
           AVG(failed_count) as avg_failures
         FROM queue_metrics
         WHERE captured_at > NOW() - INTERVAL '24 hours'
         GROUP BY queue_name, hour
         ORDER BY hour DESC`
      );
      
      // Get recent failed jobs from dead letter
      const deadLetter = await pool.query(
        `SELECT 
           queue_name,
           job_type,
           COUNT(*) as count,
           MAX(created_at) as last_failure
         FROM dead_letter_jobs
         WHERE created_at > NOW() - INTERVAL '24 hours'
         GROUP BY queue_name, job_type
         ORDER BY count DESC
         LIMIT 10`
      );
      
      res.json({
        trends: failures.rows,
        topFailures: deadLetter.rows,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to get failure analysis:', error);
      res.status(500).json({ error: 'Failed to get failure analysis' });
    }
  }
}
```

### FILE: src/controllers/alerts.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth.middleware';

export class AlertsController {
  // Get recent alerts
  async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const { severity, limit = 50 } = req.query;
      const pool = getPool();
      
      let query = `
        SELECT * FROM alert_history
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `;
      
      const params: any[] = [];
      if (severity) {
        query += ' AND severity = $1';
        params.push(severity);
      }
      
      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
      params.push(limit);
      
      const result = await pool.query(query, params);
      
      res.json({
        alerts: result.rows,
        count: result.rowCount
      });
    } catch (error) {
      logger.error('Failed to get alerts:', error);
      res.status(500).json({ error: 'Failed to get alerts' });
    }
  }
  
  // Acknowledge an alert
  async acknowledgeAlert(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const pool = getPool();
      
      await pool.query(
        `UPDATE alert_history 
         SET acknowledged = true, 
             acknowledged_by = $1,
             acknowledged_at = NOW()
         WHERE id = $2`,
        [req.user?.id, id]
      );
      
      logger.info(`Alert ${id} acknowledged by user ${req.user?.id}`);
      
      res.json({
        alertId: id,
        status: 'acknowledged',
        acknowledgedBy: req.user?.id
      });
    } catch (error) {
      logger.error('Failed to acknowledge alert:', error);
      res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
  }
  
  // Test alert system
  async testAlert(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { severity = 'info', channel = 'log' } = req.body;
      
      logger.warn(`Test alert triggered by user ${req.user?.id}`);
      
      // This would trigger actual alerts in production
      // For now, just log it
      
      res.json({
        status: 'sent',
        severity,
        channel,
        message: 'Test alert sent successfully'
      });
    } catch (error) {
      logger.error('Failed to send test alert:', error);
      res.status(500).json({ error: 'Failed to send test alert' });
    }
  }
}
```

### FILE: src/controllers/health.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { getPool } from '../config/database.config';
import { getRedisClient } from '../config/redis.config';
import { QueueFactory } from '../queues/factories/queue.factory';
import { logger } from '../utils/logger';

export class HealthController {
  async checkHealth(req: Request, res: Response): Promise<void> {
    try {
      const checks = {
        service: 'healthy',
        database: 'unknown',
        redis: 'unknown',
        queues: 'unknown'
      };
      
      // Check database
      try {
        const pool = getPool();
        await pool.query('SELECT 1');
        checks.database = 'healthy';
      } catch (error) {
        checks.database = 'unhealthy';
        logger.error('Database health check failed:', error);
      }
      
      // Check Redis
      try {
        const redis = getRedisClient();
        await redis.ping();
        checks.redis = 'healthy';
      } catch (error) {
        checks.redis = 'unhealthy';
        logger.error('Redis health check failed:', error);
      }
      
      // Check queues
      try {
        await QueueFactory.getQueueMetrics('money');
        checks.queues = 'healthy';
      } catch (error) {
        checks.queues = 'unhealthy';
        logger.error('Queue health check failed:', error);
      }
      
      const isHealthy = Object.values(checks).every(status => status === 'healthy');
      
      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'degraded',
        checks,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check failed'
      });
    }
  }
  
  async checkReadiness(req: Request, res: Response): Promise<void> {
    try {
      // Check if service is ready to accept traffic
      const pool = getPool();
      await pool.query('SELECT 1');
      
      const redis = getRedisClient();
      await redis.ping();
      
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Readiness check failed:', error);
      res.status(503).json({
        status: 'not ready',
        error: 'Service not ready'
      });
    }
  }
}
```

### FILE: src/models/RateLimit.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IRateLimit {
  id?: string;
  key: string;
  limit: number;
  window_seconds: number;
  current_count: number;
  reset_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class RateLimitModel {
  private db: Knex;
  private tableName = 'rate_limits';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IRateLimit): Promise<IRateLimit> {
    const [rateLimit] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return rateLimit;
  }

  async findByKey(key: string): Promise<IRateLimit | null> {
    const rateLimit = await this.db(this.tableName)
      .where({ key })
      .first();
    return rateLimit || null;
  }

  async increment(key: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ key })
      .where('reset_at', '>', new Date())
      .increment('current_count', 1);
    return result > 0;
  }

  async reset(key: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ key })
      .update({ 
        current_count: 0, 
        reset_at: new Date(Date.now() + 1000 * 60 * 60) 
      });
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default RateLimitModel;
```

### FILE: src/models/Schedule.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface ISchedule {
  id?: string;
  name: string;
  cron_expression: string;
  job_type: string;
  job_data?: any;
  active: boolean;
  last_run?: Date;
  next_run?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class ScheduleModel {
  private db: Knex;
  private tableName = 'schedules';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ISchedule): Promise<ISchedule> {
    const [schedule] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return schedule;
  }

  async findById(id: string): Promise<ISchedule | null> {
    const schedule = await this.db(this.tableName)
      .where({ id })
      .first();
    return schedule || null;
  }

  async findActive(): Promise<ISchedule[]> {
    return this.db(this.tableName)
      .where({ active: true })
      .orderBy('next_run', 'asc');
  }

  async update(id: string, data: Partial<ISchedule>): Promise<ISchedule | null> {
    const [schedule] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return schedule || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default ScheduleModel;
```

### FILE: src/models/Queue.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IQueue {
  id?: string;
  name: string;
  type: string;
  config?: any;
  active: boolean;
  pending_count?: number;
  processing_count?: number;
  completed_count?: number;
  failed_count?: number;
  created_at?: Date;
  updated_at?: Date;
}

export class QueueModel {
  private db: Knex;
  private tableName = 'queues';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IQueue): Promise<IQueue> {
    const [queue] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return queue;
  }

  async findById(id: string): Promise<IQueue | null> {
    const queue = await this.db(this.tableName)
      .where({ id })
      .first();
    return queue || null;
  }

  async findByName(name: string): Promise<IQueue | null> {
    return this.db(this.tableName)
      .where({ name })
      .first();
  }

  async findAll(filters: Partial<IQueue> = {}): Promise<IQueue[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IQueue>): Promise<IQueue | null> {
    const [queue] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return queue || null;
  }

  async incrementCounter(id: string, counter: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .increment(`${counter}_count`, 1);
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default QueueModel;
```

### FILE: src/models/Job.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IJob {
  id?: string;
  queue: string;
  type: string;
  data?: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts?: number;
  max_attempts?: number;
  error?: string;
  scheduled_for?: Date;
  started_at?: Date;
  completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class JobModel {
  private db: Knex;
  private tableName = 'jobs';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IJob): Promise<IJob> {
    const [job] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return job;
  }

  async findById(id: string): Promise<IJob | null> {
    const job = await this.db(this.tableName)
      .where({ id })
      .first();
    return job || null;
  }

  async findPending(queue: string, limit = 10): Promise<IJob[]> {
    return this.db(this.tableName)
      .where({ queue, status: 'pending' })
      .where('scheduled_for', '<=', new Date())
      .orderBy('created_at', 'asc')
      .limit(limit);
  }

  async update(id: string, data: Partial<IJob>): Promise<IJob | null> {
    const [job] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return job || null;
  }

  async markAsProcessing(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id, status: 'pending' })
      .update({ status: 'processing', started_at: new Date() });
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default JobModel;
```

### FILE: src/middleware/metrics.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';

interface RequestMetrics {
  totalRequests: number;
  requestsByEndpoint: Map<string, number>;
  requestsByStatus: Map<number, number>;
  averageResponseTime: number;
}

const metrics: RequestMetrics = {
  totalRequests: 0,
  requestsByEndpoint: new Map(),
  requestsByStatus: new Map(),
  averageResponseTime: 0
};

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Update metrics
    metrics.totalRequests++;
    
    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    metrics.requestsByEndpoint.set(
      endpoint,
      (metrics.requestsByEndpoint.get(endpoint) || 0) + 1
    );
    
    metrics.requestsByStatus.set(
      res.statusCode,
      (metrics.requestsByStatus.get(res.statusCode) || 0) + 1
    );
    
    // Update average response time
    metrics.averageResponseTime = 
      (metrics.averageResponseTime * (metrics.totalRequests - 1) + duration) / 
      metrics.totalRequests;
  });
  
  next();
}

export function getMetrics(): RequestMetrics {
  return metrics;
}
```

### FILE: src/middleware/rate-limit.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { RateLimiterService } from '../services/rate-limiter.service';
import { logger } from '../utils/logger';

const rateLimiter = RateLimiterService.getInstance();

export interface RateLimitOptions {
  service?: string;
  maxRequests?: number;
  windowMs?: number;
  message?: string;
}

/**
 * Rate limit middleware for API endpoints
 */
export function rateLimitMiddleware(options: RateLimitOptions = {}) {
  const {
    service = 'internal',
    message = 'Too many requests, please try again later.'
  } = options;
  
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if rate limited
      const isLimited = await rateLimiter.isRateLimited(service);
      
      if (isLimited) {
        const waitTime = rateLimiter.getWaitTime(service);
        res.setHeader('X-RateLimit-Limit', '1');
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + waitTime).toISOString());
        res.setHeader('Retry-After', Math.ceil(waitTime / 1000).toString());
        
        logger.warn(`Rate limit exceeded for ${service}`, {
          ip: req.ip,
          path: req.path
        });
        
        res.status(429).json({
          error: 'Rate limit exceeded',
          message,
          retryAfter: Math.ceil(waitTime / 1000)
        });
        return;
      }
      
      // Try to acquire rate limit
      await rateLimiter.acquire(service);
      
      // Release on response finish
      res.on('finish', () => {
        rateLimiter.release(service);
      });
      
      next();
    } catch (error) {
      logger.error('Rate limit middleware error:', error);
      // Allow request on error
      next();
    }
  };
}

/**
 * Global rate limiter for all API endpoints
 */
export const globalRateLimit = rateLimitMiddleware({
  service: 'internal',
  message: 'API rate limit exceeded. Please slow down your requests.'
});
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: any;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Authentication failed:', error);
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    if (!roles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt by user ${req.user.id} with role ${req.user.role}`);
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    
    next();
  };
}
```

### FILE: src/middleware/validation.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../utils/logger';

export function validateBody(schema: Joi.Schema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.validateAsync(req.body, {
        abortEarly: false,
        stripUnknown: true
      });
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        logger.warn('Validation error:', errors);
        
        res.status(400).json({
          error: 'Validation failed',
          details: errors
        });
        return;
      }
      next(error);
    }
  };
}

export function validateQuery(schema: Joi.Schema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.validateAsync(req.query, {
        abortEarly: false
      });
      req.query = validated;
      next();
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        res.status(400).json({
          error: 'Invalid query parameters',
          details: error.details
        });
        return;
      }
      next(error);
    }
  };
}

export function validateParams(schema: Joi.Schema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.validateAsync(req.params);
      req.params = validated;
      next();
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        res.status(400).json({
          error: 'Invalid parameters',
          details: error.details
        });
        return;
      }
      next(error);
    }
  };
}
```

### FILE: src/services/monitoring.service.ts
```typescript
import * as promClient from 'prom-client';
import twilio from 'twilio';
import { Queue } from 'bull';
import { logger } from '../utils/logger';
import { QueueFactory } from '../queues/factories/queue.factory';
import { getPool } from '../config/database.config';

interface AlertThresholds {
  moneyQueueDepth: number;
  moneyQueueAge: number; // minutes
  commQueueDepth: number;
  backgroundQueueDepth: number;
  failureRate: number; // percentage
}

interface Alert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  context: any;
  timestamp: Date;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private twilioClient: any;
  private metrics: any = {};
  private alertCooldowns: Map<string, number> = new Map();
  private thresholds: AlertThresholds;
  private checkInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    // Initialize thresholds first
    this.thresholds = {
      moneyQueueDepth: 50,
      moneyQueueAge: 10,
      commQueueDepth: 5000,
      backgroundQueueDepth: 50000,
      failureRate: 10
    };
    
    this.setupMetrics();
    this.setupTwilio();
    this.loadThresholds();
  }
  
  static getInstance(): MonitoringService {
    if (!this.instance) {
      this.instance = new MonitoringService();
    }
    return this.instance;
  }
  
  private setupMetrics() {
    // Create a Registry
    const register = new promClient.Registry();
    
    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({ register });
    
    // Queue depth gauge
    this.metrics.queueDepth = new promClient.Gauge({
      name: 'queue_depth',
      help: 'Number of jobs in queue',
      labelNames: ['queue_name', 'status'],
      registers: [register]
    });
    
    // Job processing duration histogram
    this.metrics.jobDuration = new promClient.Histogram({
      name: 'job_processing_duration_seconds',
      help: 'Time taken to process jobs',
      labelNames: ['queue_name', 'job_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [register]
    });
    
    // Job completion counter
    this.metrics.jobResults = new promClient.Counter({
      name: 'job_results_total',
      help: 'Job completion results',
      labelNames: ['queue_name', 'job_type', 'result'],
      registers: [register]
    });
    
    // Alert counter
    this.metrics.alertsSent = new promClient.Counter({
      name: 'alerts_sent_total',
      help: 'Number of alerts sent',
      labelNames: ['severity', 'type', 'channel'],
      registers: [register]
    });
    
    // Queue age gauge (oldest job age)
    this.metrics.oldestJobAge = new promClient.Gauge({
      name: 'oldest_job_age_seconds',
      help: 'Age of oldest waiting job',
      labelNames: ['queue_name'],
      registers: [register]
    });
    
    // Failed job gauge
    this.metrics.failedJobs = new promClient.Gauge({
      name: 'failed_jobs_total',
      help: 'Number of failed jobs',
      labelNames: ['queue_name'],
      registers: [register]
    });
    
    this.metrics.register = register;
    
    logger.info('Prometheus metrics initialized');
  }
  
  private setupTwilio() {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      logger.info('Twilio client initialized');
    } else {
      logger.warn('Twilio credentials not configured - alerts will be logged only');
    }
  }
  
  private loadThresholds() {
    this.thresholds = {
      moneyQueueDepth: parseInt(process.env.ALERT_THRESHOLD_MONEY_QUEUE || '50'),
      moneyQueueAge: parseInt(process.env.ALERT_THRESHOLD_MONEY_AGE_MINUTES || '10'),
      commQueueDepth: parseInt(process.env.ALERT_THRESHOLD_COMM_QUEUE || '5000'),
      backgroundQueueDepth: parseInt(process.env.ALERT_THRESHOLD_BACKGROUND_QUEUE || '50000'),
      failureRate: parseFloat(process.env.ALERT_THRESHOLD_FAILURE_RATE || '10')
    };
    
    logger.info('Alert thresholds loaded:', this.thresholds);
  }
  
  async start() {
    logger.info('Starting monitoring service...');
    
    // Check queue health every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkAllQueues().catch(error => {
        logger.error('Error checking queues:', error);
      });
    }, 30000);
    
    // Initial check
    await this.checkAllQueues();
  }
  
  async stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('Monitoring service stopped');
  }
  
  private async checkAllQueues() {
    const queues: Array<{ name: string; type: 'money' | 'communication' | 'background' }> = [
      { name: 'money-queue', type: 'money' },
      { name: 'communication-queue', type: 'communication' },
      { name: 'background-queue', type: 'background' }
    ];
    
    for (const queueInfo of queues) {
      try {
        await this.checkQueueHealth(queueInfo.type);
      } catch (error) {
        logger.error(`Error checking ${queueInfo.name}:`, error);
      }
    }
  }
  
  private async checkQueueHealth(queueType: 'money' | 'communication' | 'background') {
    const queue = QueueFactory.getQueue(queueType);
    const counts = await queue.getJobCounts();
    
    // Update Prometheus metrics
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'waiting' },
      counts.waiting
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'active' },
      counts.active
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'completed' },
      counts.completed
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'failed' },
      counts.failed
    );
    
    this.metrics.failedJobs.set(
      { queue_name: queue.name },
      counts.failed
    );
    
    // Check oldest job age
    const oldestJob = await this.getOldestWaitingJob(queue);
    if (oldestJob) {
      const ageSeconds = (Date.now() - oldestJob.timestamp) / 1000;
      this.metrics.oldestJobAge.set({ queue_name: queue.name }, ageSeconds);
      
      // Check age threshold for money queue
      if (queueType === 'money' && ageSeconds > this.thresholds.moneyQueueAge * 60) {
        await this.sendAlert({
          type: 'job_age',
          severity: 'critical',
          message: `Money queue job waiting over ${this.thresholds.moneyQueueAge} minutes!`,
          context: {
            queue: queue.name,
            jobId: oldestJob.id,
            ageMinutes: Math.floor(ageSeconds / 60)
          },
          timestamp: new Date()
        });
      }
    }
    
    // Check queue-specific thresholds
    if (queueType === 'money') {
      // CRITICAL: Money queue depth
      if (counts.waiting > this.thresholds.moneyQueueDepth) {
        await this.sendAlert({
          type: 'queue_depth',
          severity: 'critical',
          message: `CRITICAL: Money queue has ${counts.waiting} jobs waiting!`,
          context: {
            queue: queue.name,
            depth: counts.waiting,
            threshold: this.thresholds.moneyQueueDepth
          },
          timestamp: new Date()
        });
      }
      
      // CRITICAL: Money queue failures
      if (counts.failed > 10) {
        await this.sendAlert({
          type: 'high_failures',
          severity: 'critical',
          message: `CRITICAL: ${counts.failed} payment jobs failed!`,
          context: {
            queue: queue.name,
            failed: counts.failed
          },
          timestamp: new Date()
        });
      }
    } else if (queueType === 'communication') {
      // WARNING: Communication queue depth
      if (counts.waiting > this.thresholds.commQueueDepth) {
        await this.sendAlert({
          type: 'queue_depth',
          severity: 'warning',
          message: `Warning: ${counts.waiting} emails/SMS queued`,
          context: {
            queue: queue.name,
            depth: counts.waiting,
            threshold: this.thresholds.commQueueDepth
          },
          timestamp: new Date()
        });
      }
    }
    
    // Store metrics in database
    await this.storeMetrics(queue.name, counts);
  }
  
  private async getOldestWaitingJob(queue: Queue): Promise<any> {
    const jobs = await queue.getWaiting(0, 1);
    return jobs[0];
  }
  
  private async sendAlert(alert: Alert) {
    // Check cooldown to prevent spam
    const cooldownKey = `${alert.type}:${alert.severity}:${alert.context.queue}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey) || 0;
    const cooldownMs = alert.severity === 'critical' ? 300000 : 3600000; // 5 min for critical, 1 hour for others
    
    if (Date.now() - lastAlert < cooldownMs) {
      return; // Skip due to cooldown
    }
    
    logger.error(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`, alert.context);
    
    // Store alert in database
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO alert_history (severity, alert_type, message, queue_name, metric_value, threshold_value, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          alert.severity,
          alert.type,
          alert.message,
          alert.context.queue,
          alert.context.depth || alert.context.ageMinutes,
          alert.context.threshold
        ]
      );
    } catch (error) {
      logger.error('Failed to store alert in database:', error);
    }
    
    // Update metrics
    this.metrics.alertsSent.inc({
      severity: alert.severity,
      type: alert.type,
      channel: 'log'
    });
    
    // Send actual alert based on severity
    if (alert.severity === 'critical') {
      await this.sendCriticalAlert(alert);
    } else if (alert.severity === 'warning') {
      await this.sendWarningAlert(alert);
    }
    
    // Update cooldown
    this.alertCooldowns.set(cooldownKey, Date.now());
  }
  
  private async sendCriticalAlert(alert: Alert) {
    // Try to call on-call engineer
    if (this.twilioClient && process.env.ONCALL_PHONE) {
      try {
        // Send SMS first (more reliable)
        await this.twilioClient.messages.create({
          to: process.env.ONCALL_PHONE,
          from: process.env.TWILIO_PHONE,
          body: `🚨 CRITICAL Queue Alert:\n${alert.message}\n\nCheck immediately!`
        });
        
        this.metrics.alertsSent.inc({
          severity: 'critical',
          type: alert.type,
          channel: 'sms'
        });
        
        logger.info('Critical alert SMS sent');
        
        // Also try to call for money queue issues
        if (alert.context.queue === 'money-queue') {
          await this.twilioClient.calls.create({
            to: process.env.ONCALL_PHONE,
            from: process.env.TWILIO_PHONE,
            url: 'http://demo.twilio.com/docs/voice.xml' // You can customize this
          });
          
          this.metrics.alertsSent.inc({
            severity: 'critical',
            type: alert.type,
            channel: 'phone'
          });
          
          logger.info('Critical alert phone call initiated');
        }
      } catch (error) {
        logger.error('Failed to send Twilio alert:', error);
      }
    }
  }
  
  private async sendWarningAlert(alert: Alert) {
    // Send SMS for warnings
    if (this.twilioClient && process.env.ONCALL_PHONE) {
      try {
        await this.twilioClient.messages.create({
          to: process.env.ONCALL_PHONE,
          from: process.env.TWILIO_PHONE,
          body: `⚠️ Queue Warning:\n${alert.message}`
        });
        
        this.metrics.alertsSent.inc({
          severity: 'warning',
          type: alert.type,
          channel: 'sms'
        });
        
        logger.info('Warning alert SMS sent');
      } catch (error) {
        logger.error('Failed to send warning alert:', error);
      }
    }
  }
  
  private async storeMetrics(queueName: string, counts: any) {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO queue_metrics 
         (queue_name, waiting_count, active_count, completed_count, failed_count, captured_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [queueName, counts.waiting, counts.active, counts.completed, counts.failed]
      );
    } catch (error) {
      logger.error('Failed to store metrics:', error);
    }
  }
  
  getPrometheusMetrics(): string {
    return this.metrics.register.metrics();
  }
  
  async getMetricsSummary() {
    const pool = getPool();
    
    // Get recent metrics
    const result = await pool.query(
      `SELECT 
         queue_name,
         AVG(waiting_count) as avg_waiting,
         MAX(waiting_count) as max_waiting,
         AVG(active_count) as avg_active,
         AVG(failed_count) as avg_failed
       FROM queue_metrics
       WHERE captured_at > NOW() - INTERVAL '1 hour'
       GROUP BY queue_name`
    );
    
    // Get recent alerts
    const alerts = await pool.query(
      `SELECT severity, COUNT(*) as count
       FROM alert_history
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY severity`
    );
    
    return {
      queues: result.rows,
      alerts: alerts.rows,
      timestamp: new Date()
    };
  }
  
  // Record job completion for metrics
  recordJobSuccess(queueName: string, jobType: string, duration: number) {
    this.metrics.jobDuration.observe(
      { queue_name: queueName, job_type: jobType },
      duration
    );
    this.metrics.jobResults.inc({
      queue_name: queueName,
      job_type: jobType,
      result: 'success'
    });
  }
  
  recordJobFailure(queueName: string, jobType: string, error: any) {
    this.metrics.jobResults.inc({
      queue_name: queueName,
      job_type: jobType,
      result: 'failure'
    });
  }
}
```

### FILE: src/services/idempotency.service.ts
```typescript
import { Pool } from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';

export class IdempotencyService {
  private pool: Pool;
  private redis: Redis;
  private readonly DEFAULT_TTL = 86400; // 24 hours

  constructor() {
    this.pool = getPool();
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 4 // Separate DB for idempotency
    });
  }

  /**
   * Generate idempotency key based on job type and data
   */
  generateKey(jobType: string, data: any): string {
    switch(jobType) {
      case 'payment-process':
        // For payments, use venue, user, event, and amount
        return `payment-${data.venueId}-${data.userId}-${data.eventId}-${data.amount}`;
      
      case 'refund-process':
        return `refund-${data.transactionId}`;
      
      case 'nft-mint':
        return `nft-${data.eventId}-${data.seatId || data.ticketId}`;
      
      case 'payout-process':
        return `payout-${data.venueId}-${data.period || data.payoutId}`;
      
      case 'send-email':
        // For emails, include date to allow daily sends
        const date = new Date().toISOString().split('T')[0];
        return `email-${data.template}-${data.to}-${date}`;
      
      case 'send-sms':

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
        // For SMS, more restrictive

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
        const hour = new Date().getHours();

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
        return `sms-${data.to}-${data.template}-${hour}`;

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
      
      default:
        // Generic hash for unknown types
        const hash = crypto.createHash('sha256');
        hash.update(jobType);
        hash.update(JSON.stringify(data));
        return hash.digest('hex');
    }
  }

  /**
   * Check if a job with this key was already processed
   */
  async check(key: string): Promise<any | null> {
    // Check Redis first (fast)
    const cached = await this.redis.get(`idem:${key}`);
    if (cached) {
      logger.info(`Idempotency hit (Redis): ${key}`);
      return JSON.parse(cached);
    }

    // Check PostgreSQL (persistent)
    const result = await this.pool.query(
      'SELECT result FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
      [key]
    );

    if (result.rows.length > 0) {
      logger.info(`Idempotency hit (PostgreSQL): ${key}`);
      
      // Cache in Redis for next time
      await this.redis.setex(
        `idem:${key}`,
        3600, // 1 hour cache
        JSON.stringify(result.rows[0].result)
      );
      
      return result.rows[0].result;
    }

    return null;
  }

  /**
   * Store the result for idempotency
   */
  async store(
    key: string, 
    queueName: string,
    jobType: string,
    result: any, 
    ttlSeconds: number = this.DEFAULT_TTL
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Store in PostgreSQL for persistence
    await this.pool.query(
      `INSERT INTO idempotency_keys 
       (key, queue_name, job_type, result, processed_at, expires_at)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (key) DO UPDATE 
       SET result = $4, processed_at = NOW()`,
      [key, queueName, jobType, result, expiresAt]
    );

    // Store in Redis for fast access
    await this.redis.setex(
      `idem:${key}`,
      ttlSeconds,
      JSON.stringify(result)
    );

    logger.info(`Idempotency stored: ${key} for ${ttlSeconds}s`);
  }

  /**
   * Clean up expired keys
   */
  async cleanup(): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM idempotency_keys WHERE expires_at < NOW()'
    );
    
    logger.info(`Cleaned up ${result.rowCount} expired idempotency keys`);
  }
}
```

### FILE: src/services/recovery.service.ts
```typescript
import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';
import { QueueFactory } from '../queues/factories/queue.factory';
import { JOB_TYPES, QUEUE_NAMES } from '../config/constants';

export class RecoveryService {
  private pool = getPool();

  async recoverPendingJobs(): Promise<void> {
    try {
      logger.info('Starting job recovery process...');

      // Recover critical jobs from PostgreSQL
      const result = await this.pool.query(
        `SELECT * FROM critical_jobs 
         WHERE status IN ('pending', 'processing')
         AND created_at > NOW() - INTERVAL '24 hours'
         ORDER BY priority DESC, created_at ASC`
      );

      if (result.rows.length === 0) {
        logger.info('No jobs to recover');
        return;
      }

      logger.info(`Found ${result.rows.length} jobs to recover`);

      for (const row of result.rows) {
        try {
          await this.recoverJob(row);
        } catch (error) {
          logger.error(`Failed to recover job ${row.id}:`, error);
        }
      }

      logger.info('Job recovery completed');
    } catch (error) {
      logger.error('Recovery process failed:', error);
    }
  }

  private async recoverJob(jobData: any): Promise<void> {
    const queue = this.determineQueue(jobData.queue_name);
    
    if (!queue) {
      logger.warn(`Unknown queue for job ${jobData.id}: ${jobData.queue_name}`);
      return;
    }

    // Re-add the job to the queue
    const job = await queue.add(
      jobData.job_type,
      jobData.data,
      {
        jobId: jobData.id, // Use same ID
        priority: jobData.priority,
        attempts: 10 - jobData.attempts // Remaining attempts
      }
    );

    logger.info(`Recovered job ${job.id} to ${jobData.queue_name}`);
  }

  private determineQueue(queueName: string) {
    if (queueName === QUEUE_NAMES.MONEY) {
      return QueueFactory.getQueue('money');
    } else if (queueName === QUEUE_NAMES.COMMUNICATION) {
      return QueueFactory.getQueue('communication');
    } else if (queueName === QUEUE_NAMES.BACKGROUND) {
      return QueueFactory.getQueue('background');
    }
    return null;
  }
}
```

### FILE: src/services/persistence.service.ts
```typescript
import { Pool } from 'pg';
import Redis from 'ioredis';
import { Job } from 'bull';
import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';
import { PERSISTENCE_TIERS } from '../config/constants';

export class PersistenceService {
  private tier: string;
  private pool: Pool;
  private redis?: Redis;

  constructor(tier: string) {
    this.tier = tier;
    this.pool = getPool();
    
    // Setup Redis with appropriate persistence
    if (tier === PERSISTENCE_TIERS.TIER_1) {
      // Tier 1: Redis with AOF (Append Only File)
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: 1,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        enableOfflineQueue: true
      });
    } else if (tier === PERSISTENCE_TIERS.TIER_2) {
      // Tier 2: Redis with RDB snapshots
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: 2,
        retryStrategy: (times) => Math.min(times * 100, 5000)
      });
    }
    // Tier 3: No special Redis setup needed (memory only)
  }

  async saveJob(job: Job): Promise<void> {
    const jobId = String(job.id); // Convert to string
    
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      try {
        // Save to PostgreSQL for Tier 1 (critical jobs)
        await this.pool.query(
          `INSERT INTO critical_jobs 
           (id, queue_name, job_type, data, priority, idempotency_key, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           ON CONFLICT (id) DO UPDATE 
           SET updated_at = CURRENT_TIMESTAMP, status = 'pending'`,
          [
            jobId,
            job.queue.name,
            job.name,
            JSON.stringify(job.data),
            job.opts.priority || 5,
            job.data.idempotencyKey || null
          ]
        );
        
        logger.info(`Tier 1 job saved to PostgreSQL: ${jobId}`);
        
        // Also save to Redis for fast access
        if (this.redis) {
          await this.redis.hset(
            `job:${jobId}`,
            'queue', job.queue.name,
            'type', job.name,
            'data', JSON.stringify(job.data),
            'status', 'pending',
            'timestamp', Date.now().toString()
          );
        }
      } catch (error) {
        logger.error(`Failed to persist Tier 1 job ${jobId}:`, error);
        throw error; // Don't process if can't persist
      }
    } else if (this.tier === PERSISTENCE_TIERS.TIER_2 && this.redis) {
      // Tier 2: Save to Redis only
      await this.redis.hset(
        `job:${jobId}`,
        'queue', job.queue.name,
        'type', job.name,
        'data', JSON.stringify(job.data),
        'status', 'pending'
      );
      
      // Trigger RDB snapshot periodically
      const keyCount = await this.redis.dbsize();
      if (keyCount % 100 === 0) {
        await this.redis.bgsave();
        logger.debug('Tier 2 RDB snapshot triggered');
      }
    }
    // Tier 3: No persistence needed
  }

  async markComplete(jobId: string | number, result: any): Promise<void> {
    const id = String(jobId); // Convert to string
    
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      await this.pool.query(
        `UPDATE critical_jobs 
         SET status = 'completed', 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );
      
      if (this.redis) {
        await this.redis.hset(`job:${id}`, 'status', 'completed');
      }
    } else if (this.tier === PERSISTENCE_TIERS.TIER_2 && this.redis) {
      await this.redis.hset(`job:${id}`, 'status', 'completed');
      // Clean up after 5 minutes
      setTimeout(() => {
        this.redis?.del(`job:${id}`);
      }, 300000);
    }
  }

  async markFailed(jobId: string | number, error: Error): Promise<void> {
    const id = String(jobId); // Convert to string
    
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      await this.pool.query(
        `UPDATE critical_jobs 
         SET status = 'failed',
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );
    }
    
    if (this.redis) {
      await this.redis.hset(`job:${id}`, 
        'status', 'failed',
        'error', error.message
      );
    }
  }

  async recoverJobs(): Promise<any[]> {
    // Only Tier 1 can recover from PostgreSQL
    if (this.tier !== PERSISTENCE_TIERS.TIER_1) {
      return [];
    }

    const result = await this.pool.query(
      `SELECT * FROM critical_jobs 
       WHERE status IN ('pending', 'processing')
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY priority DESC, created_at ASC`
    );

    logger.info(`Recovering ${result.rows.length} Tier 1 jobs from PostgreSQL`);

    return result.rows.map(row => ({
      id: row.id,
      queue: row.queue_name,
      name: row.job_type,
      data: row.data,
      opts: {
        priority: row.priority,
        jobId: row.idempotency_key
      }
    }));
  }
}
```

### FILE: src/services/rate-limiter.service.ts
```typescript
import { logger } from '../utils/logger';
import { TokenBucket } from '../utils/token-bucket';
import { RATE_LIMITS, RATE_LIMIT_GROUPS, RateLimitConfig } from '../config/rate-limits.config';
import { getPool } from '../config/database.config';
import Redis from 'ioredis';

interface RateLimiter {
  bucket: TokenBucket;
  concurrent: number;
  maxConcurrent: number;
  lastActivity: number;
  config: RateLimitConfig;
}

export class RateLimiterService {
  private static instance: RateLimiterService;
  private limiters: Map<string, RateLimiter> = new Map();
  private redis: Redis;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 5 // Separate DB for rate limiting
    });
    
    this.initializeLimiters();
    this.startMetricsCollection();
  }
  
  static getInstance(): RateLimiterService {
    if (!this.instance) {
      this.instance = new RateLimiterService();
    }
    return this.instance;
  }
  
  private initializeLimiters(): void {
    for (const [service, config] of Object.entries(RATE_LIMITS)) {
      const bucket = new TokenBucket(
        config.burstSize || config.maxPerSecond * 10,
        config.maxPerSecond
      );
      
      this.limiters.set(service, {
        bucket,
        concurrent: 0,
        maxConcurrent: config.maxConcurrent,
        lastActivity: Date.now(),
        config
      });
      
      logger.info(`Rate limiter initialized for ${service}:`, {
        maxPerSecond: config.maxPerSecond,
        maxConcurrent: config.maxConcurrent
      });
    }
  }
  
  /**
   * Acquire permission to make an API call
   */
  async acquire(service: string, priority: number = 5): Promise<void> {
    // Check if service is part of a group
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) {
      logger.warn(`No rate limiter configured for service: ${service}`);
      return; // Allow if no limiter configured
    }
    
    // Wait for concurrent slot
    while (limiter.concurrent >= limiter.maxConcurrent) {
      await this.sleep(50);
    }
    
    // Wait for rate limit token
    const acquired = await limiter.bucket.waitForTokens(1, 30000);
    if (!acquired) {
      throw new Error(`Rate limit timeout for ${service}`);
    }
    
    // Increment concurrent count
    limiter.concurrent++;
    limiter.lastActivity = Date.now();
    
    // Store metrics in Redis
    await this.recordMetric(service, 'acquire');
    
    logger.debug(`Rate limit acquired for ${service}: ${limiter.concurrent}/${limiter.maxConcurrent} concurrent`);
  }
  
  /**
   * Release a rate limit slot
   */
  release(service: string): void {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return;
    
    if (limiter.concurrent > 0) {
      limiter.concurrent--;
      limiter.lastActivity = Date.now();
      
      logger.debug(`Rate limit released for ${service}: ${limiter.concurrent}/${limiter.maxConcurrent} concurrent`);
    }
  }
  
  /**
   * Get current status of rate limiters
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [service, limiter] of this.limiters) {
      status[service] = {
        tokensAvailable: limiter.bucket.getTokenCount(),
        concurrent: limiter.concurrent,
        maxConcurrent: limiter.maxConcurrent,
        lastActivity: new Date(limiter.lastActivity).toISOString(),
        config: limiter.config
      };
    }
    
    return status;
  }
  
  /**
   * Check if a service is rate limited
   */
  async isRateLimited(service: string): Promise<boolean> {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return false;
    
    return limiter.concurrent >= limiter.maxConcurrent || 
           limiter.bucket.getTokenCount() < 1;
  }
  
  /**
   * Get wait time until next available slot (ms)
   */
  getWaitTime(service: string): number {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return 0;
    
    if (limiter.concurrent >= limiter.maxConcurrent) {
      // Estimate based on average processing time
      return limiter.config.cooldownMs || 1000;
    }
    
    return limiter.bucket.getTimeUntilNextToken();
  }
  
  /**
   * Reset rate limiter for a service
   */
  reset(service: string): void {
    const limiter = this.limiters.get(service);
    if (!limiter) return;
    
    limiter.bucket = new TokenBucket(
      limiter.config.burstSize || limiter.config.maxPerSecond * 10,
      limiter.config.maxPerSecond
    );
    limiter.concurrent = 0;
    
    logger.info(`Rate limiter reset for ${service}`);
  }
  
  /**
   * Emergency stop - pause all rate limiters
   */
  emergencyStop(): void {
    for (const [service, limiter] of this.limiters) {
      limiter.maxConcurrent = 0;
      logger.warn(`Emergency stop: Rate limiter paused for ${service}`);
    }
  }
  
  /**
   * Resume after emergency stop
   */
  resume(): void {
    for (const [service, limiter] of this.limiters) {
      limiter.maxConcurrent = limiter.config.maxConcurrent;
      logger.info(`Rate limiter resumed for ${service}`);
    }
  }
  
  private getServiceGroup(service: string): string | null {
    for (const [group, services] of Object.entries(RATE_LIMIT_GROUPS)) {
      if (services.includes(service)) {
        return group;
      }
    }
    return null;
  }
  
  private async recordMetric(service: string, action: string): Promise<void> {
    const key = `rate_limit:${service}:${action}`;
    const timestamp = Date.now();
    
    try {
      await this.redis.zadd(key, timestamp, timestamp);
      // Keep only last hour of data
      await this.redis.zremrangebyscore(key, 0, timestamp - 3600000);
    } catch (error) {
      logger.error('Failed to record rate limit metric:', error);
    }
  }
  
  private startMetricsCollection(): void {
    // Collect metrics every minute
    this.metricsInterval = setInterval(async () => {
      try {
        await this.storeMetrics();
      } catch (error) {
        logger.error('Failed to store rate limit metrics:', error);
      }
    }, 60000);
  }
  
  private async storeMetrics(): Promise<void> {
    const pool = getPool();
    const metrics = this.getStatus();
    
    for (const [service, status] of Object.entries(metrics)) {
      await pool.query(
        `INSERT INTO rate_limit_metrics 
         (service_name, tokens_available, concurrent_requests, max_concurrent, captured_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [service, status.tokensAvailable, status.concurrent, status.maxConcurrent]
      ).catch(() => {}); // Ignore if table doesn't exist
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}
```

### FILE: src/workers/background/analytics.processor.ts
```typescript
import { Job } from 'bull';
import { BaseWorker } from '../base.worker';
import { JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { logger } from '../../utils/logger';

interface AnalyticsJobData {
  eventType: string;
  venueId?: string;
  userId?: string;
  eventId?: string;
  data: Record<string, any>;
  timestamp: string;
}

export class AnalyticsProcessor extends BaseWorker<AnalyticsJobData, JobResult> {
  protected name = 'analytics-processor';
  private idempotencyService: IdempotencyService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
  }

  protected async execute(job: Job<AnalyticsJobData>): Promise<JobResult> {
    const { eventType, venueId, userId, eventId, data, timestamp } = job.data;

    // ISSUE #30 FIX: Generate idempotency key for analytics events
    const idempotencyKey = this.idempotencyService.generateKey(
      'analytics-event',
      {
        eventType,
        venueId,
        userId,
        eventId,
        timestamp: timestamp || new Date().toISOString()
      }
    );

    // Check if already processed
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`Analytics event already processed (idempotent): ${idempotencyKey}`);
      return existing;
    }

    logger.info('Processing analytics event:', {
      eventType,
      venueId,
      userId,
      eventId
    });

    try {
      // TODO: Send to actual analytics service (Mixpanel, Segment, etc)
      await this.simulateAnalyticsProcessing();

      const result: JobResult = {
        success: true,
        data: {
          eventType,
          processedAt: new Date().toISOString()
        }
      };

      // Store result for idempotency (7 days for analytics)
      await this.idempotencyService.store(
        idempotencyKey,
        job.queue.name,
        job.name,
        result,
        7 * 24 * 60 * 60
      );

      return result;
    } catch (error) {
      logger.error('Analytics processing failed:', error);
      throw error;
    }
  }

  private async simulateAnalyticsProcessing(): Promise<void> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

### FILE: src/workers/money/nft-mint.processor.ts
```typescript
import { Job } from 'bull';
import { BaseWorker } from '../base.worker';
import { JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { logger } from '../../utils/logger';

interface NFTMintJobData {
  eventId: string;
  ticketId: string;
  seatId?: string;
  userId: string;
  venueId: string;
  metadata: any;
}

export class NFTMintProcessor extends BaseWorker<NFTMintJobData, JobResult> {
  protected name = 'nft-mint-processor';
  private idempotencyService: IdempotencyService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
  }

  protected async execute(job: Job<NFTMintJobData>): Promise<JobResult> {
    const { eventId, ticketId, userId, metadata } = job.data;

    // Generate idempotency key
    const idempotencyKey = this.idempotencyService.generateKey(
      'nft-mint',
      job.data
    );

    // Check if already minted
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`NFT already minted (idempotent): ${idempotencyKey}`);
      return existing;
    }

    logger.info('Minting NFT ticket:', {
      eventId,
      ticketId,
      userId
    });

    try {
      // TODO: Implement actual Solana NFT minting
      await this.simulateNFTMinting();

      const result: JobResult = {
        success: true,
        data: {
          mintAddress: `mint_${Date.now()}`,
          transactionSignature: `sig_${Date.now()}`,
          ticketId,
          metadata,
          mintedAt: new Date().toISOString()
        }
      };

      // Store result permanently for NFTs
      await this.idempotencyService.store(
        idempotencyKey,
        job.queue.name,
        job.name,
        result,
        365 * 24 * 60 * 60 // 1 year for NFTs
      );

      return result;
    } catch (error) {
      logger.error('NFT minting failed:', error);
      throw error;
    }
  }

  private async simulateNFTMinting(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 2000)); // NFT minting takes longer
  }
}
```

### FILE: src/workers/money/refund.processor.ts
```typescript
import { Job } from 'bull';
import { BaseWorker } from '../base.worker';
import { JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { logger } from '../../utils/logger';

interface RefundJobData {
  transactionId: string;
  amount: number;
  reason: string;
  userId: string;
  venueId: string;
}

export class RefundProcessor extends BaseWorker<RefundJobData, JobResult> {
  protected name = 'refund-processor';
  private idempotencyService: IdempotencyService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
  }

  protected async execute(job: Job<RefundJobData>): Promise<JobResult> {
    const { transactionId, amount, reason } = job.data;

    // Generate idempotency key
    const idempotencyKey = this.idempotencyService.generateKey(
      'refund-process',
      job.data
    );

    // Check if already processed
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`Refund already processed (idempotent): ${idempotencyKey}`);
      return existing;
    }

    logger.info('Processing refund:', {
      transactionId,
      amount,
      reason
    });

    try {
      // TODO: Implement actual Stripe refund
      await this.simulateRefundProcessing();

      const result: JobResult = {
        success: true,
        data: {
          refundId: `re_${Date.now()}`,
          transactionId,
          amount,
          status: 'completed',
          processedAt: new Date().toISOString()
        }
      };

      // Store result for idempotency (90 days for refunds)
      await this.idempotencyService.store(
        idempotencyKey,
        job.queue.name,
        job.name,
        result,
        90 * 24 * 60 * 60
      );

      return result;
    } catch (error) {
      logger.error('Refund processing failed:', error);
      throw error;
    }
  }

  private async simulateRefundProcessing(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}
```

### FILE: src/types/queue.types.ts
```typescript
import { Queue } from 'bull';
import { PERSISTENCE_TIERS } from '../config/constants';

export interface QueueConfig {
  name: string;
  persistenceTier: keyof typeof PERSISTENCE_TIERS;
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  defaultJobOptions: {
    attempts: number;
    backoff: {
      type: 'fixed' | 'exponential';
      delay: number;
    };
    removeOnComplete: boolean | number;
    removeOnFail: boolean;
  };
}

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export type QueueType = 'money' | 'communication' | 'background';
```

### FILE: src/types/job.types.ts
```typescript
export interface JobData {
  [key: string]: any;
}

export interface PaymentJobData {
  userId: string;
  venueId: string;
  eventId: string;
  amount: number;
  paymentMethod: string;
  idempotencyKey?: string;
}

export interface EmailJobData {
  to: string;
  template: string;
  data: Record<string, any>;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/config/workers.config.ts
```typescript
export interface WorkerConfig {
  name: string;
  concurrency: number;
  maxStalledCount: number;
  stalledInterval: number;
}

export const WORKER_CONFIGS: Record<string, WorkerConfig> = {
  'payment.process': {
    name: 'payment-processor',
    concurrency: 5,
    maxStalledCount: 3,
    stalledInterval: 30000
  },
  'payment.retry': {
    name: 'payment-retry',
    concurrency: 3,
    maxStalledCount: 2,
    stalledInterval: 60000
  },
  'order.fulfill': {
    name: 'order-fulfillment',
    concurrency: 10,
    maxStalledCount: 3,
    stalledInterval: 30000
  },
  'ticket.mint': {
    name: 'ticket-minting',
    concurrency: 3,
    maxStalledCount: 1,
    stalledInterval: 120000
  },
  'email.send': {
    name: 'email-sender',
    concurrency: 20,
    maxStalledCount: 5,
    stalledInterval: 15000
  },
  'webhook.process': {
    name: 'webhook-processor',
    concurrency: 10,
    maxStalledCount: 3,
    stalledInterval: 30000
  }
};

export function getWorkerConfig(queueName: string): WorkerConfig {
  return WORKER_CONFIGS[queueName] || {
    name: 'default-worker',
    concurrency: 5,
    maxStalledCount: 3,
    stalledInterval: 30000
  };
}
```

### FILE: src/config/rate-limits.config.ts
```typescript
export interface RateLimitConfig {
  maxPerSecond: number;
  maxConcurrent: number;
  burstSize?: number;
  cooldownMs?: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Payment providers
  stripe: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_STRIPE || '25'),
    maxConcurrent: 10,
    burstSize: 50,
    cooldownMs: 1000
  },
  square: {
    maxPerSecond: 8,
    maxConcurrent: 5,
    burstSize: 20,
    cooldownMs: 2000
  },
  
  // Communication providers
  sendgrid: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_SENDGRID || '5'),
    maxConcurrent: 20,
    burstSize: 100,
    cooldownMs: 1000
  },
  twilio: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_TWILIO || '1'),
    maxConcurrent: 5,
    burstSize: 10,
    cooldownMs: 5000
  },
  
  // Blockchain
  solana: {
    maxPerSecond: parseInt(process.env.RATE_LIMIT_SOLANA || '10'),
    maxConcurrent: 5,
    burstSize: 30,
    cooldownMs: 1000
  },
  
  // Accounting
  quickbooks: {
    maxPerSecond: 2,
    maxConcurrent: 3,
    burstSize: 10,
    cooldownMs: 3000
  },
  
  // Internal APIs (higher limits)
  internal: {
    maxPerSecond: 100,
    maxConcurrent: 50,
    burstSize: 200,
    cooldownMs: 100
  }
};

// Rate limit groups (providers that share limits)
export const RATE_LIMIT_GROUPS: Record<string, string[]> = {
  twilio: ['twilio-sms', 'twilio-voice', 'twilio-verify'],
  stripe: ['stripe-charges', 'stripe-refunds', 'stripe-payouts'],
  sendgrid: ['sendgrid-transactional', 'sendgrid-marketing']
};
```

### FILE: src/config/retry-strategies.config.ts
```typescript
export interface RetryStrategy {
  type: 'fixed' | 'exponential' | 'linear';
  attempts: number;
  delay: number;
  maxDelay?: number;
  factor?: number;
}

export const RETRY_STRATEGIES: Record<string, RetryStrategy> = {
  'payment': {
    type: 'exponential',
    attempts: 5,
    delay: 1000,
    maxDelay: 60000,
    factor: 2
  },
  'email': {
    type: 'exponential',
    attempts: 3,
    delay: 5000,
    maxDelay: 30000,
    factor: 2
  },
  'webhook': {
    type: 'exponential',
    attempts: 5,
    delay: 2000,
    maxDelay: 120000,
    factor: 3
  },
  'minting': {
    type: 'linear',
    attempts: 10,
    delay: 30000
  },
  'default': {
    type: 'exponential',
    attempts: 3,
    delay: 1000,
    maxDelay: 10000,
    factor: 2
  }
};

export function getRetryStrategy(jobType: string): RetryStrategy {
  const strategy = jobType.split('.')[0];
  return RETRY_STRATEGIES[strategy] || RETRY_STRATEGIES.default;
}

export function calculateBackoff(attempt: number, strategy: RetryStrategy): number {
  switch (strategy.type) {
    case 'fixed':
      return strategy.delay;
    case 'linear':
      return strategy.delay * attempt;
    case 'exponential':
      const delay = strategy.delay * Math.pow(strategy.factor || 2, attempt - 1);
      return Math.min(delay, strategy.maxDelay || delay);
  }
}
```

### FILE: src/config/persistence.config.ts
```typescript
export interface PersistenceConfig {
  provider: 'redis' | 'postgresql';
  retentionDays: number;
  archiveCompleted: boolean;
  archiveLocation?: string;
}

export const PERSISTENCE_CONFIGS: Record<string, PersistenceConfig> = {
  'payment': {
    provider: 'postgresql',
    retentionDays: 90,
    archiveCompleted: true,
    archiveLocation: 'payment_archive'
  },
  'webhook': {
    provider: 'postgresql',
    retentionDays: 30,
    archiveCompleted: true,
    archiveLocation: 'webhook_archive'
  },
  'email': {
    provider: 'redis',
    retentionDays: 7,
    archiveCompleted: false
  },
  'notification': {
    provider: 'redis',
    retentionDays: 7,
    archiveCompleted: false
  },
  'minting': {
    provider: 'postgresql',
    retentionDays: 365,
    archiveCompleted: true,
    archiveLocation: 'blockchain_archive'
  },
  'default': {
    provider: 'redis',
    retentionDays: 14,
    archiveCompleted: false
  }
};

export function getPersistenceConfig(queueName: string): PersistenceConfig {
  const category = queueName.split('.')[0];
  return PERSISTENCE_CONFIGS[category] || PERSISTENCE_CONFIGS.default;
}

export const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '0'),
  keyPrefix: 'queue:'
};

export const POSTGRES_CONFIG = {
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
};
```

### FILE: src/models/RateLimit.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IRateLimit {
  id?: string;
  key: string;
  limit: number;
  window_seconds: number;
  current_count: number;
  reset_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class RateLimitModel {
  private db: Knex;
  private tableName = 'rate_limits';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IRateLimit): Promise<IRateLimit> {
    const [rateLimit] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return rateLimit;
  }

  async findByKey(key: string): Promise<IRateLimit | null> {
    const rateLimit = await this.db(this.tableName)
      .where({ key })
      .first();
    return rateLimit || null;
  }

  async increment(key: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ key })
      .where('reset_at', '>', new Date())
      .increment('current_count', 1);
    return result > 0;
  }

  async reset(key: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ key })
      .update({ 
        current_count: 0, 
        reset_at: new Date(Date.now() + 1000 * 60 * 60) 
      });
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default RateLimitModel;
```

### FILE: src/models/Schedule.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface ISchedule {
  id?: string;
  name: string;
  cron_expression: string;
  job_type: string;
  job_data?: any;
  active: boolean;
  last_run?: Date;
  next_run?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class ScheduleModel {
  private db: Knex;
  private tableName = 'schedules';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ISchedule): Promise<ISchedule> {
    const [schedule] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return schedule;
  }

  async findById(id: string): Promise<ISchedule | null> {
    const schedule = await this.db(this.tableName)
      .where({ id })
      .first();
    return schedule || null;
  }

  async findActive(): Promise<ISchedule[]> {
    return this.db(this.tableName)
      .where({ active: true })
      .orderBy('next_run', 'asc');
  }

  async update(id: string, data: Partial<ISchedule>): Promise<ISchedule | null> {
    const [schedule] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return schedule || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default ScheduleModel;
```

### FILE: src/models/Queue.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IQueue {
  id?: string;
  name: string;
  type: string;
  config?: any;
  active: boolean;
  pending_count?: number;
  processing_count?: number;
  completed_count?: number;
  failed_count?: number;
  created_at?: Date;
  updated_at?: Date;
}

export class QueueModel {
  private db: Knex;
  private tableName = 'queues';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IQueue): Promise<IQueue> {
    const [queue] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return queue;
  }

  async findById(id: string): Promise<IQueue | null> {
    const queue = await this.db(this.tableName)
      .where({ id })
      .first();
    return queue || null;
  }

  async findByName(name: string): Promise<IQueue | null> {
    return this.db(this.tableName)
      .where({ name })
      .first();
  }

  async findAll(filters: Partial<IQueue> = {}): Promise<IQueue[]> {
    return this.db(this.tableName)
      .where(filters)
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IQueue>): Promise<IQueue | null> {
    const [queue] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return queue || null;
  }

  async incrementCounter(id: string, counter: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .increment(`${counter}_count`, 1);
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default QueueModel;
```

### FILE: src/models/Job.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IJob {
  id?: string;
  queue: string;
  type: string;
  data?: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts?: number;
  max_attempts?: number;
  error?: string;
  scheduled_for?: Date;
  started_at?: Date;
  completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class JobModel {
  private db: Knex;
  private tableName = 'jobs';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IJob): Promise<IJob> {
    const [job] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return job;
  }

  async findById(id: string): Promise<IJob | null> {
    const job = await this.db(this.tableName)
      .where({ id })
      .first();
    return job || null;
  }

  async findPending(queue: string, limit = 10): Promise<IJob[]> {
    return this.db(this.tableName)
      .where({ queue, status: 'pending' })
      .where('scheduled_for', '<=', new Date())
      .orderBy('created_at', 'asc')
      .limit(limit);
  }

  async update(id: string, data: Partial<IJob>): Promise<IJob | null> {
    const [job] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return job || null;
  }

  async markAsProcessing(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id, status: 'pending' })
      .update({ status: 'processing', started_at: new Date() });
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default JobModel;
```

### FILE: src/middleware/metrics.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';

interface RequestMetrics {
  totalRequests: number;
  requestsByEndpoint: Map<string, number>;
  requestsByStatus: Map<number, number>;
  averageResponseTime: number;
}

const metrics: RequestMetrics = {
  totalRequests: 0,
  requestsByEndpoint: new Map(),
  requestsByStatus: new Map(),
  averageResponseTime: 0
};

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Update metrics
    metrics.totalRequests++;
    
    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    metrics.requestsByEndpoint.set(
      endpoint,
      (metrics.requestsByEndpoint.get(endpoint) || 0) + 1
    );
    
    metrics.requestsByStatus.set(
      res.statusCode,
      (metrics.requestsByStatus.get(res.statusCode) || 0) + 1
    );
    
    // Update average response time
    metrics.averageResponseTime = 
      (metrics.averageResponseTime * (metrics.totalRequests - 1) + duration) / 
      metrics.totalRequests;
  });
  
  next();
}

export function getMetrics(): RequestMetrics {
  return metrics;
}
```

### FILE: src/middleware/rate-limit.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { RateLimiterService } from '../services/rate-limiter.service';
import { logger } from '../utils/logger';

const rateLimiter = RateLimiterService.getInstance();

export interface RateLimitOptions {
  service?: string;
  maxRequests?: number;
  windowMs?: number;
  message?: string;
}

/**
 * Rate limit middleware for API endpoints
 */
export function rateLimitMiddleware(options: RateLimitOptions = {}) {
  const {
    service = 'internal',
    message = 'Too many requests, please try again later.'
  } = options;
  
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if rate limited
      const isLimited = await rateLimiter.isRateLimited(service);
      
      if (isLimited) {
        const waitTime = rateLimiter.getWaitTime(service);
        res.setHeader('X-RateLimit-Limit', '1');
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + waitTime).toISOString());
        res.setHeader('Retry-After', Math.ceil(waitTime / 1000).toString());
        
        logger.warn(`Rate limit exceeded for ${service}`, {
          ip: req.ip,
          path: req.path
        });
        
        res.status(429).json({
          error: 'Rate limit exceeded',
          message,
          retryAfter: Math.ceil(waitTime / 1000)
        });
        return;
      }
      
      // Try to acquire rate limit
      await rateLimiter.acquire(service);
      
      // Release on response finish
      res.on('finish', () => {
        rateLimiter.release(service);
      });
      
      next();
    } catch (error) {
      logger.error('Rate limit middleware error:', error);
      // Allow request on error
      next();
    }
  };
}

/**
 * Global rate limiter for all API endpoints
 */
export const globalRateLimit = rateLimitMiddleware({
  service: 'internal',
  message: 'API rate limit exceeded. Please slow down your requests.'
});
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: any;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Authentication failed:', error);
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    if (!roles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt by user ${req.user.id} with role ${req.user.role}`);
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    
    next();
  };
}
```

### FILE: src/services/monitoring.service.ts
```typescript
import * as promClient from 'prom-client';
import twilio from 'twilio';
import { Queue } from 'bull';
import { logger } from '../utils/logger';
import { QueueFactory } from '../queues/factories/queue.factory';
import { getPool } from '../config/database.config';

interface AlertThresholds {
  moneyQueueDepth: number;
  moneyQueueAge: number; // minutes
  commQueueDepth: number;
  backgroundQueueDepth: number;
  failureRate: number; // percentage
}

interface Alert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  context: any;
  timestamp: Date;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private twilioClient: any;
  private metrics: any = {};
  private alertCooldowns: Map<string, number> = new Map();
  private thresholds: AlertThresholds;
  private checkInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    // Initialize thresholds first
    this.thresholds = {
      moneyQueueDepth: 50,
      moneyQueueAge: 10,
      commQueueDepth: 5000,
      backgroundQueueDepth: 50000,
      failureRate: 10
    };
    
    this.setupMetrics();
    this.setupTwilio();
    this.loadThresholds();
  }
  
  static getInstance(): MonitoringService {
    if (!this.instance) {
      this.instance = new MonitoringService();
    }
    return this.instance;
  }
  
  private setupMetrics() {
    // Create a Registry
    const register = new promClient.Registry();
    
    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({ register });
    
    // Queue depth gauge
    this.metrics.queueDepth = new promClient.Gauge({
      name: 'queue_depth',
      help: 'Number of jobs in queue',
      labelNames: ['queue_name', 'status'],
      registers: [register]
    });
    
    // Job processing duration histogram
    this.metrics.jobDuration = new promClient.Histogram({
      name: 'job_processing_duration_seconds',
      help: 'Time taken to process jobs',
      labelNames: ['queue_name', 'job_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [register]
    });
    
    // Job completion counter
    this.metrics.jobResults = new promClient.Counter({
      name: 'job_results_total',
      help: 'Job completion results',
      labelNames: ['queue_name', 'job_type', 'result'],
      registers: [register]
    });
    
    // Alert counter
    this.metrics.alertsSent = new promClient.Counter({
      name: 'alerts_sent_total',
      help: 'Number of alerts sent',
      labelNames: ['severity', 'type', 'channel'],
      registers: [register]
    });
    
    // Queue age gauge (oldest job age)
    this.metrics.oldestJobAge = new promClient.Gauge({
      name: 'oldest_job_age_seconds',
      help: 'Age of oldest waiting job',
      labelNames: ['queue_name'],
      registers: [register]
    });
    
    // Failed job gauge
    this.metrics.failedJobs = new promClient.Gauge({
      name: 'failed_jobs_total',
      help: 'Number of failed jobs',
      labelNames: ['queue_name'],
      registers: [register]
    });
    
    this.metrics.register = register;
    
    logger.info('Prometheus metrics initialized');
  }
  
  private setupTwilio() {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      logger.info('Twilio client initialized');
    } else {
      logger.warn('Twilio credentials not configured - alerts will be logged only');
    }
  }
  
  private loadThresholds() {
    this.thresholds = {
      moneyQueueDepth: parseInt(process.env.ALERT_THRESHOLD_MONEY_QUEUE || '50'),
      moneyQueueAge: parseInt(process.env.ALERT_THRESHOLD_MONEY_AGE_MINUTES || '10'),
      commQueueDepth: parseInt(process.env.ALERT_THRESHOLD_COMM_QUEUE || '5000'),
      backgroundQueueDepth: parseInt(process.env.ALERT_THRESHOLD_BACKGROUND_QUEUE || '50000'),
      failureRate: parseFloat(process.env.ALERT_THRESHOLD_FAILURE_RATE || '10')
    };
    
    logger.info('Alert thresholds loaded:', this.thresholds);
  }
  
  async start() {
    logger.info('Starting monitoring service...');
    
    // Check queue health every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkAllQueues().catch(error => {
        logger.error('Error checking queues:', error);
      });
    }, 30000);
    
    // Initial check
    await this.checkAllQueues();
  }
  
  async stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('Monitoring service stopped');
  }
  
  private async checkAllQueues() {
    const queues: Array<{ name: string; type: 'money' | 'communication' | 'background' }> = [
      { name: 'money-queue', type: 'money' },
      { name: 'communication-queue', type: 'communication' },
      { name: 'background-queue', type: 'background' }
    ];
    
    for (const queueInfo of queues) {
      try {
        await this.checkQueueHealth(queueInfo.type);
      } catch (error) {
        logger.error(`Error checking ${queueInfo.name}:`, error);
      }
    }
  }
  
  private async checkQueueHealth(queueType: 'money' | 'communication' | 'background') {
    const queue = QueueFactory.getQueue(queueType);
    const counts = await queue.getJobCounts();
    
    // Update Prometheus metrics
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'waiting' },
      counts.waiting
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'active' },
      counts.active
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'completed' },
      counts.completed
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'failed' },
      counts.failed
    );
    
    this.metrics.failedJobs.set(
      { queue_name: queue.name },
      counts.failed
    );
    
    // Check oldest job age
    const oldestJob = await this.getOldestWaitingJob(queue);
    if (oldestJob) {
      const ageSeconds = (Date.now() - oldestJob.timestamp) / 1000;
      this.metrics.oldestJobAge.set({ queue_name: queue.name }, ageSeconds);
      
      // Check age threshold for money queue
      if (queueType === 'money' && ageSeconds > this.thresholds.moneyQueueAge * 60) {
        await this.sendAlert({
          type: 'job_age',
          severity: 'critical',
          message: `Money queue job waiting over ${this.thresholds.moneyQueueAge} minutes!`,
          context: {
            queue: queue.name,
            jobId: oldestJob.id,
            ageMinutes: Math.floor(ageSeconds / 60)
          },
          timestamp: new Date()
        });
      }
    }
    
    // Check queue-specific thresholds
    if (queueType === 'money') {
      // CRITICAL: Money queue depth
      if (counts.waiting > this.thresholds.moneyQueueDepth) {
        await this.sendAlert({
          type: 'queue_depth',
          severity: 'critical',
          message: `CRITICAL: Money queue has ${counts.waiting} jobs waiting!`,
          context: {
            queue: queue.name,
            depth: counts.waiting,
            threshold: this.thresholds.moneyQueueDepth
          },
          timestamp: new Date()
        });
      }
      
      // CRITICAL: Money queue failures
      if (counts.failed > 10) {
        await this.sendAlert({
          type: 'high_failures',
          severity: 'critical',
          message: `CRITICAL: ${counts.failed} payment jobs failed!`,
          context: {
            queue: queue.name,
            failed: counts.failed
          },
          timestamp: new Date()
        });
      }
    } else if (queueType === 'communication') {
      // WARNING: Communication queue depth
      if (counts.waiting > this.thresholds.commQueueDepth) {
        await this.sendAlert({
          type: 'queue_depth',
          severity: 'warning',
          message: `Warning: ${counts.waiting} emails/SMS queued`,
          context: {
            queue: queue.name,
            depth: counts.waiting,
            threshold: this.thresholds.commQueueDepth
          },
          timestamp: new Date()
        });
      }
    }
    
    // Store metrics in database
    await this.storeMetrics(queue.name, counts);
  }
  
  private async getOldestWaitingJob(queue: Queue): Promise<any> {
    const jobs = await queue.getWaiting(0, 1);
    return jobs[0];
  }
  
  private async sendAlert(alert: Alert) {
    // Check cooldown to prevent spam
    const cooldownKey = `${alert.type}:${alert.severity}:${alert.context.queue}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey) || 0;
    const cooldownMs = alert.severity === 'critical' ? 300000 : 3600000; // 5 min for critical, 1 hour for others
    
    if (Date.now() - lastAlert < cooldownMs) {
      return; // Skip due to cooldown
    }
    
    logger.error(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`, alert.context);
    
    // Store alert in database
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO alert_history (severity, alert_type, message, queue_name, metric_value, threshold_value, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          alert.severity,
          alert.type,
          alert.message,
          alert.context.queue,
          alert.context.depth || alert.context.ageMinutes,
          alert.context.threshold
        ]
      );
    } catch (error) {
      logger.error('Failed to store alert in database:', error);
    }
    
    // Update metrics
    this.metrics.alertsSent.inc({
      severity: alert.severity,
      type: alert.type,
      channel: 'log'
    });
    
    // Send actual alert based on severity
    if (alert.severity === 'critical') {
      await this.sendCriticalAlert(alert);
    } else if (alert.severity === 'warning') {
      await this.sendWarningAlert(alert);
    }
    
    // Update cooldown
    this.alertCooldowns.set(cooldownKey, Date.now());
  }
  
  private async sendCriticalAlert(alert: Alert) {
    // Try to call on-call engineer
    if (this.twilioClient && process.env.ONCALL_PHONE) {
      try {
        // Send SMS first (more reliable)
        await this.twilioClient.messages.create({
          to: process.env.ONCALL_PHONE,
          from: process.env.TWILIO_PHONE,
          body: `🚨 CRITICAL Queue Alert:\n${alert.message}\n\nCheck immediately!`
        });
        
        this.metrics.alertsSent.inc({
          severity: 'critical',
          type: alert.type,
          channel: 'sms'
        });
        
        logger.info('Critical alert SMS sent');
        
        // Also try to call for money queue issues
        if (alert.context.queue === 'money-queue') {
          await this.twilioClient.calls.create({
            to: process.env.ONCALL_PHONE,
            from: process.env.TWILIO_PHONE,
            url: 'http://demo.twilio.com/docs/voice.xml' // You can customize this
          });
          
          this.metrics.alertsSent.inc({
            severity: 'critical',
            type: alert.type,
            channel: 'phone'
          });
          
          logger.info('Critical alert phone call initiated');
        }
      } catch (error) {
        logger.error('Failed to send Twilio alert:', error);
      }
    }
  }
  
  private async sendWarningAlert(alert: Alert) {
    // Send SMS for warnings
    if (this.twilioClient && process.env.ONCALL_PHONE) {
      try {
        await this.twilioClient.messages.create({
          to: process.env.ONCALL_PHONE,
          from: process.env.TWILIO_PHONE,
          body: `⚠️ Queue Warning:\n${alert.message}`
        });
        
        this.metrics.alertsSent.inc({
          severity: 'warning',
          type: alert.type,
          channel: 'sms'
        });
        
        logger.info('Warning alert SMS sent');
      } catch (error) {
        logger.error('Failed to send warning alert:', error);
      }
    }
  }
  
  private async storeMetrics(queueName: string, counts: any) {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO queue_metrics 
         (queue_name, waiting_count, active_count, completed_count, failed_count, captured_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [queueName, counts.waiting, counts.active, counts.completed, counts.failed]
      );
    } catch (error) {
      logger.error('Failed to store metrics:', error);
    }
  }
  
  getPrometheusMetrics(): string {
    return this.metrics.register.metrics();
  }
  
  async getMetricsSummary() {
    const pool = getPool();
    
    // Get recent metrics
    const result = await pool.query(
      `SELECT 
         queue_name,
         AVG(waiting_count) as avg_waiting,
         MAX(waiting_count) as max_waiting,
         AVG(active_count) as avg_active,
         AVG(failed_count) as avg_failed
       FROM queue_metrics
       WHERE captured_at > NOW() - INTERVAL '1 hour'
       GROUP BY queue_name`
    );
    
    // Get recent alerts
    const alerts = await pool.query(
      `SELECT severity, COUNT(*) as count
       FROM alert_history
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY severity`
    );
    
    return {
      queues: result.rows,
      alerts: alerts.rows,
      timestamp: new Date()
    };
  }
  
  // Record job completion for metrics
  recordJobSuccess(queueName: string, jobType: string, duration: number) {
    this.metrics.jobDuration.observe(
      { queue_name: queueName, job_type: jobType },
      duration
    );
    this.metrics.jobResults.inc({
      queue_name: queueName,
      job_type: jobType,
      result: 'success'
    });
  }
  
  recordJobFailure(queueName: string, jobType: string, error: any) {
    this.metrics.jobResults.inc({
      queue_name: queueName,
      job_type: jobType,
      result: 'failure'
    });
  }
}
```

### FILE: src/services/rate-limiter.service.ts
```typescript
import { logger } from '../utils/logger';
import { TokenBucket } from '../utils/token-bucket';
import { RATE_LIMITS, RATE_LIMIT_GROUPS, RateLimitConfig } from '../config/rate-limits.config';
import { getPool } from '../config/database.config';
import Redis from 'ioredis';

interface RateLimiter {
  bucket: TokenBucket;
  concurrent: number;
  maxConcurrent: number;
  lastActivity: number;
  config: RateLimitConfig;
}

export class RateLimiterService {
  private static instance: RateLimiterService;
  private limiters: Map<string, RateLimiter> = new Map();
  private redis: Redis;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 5 // Separate DB for rate limiting
    });
    
    this.initializeLimiters();
    this.startMetricsCollection();
  }
  
  static getInstance(): RateLimiterService {
    if (!this.instance) {
      this.instance = new RateLimiterService();
    }
    return this.instance;
  }
  
  private initializeLimiters(): void {
    for (const [service, config] of Object.entries(RATE_LIMITS)) {
      const bucket = new TokenBucket(
        config.burstSize || config.maxPerSecond * 10,
        config.maxPerSecond
      );
      
      this.limiters.set(service, {
        bucket,
        concurrent: 0,
        maxConcurrent: config.maxConcurrent,
        lastActivity: Date.now(),
        config
      });
      
      logger.info(`Rate limiter initialized for ${service}:`, {
        maxPerSecond: config.maxPerSecond,
        maxConcurrent: config.maxConcurrent
      });
    }
  }
  
  /**
   * Acquire permission to make an API call
   */
  async acquire(service: string, priority: number = 5): Promise<void> {
    // Check if service is part of a group
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) {
      logger.warn(`No rate limiter configured for service: ${service}`);
      return; // Allow if no limiter configured
    }
    
    // Wait for concurrent slot
    while (limiter.concurrent >= limiter.maxConcurrent) {
      await this.sleep(50);
    }
    
    // Wait for rate limit token
    const acquired = await limiter.bucket.waitForTokens(1, 30000);
    if (!acquired) {
      throw new Error(`Rate limit timeout for ${service}`);
    }
    
    // Increment concurrent count
    limiter.concurrent++;
    limiter.lastActivity = Date.now();
    
    // Store metrics in Redis
    await this.recordMetric(service, 'acquire');
    
    logger.debug(`Rate limit acquired for ${service}: ${limiter.concurrent}/${limiter.maxConcurrent} concurrent`);
  }
  
  /**
   * Release a rate limit slot
   */
  release(service: string): void {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return;
    
    if (limiter.concurrent > 0) {
      limiter.concurrent--;
      limiter.lastActivity = Date.now();
      
      logger.debug(`Rate limit released for ${service}: ${limiter.concurrent}/${limiter.maxConcurrent} concurrent`);
    }
  }
  
  /**
   * Get current status of rate limiters
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [service, limiter] of this.limiters) {
      status[service] = {
        tokensAvailable: limiter.bucket.getTokenCount(),
        concurrent: limiter.concurrent,
        maxConcurrent: limiter.maxConcurrent,
        lastActivity: new Date(limiter.lastActivity).toISOString(),
        config: limiter.config
      };
    }
    
    return status;
  }
  
  /**
   * Check if a service is rate limited
   */
  async isRateLimited(service: string): Promise<boolean> {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return false;
    
    return limiter.concurrent >= limiter.maxConcurrent || 
           limiter.bucket.getTokenCount() < 1;
  }
  
  /**
   * Get wait time until next available slot (ms)
   */
  getWaitTime(service: string): number {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return 0;
    
    if (limiter.concurrent >= limiter.maxConcurrent) {
      // Estimate based on average processing time
      return limiter.config.cooldownMs || 1000;
    }
    
    return limiter.bucket.getTimeUntilNextToken();
  }
  
  /**
   * Reset rate limiter for a service
   */
  reset(service: string): void {
    const limiter = this.limiters.get(service);
    if (!limiter) return;
    
    limiter.bucket = new TokenBucket(
      limiter.config.burstSize || limiter.config.maxPerSecond * 10,
      limiter.config.maxPerSecond
    );
    limiter.concurrent = 0;
    
    logger.info(`Rate limiter reset for ${service}`);
  }
  
  /**
   * Emergency stop - pause all rate limiters
   */
  emergencyStop(): void {
    for (const [service, limiter] of this.limiters) {
      limiter.maxConcurrent = 0;
      logger.warn(`Emergency stop: Rate limiter paused for ${service}`);
    }
  }
  
  /**
   * Resume after emergency stop
   */
  resume(): void {
    for (const [service, limiter] of this.limiters) {
      limiter.maxConcurrent = limiter.config.maxConcurrent;
      logger.info(`Rate limiter resumed for ${service}`);
    }
  }
  
  private getServiceGroup(service: string): string | null {
    for (const [group, services] of Object.entries(RATE_LIMIT_GROUPS)) {
      if (services.includes(service)) {
        return group;
      }
    }
    return null;
  }
  
  private async recordMetric(service: string, action: string): Promise<void> {
    const key = `rate_limit:${service}:${action}`;
    const timestamp = Date.now();
    
    try {
      await this.redis.zadd(key, timestamp, timestamp);
      // Keep only last hour of data
      await this.redis.zremrangebyscore(key, 0, timestamp - 3600000);
    } catch (error) {
      logger.error('Failed to record rate limit metric:', error);
    }
  }
  
  private startMetricsCollection(): void {
    // Collect metrics every minute
    this.metricsInterval = setInterval(async () => {
      try {
        await this.storeMetrics();
      } catch (error) {
        logger.error('Failed to store rate limit metrics:', error);
      }
    }, 60000);
  }
  
  private async storeMetrics(): Promise<void> {
    const pool = getPool();
    const metrics = this.getStatus();
    
    for (const [service, status] of Object.entries(metrics)) {
      await pool.query(
        `INSERT INTO rate_limit_metrics 
         (service_name, tokens_available, concurrent_requests, max_concurrent, captured_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [service, status.tokensAvailable, status.concurrent, status.maxConcurrent]
      ).catch(() => {}); // Ignore if table doesn't exist
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}
```

### FILE: src/workers/background/analytics.processor.ts
```typescript
import { Job } from 'bull';
import { BaseWorker } from '../base.worker';
import { JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { logger } from '../../utils/logger';

interface AnalyticsJobData {
  eventType: string;
  venueId?: string;
  userId?: string;
  eventId?: string;
  data: Record<string, any>;
  timestamp: string;
}

export class AnalyticsProcessor extends BaseWorker<AnalyticsJobData, JobResult> {
  protected name = 'analytics-processor';
  private idempotencyService: IdempotencyService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
  }

  protected async execute(job: Job<AnalyticsJobData>): Promise<JobResult> {
    const { eventType, venueId, userId, eventId, data, timestamp } = job.data;

    // ISSUE #30 FIX: Generate idempotency key for analytics events
    const idempotencyKey = this.idempotencyService.generateKey(
      'analytics-event',
      {
        eventType,
        venueId,
        userId,
        eventId,
        timestamp: timestamp || new Date().toISOString()
      }
    );

    // Check if already processed
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`Analytics event already processed (idempotent): ${idempotencyKey}`);
      return existing;
    }

    logger.info('Processing analytics event:', {
      eventType,
      venueId,
      userId,
      eventId
    });

    try {
      // TODO: Send to actual analytics service (Mixpanel, Segment, etc)
      await this.simulateAnalyticsProcessing();

      const result: JobResult = {
        success: true,
        data: {
          eventType,
          processedAt: new Date().toISOString()
        }
      };

      // Store result for idempotency (7 days for analytics)
      await this.idempotencyService.store(
        idempotencyKey,
        job.queue.name,
        job.name,
        result,
        7 * 24 * 60 * 60
      );

      return result;
    } catch (error) {
      logger.error('Analytics processing failed:', error);
      throw error;
    }
  }

  private async simulateAnalyticsProcessing(): Promise<void> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

### FILE: src/workers/money/nft-mint.processor.ts
```typescript
import { Job } from 'bull';
import { BaseWorker } from '../base.worker';
import { JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { logger } from '../../utils/logger';

interface NFTMintJobData {
  eventId: string;
  ticketId: string;
  seatId?: string;
  userId: string;
  venueId: string;
  metadata: any;
}

export class NFTMintProcessor extends BaseWorker<NFTMintJobData, JobResult> {
  protected name = 'nft-mint-processor';
  private idempotencyService: IdempotencyService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
  }

  protected async execute(job: Job<NFTMintJobData>): Promise<JobResult> {
    const { eventId, ticketId, userId, metadata } = job.data;

    // Generate idempotency key
    const idempotencyKey = this.idempotencyService.generateKey(
      'nft-mint',
      job.data
    );

    // Check if already minted
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`NFT already minted (idempotent): ${idempotencyKey}`);
      return existing;
    }

    logger.info('Minting NFT ticket:', {
      eventId,
      ticketId,
      userId
    });

    try {
      // TODO: Implement actual Solana NFT minting
      await this.simulateNFTMinting();

      const result: JobResult = {
        success: true,
        data: {
          mintAddress: `mint_${Date.now()}`,
          transactionSignature: `sig_${Date.now()}`,
          ticketId,
          metadata,
          mintedAt: new Date().toISOString()
        }
      };

      // Store result permanently for NFTs
      await this.idempotencyService.store(
        idempotencyKey,
        job.queue.name,
        job.name,
        result,
        365 * 24 * 60 * 60 // 1 year for NFTs
      );

      return result;
    } catch (error) {
      logger.error('NFT minting failed:', error);
      throw error;
    }
  }

  private async simulateNFTMinting(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 2000)); // NFT minting takes longer
  }
}
```

### FILE: src/workers/money/refund.processor.ts
```typescript
import { Job } from 'bull';
import { BaseWorker } from '../base.worker';
import { JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { logger } from '../../utils/logger';

interface RefundJobData {
  transactionId: string;
  amount: number;
  reason: string;
  userId: string;
  venueId: string;
}

export class RefundProcessor extends BaseWorker<RefundJobData, JobResult> {
  protected name = 'refund-processor';
  private idempotencyService: IdempotencyService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
  }

  protected async execute(job: Job<RefundJobData>): Promise<JobResult> {
    const { transactionId, amount, reason } = job.data;

    // Generate idempotency key
    const idempotencyKey = this.idempotencyService.generateKey(
      'refund-process',
      job.data
    );

    // Check if already processed
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`Refund already processed (idempotent): ${idempotencyKey}`);
      return existing;
    }

    logger.info('Processing refund:', {
      transactionId,
      amount,
      reason
    });

    try {
      // TODO: Implement actual Stripe refund
      await this.simulateRefundProcessing();

      const result: JobResult = {
        success: true,
        data: {
          refundId: `re_${Date.now()}`,
          transactionId,
          amount,
          status: 'completed',
          processedAt: new Date().toISOString()
        }
      };

      // Store result for idempotency (90 days for refunds)
      await this.idempotencyService.store(
        idempotencyKey,
        job.queue.name,
        job.name,
        result,
        90 * 24 * 60 * 60
      );

      return result;
    } catch (error) {
      logger.error('Refund processing failed:', error);
      throw error;
    }
  }

  private async simulateRefundProcessing(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}
```

### FILE: src/types/queue.types.ts
```typescript
import { Queue } from 'bull';
import { PERSISTENCE_TIERS } from '../config/constants';

export interface QueueConfig {
  name: string;
  persistenceTier: keyof typeof PERSISTENCE_TIERS;
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  defaultJobOptions: {
    attempts: number;
    backoff: {
      type: 'fixed' | 'exponential';
      delay: number;
    };
    removeOnComplete: boolean | number;
    removeOnFail: boolean;
  };
}

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export type QueueType = 'money' | 'communication' | 'background';
```

### FILE: src/types/job.types.ts
```typescript
export interface JobData {
  [key: string]: any;
}

export interface PaymentJobData {
  userId: string;
  venueId: string;
  eventId: string;
  amount: number;
  paymentMethod: string;
  idempotencyKey?: string;
}

export interface EmailJobData {
  to: string;
  template: string;
  data: Record<string, any>;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/queue-service//src/routes/rate-limit.routes.ts:21:// Update rate limit settings
backend/services/queue-service//src/routes/rate-limit.routes.ts:23:  '/update/:key',
backend/services/queue-service//src/routes/rate-limit.routes.ts:24:  rateLimitController.updateLimit.bind(rateLimitController)
backend/services/queue-service//src/controllers/job.controller.ts:415:          .replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)\b)/gi, '');
backend/services/queue-service//src/controllers/metrics.controller.ts:42:        `SELECT 
backend/services/queue-service//src/controllers/metrics.controller.ts:69:        `SELECT 
backend/services/queue-service//src/controllers/metrics.controller.ts:81:        `SELECT 
backend/services/queue-service//src/controllers/alerts.controller.ts:15:        SELECT * FROM alert_history
backend/services/queue-service//src/controllers/alerts.controller.ts:47:        `UPDATE alert_history 
backend/services/queue-service//src/controllers/health.controller.ts:21:        await pool.query('SELECT 1');
backend/services/queue-service//src/controllers/health.controller.ts:67:      await pool.query('SELECT 1');
backend/services/queue-service//src/models/RateLimit.ts:12:  updated_at?: Date;
backend/services/queue-service//src/models/RateLimit.ts:48:      .update({ 
backend/services/queue-service//src/models/Schedule.ts:14:  updated_at?: Date;
backend/services/queue-service//src/models/Schedule.ts:45:  async update(id: string, data: Partial<ISchedule>): Promise<ISchedule | null> {
backend/services/queue-service//src/models/Schedule.ts:48:      .update({ ...data, updated_at: new Date() })
backend/services/queue-service//src/models/Queue.ts:15:  updated_at?: Date;
backend/services/queue-service//src/models/Queue.ts:52:  async update(id: string, data: Partial<IQueue>): Promise<IQueue | null> {
backend/services/queue-service//src/models/Queue.ts:55:      .update({ ...data, updated_at: new Date() })
backend/services/queue-service//src/models/Job.ts:17:  updated_at?: Date;
backend/services/queue-service//src/models/Job.ts:50:  async update(id: string, data: Partial<IJob>): Promise<IJob | null> {
backend/services/queue-service//src/models/Job.ts:53:      .update({ ...data, updated_at: new Date() })
backend/services/queue-service//src/models/Job.ts:61:      .update({ status: 'processing', started_at: new Date() });
backend/services/queue-service//src/middleware/metrics.middleware.ts:27:    // Update metrics
backend/services/queue-service//src/middleware/metrics.middleware.ts:41:    // Update average response time
backend/services/queue-service//src/services/monitoring.service.ts:181:    // Update Prometheus metrics
backend/services/queue-service//src/services/monitoring.service.ts:298:        `INSERT INTO alert_history (severity, alert_type, message, queue_name, metric_value, threshold_value, created_at)
backend/services/queue-service//src/services/monitoring.service.ts:313:    // Update metrics
backend/services/queue-service//src/services/monitoring.service.ts:327:    // Update cooldown
backend/services/queue-service//src/services/monitoring.service.ts:399:        `INSERT INTO queue_metrics 
backend/services/queue-service//src/services/monitoring.service.ts:418:      `SELECT 
backend/services/queue-service//src/services/monitoring.service.ts:431:      `SELECT severity, COUNT(*) as count
backend/services/queue-service//src/services/idempotency.service.ts:68:        hash.update(jobType);
backend/services/queue-service//src/services/idempotency.service.ts:69:        hash.update(JSON.stringify(data));
backend/services/queue-service//src/services/idempotency.service.ts:87:      'SELECT result FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
backend/services/queue-service//src/services/idempotency.service.ts:121:      `INSERT INTO idempotency_keys 
backend/services/queue-service//src/services/idempotency.service.ts:124:       ON CONFLICT (key) DO UPDATE 
backend/services/queue-service//src/services/idempotency.service.ts:144:      'DELETE FROM idempotency_keys WHERE expires_at < NOW()'
backend/services/queue-service//src/services/recovery.service.ts:15:        `SELECT * FROM critical_jobs 
backend/services/queue-service//src/services/persistence.service.ts:46:          `INSERT INTO critical_jobs 
backend/services/queue-service//src/services/persistence.service.ts:49:           ON CONFLICT (id) DO UPDATE 
backend/services/queue-service//src/services/persistence.service.ts:50:           SET updated_at = CURRENT_TIMESTAMP, status = 'pending'`,
backend/services/queue-service//src/services/persistence.service.ts:103:        `UPDATE critical_jobs 
backend/services/queue-service//src/services/persistence.service.ts:105:             updated_at = CURRENT_TIMESTAMP 
backend/services/queue-service//src/services/persistence.service.ts:127:        `UPDATE critical_jobs 
backend/services/queue-service//src/services/persistence.service.ts:129:             updated_at = CURRENT_TIMESTAMP 
backend/services/queue-service//src/services/persistence.service.ts:150:      `SELECT * FROM critical_jobs 
backend/services/queue-service//src/services/rate-limiter.service.ts:240:        `INSERT INTO rate_limit_metrics 

### All JOIN operations:
backend/services/queue-service//src/middleware/validation.middleware.ts:17:          field: detail.path.join('.'),

### All WHERE clauses:
backend/services/queue-service//src/controllers/metrics.controller.ts:47:         WHERE captured_at > NOW() - INTERVAL '1 hour'
backend/services/queue-service//src/controllers/metrics.controller.ts:74:         WHERE captured_at > NOW() - INTERVAL '24 hours'
backend/services/queue-service//src/controllers/metrics.controller.ts:87:         WHERE created_at > NOW() - INTERVAL '24 hours'
backend/services/queue-service//src/controllers/alerts.controller.ts:16:        WHERE created_at > NOW() - INTERVAL '24 hours'
backend/services/queue-service//src/controllers/alerts.controller.ts:51:         WHERE id = $2`,
backend/services/queue-service//src/services/monitoring.service.ts:425:       WHERE captured_at > NOW() - INTERVAL '1 hour'
backend/services/queue-service//src/services/monitoring.service.ts:433:       WHERE created_at > NOW() - INTERVAL '24 hours'
backend/services/queue-service//src/services/idempotency.service.ts:87:      'SELECT result FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
backend/services/queue-service//src/services/idempotency.service.ts:144:      'DELETE FROM idempotency_keys WHERE expires_at < NOW()'
backend/services/queue-service//src/services/recovery.service.ts:16:         WHERE status IN ('pending', 'processing')
backend/services/queue-service//src/services/persistence.service.ts:106:         WHERE id = $1`,
backend/services/queue-service//src/services/persistence.service.ts:130:         WHERE id = $1`,
backend/services/queue-service//src/services/persistence.service.ts:151:       WHERE status IN ('pending', 'processing')

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import knex from 'knex';

export const db = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  pool: { min: 2, max: 10 }
});

export default db;
```
### .env.example
```
# ================================================
# QUEUE-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: queue-service
# Port: 3011
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=queue-service           # Service identifier

# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/services/monitoring.service.ts
```typescript
import * as promClient from 'prom-client';
import twilio from 'twilio';
import { Queue } from 'bull';
import { logger } from '../utils/logger';
import { QueueFactory } from '../queues/factories/queue.factory';
import { getPool } from '../config/database.config';

interface AlertThresholds {
  moneyQueueDepth: number;
  moneyQueueAge: number; // minutes
  commQueueDepth: number;
  backgroundQueueDepth: number;
  failureRate: number; // percentage
}

interface Alert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  context: any;
  timestamp: Date;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private twilioClient: any;
  private metrics: any = {};
  private alertCooldowns: Map<string, number> = new Map();
  private thresholds: AlertThresholds;
  private checkInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    // Initialize thresholds first
    this.thresholds = {
      moneyQueueDepth: 50,
      moneyQueueAge: 10,
      commQueueDepth: 5000,
      backgroundQueueDepth: 50000,
      failureRate: 10
    };
    
    this.setupMetrics();
    this.setupTwilio();
    this.loadThresholds();
  }
  
  static getInstance(): MonitoringService {
    if (!this.instance) {
      this.instance = new MonitoringService();
    }
    return this.instance;
  }
  
  private setupMetrics() {
    // Create a Registry
    const register = new promClient.Registry();
    
    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({ register });
    
    // Queue depth gauge
    this.metrics.queueDepth = new promClient.Gauge({
      name: 'queue_depth',
      help: 'Number of jobs in queue',
      labelNames: ['queue_name', 'status'],
      registers: [register]
    });
    
    // Job processing duration histogram
    this.metrics.jobDuration = new promClient.Histogram({
      name: 'job_processing_duration_seconds',
      help: 'Time taken to process jobs',
      labelNames: ['queue_name', 'job_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [register]
    });
    
    // Job completion counter
    this.metrics.jobResults = new promClient.Counter({
      name: 'job_results_total',
      help: 'Job completion results',
      labelNames: ['queue_name', 'job_type', 'result'],
      registers: [register]
    });
    
    // Alert counter
    this.metrics.alertsSent = new promClient.Counter({
      name: 'alerts_sent_total',
      help: 'Number of alerts sent',
      labelNames: ['severity', 'type', 'channel'],
      registers: [register]
    });
    
    // Queue age gauge (oldest job age)
    this.metrics.oldestJobAge = new promClient.Gauge({
      name: 'oldest_job_age_seconds',
      help: 'Age of oldest waiting job',
      labelNames: ['queue_name'],
      registers: [register]
    });
    
    // Failed job gauge
    this.metrics.failedJobs = new promClient.Gauge({
      name: 'failed_jobs_total',
      help: 'Number of failed jobs',
      labelNames: ['queue_name'],
      registers: [register]
    });
    
    this.metrics.register = register;
    
    logger.info('Prometheus metrics initialized');
  }
  
  private setupTwilio() {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      logger.info('Twilio client initialized');
    } else {
      logger.warn('Twilio credentials not configured - alerts will be logged only');
    }
  }
  
  private loadThresholds() {
    this.thresholds = {
      moneyQueueDepth: parseInt(process.env.ALERT_THRESHOLD_MONEY_QUEUE || '50'),
      moneyQueueAge: parseInt(process.env.ALERT_THRESHOLD_MONEY_AGE_MINUTES || '10'),
      commQueueDepth: parseInt(process.env.ALERT_THRESHOLD_COMM_QUEUE || '5000'),
      backgroundQueueDepth: parseInt(process.env.ALERT_THRESHOLD_BACKGROUND_QUEUE || '50000'),
      failureRate: parseFloat(process.env.ALERT_THRESHOLD_FAILURE_RATE || '10')
    };
    
    logger.info('Alert thresholds loaded:', this.thresholds);
  }
  
  async start() {
    logger.info('Starting monitoring service...');
    
    // Check queue health every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkAllQueues().catch(error => {
        logger.error('Error checking queues:', error);
      });
    }, 30000);
    
    // Initial check
    await this.checkAllQueues();
  }
  
  async stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('Monitoring service stopped');
  }
  
  private async checkAllQueues() {
    const queues: Array<{ name: string; type: 'money' | 'communication' | 'background' }> = [
      { name: 'money-queue', type: 'money' },
      { name: 'communication-queue', type: 'communication' },
      { name: 'background-queue', type: 'background' }
    ];
    
    for (const queueInfo of queues) {
      try {
        await this.checkQueueHealth(queueInfo.type);
      } catch (error) {
        logger.error(`Error checking ${queueInfo.name}:`, error);
      }
    }
  }
  
  private async checkQueueHealth(queueType: 'money' | 'communication' | 'background') {
    const queue = QueueFactory.getQueue(queueType);
    const counts = await queue.getJobCounts();
    
    // Update Prometheus metrics
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'waiting' },
      counts.waiting
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'active' },
      counts.active
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'completed' },
      counts.completed
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'failed' },
      counts.failed
    );
    
    this.metrics.failedJobs.set(
      { queue_name: queue.name },
      counts.failed
    );
    
    // Check oldest job age
    const oldestJob = await this.getOldestWaitingJob(queue);
    if (oldestJob) {
      const ageSeconds = (Date.now() - oldestJob.timestamp) / 1000;
      this.metrics.oldestJobAge.set({ queue_name: queue.name }, ageSeconds);
      
      // Check age threshold for money queue
      if (queueType === 'money' && ageSeconds > this.thresholds.moneyQueueAge * 60) {
        await this.sendAlert({
          type: 'job_age',
          severity: 'critical',
          message: `Money queue job waiting over ${this.thresholds.moneyQueueAge} minutes!`,
          context: {
            queue: queue.name,
            jobId: oldestJob.id,
            ageMinutes: Math.floor(ageSeconds / 60)
          },
          timestamp: new Date()
        });
      }
    }
    
    // Check queue-specific thresholds
    if (queueType === 'money') {
      // CRITICAL: Money queue depth
      if (counts.waiting > this.thresholds.moneyQueueDepth) {
        await this.sendAlert({
          type: 'queue_depth',
          severity: 'critical',
          message: `CRITICAL: Money queue has ${counts.waiting} jobs waiting!`,
          context: {
            queue: queue.name,
            depth: counts.waiting,
            threshold: this.thresholds.moneyQueueDepth
          },
          timestamp: new Date()
        });
      }
      
      // CRITICAL: Money queue failures
      if (counts.failed > 10) {
        await this.sendAlert({
          type: 'high_failures',
          severity: 'critical',
          message: `CRITICAL: ${counts.failed} payment jobs failed!`,
          context: {
            queue: queue.name,
            failed: counts.failed
          },
          timestamp: new Date()
        });
      }
    } else if (queueType === 'communication') {
      // WARNING: Communication queue depth
      if (counts.waiting > this.thresholds.commQueueDepth) {
        await this.sendAlert({
          type: 'queue_depth',
          severity: 'warning',
          message: `Warning: ${counts.waiting} emails/SMS queued`,
          context: {
            queue: queue.name,
            depth: counts.waiting,
            threshold: this.thresholds.commQueueDepth
          },
          timestamp: new Date()
        });
      }
    }
    
    // Store metrics in database
    await this.storeMetrics(queue.name, counts);
  }
  
  private async getOldestWaitingJob(queue: Queue): Promise<any> {
    const jobs = await queue.getWaiting(0, 1);
    return jobs[0];
  }
  
  private async sendAlert(alert: Alert) {
    // Check cooldown to prevent spam
    const cooldownKey = `${alert.type}:${alert.severity}:${alert.context.queue}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey) || 0;
    const cooldownMs = alert.severity === 'critical' ? 300000 : 3600000; // 5 min for critical, 1 hour for others
    
    if (Date.now() - lastAlert < cooldownMs) {
      return; // Skip due to cooldown
    }
    
    logger.error(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`, alert.context);
    
    // Store alert in database
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO alert_history (severity, alert_type, message, queue_name, metric_value, threshold_value, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          alert.severity,
          alert.type,
          alert.message,
          alert.context.queue,
          alert.context.depth || alert.context.ageMinutes,
          alert.context.threshold
        ]
      );
    } catch (error) {
      logger.error('Failed to store alert in database:', error);
    }
    
    // Update metrics
    this.metrics.alertsSent.inc({
      severity: alert.severity,
      type: alert.type,
      channel: 'log'
    });
    
    // Send actual alert based on severity
    if (alert.severity === 'critical') {
      await this.sendCriticalAlert(alert);
    } else if (alert.severity === 'warning') {
      await this.sendWarningAlert(alert);
    }
    
    // Update cooldown
    this.alertCooldowns.set(cooldownKey, Date.now());
  }
  
  private async sendCriticalAlert(alert: Alert) {
    // Try to call on-call engineer
    if (this.twilioClient && process.env.ONCALL_PHONE) {
      try {
        // Send SMS first (more reliable)
        await this.twilioClient.messages.create({
          to: process.env.ONCALL_PHONE,
          from: process.env.TWILIO_PHONE,
          body: `🚨 CRITICAL Queue Alert:\n${alert.message}\n\nCheck immediately!`
        });
        
        this.metrics.alertsSent.inc({
          severity: 'critical',
          type: alert.type,
          channel: 'sms'
        });
        
        logger.info('Critical alert SMS sent');
        
        // Also try to call for money queue issues
        if (alert.context.queue === 'money-queue') {
          await this.twilioClient.calls.create({
            to: process.env.ONCALL_PHONE,
            from: process.env.TWILIO_PHONE,
            url: 'http://demo.twilio.com/docs/voice.xml' // You can customize this
          });
          
          this.metrics.alertsSent.inc({
            severity: 'critical',
            type: alert.type,
            channel: 'phone'
          });
          
          logger.info('Critical alert phone call initiated');
        }
      } catch (error) {
        logger.error('Failed to send Twilio alert:', error);
      }
    }
  }
  
  private async sendWarningAlert(alert: Alert) {
    // Send SMS for warnings
    if (this.twilioClient && process.env.ONCALL_PHONE) {
      try {
        await this.twilioClient.messages.create({
          to: process.env.ONCALL_PHONE,
          from: process.env.TWILIO_PHONE,
          body: `⚠️ Queue Warning:\n${alert.message}`
        });
        
        this.metrics.alertsSent.inc({
          severity: 'warning',
          type: alert.type,
          channel: 'sms'
        });
        
        logger.info('Warning alert SMS sent');
      } catch (error) {
        logger.error('Failed to send warning alert:', error);
      }
    }
  }
  
  private async storeMetrics(queueName: string, counts: any) {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO queue_metrics 
         (queue_name, waiting_count, active_count, completed_count, failed_count, captured_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [queueName, counts.waiting, counts.active, counts.completed, counts.failed]
      );
    } catch (error) {
      logger.error('Failed to store metrics:', error);
    }
  }
  
  getPrometheusMetrics(): string {
    return this.metrics.register.metrics();
  }
  
  async getMetricsSummary() {
    const pool = getPool();
    
    // Get recent metrics
    const result = await pool.query(
      `SELECT 
         queue_name,
         AVG(waiting_count) as avg_waiting,
         MAX(waiting_count) as max_waiting,
         AVG(active_count) as avg_active,
         AVG(failed_count) as avg_failed
       FROM queue_metrics
       WHERE captured_at > NOW() - INTERVAL '1 hour'
       GROUP BY queue_name`
    );
    
    // Get recent alerts
    const alerts = await pool.query(
      `SELECT severity, COUNT(*) as count
       FROM alert_history
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY severity`
    );
    
    return {
      queues: result.rows,
      alerts: alerts.rows,
      timestamp: new Date()
    };
  }
  
  // Record job completion for metrics
  recordJobSuccess(queueName: string, jobType: string, duration: number) {
    this.metrics.jobDuration.observe(
      { queue_name: queueName, job_type: jobType },
      duration
    );
    this.metrics.jobResults.inc({
      queue_name: queueName,
      job_type: jobType,
      result: 'success'
    });
  }
  
  recordJobFailure(queueName: string, jobType: string, error: any) {
    this.metrics.jobResults.inc({
      queue_name: queueName,
      job_type: jobType,
      result: 'failure'
    });
  }
}
```

### FILE: src/services/idempotency.service.ts
```typescript
import { Pool } from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';

export class IdempotencyService {
  private pool: Pool;
  private redis: Redis;
  private readonly DEFAULT_TTL = 86400; // 24 hours

  constructor() {
    this.pool = getPool();
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 4 // Separate DB for idempotency
    });
  }

  /**
   * Generate idempotency key based on job type and data
   */
  generateKey(jobType: string, data: any): string {
    switch(jobType) {
      case 'payment-process':
        // For payments, use venue, user, event, and amount
        return `payment-${data.venueId}-${data.userId}-${data.eventId}-${data.amount}`;
      
      case 'refund-process':
        return `refund-${data.transactionId}`;
      
      case 'nft-mint':
        return `nft-${data.eventId}-${data.seatId || data.ticketId}`;
      
      case 'payout-process':
        return `payout-${data.venueId}-${data.period || data.payoutId}`;
      
      case 'send-email':
        // For emails, include date to allow daily sends
        const date = new Date().toISOString().split('T')[0];
        return `email-${data.template}-${data.to}-${date}`;
      
      case 'send-sms':

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
        // For SMS, more restrictive

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
        const hour = new Date().getHours();

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
        return `sms-${data.to}-${data.template}-${hour}`;

      case 'analytics-event':
        // For analytics, use event type and timestamp to prevent duplicates
        return `analytics-${data.eventType}-${data.venueId || 'global'}-${data.userId || 'anonymous'}-${data.timestamp}`;
      
      default:
        // Generic hash for unknown types
        const hash = crypto.createHash('sha256');
        hash.update(jobType);
        hash.update(JSON.stringify(data));
        return hash.digest('hex');
    }
  }

  /**
   * Check if a job with this key was already processed
   */
  async check(key: string): Promise<any | null> {
    // Check Redis first (fast)
    const cached = await this.redis.get(`idem:${key}`);
    if (cached) {
      logger.info(`Idempotency hit (Redis): ${key}`);
      return JSON.parse(cached);
    }

    // Check PostgreSQL (persistent)
    const result = await this.pool.query(
      'SELECT result FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
      [key]
    );

    if (result.rows.length > 0) {
      logger.info(`Idempotency hit (PostgreSQL): ${key}`);
      
      // Cache in Redis for next time
      await this.redis.setex(
        `idem:${key}`,
        3600, // 1 hour cache
        JSON.stringify(result.rows[0].result)
      );
      
      return result.rows[0].result;
    }

    return null;
  }

  /**
   * Store the result for idempotency
   */
  async store(
    key: string, 
    queueName: string,
    jobType: string,
    result: any, 
    ttlSeconds: number = this.DEFAULT_TTL
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Store in PostgreSQL for persistence
    await this.pool.query(
      `INSERT INTO idempotency_keys 
       (key, queue_name, job_type, result, processed_at, expires_at)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (key) DO UPDATE 
       SET result = $4, processed_at = NOW()`,
      [key, queueName, jobType, result, expiresAt]
    );

    // Store in Redis for fast access
    await this.redis.setex(
      `idem:${key}`,
      ttlSeconds,
      JSON.stringify(result)
    );

    logger.info(`Idempotency stored: ${key} for ${ttlSeconds}s`);
  }

  /**
   * Clean up expired keys
   */
  async cleanup(): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM idempotency_keys WHERE expires_at < NOW()'
    );
    
    logger.info(`Cleaned up ${result.rowCount} expired idempotency keys`);
  }
}
```

### FILE: src/services/recovery.service.ts
```typescript
import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';
import { QueueFactory } from '../queues/factories/queue.factory';
import { JOB_TYPES, QUEUE_NAMES } from '../config/constants';

export class RecoveryService {
  private pool = getPool();

  async recoverPendingJobs(): Promise<void> {
    try {
      logger.info('Starting job recovery process...');

      // Recover critical jobs from PostgreSQL
      const result = await this.pool.query(
        `SELECT * FROM critical_jobs 
         WHERE status IN ('pending', 'processing')
         AND created_at > NOW() - INTERVAL '24 hours'
         ORDER BY priority DESC, created_at ASC`
      );

      if (result.rows.length === 0) {
        logger.info('No jobs to recover');
        return;
      }

      logger.info(`Found ${result.rows.length} jobs to recover`);

      for (const row of result.rows) {
        try {
          await this.recoverJob(row);
        } catch (error) {
          logger.error(`Failed to recover job ${row.id}:`, error);
        }
      }

      logger.info('Job recovery completed');
    } catch (error) {
      logger.error('Recovery process failed:', error);
    }
  }

  private async recoverJob(jobData: any): Promise<void> {
    const queue = this.determineQueue(jobData.queue_name);
    
    if (!queue) {
      logger.warn(`Unknown queue for job ${jobData.id}: ${jobData.queue_name}`);
      return;
    }

    // Re-add the job to the queue
    const job = await queue.add(
      jobData.job_type,
      jobData.data,
      {
        jobId: jobData.id, // Use same ID
        priority: jobData.priority,
        attempts: 10 - jobData.attempts // Remaining attempts
      }
    );

    logger.info(`Recovered job ${job.id} to ${jobData.queue_name}`);
  }

  private determineQueue(queueName: string) {
    if (queueName === QUEUE_NAMES.MONEY) {
      return QueueFactory.getQueue('money');
    } else if (queueName === QUEUE_NAMES.COMMUNICATION) {
      return QueueFactory.getQueue('communication');
    } else if (queueName === QUEUE_NAMES.BACKGROUND) {
      return QueueFactory.getQueue('background');
    }
    return null;
  }
}
```

### FILE: src/services/persistence.service.ts
```typescript
import { Pool } from 'pg';
import Redis from 'ioredis';
import { Job } from 'bull';
import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';
import { PERSISTENCE_TIERS } from '../config/constants';

export class PersistenceService {
  private tier: string;
  private pool: Pool;
  private redis?: Redis;

  constructor(tier: string) {
    this.tier = tier;
    this.pool = getPool();
    
    // Setup Redis with appropriate persistence
    if (tier === PERSISTENCE_TIERS.TIER_1) {
      // Tier 1: Redis with AOF (Append Only File)
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: 1,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        enableOfflineQueue: true
      });
    } else if (tier === PERSISTENCE_TIERS.TIER_2) {
      // Tier 2: Redis with RDB snapshots
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: 2,
        retryStrategy: (times) => Math.min(times * 100, 5000)
      });
    }
    // Tier 3: No special Redis setup needed (memory only)
  }

  async saveJob(job: Job): Promise<void> {
    const jobId = String(job.id); // Convert to string
    
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      try {
        // Save to PostgreSQL for Tier 1 (critical jobs)
        await this.pool.query(
          `INSERT INTO critical_jobs 
           (id, queue_name, job_type, data, priority, idempotency_key, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           ON CONFLICT (id) DO UPDATE 
           SET updated_at = CURRENT_TIMESTAMP, status = 'pending'`,
          [
            jobId,
            job.queue.name,
            job.name,
            JSON.stringify(job.data),
            job.opts.priority || 5,
            job.data.idempotencyKey || null
          ]
        );
        
        logger.info(`Tier 1 job saved to PostgreSQL: ${jobId}`);
        
        // Also save to Redis for fast access
        if (this.redis) {
          await this.redis.hset(
            `job:${jobId}`,
            'queue', job.queue.name,
            'type', job.name,
            'data', JSON.stringify(job.data),
            'status', 'pending',
            'timestamp', Date.now().toString()
          );
        }
      } catch (error) {
        logger.error(`Failed to persist Tier 1 job ${jobId}:`, error);
        throw error; // Don't process if can't persist
      }
    } else if (this.tier === PERSISTENCE_TIERS.TIER_2 && this.redis) {
      // Tier 2: Save to Redis only
      await this.redis.hset(
        `job:${jobId}`,
        'queue', job.queue.name,
        'type', job.name,
        'data', JSON.stringify(job.data),
        'status', 'pending'
      );
      
      // Trigger RDB snapshot periodically
      const keyCount = await this.redis.dbsize();
      if (keyCount % 100 === 0) {
        await this.redis.bgsave();
        logger.debug('Tier 2 RDB snapshot triggered');
      }
    }
    // Tier 3: No persistence needed
  }

  async markComplete(jobId: string | number, result: any): Promise<void> {
    const id = String(jobId); // Convert to string
    
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      await this.pool.query(
        `UPDATE critical_jobs 
         SET status = 'completed', 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );
      
      if (this.redis) {
        await this.redis.hset(`job:${id}`, 'status', 'completed');
      }
    } else if (this.tier === PERSISTENCE_TIERS.TIER_2 && this.redis) {
      await this.redis.hset(`job:${id}`, 'status', 'completed');
      // Clean up after 5 minutes
      setTimeout(() => {
        this.redis?.del(`job:${id}`);
      }, 300000);
    }
  }

  async markFailed(jobId: string | number, error: Error): Promise<void> {
    const id = String(jobId); // Convert to string
    
    if (this.tier === PERSISTENCE_TIERS.TIER_1) {
      await this.pool.query(
        `UPDATE critical_jobs 
         SET status = 'failed',
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );
    }
    
    if (this.redis) {
      await this.redis.hset(`job:${id}`, 
        'status', 'failed',
        'error', error.message
      );
    }
  }

  async recoverJobs(): Promise<any[]> {
    // Only Tier 1 can recover from PostgreSQL
    if (this.tier !== PERSISTENCE_TIERS.TIER_1) {
      return [];
    }

    const result = await this.pool.query(
      `SELECT * FROM critical_jobs 
       WHERE status IN ('pending', 'processing')
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY priority DESC, created_at ASC`
    );

    logger.info(`Recovering ${result.rows.length} Tier 1 jobs from PostgreSQL`);

    return result.rows.map(row => ({
      id: row.id,
      queue: row.queue_name,
      name: row.job_type,
      data: row.data,
      opts: {
        priority: row.priority,
        jobId: row.idempotency_key
      }
    }));
  }
}
```

### FILE: src/services/rate-limiter.service.ts
```typescript
import { logger } from '../utils/logger';
import { TokenBucket } from '../utils/token-bucket';
import { RATE_LIMITS, RATE_LIMIT_GROUPS, RateLimitConfig } from '../config/rate-limits.config';
import { getPool } from '../config/database.config';
import Redis from 'ioredis';

interface RateLimiter {
  bucket: TokenBucket;
  concurrent: number;
  maxConcurrent: number;
  lastActivity: number;
  config: RateLimitConfig;
}

export class RateLimiterService {
  private static instance: RateLimiterService;
  private limiters: Map<string, RateLimiter> = new Map();
  private redis: Redis;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 5 // Separate DB for rate limiting
    });
    
    this.initializeLimiters();
    this.startMetricsCollection();
  }
  
  static getInstance(): RateLimiterService {
    if (!this.instance) {
      this.instance = new RateLimiterService();
    }
    return this.instance;
  }
  
  private initializeLimiters(): void {
    for (const [service, config] of Object.entries(RATE_LIMITS)) {
      const bucket = new TokenBucket(
        config.burstSize || config.maxPerSecond * 10,
        config.maxPerSecond
      );
      
      this.limiters.set(service, {
        bucket,
        concurrent: 0,
        maxConcurrent: config.maxConcurrent,
        lastActivity: Date.now(),
        config
      });
      
      logger.info(`Rate limiter initialized for ${service}:`, {
        maxPerSecond: config.maxPerSecond,
        maxConcurrent: config.maxConcurrent
      });
    }
  }
  
  /**
   * Acquire permission to make an API call
   */
  async acquire(service: string, priority: number = 5): Promise<void> {
    // Check if service is part of a group
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) {
      logger.warn(`No rate limiter configured for service: ${service}`);
      return; // Allow if no limiter configured
    }
    
    // Wait for concurrent slot
    while (limiter.concurrent >= limiter.maxConcurrent) {
      await this.sleep(50);
    }
    
    // Wait for rate limit token
    const acquired = await limiter.bucket.waitForTokens(1, 30000);
    if (!acquired) {
      throw new Error(`Rate limit timeout for ${service}`);
    }
    
    // Increment concurrent count
    limiter.concurrent++;
    limiter.lastActivity = Date.now();
    
    // Store metrics in Redis
    await this.recordMetric(service, 'acquire');
    
    logger.debug(`Rate limit acquired for ${service}: ${limiter.concurrent}/${limiter.maxConcurrent} concurrent`);
  }
  
  /**
   * Release a rate limit slot
   */
  release(service: string): void {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return;
    
    if (limiter.concurrent > 0) {
      limiter.concurrent--;
      limiter.lastActivity = Date.now();
      
      logger.debug(`Rate limit released for ${service}: ${limiter.concurrent}/${limiter.maxConcurrent} concurrent`);
    }
  }
  
  /**
   * Get current status of rate limiters
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [service, limiter] of this.limiters) {
      status[service] = {
        tokensAvailable: limiter.bucket.getTokenCount(),
        concurrent: limiter.concurrent,
        maxConcurrent: limiter.maxConcurrent,
        lastActivity: new Date(limiter.lastActivity).toISOString(),
        config: limiter.config
      };
    }
    
    return status;
  }
  
  /**
   * Check if a service is rate limited
   */
  async isRateLimited(service: string): Promise<boolean> {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return false;
    
    return limiter.concurrent >= limiter.maxConcurrent || 
           limiter.bucket.getTokenCount() < 1;
  }
  
  /**
   * Get wait time until next available slot (ms)
   */
  getWaitTime(service: string): number {
    const groupName = this.getServiceGroup(service);
    const limiterKey = groupName || service;
    
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return 0;
    
    if (limiter.concurrent >= limiter.maxConcurrent) {
      // Estimate based on average processing time
      return limiter.config.cooldownMs || 1000;
    }
    
    return limiter.bucket.getTimeUntilNextToken();
  }
  
  /**
   * Reset rate limiter for a service
   */
  reset(service: string): void {
    const limiter = this.limiters.get(service);
    if (!limiter) return;
    
    limiter.bucket = new TokenBucket(
      limiter.config.burstSize || limiter.config.maxPerSecond * 10,
      limiter.config.maxPerSecond
    );
    limiter.concurrent = 0;
    
    logger.info(`Rate limiter reset for ${service}`);
  }
  
  /**
   * Emergency stop - pause all rate limiters
   */
  emergencyStop(): void {
    for (const [service, limiter] of this.limiters) {
      limiter.maxConcurrent = 0;
      logger.warn(`Emergency stop: Rate limiter paused for ${service}`);
    }
  }
  
  /**
   * Resume after emergency stop
   */
  resume(): void {
    for (const [service, limiter] of this.limiters) {
      limiter.maxConcurrent = limiter.config.maxConcurrent;
      logger.info(`Rate limiter resumed for ${service}`);
    }
  }
  
  private getServiceGroup(service: string): string | null {
    for (const [group, services] of Object.entries(RATE_LIMIT_GROUPS)) {
      if (services.includes(service)) {
        return group;
      }
    }
    return null;
  }
  
  private async recordMetric(service: string, action: string): Promise<void> {
    const key = `rate_limit:${service}:${action}`;
    const timestamp = Date.now();
    
    try {
      await this.redis.zadd(key, timestamp, timestamp);
      // Keep only last hour of data
      await this.redis.zremrangebyscore(key, 0, timestamp - 3600000);
    } catch (error) {
      logger.error('Failed to record rate limit metric:', error);
    }
  }
  
  private startMetricsCollection(): void {
    // Collect metrics every minute
    this.metricsInterval = setInterval(async () => {
      try {
        await this.storeMetrics();
      } catch (error) {
        logger.error('Failed to store rate limit metrics:', error);
      }
    }, 60000);
  }
  
  private async storeMetrics(): Promise<void> {
    const pool = getPool();
    const metrics = this.getStatus();
    
    for (const [service, status] of Object.entries(metrics)) {
      await pool.query(
        `INSERT INTO rate_limit_metrics 
         (service_name, tokens_available, concurrent_requests, max_concurrent, captured_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [service, status.tokensAvailable, status.concurrent, status.maxConcurrent]
      ).catch(() => {}); // Ignore if table doesn't exist
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}
```

