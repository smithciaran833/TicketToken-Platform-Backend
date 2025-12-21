"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BadGatewayError = exports.ServiceUnavailableError = exports.TooManyRequestsError = exports.ForbiddenError = exports.UnauthorizedError = exports.ConflictError = exports.NotFoundError = exports.ValidationError = exports.AppError = void 0;
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
class ConflictError extends AppError {
    constructor(message) {
        super(message, 409, 'CONFLICT');
    }
}
exports.ConflictError = ConflictError;
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
class TooManyRequestsError extends AppError {
    constructor(message = 'Too many requests') {
        super(message, 429, 'TOO_MANY_REQUESTS');
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
class ServiceUnavailableError extends AppError {
    constructor(message = 'Service temporarily unavailable') {
        super(message, 503, 'SERVICE_UNAVAILABLE');
    }
}
exports.ServiceUnavailableError = ServiceUnavailableError;
class BadGatewayError extends AppError {
    constructor(message = 'Bad gateway') {
        super(message, 502, 'BAD_GATEWAY');
    }
}
exports.BadGatewayError = BadGatewayError;
//# sourceMappingURL=errors.js.map