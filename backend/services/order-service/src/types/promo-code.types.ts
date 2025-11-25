export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  BOGO = 'BOGO',
  TIERED = 'TIERED',
  EARLY_BIRD = 'EARLY_BIRD',
}

export interface PromoCode {
  id: string;
  tenantId: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  validFrom: Date;
  validUntil: Date;
  usageLimit?: number;
  usageCount: number;
  perUserLimit: number;
  minPurchaseCents: number;
  applicableEventIds?: string[];
  applicableCategories?: string[];
  isActive: boolean;
  createdBy?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromoCodeRedemption {
  id: string;
  promoCodeId: string;
  orderId: string;
  userId: string;
  tenantId: string;
  discountAppliedCents: number;
  redeemedAt: Date;
  createdAt: Date;
}

export interface ValidatePromoCodeRequest {
  code: string;
  userId: string;
  orderTotal: number;
  eventIds?: string[];
  categories?: string[];
}

export interface ApplyPromoCodeResult {
  valid: boolean;
  promoCode?: PromoCode;
  discountAmount: number;
  errorMessage?: string;
}

export interface CreatePromoCodeRequest {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  validFrom: Date;
  validUntil: Date;
  usageLimit?: number;
  perUserLimit?: number;
  minPurchaseCents?: number;
  applicableEventIds?: string[];
  applicableCategories?: string[];
  metadata?: Record<string, any>;
}
