import { DatabaseService } from './databaseService';
import { logger } from '../utils/logger';

interface Discount {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'bogo' | 'early_bird';
  value: number;
  priority: number;  // Lower number = higher priority
  stackable: boolean;
  maxUses?: number;
  currentUses?: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom: Date;
  validUntil: Date;
  eventId?: string;
  ticketTypeIds?: string[];
}

interface DiscountApplication {
  discountId: string;
  code: string;
  type: string;
  amountInCents: number;
  appliedTo: 'order' | 'tickets';
}

export class DiscountService {
  private log = logger.child({ component: 'DiscountService' });

  // ISSUE #23 FIX: Validate and apply discounts with proper stacking rules
  async applyDiscounts(
    orderAmountCents: number,
    discountCodes: string[],
    eventId?: string,
    ticketTypeIds?: string[]
  ): Promise<{
    finalAmountCents: number;
    discountsApplied: DiscountApplication[];
    totalDiscountCents: number;
  }> {
    if (!discountCodes || discountCodes.length === 0) {
      return {
        finalAmountCents: orderAmountCents,
        discountsApplied: [],
        totalDiscountCents: 0
      };
    }

    // Get all valid discounts
    const validDiscounts = await this.getValidDiscounts(discountCodes, eventId);
    
    // Sort by priority (lower number = higher priority)
    validDiscounts.sort((a, b) => a.priority - b.priority);

    const discountsApplied: DiscountApplication[] = [];
    let currentAmountCents = orderAmountCents;
    let hasNonStackable = false;

    for (const discount of validDiscounts) {
      // ISSUE #23 FIX: Check stacking rules
      if (hasNonStackable) {
        this.log.info('Skipping discount due to non-stackable discount already applied', {
          code: discount.code,
          skipped: true
        });
        continue;
      }

      if (!discount.stackable) {
        // If this is non-stackable and we already have discounts, skip it
        if (discountsApplied.length > 0) {
          this.log.info('Skipping non-stackable discount as other discounts already applied', {
            code: discount.code
          });
          continue;
        }
        hasNonStackable = true;
      }

      // Check minimum purchase requirement
      if (discount.minPurchaseAmount && orderAmountCents < discount.minPurchaseAmount * 100) {
        this.log.info('Discount minimum purchase not met', {
          code: discount.code,
          required: discount.minPurchaseAmount,
          actual: orderAmountCents / 100
        });
        continue;
      }

      // Calculate discount amount
      let discountAmountCents = 0;
      
      switch (discount.type) {
        case 'percentage':
          // Percentage off the current amount (after previous discounts)
          discountAmountCents = Math.round((currentAmountCents * discount.value) / 100);
          break;
          
        case 'fixed':
          // Fixed amount off (in dollars, convert to cents)
          discountAmountCents = Math.min(discount.value * 100, currentAmountCents);
          break;
          
        case 'early_bird':
          // Early bird discount (percentage)
          discountAmountCents = Math.round((currentAmountCents * discount.value) / 100);
          break;
          
        case 'bogo':
          // Buy one get one - 50% off for even quantities
          discountAmountCents = Math.round(currentAmountCents * 0.25); // Approximation
          break;
      }

      // Apply max discount cap if specified
      if (discount.maxDiscountAmount) {
        discountAmountCents = Math.min(discountAmountCents, discount.maxDiscountAmount * 100);
      }

      // Ensure we don't discount more than the remaining amount
      discountAmountCents = Math.min(discountAmountCents, currentAmountCents);

      if (discountAmountCents > 0) {
        discountsApplied.push({
          discountId: discount.id,
          code: discount.code,
          type: discount.type,
          amountInCents: discountAmountCents,
          appliedTo: 'order'
        });

        currentAmountCents -= discountAmountCents;

        // Record discount usage
        await this.recordDiscountUsage(discount.id);
      }
    }

    const totalDiscountCents = orderAmountCents - currentAmountCents;

    this.log.info('Discounts applied', {
      original: orderAmountCents,
      final: currentAmountCents,
      totalDiscount: totalDiscountCents,
      discountsApplied: discountsApplied.length
    });

    return {
      finalAmountCents: currentAmountCents,
      discountsApplied,
      totalDiscountCents
    };
  }

  private async getValidDiscounts(codes: string[], eventId?: string): Promise<Discount[]> {
    const query = `
      SELECT * FROM discounts 
      WHERE code = ANY($1)
        AND valid_from <= NOW()
        AND valid_until >= NOW()
        AND (max_uses IS NULL OR current_uses < max_uses)
        AND (event_id IS NULL OR event_id = $2)
        AND active = true
      ORDER BY priority ASC
    `;

    try {
      const result = await DatabaseService.query<Discount>(query, [codes, eventId || null]);
      return result.rows;
    } catch (error) {
      this.log.error('Failed to fetch discounts', { codes, error });
      return [];
    }
  }

  private async recordDiscountUsage(discountId: string): Promise<void> {
    const query = `
      UPDATE discounts 
      SET current_uses = COALESCE(current_uses, 0) + 1,
          last_used_at = NOW()
      WHERE id = $1
    `;

    try {
      await DatabaseService.query(query, [discountId]);
    } catch (error) {
      this.log.error('Failed to record discount usage', { discountId, error });
    }
  }

  async validateDiscountCode(code: string, eventId?: string): Promise<{
    valid: boolean;
    reason?: string;
    discount?: Partial<Discount>;
  }> {
    const query = `
      SELECT * FROM discounts 
      WHERE code = $1
        AND (event_id IS NULL OR event_id = $2)
      LIMIT 1
    `;

    try {
      const result = await DatabaseService.query<Discount>(query, [code, eventId || null]);
      
      if (result.rows.length === 0) {
        return { valid: false, reason: 'Invalid discount code' };
      }

      const discount = result.rows[0];

      // Check validity
      const now = new Date();
      if (new Date(discount.validFrom) > now) {
        return { valid: false, reason: 'Discount not yet active' };
      }

      if (new Date(discount.validUntil) < now) {
        return { valid: false, reason: 'Discount has expired' };
      }

      // Fix for TypeScript error - check both maxUses and currentUses properly
      if (discount.maxUses && discount.currentUses !== undefined && discount.currentUses >= discount.maxUses) {
        return { valid: false, reason: 'Discount usage limit reached' };
      }

      return { 
        valid: true, 
        discount: {
          type: discount.type,
          value: discount.value,
          stackable: discount.stackable
        }
      };
    } catch (error) {
      this.log.error('Failed to validate discount', { code, error });
      return { valid: false, reason: 'Error validating discount' };
    }
  }
}

export const discountService = new DiscountService();
