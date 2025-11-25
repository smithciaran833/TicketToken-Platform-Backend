// Report period types
export enum ReportPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM',
}

// Export format types
export enum ExportFormat {
  CSV = 'CSV',
  JSON = 'JSON',
  EXCEL = 'EXCEL',
  PDF = 'PDF',
}

// Order report summary
export interface OrderReportSummary {
  id: string;
  tenantId: string;
  period: ReportPeriod;
  startDate: Date;
  endDate: Date;
  totalOrders: number;
  totalRevenueCents: number;
  averageOrderValueCents: number;
  totalRefundsCents: number;
  ordersByStatus: {
    pending: number;
    reserved: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    expired: number;
    refunded: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Revenue report
export interface RevenueReport {
  id: string;
  tenantId: string;
  entityType: 'EVENT' | 'VENUE';
  entityId: string;
  period: ReportPeriod;
  startDate: Date;
  endDate: Date;
  totalRevenueCents: number;
  totalOrders: number;
  totalTicketsSold: number;
  averageOrderValueCents: number;
  topTicketTypes: {
    ticketTypeId: string;
    ticketTypeName: string;
    quantitySold: number;
    revenueCents: number;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

// Customer analytics
export interface CustomerAnalytics {
  id: string;
  tenantId: string;
  userId: string;
  totalOrders: number;
  totalSpentCents: number;
  averageOrderValueCents: number;
  lifetimeValueCents: number;
  firstOrderDate: Date | null;
  lastOrderDate: Date | null;
  daysSinceLastOrder: number | null;
  recencyScore: number; // 1-5 scale
  frequencyScore: number; // 1-5 scale
  monetaryScore: number; // 1-5 scale
  rfmSegment: string; // Combination like "543" (High value, frequent, recent)
  currentSegmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Customer segment
export interface CustomerSegment {
  id: string;
  tenantId: string;
  segmentName: string;
  segmentDescription: string;
  segmentRules: {
    minOrders?: number;
    maxOrders?: number;
    minLifetimeValueCents?: number;
    maxLifetimeValueCents?: number;
    minRecencyDays?: number;
    maxRecencyDays?: number;
    minFrequencyScore?: number;
    maxFrequencyScore?: number;
    minMonetaryScore?: number;
    maxMonetaryScore?: number;
  };
  customerCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Customer segment history
export interface CustomerSegmentHistory {
  id: string;
  tenantId: string;
  userId: string;
  oldSegmentId: string | null;
  newSegmentId: string;
  reason: string;
  createdAt: Date;
}

// Financial transaction
export interface FinancialTransaction {
  id: string;
  tenantId: string;
  orderId: string | null;
  externalTransactionId: string;
  paymentProvider: string;
  transactionType: 'CHARGE' | 'REFUND' | 'CHARGEBACK';
  amountCents: number;
  currency: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  transactionDate: Date;
  settledDate: Date | null;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

// Reconciliation report
export interface ReconciliationReport {
  id: string;
  tenantId: string;
  reportDate: Date;
  totalOrdersCents: number;
  totalTransactionsCents: number;
  matchedOrdersCount: number;
  unmatchedOrdersCount: number;
  discrepancyCents: number;
  discrepancyPercentage: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  discrepancies: Discrepancy[];
  createdAt: Date;
  updatedAt: Date;
}

// Discrepancy
export interface Discrepancy {
  id: string;
  tenantId: string;
  reconciliationReportId: string;
  discrepancyType: 'MISSING_ORDER' | 'MISSING_TRANSACTION' | 'AMOUNT_MISMATCH';
  orderId: string | null;
  transactionId: string | null;
  expectedAmountCents: number;
  actualAmountCents: number;
  differenceCents: number;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'IGNORED';
  resolution: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Fee breakdown
export interface FeeBreakdown {
  id: string;
  tenantId: string;
  orderId: string;
  subtotalCents: number;
  platformFeeCents: number;
  platformFeePercentage: number;
  processingFeeCents: number;
  processingFeePercentage: number;
  processingFeeFixedCents: number;
  taxCents: number;
  taxPercentage: number;
  totalFeesCents: number;
  netRevenueCents: number;
  createdAt: Date;
  updatedAt: Date;
}

// Chargeback record
export interface ChargebackRecord {
  id: string;
  tenantId: string;
  orderId: string;
  chargebackId: string; // External ID from payment provider
  amountCents: number;
  currency: string;
  reason: string;
  status: 'PENDING' | 'SUBMITTED' | 'WON' | 'LOST' | 'WITHDRAWN';
  receivedDate: Date;
  responseDeadline: Date;
  evidenceSubmittedDate: Date | null;
  resolvedDate: Date | null;
  evidence: {
    documents: string[];
    description: string;
    submittedBy: string;
  } | null;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

// Report filters
export interface ReportFilters {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  eventId?: string;
  venueId?: string;
  status?: string[];
  userId?: string;
}

// Date range
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// Order statistics
export interface OrderStats {
  totalOrders: number;
  ordersByStatus: Record<string, number>;
  totalRevenueCents: number;
  averageOrderValueCents: number;
  conversionRate: number; // Reserved to Confirmed
}

// RFM Score
export interface RFMScore {
  recencyScore: number; // 1-5 (5 = most recent)
  frequencyScore: number; // 1-5 (5 = most frequent)
  monetaryScore: number; // 1-5 (5 = highest value)
  rfmSegment: string; // e.g., "543"
}

// Fee summary
export interface FeeSummary {
  totalPlatformFeesCents: number;
  totalProcessingFeesCents: number;
  totalTaxCents: number;
  totalFeesCents: number;
  orderCount: number;
  averageFeePerOrderCents: number;
}

// Export schedule
export interface ExportSchedule {
  id: string;
  tenantId: string;
  reportType: string;
  format: ExportFormat;
  schedule: string; // Cron expression
  filters: ReportFilters;
  recipients: string[]; // Email addresses
  deliveryMethod: 'EMAIL' | 'S3' | 'BOTH';
  s3Bucket?: string;
  s3Path?: string;
  isActive: boolean;
  lastExecutedAt: Date | null;
  nextExecutionAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Scheduled export
export type ScheduledExport = ExportSchedule;

// External transaction (for import)
export interface ExternalTransaction {
  externalTransactionId: string;
  paymentProvider: string;
  transactionType: 'CHARGE' | 'REFUND' | 'CHARGEBACK';
  amountCents: number;
  currency: string;
  transactionDate: Date;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  metadata?: any;
}

// Chargeback data (for creation)
export interface ChargebackData {
  chargebackId: string;
  amountCents: number;
  currency: string;
  reason: string;
  receivedDate: Date;
  responseDeadline: Date;
  metadata?: any;
}

// Evidence (for chargeback)
export interface Evidence {
  documents: string[];
  description: string;
  submittedBy: string;
}

// Column definition for exports
export interface Column {
  key: string;
  label: string;
  format?: (value: any) => string;
}

// Chargeback status
export enum ChargebackStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  WON = 'WON',
  LOST = 'LOST',
  WITHDRAWN = 'WITHDRAWN',
}

// Discrepancy type
export enum DiscrepancyType {
  MISSING_ORDER = 'MISSING_ORDER',
  MISSING_TRANSACTION = 'MISSING_TRANSACTION',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
}

// Discrepancy status
export enum DiscrepancyStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  IGNORED = 'IGNORED',
}
