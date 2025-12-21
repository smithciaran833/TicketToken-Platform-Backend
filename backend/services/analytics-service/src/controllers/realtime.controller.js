"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtimeController = void 0;
const base_controller_1 = require("./base.controller");
class RealtimeController extends base_controller_1.BaseController {
    getRealTimeMetrics = async (request, reply) => {
        try {
            return this.success(reply, { metrics: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    subscribeToMetrics = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Subscription created' });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getActiveSessions = async (request, reply) => {
        try {
            return this.success(reply, { sessions: 0 });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getLiveDashboardStats = async (request, reply) => {
        try {
            return this.success(reply, { stats: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    updateCounter = async (request, reply) => {
        try {
            return this.success(reply, { value: 0 });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getCounter = async (request, reply) => {
        try {
            return this.success(reply, { value: 0 });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
}
exports.realtimeController = new RealtimeController();
//# sourceMappingURL=realtime.controller.js.map