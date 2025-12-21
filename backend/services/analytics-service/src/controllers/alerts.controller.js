"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertsController = void 0;
const base_controller_1 = require("./base.controller");
class AlertsController extends base_controller_1.BaseController {
    getAlerts = async (request, reply) => {
        try {
            return this.success(reply, { alerts: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getAlert = async (request, reply) => {
        try {
            return this.success(reply, { alert: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    createAlert = async (request, reply) => {
        try {
            return this.success(reply, { alert: {} }, 201);
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    updateAlert = async (request, reply) => {
        try {
            return this.success(reply, { alert: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    deleteAlert = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Alert deleted' });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    toggleAlert = async (request, reply) => {
        try {
            return this.success(reply, { alert: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getAlertInstances = async (request, reply) => {
        try {
            return this.success(reply, { instances: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    acknowledgeAlert = async (request, reply) => {
        try {
            return this.success(reply, { instance: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    testAlert = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Test alert sent' });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
}
exports.alertsController = new AlertsController();
//# sourceMappingURL=alerts.controller.js.map