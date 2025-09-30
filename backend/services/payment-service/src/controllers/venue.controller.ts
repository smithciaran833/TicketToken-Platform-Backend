import { serviceCache } from '../services/cache-integration';
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { VenueBalanceService } from '../services/core';

export class VenueController {
  private venueBalanceService: VenueBalanceService;
  
  constructor() {
    this.venueBalanceService = new VenueBalanceService();
  }
  
  async getBalance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { venueId } = req.params;
      
      // Verify venue access
      if (!req.user) return res.status(401).json({ error: "Authentication required" });
      if (!req.user.venues?.includes(venueId) && !req.user.isAdmin) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }
      
      const balance = await this.venueBalanceService.getBalance(venueId);
      const payoutInfo = await this.venueBalanceService.calculatePayoutAmount(venueId);
      
      res.json({
        balance,
        payoutInfo
      });
    } catch (error) {
      return next(error);
    }
  }
  
  async requestPayout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { venueId } = req.params;
      const { amount, instant } = req.body;
      
      // Verify venue access
      if (!req.user) return res.status(401).json({ error: "Authentication required" });
      if (!req.user.venues?.includes(venueId) && !req.user.isAdmin) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }
      
      await this.venueBalanceService.processPayout(venueId, amount);
      
      res.json({
        success: true,
        message: 'Payout initiated',
        amount,
        type: instant ? 'instant' : 'standard',
        estimatedArrival: instant ? 'Within 30 minutes' : '1-2 business days'
      });
    } catch (error) {
      return next(error);
    }
  }
  
  async getPayoutHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { venueId } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      // Verify venue access
      if (!req.user) return res.status(401).json({ error: "Authentication required" });
      if (!req.user.venues?.includes(venueId) && !req.user.isAdmin) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }
      
      // TODO: Implement getPayoutHistory method
      const history: any[] = []; /* await this.venueBalanceService.getPayoutHistory(
        venueId,
        parseInt(limit as string),
        parseInt(offset as string)
      ); */
      
      res.json(history);
    } catch (error) {
      return next(error);
    }
  }
}
