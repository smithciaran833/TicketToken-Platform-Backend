import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { alertService } from '../services/alert.service';
import { logger } from '../utils/logger';

class AlertController {
  async getActiveAlerts(request: FastifyRequest, reply: FastifyReply) {
    try {
      const alerts = await alertService.getActiveAlerts();
      reply.send(alerts);
    } catch (error) {
      logger.error('Error getting active alerts:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async getAlert(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const alert = await alertService.getAlert(request.params.id);
      if (!alert) {
        return reply.code(404).send({ error: 'Alert not found' });
      }
      reply.send(alert);
    } catch (error) {
      logger.error('Error getting alert:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async acknowledgeAlert(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const result = await alertService.acknowledgeAlert(
        request.params.id,
        request.body
      );
      reply.send(result);
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async resolveAlert(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const result = await alertService.resolveAlert(
        request.params.id,
        request.body
      );
      reply.send(result);
    } catch (error) {
      logger.error('Error resolving alert:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async getAlertHistory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const history = await alertService.getAlertHistory(request.query);
      reply.send(history);
    } catch (error) {
      logger.error('Error getting alert history:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async getAlertRules(request: FastifyRequest, reply: FastifyReply) {
    try {
      const rules = await alertService.getAlertRules();
      reply.send(rules);
    } catch (error) {
      logger.error('Error getting alert rules:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async createAlertRule(request: FastifyRequest, reply: FastifyReply) {
    try {
      const rule = await alertService.createAlertRule(request.body);
      reply.code(201).send(rule);
    } catch (error) {
      logger.error('Error creating alert rule:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async updateAlertRule(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const rule = await alertService.updateAlertRule(
        request.params.id,
        request.body
      );
      reply.send(rule);
    } catch (error) {
      logger.error('Error updating alert rule:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async deleteAlertRule(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      await alertService.deleteAlertRule(request.params.id);
      reply.code(204).send();
    } catch (error) {
      logger.error('Error deleting alert rule:', error);
      reply.code(500).send({ error: 'Internal server error' });
    }
  }
}

export const alertController = new AlertController();
