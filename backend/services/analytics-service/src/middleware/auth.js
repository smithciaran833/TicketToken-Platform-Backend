"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.authenticate = void 0;
const errors_1 = require("../utils/errors");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new errors_1.UnauthorizedError('Missing or invalid authorization header');
        }
        req.user = {
            id: 'user-123',
            venueId: req.params.venueId || req.body?.venueId,
            permissions: ['analytics.read', 'analytics.write', 'analytics.export']
        };
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.authenticate = authenticate;
const authorize = (requiredPermissions) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new errors_1.UnauthorizedError('Not authenticated'));
        }
        const hasPermission = requiredPermissions.some(permission => req.user.permissions.includes(permission));
        if (!hasPermission) {
            return next(new errors_1.ForbiddenError('Insufficient permissions'));
        }
        next();
    };
};
exports.authorize = authorize;
//# sourceMappingURL=auth.js.map