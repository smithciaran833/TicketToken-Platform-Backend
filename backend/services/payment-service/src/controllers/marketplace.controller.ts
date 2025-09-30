import { serviceCache } from '../services/cache-integration';
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { EscrowService, RoyaltySplitterService, PriceEnforcerService } from '../services/marketplace';

export class MarketplaceController {
  private escrowService: EscrowService;
  private royaltySplitter: RoyaltySplitterService;
  private priceEnforcer: PriceEnforcerService;
  
  constructor() {
    this.escrowService = new EscrowService();
    this.royaltySplitter = new RoyaltySplitterService();
    this.priceEnforcer = new PriceEnforcerService();
  }
  
  async createListing(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { ticketId, price } = req.body;
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      const userId = req.user.id;
      
      // Validate price
      const priceValidation = await this.priceEnforcer.validateListingPrice(
        ticketId,
        price,
        req.body.venueId
      );
      
      if (!priceValidation.valid) {
        return res.status(400).json({
          error: priceValidation.reason,
          originalPrice: priceValidation.originalPrice,
          maxAllowedPrice: priceValidation.maxAllowedPrice,
          minAllowedPrice: priceValidation.minAllowedPrice
        });
      }
      
      // Create listing (would integrate with ticket service)
      const listing = {
        id: `listing_${Date.now()}`,
        ticketId,
        sellerId: userId,
        price,
        originalPrice: priceValidation.originalPrice!,
        venueRoyaltyPercentage: 10, // Default 10%
        status: 'active',
        createdAt: new Date()
      };
      
      res.status(201).json({
        success: true,
        listing,
        priceInfo: priceValidation
      });
    } catch (error) {
      return next(error);
    }
  }
  
  async purchaseResaleTicket(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { listingId, paymentMethodId } = req.body;
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      const buyerId = req.user.id;
      
      // Get listing details (mock for now)
      const listing = {
        id: listingId,
        sellerId: 'seller123',
        price: 150,
        venueRoyaltyPercentage: 10,
        ticketId: 'ticket123'
      };
      
      // Create escrow
      const escrow = await this.escrowService.createEscrow(
        listing as any,
        buyerId,
        paymentMethodId
      );
      
      // Fund escrow (charge buyer)
      await this.escrowService.fundEscrow(escrow.id);
      
      res.json({
        success: true,
        escrow,
        message: 'Payment held in escrow. Transfer will complete after NFT transfer.'
      });
    } catch (error) {
      return next(error);
    }
  }
  
  async confirmTransfer(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { escrowId } = req.params;
      
      // In production, verify NFT transfer on blockchain
      // For now, simulate transfer confirmation
      
      // Release escrow funds
      await this.escrowService.releaseEscrow(escrowId);
      
      res.json({
        success: true,
        message: 'Transfer confirmed and funds released'
      });
    } catch (error) {
      return next(error);
    }
  }
  
  async getRoyaltyReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { venueId } = req.params;
      const { startDate, endDate } = req.query;
      
      // Verify venue access
      if (!req.user) return res.status(401).json({ error: "Authentication required" });
      if (!req.user.venues?.includes(venueId) && !req.user.isAdmin) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }
      
      const report = await this.royaltySplitter.getRoyaltyReport(
        venueId,
        new Date(startDate as string),
        new Date(endDate as string)
      );
      
      res.json(report);
    } catch (error) {
      return next(error);
    }
  }
  
  async getPricingAnalytics(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { venueId } = req.params;
      
      const analytics = await this.priceEnforcer.getPricingAnalytics(venueId);
      
      res.json(analytics);
    } catch (error) {
      return next(error);
    }
  }
}
