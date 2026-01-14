/**
 * Fee Calculation Service
 * 
 * HIGH FIX: Implements proper Stripe fee factoring for payment splits
 * and partial refund adjustments.
 * 
 * =============================================================================
 * ROYALTY SPLIT DOCUMENTATION (FEE-4)
 * =============================================================================
 * 
 * The payment split structure is designed for the ticketing industry with
 * the following default allocation:
 * 
 * **Default Split Structure:**
 * - Venue: 70% - Primary recipient, owns the event/show
 * - Artist: 25% - Performers/talent (optional, rolls to venue if absent)
 * - Platform: 5% - TicketToken's service fee (minimum $1.00)
 * 
 * **Fee Deduction Order:**
 * 1. Stripe processing fees are deducted from total (2.9% + $0.30)
 * 2. Platform fee is calculated on gross amount (5%, min $1.00)
 * 3. Remaining amount is split among recipients proportionally
 * 
 * **Custom Split Configurations:**
 * Events can override defaults with custom percentages that must sum to 100%.
 * Supported recipient types: venue, artist, promoter, platform, other
 * 
 * **Refund Handling:**
 * - Partial refunds are distributed proportionally to all recipients
 * - Creator royalties are reversed based on refund ratio
 * - Platform retains Stripe fees (non-refundable to us)
 * 
 * @see https://docs.tickettoken.io/payments/fee-structure
 * =============================================================================
 */

import { logger } from '../utils/logger';
import { DatabaseService } from './databaseService';

const log = logger.child({ component: 'FeeCalculationService' });

// =============================================================================
// CONSTANTS (FEE-4: Documented royalty logic)
// =============================================================================

/**
 * Stripe fee structure (as of 2024)
 * Standard: 2.9% + $0.30 per transaction
 * Can be customized per-merchant agreement
 * 
 * Note: Stripe fees are NOT refunded back to us when we issue refunds.
 * We absorb this cost on refunds.
 */
const DEFAULT_STRIPE_PERCENTAGE = 0.029; // 2.9%
const DEFAULT_STRIPE_FIXED_FEE = 30; // $0.30 in cents

/**
 * Platform fee (TicketToken's revenue)
 * - 5% of gross transaction value
 * - Minimum $1.00 per transaction
 * - Partially refundable on customer refunds
 */
const DEFAULT_PLATFORM_PERCENTAGE = 0.05; // 5%
const DEFAULT_PLATFORM_MIN_FEE = 100; // $1.00 minimum

/**
 * Default revenue split percentages (FEE-4)
 * 
 * Venue receives majority as event host/organizer:
 * - Covers overhead (staff, facility, insurance)
 * - Bears most operational risk
 * 
 * Artist share compensates performers:
 * - Can be adjusted per-event contract
 * - Rolls to venue if no artist configured
 * 
 * Platform share covers:
 * - Payment processing (Stripe fees)
 * - Service infrastructure
 * - Customer support
 */
const DEFAULT_VENUE_PERCENTAGE = 0.70; // 70% to venue
const DEFAULT_ARTIST_PERCENTAGE = 0.25; // 25% to artist (creator royalty)
// Remaining 5% is platform fee

// =============================================================================
// TYPES
// =============================================================================

export interface FeeConfig {
  stripePercentage?: number;
  stripeFixedFee?: number;
  platformPercentage?: number;
  platformMinFee?: number;
}

export interface SplitRecipient {
  id: string;
  type: 'venue' | 'artist' | 'platform' | 'promoter' | 'other';
  stripeAccountId: string;
  percentage?: number;
  fixedAmount?: number;
}

export interface PaymentSplit {
  recipientId: string;
  recipientType: string;
  stripeAccountId: string;
  grossAmount: number; // Before fees
  stripeFee: number;
  platformFee: number;
  netAmount: number; // After fees
}

export interface FeeBreakdown {
  totalAmount: number;
  stripeFee: number;
  platformFee: number;
  netDistributable: number;
  splits: PaymentSplit[];
}

export interface RefundAdjustment {
  recipientId: string;
  recipientType: string;
  originalAmount: number;
  refundedAmount: number;
  refundedStripeFee: number;
  refundedPlatformFee: number;
  adjustment: number;
}

/**
 * ROY-1 & ROY-2: Royalty reversal tracking
 */
export interface RoyaltyReversal {
  recipientId: string;
  recipientType: string;
  originalRoyalty: number;
  reversedAmount: number;
  remainingRoyalty: number;
  refundRatio: number;
}

/**
 * Multi-currency support (FEE-7)
 */
export interface CurrencyConfig {
  code: string; // ISO 4217 currency code
  stripePercentage: number;
  stripeFixedFee: number; // In smallest currency unit
  minorUnitsPerMajor: number; // e.g., 100 for USD (cents)
  symbol: string;
}

// FEE-7: Supported currencies with their fee structures
export const SUPPORTED_CURRENCIES: Record<string, CurrencyConfig> = {
  USD: {
    code: 'USD',
    stripePercentage: 0.029,
    stripeFixedFee: 30, // 30 cents
    minorUnitsPerMajor: 100,
    symbol: '$',
  },
  EUR: {
    code: 'EUR',
    stripePercentage: 0.025, // Lower in EU
    stripeFixedFee: 25, // 25 cents
    minorUnitsPerMajor: 100,
    symbol: '€',
  },
  GBP: {
    code: 'GBP',
    stripePercentage: 0.025,
    stripeFixedFee: 20, // 20 pence
    minorUnitsPerMajor: 100,
    symbol: '£',
  },
  CAD: {
    code: 'CAD',
    stripePercentage: 0.029,
    stripeFixedFee: 30,
    minorUnitsPerMajor: 100,
    symbol: 'CA$',
  },
  AUD: {
    code: 'AUD',
    stripePercentage: 0.029,
    stripeFixedFee: 30,
    minorUnitsPerMajor: 100,
    symbol: 'A$',
  },
  JPY: {
    code: 'JPY',
    stripePercentage: 0.036, // Higher in Japan
    stripeFixedFee: 0, // No fixed fee
    minorUnitsPerMajor: 1, // Yen has no minor units
    symbol: '¥',
  },
};

// =============================================================================
// FEE CALCULATION SERVICE
// =============================================================================

export class FeeCalculationService {
  private config: Required<FeeConfig>;

  constructor(config: FeeConfig = {}) {
    this.config = {
      stripePercentage: config.stripePercentage ?? DEFAULT_STRIPE_PERCENTAGE,
      stripeFixedFee: config.stripeFixedFee ?? DEFAULT_STRIPE_FIXED_FEE,
      platformPercentage: config.platformPercentage ?? DEFAULT_PLATFORM_PERCENTAGE,
      platformMinFee: config.platformMinFee ?? DEFAULT_PLATFORM_MIN_FEE,
    };
  }

  /**
   * Calculate platform fee for a given amount
   */
  calculatePlatformFee(amountInCents: number): number {
    const percentageFee = Math.round(amountInCents * this.config.platformPercentage);
    return Math.max(percentageFee, this.config.platformMinFee);
  }

  /**
   * Calculate complete fee breakdown for a payment
   */
  calculateFees(
    totalAmountInCents: number,
    recipients: SplitRecipient[]
  ): FeeBreakdown {
    // Calculate total fees
    const stripeFee = this.calculateStripeFee(totalAmountInCents);
    const platformFee = this.calculatePlatformFee(totalAmountInCents);
    const totalFees = stripeFee + platformFee;
    const netDistributable = totalAmountInCents - totalFees;

    // Validate we have something to distribute
    if (netDistributable <= 0) {
      log.warn({
        totalAmount: totalAmountInCents,
        stripeFee,
        platformFee,
        netDistributable,
      }, 'Transaction amount is less than fees');
      
      return {
        totalAmount: totalAmountInCents,
        stripeFee,
        platformFee,
        netDistributable: 0,
        splits: [],
      };
    }

    // Calculate splits
    const splits: PaymentSplit[] = [];
    let allocatedAmount = 0;

    // First pass: calculate amounts
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      let grossAmount: number;

      if (recipient.fixedAmount !== undefined) {
        // Fixed amount recipient
        grossAmount = recipient.fixedAmount;
      } else if (recipient.percentage !== undefined) {
        // Percentage-based recipient
        grossAmount = Math.round(netDistributable * recipient.percentage);
      } else {
        // Default percentages based on type
        const defaultPercentage = this.getDefaultPercentage(recipient.type);
        grossAmount = Math.round(netDistributable * defaultPercentage);
      }

      // Ensure we don't over-allocate (last recipient gets remainder)
      if (i === recipients.length - 1) {
        grossAmount = netDistributable - allocatedAmount;
      } else {
        // Make sure we don't exceed remaining
        grossAmount = Math.min(grossAmount, netDistributable - allocatedAmount);
      }

      allocatedAmount += grossAmount;

      // Calculate per-recipient fees (proportional to their share)
      const shareRatio = grossAmount / netDistributable;
      const recipientStripeFee = Math.round(stripeFee * shareRatio);
      const recipientPlatformFee = Math.round(platformFee * shareRatio);

      splits.push({
        recipientId: recipient.id,
        recipientType: recipient.type,
        stripeAccountId: recipient.stripeAccountId,
        grossAmount,
        stripeFee: recipientStripeFee,
        platformFee: recipientPlatformFee,
        netAmount: grossAmount, // Net to recipient (fees already deducted from total)
      });
    }

    log.info({
      totalAmount: totalAmountInCents,
      stripeFee,
      platformFee,
      netDistributable,
      recipientCount: recipients.length,
    }, 'Fee breakdown calculated');

    return {
      totalAmount: totalAmountInCents,
      stripeFee,
      platformFee,
      netDistributable,
      splits,
    };
  }

  /**
   * Calculate proportional refund adjustments
   * 
   * When a partial refund occurs, each recipient should have their
   * transfer amount adjusted proportionally.
   */
  calculateRefundAdjustments(
    originalSplits: PaymentSplit[],
    refundAmount: number,
    currency: string = 'USD'
  ): RefundAdjustment[] {
    const totalOriginal = originalSplits.reduce(
      (sum, s) => sum + s.grossAmount,
      0
    );

    if (totalOriginal === 0) {
      return [];
    }

    const refundRatio = refundAmount / totalOriginal;
    
    // Calculate refunded portion of fees
    const refundedStripeFee = Math.round(
      this.calculateStripeFee(refundAmount, currency)
    );
    const refundedPlatformFee = Math.round(
      this.calculatePlatformFee(refundAmount)
    );

    const adjustments: RefundAdjustment[] = [];

    for (const split of originalSplits) {
      const refundedAmount = Math.round(split.grossAmount * refundRatio);
      const shareRatio = split.grossAmount / totalOriginal;
      
      adjustments.push({
        recipientId: split.recipientId,
        recipientType: split.recipientType,
        originalAmount: split.grossAmount,
        refundedAmount,
        refundedStripeFee: Math.round(refundedStripeFee * shareRatio),
        refundedPlatformFee: Math.round(refundedPlatformFee * shareRatio),
        adjustment: -refundedAmount, // Negative because it's a reversal
      });
    }

    log.info({
      refundAmount,
      refundRatio,
      adjustmentCount: adjustments.length,
    }, 'Refund adjustments calculated');

    return adjustments;
  }

  /**
   * ROY-1 & ROY-2: Calculate creator royalty reversals on refund
   * 
   * When a refund is issued, creator royalties (artist payments) must be
   * reversed proportionally. This calculates the exact reversal amounts.
   */
  calculateRoyaltyReversals(
    originalSplits: PaymentSplit[],
    refundAmount: number,
    totalPaymentAmount: number
  ): RoyaltyReversal[] {
    const refundRatio = refundAmount / totalPaymentAmount;
    const reversals: RoyaltyReversal[] = [];

    // Only process creator/artist royalties
    const royaltyRecipients = originalSplits.filter(
      s => s.recipientType === 'artist' || s.recipientType === 'promoter'
    );

    for (const recipient of royaltyRecipients) {
      const reversedAmount = Math.round(recipient.netAmount * refundRatio);
      
      reversals.push({
        recipientId: recipient.recipientId,
        recipientType: recipient.recipientType,
        originalRoyalty: recipient.netAmount,
        reversedAmount,
        remainingRoyalty: recipient.netAmount - reversedAmount,
        refundRatio,
      });
    }

    log.info({
      refundAmount,
      refundRatio,
      royaltyReversalCount: reversals.length,
      totalReversed: reversals.reduce((sum, r) => sum + r.reversedAmount, 0),
    }, 'Royalty reversals calculated');

    return reversals;
  }

  /**
   * ROY-1: Save royalty reversal to database for audit trail
   */
  async saveRoyaltyReversal(
    refundId: string,
    paymentId: string,
    reversals: RoyaltyReversal[],
    tenantId: string
  ): Promise<void> {
    const db = DatabaseService.getPool();

    for (const reversal of reversals) {
      await db.query(`
        INSERT INTO royalty_reversals (
          id, refund_id, payment_id, recipient_id, recipient_type,
          original_royalty, reversed_amount, remaining_royalty,
          refund_ratio, tenant_id, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        )
      `, [
        refundId,
        paymentId,
        reversal.recipientId,
        reversal.recipientType,
        reversal.originalRoyalty,
        reversal.reversedAmount,
        reversal.remainingRoyalty,
        reversal.refundRatio,
        tenantId,
      ]);
    }

    log.info({
      refundId,
      paymentId,
      reversalCount: reversals.length,
    }, 'Royalty reversals saved');
  }

  /**
   * Calculate transfer amounts for Stripe Connect
   * 
   * Returns the actual amounts to transfer to each connected account,
   * accounting for Stripe's fee structure for transfers.
   */
  calculateTransferAmounts(
    splits: PaymentSplit[]
  ): { stripeAccountId: string; amount: number; metadata: Record<string, string> }[] {
    return splits.map(split => ({
      stripeAccountId: split.stripeAccountId,
      amount: split.netAmount,
      metadata: {
        recipient_id: split.recipientId,
        recipient_type: split.recipientType,
        gross_amount: split.grossAmount.toString(),
        stripe_fee_share: split.stripeFee.toString(),
        platform_fee_share: split.platformFee.toString(),
      },
    }));
  }

  /**
   * FEE-7: Calculate Stripe processing fee for a given amount and currency
   */
  calculateStripeFee(amountInCents: number, currency: string = 'USD'): number {
    const currencyConfig = SUPPORTED_CURRENCIES[currency.toUpperCase()];
    
    if (currencyConfig) {
      // Use currency-specific fee structure
      const percentageFee = Math.round(amountInCents * currencyConfig.stripePercentage);
      return percentageFee + currencyConfig.stripeFixedFee;
    }
    
    // Fall back to default config
    const percentageFee = Math.round(amountInCents * this.config.stripePercentage);
    return percentageFee + this.config.stripeFixedFee;
  }

  /**
   * FEE-7: Check if currency is supported
   */
  isCurrencySupported(currency: string): boolean {
    return currency.toUpperCase() in SUPPORTED_CURRENCIES;
  }

  /**
   * FEE-7: Get currency configuration
   */
  getCurrencyConfig(currency: string): CurrencyConfig | null {
    return SUPPORTED_CURRENCIES[currency.toUpperCase()] || null;
  }

  /**
   * Validate that split percentages sum to 1 (100%)
   */
  validateSplitPercentages(recipients: SplitRecipient[]): boolean {
    const percentageRecipients = recipients.filter(r => r.percentage !== undefined);
    
    if (percentageRecipients.length === 0) {
      return true;
    }

    const totalPercentage = percentageRecipients.reduce(
      (sum, r) => sum + (r.percentage || 0),
      0
    );

    const isValid = Math.abs(totalPercentage - 1) < 0.01;

    if (!isValid) {
      log.warn({
        totalPercentage,
        recipients: recipients.map(r => ({
          id: r.id,
          percentage: r.percentage,
        })),
      }, 'Split percentages do not sum to 100%');
    }

    return isValid;
  }

  /**
   * Get default percentage for a recipient type
   */
  private getDefaultPercentage(type: SplitRecipient['type']): number {
    switch (type) {
      case 'venue':
        return DEFAULT_VENUE_PERCENTAGE;
      case 'artist':
        return DEFAULT_ARTIST_PERCENTAGE;
      case 'platform':
        return DEFAULT_PLATFORM_PERCENTAGE;
      case 'promoter':
        return 0; // Must be explicitly set
      case 'other':
        return 0; // Must be explicitly set
      default:
        return 0;
    }
  }

  /**
   * Create default split configuration for an event
   */
  createDefaultSplits(
    venueAccountId: string,
    venueId: string,
    artistAccountId?: string,
    artistId?: string
  ): SplitRecipient[] {
    const splits: SplitRecipient[] = [
      {
        id: venueId,
        type: 'venue',
        stripeAccountId: venueAccountId,
        percentage: DEFAULT_VENUE_PERCENTAGE,
      },
    ];

    if (artistAccountId && artistId) {
      splits.push({
        id: artistId,
        type: 'artist',
        stripeAccountId: artistAccountId,
        percentage: DEFAULT_ARTIST_PERCENTAGE,
      });
    } else {
      // If no artist, venue gets the artist share too
      splits[0].percentage = DEFAULT_VENUE_PERCENTAGE + DEFAULT_ARTIST_PERCENTAGE;
    }

    return splits;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const feeCalculationService = new FeeCalculationService();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format amount in cents to display currency
 */
export function formatCurrency(amountInCents: number, currency: string = 'USD'): string {
  const amount = amountInCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Calculate the gross amount needed to achieve a specific net amount after fees
 */
export function calculateGrossFromNet(
  netAmountInCents: number,
  stripePercentage: number = DEFAULT_STRIPE_PERCENTAGE,
  stripeFixedFee: number = DEFAULT_STRIPE_FIXED_FEE
): number {
  // net = gross - (gross * percentage + fixed)
  // net = gross * (1 - percentage) - fixed
  // gross = (net + fixed) / (1 - percentage)
  return Math.ceil((netAmountInCents + stripeFixedFee) / (1 - stripePercentage));
}
