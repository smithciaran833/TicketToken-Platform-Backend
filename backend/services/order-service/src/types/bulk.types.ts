export enum BulkOperationType {
  BULK_CANCEL = 'BULK_CANCEL',
  BULK_REFUND = 'BULK_REFUND',
  BULK_UPDATE = 'BULK_UPDATE',
  BULK_EXPORT = 'BULK_EXPORT',
}

export enum BulkOperationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL_SUCCESS = 'PARTIAL_SUCCESS',
}

export interface BulkOperation {
  id: string;
  tenantId: string;
  operationType: BulkOperationType;
  status: BulkOperationStatus;
  orderIds: string[];
  totalCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  results?: any;
  errors?: any;
  initiatedBy: string;
  parameters?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
}

export interface BulkOperationRequest {
  orderIds: string[];
  operationType: BulkOperationType;
  parameters?: Record<string, any>;
}
