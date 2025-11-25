export enum ModificationType {
  ADD_ITEM = 'ADD_ITEM',
  REMOVE_ITEM = 'REMOVE_ITEM',
  UPGRADE_ITEM = 'UPGRADE_ITEM',
  DOWNGRADE_ITEM = 'DOWNGRADE_ITEM',
  CHANGE_QUANTITY = 'CHANGE_QUANTITY',
}

export enum ModificationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

export interface OrderModification {
  id: string;
  orderId: string;
  tenantId: string;
  modificationType: ModificationType;
  status: ModificationStatus;
  originalItemId?: string;
  newItemId?: string;
  newTicketTypeId?: string;
  quantityChange: number;
  priceDifferenceCents: number;
  additionalFeesCents: number;
  totalAdjustmentCents: number;
  paymentIntentId?: string;
  refundId?: string;
  requestedBy: string;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  reason: string;
  notes?: string;
  metadata?: Record<string, any>;
  requestedAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModificationRequest {
  orderId: string;
  modificationType: ModificationType;
  originalItemId?: string;
  newTicketTypeId?: string;
  quantityChange?: number;
  reason: string;
  notes?: string;
}

export interface UpgradeRequest {
  orderId: string;
  originalItemId: string;
  newTicketTypeId: string;
  reason: string;
  notes?: string;
}

export interface ModificationCalculation {
  priceDifferenceCents: number;
  additionalFeesCents: number;
  totalAdjustmentCents: number;
  requiresPayment: boolean;
  requiresRefund: boolean;
}
