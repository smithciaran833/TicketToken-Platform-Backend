import { Request, Response, NextFunction } from 'express';
import { listingService } from '../services/listing.service';

export class SearchController {
  async searchListings(req: Request, res: Response, next: NextFunction) {
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
      } = req.query;

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

      res.json({
        success: true,
        data: listings,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getPriceRange(_req: Request, res: Response, next: NextFunction) {
    try {
      // This would query the database for min/max prices
      const priceRange = {
        min: 50,
        max: 500,
        average: 150,
        median: 125,
      };

      res.json({
        success: true,
        data: priceRange,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCategories(_req: Request, res: Response, next: NextFunction) {
    try {
      // This would return event categories
      const categories = [
        { id: 'concert', name: 'Concerts', count: 150 },
        { id: 'sports', name: 'Sports', count: 230 },
        { id: 'theater', name: 'Theater', count: 80 },
        { id: 'comedy', name: 'Comedy', count: 45 },
      ];

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecommended(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ recommendations: [] });
    } catch (error) {
      next(error);
    }
  }

  async getWatchlist(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ watchlist: [] });
    } catch (error) {
      next(error);
    }
  }
}

export const searchController = new SearchController();
