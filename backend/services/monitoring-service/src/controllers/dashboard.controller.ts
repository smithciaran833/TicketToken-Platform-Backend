import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { dashboardService } from '../services/dashboard.service';
import { logger } from '../utils/logger';

class DashboardController {
  async getOverview(request: FastifyRequest, reply: FastifyReply) {
    try {
      const overview = await dashboardService.getOverview();
      reply.send(overview);
    } catch (error) {
      logger.error('Error getting dashboard overview:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async getSLAMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      const sla = await dashboardService.getSLAMetrics(request.query);
      reply.send(sla);
    } catch (error) {
      logger.error('Error getting SLA metrics:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async getPerformanceMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      const performance = await dashboardService.getPerformanceMetrics(request.query);
      reply.send(performance);
    } catch (error) {
      logger.error('Error getting performance metrics:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async getBusinessMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      const business = await dashboardService.getBusinessMetrics(request.query);
      reply.send(business);
    } catch (error) {
      logger.error('Error getting business metrics:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async getIncidents(request: FastifyRequest, reply: FastifyReply) {
    try {
      const incidents = await dashboardService.getIncidents(request.query);
      reply.send(incidents);
    } catch (error) {
      logger.error('Error getting incidents:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }
}

export const dashboardController = new DashboardController();
