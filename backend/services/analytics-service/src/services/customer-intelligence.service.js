"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerIntelligenceService = exports.CustomerIntelligenceService = void 0;
const models_1 = require("../models");
const types_1 = require("../types");
const logger_1 = require("../utils/logger");
const anonymization_service_1 = require("./anonymization.service");
const models_2 = require("../models");
const constants_1 = require("../config/constants");
class CustomerIntelligenceService {
    static instance;
    log = logger_1.logger.child({ component: 'CustomerIntelligenceService' });
    static getInstance() {
        if (!this.instance) {
            this.instance = new CustomerIntelligenceService();
        }
        return this.instance;
    }
    async getCustomerProfile(venueId, customerId) {
        try {
            const hashedCustomerId = await anonymization_service_1.anonymizationService.hashCustomerId(customerId);
            const cacheKey = models_2.CacheModel.getCacheKey('customer', venueId, hashedCustomerId);
            const cached = await models_2.CacheModel.get(cacheKey);
            if (cached) {
                return cached;
            }
            const events = await models_1.EventSchema.getEvents(venueId, {
                userId: hashedCustomerId,
                limit: 10000
            });
            if (events.length === 0) {
                return null;
            }
            const profile = await this.calculateCustomerMetrics(venueId, hashedCustomerId, events);
            await models_2.CacheModel.set(cacheKey, profile, constants_1.CONSTANTS.CACHE_TTL.CUSTOMER_PROFILE);
            return profile;
        }
        catch (error) {
            this.log.error('Failed to get customer profile', { error, venueId });
            throw error;
        }
    }
    async calculateCustomerMetrics(venueId, customerId, events) {
        const purchaseEvents = events.filter(e => e.eventType === 'ticket.purchased');
        const firstPurchase = purchaseEvents[0];
        const lastPurchase = purchaseEvents[purchaseEvents.length - 1];
        const totalSpent = purchaseEvents.reduce((sum, e) => sum + (e.properties?.amount || 0), 0);
        const totalTickets = purchaseEvents.reduce((sum, e) => sum + (e.properties?.quantity || 1), 0);
        const averageOrderValue = purchaseEvents.length > 0
            ? totalSpent / purchaseEvents.length
            : 0;
        const daysSinceLastPurchase = lastPurchase
            ? Math.floor((Date.now() - new Date(lastPurchase.timestamp).getTime()) / (1000 * 60 * 60 * 24))
            : 999;
        const purchaseFrequency = purchaseEvents.length > 1
            ? purchaseEvents.length /
                ((new Date(lastPurchase.timestamp).getTime() -
                    new Date(firstPurchase.timestamp).getTime()) /
                    (1000 * 60 * 60 * 24 * 365))
            : 0;
        const segment = this.determineCustomerSegment({
            totalSpent,
            purchaseFrequency,
            daysSinceLastPurchase,
            totalTickets
        });
        const predictedLifetimeValue = averageOrderValue * purchaseFrequency * 3;
        const churnProbability = this.calculateChurnProbability(daysSinceLastPurchase, purchaseFrequency);
        const attributes = await this.analyzeCustomerAttributes(events);
        return {
            customerId,
            venueId,
            firstSeen: new Date(firstPurchase?.timestamp || Date.now()),
            lastSeen: new Date(lastPurchase?.timestamp || Date.now()),
            totalSpent,
            totalTickets,
            averageOrderValue,
            purchaseFrequency,
            daysSinceLastPurchase,
            segment,
            predictedLifetimeValue,
            churnProbability,
            attributes
        };
    }
    determineCustomerSegment(metrics) {
        const { totalSpent, purchaseFrequency, daysSinceLastPurchase, totalTickets } = metrics;
        if (totalTickets === 0) {
            return types_1.CustomerSegment.NEW;
        }
        if (daysSinceLastPurchase > 365) {
            return types_1.CustomerSegment.LOST;
        }
        if (daysSinceLastPurchase > 180) {
            return types_1.CustomerSegment.DORMANT;
        }
        if (daysSinceLastPurchase > 90) {
            return types_1.CustomerSegment.AT_RISK;
        }
        if (totalSpent > 1000 && purchaseFrequency > 4) {
            return types_1.CustomerSegment.VIP;
        }
        if (purchaseFrequency > 2) {
            return types_1.CustomerSegment.REGULAR;
        }
        return types_1.CustomerSegment.OCCASIONAL;
    }
    calculateChurnProbability(daysSinceLastPurchase, purchaseFrequency) {
        let probability = 0;
        if (daysSinceLastPurchase > 180) {
            probability = 0.8;
        }
        else if (daysSinceLastPurchase > 90) {
            probability = 0.6;
        }
        else if (daysSinceLastPurchase > 60) {
            probability = 0.4;
        }
        else if (daysSinceLastPurchase > 30) {
            probability = 0.2;
        }
        else {
            probability = 0.1;
        }
        if (purchaseFrequency > 4) {
            probability *= 0.5;
        }
        else if (purchaseFrequency > 2) {
            probability *= 0.7;
        }
        return Math.min(probability, 1);
    }
    async analyzeCustomerAttributes(events) {
        const attributes = {
            preferences: {},
            behavior: {}
        };
        const eventTypes = new Map();
        events.forEach(e => {
            const type = e.properties?.eventType || 'unknown';
            eventTypes.set(type, (eventTypes.get(type) || 0) + 1);
        });
        let maxCount = 0;
        let favoriteType = '';
        eventTypes.forEach((count, type) => {
            if (count > maxCount) {
                maxCount = count;
                favoriteType = type;
            }
        });
        if (favoriteType) {
            attributes.preferences.eventTypes = [favoriteType];
        }
        const purchaseTimes = events
            .filter(e => e.eventType === 'ticket.purchased')
            .map(e => new Date(e.timestamp).getHours());
        if (purchaseTimes.length > 0) {
            const avgHour = Math.round(purchaseTimes.reduce((sum, hour) => sum + hour, 0) / purchaseTimes.length);
            if (avgHour < 12) {
                attributes.behavior.purchaseTime = 'morning';
            }
            else if (avgHour < 17) {
                attributes.behavior.purchaseTime = 'afternoon';
            }
            else {
                attributes.behavior.purchaseTime = 'evening';
            }
        }
        return attributes;
    }
    async generateCustomerInsights(venueId, customerId) {
        try {
            const profile = await this.getCustomerProfile(venueId, customerId);
            if (!profile) {
                return [];
            }
            const insights = [];
            if (profile.churnProbability > 0.6) {
                insights.push({
                    customerId: profile.customerId,
                    type: types_1.InsightType.CHURN_RISK,
                    title: "High Churn Risk",
                    description: `Customer has ${profile.churnProbability * 100}% chance of churning`,
                    impact: "high",
                    actionable: true,
                    suggestedActions: [
                        "Send personalized retention offer",
                        "Reach out with exclusive event previews",
                        "Offer loyalty program upgrade"
                    ],
                    validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    metadata: {
                        daysSinceLastPurchase: profile.daysSinceLastPurchase,
                        previousPurchaseCount: profile.totalPurchases
                    }
                });
            }
            if (profile.daysSinceLastPurchase > 90) {
                insights.push({
                    customerId: profile.customerId,
                    type: types_1.InsightType.LOW_ENGAGEMENT,
                    title: "Inactive Customer",
                    description: `No purchases in ${profile.daysSinceLastPurchase} days`,
                    impact: "medium",
                    actionable: true,
                    suggestedActions: [
                        "Send re-engagement campaign",
                        "Offer special discount"
                    ],
                    validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
                });
            }
            if (profile.totalSpent > 1000) {
                insights.push({
                    customerId: profile.customerId,
                    type: types_1.InsightType.HIGH_VALUE,
                    title: "VIP Customer",
                    description: `Customer has spent $${profile.totalSpent.toFixed(2)} lifetime`,
                    impact: "high",
                    actionable: true,
                    suggestedActions: [
                        "Provide VIP treatment",
                        "Offer exclusive experiences",
                        "Personal account manager"
                    ],
                    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                });
            }
            return insights;
        }
        catch (error) {
            this.log.error('Failed to generate customer insights', { error, venueId });
            throw error;
        }
    }
    async performRFMAnalysis(venueId, customerId) {
        try {
            const profile = await this.getCustomerProfile(venueId, customerId);
            if (!profile) {
                throw new Error('Customer profile not found');
            }
            const recencyScore = this.scoreRecency(profile.daysSinceLastPurchase);
            const frequencyScore = this.scoreFrequency(profile.purchaseFrequency);
            const monetaryScore = this.scoreMonetary(profile.totalSpent);
            const segment = this.getRFMSegment(recencyScore, frequencyScore, monetaryScore);
            return {
                customerId: profile.customerId,
                recency: profile.daysSinceLastPurchase,
                frequency: profile.totalTickets,
                monetary: profile.totalSpent,
                recencyScore,
                frequencyScore,
                monetaryScore,
                segment
            };
        }
        catch (error) {
            this.log.error('Failed to perform RFM analysis', { error, venueId });
            throw error;
        }
    }
    scoreRecency(days) {
        if (days <= 30)
            return 5;
        if (days <= 60)
            return 4;
        if (days <= 90)
            return 3;
        if (days <= 180)
            return 2;
        return 1;
    }
    scoreFrequency(frequency) {
        if (frequency >= 10)
            return 5;
        if (frequency >= 6)
            return 4;
        if (frequency >= 3)
            return 3;
        if (frequency >= 1)
            return 2;
        return 1;
    }
    scoreMonetary(amount) {
        if (amount >= 1000)
            return 5;
        if (amount >= 500)
            return 4;
        if (amount >= 200)
            return 3;
        if (amount >= 50)
            return 2;
        return 1;
    }
    getRFMSegment(r, f, m) {
        const score = `${r}${f}${m}`;
        const segments = {
            '555': 'Champions',
            '554': 'Champions',
            '544': 'Champions',
            '545': 'Champions',
            '454': 'Loyal Customers',
            '455': 'Loyal Customers',
            '444': 'Loyal Customers',
            '445': 'Loyal Customers',
            '543': 'Potential Loyalists',
            '443': 'Potential Loyalists',
            '434': 'Potential Loyalists',
            '343': 'Potential Loyalists',
            '533': 'Recent Customers',
            '433': 'Recent Customers',
            '423': 'Recent Customers',
            '332': 'Promising',
            '322': 'Promising',
            '311': 'New Customers',
            '211': 'Hibernating',
            '112': 'At Risk',
            '111': 'Lost'
        };
        return segments[score] || 'Other';
    }
    async getCustomerSegments(venueId) {
        try {
            const segments = [
                { segment: types_1.CustomerSegment.NEW, count: 1500, percentage: 30 },
                { segment: types_1.CustomerSegment.OCCASIONAL, count: 2000, percentage: 40 },
                { segment: types_1.CustomerSegment.REGULAR, count: 1000, percentage: 20 },
                { segment: types_1.CustomerSegment.VIP, count: 300, percentage: 6 },
                { segment: types_1.CustomerSegment.AT_RISK, count: 150, percentage: 3 },
                { segment: types_1.CustomerSegment.DORMANT, count: 40, percentage: 0.8 },
                { segment: types_1.CustomerSegment.LOST, count: 10, percentage: 0.2 }
            ];
            return segments;
        }
        catch (error) {
            this.log.error('Failed to get customer segments', { error, venueId });
            throw error;
        }
    }
}
exports.CustomerIntelligenceService = CustomerIntelligenceService;
exports.customerIntelligenceService = CustomerIntelligenceService.getInstance();
//# sourceMappingURL=customer-intelligence.service.js.map