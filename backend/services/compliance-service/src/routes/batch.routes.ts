import { FastifyInstance } from 'fastify';
import { BatchController } from '../controllers/batch.controller';

export async function batchRoutes(fastify: FastifyInstance) {
  const batchController = new BatchController();

  // Batch processing routes
  fastify.get('/batch/jobs', batchController.getBatchJobs);
  fastify.post('/batch/kyc', batchController.runDailyChecks);
  fastify.post('/batch/risk-assessment', batchController.runDailyChecks);
  fastify.get('/batch/job/:jobId', batchController.getBatchJobs);
  fastify.post('/batch/ofac-update', batchController.updateOFACList);
}
