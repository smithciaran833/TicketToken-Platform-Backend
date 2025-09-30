import { db } from '../config/database';

export interface VenueMarketplaceSettings {
  venueId: string;
  maxResaleMultiplier: number;      // DECIMAL (3.0 = 300%)
  minPriceMultiplier: number;       // DECIMAL (1.0 = 100%)
  allowBelowFace: boolean;
  transferCutoffHours: number;
  listingAdvanceHours: number;
  autoExpireOnEventStart: boolean;
  maxListingsPerUserPerEvent: number;
  maxListingsPerUserTotal: number;
  requireListingApproval: boolean;
  autoApproveVerifiedSellers: boolean;
  royaltyPercentage: number;        // DECIMAL (5.00 = 5%)
  royaltyWalletAddress: string;
  minimumRoyaltyPayout: number;     // INTEGER CENTS
  allowInternationalSales: boolean;
  blockedCountries: string[];
  requireKycForHighValue: boolean;
  highValueThreshold: number;       // INTEGER CENTS
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVenueSettingsInput {
  venueId: string;
  royaltyWalletAddress: string;
  maxResaleMultiplier?: number;
  minPriceMultiplier?: number;
  allowBelowFace?: boolean;
  transferCutoffHours?: number;
  listingAdvanceHours?: number;
  maxListingsPerUserPerEvent?: number;
  maxListingsPerUserTotal?: number;
  requireListingApproval?: boolean;
  royaltyPercentage?: number;
}

export interface UpdateVenueSettingsInput {
  maxResaleMultiplier?: number;
  minPriceMultiplier?: number;
  allowBelowFace?: boolean;
  transferCutoffHours?: number;
  listingAdvanceHours?: number;
  maxListingsPerUserPerEvent?: number;
  maxListingsPerUserTotal?: number;
  requireListingApproval?: boolean;
  royaltyPercentage?: number;
  royaltyWalletAddress?: string;
  allowInternationalSales?: boolean;
  blockedCountries?: string[];
  requireKycForHighValue?: boolean;
  highValueThreshold?: number;
}

export class VenueSettingsModel {
  private tableName = 'venue_marketplace_settings';

  async create(input: CreateVenueSettingsInput): Promise<VenueMarketplaceSettings> {
    const [settings] = await db(this.tableName)
      .insert({
        venue_id: input.venueId,
        royalty_wallet_address: input.royaltyWalletAddress,
        max_resale_multiplier: input.maxResaleMultiplier || 3.0,
        min_price_multiplier: input.minPriceMultiplier || 1.0,
        allow_below_face: input.allowBelowFace || false,
        transfer_cutoff_hours: input.transferCutoffHours || 4,
        listing_advance_hours: input.listingAdvanceHours || 720,
        max_listings_per_user_per_event: input.maxListingsPerUserPerEvent || 8,
        max_listings_per_user_total: input.maxListingsPerUserTotal || 50,
        require_listing_approval: input.requireListingApproval || false,
        royalty_percentage: input.royaltyPercentage || 5.00,
      })
      .returning('*');

    return this.mapToSettings(settings);
  }

  async findByVenueId(venueId: string): Promise<VenueMarketplaceSettings | null> {
    const settings = await db(this.tableName)
      .where({ venue_id: venueId })
      .first();

    return settings ? this.mapToSettings(settings) : null;
  }

  async findOrCreateDefault(venueId: string, walletAddress: string): Promise<VenueMarketplaceSettings> {
    const existing = await this.findByVenueId(venueId);
    if (existing) return existing;

    return this.create({
      venueId,
      royaltyWalletAddress: walletAddress,
    });
  }

  async update(
    venueId: string,
    input: UpdateVenueSettingsInput
  ): Promise<VenueMarketplaceSettings | null> {
    const updateData: any = {};

    if (input.maxResaleMultiplier !== undefined) {
      updateData.max_resale_multiplier = input.maxResaleMultiplier;
    }
    if (input.minPriceMultiplier !== undefined) {
      updateData.min_price_multiplier = input.minPriceMultiplier;
    }
    if (input.allowBelowFace !== undefined) {
      updateData.allow_below_face = input.allowBelowFace;
    }
    if (input.transferCutoffHours !== undefined) {
      updateData.transfer_cutoff_hours = input.transferCutoffHours;
    }
    if (input.listingAdvanceHours !== undefined) {
      updateData.listing_advance_hours = input.listingAdvanceHours;
    }
    if (input.maxListingsPerUserPerEvent !== undefined) {
      updateData.max_listings_per_user_per_event = input.maxListingsPerUserPerEvent;
    }
    if (input.maxListingsPerUserTotal !== undefined) {
      updateData.max_listings_per_user_total = input.maxListingsPerUserTotal;
    }
    if (input.requireListingApproval !== undefined) {
      updateData.require_listing_approval = input.requireListingApproval;
    }
    if (input.royaltyPercentage !== undefined) {
      updateData.royalty_percentage = input.royaltyPercentage;
    }
    if (input.royaltyWalletAddress !== undefined) {
      updateData.royalty_wallet_address = input.royaltyWalletAddress;
    }
    if (input.allowInternationalSales !== undefined) {
      updateData.allow_international_sales = input.allowInternationalSales;
    }
    if (input.blockedCountries !== undefined) {
      updateData.blocked_countries = input.blockedCountries;
    }
    if (input.requireKycForHighValue !== undefined) {
      updateData.require_kyc_for_high_value = input.requireKycForHighValue;
    }
    if (input.highValueThreshold !== undefined) {
      updateData.high_value_threshold = input.highValueThreshold;
    }

    updateData.updated_at = new Date();

    const [settings] = await db(this.tableName)
      .where({ venue_id: venueId })
      .update(updateData)
      .returning('*');

    return settings ? this.mapToSettings(settings) : null;
  }

  async getAllSettings(limit = 100, offset = 0): Promise<VenueMarketplaceSettings[]> {
    const settings = await db(this.tableName)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return settings.map(this.mapToSettings);
  }

  private mapToSettings(row: any): VenueMarketplaceSettings {
    return {
      venueId: row.venue_id,
      maxResaleMultiplier: parseFloat(row.max_resale_multiplier),      // DECIMAL multiplier
      minPriceMultiplier: parseFloat(row.min_price_multiplier),        // DECIMAL multiplier
      allowBelowFace: row.allow_below_face,
      transferCutoffHours: row.transfer_cutoff_hours,
      listingAdvanceHours: row.listing_advance_hours,
      autoExpireOnEventStart: row.auto_expire_on_event_start,
      maxListingsPerUserPerEvent: row.max_listings_per_user_per_event,
      maxListingsPerUserTotal: row.max_listings_per_user_total,
      requireListingApproval: row.require_listing_approval,
      autoApproveVerifiedSellers: row.auto_approve_verified_sellers,
      royaltyPercentage: parseFloat(row.royalty_percentage),           // DECIMAL percentage
      royaltyWalletAddress: row.royalty_wallet_address,
      minimumRoyaltyPayout: parseInt(row.minimum_royalty_payout || 0), // INTEGER CENTS
      allowInternationalSales: row.allow_international_sales,
      blockedCountries: row.blocked_countries || [],
      requireKycForHighValue: row.require_kyc_for_high_value,
      highValueThreshold: parseInt(row.high_value_threshold || 0),     // INTEGER CENTS
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const venueSettingsModel = new VenueSettingsModel();
