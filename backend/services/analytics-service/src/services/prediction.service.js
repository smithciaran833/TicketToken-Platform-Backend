"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.predictionService = exports.PredictionService = void 0;
const types_1 = require("../types");
const logger_1 = require("../utils/logger");
const customer_intelligence_service_1 = require("./customer-intelligence.service");
const tf = __importStar(require("@tensorflow/tfjs-node"));
class PredictionService {
    static instance;
    log = logger_1.logger.child({ component: 'PredictionService' });
    models = new Map();
    static getInstance() {
        if (!this.instance) {
            this.instance = new PredictionService();
        }
        return this.instance;
    }
    async initialize() {
        try {
            this.log.info('Initializing prediction models...');
            await this.initializePlaceholderModels();
            this.log.info('Prediction models initialized');
        }
        catch (error) {
            this.log.error('Failed to initialize prediction models', { error });
        }
    }
    async initializePlaceholderModels() {
        const modelTypes = Object.values(types_1.ModelType);
        for (const modelType of modelTypes) {
            const model = tf.sequential({
                layers: [
                    tf.layers.dense({ inputShape: [10], units: 64, activation: 'relu' }),
                    tf.layers.dropout({ rate: 0.2 }),
                    tf.layers.dense({ units: 32, activation: 'relu' }),
                    tf.layers.dense({ units: 1, activation: 'sigmoid' })
                ]
            });
            model.compile({
                optimizer: 'adam',
                loss: 'binaryCrossentropy',
                metrics: ['accuracy']
            });
            this.models.set(modelType, model);
        }
    }
    async predictDemand(venueId, eventId, daysAhead = 30) {
        try {
            const predictions = [];
            const today = new Date();
            for (let i = 0; i < daysAhead; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() + i);
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const baseDemand = isWeekend ? 150 : 100;
                const variance = Math.random() * 50 - 25;
                const predictedDemand = Math.max(0, baseDemand + variance);
                predictions.push({
                    date,
                    ticketTypeId: 'general',
                    predictedDemand: Math.round(predictedDemand),
                    confidenceInterval: {
                        lower: Math.round(predictedDemand * 0.8),
                        upper: Math.round(predictedDemand * 1.2)
                    },
                    factors: [
                        { name: 'Day of Week', impact: isWeekend ? 1.5 : 1.0 },
                        { name: 'Seasonality', impact: 1.0 },
                        { name: 'Marketing', impact: 1.1 }
                    ]
                });
            }
            const totalPredictedDemand = predictions.reduce((sum, p) => sum + p.predictedDemand, 0);
            const peakDemand = Math.max(...predictions.map(p => p.predictedDemand));
            const peakDemandDate = predictions.find(p => p.predictedDemand === peakDemand)?.date || today;
            return {
                eventId,
                predictions,
                aggregated: {
                    totalPredictedDemand,
                    peakDemandDate,
                    sellOutProbability: totalPredictedDemand > 1000 ? 0.8 : 0.3
                }
            };
        }
        catch (error) {
            this.log.error('Failed to predict demand', { error, venueId, eventId });
            throw error;
        }
    }
    async optimizePrice(venueId, eventId, ticketTypeId, currentPrice) {
        try {
            const elasticity = -1.5;
            const recommendations = [];
            const pricePoints = [0.8, 0.9, 1.0, 1.1, 1.2].map(factor => currentPrice * factor);
            for (const price of pricePoints) {
                const priceChange = (price - currentPrice) / currentPrice;
                const demandChange = elasticity * priceChange;
                const expectedDemand = 100 * (1 + demandChange);
                const expectedRevenue = price * expectedDemand;
                recommendations.push({
                    price,
                    expectedDemand: Math.round(expectedDemand),
                    expectedRevenue: Math.round(expectedRevenue),
                    elasticity,
                    confidence: 0.7 + Math.random() * 0.2
                });
            }
            const optimal = recommendations.reduce((best, current) => current.expectedRevenue > best.expectedRevenue ? current : best);
            return {
                eventId,
                ticketTypeId,
                currentPrice,
                recommendations,
                optimalPrice: optimal.price,
                priceRange: {
                    min: Math.min(...pricePoints),
                    max: Math.max(...pricePoints)
                },
                factors: [
                    { factor: 'Demand Level', weight: 0.4, direction: 'positive' },
                    { factor: 'Competition', weight: 0.3, direction: 'negative' },
                    { factor: 'Day of Week', weight: 0.2, direction: 'positive' },
                    { factor: 'Seasonality', weight: 0.1, direction: 'positive' }
                ]
            };
        }
        catch (error) {
            this.log.error('Failed to optimize price', { error, venueId, eventId });
            throw error;
        }
    }
    async predictChurn(venueId, customerId) {
        try {
            const profile = await customer_intelligence_service_1.customerIntelligenceService.getCustomerProfile(venueId, customerId);
            if (!profile) {
                throw new Error('Customer profile not found');
            }
            const churnProbability = profile.churnProbability;
            const riskLevel = churnProbability > 0.7 ? 'high' :
                churnProbability > 0.4 ? 'medium' : 'low';
            const reasons = [];
            if (profile.daysSinceLastPurchase > 90) {
                reasons.push({
                    factor: 'Long time since last purchase',
                    weight: 0.4,
                    description: `${profile.daysSinceLastPurchase} days since last purchase`
                });
            }
            if (profile.purchaseFrequency < 2) {
                reasons.push({
                    factor: 'Low purchase frequency',
                    weight: 0.3,
                    description: `Only ${profile.purchaseFrequency.toFixed(1)} purchases per year`
                });
            }
            const recommendedActions = [];
            if (riskLevel === 'high') {
                recommendedActions.push({ action: 'Send win-back email campaign', expectedImpact: 0.3, effort: 'low' }, { action: 'Offer personalized discount', expectedImpact: 0.4, effort: 'medium' }, { action: 'Call customer directly', expectedImpact: 0.5, effort: 'high' });
            }
            else if (riskLevel === 'medium') {
                recommendedActions.push({ action: 'Include in re-engagement campaign', expectedImpact: 0.2, effort: 'low' }, { action: 'Send event recommendations', expectedImpact: 0.3, effort: 'low' });
            }
            return {
                customerId: profile.customerId,
                churnProbability,
                riskLevel: riskLevel,
                timeframe: 90,
                reasons,
                recommendedActions
            };
        }
        catch (error) {
            this.log.error('Failed to predict churn', { error, venueId, customerId });
            throw error;
        }
    }
    async predictCustomerLifetimeValue(venueId, customerId) {
        try {
            const profile = await customer_intelligence_service_1.customerIntelligenceService.getCustomerProfile(venueId, customerId);
            if (!profile) {
                throw new Error('Customer profile not found');
            }
            const monthlySpend = profile.averageOrderValue * (profile.purchaseFrequency / 12);
            const retentionRate = 1 - profile.churnProbability;
            const timeHorizon = 36;
            let clv = 0;
            let cumulativeRetention = 1;
            for (let month = 1; month <= timeHorizon; month++) {
                cumulativeRetention *= retentionRate;
                clv += monthlySpend * cumulativeRetention;
            }
            const growthPotential = profile.segment === 'new' ? 1.5 :
                profile.segment === 'occasional' ? 1.3 :
                    profile.segment === 'regular' ? 1.1 : 1.0;
            return {
                customerId: profile.customerId,
                predictedCLV: Math.round(clv),
                confidence: 0.75,
                timeHorizon,
                breakdown: {
                    expectedPurchases: Math.round(profile.purchaseFrequency * 3),
                    averageOrderValue: profile.averageOrderValue,
                    retentionProbability: retentionRate
                },
                segment: profile.segment,
                growthPotential
            };
        }
        catch (error) {
            this.log.error('Failed to predict CLV', { error, venueId, customerId });
            throw error;
        }
    }
    async predictNoShow(venueId, ticketId, customerId, eventId) {
        try {
            const profile = await customer_intelligence_service_1.customerIntelligenceService.getCustomerProfile(venueId, customerId);
            const riskFactors = [];
            let noShowProbability = 0.1;
            if (profile) {
                if (profile.daysSinceLastPurchase > 180) {
                    noShowProbability += 0.2;
                    riskFactors.push({
                        factor: 'Inactive customer',
                        value: profile.daysSinceLastPurchase,
                        contribution: 0.2
                    });
                }
                if (profile.averageOrderValue < 50) {
                    noShowProbability += 0.1;
                    riskFactors.push({
                        factor: 'Low-value tickets',
                        value: profile.averageOrderValue,
                        contribution: 0.1
                    });
                }
            }
            const weatherRisk = Math.random() * 0.2;
            if (weatherRisk > 0.1) {
                noShowProbability += weatherRisk;
                riskFactors.push({
                    factor: 'Weather conditions',
                    value: 'Rain expected',
                    contribution: weatherRisk
                });
            }
            const recommendedActions = noShowProbability > 0.3 ? [
                'Send reminder 24 hours before event',
                'Offer easy parking information',
                'Enable ticket transfer option'
            ] : [];
            return {
                ticketId,
                customerId,
                eventId,
                noShowProbability: Math.min(noShowProbability, 1),
                riskFactors,
                recommendedActions
            };
        }
        catch (error) {
            this.log.error('Failed to predict no-show', { error, venueId, ticketId });
            throw error;
        }
    }
    async runWhatIfScenario(venueId, scenario) {
        try {
            const baselineMetrics = {
                revenue: 100000,
                attendance: 1000,
                conversionRate: 0.05,
                averageTicketPrice: 100
            };
            const scenarios = [];
            if (scenario.type === 'pricing') {
                const priceChanges = [-20, -10, 0, 10, 20];
                for (const change of priceChanges) {
                    const newPrice = baselineMetrics.averageTicketPrice * (1 + change / 100);
                    const elasticity = -1.5;
                    const demandChange = elasticity * (change / 100);
                    const newAttendance = baselineMetrics.attendance * (1 + demandChange);
                    const newRevenue = newPrice * newAttendance;
                    scenarios.push({
                        name: `${change > 0 ? '+' : ''}${change}% price`,
                        parameters: { priceChange: change },
                        predictions: {
                            revenue: Math.round(newRevenue),
                            attendance: Math.round(newAttendance),
                            averageTicketPrice: newPrice
                        },
                        impact: {
                            revenue: ((newRevenue - baselineMetrics.revenue) / baselineMetrics.revenue) * 100,
                            attendance: ((newAttendance - baselineMetrics.attendance) / baselineMetrics.attendance) * 100
                        }
                    });
                }
            }
            return {
                id: scenario.id || 'scenario-' + Date.now(),
                name: scenario.name || 'What-If Analysis',
                type: scenario.type || 'pricing',
                baselineMetrics,
                scenarios,
                recommendations: [
                    'Consider moderate price increases for high-demand events',
                    'Monitor competitor pricing regularly',
                    'Test dynamic pricing strategies'
                ]
            };
        }
        catch (error) {
            this.log.error('Failed to run what-if scenario', { error, venueId });
            throw error;
        }
    }
}
exports.PredictionService = PredictionService;
exports.predictionService = PredictionService.getInstance();
//# sourceMappingURL=prediction.service.js.map