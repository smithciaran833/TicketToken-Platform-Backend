import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { QueueFactory } from '../queues/factories/queue.factory';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth.middleware';

export class QueueController {
  async listQueues(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const queues = ['money', 'communication', 'background'];
      const queueInfo = await Promise.all(
        queues.map(async (queueName) => {
          const metrics = await QueueFactory.getQueueMetrics(queueName as any);
          return metrics; // metrics already includes the name
        })
      );

      return reply.send(queueInfo);
    } catch (error) {
      logger.error('Failed to list queues:', error);
      return reply.code(500).send({ error: 'Failed to list queues' });
    }
  }

  async getQueueStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { name } = request.params as { name: string };

      const queue = QueueFactory.getQueue(name as any);
      const metrics = await QueueFactory.getQueueMetrics(name as any);

      // Get sample of waiting jobs
      const waitingJobs = await queue.getWaiting(0, 10);
      const activeJobs = await queue.getActive(0, 10);
      const failedJobs = await queue.getFailed(0, 10);

      return reply.send({
        name: queue.name,
        metrics,
        samples: {
          waiting: waitingJobs.map(j => ({
            id: j.id,
            type: j.name,
            createdAt: new Date(j.timestamp)
          })),
          active: activeJobs.map(j => ({
            id: j.id,
            type: j.name,
            startedAt: new Date(j.processedOn || j.timestamp)
          })),
          failed: failedJobs.map(j => ({
            id: j.id,
            type: j.name,
            failedAt: new Date(j.finishedOn || j.timestamp),
            reason: j.failedReason
          }))
        }
      });
    } catch (error) {
      logger.error('Failed to get queue status:', error);
      return reply.code(500).send({ error: 'Failed to get queue status' });
    }
  }

  async pauseQueue(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      const { name } = request.params as { name: string };

      const queue = QueueFactory.getQueue(name as any);
      await queue.pause();

      logger.warn(`Queue ${name} paused by user ${request.user?.id}`);

      return reply.send({
        queue: name,
        status: 'paused',
        message: 'Queue has been paused'
      });
    } catch (error) {
      logger.error('Failed to pause queue:', error);
      return reply.code(500).send({ error: 'Failed to pause queue' });
    }
  }

  async resumeQueue(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      const { name } = request.params as { name: string };

      const queue = QueueFactory.getQueue(name as any);
      await queue.resume();

      logger.info(`Queue ${name} resumed by user ${request.user?.id}`);

      return reply.send({
        queue: name,
        status: 'active',
        message: 'Queue has been resumed'
      });
    } catch (error) {
      logger.error('Failed to resume queue:', error);
      return reply.code(500).send({ error: 'Failed to resume queue' });
    }
  }

  async clearQueue(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      const { name } = request.params as { name: string };
      const { type } = request.query as { type?: 'completed' | 'failed' | 'delayed' | 'wait' };

      const queue = QueueFactory.getQueue(name as any);

      if (type) {
        await queue.clean(0, type);
        logger.warn(`Queue ${name} cleared (${type}) by user ${request.user?.id}`);
      } else {
        await queue.empty();
        logger.warn(`Queue ${name} emptied by user ${request.user?.id}`);
      }

      return reply.send({
        queue: name,
        action: type ? `cleared ${type}` : 'emptied',
        message: 'Queue has been cleared'
      });
    } catch (error) {
      logger.error('Failed to clear queue:', error);
      return reply.code(500).send({ error: 'Failed to clear queue' });
    }
  }

  async getQueueJobs(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { name } = request.params as { name: string };
      const { status = 'waiting', start = 0, end = 20 } = request.query as any;

      const queue = QueueFactory.getQueue(name as any);

      let jobs;
      switch (status) {
        case 'waiting':
          jobs = await queue.getWaiting(Number(start), Number(end));
          break;
        case 'active':
          jobs = await queue.getActive(Number(start), Number(end));
          break;
        case 'completed':
          jobs = await queue.getCompleted(Number(start), Number(end));
          break;
        case 'failed':
          jobs = await queue.getFailed(Number(start), Number(end));
          break;
        default:
          return reply.code(400).send({ error: 'Invalid status parameter' });
      }

      const jobList = jobs.map(job => ({
        id: job.id,
        type: job.name,
        data: job.data,
        attempts: job.attemptsMade,
        progress: job.progress(),
        createdAt: new Date(job.timestamp),
        processedAt: job.processedOn ? new Date(job.processedOn) : null,
        finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
        failedReason: job.failedReason
      }));

      return reply.send({
        queue: name,
        status,
        count: jobList.length,
        jobs: jobList
      });
    } catch (error) {
      logger.error('Failed to get queue jobs:', error);
      return reply.code(500).send({ error: 'Failed to get queue jobs' });
    }
  }
}
