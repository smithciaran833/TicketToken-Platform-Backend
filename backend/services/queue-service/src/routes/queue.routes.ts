import { FastifyInstance } from 'fastify';
import { QueueController } from '../controllers/queue.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const queueController = new QueueController();

async function queueRoutes(fastify: FastifyInstance) {
  // Basic authenticated routes
  fastify.get(
    '/',
    {
      preHandler: [authenticate]
    },
    queueController.listQueues.bind(queueController)
  );

  fastify.get(
    '/:name/status',
    {
      preHandler: [authenticate]
    },
    queueController.getQueueStatus.bind(queueController)
  );

  fastify.get(
    '/:name/jobs',
    {
      preHandler: [authenticate]
    },
    queueController.getQueueJobs.bind(queueController)
  );

  // Admin only routes
  fastify.post(
    '/:name/pause',
    {
      preHandler: [authenticate, authorize('admin')]
    },
    queueController.pauseQueue.bind(queueController)
  );

  fastify.post(
    '/:name/resume',
    {
      preHandler: [authenticate, authorize('admin')]
    },
    queueController.resumeQueue.bind(queueController)
  );

  fastify.post(
    '/:name/clear',
    {
      preHandler: [authenticate, authorize('admin')]
    },
    queueController.clearQueue.bind(queueController)
  );
}

export default queueRoutes;
