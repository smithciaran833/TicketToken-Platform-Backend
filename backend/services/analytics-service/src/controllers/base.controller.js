"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseController = void 0;
const logger_1 = require("../utils/logger");
class BaseController {
    log = logger_1.logger;
    handleError(error, reply) {
        this.log.error('Controller error', { error });
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Internal Server Error';
        return reply.code(statusCode).send({
            success: false,
            error: {
                message,
                statusCode,
            }
        });
    }
    success(reply, data, status = 200) {
        return reply.code(status).send({
            success: true,
            data
        });
    }
}
exports.BaseController = BaseController;
//# sourceMappingURL=base.controller.js.map