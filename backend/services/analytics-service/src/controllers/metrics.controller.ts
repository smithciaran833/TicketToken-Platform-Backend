import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import { MetricsService, AggregationService } from '../services';
import { MetricType, DateRange } from '../types';

interface RecordMetricBody {
  metricType: string;
  value: number;
  venueId: string;
  dimensions?: Record<string, any>;
  metadata?: Record<string, any>;
}

interface BulkRecordMetricsBody {
  metrics: RecordMetricBody[];
}

interface GetMetricsParams {
  venueId: string;
}

interface GetMetricsQuery {
  startDate: string;
  endDate: string;
  metricType: string;
  granularity?: string;
}

interface GetMetricTrendsQuery {
  metricType: string;
  periods: number;
  periodUnit: 'hour' | 'day' | 'week' | 'month';
}

interface CompareMetricsQuery {
  metricType: string;
  currentStartDate: string;
  currentEndDate: string;
  previousStartDate: string;
  previousEndDate: string;
}

interface AggregateMetricQuery {
  metricType: string;
  startDate: string;
  endDate: string;
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count';
}

class MetricsController extends BaseController {
  private metricsService: MetricsService;
  private aggregationService: AggregationService;

  constructor() {
    super();
    this.metricsService = MetricsService.getInstance();
    this.aggregationService = AggregationService.getInstance();
  }

  recordMetric = async (
    request: FastifyRequest<{ Body: RecordMetricBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId, metricType, value, dimensions, metadata } = request.body;

      const metric = await this.metricsService.recordMetric(
        venueId,
        metricType as MetricType,
        value,
        dimensions,
        metadata
      );

      return this.success(reply, { metric });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  bulkRecordMetrics = async (
    request: FastifyRequest<{ Body: BulkRecordMetricsBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { metrics } = request.body;

      // Convert string metricType to MetricType enum
      const formattedMetrics = metrics.map(m => ({
        venueId: m.venueId,
        metricType: m.metricType as MetricType,
        value: m.value,
        dimensions: m.dimensions,
        metadata: m.metadata
      }));

      await this.metricsService.bulkRecordMetrics(formattedMetrics);

      return this.success(reply, {
        message: 'Metrics recorded',
        recorded: metrics.length
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getMetrics = async (
    request: FastifyRequest<{ Params: GetMetricsParams; Querystring: GetMetricsQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { startDate, endDate, metricType, granularity } = request.query;

      // Parse granularity if provided
      const timeGranularity = granularity ? {
        unit: (granularity as string).split('-')[0] as 'minute' | 'hour' | 'day' | 'week' | 'month',
        value: parseInt((granularity as string).split('-')[1] || '1')
      } : undefined;

      const metrics = await this.metricsService.getMetrics(
        venueId,
        metricType as MetricType,
        {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        },
        timeGranularity
      );

      return this.success(reply, { metrics });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getRealTimeMetrics = async (
    request: FastifyRequest<{ Params: GetMetricsParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;

      const metrics = await this.metricsService.getRealTimeMetrics(venueId);

      return this.success(reply, { metrics });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getMetricTrends = async (
    request: FastifyRequest<{ Params: GetMetricsParams; Querystring: GetMetricTrendsQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { metricType, periods, periodUnit } = request.query;

      // Calculate date range from periods
      const endDate = new Date();
      const startDate = new Date();

      if (periodUnit === 'hour') {
        startDate.setHours(endDate.getHours() - periods);
      } else if (periodUnit === 'day') {
        startDate.setDate(endDate.getDate() - periods);
      } else if (periodUnit === 'week') {
        startDate.setDate(endDate.getDate() - (periods * 7));
      } else if (periodUnit === 'month') {
        startDate.setMonth(endDate.getMonth() - periods);
      }

      const trends = await this.aggregationService.aggregateMetrics(
        venueId,
        metricType as MetricType,
        { startDate, endDate },
        { unit: periodUnit, value: 1 }
      );

      return this.success(reply, { trends });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  compareMetrics = async (
    request: FastifyRequest<{ Params: GetMetricsParams; Querystring: CompareMetricsQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { metricType, currentStartDate, currentEndDate, previousStartDate, previousEndDate } = request.query;

      const currentRange: DateRange = {
        startDate: new Date(currentStartDate),
        endDate: new Date(currentEndDate)
      };

      const previousRange: DateRange = {
        startDate: new Date(previousStartDate),
        endDate: new Date(previousEndDate)
      };

      const comparison = await this.aggregationService.getComparativeMetrics(
        venueId,
        metricType as MetricType,
        currentRange,
        previousRange,
        { unit: 'day', value: 1 }
      );

      return this.success(reply, { comparison });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getAggregatedMetric = async (
    request: FastifyRequest<{ Params: GetMetricsParams; Querystring: AggregateMetricQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { metricType, startDate, endDate } = request.query;

      const metrics = await this.aggregationService.aggregateMetrics(
        venueId,
        metricType as MetricType,
        {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        },
        { unit: 'day', value: 1 }
      );

      const totalValue = metrics.summary?.total || 0;

      return this.success(reply, { value: totalValue });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };
}

export const metricsController = new MetricsController();
