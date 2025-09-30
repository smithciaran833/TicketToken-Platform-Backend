import { UUID, BaseEntity } from './common.types';

export interface VenueRules {
  max_markup_percentage?: number;
  min_markup_percentage?: number;
  requires_approval: boolean;
  blacklist_enabled: boolean;
  allow_international_sales: boolean;
  min_days_before_event?: number;
  max_listings_per_user?: number;
  restricted_sections?: string[];
}

export interface VenueFees {
  percentage: number;
  flat_fee?: number;
  cap_amount?: number;
  currency: 'USD' | 'USDC' | 'SOL';
}

export interface VenueMarketplaceSettings extends BaseEntity {
  venue_id: UUID;
  is_active: boolean;
  rules: VenueRules;
  fees: VenueFees;
  payout_wallet?: string;
  auto_approve_listings: boolean;
  notification_email?: string;
}

export interface VenueRestriction {
  venue_id: UUID;
  restriction_type: 'blacklist' | 'whitelist' | 'geo_restriction';
  restricted_value: string;
  reason?: string;
  active: boolean;
}
