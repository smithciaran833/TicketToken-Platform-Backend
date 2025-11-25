import { FastifyReply } from 'fastify';
import { WalletRequest } from '../middleware/wallet.middleware';
import { listingService } from '../services/listing.service';
import { auditService } from '@tickettoken/shared';

export class ListingController {
  async createListing(request: WalletRequest, reply: FastifyReply) {
    try {
      const body = request.body as any;
      const listing = await listingService.createListing({
        ...body,
        sellerId: request.user!.id,
        walletAddress: request.wallet!.address,
      });

      // Audit log: Listing creation
      await auditService.logAction({
        service: 'marketplace-service',
        action: 'create_listing',
        actionType: 'CREATE',
        userId: request.user!.id,
        resourceType: 'listing',
        resourceId: listing.id,
        newValue: {
          price: body.price,
          ticketId: body.ticketId,
          eventId: body.eventId,
        },
        metadata: {
          walletAddress: request.wallet!.address,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: true,
      });

      reply.status(201).send({
        success: true,
        data: listing,
      });
    } catch (error) {
      throw error;
    }
  }

  async updateListingPrice(request: WalletRequest, reply: FastifyReply) {
    try {
      const params = request.params as { id: string };
      const body = request.body as { price: number };

      // Get current listing for audit log
      const currentListing = await listingService.getListingById(params.id);

      if (!currentListing) {
        return reply.status(404).send({
          success: false,
          error: 'Listing not found',
        });
      }

      const listing = await listingService.updateListingPrice({
        listingId: params.id,
        newPrice: body.price,
        userId: request.user!.id,
      });

      if (!listing) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to update listing',
        });
      }

      // Audit log: Price change (CRITICAL for fraud detection)
      await auditService.logAction({
        service: 'marketplace-service',
        action: 'update_listing_price',
        actionType: 'UPDATE',
        userId: request.user!.id,
        resourceType: 'listing',
        resourceId: params.id,
        previousValue: {
          price: currentListing.price,
        },
        newValue: {
          price: body.price,
        },
        metadata: {
          priceChange: body.price - currentListing.price,
          priceChangePercentage: ((body.price - currentListing.price) / currentListing.price) * 100,
          eventId: currentListing.eventId,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: true,
      });

      reply.send({
        success: true,
        data: listing,
      });
    } catch (error) {
      // Audit log: Failed price update
      await auditService.logAction({
        service: 'marketplace-service',
        action: 'update_listing_price',
        actionType: 'UPDATE',
        userId: request.user!.id,
        resourceType: 'listing',
        resourceId: (request.params as any).id,
        metadata: {
          attemptedPrice: (request.body as any).price,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  async cancelListing(request: WalletRequest, reply: FastifyReply) {
    try {
      const params = request.params as { id: string };

      const listing = await listingService.cancelListing(params.id, request.user!.id);

      if (!listing) {
        return reply.status(404).send({
          success: false,
          error: 'Listing not found',
        });
      }

      // Audit log: Listing cancellation
      await auditService.logAction({
        service: 'marketplace-service',
        action: 'cancel_listing',
        actionType: 'DELETE',
        userId: request.user!.id,
        resourceType: 'listing',
        resourceId: params.id,
        previousValue: {
          status: 'active',
          price: listing.price,
        },
        newValue: {
          status: 'cancelled',
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: true,
      });

      reply.send({
        success: true,
        data: listing,
      });
    } catch (error) {
      throw error;
    }
  }

  async getListing(request: WalletRequest, reply: FastifyReply) {
    try {
      const params = request.params as { id: string };
      const listing = await listingService.getListingById(params.id);

      reply.send({
        success: true,
        data: listing,
      });
    } catch (error) {
      throw error;
    }
  }

  async getMyListings(request: WalletRequest, reply: FastifyReply) {
    try {
      const query = request.query as { status?: string; limit?: number; offset?: number };
      const status = query.status || 'active';
      const limit = query.limit || 20;
      const offset = query.offset || 0;

      const listings = await listingService.searchListings({
        sellerId: request.user!.id,
        status: status as string,
        limit: Number(limit),
        offset: Number(offset),
      });

      reply.send({
        success: true,
        data: listings,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      throw error;
    }
  }

  async getEventListings(request: WalletRequest, reply: FastifyReply) {
    try {
      const params = request.params as { eventId: string };
      const query = request.query as { limit?: number; offset?: number };
      const limit = query.limit || 20;
      const offset = query.offset || 0;

      const listings = await listingService.searchListings({
        eventId: params.eventId,
        status: 'active',
        limit: Number(limit),
        offset: Number(offset),
      });

      reply.send({
        success: true,
        data: listings,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      throw error;
    }
  }
}

export const listingController = new ListingController();
