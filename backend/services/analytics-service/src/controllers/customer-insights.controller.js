"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerInsightsController = exports.CustomerInsightsController = void 0;
const customer_insights_service_1 = require("../services/customer-insights.service");
const logger_1 = require("../utils/logger");
class CustomerInsightsController {
    async getCustomerProfile(request, reply) {
        try {
            const { userId } = request.params;
            const requestingUserId = request.user?.id;
            const isAdmin = request.user?.role === 'admin';
            if (!requestingUserId) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }
            if (userId !== requestingUserId && !isAdmin) {
                return reply.status(403).send({ error: 'Forbidden' });
            }
            const profile = await customer_insights_service_1.customerInsightsService.getCustomerProfile(userId);
            if (!profile) {
                return reply.status(404).send({ error: 'Customer profile not found' });
            }
            reply.send({ success: true, data: profile });
        }
        catch (error) {
            logger_1.logger.error('Error getting customer profile:', error);
            reply.status(500).send({ error: 'Failed to get customer profile' });
        }
    }
    async getVenueCustomerSegments(request, reply) {
        try {
            const { venueId } = request.params;
            const userId = request.user?.id;
            if (!userId) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }
            const segments = await customer_insights_service_1.customerInsightsService.segmentCustomers(venueId);
            reply.send({ success: true, data: segments });
        }
        catch (error) {
            logger_1.logger.error('Error getting customer segments:', error);
            reply.status(500).send({ error: 'Failed to get customer segments' });
        }
    }
    async getCustomerPreferences(request, reply) {
        try {
            const { userId } = request.params;
            const requestingUserId = request.user?.id;
            const isAdmin = request.user?.role === 'admin';
            if (!requestingUserId) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }
            if (userId !== requestingUserId && !isAdmin) {
                return reply.status(403).send({ error: 'Forbidden' });
            }
            const preferences = await customer_insights_service_1.customerInsightsService.getEventPreferences(userId);
            reply.send({ success: true, data: preferences });
        }
        catch (error) {
            logger_1.logger.error('Error getting customer preferences:', error);
            reply.status(500).send({ error: 'Failed to get customer preferences' });
        }
    }
    async getVenueCustomerList(request, reply) {
        try {
            const { venueId } = request.params;
            const userId = request.user?.id;
            const query = request.query;
            if (!userId) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }
            const filters = {
                segment: query.segment,
                minSpent: query.minSpent ? parseInt(query.minSpent) : undefined,
                daysSinceLastPurchase: query.daysSinceLastPurchase ? parseInt(query.daysSinceLastPurchase) : undefined,
                eventCategory: query.eventCategory,
            };
            const customers = await customer_insights_service_1.customerInsightsService.getVenueCustomers(venueId, filters);
            reply.send({ success: true, data: customers, count: customers.length });
        }
        catch (error) {
            logger_1.logger.error('Error getting venue customers:', error);
            reply.status(500).send({ error: 'Failed to get venue customers' });
        }
    }
    async getCohortAnalysis(request, reply) {
        try {
            const { venueId } = request.params;
            const userId = request.user?.id;
            const query = request.query;
            if (!userId) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }
            const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
            const endDate = query.endDate ? new Date(query.endDate) : new Date();
            const cohorts = await customer_insights_service_1.customerInsightsService.getCohortAnalysis(venueId, startDate, endDate);
            reply.send({ success: true, data: cohorts });
        }
        catch (error) {
            logger_1.logger.error('Error getting cohort analysis:', error);
            reply.status(500).send({ error: 'Failed to get cohort analysis' });
        }
    }
}
exports.CustomerInsightsController = CustomerInsightsController;
exports.customerInsightsController = new CustomerInsightsController();
//# sourceMappingURL=customer-insights.controller.js.map