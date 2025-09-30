import { FastifyInstance } from 'fastify';
import { salesTracker } from '../analytics/sales-tracker';
import { fraudDetector } from '../analytics/advanced-fraud-ml';

async function analyticsRoutes(fastify: FastifyInstance) {
  // Sales tracking endpoints
  fastify.get('/sales/:eventId', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const metrics = await salesTracker.getEventMetrics(eventId);
    return reply.send(metrics);
  });

  fastify.post('/sales/track', async (request, reply) => {
    const { eventId, ticketData } = request.body as any;
    const result = await salesTracker.trackSale(eventId, ticketData);
    return reply.send(result);
  });

  // Fraud detection endpoints
  fastify.post('/fraud/check', async (request, reply) => {
    const userData = request.body;
    const result = await fraudDetector.detectFraud(userData);
    return reply.send(result);
  });

  fastify.get('/fraud/metrics', async (request, reply) => {
    const metrics = await fraudDetector.getFraudMetrics();
    return reply.send(metrics);
  });

  // Combined dashboard
  fastify.get('/dashboard', async (request, reply) => {
    const [fraudMetrics, salesEvents] = await Promise.all([
      fraudDetector.getFraudMetrics(),
      salesTracker.getEventMetrics('all'),
    ]);

    return reply.send({
      fraud: fraudMetrics,
      sales: salesEvents,
      timestamp: new Date(),
    });
  });
}

export default analyticsRoutes;
