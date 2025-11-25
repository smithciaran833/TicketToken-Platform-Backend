export interface OrderSplit {
  id: string;
  parentOrderId: string;
  tenantId: string;
  splitCount: number;
  splitReason?: string;
  splitBy: string;
  childOrderIds: string[];
  paymentAllocations: PaymentAllocation[];
  metadata?: Record<string, any>;
  createdAt: Date;
  completedAt?: Date;
}

export interface PaymentAllocation {
  childOrderId: string;
  amountCents: number;
  percentage: number;
}

export interface SplitOrderRequest {
  orderId: string;
  splitCount: number;
  itemAllocations: ItemAllocation[];
  reason?: string;
}

export interface ItemAllocation {
  orderItemId: string;
  childOrderIndex: number;
  quantity: number;
}
