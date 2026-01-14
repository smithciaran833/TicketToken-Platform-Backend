/**
 * Shared Types for Service Clients
 * 
 * Response types for all internal API endpoints.
 * These types match the actual responses from Phase 3 endpoints.
 */

// ============================================================================
// Common Types
// ============================================================================

export interface PaginationMeta {
  limit: number;
  offset?: number;
  total?: number;
  hasMore?: boolean;
}

// ============================================================================
// Ticket Service Types
// ============================================================================

export interface TicketStatus {
  ticketId: string;
  status: string;
  ownerId: string;
  eventId: string;
  ticketTypeId: string;
  originalPriceCents: number;
  currentPriceCents: number;
  hasBeenTransferred: boolean;
  validForEntry: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketStatusResponse {
  ticket: TicketStatus;
}

export interface BatchCancelResult {
  ticketId: string;
  success: boolean;
  error?: string;
  previousStatus?: string;
}

export interface CancelBatchResponse {
  results: BatchCancelResult[];
  successCount: number;
  failureCount: number;
  totalRequested: number;
}

export interface PriceBreakdown {
  ticketId: string;
  originalPriceCents: number;
  currentPriceCents: number;
  feesCents: number;
  taxCents: number;
  totalCents: number;
}

export interface CalculatePriceResponse {
  tickets: PriceBreakdown[];
  subtotalCents: number;
  totalFeesCents: number;
  totalTaxCents: number;
  grandTotalCents: number;
  currency: string;
}

export interface TicketFull {
  id: string;
  ticketNumber: string;
  tenantId: string;
  eventId: string;
  ticketTypeId: string;
  ownerId: string;
  originalBuyerId: string;
  orderId: string;
  status: string;
  priceCents: number;
  currency: string;
  seat?: {
    section?: string;
    row?: string;
    number?: string;
  };
  tokenId?: string;
  mintAddress?: string;
  hasBeenTransferred: boolean;
  transferCount: number;
  qrCodeData?: string;
  validFrom?: string;
  validUntil?: string;
  checkedInAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  // Event details
  event: {
    id: string;
    name: string;
    startsAt: string;
    endsAt?: string;
    venueId: string;
    venueName?: string;
  };
  // Ticket type details
  ticketType: {
    id: string;
    name: string;
    description?: string;
  };
}

export interface TicketFullResponse {
  ticket: TicketFull;
}

export interface TicketByEvent {
  id: string;
  ticketNumber: string;
  status: string;
  ownerId: string;
  ticketTypeName: string;
  priceCents: number;
  seat?: {
    section?: string;
    row?: string;
    number?: string;
  };
  hasBeenTransferred: boolean;
  checkedInAt?: string;
  createdAt: string;
}

export interface TicketsByEventResponse {
  eventId: string;
  tickets: TicketByEvent[];
  count: number;
  pagination?: PaginationMeta;
}

export interface TicketByToken {
  ticketId: string;
  tokenId: string;
  mintAddress?: string;
  status: string;
  ownerId: string;
  eventId: string;
  ticketTypeId: string;
  metadata?: Record<string, any>;
}

export interface TicketByTokenResponse {
  ticket: TicketByToken | null;
  found: boolean;
}

export interface TransferResult {
  ticketId: string;
  success: boolean;
  previousOwnerId: string;
  newOwnerId: string;
  transferredAt: string;
  transferCount: number;
}

export interface TransferTicketResponse {
  transfer: TransferResult;
}

// ============================================================================
// Auth Service Types
// ============================================================================

export interface PermissionCheckResult {
  permission: string;
  allowed: boolean;
  reason?: string;
}

export interface ValidatePermissionsResponse {
  userId: string;
  permissions: PermissionCheckResult[];
  allGranted: boolean;
}

export interface UserValidation {
  userId: string;
  exists: boolean;
  active: boolean;
  tenantId?: string;
}

export interface ValidateUsersResponse {
  users: UserValidation[];
  allValid: boolean;
  invalidCount: number;
}

export interface TenantContext {
  userId: string;
  tenantId: string;
  tenantName?: string;
  role?: string;
  permissions?: string[];
}

export interface GetUserTenantResponse {
  tenant: TenantContext;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phone?: string;
  role: string;
  permissions: string[];
  status: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  walletAddress?: string;
  avatarUrl?: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GetUserResponse {
  user: User;
}

export interface GetUserByEmailResponse {
  user: User | null;
  found: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  permissions: string[];
  status: string;
  lastLoginAt?: string;
}

export interface GetAdminUsersResponse {
  admins: AdminUser[];
  count: number;
}

// ============================================================================
// Order Service Types
// ============================================================================

export interface Order {
  id: string;
  orderNumber: string;
  tenantId: string;
  userId: string;
  eventId: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  feesCents: number;
  taxCents: number;
  discountCents: number;
  currency: string;
  paymentIntentId?: string;
  paymentMethod?: string;
  billingAddress?: Record<string, any>;
  shippingAddress?: Record<string, any>;
  expiresAt?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface GetOrderResponse {
  order: Order;
}

export interface OrderItem {
  id: string;
  orderId: string;
  ticketTypeId: string;
  ticketId?: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  status: string;
  ticketTypeName?: string;
  ticketTypeDescription?: string;
  createdAt: string;
}

export interface GetOrderItemsResponse {
  orderId: string;
  items: OrderItem[];
  count: number;
}

// ============================================================================
// Event Service Types
// ============================================================================

export interface EventWithBlockchain {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  shortDescription?: string;
  venueId: string;
  venueLayoutId?: string;
  eventType: string;
  status: string;
  visibility: string;
  startsAt: string;
  endsAt?: string;
  doorsOpen?: string;
  timezone: string;
  bannerImageUrl?: string;
  thumbnailImageUrl?: string;
  capacity: number;
  isVirtual: boolean;
  isHybrid: boolean;
  // Blockchain fields
  eventPda?: string;
  artistWallet?: string;
  artistPercentage?: number;
  venuePercentage?: number;
  resaleable: boolean;
  // Additional metadata
  cancellationPolicy?: string;
  refundPolicy?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface GetEventResponse {
  event: EventWithBlockchain;
}

// ============================================================================
// Venue Service Types
// ============================================================================

export interface VenueWithBlockchain {
  id: string;
  tenantId: string;
  name: string;
  slug?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  timezone: string;
  capacity: number;
  status: string;
  isVerified: boolean;
  // Blockchain fields
  walletAddress?: string;
  // Contact/owner info
  ownerEmail?: string;
  ownerName?: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  // Media
  logoUrl?: string;
  bannerImageUrl?: string;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface GetVenueResponse {
  venue: VenueWithBlockchain;
}

export interface TicketValidationResult {
  valid: boolean;
  alreadyScanned: boolean;
  ticket?: {
    id: string;
    status: string;
    eventId: string;
    venueId: string;
  };
}

export interface ValidateTicketResponse extends TicketValidationResult {}

// ============================================================================
// PHASE 5b NEW TYPES - Response types for new internal endpoints
// ============================================================================

// --- Ticket Service Phase 5b Types ---

export interface TicketCountForOrderResponse {
  orderId: string;
  count: number;
  hasTickets: boolean;
}

export interface RecordScanData {
  deviceId?: string;
  venueId?: string;
  scanType?: string;
}

export interface RecordScanResponse {
  success: boolean;
  ticket: {
    id: string;
    scanCount: number;
    lastScannedAt: string;
    status: string;
  };
}

export interface UpdateNftData {
  nftMintAddress?: string;
  nftTransferSignature?: string;
  walletAddress?: string;
  metadataUri?: string;
  isMinted?: boolean;
  mintedAt?: string;
}

export interface UpdateNftResponse {
  success: boolean;
  ticket: {
    id: string;
    nftMintAddress?: string;
    mintedAt?: string;
    walletAddress?: string;
    metadataUri?: string;
    lastTransferSignature?: string;
  };
}

export interface TicketByTokenBatch {
  id: string;
  tenantId: string;
  eventId: string;
  userId: string;
  status: string;
  tokenId: string;
  isMinted: boolean;
  mintTransactionId?: string;
  walletAddress?: string;
  ticketNumber: string;
  transferCount: number;
}

export interface BatchGetByTokenResponse {
  tickets: Record<string, TicketByTokenBatch>;
  found: number;
  notFoundTokenIds: string[];
}

export interface ValidationStatus {
  isValid: boolean;
  isUsed: boolean;
  isExpired: boolean;
  isTooEarly: boolean;
  eventStatus: string;
}

export interface TicketForValidation {
  id: string;
  tenantId: string;
  eventId: string;
  userId: string;
  status: string;
  qrCode: string;
  qrHmacSecret?: string;
  ticketNumber: string;
  scanCount: number;
  lastScannedAt?: string;
  validatedAt?: string;
  usedAt?: string;
  isTransferable: boolean;
  transferCount: number;
}

export interface TicketForValidationResponse {
  ticket: TicketForValidation;
  event: {
    id: string;
    name: string;
    venueId: string;
    startsAt: string;
    endsAt?: string;
    status: string;
  } | null;
  validation: ValidationStatus;
}

export interface RefundEligibility {
  canRefund: boolean;
  reasons: string[];
}

export interface TicketForRefund {
  id: string;
  tenantId: string;
  eventId: string;
  userId: string;
  orderId: string;
  status: string;
  priceCents: number;
  ticketTypeId: string;
  nftMinted: boolean;
  validatedAt?: string;
  usedAt?: string;
  purchasedAt: string;
  transferCount: number;
  isTransferable: boolean;
}

export interface TicketForRefundResponse {
  ticket: TicketForRefund;
  event: {
    id: string;
    name: string;
    venueId: string;
    startsAt: string;
    endsAt?: string;
    status: string;
    eventType: string;
  } | null;
  venue: {
    id: string;
    name: string;
    refundPolicyHours?: number;
  } | null;
  refundEligibility: RefundEligibility;
}

// --- Auth Service Phase 5b Types ---

export interface UserTaxInfo {
  taxIdType?: string;
  taxIdLastFour?: string;
  taxIdVerified?: boolean;
  tinMatchStatus?: string;
  w9SubmittedAt?: string;
  taxYear?: number;
  taxClassification?: string;
  legalName?: string;
  businessName?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface GetUserTaxInfoResponse {
  user: {
    id: string;
    email: string;
    name: string;
    firstName?: string;
    lastName?: string;
    tenantId: string;
    billingAddress?: Record<string, any>;
    phone?: string;
  };
  taxInfo: UserTaxInfo | null;
  hasTaxInfo: boolean;
}

export interface ChargebackData {
  totalChargebacks: number;
  chargebacksInPeriod: number;
  totalChargebackAmountCents: number;
  lastChargebackAt?: string;
  chargebackRate: number;
}

export interface GetUserChargebackCountResponse {
  userId: string;
  tenantId: string;
  userStatus: string;
  accountAge: number;
  chargebackData: ChargebackData;
  periodMonths: number;
}

export interface UserVerificationStatus {
  userId: string;
  email: string;
  identityVerified: boolean;
  emailVerified: boolean;
  kycStatus?: string;
  kycVerifiedAt?: string;
  mfaEnabled: boolean;
}

export interface BatchVerificationCheckResponse {
  users: Record<string, UserVerificationStatus>;
  found: number;
  notFoundUserIds: string[];
  summary: {
    verified: number;
    unverified: number;
    notFound: number;
  };
}

// --- Event Service Phase 5b Types ---

export interface EventBlockchainInfo {
  eventPda?: string;
  merkleTreeAddress?: string;
  collectionMint?: string;
  artistWallet?: string;
  artistPercentage?: number;
  venuePercentage?: number;
  platformPercentage?: number;
  resaleable?: boolean;
  maxResalePricePercentage?: number;
}

export interface GetEventPdaResponse {
  eventId: string;
  tenantId: string;
  name: string;
  status: string;
  venueId: string;
  blockchain: EventBlockchainInfo;
  hasBlockchainConfig: boolean;
}

export interface TicketStats {
  totalTickets: number;
  soldTickets: number;
  usedTickets: number;
  transferredTickets: number;
  cancelledTickets: number;
  validatedTickets: number;
  lastValidationAt?: string;
}

export interface EventTiming {
  isUpcoming: boolean;
  isOngoing: boolean;
  isPast: boolean;
  doorsAreOpen: boolean;
  minutesUntilStart?: number;
  minutesSinceEnd?: number;
}

export interface EventScanMetrics {
  entryRate: number;
  capacityUtilization: number;
  availableCapacity?: number;
}

export interface GetEventScanStatsResponse {
  event: {
    id: string;
    tenantId: string;
    name: string;
    status: string;
    venueId: string;
    startsAt: string;
    endsAt?: string;
    doorsOpen?: string;
    timezone: string;
    capacity: number;
  };
  ticketStats: TicketStats;
  metrics: EventScanMetrics;
  eventTiming: EventTiming;
}

// --- Venue Service Phase 5b Types ---

export interface VenueBankInfo {
  bankName?: string;
  accountType?: string;
  accountLastFour?: string;
  routingNumberLastFour?: string;
  bankVerified: boolean;
  bankVerifiedAt?: string;
  bankVerificationMethod?: string;
  payoutSchedule?: string;
  payoutMinimumCents?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface VenueTaxInfo {
  taxIdType?: string;
  taxIdLastFour?: string;
  taxIdVerified: boolean;
  w9SubmittedAt?: string;
}

export interface GetVenueBankInfoResponse {
  venue: {
    id: string;
    tenantId: string;
    name: string;
    status: string;
    isVerified: boolean;
    ownerEmail?: string;
    ownerName?: string;
  };
  bankInfo: VenueBankInfo | null;
  taxInfo: VenueTaxInfo | null;
  hasBankInfo: boolean;
  isPayoutReady: boolean;
}

export interface VenueChargebackMetrics {
  totalChargebacks: number;
  chargebacksInPeriod: number;
  totalChargebackAmountCents: number;
  totalTransactions: number;
  totalTransactionAmountCents: number;
  chargebackRate: number;
  chargebackAmountRate: number;
  lastChargebackAt?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface ReserveRecommendation {
  recommendedReservePercent: number;
  isHighRisk: boolean;
  requiresReview: boolean;
}

export interface GetVenueChargebackRateResponse {
  venue: {
    id: string;
    tenantId: string;
    name: string;
    status: string;
    isVerified: boolean;
    ageInDays: number;
  };
  chargebackMetrics: VenueChargebackMetrics;
  periodMonths: number;
  reserveRecommendation: ReserveRecommendation;
}

// --- Order Service Phase 5b Types ---

export interface OrphanedOrder {
  id: string;
  orderNumber: string;
  tenantId: string;
  userId: string;
  eventId: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  feesCents: number;
  currency: string;
  paymentIntentId?: string;
  paymentMethod?: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
}

export interface GetOrdersWithoutTicketsResponse {
  orders: OrphanedOrder[];
  count: number;
  searchCriteria: {
    status: string;
    ageMinutes: number;
    tenantId: string;
  };
}

export interface OrdersWithoutTicketsOptions {
  /** Minimum age in minutes (default: 5) */
  minutesOld?: number;
  /** Order status to filter by (default: 'PAID') */
  status?: string;
  /** Maximum results (default: 100, max: 500) */
  limit?: number;
}

export interface OrderForPayment {
  id: string;
  orderNumber: string;
  tenantId: string;
  userId: string;
  eventId: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  feesCents: number;
  taxCents: number;
  discountCents: number;
  currency: string;
  paymentIntentId?: string;
  paymentMethod?: string;
  promoCode?: string;
  billingAddress?: Record<string, any>;
  shippingAddress?: Record<string, any>;
  expiresAt?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
  version?: number;
}

export interface OrderItemForPayment {
  id: string;
  ticketTypeId: string;
  ticketId?: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  status: string;
}

export interface PaymentContext {
  itemCount: number;
  ticketCount: number;
  canProcessPayment: boolean;
  isExpired: boolean;
  validationErrors: string[];
}

export interface GetOrderForPaymentResponse {
  order: OrderForPayment;
  items: OrderItemForPayment[];
  paymentContext: PaymentContext;
}

// ============================================================================
// PHASE 5c TYPES - Blockchain Indexer Support
// ============================================================================

// --- Ticket Service Reconciliation/Indexer Types ---

export interface TicketForReconciliation {
  id: string;
  tokenId: string;
  walletAddress?: string;
  status: string;
  isMinted: boolean;
  syncStatus?: string;
  reconciledAt?: string;
  lastIndexedAt?: string;
}

export interface GetTicketsForReconciliationOptions {
  /** Maximum tickets to return (default: 100) */
  limit?: number;
  /** Filter by sync status */
  syncStatus?: string;
  /** Only tickets not reconciled in this many hours */
  staleHours?: number;
}

export interface GetTicketsForReconciliationResponse {
  tickets: TicketForReconciliation[];
  count: number;
}

export interface UpdateBlockchainSyncData {
  syncStatus?: 'SYNCED' | 'PENDING' | 'ERROR' | 'STALE';
  walletAddress?: string;
  status?: string;
  isMinted?: boolean;
  reconciledAt?: string;
  lastIndexedAt?: string;
  mintTransactionId?: string;
  transferCount?: number;
  marketplaceListed?: boolean;
  lastSalePrice?: number;
  lastSaleAt?: string;
}

export interface UpdateBlockchainSyncResponse {
  success: boolean;
  ticket: {
    id: string;
    tokenId?: string;
    status: string;
    syncStatus: string;
    walletAddress?: string;
    reconciledAt?: string;
  };
}

export interface RecordBlockchainTransferData {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  transactionSignature: string;
  blockTime?: number;
  slot?: number;
  metadata?: Record<string, any>;
}

export interface RecordBlockchainTransferResponse {
  success: boolean;
  ticketId: string;
  transferId: string;
  newTransferCount: number;
}

export interface UpdateMarketplaceStatusData {
  tokenId: string;
  listed: boolean;
  price?: number;
  buyer?: string;
  saleCompleted?: boolean;
}

export interface UpdateMarketplaceStatusResponse {
  success: boolean;
  ticket: {
    id: string;
    tokenId: string;
    marketplaceListed: boolean;
    walletAddress?: string;
    lastSalePrice?: number;
    lastSaleAt?: string;
    transferCount: number;
  };
}

export interface CheckTokenExistsResponse {
  exists: boolean;
  ticketId?: string;
  status?: string;
}

// ============================================================================
// PHASE 5c TYPES - Monitoring Service Metrics Support
// ============================================================================

export interface VenueMetricsResponse {
  totalVenues: number;
  activeVenues: number;
  pendingVenues: number;
  verifiedVenues: number;
  collectedAt: string;
}

export interface EventMetricsResponse {
  totalEvents: number;
  publishedEvents: number;
  upcomingEvents: number;
  pastEvents: number;
  periodDays: number;
  collectedAt: string;
}

export interface TicketMetricsResponse {
  ticketsSold: number;
  ticketsUsed: number;
  ticketsCancelled: number;
  ticketsTransferred: number;
  periodHours: number;
  collectedAt: string;
}

export interface ActiveEventsResponse {
  events: {
    id: string;
    name: string;
    totalTickets: number;
    ticketsSold: number;
    remainingTickets: number;
    saleStart?: string;
    saleEnd?: string;
  }[];
  count: number;
}

// ============================================================================
// PHASE 5c TYPES - Compliance Service Support
// ============================================================================

export interface VenueExistsResponse {
  exists: boolean;
  venueId: string;
  tenantId: string;
}

export interface VenueBasicInfo {
  id: string;
  name: string;
  tenantId: string;
  status: string;
  ownerEmail?: string;
  ownerName?: string;
}

export interface GetVenueBasicInfoResponse {
  venue: VenueBasicInfo;
}

export interface BatchVenueNamesResponse {
  venues: Record<string, { name: string; ownerEmail?: string }>;
  found: number;
  notFoundIds: string[];
}

// ============================================================================
// PHASE 5c TYPES - Transfer Service Support
// ============================================================================

// --- Ticket Service Transfer Types ---

export interface TicketForTransfer {
  id: string;
  userId: string;
  eventId: string;
  ticketTypeId: string;
  status: string;
  ticketNumber: string;
  nftMintAddress?: string;
  isTransferable: boolean;
  transferCount: number;
  walletAddress?: string;
}

export interface GetTicketForTransferResponse {
  ticket: TicketForTransfer;
  transferable: boolean;
  reason?: string;
}

export interface TicketTypeTransferInfo {
  id: string;
  name: string;
  isTransferable: boolean;
  maxTransfersPerTicket?: number;
  transferCooldownHours?: number;
}

export interface GetTicketTypeTransferInfoResponse {
  ticketType: TicketTypeTransferInfo;
}

export interface TicketEventDateResponse {
  ticketId: string;
  eventId: string;
  eventStartDate: string;
  eventName: string;
  daysUntilEvent: number;
}

// --- Auth Service Transfer Types ---

export interface CreatePendingUserRequest {
  email: string;
  source?: string;
  metadata?: Record<string, any>;
}

export interface CreatePendingUserResponse {
  userId: string;
  email: string;
  status: 'pending' | 'active';
  isNew: boolean;
}

export interface BatchIdentityCheckResponse {
  users: Record<string, { identityVerified: boolean; email?: string }>;
  found: number;
  allVerified: boolean;
  unverifiedUserIds: string[];
}
