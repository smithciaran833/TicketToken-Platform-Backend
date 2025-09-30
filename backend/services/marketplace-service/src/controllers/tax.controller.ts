import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { taxReportingService } from '../services/tax-reporting.service';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

export class TaxController {
  async getYearlyReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year } = req.params;
      const userId = req.user?.id;
      
      if (!userId) {
        throw new ValidationError('User ID required');
      }
      
      const report = await taxReportingService.getYearlyReport(userId, parseInt(year));
      
      if (!report) {
        return res.status(404).json({ error: 'No transactions found for this year' });
      }
      
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Error getting yearly report:', error);
      return next(error);
    }
  }
  
  async generate1099K(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year } = req.params;
      const userId = req.user?.id;
      
      if (!userId) {
        throw new ValidationError('User ID required');
      }
      
      const form = await taxReportingService.generate1099K(userId, parseInt(year));
      
      if (!form) {
        return res.status(404).json({ error: 'Unable to generate 1099-K' });
      }
      
      res.json({ success: true, data: form });
    } catch (error) {
      logger.error('Error generating 1099-K:', error);
      return next(error);
    }
  }
  
  async getTransactions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      const { year } = req.query;
      
      if (!userId) {
        throw new ValidationError('User ID required');
      }
      
      const transactions = await taxReportingService.getReportableTransactions(
        userId,
        year ? parseInt(year as string) : new Date().getFullYear()
      );
      
      res.json({ success: true, data: transactions });
    } catch (error) {
      logger.error('Error getting transactions:', error);
      next(error);
    }
  }
}

export const taxController = new TaxController();
