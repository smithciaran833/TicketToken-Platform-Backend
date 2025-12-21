"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForbiddenError = exports.UnauthorizedError = exports.NotFoundError = exports.ValidationError = exports.AppError = void 0;
exports.errorHandler = errorHandler;
const logger_1 = require("../utils/logger");
class AppError extends Error {
    message;
    statusCode;
    code;
    constructor(message, statusCode = 500, code) {
        super(message);
        this.message = message;
        this.statusCode = statusCode;
        this.code = code;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message) {
        super(message, 400, 'VALIDATION_ERROR');
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends AppError {
    constructor(resource) {
        super(`${resource} not found`, 404, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED');
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403, 'FORBIDDEN');
    }
}
exports.ForbiddenError = ForbiddenError;
function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }
    if (err instanceof AppError) {
        logger_1.logger.error({
            error: err.message,
            code: err.code,
            statusCode: err.statusCode,
            path: req.path,
            method: req.method,
        });
        return res.status(err.statusCode).json({
            success: false,
            error: err.message,
            code: err.code,
        });
    }
    logger_1.logger.error({
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });
    res.status(500).json({
        success: false,
        error: 'Internal server error',
    });
}
//# sourceMappingURL=error-handler.js.map