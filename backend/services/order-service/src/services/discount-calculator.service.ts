import { logger } from '../utils/logger';
import { BOGORule, TieredRule, EarlyBirdRule, DiscountCalculation, OrderItem } from '../types/discount.types';
import { PromoCode } from '../types/promo-code.types';

export class DiscountCalculatorService {
  calculatePercentageDiscount(amount: number, percentage: number): number {
    return Math.floor((amount * percentage) / 100);
  }

  calculateFixedAmountDiscount(amount: number, fixedAmount: number): number {
    return Math.min(fixedAmount, amount);
  }

  calculateBOGODiscount(items: OrderItem[], rule: BOGORule): DiscountCalculation {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const setsQualified = Math.floor(totalQuantity / rule.buyQuantity);
    const freeItems = setsQualified * rule.getQuantity;
    
    const sortedItems = [...items].sort((a, b) => a.priceCents - b.priceCents);
    let remainingFree = freeItems;
    let discountAmount = 0;
    
    for (const item of sortedItems) {
      if (remainingFree === 0) break;
      const itemsToDiscount = Math.min(item.quantity, remainingFree);
      discountAmount += itemsToDiscount * item.priceCents * (rule.getDiscountPercent / 100);
      remainingFree -= itemsToDiscount;
    }
    
    const originalAmount = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
    return {
      originalAmount,
      discountAmount: Math.floor(discountAmount),
      finalAmount: originalAmount - Math.floor(discountAmount),
      appliedRules: [`BOGO: Buy ${rule.buyQuantity} get ${rule.getQuantity} at ${rule.getDiscountPercent}% off`],
    };
  }

  calculateTieredDiscount(items: OrderItem[], rules: TieredRule[]): DiscountCalculation {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const sortedRules = [...rules].sort((a, b) => b.minQuantity - a.minQuantity);
    
    const applicableRule = sortedRules.find(rule => totalQuantity >= rule.minQuantity);
    const originalAmount = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
    
    if (!applicableRule) {
      return {
        originalAmount,
        discountAmount: 0,
        finalAmount: originalAmount,
        appliedRules: [],
      };
    }
    
    const discountAmount = this.calculatePercentageDiscount(originalAmount, applicableRule.discountPercent);
    return {
      originalAmount,
      discountAmount,
      finalAmount: originalAmount - discountAmount,
      appliedRules: [`Tiered: ${applicableRule.discountPercent}% off for ${totalQuantity} items`],
    };
  }

  calculateEarlyBirdDiscount(amount: number, rule: EarlyBirdRule): DiscountCalculation {
    const now = new Date();
    const isEarlyBird = now <= rule.cutoffDate;
    
    if (!isEarlyBird) {
      return {
        originalAmount: amount,
        discountAmount: 0,
        finalAmount: amount,
        appliedRules: [],
      };
    }
    
    const discountAmount = rule.discountType === 'PERCENTAGE'
      ? this.calculatePercentageDiscount(amount, rule.discountValue)
      : this.calculateFixedAmountDiscount(amount, rule.discountValue);
    
    return {
      originalAmount: amount,
      discountAmount,
      finalAmount: amount - discountAmount,
      appliedRules: [`Early Bird: ${rule.discountValue}${rule.discountType === 'PERCENTAGE' ? '%' : ' cents'} off`],
    };
  }

  applyDiscountToOrder(promoCode: PromoCode, orderTotal: number, items?: OrderItem[]): DiscountCalculation {
    try {
      switch (promoCode.discountType) {
        case 'PERCENTAGE':
          const percentDiscount = this.calculatePercentageDiscount(orderTotal, promoCode.discountValue);
          return {
            originalAmount: orderTotal,
            discountAmount: percentDiscount,
            finalAmount: orderTotal - percentDiscount,
            appliedRules: [`${promoCode.code}: ${promoCode.discountValue}% off`],
          };
        
        case 'FIXED_AMOUNT':
          const fixedDiscount = this.calculateFixedAmountDiscount(orderTotal, promoCode.discountValue);
          return {
            originalAmount: orderTotal,
            discountAmount: fixedDiscount,
            finalAmount: orderTotal - fixedDiscount,
            appliedRules: [`${promoCode.code}: $${promoCode.discountValue / 100} off`],
          };
        
        case 'BOGO':
          if (!items || items.length === 0) {
            throw new Error('BOGO discount requires order items');
          }
          const bogoRule: BOGORule = (promoCode.metadata as any)?.bogoRule || { buyQuantity: 1, getQuantity: 1, getDiscountPercent: 100 };
          return this.calculateBOGODiscount(items, bogoRule);
        
        case 'TIERED':
          if (!items || items.length === 0) {
            throw new Error('Tiered discount requires order items');
          }
          const tieredRules: TieredRule[] = (promoCode.metadata as any)?.tieredRules || [];
          return this.calculateTieredDiscount(items, tieredRules);
        
        case 'EARLY_BIRD':
          const earlyBirdRule: EarlyBirdRule = (promoCode.metadata as any)?.earlyBirdRule || {
            cutoffDate: new Date(),
            discountValue: promoCode.discountValue,
            discountType: 'PERCENTAGE',
          };
          return this.calculateEarlyBirdDiscount(orderTotal, earlyBirdRule);
        
        default:
          return {
            originalAmount: orderTotal,
            discountAmount: 0,
            finalAmount: orderTotal,
            appliedRules: [],
          };
      }
    } catch (error) {
      logger.error('Error applying discount', { error, promoCode });
      throw error;
    }
  }
}

export const discountCalculatorService = new DiscountCalculatorService();
