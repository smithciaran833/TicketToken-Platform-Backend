import { Knex } from 'knex';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'ResaleService' });

/**
 * SECURITY FIX (29-resale-business-rules.md): Complete resale business rules implementation
 * - Jurisdiction detection for state/country-specific price caps
 * - Transfer history tracking with count limits
 * - Price validation against face value and caps
 * - Seller verification requirements
 */

// Jurisdiction-specific price cap rules (US states with anti-scalping laws)
const JURISDICTION_RULES: Record<string, JurisdictionRule> = {
  // US States with price cap laws
  'US-NY': { maxMultiplier: null, notes: 'NY repealed price caps in 2016' },
  'US-CT': { maxMultiplier: 1.0, notes: 'Connecticut: Face value only' },
  'US-LA': { maxMultiplier: 1.0, notes: 'Louisiana: Face value + reasonable service fees' },
  'US-MI': { maxMultiplier: 1.0, notes: 'Michigan: Face value only for some events' },
  'US-MN': { maxMultiplier: 1.0, notes: 'Minnesota: Face value + service fee cap' },
  'US-NC': { maxMultiplier: null, notes: 'North Carolina: No price caps but disclosure required' },

  // EU Countries with consumer protection
  'FR': { maxMultiplier: 1.0, notes: 'France: Face value only for sports/cultural events' },
  'DE': { maxMultiplier: null, notes: 'Germany: Platform-specific rules' },
  'UK': { maxMultiplier: 1.1, notes: 'UK: Face value + 10% for major events' },
  'IT': { maxMultiplier: 1.0, notes: 'Italy: Face value for major events' },
  'BE': { maxMultiplier: 1.0, notes: 'Belgium: Face value only' },

  // Default - no restriction
  'DEFAULT': { maxMultiplier: null, notes: 'No jurisdiction-specific restrictions' },
};

interface JurisdictionRule {
  maxMultiplier: number | null;
  notes: string;
}

interface ResalePolicy {
  resaleAllowed: boolean;
  maxPriceMultiplier: number | null;
  maxPriceFixed: number | null;
  maxTransfers: number | null;
  sellerVerificationRequired: boolean;
  resaleCutoffHours: number | null;
  listingCutoffHours: number | null;
  jurisdictionRule: JurisdictionRule | null;
  antiScalpingEnabled: boolean;
}

interface TransferValidationResult {
  allowed: boolean;
  reason?: string;
  maxAllowedPrice?: number;
  currentTransferCount?: number;
  jurisdictionRule?: JurisdictionRule;
  requiresVerification?: boolean;
}

interface PriceValidationResult {
  valid: boolean;
  reason?: string;
  maxAllowedPrice: number | null;
  faceValue: number;
  requestedPrice: number;
  appliedRule: 'face_value' | 'multiplier' | 'fixed' | 'jurisdiction' | 'none';
}

export class ResaleService {
  constructor(private readonly db: Knex) {}

  /**
   * SECURITY FIX: Validate tenant context (copied from onboarding.service.ts)
   */
  private validateTenantContext(tenantId: string): void {
    if (!tenantId) {
      throw new Error('Tenant context required for resale operations');
    }
    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }
  }

  /**
   * SECURITY FIX: Detect jurisdiction from buyer/seller location or event venue
   */
  detectJurisdiction(
    countryCode: string,
    stateCode?: string,
    venueCountry?: string,
    venueState?: string
  ): string {
    // Priority: Event venue location > Buyer location
    const country = venueCountry || countryCode;
    const state = venueState || stateCode;

    if (country === 'US' && state) {
      return `US-${state.toUpperCase()}`;
    }

    return country?.toUpperCase() || 'DEFAULT';
  }

  /**
   * Get jurisdiction-specific rules
   */
  getJurisdictionRule(jurisdiction: string): JurisdictionRule {
    return JURISDICTION_RULES[jurisdiction] || JURISDICTION_RULES['DEFAULT'];
  }

  /**
   * SECURITY FIX: Get effective resale policy for a ticket
   */
  async getResalePolicy(
    venueId: string,
    eventId: string,
    tenantId: string,
    jurisdiction: string
  ): Promise<ResalePolicy> {
    this.validateTenantContext(tenantId);

    // Try to get event-specific policy first
    let policy = await this.db('resale_policies')
      .where({
        venue_id: venueId,
        event_id: eventId,
        tenant_id: tenantId,
      })
      .first();

    // Fall back to venue default policy
    if (!policy) {
      policy = await this.db('resale_policies')
        .where({
          venue_id: venueId,
          tenant_id: tenantId,
        })
        .whereNull('event_id')
        .first();
    }

    // Fall back to venue_settings
    if (!policy) {
      const settings = await this.db('venue_settings')
        .where('venue_id', venueId)
        .first();

      if (settings) {
        policy = {
          resale_allowed: settings.ticket_resale_allowed,
          max_price_multiplier: settings.max_resale_price_multiplier,
          max_price_fixed: settings.max_resale_price_fixed,
          max_transfers: settings.max_transfers_per_ticket,
          seller_verification_required: settings.require_seller_verification,
          resale_cutoff_hours: settings.resale_cutoff_hours,
          listing_cutoff_hours: settings.listing_cutoff_hours,
          anti_scalping_enabled: settings.anti_scalping_enabled,
          jurisdiction_rules: settings.jurisdiction_rules,
        };
      }
    }

    // Get jurisdiction rule
    const jurisdictionRule = this.getJurisdictionRule(jurisdiction);

    // Check for jurisdiction-specific overrides
    let jurisdictionOverride: any = null;
    if (policy?.jurisdiction_rules || policy?.jurisdiction_overrides) {
      const rules = policy.jurisdiction_rules || policy.jurisdiction_overrides;
      const parsedRules = typeof rules === 'string' ? JSON.parse(rules) : rules;
      jurisdictionOverride = parsedRules?.[jurisdiction];
    }

    return {
      resaleAllowed: policy?.resale_allowed ?? true,
      maxPriceMultiplier: jurisdictionOverride?.maxPriceMultiplier ?? policy?.max_price_multiplier ?? null,
      maxPriceFixed: jurisdictionOverride?.maxPriceFixed ?? policy?.max_price_fixed ?? null,
      maxTransfers: policy?.max_transfers ?? null,
      sellerVerificationRequired: policy?.seller_verification_required ?? false,
      resaleCutoffHours: policy?.resale_cutoff_hours ?? null,
      listingCutoffHours: policy?.listing_cutoff_hours ?? null,
      jurisdictionRule: jurisdictionRule.maxMultiplier !== null ? jurisdictionRule : null,
      antiScalpingEnabled: policy?.anti_scalping_enabled ?? false,
    };
  }

  /**
   * SECURITY FIX: Get transfer count for a ticket
   * PHASE 4 FIX: Can optionally use FOR UPDATE lock within a transaction
   */
  async getTransferCount(
    ticketId: string,
    tenantId: string,
    trx?: Knex.Transaction,
    forUpdate: boolean = false
  ): Promise<number> {
    this.validateTenantContext(tenantId);

    const db = trx || this.db;
    let query = db('transfer_history')
      .where({
        ticket_id: ticketId,
        tenant_id: tenantId,
      })
      .whereIn('transfer_type', ['resale', 'transfer']);

    // PHASE 4 FIX: Apply FOR UPDATE lock if requested (prevents race conditions)
    if (forUpdate && trx) {
      query = query.forUpdate();
    }

    const result = await query.count('* as count').first();

    return parseInt(result?.count as string || '0', 10);
  }

  /**
   * SECURITY FIX: Validate if a resale transfer is allowed
   */
  async validateTransfer(
    ticketId: string,
    eventId: string,
    venueId: string,
    tenantId: string,
    sellerId: string,
    requestedPrice: number,
    faceValue: number,
    eventStartTime: Date,
    buyerJurisdiction: string
  ): Promise<TransferValidationResult> {
    this.validateTenantContext(tenantId);

    // Get resale policy
    const policy = await this.getResalePolicy(venueId, eventId, tenantId, buyerJurisdiction);

    // Check if resale is allowed
    if (!policy.resaleAllowed) {
      return { allowed: false, reason: 'Resale is not allowed for this event' };
    }

    // Check transfer count
    const transferCount = await this.getTransferCount(ticketId, tenantId);
    if (policy.maxTransfers !== null && transferCount >= policy.maxTransfers) {
      return {
        allowed: false,
        reason: `Maximum transfer limit reached (${policy.maxTransfers} transfers allowed)`,
        currentTransferCount: transferCount,
      };
    }

    // Check cutoff time
    const now = new Date();
    if (policy.resaleCutoffHours !== null) {
      const cutoffTime = new Date(eventStartTime);
      cutoffTime.setHours(cutoffTime.getHours() - policy.resaleCutoffHours);

      if (now > cutoffTime) {
        return {
          allowed: false,
          reason: `Resale window closed ${policy.resaleCutoffHours} hours before event start`,
        };
      }
    }

    // Check seller verification
    if (policy.sellerVerificationRequired) {
      const isVerified = await this.isSellerVerified(sellerId, venueId, tenantId);
      if (!isVerified) {
        return {
          allowed: false,
          reason: 'Seller verification required for resale',
          requiresVerification: true,
        };
      }
    }

    // Validate price
    const priceValidation = await this.validatePrice(
      requestedPrice,
      faceValue,
      policy,
      buyerJurisdiction
    );

    if (!priceValidation.valid) {
      return {
        allowed: false,
        reason: priceValidation.reason,
        maxAllowedPrice: priceValidation.maxAllowedPrice || undefined,
        jurisdictionRule: policy.jurisdictionRule || undefined,
      };
    }

    return {
      allowed: true,
      maxAllowedPrice: priceValidation.maxAllowedPrice || undefined,
      currentTransferCount: transferCount,
      jurisdictionRule: policy.jurisdictionRule || undefined,
      requiresVerification: false,
    };
  }

  /**
   * SECURITY FIX: Validate resale price against all applicable caps
   */
  async validatePrice(
    requestedPrice: number,
    faceValue: number,
    policy: ResalePolicy,
    jurisdiction: string
  ): Promise<PriceValidationResult> {
    let maxAllowedPrice: number | null = null;
    let appliedRule: PriceValidationResult['appliedRule'] = 'none';

    // Check jurisdiction rule first (takes precedence)
    const jurisdictionRule = this.getJurisdictionRule(jurisdiction);
    if (jurisdictionRule.maxMultiplier !== null) {
      maxAllowedPrice = faceValue * jurisdictionRule.maxMultiplier;
      appliedRule = 'jurisdiction';
      log.debug({
        jurisdiction,
        maxMultiplier: jurisdictionRule.maxMultiplier,
        maxAllowedPrice,
      }, 'Applied jurisdiction price cap');
    }

    // Check venue/event policy rules
    if (policy.maxPriceMultiplier !== null) {
      const multiplierMax = faceValue * policy.maxPriceMultiplier;
      if (maxAllowedPrice === null || multiplierMax < maxAllowedPrice) {
        maxAllowedPrice = multiplierMax;
        appliedRule = 'multiplier';
      }
    }

    if (policy.maxPriceFixed !== null) {
      if (maxAllowedPrice === null || policy.maxPriceFixed < maxAllowedPrice) {
        maxAllowedPrice = policy.maxPriceFixed;
        appliedRule = 'fixed';
      }
    }

    // If no rules, allow any price
    if (maxAllowedPrice === null) {
      return {
        valid: true,
        maxAllowedPrice: null,
        faceValue,
        requestedPrice,
        appliedRule: 'none',
      };
    }

    // Validate requested price
    if (requestedPrice > maxAllowedPrice) {
      return {
        valid: false,
        reason: `Requested price ($${requestedPrice.toFixed(2)}) exceeds maximum allowed ($${maxAllowedPrice.toFixed(2)})`,
        maxAllowedPrice,
        faceValue,
        requestedPrice,
        appliedRule,
      };
    }

    return {
      valid: true,
      maxAllowedPrice,
      faceValue,
      requestedPrice,
      appliedRule,
    };
  }

  /**
   * SECURITY FIX: Check if seller is verified
   */
  async isSellerVerified(
    userId: string,
    venueId: string | null,
    tenantId: string
  ): Promise<boolean> {
    const verification = await this.db('seller_verifications')
      .where({
        user_id: userId,
        tenant_id: tenantId,
        verified: true,
      })
      .where(function() {
        this.whereNull('venue_id')
          .orWhere('venue_id', venueId);
      })
      .where(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', new Date());
      })
      .first();

    return !!verification;
  }

  /**
   * PHASE 4 FIX: Atomic validate and record transfer operation
   * Combines getTransferCount(), validateTransfer(), and recordTransfer() in a single transaction
   * with FOR UPDATE lock to prevent race conditions
   */
  async validateAndRecordTransfer(
    ticketId: string,
    eventId: string,
    venueId: string,
    tenantId: string,
    sellerId: string,
    buyerId: string,
    transferType: 'purchase' | 'transfer' | 'resale' | 'gift' | 'refund',
    requestedPrice: number,
    faceValue: number,
    eventStartTime: Date,
    buyerJurisdiction: string,
    sellerVerified: boolean = false,
    verificationMethod: string | null = null,
    metadata?: any
  ): Promise<{ success: boolean; transferId?: string; error?: string; validation?: TransferValidationResult }> {
    this.validateTenantContext(tenantId);

    return this.db.transaction(async (trx) => {
      // PHASE 4 FIX: Get transfer count with FOR UPDATE lock
      const transferCount = await this.getTransferCount(ticketId, tenantId, trx, true);

      // Get resale policy
      const policy = await this.getResalePolicy(venueId, eventId, tenantId, buyerJurisdiction);

      // Check if resale is allowed
      if (!policy.resaleAllowed) {
        return {
          success: false,
          error: 'Resale is not allowed for this event',
          validation: { allowed: false, reason: 'Resale is not allowed for this event' }
        };
      }

      // Check transfer count limit
      if (policy.maxTransfers !== null && transferCount >= policy.maxTransfers) {
        return {
          success: false,
          error: `Maximum transfer limit reached (${policy.maxTransfers} transfers allowed)`,
          validation: {
            allowed: false,
            reason: `Maximum transfer limit reached (${policy.maxTransfers} transfers allowed)`,
            currentTransferCount: transferCount,
          }
        };
      }

      // Check cutoff time
      const now = new Date();
      if (policy.resaleCutoffHours !== null) {
        const cutoffTime = new Date(eventStartTime);
        cutoffTime.setHours(cutoffTime.getHours() - policy.resaleCutoffHours);

        if (now > cutoffTime) {
          return {
            success: false,
            error: `Resale window closed ${policy.resaleCutoffHours} hours before event start`,
            validation: {
              allowed: false,
              reason: `Resale window closed ${policy.resaleCutoffHours} hours before event start`,
            }
          };
        }
      }

      // Check seller verification
      if (policy.sellerVerificationRequired) {
        const isVerified = await this.isSellerVerified(sellerId, venueId, tenantId);
        if (!isVerified) {
          return {
            success: false,
            error: 'Seller verification required for resale',
            validation: {
              allowed: false,
              reason: 'Seller verification required for resale',
              requiresVerification: true,
            }
          };
        }
      }

      // Validate price
      const priceValidation = await this.validatePrice(
        requestedPrice,
        faceValue,
        policy,
        buyerJurisdiction
      );

      if (!priceValidation.valid) {
        return {
          success: false,
          error: priceValidation.reason,
          validation: {
            allowed: false,
            reason: priceValidation.reason,
            maxAllowedPrice: priceValidation.maxAllowedPrice || undefined,
            jurisdictionRule: policy.jurisdictionRule || undefined,
          }
        };
      }

      // All validations passed - record the transfer
      const [result] = await trx('transfer_history')
        .insert({
          ticket_id: ticketId,
          event_id: eventId,
          venue_id: venueId,
          tenant_id: tenantId,
          from_user_id: sellerId,
          to_user_id: buyerId,
          transfer_type: transferType,
          price: requestedPrice,
          original_face_value: faceValue,
          currency: 'USD',
          transfer_number: transferCount + 1,
          jurisdiction: buyerJurisdiction,
          seller_verified: sellerVerified,
          verification_method: verificationMethod,
          metadata: metadata ? JSON.stringify(metadata) : null,
          transferred_at: new Date(),
        })
        .returning('id');

      log.info({
        ticketId,
        eventId,
        venueId,
        transferType,
        transferNumber: transferCount + 1,
        price: requestedPrice,
        jurisdiction: buyerJurisdiction,
      }, 'Transfer validated and recorded atomically');

      return {
        success: true,
        transferId: result.id,
        validation: {
          allowed: true,
          maxAllowedPrice: priceValidation.maxAllowedPrice || undefined,
          currentTransferCount: transferCount,
          jurisdictionRule: policy.jurisdictionRule || undefined,
          requiresVerification: false,
        }
      };
    });
  }

  /**
   * SECURITY FIX: Record transfer in history
   * NOTE: For backwards compatibility. New code should use validateAndRecordTransfer() for atomicity.
   */
  async recordTransfer(
    ticketId: string,
    eventId: string,
    venueId: string,
    tenantId: string,
    fromUserId: string | null,
    toUserId: string,
    transferType: 'purchase' | 'transfer' | 'resale' | 'gift' | 'refund',
    price: number | null,
    faceValue: number | null,
    jurisdiction: string | null,
    sellerVerified: boolean = false,
    verificationMethod: string | null = null,
    metadata?: any
  ): Promise<string> {
    // Get current transfer count
    const transferCount = await this.getTransferCount(ticketId, tenantId);

    const [result] = await this.db('transfer_history')
      .insert({
        ticket_id: ticketId,
        event_id: eventId,
        venue_id: venueId,
        tenant_id: tenantId,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        transfer_type: transferType,
        price,
        original_face_value: faceValue,
        currency: 'USD',
        transfer_number: transferCount + 1,
        jurisdiction,
        seller_verified: sellerVerified,
        verification_method: verificationMethod,
        metadata: metadata ? JSON.stringify(metadata) : null,
        transferred_at: new Date(),
      })
      .returning('id');

    log.info({
      ticketId,
      eventId,
      venueId,
      transferType,
      transferNumber: transferCount + 1,
      price,
      jurisdiction,
    }, 'Transfer recorded');

    return result.id;
  }

  /**
   * Get transfer history for a ticket
   */
  async getTransferHistory(
    ticketId: string,
    tenantId: string
  ): Promise<any[]> {
    return this.db('transfer_history')
      .where({
        ticket_id: ticketId,
        tenant_id: tenantId,
      })
      .orderBy('transferred_at', 'asc');
  }

  /**
   * Create seller verification request
   */
  async createVerificationRequest(
    userId: string,
    venueId: string | null,
    tenantId: string,
    verificationType: 'identity' | 'address' | 'bank' | 'tax_id',
    provider: string | null = null
  ): Promise<string> {
    const [result] = await this.db('seller_verifications')
      .insert({
        user_id: userId,
        venue_id: venueId,
        tenant_id: tenantId,
        verification_type: verificationType,
        status: 'pending',
        provider,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('id');

    log.info({
      userId,
      venueId,
      verificationType,
    }, 'Seller verification request created');

    return result.id;
  }

  /**
   * Update seller verification status
   */
  async updateVerificationStatus(
    verificationId: string,
    tenantId: string,
    status: 'in_review' | 'verified' | 'rejected' | 'expired',
    reviewedBy?: string,
    rejectionReason?: string,
    expiresAt?: Date
  ): Promise<void> {
    const update: any = {
      status,
      updated_at: new Date(),
    };

    if (status === 'verified') {
      update.verified = true;
      update.verified_at = new Date();
      update.expires_at = expiresAt || null;
    }

    if (reviewedBy) {
      update.reviewed_by = reviewedBy;
    }

    if (rejectionReason) {
      update.rejection_reason = rejectionReason;
    }

    await this.db('seller_verifications')
      .where({ id: verificationId, tenant_id: tenantId })
      .update(update);

    log.info({
      verificationId,
      status,
    }, 'Seller verification status updated');
  }

  /**
   * Get seller verification status
   */
  async getSellerVerificationStatus(
    userId: string,
    tenantId: string
  ): Promise<any[]> {
    return this.db('seller_verifications')
      .where({
        user_id: userId,
        tenant_id: tenantId,
      })
      .orderBy('created_at', 'desc');
  }

  // ==========================================================================
  // ANTI-SCALPING MEASURES (Security Fix)
  // ==========================================================================

  /**
   * SECURITY FIX: Detect potential scalping behavior
   */
  async detectScalpingBehavior(
    userId: string,
    tenantId: string,
    eventId?: string
  ): Promise<ScalpingDetectionResult> {
    const flags: string[] = [];
    let riskScore = 0;

    // Check 1: High volume purchases for same event
    // FIXED: Use ticket_transactions instead of ticket_purchases
    if (eventId) {
      const ticketCount = await this.db('ticket_transactions')
        .where({
          user_id: userId,
          event_id: eventId,
          tenant_id: tenantId,
        })
        .count('* as count')
        .first();

      const count = parseInt(ticketCount?.count as string || '0', 10);
      if (count > 10) {
        flags.push(`High volume: ${count} tickets for single event`);
        riskScore += 30;
      } else if (count > 5) {
        flags.push(`Elevated volume: ${count} tickets for single event`);
        riskScore += 15;
      }
    }

    // Check 2: High resale activity
    const resaleStats = await this.db('transfer_history')
      .where({
        from_user_id: userId,
        tenant_id: tenantId,
        transfer_type: 'resale',
      })
      .where('transferred_at', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) // Last 30 days
      .count('* as count')
      .first();

    const resaleCount = parseInt(resaleStats?.count as string || '0', 10);
    if (resaleCount > 50) {
      flags.push(`Very high resale activity: ${resaleCount} in 30 days`);
      riskScore += 40;
    } else if (resaleCount > 20) {
      flags.push(`High resale activity: ${resaleCount} in 30 days`);
      riskScore += 20;
    } else if (resaleCount > 10) {
      flags.push(`Elevated resale activity: ${resaleCount} in 30 days`);
      riskScore += 10;
    }

    // Check 3: Price markup patterns
    const avgMarkup = await this.db('transfer_history')
      .where({
        from_user_id: userId,
        tenant_id: tenantId,
        transfer_type: 'resale',
      })
      .whereNotNull('price')
      .whereNotNull('original_face_value')
      .where('original_face_value', '>', 0)
      .select(this.db.raw('AVG((price - original_face_value) / original_face_value * 100) as avg_markup'))
      .first() as any;

    const markup = parseFloat(avgMarkup?.avg_markup || '0');
    if (markup > 100) {
      flags.push(`Excessive avg markup: ${markup.toFixed(1)}%`);
      riskScore += 25;
    } else if (markup > 50) {
      flags.push(`High avg markup: ${markup.toFixed(1)}%`);
      riskScore += 10;
    }

    // Check 4: Immediate resale pattern (buy and list quickly)
    const quickFlips = await this.db('transfer_history')
      .where({
        from_user_id: userId,
        tenant_id: tenantId,
        transfer_type: 'resale',
      })
      .whereRaw(`transferred_at - created_at < interval '24 hours'`)
      .count('* as count')
      .first();

    const flipCount = parseInt(quickFlips?.count as string || '0', 10);
    if (flipCount > 10) {
      flags.push(`Frequent quick flips: ${flipCount} within 24h of purchase`);
      riskScore += 20;
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 60) {
      riskLevel = 'critical';
    } else if (riskScore >= 40) {
      riskLevel = 'high';
    } else if (riskScore >= 20) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return {
      userId,
      riskScore,
      riskLevel,
      flags,
      isBlocked: riskScore >= 80,
      requiresReview: riskScore >= 40,
    };
  }

  /**
   * SECURITY FIX: Check if user is blocked from reselling
   */
  async isUserBlockedFromResale(
    userId: string,
    tenantId: string
  ): Promise<{ blocked: boolean; reason?: string }> {
    const block = await this.db('resale_blocks')
      .where({
        user_id: userId,
        tenant_id: tenantId,
        active: true,
      })
      .where(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', new Date());
      })
      .first();

    if (block) {
      return {
        blocked: true,
        reason: block.reason || 'Account blocked from resale',
      };
    }

    return { blocked: false };
  }

  /**
   * SECURITY FIX: Block user from reselling
   */
  async blockUserFromResale(
    userId: string,
    tenantId: string,
    reason: string,
    blockedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    await this.db('resale_blocks').insert({
      user_id: userId,
      tenant_id: tenantId,
      reason,
      blocked_by: blockedBy,
      blocked_at: new Date(),
      expires_at: expiresAt || null,
      active: true,
    });

    log.warn({
      userId,
      reason,
      blockedBy,
      expiresAt,
    }, 'User blocked from resale');
  }

  // ==========================================================================
  // FRAUD PREVENTION (Security Fix)
  // ==========================================================================

  /**
   * SECURITY FIX: Detect fraud signals for a resale transaction
   */
  async detectFraudSignals(
    ticketId: string,
    sellerId: string,
    buyerId: string,
    price: number,
    tenantId: string,
    buyerIp?: string,
    buyerDeviceFingerprint?: string
  ): Promise<FraudDetectionResult> {
    const signals: FraudSignal[] = [];
    let riskScore = 0;

    // Signal 1: Seller/buyer same device
    // FIXED: Use trusted_devices instead of user_devices
    if (buyerDeviceFingerprint) {
      const sellerDevices = await this.db('trusted_devices')
        .where({
          user_id: sellerId,
          tenant_id: tenantId,
          device_fingerprint: buyerDeviceFingerprint,
        })
        .first();

      if (sellerDevices) {
        signals.push({
          type: 'same_device',
          severity: 'high',
          description: 'Buyer and seller using same device',
        });
        riskScore += 50;
      }
    }

    // Signal 2: Suspicious pricing (below face value)
    const ticket = await this.db('tickets')
      .where({ id: ticketId, tenant_id: tenantId })
      .first();

    if (ticket && price < ticket.face_value * 0.5) {
      signals.push({
        type: 'suspicious_pricing',
        severity: 'medium',
        description: `Price (${price}) significantly below face value (${ticket.face_value})`,
      });
      riskScore += 20;
    }

    // Signal 3: New account selling
    const sellerAccount = await this.db('users')
      .where({ id: sellerId })
      .first();

    if (sellerAccount) {
      const accountAge = Date.now() - new Date(sellerAccount.created_at).getTime();
      const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);

      if (daysSinceCreation < 7) {
        signals.push({
          type: 'new_account',
          severity: 'medium',
          description: `Seller account less than 7 days old (${daysSinceCreation.toFixed(1)} days)`,
        });
        riskScore += 25;
      }
    }

    // Signal 4: Velocity check - many sales in short time
    const recentSales = await this.db('transfer_history')
      .where({
        from_user_id: sellerId,
        tenant_id: tenantId,
        transfer_type: 'resale',
      })
      .where('transferred_at', '>', new Date(Date.now() - 60 * 60 * 1000)) // Last hour
      .count('* as count')
      .first();

    const salesCount = parseInt(recentSales?.count as string || '0', 10);
    if (salesCount > 10) {
      signals.push({
        type: 'velocity',
        severity: 'high',
        description: `High sale velocity: ${salesCount} in last hour`,
      });
      riskScore += 30;
    }

    // Signal 5: IP reputation (if we have data)
    // FIXED: Use ip_reputation instead of suspicious_ips
    if (buyerIp) {
      const ipReputation = await this.db('ip_reputation')
        .where('ip_address', buyerIp)
        .whereNotNull('blocked_at')
        .first();

      if (ipReputation) {
        signals.push({
          type: 'suspicious_ip',
          severity: 'high',
          description: `Transaction from flagged IP: ${ipReputation.blocked_reason || 'suspicious activity'}`,
        });
        riskScore += 40;
      }
    }

    // Signal 6: Cross-check with known fraud patterns
    // FIXED: Use fraud_rules instead of fraud_patterns
    const fraudPattern = await this.db('fraud_rules')
      .where({ tenant_id: tenantId, is_active: true })
      .where(function() {
        this.whereNull('seller_pattern')
          .orWhereRaw('? ~ seller_pattern', [sellerId]);
      })
      .where(function() {
        this.whereNull('buyer_pattern')
          .orWhereRaw('? ~ buyer_pattern', [buyerId]);
      })
      .first();

    if (fraudPattern) {
      signals.push({
        type: 'pattern_match',
        severity: 'critical',
        description: `Matches fraud pattern: ${fraudPattern.name}`,
      });
      riskScore += 60;
    }

    // Determine action
    let action: 'allow' | 'review' | 'block';
    if (riskScore >= 80) {
      action = 'block';
    } else if (riskScore >= 40) {
      action = 'review';
    } else {
      action = 'allow';
    }

    return {
      ticketId,
      sellerId,
      buyerId,
      riskScore,
      signals,
      action,
      reviewRequired: action === 'review',
      blocked: action === 'block',
    };
  }

  /**
   * SECURITY FIX: Log fraud detection for audit
   */
  async logFraudDetection(
    result: FraudDetectionResult,
    transactionId: string,
    tenantId: string
  ): Promise<void> {
    await this.db('fraud_logs').insert({
      transaction_id: transactionId,
      tenant_id: tenantId,
      ticket_id: result.ticketId,
      seller_id: result.sellerId,
      buyer_id: result.buyerId,
      risk_score: result.riskScore,
      signals: JSON.stringify(result.signals),
      action: result.action,
      created_at: new Date(),
    });

    if (result.riskScore >= 40) {
      log.warn({
        transactionId,
        ...result,
      }, 'Fraud detection triggered');
    }
  }
}

// ==========================================================================
// TYPES
// ==========================================================================

interface ScalpingDetectionResult {
  userId: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  flags: string[];
  isBlocked: boolean;
  requiresReview: boolean;
}

interface FraudSignal {
  type: 'same_device' | 'suspicious_pricing' | 'new_account' | 'velocity' | 'suspicious_ip' | 'pattern_match';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

interface FraudDetectionResult {
  ticketId: string;
  sellerId: string;
  buyerId: string;
  riskScore: number;
  signals: FraudSignal[];
  action: 'allow' | 'review' | 'block';
  reviewRequired: boolean;
  blocked: boolean;
}

/**
 * Factory function to create ResaleService
 */
export function createResaleService(db: Knex): ResaleService {
  return new ResaleService(db);
}
