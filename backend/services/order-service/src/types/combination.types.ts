export enum CombinationRuleType {
  MUTUALLY_EXCLUSIVE = 'MUTUALLY_EXCLUSIVE',
  STACKABLE = 'STACKABLE',
  CONDITIONAL = 'CONDITIONAL',
}

export interface DiscountCombinationRule {
  id: string;
  tenantId: string;
  ruleType: CombinationRuleType;
  promoCodeIds: string[];
  maxCombinedDiscountPercent?: number;
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CombinationValidationResult {
  canCombine: boolean;
  conflictingRules?: string[];
  maxDiscount?: number;
  errorMessage?: string;
}
