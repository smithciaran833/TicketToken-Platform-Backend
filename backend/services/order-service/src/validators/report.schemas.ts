import Joi from 'joi';

export const dailyReportSchema = Joi.object({
  date: Joi.date().required(),
});

export const weeklyReportSchema = Joi.object({
  startDate: Joi.date().required(),
});

export const monthlyReportSchema = Joi.object({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
});

export const dateRangeSchema = Joi.object({
  startDate: Joi.date().required(),
  endDate: Joi.date().required().min(Joi.ref('startDate')),
  eventId: Joi.string().uuid().optional(),
  venueId: Joi.string().uuid().optional(),
  status: Joi.array().items(Joi.string()).optional(),
});

export const exportRequestSchema = Joi.object({
  reportType: Joi.string().valid('orders', 'revenue', 'customers', 'financial').required(),
  format: Joi.string().valid('CSV', 'JSON', 'EXCEL', 'PDF').required(),
  filters: Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    eventId: Joi.string().uuid().optional(),
    venueId: Joi.string().uuid().optional(),
    status: Joi.array().items(Joi.string()).optional(),
  }).optional(),
});

export const scheduledExportSchema = Joi.object({
  reportType: Joi.string().required(),
  format: Joi.string().valid('CSV', 'JSON', 'EXCEL', 'PDF').required(),
  schedule: Joi.string().required(), // Cron expression
  filters: Joi.object().optional(),
  recipients: Joi.array().items(Joi.string().email()).min(1).required(),
  deliveryMethod: Joi.string().valid('EMAIL', 'S3', 'BOTH').required(),
  s3Bucket: Joi.string().when('deliveryMethod', {
    is: Joi.valid('S3', 'BOTH'),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  s3Path: Joi.string().when('deliveryMethod', {
    is: Joi.valid('S3', 'BOTH'),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

export const reconciliationImportSchema = Joi.object({
  transactions: Joi.array().items(
    Joi.object({
      externalTransactionId: Joi.string().required(),
      paymentProvider: Joi.string().required(),
      transactionType: Joi.string().valid('CHARGE', 'REFUND', 'CHARGEBACK').required(),
      amountCents: Joi.number().integer().min(0).required(),
      currency: Joi.string().length(3).required(),
      transactionDate: Joi.date().required(),
      status: Joi.string().valid('COMPLETED', 'PENDING', 'FAILED').required(),
      metadata: Joi.object().optional(),
    })
  ).min(1).required(),
});

export const customerSegmentQuerySchema = Joi.object({
  segmentId: Joi.string().uuid().required(),
});

export const topCustomersQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(10),
  orderBy: Joi.string().valid('clv', 'frequency').default('clv'),
});

export const feeBreakdownQuerySchema = Joi.object({
  orderId: Joi.string().uuid().required(),
});

export const chargebacksQuerySchema = Joi.object({
  status: Joi.string().valid('PENDING', 'SUBMITTED', 'WON', 'LOST', 'WITHDRAWN').optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
});

export const unreconciledOrdersQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(7),
});
