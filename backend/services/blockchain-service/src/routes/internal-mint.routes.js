"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../utils/logger");
const internal_auth_1 = require("../middleware/internal-auth");
const validation_1 = require("../middleware/validation");
async function internalMintRoutes(fastify, options) {
    fastify.post('/internal/mint-tickets', {
        preHandler: [internal_auth_1.internalAuthMiddleware, validation_1.validateMintRequest]
    }, async (request, reply) => {
        const mintingUrl = process.env.MINTING_SERVICE_URL || 'http://tickettoken-minting:3018';
        try {
            const body = request.body;
            const requestBody = {
                ticketIds: body.ticketIds,
                eventId: body.eventId,
                userId: body.userId,
                queue: body.queue || 'ticket.mint'
            };
            const timestamp = Date.now().toString();
            const secret = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-key-minimum-32-chars';
            const payload = `blockchain-service:${timestamp}:${JSON.stringify(requestBody)}`;
            const signature = crypto_1.default
                .createHmac('sha256', secret)
                .update(payload)
                .digest('hex');
            const response = await axios_1.default.post(`${mintingUrl}/internal/mint`, requestBody, {
                headers: {
                    'x-internal-service': 'blockchain-service',
                    'x-timestamp': timestamp,
                    'x-internal-signature': signature,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        }
        catch (error) {
            logger_1.logger.error('Minting proxy error', {
                error: error.message,
                responseData: error.response?.data,
                status: error.response?.status,
                url: mintingUrl
            });
            return reply.status(error.response?.status || 500).send({
                error: error.response?.data?.error || 'Minting request failed',
                message: error.response?.data?.message || error.message
            });
        }
    });
}
exports.default = internalMintRoutes;
//# sourceMappingURL=internal-mint.routes.js.map