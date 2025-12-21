"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateVenue = void 0;
exports.authenticate = authenticate;
exports.authorize = authorize;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
async function authenticate(request, reply) {
    try {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return reply.code(401).send({
                success: false,
                error: {
                    message: 'Authentication required',
                    statusCode: 401,
                }
            });
        }
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
        request.user = {
            id: decoded.userId || decoded.id,
            venueId: decoded.venueId,
            role: decoded.role || 'user',
            permissions: decoded.permissions || []
        };
        if (decoded.venueId) {
            request.venue = {
                id: decoded.venueId,
                name: decoded.venueName || 'Venue'
            };
        }
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            return reply.code(401).send({
                success: false,
                error: {
                    message: 'Token expired',
                    statusCode: 401,
                }
            });
        }
        else if (error.name === 'JsonWebTokenError') {
            return reply.code(401).send({
                success: false,
                error: {
                    message: 'Invalid token',
                    statusCode: 401,
                }
            });
        }
        else {
            return reply.code(500).send({
                success: false,
                error: {
                    message: 'Authentication error',
                    statusCode: 500,
                }
            });
        }
    }
}
function authorize(permissions) {
    return async (request, reply) => {
        if (!request.user) {
            return reply.code(401).send({
                success: false,
                error: {
                    message: 'Authentication required',
                    statusCode: 401,
                }
            });
        }
        const requiredPerms = Array.isArray(permissions) ? permissions : [permissions];
        const userPerms = request.user.permissions || [];
        if (request.user.role === 'admin') {
            return;
        }
        const hasPermission = requiredPerms.some(perm => userPerms.includes(perm) || userPerms.includes('*'));
        if (!hasPermission) {
            return reply.code(403).send({
                success: false,
                error: {
                    message: 'Insufficient permissions',
                    statusCode: 403,
                }
            });
        }
    };
}
exports.authenticateVenue = authenticate;
//# sourceMappingURL=auth.middleware.js.map