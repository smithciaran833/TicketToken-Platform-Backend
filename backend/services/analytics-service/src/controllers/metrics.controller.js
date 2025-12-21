"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsController = void 0;
const base_controller_1 = require("./base.controller");
const services_1 = require("../services");
class MetricsController extends base_controller_1.BaseController {
    metricsService;
    aggregationService;
    constructor() {
        super();
        this.metricsService = services_1.MetricsService.getInstance();
        this.aggregationService = services_1.AggregationService.getInstance();
    }
    recordMetric = async (request, reply) => {
        try {
            const { venueId, metricType, value, dimensions, metadata } = request.body;
            const metric = await this.metricsService.recordMetric(venueId, metricType, value, dimensions, metadata);
            return this.success(reply, { metric });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    bulkRecordMetrics = async (request, reply) => {
        try {
            const { metrics } = request.body;
            const formattedMetrics = metrics.map(m => ({
                venueId: m.venueId,
                metricType: m.metricType,
                value: m.value,
                dimensions: m.dimensions,
                metadata: m.metadata
            }));
            await this.metricsService.bulkRecordMetrics(formattedMetrics);
            return this.success(reply, {
                message: 'Metrics recorded',
                recorded: metrics.length
            });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getMetrics = async (request, reply) => {
        try {
            const { venueId } = request.params;
            const { startDate, endDate, metricType, granularity } = request.query;
            const timeGranularity = granularity ? {
                unit: granularity.split('-')[0],
                value: parseInt(granularity.split('-')[1] || '1')
            } : undefined;
            const metrics = await this.metricsService.getMetrics(venueId, metricType, {
                startDate: new Date(startDate),
                endDate: new Date(endDate)
            }, timeGranularity);
            return this.success(reply, { metrics });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getRealTimeMetrics = async (request, reply) => {
        try {
            const { venueId } = request.params;
            const metrics = await this.metricsService.getRealTimeMetrics(venueId);
            return this.success(reply, { metrics });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getMetricTrends = async (request, reply) => {
        try {
            const { venueId } = request.params;
            const { metricType, periods, periodUnit } = request.query;
            const endDate = new Date();
            const startDate = new Date();
            if (periodUnit === 'hour') {
                startDate.setHours(endDate.getHours() - periods);
            }
            else if (periodUnit === 'day') {
                startDate.setDate(endDate.getDate() - periods);
            }
            else if (periodUnit === 'week') {
                startDate.setDate(endDate.getDate() - (periods * 7));
            }
            else if (periodUnit === 'month') {
                startDate.setMonth(endDate.getMonth() - periods);
            }
            const trends = await this.aggregationService.aggregateMetrics(venueId, metricType, { startDate, endDate }, { unit: periodUnit, value: 1 });
            return this.success(reply, { trends });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    compareMetrics = async (request, reply) => {
        try {
            const { venueId } = request.params;
            const { metricType, currentStartDate, currentEndDate, previousStartDate, previousEndDate } = request.query;
            const currentRange = {
                startDate: new Date(currentStartDate),
                endDate: new Date(currentEndDate)
            };
            const previousRange = {
                startDate: new Date(previousStartDate),
                endDate: new Date(previousEndDate)
            };
            const comparison = await this.aggregationService.getComparativeMetrics(venueId, metricType, currentRange, previousRange, { unit: 'day', value: 1 });
            return this.success(reply, { comparison });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getAggregatedMetric = async (request, reply) => {
        try {
            const { venueId } = request.params;
            const { metricType, startDate, endDate } = request.query;
            const metrics = await this.aggregationService.aggregateMetrics(venueId, metricType, {
                startDate: new Date(startDate),
                endDate: new Date(endDate)
            }, { unit: 'day', value: 1 });
            const totalValue = metrics.summary?.total || 0;
            return this.success(reply, { value: totalValue });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
}
exports.metricsController = new MetricsController();
//# sourceMappingURL=metrics.controller.js.map