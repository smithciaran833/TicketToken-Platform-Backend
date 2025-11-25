import { Column } from '../types/report.types';

/**
 * Escape CSV value to handle special characters
 */
export function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Format a single row as CSV
 */
export function formatCSVRow(row: any, columns: Column[]): string {
  return columns
    .map((column) => {
      const value = row[column.key];
      const formattedValue = column.format ? column.format(value) : value;
      return escapeCSVValue(formattedValue);
    })
    .join(',');
}

/**
 * Generate CSV string from data array
 */
export function generateCSV(data: any[], columns: Column[]): string {
  if (!data || data.length === 0) {
    return columns.map((col) => escapeCSVValue(col.label)).join(',') + '\n';
  }

  // Header row
  const header = columns.map((col) => escapeCSVValue(col.label)).join(',');

  // Data rows
  const rows = data.map((row) => formatCSVRow(row, columns));

  return [header, ...rows].join('\n');
}

/**
 * Format currency value (cents to dollars)
 */
export function formatCurrency(cents: number, currency: string = 'USD'): string {
  const dollars = cents / 100;
  return `${currency} ${dollars.toFixed(2)}`;
}

/**
 * Format date to ISO string
 */
export function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Format datetime to ISO string
 */
export function formatDateTime(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format number with commas
 */
export function formatNumber(value: number, decimals: number = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Common column definitions for order reports
 */
export const orderReportColumns: Column[] = [
  { key: 'orderNumber', label: 'Order Number' },
  { key: 'userId', label: 'User ID' },
  { key: 'eventId', label: 'Event ID' },
  { key: 'status', label: 'Status' },
  { key: 'totalCents', label: 'Total', format: (v) => formatCurrency(v) },
  { key: 'currency', label: 'Currency' },
  { key: 'createdAt', label: 'Created At', format: formatDateTime },
];

/**
 * Common column definitions for revenue reports
 */
export const revenueReportColumns: Column[] = [
  { key: 'entityId', label: 'Entity ID' },
  { key: 'entityType', label: 'Entity Type' },
  { key: 'totalOrders', label: 'Total Orders', format: formatNumber },
  { key: 'totalRevenueCents', label: 'Total Revenue', format: (v) => formatCurrency(v) },
  { key: 'averageOrderValueCents', label: 'Average Order Value', format: (v) => formatCurrency(v) },
  { key: 'totalTicketsSold', label: 'Total Tickets Sold', format: formatNumber },
];

/**
 * Common column definitions for customer analytics
 */
export const customerAnalyticsColumns: Column[] = [
  { key: 'userId', label: 'User ID' },
  { key: 'totalOrders', label: 'Total Orders', format: formatNumber },
  { key: 'lifetimeValueCents', label: 'Lifetime Value', format: (v) => formatCurrency(v) },
  { key: 'averageOrderValueCents', label: 'Average Order Value', format: (v) => formatCurrency(v) },
  { key: 'firstOrderDate', label: 'First Order Date', format: formatDate },
  { key: 'lastOrderDate', label: 'Last Order Date', format: formatDate },
  { key: 'daysSinceLastOrder', label: 'Days Since Last Order', format: formatNumber },
  { key: 'recencyScore', label: 'Recency Score' },
  { key: 'frequencyScore', label: 'Frequency Score' },
  { key: 'monetaryScore', label: 'Monetary Score' },
  { key: 'rfmSegment', label: 'RFM Segment' },
];

/**
 * Common column definitions for financial reconciliation
 */
export const reconciliationReportColumns: Column[] = [
  { key: 'reportDate', label: 'Report Date', format: formatDate },
  { key: 'totalOrdersCents', label: 'Total Orders', format: (v) => formatCurrency(v) },
  { key: 'totalTransactionsCents', label: 'Total Transactions', format: (v) => formatCurrency(v) },
  { key: 'matchedOrdersCount', label: 'Matched Orders', format: formatNumber },
  { key: 'unmatchedOrdersCount', label: 'Unmatched Orders', format: formatNumber },
  { key: 'discrepancyCents', label: 'Discrepancy', format: (v) => formatCurrency(v) },
  { key: 'discrepancyPercentage', label: 'Discrepancy %', format: (v) => formatPercentage(v) },
  { key: 'status', label: 'Status' },
];

/**
 * Common column definitions for transaction reports
 */
export const transactionReportColumns: Column[] = [
  { key: 'externalTransactionId', label: 'Transaction ID' },
  { key: 'orderId', label: 'Order ID' },
  { key: 'paymentProvider', label: 'Payment Provider' },
  { key: 'transactionType', label: 'Transaction Type' },
  { key: 'amountCents', label: 'Amount', format: (v) => formatCurrency(v) },
  { key: 'currency', label: 'Currency' },
  { key: 'status', label: 'Status' },
  { key: 'transactionDate', label: 'Transaction Date', format: formatDateTime },
  { key: 'settledDate', label: 'Settled Date', format: formatDateTime },
];

/**
 * Common column definitions for chargeback reports
 */
export const chargebackReportColumns: Column[] = [
  { key: 'chargebackId', label: 'Chargeback ID' },
  { key: 'orderId', label: 'Order ID' },
  { key: 'amountCents', label: 'Amount', format: (v) => formatCurrency(v) },
  { key: 'currency', label: 'Currency' },
  { key: 'reason', label: 'Reason' },
  { key: 'status', label: 'Status' },
  { key: 'receivedDate', label: 'Received Date', format: formatDate },
  { key: 'responseDeadline', label: 'Response Deadline', format: formatDate },
  { key: 'resolvedDate', label: 'Resolved Date', format: formatDate },
];
