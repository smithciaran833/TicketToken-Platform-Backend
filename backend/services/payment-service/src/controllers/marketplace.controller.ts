import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
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

  async createListing(request: FastifyRequest, reply: FastifyReply) {
    const { ticketId, price, venueId } = request.body as any;
    const user = (request as any).user;
    
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    
    const userId = user.id;

    // Validate price
    const priceValidation = await this.priceEnforcer.validateListingPrice(
      ticketId,
      price,
      venueId
    );

    if (!priceValidation.valid) {
      return reply.status(400).send({
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

    return reply.status(201).send({
      success: true,
      listing,
      priceInfo: priceValidation
    });
  }

  async purchaseResaleTicket(request: FastifyRequest, reply: FastifyReply) {
    const { listingId, paymentMethodId } = request.body as any;
    const user = (request as any).user;
    
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    
    const buyerId = user.id;

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

    return reply.send({
      success: true,
      escrow,
      message: 'Payment held in escrow. Transfer will complete after NFT transfer.'
    });
  }

  async confirmTransfer(request: FastifyRequest, reply: FastifyReply) {
    const { escrowId } = request.params as any;

    // In production, verify NFT transfer on blockchain
    // For now, simulate transfer confirmation

    // Release escrow funds
    await this.escrowService.releaseEscrow(escrowId);

    return reply.send({
      success: true,
      message: 'Transfer confirmed and funds released'
    });
  }

  async getRoyaltyReport(request: FastifyRequest, reply: FastifyReply) {
    const { venueId } = request.params as any;
    const { startDate, endDate } = request.query as any;
    const user = (request as any).user;

    // Verify venue access
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }
    
    if (!user.venues?.includes(venueId) && !user.isAdmin) {
      return reply.status(403).send({
        error: 'Access denied'
      });
    }

    const report = await this.royaltySplitter.getRoyaltyReport(
      venueId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    return reply.send(report);
  }

  async getPricingAnalytics(request: FastifyRequest, reply: FastifyReply) {
    const { venueId } = request.params as any;

    const analytics = await this.priceEnforcer.getPricingAnalytics(venueId);

    return reply.send(analytics);
  }
}
