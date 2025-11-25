export interface BOGORule {
  buyQuantity: number;
  getQuantity: number;
  getDiscountPercent: number;
}

export interface TieredRule {
  minQuantity: number;
  discountPercent: number;
}

export interface EarlyBirdRule {
  cutoffDate: Date;
  discountValue: number;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
}

export interface DiscountCalculation {
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  appliedRules: string[];
}

export interface OrderItem {
  id: string;
  ticketTypeId: string;
  quantity: number;
  priceCents: number;
}
