export enum SplitPaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface PaymentSplit {
  id: string;
  orderId: string;
  paymentMethodId: string;
  tenantId: string;
  amountCents: number;
  percentage?: number;
  status: SplitPaymentStatus;
  processedAt?: Date;
  createdAt: Date;
}

export interface SplitPaymentRequest {
  orderId: string;
  splits: SplitAllocation[];
}

export interface SplitAllocation {
  paymentMethodId: string;
  amountCents: number;
}
