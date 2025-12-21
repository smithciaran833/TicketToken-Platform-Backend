/**
 * TypeScript interfaces matching Elasticsearch mappings
 * These represent the full enriched documents that will be indexed
 */

// ===== VENUE INTERFACES =====

export interface EnrichedVenue {
  venueId: string;
  name: string;
  description?: string;
  type: string;
  
  address: {
    street?: string;
    city: string;
    state: string;
    zipCode?: string;
    country: string;
    fullAddress?: string;
  };
  
  location?: {
    lat: number;
    lon: number;
  };
  
  timezone?: string;
  capacity?: number;
  
  sections?: Array<{
    sectionId: string;
    name: string;
    capacity: number;
    type: string;
    pricing?: number;
  }>;
  
  amenities?: string[];
  accessibilityFeatures?: string[];
  
  images?: Array<{
    url: string;
    type: string;
    caption?: string;
    primary: boolean;
  }>;
  
  ratings?: {
    averageRating?: number;
    totalReviews?: number;
    categories?: {
      accessibility?: number;
      sound?: number;
      parking?: number;
      concessions?: number;
      sightlines?: number;
    };
  };
  
  contact?: {
    phone?: string;
    email?: string;
    website?: string;
    boxOfficePhone?: string;
  };
  
  operatingHours?: any;
  
  parkingInfo?: {
    onsite?: boolean;
    capacity?: number;
    pricing?: number;
    valet?: boolean;
  };
  
  policies?: {
    ageRestrictions?: string;
    bagPolicy?: string;
    smokingPolicy?: string;
  };
  
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    lastVerified?: Date;
    source?: string;
  };
  
  status: string;
  featured?: boolean;
  searchBoost?: number;
}

// ===== EVENT INTERFACES =====

export interface EnrichedEvent {
  eventId: string;
  title: string;
  description?: string;
  category: string;
  subcategory?: string;
  tags?: string[];
  
  eventDate: Date;
  endDate?: Date;
  status: string;
  featured?: boolean;
  
  venue: {
    venueId: string;
    name: string;
    city: string;
    state: string;
    country: string;
    location?: {
      lat: number;
      lon: number;
    };
    address?: string;
  };
  
  performers?: Array<{
    performerId: string;
    name: string;
    headliner?: boolean;
    genre?: string;
  }>;
  
  pricing?: {
    minPrice?: number;
    maxPrice?: number;
    averagePrice?: number;
    currency: string;
  };
  
  capacity?: number;
  ticketsSold?: number;
  
  images?: Array<{
    url: string;
    type: string;
    primary: boolean;
  }>;
  
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy?: string;
    source?: string;
    externalId?: string;
  };
  
  searchBoost?: number;
  visibility?: string;
}

// ===== TICKET INTERFACES =====

export interface EnrichedTicket {
  ticketId: string;
  eventId: string;
  venueId: string;
  userId: string;
  originalUserId?: string;
  
  ticketNumber: string;
  ticketType: string;
  category?: string;
  
  section?: string;
  row?: string;
  seat?: string;
  seatView?: string;
  
  barcode?: string;
  qrCode?: string;
  accessCode?: string;
  securityCode?: string;
  
  pricing: {
    originalPrice: number;
    purchasePrice: number;
    currentValue?: number;
    fees?: number;
    taxes?: number;
    royalties?: number;
    currency: string;
    priceHistory?: Array<{
      price: number;
      date: Date;
      reason: string;
    }>;
  };
  
  transferHistory?: Array<{
    fromUserId: string;
    toUserId: string;
    transferDate: Date;
    transferType: string;
    transferPrice?: number;
    transactionHash?: string;
    status: string;
  }>;
  
  marketplace?: {
    isListed: boolean;
    listingId?: string;
    listingPrice?: number;
    listingDate?: Date;
    expiryDate?: Date;
    viewCount?: number;
    watchCount?: number;
    offerCount?: number;
  };
  
  blockchain?: {
    nftId?: string;
    contractAddress?: string;
    tokenId?: string;
    mintTx?: string;
    chainId?: string;
    metadataUri?: string;
    attributes?: any;
    royaltyPercentage?: number;
  };
  
  validation?: {
    lastValidated?: Date;
    validationCount?: number;
    validationHistory?: Array<{
      timestamp: Date;
      location?: {
        lat: number;
        lon: number;
      };
      gate?: string;
      staffId?: string;
      result: string;
    }>;
    entryGate?: string;
    isUsed: boolean;
    usedAt?: Date;
  };
  
  delivery?: {
    method: string;
    status: string;
    trackingNumber?: string;
    deliveryDate?: Date;
    email?: string;
  };
  
  perks?: string[];
  restrictions?: string[];
  specialInstructions?: string;
  notes?: string;
  tags?: string[];
  
  metadata?: {
    source?: string;
    affiliate?: string;
    campaign?: string;
    referrer?: string;
  };
  
  status: string;
  statusHistory?: Array<{
    status: string;
    timestamp: Date;
    reason?: string;
  }>;
  
  flags?: string[];
  isTransferable: boolean;
  isResellable: boolean;
  isRefundable: boolean;
  isUpgradeable: boolean;
  
  purchaseDate: Date;
  validFrom?: Date;
  validUntil?: Date;
  expiryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  searchScore?: number;
}

// ===== MARKETPLACE INTERFACES =====

export interface EnrichedMarketplaceListing {
  listingId: string;
  ticketId: string;
  eventId: string;
  venueId: string;
  sellerId: string;
  buyerId?: string;
  transactionId?: string;
  
  price: number;
  originalPrice?: number;
  finalPrice?: number;
  currency: string;
  
  status: string;
  listingType: string;
  deliveryMethod: string;
  
  event: {
    name: string;
    date: Date;
    category: string;
    subcategory?: string;
    popularity?: number;
    daysUntilEvent?: number;
  };
  
  ticket: {
    section: string;
    row?: string;
    seat?: string;
    type: string;
    quantity?: number;
    grouping?: string;
    transferable: boolean;
    verified: boolean;
  };
  
  venue: {
    name: string;
    city: string;
    state: string;
    country: string;
    location?: {
      lat: number;
      lon: number;
    };
    timezone?: string;
  };
  
  seller: {
    username: string;
    reputation?: number;
    totalSales?: number;
    totalReviews?: number;
    responseTime?: number;
    responseRate?: number;
    verified: boolean;
    powerSeller: boolean;
    joinDate?: Date;
  };
  
  buyer?: {
    protection: boolean;
    guaranteeExpires?: Date;
  };
  
  pricing: {
    listPrice: number;
    fees?: number;
    royalties?: number;
    taxes?: number;
    shipping?: number;
    total?: number;
    priceHistory?: Array<{
      price: number;
      date: Date;
      reason: string;
    }>;
    comparablePrice?: number;
    marketPrice?: number;
    pricePercentile?: number;
    discount?: {
      amount?: number;
      percentage?: number;
      code?: string;
    };
  };
  
  offers?: Array<{
    offerId: string;
    buyerId: string;
    amount: number;
    message?: string;
    status: string;
    createdAt: Date;
    expiresAt?: Date;
    respondedAt?: Date;
    counterOffer?: number;
  }>;
  
  blockchain?: {
    nftId?: string;
    contractAddress?: string;
    tokenId?: string;
    chainId?: string;
    network?: string;
    escrowAddress?: string;
    transactionHash?: string;
    blockNumber?: number;
    mintDate?: Date;
  };
  
  analytics?: {
    views?: number;
    uniqueViews?: number;
    watchers?: number;
    shares?: number;
    favorites?: number;
    clickThroughRate?: number;
    conversionRate?: number;
    averageViewTime?: number;
    lastViewedAt?: Date;
  };
  
  recommendations?: {
    score?: number;
    reasons?: string[];
    algorithm?: string;
  };
  
  compliance?: {
    amlCheck?: boolean;
    kycVerified?: boolean;
    riskScore?: number;
    flagged?: boolean;
  };
  
  shipping?: {
    method?: string;
    carrier?: string;
    trackingNumber?: string;
    cost?: number;
    estimatedDays?: number;
    shippedAt?: Date;
  };
  
  metadata?: {
    source?: string;
    affiliate?: string;
    campaign?: string;
    referrer?: string;
  };
  
  tags?: string[];
  flags?: string[];
  urgency?: string;
  featured?: boolean;
  promoted?: boolean;
  spotlight?: boolean;
  qualityScore?: number;
  
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  expiresAt?: Date;
  soldAt?: Date;
  deliveredAt?: Date;
  completedAt?: Date;
  searchBoost?: number;
}
