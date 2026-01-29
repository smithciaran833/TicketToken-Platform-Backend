import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { VenueBalanceService } from '../services/core';

export class VenueController {
  private venueBalanceService: VenueBalanceService;

  constructor() {
    this.venueBalanceService = new VenueBalanceService();
  }

  async getBalance(request: FastifyRequest, reply: FastifyReply) {
    const { venueId } = request.params as any;
    const user = (request as any).user;
    const tenantId = (request as any).tenantId;

    // Verify venue access
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    if (!user.venues?.includes(venueId) && !user.isAdmin) {
      return reply.status(403).send({
        error: 'Access denied'
      });
    }

    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant context required' });
    }

    const balance = await this.venueBalanceService.getBalance(venueId);
    const payoutInfo = await this.venueBalanceService.calculatePayoutAmount(venueId, tenantId);

    return reply.send({
      balance,
      payoutInfo
    });
  }

  async requestPayout(request: FastifyRequest, reply: FastifyReply) {
    const { venueId } = request.params as any;
    const { amount, instant } = request.body as any;
    const user = (request as any).user;
    const tenantId = (request as any).tenantId;

    // Verify venue access
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    if (!user.venues?.includes(venueId) && !user.isAdmin) {
      return reply.status(403).send({
        error: 'Access denied'
      });
    }

    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant context required' });
    }

    await this.venueBalanceService.processPayout(venueId, tenantId, amount);

    return reply.send({
      success: true,
      message: 'Payout initiated',
      amount,
      type: instant ? 'instant' : 'standard',
      estimatedArrival: instant ? 'Within 30 minutes' : '1-2 business days'
    });
  }

  async getPayoutHistory(request: FastifyRequest, reply: FastifyReply) {
    const { venueId } = request.params as any;
    const { limit = 50, offset = 0 } = request.query as any;
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

    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant context required' });
    }

    const history = await this.venueBalanceService.getPayoutHistory(
      venueId,
      tenantId,
      parseInt(limit as string) || 50,
      parseInt(offset as string) || 0
    );

    return reply.send({
      venueId,
      ...history
    });
  }
}
