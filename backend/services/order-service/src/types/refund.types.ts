export enum RefundType {
  FULL = 'FULL',
  PARTIAL = 'PARTIAL',
}

export interface RefundedItem {
  orderItemId: string;
  quantity: number;
  amountCents: number;
}

export interface PartialRefundRequest {
  orderId: string;
  items: RefundedItem[];
  reason: string;
  notes?: string;
}

export interface RefundCalculation {
  subtotalRefundCents: number;
  proportionalPlatformFeeCents: number;
  proportionalProcessingFeeCents: number;
  proportionalTaxCents: number;
  totalRefundCents: number;
  refundPercentage: number;
}

export interface OrderRefund {
  id: string;
  orderId: string;
  refundType: RefundType;
  amountCents: number;
  originalAmountCents?: number;
  refundedItems?: RefundedItem[];
  proportionalPlatformFeeCents?: number;
  proportionalProcessingFeeCents?: number;
  proportionalTaxCents?: number;
  reason: string;
  notes?: string;
  paymentIntentId?: string;
  refundStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefundValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
