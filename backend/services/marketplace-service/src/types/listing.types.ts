import { UUID, ListingStatus, BaseEntity } from './common.types';

export interface ListingFilters {
  eventId?: UUID;
  venueId?: UUID;
  minPrice?: number;
  maxPrice?: number;
  status?: ListingStatus;
  sellerId?: UUID;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface MarketplaceListing extends BaseEntity {
  ticket_id: UUID;
  seller_id: UUID;
  event_id: UUID;
  venue_id: UUID;
  price: number;
  original_face_value: number;
  status: ListingStatus;
  listed_at: Date;
  sold_at?: Date;
  expires_at?: Date;
  cancelled_at?: Date;
  buyer_id?: UUID;
  notes?: string;
}

export interface ListingWithDetails extends MarketplaceListing {
  event_name?: string;
  venue_name?: string;
  event_date?: Date;
  seller_username?: string;
  seller_rating?: number;
  tier_name?: string;
  section?: string;
  row?: string;
  seat?: string;
}

export interface PriceUpdate {
  listing_id: UUID;
  old_price: number;
  new_price: number;
  updated_by: UUID;
  reason?: string;
  timestamp: Date;
}

export interface CreateListingInput {
  ticket_id: UUID;
  price: number;
  expires_at?: Date;
  notes?: string;
}

export interface UpdateListingInput {
  price?: number;
  expires_at?: Date;
  notes?: string;
}
