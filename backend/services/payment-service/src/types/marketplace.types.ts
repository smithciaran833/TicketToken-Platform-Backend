export interface ResaleListing {
  id: string;
  ticketId: string;
  sellerId: string;
  price: number;
  originalPrice: number;
  venueRoyaltyPercentage: number;
  status: ListingStatus;
  createdAt: Date;
}

export enum ListingStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SOLD = 'sold',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export interface EscrowTransaction {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  sellerPayout: number;
  venueRoyalty: number;
  platformFee: number;
  status: EscrowStatus;
  releaseConditions: ReleaseCondition[];
}

export enum EscrowStatus {
  CREATED = 'created',
  FUNDED = 'funded',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed'
}

export interface ReleaseCondition {
  type: 'nft_transferred' | 'event_completed' | 'manual_approval';
  satisfied: boolean;
  satisfiedAt?: Date;
}
