"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricingController = exports.PricingController = void 0;
const dynamic_pricing_service_1 = require("../services/dynamic-pricing.service");
const demand_tracker_service_1 = require("../services/demand-tracker.service");
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
class PricingController {
    async getPriceRecommendation(request, reply) {
        try {
            const { eventId } = request.params;
            const userId = request.user?.id;
            if (!userId) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }
            const db = (0, database_1.getDb)();
            const eventResult = await db.raw(`SELECT e.price_cents, e.venue_id FROM events e WHERE e.id = ?`, [eventId]);
            if (eventResult.rows.length === 0) {
                return reply.status(404).send({ error: 'Event not found' });
            }
            const event = eventResult.rows[0];
            const rules = await dynamic_pricing_service_1.dynamicPricingService.getVenuePricingRules(event.venue_id);
            const recommendation = await dynamic_pricing_service_1.dynamicPricingService.calculateOptimalPrice(eventId, event.price_cents, rules);
            reply.send({ success: true, data: recommendation });
        }
        catch (error) {
            logger_1.logger.error('Error getting price recommendation:', error);
            reply.status(500).send({ error: 'Failed to get price recommendation' });
        }
    }
    async getPendingPriceChanges(request, reply) {
        try {
            const { venueId } = request.params;
            const userId = request.user?.id;
            if (!userId) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }
            const db = (0, database_1.getDb)();
            const result = await db.raw(`SELECT ppc.*, e.name as event_name, e.start_time FROM pending_price_changes ppc JOIN events e ON ppc.event_id = e.id WHERE e.venue_id = ? AND ppc.approved_at IS NULL ORDER BY ppc.created_at DESC`, [venueId]);
            reply.send({ success: true, data: result.rows });
        }
        catch (error) {
            logger_1.logger.error('Error getting pending price changes:', error);
            reply.status(500).send({ error: 'Failed to get pending price changes' });
        }
    }
    async approvePriceChange(request, reply) {
        try {
            const { changeId } = request.params;
            const userId = request.user?.id;
            const body = request.body;
            if (!userId) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }
            const db = (0, database_1.getDb)();
            const result = await db.raw('SELECT * FROM pending_price_changes WHERE id = ?', [changeId]);
            if (result.rows.length === 0) {
                return reply.status(404).send({ error: 'Price change not found' });
            }
            const change = result.rows[0];
            if (body.approved) {
                await dynamic_pricing_service_1.dynamicPricingService.applyPriceChange(change.event_id, change.recommended_price, body.reason || 'Manually approved');
                await db.raw(`UPDATE pending_price_changes SET approved_at = NOW(), approved_by = ?, approval_reason = ? WHERE id = ?`, [userId, body.reason, changeId]);
                reply.send({ success: true, message: 'Price change approved and applied' });
            }
            else {
                await db.raw(`UPDATE pending_price_changes SET rejected_at = NOW(), rejected_by = ?, rejection_reason = ? WHERE id = ?`, [userId, body.reason, changeId]);
                reply.send({ success: true, message: 'Price change rejected' });
            }
        }
        catch (error) {
            logger_1.logger.error('Error approving price change:', error);
            reply.status(500).send({ error: 'Failed to approve price change' });
        }
    }
    async getDemandMetrics(request, reply) {
        try {
            const { eventId } = request.params;
            const userId = request.user?.id;
            if (!userId) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }
            const demand = await demand_tracker_service_1.demandTrackerService.calculateDemand(eventId);
            reply.send({ success: true, data: demand });
        }
        catch (error) {
            logger_1.logger.error('Error getting demand metrics:', error);
            reply.status(500).send({ error: 'Failed to get demand metrics' });
        }
    }
}
exports.PricingController = PricingController;
exports.pricingController = new PricingController();
//# sourceMappingURL=pricing.controller.js.map