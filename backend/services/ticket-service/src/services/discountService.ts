import { DatabaseService } from './databaseService';
import { logger } from '../utils/logger';

interface Discount {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'bogo' | 'early_bird';
  value_percentage?: number;
  value_cents?: number;
  priority: number;
  stackable: boolean;
  max_uses?: number;
  current_uses?: number;
  min_purchase_cents?: number;  // Fixed: was minPurchaseAmount
  max_discount_cents?: number;  // Fixed: was maxDiscountAmount
  valid_from: Date;
  valid_until: Date;
  event_id?: string;
  ticket_type_ids?: string[];
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

    const validDiscounts = await this.getValidDiscounts(discountCodes, eventId);
    validDiscounts.sort((a, b) => a.priority - b.priority);

    const discountsApplied: DiscountApplication[] = [];
    let currentAmountCents = orderAmountCents;
    let hasNonStackable = false;

    for (const discount of validDiscounts) {
      if (hasNonStackable) {
        this.log.info('Skipping discount due to non-stackable discount already applied', {
          code: discount.code,
          skipped: true
        });
        continue;
      }

      if (!discount.stackable) {
        if (discountsApplied.length > 0) {
          this.log.info('Skipping non-stackable discount as other discounts already applied', {
            code: discount.code
          });
          continue;
        }
        hasNonStackable = true;
      }

      // FIXED: Don't multiply by 100, min_purchase_cents is already in cents
      if (discount.min_purchase_cents && orderAmountCents < discount.min_purchase_cents) {
        this.log.info('Discount minimum purchase not met', {
          code: discount.code,
          required: discount.min_purchase_cents,
          actual: orderAmountCents
        });
        continue;
      }

      let discountAmountCents = 0;

      switch (discount.type) {
        case 'percentage':
          discountAmountCents = Math.round((currentAmountCents * (discount.value_percentage || 0)) / 100);
          break;

        case 'fixed':
          discountAmountCents = Math.min((discount.value_cents || 0), currentAmountCents);
          break;

        case 'early_bird':
          discountAmountCents = Math.round((currentAmountCents * (discount.value_percentage || 0)) / 100);
          break;

        case 'bogo':
          discountAmountCents = Math.round(currentAmountCents * 0.25);
          break;
      }

      // FIXED: Don't multiply by 100, max_discount_cents is already in cents
      if (discount.max_discount_cents) {
        discountAmountCents = Math.min(discountAmountCents, discount.max_discount_cents);
      }

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
    discount?: any;
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
      const now = new Date();

      if (new Date(discount.valid_from) > now) {
        return { valid: false, reason: 'Discount not yet active' };
      }

      if (new Date(discount.valid_until) < now) {
        return { valid: false, reason: 'Discount has expired' };
      }

      if (discount.max_uses && discount.current_uses !== undefined && discount.current_uses >= discount.max_uses) {
        return { valid: false, reason: 'Discount usage limit reached' };
      }

      return {
        valid: true,
        discount: {
          type: discount.type,
          value_percentage: discount.value_percentage,
          value_cents: discount.value_cents,
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
