import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'VenueSettingsController' });

interface VenueSettingsParams {
  venueId: string;
}

interface UpdateSettingsBody {
  maxResaleMultiplier?: number;
  minPriceMultiplier?: number;
  allowBelowFace?: boolean;
  transferCutoffHours?: number;
  listingAdvanceHours?: number;
  requireListingApproval?: boolean;
  autoApproveVerifiedSellers?: boolean;
  royaltyPercentage?: number;
  royaltyWalletAddress?: string;
  minimumRoyaltyPayout?: number;
  allowInternationalSales?: boolean;
  blockedCountries?: string[];
  requireKycForHighValue?: boolean;
  highValueThreshold?: number;
}

interface ListingsQuery {
  status?: string;
  limit?: string;
  offset?: string;
}

interface SalesReportQuery {
  startDate?: string;
  endDate?: string;
}

class VenueSettingsController {
  /**
   * Get venue marketplace settings
   * FIX #3: Implemented actual database query
   */
  async getSettings(request: FastifyRequest<{ Params: VenueSettingsParams }>, reply: FastifyReply) {
    try {
      const { venueId } = request.params;

      if (!venueId) {
        return reply.status(400).send({ error: 'Venue ID is required' });
      }

      const settings = await db('venue_marketplace_settings')
        .where({ venue_id: venueId })
        .first();

      if (!settings) {
        return reply.status(404).send({ error: 'Venue settings not found' });
      }

      reply.send({
        success: true,
        settings: {
          venueId: settings.venue_id,
          maxResaleMultiplier: parseFloat(settings.max_resale_multiplier),
          minPriceMultiplier: parseFloat(settings.min_price_multiplier),
          allowBelowFace: settings.allow_below_face,
          transferCutoffHours: settings.transfer_cutoff_hours,
          listingAdvanceHours: settings.listing_advance_hours,
          requireListingApproval: settings.require_listing_approval,
          autoApproveVerifiedSellers: settings.auto_approve_verified_sellers,
          royaltyPercentage: parseFloat(settings.royalty_percentage),
          royaltyWalletAddress: settings.royalty_wallet_address,
          minimumRoyaltyPayout: settings.minimum_royalty_payout,
          allowInternationalSales: settings.allow_international_sales,
          blockedCountries: settings.blocked_countries,
          requireKycForHighValue: settings.require_kyc_for_high_value,
          highValueThreshold: settings.high_value_threshold,
          createdAt: settings.created_at,
          updatedAt: settings.updated_at
        }
      });
    } catch (error: any) {
      log.error('Error getting venue settings', { error: error.message });
      throw error;
    }
  }

  /**
   * Update venue marketplace settings
   * FIX #3: Implemented actual database update
   */
  async updateSettings(
    request: FastifyRequest<{ Params: VenueSettingsParams; Body: UpdateSettingsBody }>,
    reply: FastifyReply
  ) {
    try {
      const { venueId } = request.params;
      const body = request.body;

      if (!venueId) {
        return reply.status(400).send({ error: 'Venue ID is required' });
      }

      // Check if settings exist
      const existingSettings = await db('venue_marketplace_settings')
        .where({ venue_id: venueId })
        .first();

      if (!existingSettings) {
        return reply.status(404).send({ error: 'Venue settings not found' });
      }

      // Build update object with only provided fields
      const updateData: Record<string, any> = {
        updated_at: new Date()
      };

      if (body.maxResaleMultiplier !== undefined) {
        if (body.maxResaleMultiplier < 1.0 || body.maxResaleMultiplier > 10.0) {
          return reply.status(400).send({ error: 'maxResaleMultiplier must be between 1.0 and 10.0' });
        }
        updateData.max_resale_multiplier = body.maxResaleMultiplier;
      }

      if (body.minPriceMultiplier !== undefined) {
        if (body.minPriceMultiplier < 0.1 || body.minPriceMultiplier > 1.0) {
          return reply.status(400).send({ error: 'minPriceMultiplier must be between 0.1 and 1.0' });
        }
        updateData.min_price_multiplier = body.minPriceMultiplier;
      }

      if (body.allowBelowFace !== undefined) {
        updateData.allow_below_face = body.allowBelowFace;
      }

      if (body.transferCutoffHours !== undefined) {
        if (body.transferCutoffHours < 0 || body.transferCutoffHours > 168) {
          return reply.status(400).send({ error: 'transferCutoffHours must be between 0 and 168 (7 days)' });
        }
        updateData.transfer_cutoff_hours = body.transferCutoffHours;
      }

      if (body.listingAdvanceHours !== undefined) {
        if (body.listingAdvanceHours < 0 || body.listingAdvanceHours > 8760) {
          return reply.status(400).send({ error: 'listingAdvanceHours must be between 0 and 8760 (1 year)' });
        }
        updateData.listing_advance_hours = body.listingAdvanceHours;
      }

      if (body.requireListingApproval !== undefined) {
        updateData.require_listing_approval = body.requireListingApproval;
      }

      if (body.autoApproveVerifiedSellers !== undefined) {
        updateData.auto_approve_verified_sellers = body.autoApproveVerifiedSellers;
      }

      if (body.royaltyPercentage !== undefined) {
        if (body.royaltyPercentage < 0 || body.royaltyPercentage > 20.0) {
          return reply.status(400).send({ error: 'royaltyPercentage must be between 0 and 20.0' });
        }
        updateData.royalty_percentage = body.royaltyPercentage;
      }

      if (body.royaltyWalletAddress !== undefined) {
        // Basic Solana address validation (44 characters, base58)
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.royaltyWalletAddress)) {
          return reply.status(400).send({ error: 'Invalid royalty wallet address format' });
        }
        updateData.royalty_wallet_address = body.royaltyWalletAddress;
      }

      if (body.minimumRoyaltyPayout !== undefined) {
        if (body.minimumRoyaltyPayout < 0) {
          return reply.status(400).send({ error: 'minimumRoyaltyPayout must be non-negative' });
        }
        updateData.minimum_royalty_payout = body.minimumRoyaltyPayout;
      }

      if (body.allowInternationalSales !== undefined) {
        updateData.allow_international_sales = body.allowInternationalSales;
      }

      if (body.blockedCountries !== undefined) {
        updateData.blocked_countries = body.blockedCountries;
      }

      if (body.requireKycForHighValue !== undefined) {
        updateData.require_kyc_for_high_value = body.requireKycForHighValue;
      }

      if (body.highValueThreshold !== undefined) {
        if (body.highValueThreshold < 0) {
          return reply.status(400).send({ error: 'highValueThreshold must be non-negative' });
        }
        updateData.high_value_threshold = body.highValueThreshold;
      }

      // Perform update
      await db('venue_marketplace_settings')
        .where({ venue_id: venueId })
        .update(updateData);

      log.info('Venue settings updated', { venueId, updatedFields: Object.keys(updateData) });

      reply.send({ success: true, message: 'Settings updated successfully' });
    } catch (error: any) {
      log.error('Error updating venue settings', { error: error.message });
      throw error;
    }
  }

  /**
   * Get listings for a venue
   * FIX #3: Implemented actual database query with pagination
   */
  async getVenueListings(
    request: FastifyRequest<{ Params: VenueSettingsParams; Querystring: ListingsQuery }>,
    reply: FastifyReply
  ) {
    try {
      const { venueId } = request.params;
      const { status, limit = '50', offset = '0' } = request.query;

      if (!venueId) {
        return reply.status(400).send({ error: 'Venue ID is required' });
      }

      // Validate pagination params
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

      let query = db('marketplace_listings')
        .where({ venue_id: venueId })
        .whereNull('deleted_at');

      if (status) {
        query = query.where({ status });
      }

      // Get total count for pagination
      const [{ count }] = await db('marketplace_listings')
        .where({ venue_id: venueId })
        .whereNull('deleted_at')
        .modify((qb) => {
          if (status) qb.where({ status });
        })
        .count('id as count');

      // Get listings with pagination
      const listings = await query
        .select(
          'id',
          'ticket_id',
          'seller_id',
          'event_id',
          'price',
          'original_face_value',
          'price_multiplier',
          'status',
          'listed_at',
          'expires_at',
          'view_count',
          'favorite_count',
          'accepts_fiat_payment',
          'accepts_crypto_payment',
          'created_at'
        )
        .orderBy('created_at', 'desc')
        .limit(limitNum)
        .offset(offsetNum);

      reply.send({
        success: true,
        listings: listings.map(l => ({
          id: l.id,
          ticketId: l.ticket_id,
          sellerId: l.seller_id,
          eventId: l.event_id,
          price: l.price, // INTEGER CENTS
          originalFaceValue: l.original_face_value,
          priceMultiplier: parseFloat(l.price_multiplier || '1.0'),
          status: l.status,
          listedAt: l.listed_at,
          expiresAt: l.expires_at,
          viewCount: l.view_count,
          favoriteCount: l.favorite_count,
          acceptsFiatPayment: l.accepts_fiat_payment,
          acceptsCryptoPayment: l.accepts_crypto_payment,
          createdAt: l.created_at
        })),
        pagination: {
          total: parseInt(String(count), 10),
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < parseInt(String(count), 10)
        }
      });
    } catch (error: any) {
      log.error('Error getting venue listings', { error: error.message });
      throw error;
    }
  }

  /**
   * Get sales report for a venue
   * FIX #3: Implemented actual database aggregation
   */
  async getSalesReport(
    request: FastifyRequest<{ Params: VenueSettingsParams; Querystring: SalesReportQuery }>,
    reply: FastifyReply
  ) {
    try {
      const { venueId } = request.params;
      const { startDate, endDate } = request.query;

      if (!venueId) {
        return reply.status(400).send({ error: 'Venue ID is required' });
      }

      // Default to last 30 days if no dates provided
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get completed transfers for the venue
      const salesData = await db('marketplace_transfers')
        .where({ venue_id: venueId, status: 'completed' })
        .whereBetween('completed_at', [start, end])
        .select(
          db.raw('COUNT(*) as total_sales'),
          db.raw('SUM(usd_value) as total_volume'),
          db.raw('AVG(usd_value) as avg_sale_price'),
          db.raw('MIN(usd_value) as min_sale_price'),
          db.raw('MAX(usd_value) as max_sale_price')
        )
        .first();

      // Get fee data
      const feeData = await db('platform_fees')
        .join('marketplace_transfers', 'platform_fees.transfer_id', 'marketplace_transfers.id')
        .where('marketplace_transfers.venue_id', venueId)
        .where('marketplace_transfers.status', 'completed')
        .whereBetween('marketplace_transfers.completed_at', [start, end])
        .select(
          db.raw('SUM(platform_fees.venue_fee_amount) as total_venue_fees'),
          db.raw('SUM(platform_fees.platform_fee_amount) as total_platform_fees')
        )
        .first();

      // Get daily breakdown
      const dailyBreakdown = await db('marketplace_transfers')
        .where({ venue_id: venueId, status: 'completed' })
        .whereBetween('completed_at', [start, end])
        .select(
          db.raw("DATE(completed_at) as date"),
          db.raw('COUNT(*) as sales_count'),
          db.raw('SUM(usd_value) as volume')
        )
        .groupByRaw('DATE(completed_at)')
        .orderBy('date', 'asc');

      reply.send({
        success: true,
        report: {
          venueId,
          period: {
            start: start.toISOString(),
            end: end.toISOString()
          },
          summary: {
            totalSales: parseInt(salesData?.total_sales || '0', 10),
            totalVolume: parseInt(salesData?.total_volume || '0', 10), // INTEGER CENTS
            avgSalePrice: parseInt(salesData?.avg_sale_price || '0', 10), // INTEGER CENTS
            minSalePrice: parseInt(salesData?.min_sale_price || '0', 10), // INTEGER CENTS
            maxSalePrice: parseInt(salesData?.max_sale_price || '0', 10), // INTEGER CENTS
            totalVenueFees: parseInt(feeData?.total_venue_fees || '0', 10), // INTEGER CENTS
            totalPlatformFees: parseInt(feeData?.total_platform_fees || '0', 10) // INTEGER CENTS
          },
          dailyBreakdown: dailyBreakdown.map(d => ({
            date: d.date,
            salesCount: parseInt(d.sales_count, 10),
            volume: parseInt(d.volume || '0', 10) // INTEGER CENTS
          }))
        }
      });
    } catch (error: any) {
      log.error('Error getting sales report', { error: error.message });
      throw error;
    }
  }
}

export const venueSettingsController = new VenueSettingsController();
