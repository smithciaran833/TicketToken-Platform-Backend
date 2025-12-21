import { FastifyInstance } from 'fastify';
import { JobController, addJobSchema } from '../controllers/job.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';

const jobController = new JobController();

async function jobRoutes(fastify: FastifyInstance) {
  // Add a new job
  fastify.post(
    '/',
    {
      preHandler: [authenticate, validateBody(addJobSchema)]
    },
    jobController.addJob.bind(jobController)
  );

  // Get job details
  fastify.get(
    '/:id',
    {
      preHandler: [authenticate]
    },
    jobController.getJob.bind(jobController)
  );

  // Retry a failed job
  fastify.post(
    '/:id/retry',
    {
      preHandler: [authenticate, authorize(['admin', 'venue_admin'])]
    },
    jobController.retryJob.bind(jobController)
  );

  // Cancel a job
  fastify.delete(
    '/:id',
    {
      preHandler: [authenticate, authorize(['admin', 'venue_admin'])]
    },
    jobController.cancelJob.bind(jobController)
  );

  // Add batch jobs
  fastify.post(
    '/batch',
    {
      preHandler: [authenticate, authorize(['admin', 'venue_admin'])]
    },
    jobController.addBatchJobs.bind(jobController)
  );
}

export default jobRoutes;
