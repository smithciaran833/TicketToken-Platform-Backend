import { FastifyReply } from 'fastify';
import { AuthRequest } from '../middleware/auth.middleware';
import { taxReportingService } from '../services/tax-reporting.service';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

export class TaxController {
  async getYearlyReport(request: AuthRequest, reply: FastifyReply) {
    try {
      const { year } = request.params as { year: string };
      const userId = request.user?.id;

      if (!userId) {
        throw new ValidationError('User ID required');
      }

      const report = await taxReportingService.getYearlyReport(userId, parseInt(year));

      if (!report) {
        return reply.status(404).send({ error: 'No transactions found for this year' });
      }

      reply.send({ success: true, data: report });
    } catch (error) {
      logger.error('Error getting yearly report:', error);
      throw error;
    }
  }

  async generate1099K(request: AuthRequest, reply: FastifyReply) {
    try {
      const { year } = request.params as { year: string };
      const userId = request.user?.id;

      if (!userId) {
        throw new ValidationError('User ID required');
      }

      const form = await taxReportingService.generate1099K(userId, parseInt(year));

      if (!form) {
        return reply.status(404).send({ error: 'Unable to generate 1099-K' });
      }

      reply.send({ success: true, data: form });
    } catch (error) {
      logger.error('Error generating 1099-K:', error);
      throw error;
    }
  }

  async getTransactions(request: AuthRequest, reply: FastifyReply) {
    try {
      const userId = request.user?.id;
      const { year } = request.query as { year?: string };

      if (!userId) {
        throw new ValidationError('User ID required');
      }

      const transactions = await taxReportingService.getReportableTransactions(
        userId,
        year ? parseInt(year) : new Date().getFullYear()
      );

      reply.send({ success: true, data: transactions });
    } catch (error) {
      logger.error('Error getting transactions:', error);
      throw error;
    }
  }
}

export const taxController = new TaxController();
