"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalAuthMiddleware = internalAuthMiddleware;
exports.generateInternalAuthHeaders = generateInternalAuthHeaders;
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../utils/logger");
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-key-minimum-32-chars';
const MAX_TIMESTAMP_DIFF = 300000;
async function internalAuthMiddleware(request, reply) {
    try {
        const serviceName = request.headers['x-internal-service'];
        const timestamp = request.headers['x-timestamp'];
        const signature = request.headers['x-internal-signature'];
        if (!serviceName || !timestamp || !signature) {
            logger_1.logger.warn('Missing internal auth headers', {
                path: request.url,
                method: request.method,
                ip: request.ip
            });
            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Missing authentication headers'
            });
        }
        const requestTime = parseInt(timestamp, 10);
        const currentTime = Date.now();
        const timeDiff = Math.abs(currentTime - requestTime);
        if (timeDiff > MAX_TIMESTAMP_DIFF) {
            logger_1.logger.warn('Request timestamp too old', {
                serviceName,
                timeDiff,
                maxAllowed: MAX_TIMESTAMP_DIFF
            });
            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Request timestamp is too old'
            });
        }
        const body = request.body ? JSON.stringify(request.body) : '';
        const payload = `${serviceName}:${timestamp}:${body}`;
        const expectedSignature = crypto_1.default
            .createHmac('sha256', INTERNAL_SERVICE_SECRET)
            .update(payload)
            .digest('hex');
        if (!crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            logger_1.logger.warn('Invalid signature', {
                serviceName,
                path: request.url,
                method: request.method
            });
            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Invalid signature'
            });
        }
        logger_1.logger.debug('Internal service authenticated', {
            serviceName,
            path: request.url,
            method: request.method
        });
        request.internalService = serviceName;
    }
    catch (error) {
        logger_1.logger.error('Internal auth error', {
            error: error.message,
            stack: error.stack
        });
        return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Authentication error'
        });
    }
}
function generateInternalAuthHeaders(serviceName, body) {
    const timestamp = Date.now().toString();
    const bodyString = body ? JSON.stringify(body) : '';
    const payload = `${serviceName}:${timestamp}:${bodyString}`;
    const signature = crypto_1.default
        .createHmac('sha256', INTERNAL_SERVICE_SECRET)
        .update(payload)
        .digest('hex');
    return {
        'x-internal-service': serviceName,
        'x-timestamp': timestamp,
        'x-internal-signature': signature
    };
}
exports.default = internalAuthMiddleware;
//# sourceMappingURL=internal-auth.js.map