import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { DiscountCombinationRule, CombinationValidationResult, CombinationRuleType } from '../types/combination.types';
import { PromoCode } from '../types/promo-code.types';

export class DiscountCombinationService {
  async validateCombination(tenantId: string, promoCodeIds: string[]): Promise<CombinationValidationResult> {
    const db = getDatabase();
    try {
      const result = await db.query(
        'SELECT * FROM discount_combination_rules WHERE tenant_id = $1 AND is_active = TRUE ORDER BY priority DESC',
        [tenantId]
      );
      
      const rules = result.rows.map(row => this.mapToRule(row));
      
      for (const rule of rules) {
        const hasConflict = promoCodeIds.some(id => rule.promoCodeIds.includes(id));
        
        if (hasConflict && rule.ruleType === CombinationRuleType.MUTUALLY_EXCLUSIVE) {
          const conflictingCodes = promoCodeIds.filter(id => rule.promoCodeIds.includes(id));
          return {
            canCombine: false,
            conflictingRules: [rule.id],
            errorMessage: `Promo codes cannot be combined (mutually exclusive): ${conflictingCodes.join(', ')}`,
          };
        }
      }
      
      const stackableRule = rules.find(rule => 
        rule.ruleType === CombinationRuleType.STACKABLE &&
        promoCodeIds.every(id => rule.promoCodeIds.includes(id))
      );
      
      return {
        canCombine: true,
        maxDiscount: stackableRule?.maxCombinedDiscountPercent,
      };
    } catch (error) {
      logger.error('Error validating promo code combination', { error, promoCodeIds });
      throw error;
    }
  }

  async calculateCombinedDiscount(promoCodes: PromoCode[], orderTotal: number): Promise<number> {
    const sortedCodes = [...promoCodes].sort((a, b) => {
      if (a.discountType === 'FIXED_AMOUNT' && b.discountType !== 'FIXED_AMOUNT') return -1;
      if (a.discountType !== 'FIXED_AMOUNT' && b.discountType === 'FIXED_AMOUNT') return 1;
      return 0;
    });
    
    let remainingTotal = orderTotal;
    let totalDiscount = 0;
    
    for (const code of sortedCodes) {
      let discount = 0;
      
      if (code.discountType === 'PERCENTAGE') {
        discount = Math.floor((remainingTotal * code.discountValue) / 100);
      } else if (code.discountType === 'FIXED_AMOUNT') {
        discount = Math.min(code.discountValue, remainingTotal);
      }
      
      totalDiscount += discount;
      remainingTotal -= discount;
    }
    
    return totalDiscount;
  }

  async checkMaxDiscount(tenantId: string, promoCodeIds: string[], calculatedDiscount: number, orderTotal: number): Promise<boolean> {
    const validation = await this.validateCombination(tenantId, promoCodeIds);
    
    if (!validation.canCombine) {
      return false;
    }
    
    if (validation.maxDiscount) {
      const discountPercent = (calculatedDiscount / orderTotal) * 100;
      return discountPercent <= validation.maxDiscount;
    }
    
    return true;
  }

  private mapToRule(row: any): DiscountCombinationRule {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      ruleType: row.rule_type,
      promoCodeIds: row.promo_code_ids,
      maxCombinedDiscountPercent: row.max_combined_discount_percent,
      priority: row.priority,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const discountCombinationService = new DiscountCombinationService();
