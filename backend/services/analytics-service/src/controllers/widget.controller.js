"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.widgetController = void 0;
const base_controller_1 = require("./base.controller");
class WidgetController extends base_controller_1.BaseController {
    getWidgets = async (request, reply) => {
        try {
            return this.success(reply, { widgets: [] });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getWidget = async (request, reply) => {
        try {
            return this.success(reply, { widget: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    getWidgetData = async (request, reply) => {
        try {
            return this.success(reply, { data: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    createWidget = async (request, reply) => {
        try {
            return this.success(reply, { widget: {} }, 201);
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    updateWidget = async (request, reply) => {
        try {
            return this.success(reply, { widget: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    deleteWidget = async (request, reply) => {
        try {
            return this.success(reply, { message: 'Widget deleted' });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    moveWidget = async (request, reply) => {
        try {
            return this.success(reply, { widget: {} });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    duplicateWidget = async (request, reply) => {
        try {
            return this.success(reply, { widget: {} }, 201);
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    exportWidgetData = async (request, reply) => {
        try {
            return this.success(reply, { exportId: 'export-123' });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
}
exports.widgetController = new WidgetController();
//# sourceMappingURL=widget.controller.js.map