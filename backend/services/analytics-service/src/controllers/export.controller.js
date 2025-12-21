"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportController = void 0;
const base_controller_1 = require("./base.controller");
class ExportController extends base_controller_1.BaseController {
    getExports = async (request, reply) => {
        try {
            return this.success(reply, { exports: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getExportStatus = async (request, reply) => {
        try {
            return this.success(reply, { export: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    createExport = async (request, reply) => {
        try {
            return this.success(reply, { exportId: 'export-123' }, 202);
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    downloadExport = async (request, reply) => {
        try {
            reply.code(200).send('File content');
        }
        catch (error) {
            this.handleError(error, reply);
        }
    };
    cancelExport = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Export cancelled' });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    retryExport = async (request, reply) => {
        try {
            return this.success(reply, { exportId: 'export-123' }, 202);
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
}
exports.exportController = new ExportController();
//# sourceMappingURL=export.controller.js.map