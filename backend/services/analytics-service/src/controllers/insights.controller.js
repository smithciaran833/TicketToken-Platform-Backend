"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insightsController = void 0;
const base_controller_1 = require("./base.controller");
class InsightsController extends base_controller_1.BaseController {
    getInsights = async (request, reply) => {
        try {
            return this.success(reply, { insights: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getCustomerInsights = async (request, reply) => {
        try {
            return this.success(reply, { insights: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getInsight = async (request, reply) => {
        try {
            return this.success(reply, { insight: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    dismissInsight = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Insight dismissed' });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    takeAction = async (request, reply) => {
        try {
            return this.success(reply, { result: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getInsightStats = async (request, reply) => {
        try {
            return this.success(reply, { stats: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    refreshInsights = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Insights refreshed' }, 202);
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
}
exports.insightsController = new InsightsController();
//# sourceMappingURL=insights.controller.js.map