import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
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
  async addJob(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      const { queue, type, data, options } = request.body as any;

      // Add user context to job data
      const jobData = {
        ...data,
        userId: request.user?.id,
        venueId: request.user?.venueId,
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
        userId: request.user?.id
      });

      return reply.code(201).send({
        jobId: job.id,
        queue,
        type,
        status: 'queued',
        options: jobOptions
      });
    } catch (error) {
      logger.error('Failed to add job:', error);
      return reply.code(500).send({ error: 'Failed to add job' });
    }
  }

  async getJob(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { id } = request.params as { id: string };
      const { queue } = request.query as { queue?: string };

      if (!queue) {
        return reply.code(400).send({ error: 'Queue parameter required' });
      }

      const queueInstance = QueueFactory.getQueue(queue as any);
      const job = await queueInstance.getJob(id);

      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      const state = await job.getState();

      return reply.send({
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
      return reply.code(500).send({ error: 'Failed to get job' });
    }
  }

  async retryJob(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      const { id } = request.params as { id: string };
      const { queue } = request.body as any;

      const queueInstance = QueueFactory.getQueue(queue);
      const job = await queueInstance.getJob(id);

      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      await job.retry();

      logger.info(`Job ${id} retried by user ${request.user?.id}`);

      return reply.send({
        jobId: job.id,
        status: 'retrying',
        message: 'Job has been queued for retry'
      });
    } catch (error) {
      logger.error('Failed to retry job:', error);
      return reply.code(500).send({ error: 'Failed to retry job' });
    }
  }

  async cancelJob(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      const { id } = request.params as { id: string };
      const { queue } = request.query as { queue?: string };

      if (!queue) {
        return reply.code(400).send({ error: 'Queue parameter required' });
      }

      const queueInstance = QueueFactory.getQueue(queue as any);
      const job = await queueInstance.getJob(id);

      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      await job.remove();

      logger.info(`Job ${id} cancelled by user ${request.user?.id}`);

      return reply.send({
        jobId: id,
        status: 'cancelled',
        message: 'Job has been cancelled'
      });
    } catch (error) {
      logger.error('Failed to cancel job:', error);
      return reply.code(500).send({ error: 'Failed to cancel job' });
    }
  }

  async addBatchJobs(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      const { queue, jobs, options = {} } = request.body as any;
      const { stopOnError = false, validateAll = true } = options;

      // Validate batch size
      if (!Array.isArray(jobs) || jobs.length === 0) {
        return reply.code(400).send({ error: 'No jobs provided' });
      }

      if (jobs.length > 100) {
        return reply.code(400).send({ error: 'Batch size exceeds maximum of 100 jobs' });
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
              return reply.code(400).send({
                error: 'Validation failed',
                failedAt: i,
                validationErrors: errors
              });
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
                return reply.code(400).send({
                  error: 'Business validation failed',
                  failedAt: i,
                  validationErrors: errors
                });
              }
            } else {
              validatedJobs.push({ index: i, job: jobData });
            }
          }
        }
      } else {
        // No pre-validation, add all jobs to validated list
        jobs.forEach((job: any, index: number) => {
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
            userId: request.user?.id,
            venueId: request.user?.venueId,
            batchId: request.headers['x-batch-id'] || null,
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

            return reply.code(500).send({
              error: 'Batch processing failed',
              failedAt: index,
              processed: results.length,
              errors
            });
          }
        }
      }

      logger.info(`Batch of ${results.length} jobs added to ${queue} queue`, {
        userId: request.user?.id,
        successful: results.length,
        failed: errors.length
      });

      return reply.code(201).send({
        queue,
        total: jobs.length,
        successful: results.length,
        failed: errors.length,
        jobs: results,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      logger.error('Failed to add batch jobs:', error);
      return reply.code(500).send({ error: 'Failed to add batch jobs' });
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
