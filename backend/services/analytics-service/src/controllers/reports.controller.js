"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportsController = void 0;
const base_controller_1 = require("./base.controller");
class ReportsController extends base_controller_1.BaseController {
    getReportTemplates = async (request, reply) => {
        try {
            return this.success(reply, { templates: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getReports = async (request, reply) => {
        try {
            return this.success(reply, { reports: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getReport = async (request, reply) => {
        try {
            return this.success(reply, { report: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    generateReport = async (request, reply) => {
        try {
            return this.success(reply, { reportId: 'report-123' }, 202);
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    scheduleReport = async (request, reply) => {
        try {
            return this.success(reply, { schedule: {} }, 201);
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    updateReportSchedule = async (request, reply) => {
        try {
            return this.success(reply, { schedule: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    deleteReport = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Report deleted' });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getScheduledReports = async (request, reply) => {
        try {
            return this.success(reply, { reports: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    toggleScheduledReport = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Schedule updated' });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
}
exports.reportsController = new ReportsController();
//# sourceMappingURL=reports.controller.js.map