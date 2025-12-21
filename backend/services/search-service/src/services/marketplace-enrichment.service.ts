import { Knex } from 'knex';
import pino from 'pino';
import { EnrichedMarketplaceListing } from '../types/enriched-documents';

/**
 * Marketplace Enrichment Service
 * Pulls data from PostgreSQL (marketplace_listings, tickets, events, venues, users, offers)
 * to create fully enriched marketplace listing documents for Elasticsearch
 */
export class MarketplaceEnrichmentService {
  private db: Knex;
  private logger: pino.Logger;

  constructor({ db, logger }: any) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Enrich a single marketplace listing with full PostgreSQL data
   */
  async enrich(listingId: string): Promise<EnrichedMarketplaceListing> {
    try {
      // Get marketplace listing
      const listing = await this.db('marketplace_listings')
        .where({ id: listingId })
        .first();

      if (!listing) {
        throw new Error(`Marketplace listing not found: ${listingId}`);
      }

      // Get ticket data
      const ticket = await this.db('tickets')
        .where({ id: listing.ticket_id })
        .first();

      // Get event data
      const event = await this.db('events')
        .where({ id: listing.event_id || ticket?.event_id })
        .first();

      // Get venue data
      const venue = await this.db('venues')
        .where({ id: listing.venue_id || event?.venue_id })
        .first();

      // Get seller data
      const seller = await this.db('users')
        .where({ id: listing.seller_id })
        .first();

      // Get seller stats
      const sellerStats = await this.db('marketplace_listings')
        .where({ seller_id: listing.seller_id, status: 'completed' })
        .select(
          this.db.raw('COUNT(*) as total_sales'),
          this.db.raw('AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_response_time')
        )
        .first();

      // Get buyer data if sold
      let buyer: any = null;
      if (listing.buyer_id) {
        buyer = await this.db('users')
          .where({ id: listing.buyer_id })
          .first();
      }

      // Get offers
      let offers: any[] = [];
      try {
        offers = await this.db('marketplace_offers')
          .where({ listing_id: listingId })
          .orderBy('created_at', 'desc');
      } catch (error) {
        // Table may not exist
      }

      // Get NFT/blockchain data if applicable
      let nftData: any = null;
      if (ticket?.nft_id) {
        nftData = await this.db('nfts')
          .where({ id: ticket.nft_id })
          .first();
      }

      // Calculate days until event
      const eventDate = new Date(event?.date || event?.event_date);
      const daysUntilEvent = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      // Build enriched marketplace listing document
      const enriched: EnrichedMarketplaceListing = {
        listingId: listing.id,
        ticketId: listing.ticket_id,
        eventId: listing.event_id || ticket?.event_id,
        venueId: listing.venue_id || event?.venue_id,
        sellerId: listing.seller_id,
        buyerId: listing.buyer_id,
        transactionId: listing.transaction_id,

        price: listing.price,
        originalPrice: ticket?.original_price || listing.original_price,
        finalPrice: listing.final_price,
        currency: listing.currency || 'USD',

        status: listing.status || 'active',
        listingType: listing.listing_type || 'standard',
        deliveryMethod: listing.delivery_method || 'digital',

        event: {
          name: event?.name || event?.title || '',
          date: eventDate,
          category: event?.category || 'other',
          subcategory: event?.subcategory,
          popularity: event?.popularity_score || 0,
          daysUntilEvent
        },

        ticket: {
          section: ticket?.section || '',
          row: ticket?.row,
          seat: ticket?.seat,
          type: ticket?.ticket_type || ticket?.type || 'standard',
          quantity: listing.quantity || 1,
          grouping: listing.grouping,
          transferable: ticket?.is_transferable ?? true,
          verified: ticket?.verified || false
        },

        venue: {
          name: venue?.name || '',
          city: venue?.address?.city || venue?.city || '',
          state: venue?.address?.state || venue?.state || '',
          country: venue?.address?.country || venue?.country || 'USA',
          location: venue?.location
            ? { lat: venue.location.lat || venue.location.latitude, lon: venue.location.lon || venue.location.longitude }
            : undefined,
          timezone: venue?.timezone
        },

        seller: {
          username: seller?.username || seller?.email || 'Anonymous',
          reputation: seller?.reputation_score || 0,
          totalSales: sellerStats?.total_sales || 0,
          totalReviews: seller?.total_reviews || 0,
          responseTime: sellerStats?.avg_response_time || 0,
          responseRate: seller?.response_rate || 0,
          verified: seller?.verified || false,
          powerSeller: seller?.power_seller || false,
          joinDate: seller?.created_at
        },

        buyer: buyer ? {
          protection: true,
          guaranteeExpires: listing.buyer_protection_expires
        } : undefined,

        pricing: {
          listPrice: listing.price,
          fees: listing.fees || 0,
          royalties: listing.royalties || 0,
          taxes: listing.taxes || 0,
          shipping: listing.shipping_cost || 0,
          total: listing.total_price || listing.price,
          priceHistory: [],
          comparablePrice: listing.comparable_price,
          marketPrice: listing.market_price,
          pricePercentile: listing.price_percentile,
          discount: listing.discount_amount ? {
            amount: listing.discount_amount,
            percentage: listing.discount_percentage,
            code: listing.discount_code
          } : undefined
        },

        offers: offers.map(o => ({
          offerId: o.id,
          buyerId: o.buyer_id,
          amount: o.amount,
          message: o.message,
          status: o.status || 'pending',
          createdAt: o.created_at,
          expiresAt: o.expires_at,
          respondedAt: o.responded_at,
          counterOffer: o.counter_offer
        })),

        blockchain: nftData ? {
          nftId: nftData.id,
          contractAddress: nftData.contract_address,
          tokenId: nftData.token_id,
          chainId: nftData.chain_id,
          network: nftData.network || 'solana',
          escrowAddress: listing.escrow_address,
          transactionHash: listing.transaction_hash,
          blockNumber: listing.block_number,
          mintDate: nftData.created_at
        } : undefined,

        analytics: {
          views: listing.view_count || 0,
          uniqueViews: listing.unique_view_count || 0,
          watchers: listing.watch_count || 0,
          shares: listing.share_count || 0,
          favorites: listing.favorite_count || 0,
          clickThroughRate: listing.click_through_rate || 0,
          conversionRate: listing.conversion_rate || 0,
          averageViewTime: listing.average_view_time || 0,
          lastViewedAt: listing.last_viewed_at
        },

        recommendations: {
          score: this.calculateRecommendationScore(listing, seller, daysUntilEvent),
          reasons: this.getRecommendationReasons(listing, seller, daysUntilEvent),
          algorithm: 'v1'
        },

        compliance: {
          amlCheck: listing.aml_check || false,
          kycVerified: seller?.kyc_verified || false,
          riskScore: listing.risk_score || 0,
          flagged: listing.flagged || false
        },

        shipping: listing.requires_shipping ? {
          method: listing.shipping_method,
          carrier: listing.shipping_carrier,
          trackingNumber: listing.tracking_number,
          cost: listing.shipping_cost,
          estimatedDays: listing.estimated_delivery_days,
          shippedAt: listing.shipped_at
        } : undefined,

        metadata: {
          source: listing.source,
          affiliate: listing.affiliate_code,
          campaign: listing.campaign_id,
          referrer: listing.referrer
        },

        tags: listing.tags || [],
        flags: listing.flags || [],
        urgency: this.calculateUrgency(daysUntilEvent, listing),
        featured: listing.featured || false,
        promoted: listing.promoted || false,
        spotlight: listing.spotlight || false,
        qualityScore: this.calculateQualityScore(listing, seller, ticket),

        createdAt: listing.created_at,
        updatedAt: listing.updated_at,
        publishedAt: listing.published_at,
        expiresAt: listing.expires_at,
        soldAt: listing.sold_at,
        deliveredAt: listing.delivered_at,
        completedAt: listing.completed_at,
        searchBoost: this.calculateSearchBoost(listing, seller, daysUntilEvent)
      };

      return enriched;
    } catch (error) {
      this.logger.error({ error, listingId }, 'Failed to enrich marketplace listing');
      throw error;
    }
  }

  /**
   * Bulk enrich multiple marketplace listings
   */
  async bulkEnrich(listingIds: string[]): Promise<EnrichedMarketplaceListing[]> {
    const enriched: EnrichedMarketplaceListing[] = [];

    for (const listingId of listingIds) {
      try {
        const listing = await this.enrich(listingId);
        enriched.push(listing);
      } catch (error) {
        this.logger.error({ error, listingId }, 'Failed to enrich marketplace listing in bulk');
        // Continue with other listings
      }
    }

    return enriched;
  }

  /**
   * Calculate recommendation score
   */
  private calculateRecommendationScore(listing: any, seller: any, daysUntilEvent: number): number {
    let score = 50; // Base score

    // Seller reputation
    if (seller?.reputation_score) {
      score += seller.reputation_score * 10;
    }

    // Price competitiveness
    if (listing.price_percentile) {
      if (listing.price_percentile <= 25) score += 20;
      else if (listing.price_percentile <= 50) score += 10;
    }

    // Time urgency
    if (daysUntilEvent > 0 && daysUntilEvent <= 7) {
      score += 15;
    } else if (daysUntilEvent > 0 && daysUntilEvent <= 30) {
      score += 10;
    }

    // Verified ticket
    if (listing.verified) {
      score += 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Get recommendation reasons
   */
  private getRecommendationReasons(listing: any, seller: any, daysUntilEvent: number): string[] {
    const reasons: string[] = [];

    if (seller?.power_seller) reasons.push('power_seller');
    if (seller?.reputation_score >= 4.5) reasons.push('highly_rated_seller');
    if (listing.price_percentile <= 25) reasons.push('great_price');
    if (daysUntilEvent > 0 && daysUntilEvent <= 7) reasons.push('happening_soon');
    if (listing.verified) reasons.push('verified_ticket');
    if (listing.view_count > 100) reasons.push('popular_listing');

    return reasons;
  }

  /**
   * Calculate urgency level
   */
  private calculateUrgency(daysUntilEvent: number, listing: any): string {
    if (daysUntilEvent <= 1) return 'critical';
    if (daysUntilEvent <= 3) return 'high';
    if (daysUntilEvent <= 7) return 'medium';
    if (daysUntilEvent <= 30) return 'low';
    return 'none';
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(listing: any, seller: any, ticket: any): number {
    let score = 50;

    // Listing completeness
    if (listing.description) score += 10;
    if (listing.images?.length > 0) score += 10;
    if (listing.delivery_method) score += 5;

    // Seller quality
    if (seller?.verified) score += 10;
    if (seller?.power_seller) score += 10;
    if (seller?.reputation_score >= 4.0) score += 5;

    // Ticket quality
    if (ticket?.verified) score += 10;
    if (ticket?.qr_code) score += 5;

    return Math.min(100, score);
  }

  /**
   * Calculate search boost
   */
  private calculateSearchBoost(listing: any, seller: any, daysUntilEvent: number): number {
    let boost = 1.0;

    // Featured/promoted listings
    if (listing.featured) boost += 0.5;
    if (listing.promoted) boost += 0.3;
    if (listing.spotlight) boost += 0.4;

    // Seller reputation
    if (seller?.power_seller) boost += 0.3;
    if (seller?.reputation_score >= 4.5) boost += 0.2;

    // Price competitiveness
    if (listing.price_percentile <= 25) boost += 0.2;

    // Time urgency
    if (daysUntilEvent > 0 && daysUntilEvent <= 7) {
      boost += 0.3;
    } else if (daysUntilEvent > 0 && daysUntilEvent <= 30) {
      boost += 0.15;
    }

    // Engagement
    if (listing.view_count > 100) boost += 0.1;
    if (listing.watch_count > 10) boost += 0.1;

    return boost;
  }
}
