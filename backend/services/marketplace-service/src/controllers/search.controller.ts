import { FastifyRequest, FastifyReply } from 'fastify';
import { listingService } from '../services/listing.service';

export class SearchController {
  async searchListings(request: FastifyRequest, reply: FastifyReply) {
    try {
      const {
        eventId,
        venueId,
        minPrice,
        maxPrice,
        sortBy = 'price',
        sortOrder = 'asc',
        limit = 20,
        offset = 0,
      } = request.query as any;

      const listings = await listingService.searchListings({
        eventId: eventId as string,
        venueId: venueId as string,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
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

  async getPriceRange(_request: FastifyRequest, reply: FastifyReply) {
    try {
      // This would query the database for min/max prices
      const priceRange = {
        min: 50,
        max: 500,
        average: 150,
        median: 125,
      };

      reply.send({
        success: true,
        data: priceRange,
      });
    } catch (error) {
      throw error;
    }
  }

  async getCategories(_request: FastifyRequest, reply: FastifyReply) {
    try {
      // This would return event categories
      const categories = [
        { id: 'concert', name: 'Concerts', count: 150 },
        { id: 'sports', name: 'Sports', count: 230 },
        { id: 'theater', name: 'Theater', count: 80 },
        { id: 'comedy', name: 'Comedy', count: 45 },
      ];

      reply.send({
        success: true,
        data: categories,
      });
    } catch (error) {
      throw error;
    }
  }

  async getRecommended(_request: FastifyRequest, reply: FastifyReply) {
    try {
      reply.send({ recommendations: [] });
    } catch (error) {
      throw error;
    }
  }

  async getWatchlist(_request: FastifyRequest, reply: FastifyReply) {
    try {
      reply.send({ watchlist: [] });
    } catch (error) {
      throw error;
    }
  }
}

export const searchController = new SearchController();
