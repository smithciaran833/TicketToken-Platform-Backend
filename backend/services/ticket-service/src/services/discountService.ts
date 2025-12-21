import { DatabaseService } from './databaseService';
import { logger } from '../utils/logger';

/**
 * Discount from database
 * Schema: id, tenant_id, code, discount_type, discount_value, max_uses, times_used, valid_from, valid_until, is_active
 */
interface Discount {
  id: string;
  tenant_id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number; // percentage (0-100) or cents depending on type
  max_uses?: number;
  times_used: number;
  valid_from?: Date;
  valid_until?: Date;
  is_active: boolean;
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
    tenantId?: string
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

    const validDiscounts = await this.getValidDiscounts(discountCodes, tenantId);
    
    const discountsApplied: DiscountApplication[] = [];
    let currentAmountCents = orderAmountCents;

    // Apply only the first valid discount (no stacking in this simple schema)
    for (const discount of validDiscounts) {
      let discountAmountCents = 0;

      switch (discount.discount_type) {
        case 'percentage':
          discountAmountCents = Math.round((currentAmountCents * discount.discount_value) / 100);
          break;

        case 'fixed':
          discountAmountCents = Math.min(Math.round(discount.discount_value * 100), currentAmountCents);
          break;
      }

      // Cap discount at current amount (can't go negative)
      discountAmountCents = Math.min(discountAmountCents, currentAmountCents);

      if (discountAmountCents > 0) {
        discountsApplied.push({
          discountId: discount.id,
          code: discount.code,
          type: discount.discount_type,
          amountInCents: discountAmountCents,
          appliedTo: 'order'
        });

        currentAmountCents -= discountAmountCents;
        await this.recordDiscountUsage(discount.id);
        
        // Only apply one discount
        break;
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

  private async getValidDiscounts(codes: string[], tenantId?: string): Promise<Discount[]> {
    let query: string;
    let params: any[];

    if (tenantId) {
      query = `
        SELECT * FROM discounts
        WHERE code = ANY($1)
          AND tenant_id = $2
          AND (valid_from IS NULL OR valid_from <= NOW())
          AND (valid_until IS NULL OR valid_until >= NOW())
          AND (max_uses IS NULL OR times_used < max_uses)
          AND is_active = true
      `;
      params = [codes, tenantId];
    } else {
      query = `
        SELECT * FROM discounts
        WHERE code = ANY($1)
          AND (valid_from IS NULL OR valid_from <= NOW())
          AND (valid_until IS NULL OR valid_until >= NOW())
          AND (max_uses IS NULL OR times_used < max_uses)
          AND is_active = true
      `;
      params = [codes];
    }

    try {
      const result = await DatabaseService.query<Discount>(query, params);
      return result.rows;
    } catch (error) {
      this.log.error('Failed to fetch discounts', { codes, error });
      return [];
    }
  }

  private async recordDiscountUsage(discountId: string): Promise<void> {
    const query = `
      UPDATE discounts
      SET times_used = times_used + 1,
          updated_at = NOW()
      WHERE id = $1
    `;

    try {
      await DatabaseService.query(query, [discountId]);
    } catch (error) {
      this.log.error('Failed to record discount usage', { discountId, error });
    }
  }

  async validateDiscountCode(code: string, tenantId?: string): Promise<{
    valid: boolean;
    reason?: string;
    discount?: {
      type: string;
      value: number;
    };
  }> {
    let query: string;
    let params: any[];

    if (tenantId) {
      query = `
        SELECT * FROM discounts
        WHERE code = $1 AND tenant_id = $2
        LIMIT 1
      `;
      params = [code, tenantId];
    } else {
      query = `
        SELECT * FROM discounts
        WHERE code = $1
        LIMIT 1
      `;
      params = [code];
    }

    try {
      const result = await DatabaseService.query<Discount>(query, params);

      if (result.rows.length === 0) {
        return { valid: false, reason: 'Invalid discount code' };
      }

      const discount = result.rows[0];
      const now = new Date();

      if (!discount.is_active) {
        return { valid: false, reason: 'Discount is not active' };
      }

      if (discount.valid_from && new Date(discount.valid_from) > now) {
        return { valid: false, reason: 'Discount not yet active' };
      }

      if (discount.valid_until && new Date(discount.valid_until) < now) {
        return { valid: false, reason: 'Discount has expired' };
      }

      if (discount.max_uses && discount.times_used >= discount.max_uses) {
        return { valid: false, reason: 'Discount usage limit reached' };
      }

      return {
        valid: true,
        discount: {
          type: discount.discount_type,
          value: discount.discount_value
        }
      };
    } catch (error) {
      this.log.error('Failed to validate discount', { code, error });
      return { valid: false, reason: 'Error validating discount' };
    }
  }
}

export const discountService = new DiscountService();
