import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { taxService } from '../services/tax.service';

export class TaxController {
  static async trackSale(req: Request, res: Response) {
    try {
      const { venueId, amount, ticketId } = req.body;
      const result = await taxService.trackSale(venueId, amount, ticketId);
      res.json({
        success: true,
        message: 'Sale tracked for tax reporting',
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  static async getTaxSummary(req: Request, res: Response) {
    try {
      const { venueId } = req.params;
      const { year } = req.query;
      const summary = await taxService.getVenueTaxSummary(
        venueId,
        year ? parseInt(year as string) : undefined
      );
      res.json({
        success: true,
        data: summary
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  static async calculateTax(req: Request, res: Response) {
    try {
      const result = await taxService.calculateTax(req.body);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to calculate tax' });
    }
  }

  static async generateTaxReport(req: Request, res: Response) {
    try {
      const { year } = req.params;
      const result = await taxService.generateTaxReport(parseInt(year));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate tax report' });
    }
  }
}
