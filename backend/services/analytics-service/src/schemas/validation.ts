/**
 * Input Validation Schemas
 * AUDIT FIX: VAL-1,2,3 - Proper input validation with Zod
 */

import { z } from 'zod';

// =============================================================================
// Common Schemas
// =============================================================================

export const uuidSchema = z.string().uuid('Invalid UUID format');
export const tenantIdSchema = z.string().uuid('Invalid tenant ID');
export const dateStringSchema = z.string().datetime('Invalid ISO 8601 date');
export const positiveIntSchema = z.number().int().positive();
export const nonNegativeIntSchema = z.number().int().nonnegative();

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Date range
export const dateRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
}).refine(data => new Date(data.startDate) <= new Date(data.endDate), {
  message: 'startDate must be before or equal to endDate',
});

// =============================================================================
// Analytics Query Schemas
// =============================================================================

export const analyticsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventId: uuidSchema.optional(),
  venueId: uuidSchema.optional(),
  granularity: z.enum(['minute', 'hour', 'day', 'week', 'month']).default('day'),
  metrics: z.array(z.string()).min(1).optional(),
});

export const metricsQuerySchema = z.object({
  bucket: z.string().min(1).max(100),
  measurement: z.string().min(1).max(100),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  filters: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  aggregation: z.enum(['mean', 'sum', 'count', 'min', 'max', 'last']).default('mean'),
});

// =============================================================================
// Dashboard Schemas
// =============================================================================

export const dashboardConfigSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  layout: z.enum(['grid', 'list', 'custom']).default('grid'),
  widgets: z.array(z.object({
    id: uuidSchema.optional(),
    type: z.enum(['chart', 'table', 'metric', 'map', 'heatmap']),
    title: z.string().min(1).max(255),
    config: z.record(z.string(), z.any()),
    position: z.object({
      x: nonNegativeIntSchema,
      y: nonNegativeIntSchema,
      width: positiveIntSchema,
      height: positiveIntSchema,
    }),
  })).optional(),
  refreshInterval: z.number().int().min(5).max(3600).default(60), // seconds
  isPublic: z.boolean().default(false),
});

// =============================================================================
// Customer Insights Schemas
// =============================================================================

export const customerQuerySchema = z.object({
  customerId: uuidSchema.optional(),
  email: z.string().email().optional(),
  segment: z.string().optional(),
  rfmScore: z.object({
    minRecency: z.number().int().min(1).max(5).optional(),
    maxRecency: z.number().int().min(1).max(5).optional(),
    minFrequency: z.number().int().min(1).max(5).optional(),
    maxFrequency: z.number().int().min(1).max(5).optional(),
    minMonetary: z.number().int().min(1).max(5).optional(),
    maxMonetary: z.number().int().min(1).max(5).optional(),
  }).optional(),
  ...paginationSchema.shape,
});

export const rfmConfigSchema = z.object({
  recencyBreakpoints: z.array(z.number()).length(4),
  frequencyBreakpoints: z.array(z.number()).length(4),
  monetaryBreakpoints: z.array(z.number()).length(4),
  calculationWindow: z.number().int().min(30).max(730).default(365), // days
});

// =============================================================================
// Report Schemas
// =============================================================================

export const reportRequestSchema = z.object({
  type: z.enum([
    'sales', 'attendance', 'revenue', 'customer', 'event', 'venue',
    'campaign', 'inventory', 'refund', 'custom'
  ]),
  name: z.string().min(1).max(255),
  dateRange: dateRangeSchema,
  filters: z.record(z.string(), z.any()).optional(),
  groupBy: z.array(z.string()).optional(),
  metrics: z.array(z.string()).min(1),
  format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
});

export const scheduledReportSchema = z.object({
  reportConfig: reportRequestSchema,
  schedule: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/), // HH:mm
    timezone: z.string().default('UTC'),
    dayOfWeek: z.number().int().min(0).max(6).optional(), // 0 = Sunday
    dayOfMonth: z.number().int().min(1).max(28).optional(),
  }),
  recipients: z.array(z.string().email()).min(1),
  enabled: z.boolean().default(true),
});

// =============================================================================
// Alert Schemas
// =============================================================================

export const alertConfigSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  metric: z.string().min(1),
  condition: z.object({
    operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'ne', 'change']),
    threshold: z.number(),
    window: z.number().int().min(60).max(86400).default(300), // seconds
  }),
  severity: z.enum(['info', 'warning', 'critical']).default('warning'),
  channels: z.array(z.enum(['email', 'slack', 'webhook', 'sms'])).min(1),
  recipients: z.array(z.string()).optional(),
  webhookUrl: z.string().url().optional(),
  cooldown: z.number().int().min(60).max(86400).default(3600), // seconds between alerts
  enabled: z.boolean().default(true),
});

// =============================================================================
// Export Schemas
// =============================================================================

export const exportRequestSchema = z.object({
  type: z.enum(['customers', 'events', 'transactions', 'tickets', 'analytics']),
  format: z.enum(['csv', 'json', 'xlsx']).default('csv'),
  dateRange: dateRangeSchema.optional(),
  filters: z.record(z.string(), z.any()).optional(),
  fields: z.array(z.string()).optional(),
  anonymize: z.boolean().default(false), // Remove PII
});

// =============================================================================
// Campaign Analytics Schemas
// =============================================================================

export const campaignQuerySchema = z.object({
  campaignId: uuidSchema.optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  type: z.enum(['email', 'sms', 'push', 'all']).default('all'),
  ...dateRangeSchema.partial().shape,
  ...paginationSchema.shape,
});

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

// =============================================================================
// Type Exports
// =============================================================================

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type MetricsQuery = z.infer<typeof metricsQuerySchema>;
export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;
export type CustomerQuery = z.infer<typeof customerQuerySchema>;
export type RfmConfig = z.infer<typeof rfmConfigSchema>;
export type ReportRequest = z.infer<typeof reportRequestSchema>;
export type ScheduledReport = z.infer<typeof scheduledReportSchema>;
export type AlertConfig = z.infer<typeof alertConfigSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;
export type CampaignQuery = z.infer<typeof campaignQuerySchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
