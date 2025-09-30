export interface ExportRequest {
  id: string;
  venueId: string;
  userId: string;
  type: ExportType;
  format: ExportFormat;
  status: ExportStatus;
  filters: ExportFilters;
  options: ExportOptions;
  progress?: number;
  fileUrl?: string;
  fileSize?: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
}

export enum ExportType {
  ANALYTICS_REPORT = 'analytics_report',
  CUSTOMER_LIST = 'customer_list',
  TRANSACTION_HISTORY = 'transaction_history',
  EVENT_SUMMARY = 'event_summary',
  FINANCIAL_REPORT = 'financial_report',
  DASHBOARD_SNAPSHOT = 'dashboard_snapshot',
  RAW_DATA = 'raw_data',
  CUSTOM_REPORT = 'custom_report',
}

export enum ExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
  PDF = 'pdf',
  JSON = 'json',
  XML = 'xml',
}

export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export interface ExportFilters {
  dateRange: {
    start: Date;
    end: Date;
  };
  venues?: string[];
  events?: string[];
  eventTypes?: string[];
  customerSegments?: string[];
  metrics?: string[];
  dimensions?: string[];
  customFilters?: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
}

export interface ExportOptions {
  includeHeaders?: boolean;
  timezone?: string;
  dateFormat?: string;
  numberFormat?: string;
  currency?: string;
  language?: string;
  compression?: boolean;
  encryption?: {
    enabled: boolean;
    password?: string;
  };
  scheduling?: {
    frequency: 'once' | 'daily' | 'weekly' | 'monthly';
    time?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    endDate?: Date;
  };
  delivery?: {
    method: 'download' | 'email' | 's3' | 'ftp';
    destination?: string;
    recipients?: string[];
  };
}

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  type: ExportType;
  venueId?: string;
  isGlobal: boolean;
  sections: ReportSection[];
  filters: ExportFilters;
  options: ExportOptions;
  lastUsed?: Date;
  usageCount: number;
  createdBy: string;
  createdAt: Date;
}

export interface ReportSection {
  id: string;
  title: string;
  type: 'summary' | 'chart' | 'table' | 'text';
  order: number;
  config: {
    metrics?: string[];
    dimensions?: string[];
    visualization?: string;
    text?: string;
    formatting?: Record<string, any>;
  };
}

export interface ExportQueue {
  pending: ExportRequest[];
  processing: ExportRequest[];
  workers: ExportWorker[];
}

export interface ExportWorker {
  id: string;
  status: 'idle' | 'busy';
  currentExport?: string;
  startedAt?: Date;
  completedCount: number;
  errorCount: number;
}

export interface DataExportSchema {
  version: string;
  timestamp: Date;
  venue: {
    id: string;
    name: string;
  };
  metadata: Record<string, any>;
  data: any[]; // Specific to export type
}

export interface FinancialExportData {
  summary: {
    totalRevenue: number;
    totalTransactions: number;
    averageOrderValue: number;
    refundAmount: number;
    netRevenue: number;
  };
  byPeriod: Array<{
    period: string;
    revenue: number;
    transactions: number;
    refunds: number;
  }>;
  byEventType: Array<{
    eventType: string;
    revenue: number;
    ticketsSold: number;
  }>;
  transactions: Array<{
    date: Date;
    transactionId: string;
    amount: number;
    type: string;
    status: string;
  }>;
}

export interface CustomerExportData {
  summary: {
    totalCustomers: number;
    newCustomers: number;
    activeCustomers: number;
  };
  customers: Array<{
    customerId: string;
    firstPurchase: Date;
    lastPurchase: Date;
    totalSpent: number;
    totalTickets: number;
    segment: string;
    tags?: string[];
  }>;
}
