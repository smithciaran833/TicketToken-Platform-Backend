import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { riskService } from '../services/risk.service';

export class RiskController {
  static async calculateRiskScore(req: Request, res: Response) {
    try {
      const { venueId } = req.body;
      
      const riskAssessment = await riskService.calculateRiskScore(venueId);
      
      res.json({
        success: true,
        data: {
          venueId,
          ...riskAssessment,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async flagVenue(req: Request, res: Response) {
    try {
      const { venueId, reason } = req.body;
      
      await riskService.flagForReview(venueId, reason);
      
      res.json({
        success: true,
        message: 'Venue flagged for review',
        data: { venueId, reason }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async resolveFlag(req: Request, res: Response) {
    try {
      const { flagId } = req.params;
      const { resolution } = req.body;
      
      await riskService.resolveFlag(parseInt(flagId), resolution);
      
      res.json({
        success: true,
        message: 'Flag resolved',
        data: { flagId, resolution }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
