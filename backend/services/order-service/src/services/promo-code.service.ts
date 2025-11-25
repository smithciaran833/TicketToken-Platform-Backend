import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { PromoCode, ValidatePromoCodeRequest, ApplyPromoCodeResult, CreatePromoCodeRequest } from '../types/promo-code.types';

export class PromoCodeService {
  async validatePromoCode(tenantId: string, request: ValidatePromoCodeRequest): Promise<ApplyPromoCodeResult> {
    const db = getDatabase();
    try {
      const codeUpper = request.code.toUpperCase();
      const result = await db.query(
        `SELECT * FROM promo_codes WHERE tenant_id = $1 AND UPPER(code) = $2 AND is_active = TRUE`,
        [tenantId, codeUpper]
      );
      
      if (result.rows.length === 0) {
        return { valid: false, discountAmount: 0, errorMessage: 'Invalid promo code' };
      }
      
      const promoCode = this.mapToPromoCode(result.rows[0]);
      const now = new Date();
      
      if (now < promoCode.validFrom || now > promoCode.validUntil) {
        return { valid: false, discountAmount: 0, errorMessage: 'Promo code expired or not yet valid' };
      }
      
      if (promoCode.usageLimit && promoCode.usageCount >= promoCode.usageLimit) {
        return { valid: false, discountAmount: 0, errorMessage: 'Promo code usage limit reached' };
      }
      
      if (request.orderTotal < promoCode.minPurchaseCents) {
        return { valid: false, discountAmount: 0, errorMessage: `Minimum purchase of $${promoCode.minPurchaseCents / 100} required` };
      }
      
      const userRedemptions = await db.query(
        'SELECT COUNT(*) FROM promo_code_redemptions WHERE promo_code_id = $1 AND user_id = $2',
        [promoCode.id, request.userId]
      );
      
      if (parseInt(userRedemptions.rows[0].count) >= promoCode.perUserLimit) {
        return { valid: false, discountAmount: 0, errorMessage: 'You have already used this promo code' };
      }
      
      if (promoCode.applicableEventIds && request.eventIds) {
        const hasMatchingEvent = request.eventIds.some(id => promoCode.applicableEventIds!.includes(id));
        if (!hasMatchingEvent) {
          return { valid: false, discountAmount: 0, errorMessage: 'Promo code not applicable to these events' };
        }
      }
      
      const discountAmount = this.calculateDiscount(promoCode, request.orderTotal);
      return { valid: true, promoCode, discountAmount };
    } catch (error) {
      logger.error('Error validating promo code', { error, request });
      throw error;
    }
  }

  async applyPromoCode(tenantId: string, orderId: string, userId: string, promoCodeId: string, discountAmount: number): Promise<void> {
    const db = getDatabase();
    try {
      await db.query(
        `INSERT INTO promo_code_redemptions (promo_code_id, order_id, user_id, tenant_id, discount_applied_cents) VALUES ($1, $2, $3, $4, $5)`,
        [promoCodeId, orderId, userId, tenantId, discountAmount]
      );
      await db.query('UPDATE promo_codes SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1', [promoCodeId]);
      logger.info('Promo code applied', { promoCodeId, orderId, discountAmount });
    } catch (error) {
      logger.error('Error applying promo code', { error, promoCodeId, orderId });
      throw error;
    }
  }

  async createPromoCode(tenantId: string, createdBy: string, request: CreatePromoCodeRequest): Promise<PromoCode> {
    const db = getDatabase();
    try {
      const result = await db.query(
        `INSERT INTO promo_codes (tenant_id, code, discount_type, discount_value, valid_from, valid_until, usage_limit, per_user_limit, min_purchase_cents, applicable_event_ids, applicable_categories, metadata, created_by) VALUES ($1, UPPER($2), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [tenantId, request.code, request.discountType, request.discountValue, request.validFrom, request.validUntil, request.usageLimit, request.perUserLimit || 1, request.minPurchaseCents || 0, JSON.stringify(request.applicableEventIds || []), JSON.stringify(request.applicableCategories || []), JSON.stringify(request.metadata || {}), createdBy]
      );
      return this.mapToPromoCode(result.rows[0]);
    } catch (error) {
      logger.error('Error creating promo code', { error, request });
      throw error;
    }
  }

  private calculateDiscount(promoCode: PromoCode, orderTotal: number): number {
    switch (promoCode.discountType) {
      case 'PERCENTAGE':
        return Math.floor((orderTotal * promoCode.discountValue) / 100);
      case 'FIXED_AMOUNT':
        return Math.min(promoCode.discountValue, orderTotal);
      default:
        return 0;
    }
  }

  private mapToPromoCode(row: any): PromoCode {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      usageLimit: row.usage_limit,
      usageCount: row.usage_count,
      perUserLimit: row.per_user_limit,
      minPurchaseCents: row.min_purchase_cents,
      applicableEventIds: row.applicable_event_ids,
      applicableCategories: row.applicable_categories,
      isActive: row.is_active,
      createdBy: row.created_by,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const promoCodeService = new PromoCodeService();
