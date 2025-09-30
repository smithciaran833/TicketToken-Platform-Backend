import { Response, NextFunction } from 'express';
import { WalletRequest } from '../middleware/wallet.middleware';
import { listingService } from '../services/listing.service';

export class ListingController {
  async createListing(req: WalletRequest, res: Response, next: NextFunction) {
    try {
      const listing = await listingService.createListing({
        ...req.body,
        sellerId: req.user!.id,
        walletAddress: req.wallet!.address,
      });

      res.status(201).json({
        success: true,
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateListingPrice(req: WalletRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { price } = req.body;

      const listing = await listingService.updateListingPrice({
        listingId: id,
        newPrice: price,
        userId: req.user!.id,
      });

      res.json({
        success: true,
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelListing(req: WalletRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const listing = await listingService.cancelListing(id, req.user!.id);

      res.json({
        success: true,
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  }

  async getListing(req: WalletRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const listing = await listingService.getListingById(id);

      res.json({
        success: true,
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyListings(req: WalletRequest, res: Response, next: NextFunction) {
    try {
      const { status = 'active', limit = 20, offset = 0 } = req.query;

      const listings = await listingService.searchListings({
        sellerId: req.user!.id,
        status: status as string,
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

  async getEventListings(req: WalletRequest, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const listings = await listingService.searchListings({
        eventId,
        status: 'active',
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
}

export const listingController = new ListingController();
