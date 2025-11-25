import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { logger } from '../logger';

/**
 * Validation middleware for monitoring service endpoints
 * Uses Joi for schema validation
 */

// Common validation schemas
export const schemas = {
  // Query parameters for business metrics endpoint
  businessMetricsQuery: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
    granularity: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
    metrics: Joi.string().pattern(/^[a-z_,]+$/).optional(), // Comma-separated metric names
  }),

  // Query parameters for alerts endpoint
  alertsQuery: Joi.object({
    status: Joi.string().valid('active', 'resolved', 'acknowledged', 'all').default('active'),
    severity: Joi.string().valid('critical', 'high', 'medium', 'low', 'all').default('all'),
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0),
    sortBy: Joi.string().valid('timestamp', 'severity', 'metric').default('timestamp'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),

  // Body for alert acknowledgment
  acknowledgeAlertBody: Joi.object({
    alertId: Joi.string().uuid().required(),
    acknowledgedBy: Joi.string().required(),
    comment: Joi.string().max(1000).optional(),
  }),

  // Query parameters for metrics history
  metricsHistoryQuery: Joi.object({
    metricName: Joi.string().required(),
    startTime: Joi.date().iso().required(),
    endTime: Joi.date().iso().min(Joi.ref('startTime')).required(),
    aggregation: Joi.string().valid('avg', 'sum', 'min', 'max', 'count').default('avg'),
    interval: Joi.string().valid('1m', '5m', '15m', '1h', '6h', '1d').default('5m'),
  }),

  // Body for custom metrics
  customMetricBody: Joi.object({
    name: Joi.string().pattern(/^[a-z_][a-z0-9_]*$/).required(),
    value: Joi.number().required(),
    type: Joi.string().valid('counter', 'gauge', 'histogram').required(),
    tags: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
    timestamp: Joi.date().iso().optional(),
  }),

  // Query parameters for Grafana integration
  grafanaQuery: Joi.object({
    query: Joi.string().required(),
    start: Joi.date().iso().required(),
    end: Joi.date().iso().required(),
    step: Joi.string().pattern(/^\d+[smhd]$/).default('1m'),
  }),

  // Body for alert rule configuration
  alertRuleBody: Joi.object({
    name: Joi.string().required(),
    metric: Joi.string().required(),
    condition: Joi.string().valid('gt', 'lt', 'eq', 'gte', 'lte').required(),
    threshold: Joi.number().required(),
    duration: Joi.string().pattern(/^\d+[smh]$/).required(),
    severity: Joi.string().valid('critical', 'high', 'medium', 'low').required(),
    enabled: Joi.boolean().default(true),
    notificationChannels: Joi.array().items(Joi.string().valid('email', 'slack', 'pagerduty')).min(1),
  }),
};

/**
 * Factory function to create validation middleware
 */
export function validate(schemaName: keyof typeof schemas, location: 'query' | 'body' | 'params' = 'query') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const schema = schemas[schemaName];
      if (!schema) {
        logger.error(`Validation schema not found: ${schemaName}`);
        return reply.status(500).send({ error: 'Internal validation error' });
      }

      // Get data based on location
      let data: any;
      switch (location) {
        case 'query':
          data = request.query;
          break;
        case 'body':
          data = request.body;
          break;
        case 'params':
          data = request.params;
          break;
        default:
          data = request.query;
      }

      // Validate and sanitize
      const { error, value } = schema.validate(data, {
        abortEarly: false, // Return all errors
        stripUnknown: true, // Remove unknown fields
        convert: true, // Type conversion
      });

      if (error) {
        const errorDetails = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type,
        }));

        logger.warn('Validation error:', {
          endpoint: request.url,
          errors: errorDetails,
        });

        return reply.status(400).send({
          error: 'Validation failed',
          details: errorDetails,
        });
      }

      // Replace original data with validated/sanitized data
      switch (location) {
        case 'query':
          (request as any).query = value;
          break;
        case 'body':
          (request as any).body = value;
          break;
        case 'params':
          (request as any).params = value;
          break;
      }

    } catch (err) {
      logger.error('Validation middleware error:', err);
      return reply.status(500).send({ error: 'Validation error' });
    }
  };
}

/**
 * Sanitize user input to prevent XSS and injection attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/['"]/g, '') //Remove quotes
    .trim()
    .substring(0, 1000); // Limit length
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate date range
 */
export function isValidDateRange(start: Date, end: Date, maxDays: number = 90): boolean {
  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= maxDays;
}
