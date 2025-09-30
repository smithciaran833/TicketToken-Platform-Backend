import { body, query } from 'express-validator';

export const analyticsValidators = {
  dateRange: [
    query('startDate')
      .notEmpty().withMessage('Start date is required')
      .isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .notEmpty().withMessage('End date is required')
      .isISO8601().withMessage('End date must be a valid ISO 8601 date')
      .custom((endDate: string, { req }: any) => {
        const start = new Date(req.query?.startDate as string);
        const end = new Date(endDate);
        if (end < start) {
          throw new Error('End date must be after start date');
        }
        if (end > new Date()) {
          throw new Error('End date cannot be in the future');
        }
        return true;
      })
  ],

  projection: [
    query('days')
      .optional()
      .isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365')
  ],

  churnRisk: [
    query('threshold')
      .optional()
      .isInt({ min: 1, max: 365 }).withMessage('Threshold must be between 1 and 365 days')
  ],

  salesMetrics: [
    query('startDate')
      .notEmpty().withMessage('Start date is required')
      .isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .notEmpty().withMessage('End date is required')
      .isISO8601().withMessage('End date must be a valid ISO 8601 date'),
    query('granularity')
      .optional()
      .isIn(['hour', 'day', 'week', 'month']).withMessage('Invalid granularity')
  ],

  topEvents: [
    query('startDate')
      .notEmpty().withMessage('Start date is required')
      .isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .notEmpty().withMessage('End date is required')
      .isISO8601().withMessage('End date must be a valid ISO 8601 date'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],

  customQuery: [
    body('metrics')
      .isArray({ min: 1 }).withMessage('At least one metric is required')
      .custom((metrics: string[]) => {
        const validMetrics = ['revenue', 'ticketSales', 'conversionRate', 'customerMetrics', 'topEvents', 'salesTrends'];
        return metrics.every((m: string) => validMetrics.includes(m));
      }).withMessage('Invalid metric specified'),
    body('timeRange.start')
      .notEmpty().withMessage('Start date is required')
      .isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
    body('timeRange.end')
      .notEmpty().withMessage('End date is required')
      .isISO8601().withMessage('End date must be a valid ISO 8601 date'),
    body('timeRange.granularity')
      .optional()
      .isIn(['hour', 'day', 'week', 'month']).withMessage('Invalid granularity'),
    body('filters')
      .optional()
      .isObject().withMessage('Filters must be an object'),
    body('groupBy')
      .optional()
      .isArray().withMessage('GroupBy must be an array')
  ],

  dashboard: [
    query('period')
      .optional()
      .isIn(['24h', '7d', '30d', '90d']).withMessage('Invalid period')
  ]
};
