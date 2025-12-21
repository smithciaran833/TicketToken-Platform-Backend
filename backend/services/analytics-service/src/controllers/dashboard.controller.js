"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardController = void 0;
const base_controller_1 = require("./base.controller");
class DashboardController extends base_controller_1.BaseController {
    getDashboards = async (request, reply) => {
        try {
            return this.success(reply, { dashboards: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getDashboard = async (request, reply) => {
        try {
            return this.success(reply, { dashboard: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    createDashboard = async (request, reply) => {
        try {
            return this.success(reply, { dashboard: {} }, 201);
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    updateDashboard = async (request, reply) => {
        try {
            return this.success(reply, { dashboard: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    deleteDashboard = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Dashboard deleted' });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    cloneDashboard = async (request, reply) => {
        try {
            return this.success(reply, { dashboard: {} }, 201);
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    shareDashboard = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Dashboard shared' });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getDashboardPermissions = async (request, reply) => {
        try {
            return this.success(reply, { permissions: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
}
exports.dashboardController = new DashboardController();
//# sourceMappingURL=dashboard.controller.js.map