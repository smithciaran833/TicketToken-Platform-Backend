export interface PaymentRequest {
  userId: string;
  venueId: string;
  eventId: string;
  tickets: TicketSelection[];
  paymentMethod: PaymentMethod;
  metadata?: Record<string, any>;
  idempotencyKey: string;
}
export interface TicketSelection {
  ticketTypeId: string;
  quantity: number;
  price: number;  // STORED AS INTEGER CENTS
  seatNumbers?: string[];
}
export interface PaymentMethod {
  type: 'card' | 'ach' | 'paypal' | 'crypto';
  token?: string;
  paymentMethodId?: string;
}
// All monetary values stored as INTEGER CENTS, not decimal dollars
export interface DynamicFees {
  platform: number;      // cents
  platformPercentage: number;  // for display (7.5 = 7.5%)
  gasEstimate: number;   // cents
  tax: number;           // cents
  total: number;         // cents
  breakdown: FeeBreakdown;
}
export interface FeeBreakdown {
  ticketPrice: number;   // cents
  platformFee: number;   // cents
  gasEstimate: number;   // cents
  stateTax: number;      // cents
  localTax: number;      // cents
  total: number;         // cents
}
export enum VenueTier {
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise'
}
// All monetary values stored as INTEGER CENTS
export interface VenueBalance {
  available: number;  // cents
  pending: number;    // cents
  reserved: number;   // cents
  currency: string;
  lastPayout?: Date;
}
// Transaction types matching database constraint
export enum TransactionType {
  TICKET_PURCHASE = 'ticket_purchase',
  REFUND = 'refund',
  REFERRAL_BONUS = 'referral_bonus',
  POINTS_REDEMPTION = 'points_redemption',
  TRANSFER = 'transfer',
  FEE = 'fee',
  PAYOUT = 'payout'
}
// All monetary values stored as INTEGER CENTS
export interface Transaction {
  id: string;
  venueId: string;
  userId: string;
  eventId: string;
  type: TransactionType;  // required by database
  amount: number;         // cents
  currency: string;
  status: TransactionStatus;
  platformFee: number;    // cents
  venuePayout: number;    // cents
  gasFeePaid?: number;    // cents
  taxAmount?: number;     // cents
  totalAmount?: number;   // cents
  stripePaymentIntentId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded'
}
