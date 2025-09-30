// import { serviceCache } from '../services/cache-integration'; // TODO: Remove if not needed
import { Request, Response, NextFunction } from 'express';
import { BaseController } from './base.controller';
import { MetricsService, AggregationService } from '../services';
import { MetricType, DateRange } from '../types';

class MetricsController extends BaseController {
  private metricsService: MetricsService;
  private aggregationService: AggregationService;

  constructor() {
    super();
    this.metricsService = MetricsService.getInstance();
    this.aggregationService = AggregationService.getInstance();
  }

  recordMetric = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { venueId } = req.params;
      const { metricType, value, dimensions, metadata } = req.body;
      
      const metric = await this.metricsService.recordMetric(
        venueId,
        metricType,
        value,
        dimensions,
        metadata
      );
      
      this.success(res, { metric });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  bulkRecordMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { metrics } = req.body;
      
      // bulkRecordMetrics expects an array, not venueId separately
      await this.metricsService.bulkRecordMetrics(metrics);
      
      this.success(res, { 
        message: 'Metrics recorded',
        recorded: metrics.length
      });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { venueId } = req.params;
      const { startDate, endDate, metricType, granularity } = req.query;
      
      // Parse granularity if provided
      const timeGranularity = granularity ? {
        unit: (granularity as string).split('-')[0] as 'minute' | 'hour' | 'day' | 'week' | 'month',
        value: parseInt((granularity as string).split('-')[1] || '1')
      } : undefined;
      
      const metrics = await this.metricsService.getMetrics(
        venueId,
        metricType as MetricType,
        {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        },
        timeGranularity
      );
      
      this.success(res, { metrics });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getRealTimeMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { venueId } = req.params;
      
      const metrics = await this.metricsService.getRealTimeMetrics(venueId);
      
      this.success(res, { metrics });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getMetricTrends = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { venueId } = req.params;
      const { metricType, startDate, endDate, granularity } = req.query;
      
      // Use aggregateMetrics to get trend data
      const trends = await this.aggregationService.aggregateMetrics(
        venueId,
        metricType as MetricType,
        {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        },
        {
          unit: (granularity as string || 'day').split('-')[0] as any,
          value: parseInt((granularity as string || 'day-1').split('-')[1] || '1')
        }
      );
      
      this.success(res, { trends });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  compareMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { venueId } = req.params;
      const { metricType, currentPeriod, previousPeriod } = req.query;
      
      // Use getComparativeMetrics instead
      // Parse period strings to DateRange
      const currentRange = this.parsePeriodString(currentPeriod as string);
      const previousRange = this.parsePeriodString(previousPeriod as string);
      
      const comparison = await this.aggregationService.getComparativeMetrics(
        venueId,
        metricType as MetricType,
        currentRange,
        previousRange,
        { unit: 'day', value: 1 }
      );
      
      this.success(res, { comparison });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getAggregatedMetric = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { venueId } = req.params;
      const { metricType, startDate, endDate } = req.query;
      
      // Use aggregateMetrics and sum the values
      const metrics = await this.aggregationService.aggregateMetrics(
        venueId,
        metricType as MetricType,
        {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        },
        { unit: 'day', value: 1 }
      );
      
      
      const totalValue = metrics.summary?.total || 0;
      
      this.success(res, { value: totalValue });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  private parsePeriodString(period: string): DateRange {
    const now = new Date();
    const [value, unit] = period.split('_');
    const amount = parseInt(value) || 1;
    
    const startDate = new Date(now);
    if (unit === 'days') startDate.setDate(now.getDate() - amount);
    else if (unit === 'weeks') startDate.setDate(now.getDate() - (amount * 7));
    else if (unit === 'months') startDate.setMonth(now.getMonth() - amount);
    
    return {
      startDate,
      endDate: now
    };
  }
}

export const metricsController = new MetricsController();
